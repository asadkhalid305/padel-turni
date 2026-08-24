-- ASA-131: corrections and eligibility changes enqueue one audited,
-- deterministic replay. Public profiles change only when the complete replay
-- suffix and its immutable ledger entries commit in one transaction.

alter table public.rating_recalculation_runs
add column affected_event_id uuid references public.events(id) on delete restrict,
add column trigger_kind text,
add column lock_token uuid,
add column final_hash text,
add constraint rating_recalculation_runs_trigger_kind_check
  check (trigger_kind in ('correction', 'exclusion', 'reinstatement')),
add constraint rating_recalculation_runs_final_hash_check
  check (final_hash is null or final_hash ~ '^[0-9a-f]{64}$');

update public.rating_recalculation_runs run
set
  affected_event_id = ledger.event_id,
  trigger_kind = 'correction'
from public.event_rating_ledger ledger
where ledger.sequence = run.earliest_ledger_sequence;

alter table public.rating_recalculation_runs
alter column affected_event_id set not null,
alter column trigger_kind set not null;

alter table public.rating_recalculation_runs
drop constraint rating_recalculation_runs_lock_consistent,
drop constraint rating_recalculation_runs_completion_consistent,
drop constraint rating_recalculation_runs_error_consistent;

alter table public.rating_recalculation_runs
add constraint rating_recalculation_runs_lock_consistent check (
  (lock_token is null and worker_id is null and locked_at is null)
  or
  (lock_token is not null
    and worker_id is not null
    and btrim(worker_id) <> ''
    and locked_at is not null)
),
add constraint rating_recalculation_runs_processing_lock check (
  status <> 'processing'
  or (lock_token is not null and worker_id is not null and locked_at is not null)
),
add constraint rating_recalculation_runs_completion_consistent check (
  (status = 'completed'
    and completed_at is not null
    and final_hash is not null
    and last_error_code is null
    and last_error_message is null)
  or
  (status <> 'completed' and completed_at is null and final_hash is null)
),
add constraint rating_recalculation_runs_error_consistent check (
  (status = 'failed'
    and last_error_code is not null
    and last_error_message is not null)
  or
  (status <> 'failed' and last_error_code is null and last_error_message is null)
);

create unique index rating_recalculation_runs_one_unfinished
on public.rating_recalculation_runs((true))
where status in ('pending', 'processing', 'failed');

create function app_private.enqueue_rating_recalculation(
  p_event_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_trigger_kind text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence bigint;
  v_run_id uuid;
begin
  if p_trigger_kind not in ('correction', 'exclusion', 'reinstatement') then
    raise exception 'Choose a valid rating replay trigger.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'An audit reason between 3 and 500 characters is required.';
  end if;

  -- The same transaction-level lock protects audited fact mutation and run
  -- creation. A second admin request waits, then sees the unfinished run.
  perform pg_advisory_xact_lock(131, 122);
  if exists (
    select 1 from public.rating_recalculation_runs
    where status in ('pending', 'processing', 'failed')
  ) then
    raise exception 'Finish or recover the existing rating recalculation before changing another rated result.';
  end if;

  select ledger.sequence
  into v_sequence
  from public.event_rating_ledger ledger
  where ledger.event_id = p_event_id
    and ledger.entry_kind = 'initial'
    and ledger.processing_status in ('applied', 'skipped')
  order by ledger.sequence
  limit 1;

  -- If initial rating work has not reached a terminal result, invalidate a
  -- possible in-flight read and make the same job due again. Its next attempt
  -- will consume the already-corrected canonical event facts.
  if v_sequence is null then
    update public.event_rating_jobs job
    set
      status = 'retryable',
      next_attempt_at = clock_timestamp(),
      lock_token = null,
      worker_id = null,
      locked_at = null,
      completed_at = null,
      last_attempt_finished_at = clock_timestamp(),
      last_error_code = 'rating_facts_changed',
      last_error_message = 'Rating facts changed before the initial job reached a terminal result.'
    where job.event_id = p_event_id
      and job.recalculation_run_id is null
      and job.status in ('pending', 'processing', 'retryable', 'failed');
    return null;
  end if;

  insert into public.rating_recalculation_runs (
    earliest_ledger_sequence,
    affected_event_id,
    trigger_kind,
    requested_by_app_user_id,
    reason
  ) values (
    v_sequence,
    p_event_id,
    p_trigger_kind,
    p_actor_id,
    btrim(p_reason)
  ) returning id into v_run_id;

  insert into public.event_rating_jobs (
    event_id,
    recalculation_run_id,
    job_kind
  ) values (
    p_event_id,
    v_run_id,
    'recalculation'
  );

  return v_run_id;
end;
$$;

create unique index event_rating_jobs_recalculation_run_unique
on public.event_rating_jobs(recalculation_run_id)
where recalculation_run_id is not null;

drop function public.correct_completed_match_score(uuid, uuid, uuid, uuid, integer, integer);

create function public.correct_completed_match_score(
  p_workspace_id uuid,
  p_event_id uuid,
  p_match_id uuid,
  p_actor_id uuid,
  p_team_one_score integer,
  p_team_two_score integer,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_match public.matches%rowtype;
  v_rating_era text;
  v_competition_mode text;
  v_run_id uuid;
begin
  if p_team_one_score not between 0 and 99
    or p_team_two_score not between 0 and 99 then
    raise exception 'Scores must be between 0 and 99.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'An audit reason between 3 and 500 characters is required.';
  end if;

  select match.*
  into v_match
  from public.matches match
  join public.events event on event.id = match.event_id
  where match.id = p_match_id
    and match.event_id = p_event_id
    and event.workspace_id = p_workspace_id
    and event.status not in ('cancelled', 'archived')
    and event.archived_at is null
  for update of match;

  if not found then
    raise exception 'Match not found in this active club event.';
  end if;
  select rating_era, competition_mode
  into v_rating_era, v_competition_mode
  from public.events
  where id = p_event_id;
  if v_match.status <> 'completed' then
    raise exception 'Only completed match scores can be corrected.';
  end if;
  if v_match.team_one_score = p_team_one_score
    and v_match.team_two_score = p_team_two_score then
    raise exception 'The corrected score must change the completed result.';
  end if;

  if v_rating_era = 'automated' and v_competition_mode = 'official' then
    v_run_id := app_private.enqueue_rating_recalculation(
      p_event_id, p_actor_id, p_reason, 'correction'
    );
  end if;

  insert into public.match_corrections (
    workspace_id, event_id, match_id, corrected_by_app_user_id,
    correction_type, previous_status, previous_team_one_score,
    previous_team_two_score, new_status, new_team_one_score,
    new_team_two_score
  ) values (
    p_workspace_id, p_event_id, p_match_id, p_actor_id,
    'score', v_match.status, v_match.team_one_score,
    v_match.team_two_score, 'completed', p_team_one_score,
    p_team_two_score
  );

  perform set_config('app.completed_match_mutation', 'allowed', true);
  update public.matches
  set team_one_score = p_team_one_score, team_two_score = p_team_two_score
  where id = p_match_id;
  perform set_config('app.completed_match_mutation', '', true);

  return v_run_id;
end;
$$;

drop function public.set_completed_event_standings_eligibility(uuid, uuid, boolean);

create function public.set_completed_event_standings_eligibility(
  p_workspace_id uuid,
  p_event_id uuid,
  p_standings_eligible boolean,
  p_actor_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_run_id uuid;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'An audit reason between 3 and 500 characters is required.';
  end if;

  select * into v_event
  from public.events
  where id = p_event_id
    and workspace_id = p_workspace_id
    and status = 'completed'
  for update;

  if not found then
    raise exception 'Only completed events can change standings eligibility.';
  end if;
  if v_event.standings_eligible = p_standings_eligible then
    raise exception 'The event already has the requested eligibility.';
  end if;

  if v_event.rating_era = 'automated'
    and v_event.competition_mode = 'official' then
    v_run_id := app_private.enqueue_rating_recalculation(
      p_event_id,
      p_actor_id,
      p_reason,
      case when p_standings_eligible then 'reinstatement' else 'exclusion' end
    );
  end if;

  update public.events
  set standings_eligible = p_standings_eligible
  where id = p_event_id;

  return v_run_id;
end;
$$;

create function public.claim_rating_recalculation_run(
  p_job_id uuid,
  p_run_id uuid,
  p_worker_id text,
  p_lock_token uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.event_rating_jobs%rowtype;
  v_run public.rating_recalculation_runs%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception 'A worker identifier is required.';
  end if;

  perform pg_advisory_xact_lock(131, 122);

  select job.*
  into v_job
  from public.event_rating_jobs job
  join public.rating_recalculation_runs run
    on run.id = job.recalculation_run_id
  where job.id = p_job_id
    and job.recalculation_run_id = p_run_id
    and job.job_kind = 'recalculation'
    and job.status in ('pending', 'retryable')
    and job.next_attempt_at <= now()
    and run.status in ('pending', 'failed')
    and not exists (
      select 1
      from public.event_rating_jobs earlier
      where earlier.queue_sequence < job.queue_sequence
        and earlier.status in ('pending', 'processing', 'retryable', 'failed')
    )
  for update of job;

  if v_job.id is null then return null; end if;

  select * into v_run
  from public.rating_recalculation_runs
  where id = p_run_id
    and status in ('pending', 'failed')
  for update;

  if v_run.id is null then return null; end if;

  update public.rating_recalculation_runs
  set
    status = 'processing',
    attempt_count = v_job.attempt_count + 1,
    lock_token = p_lock_token,
    worker_id = btrim(p_worker_id),
    locked_at = v_now,
    started_at = coalesce(started_at, v_now),
    completed_at = null,
    final_hash = null,
    last_error_code = null,
    last_error_message = null
  where id = v_run.id;

  update public.event_rating_jobs
  set
    status = 'processing',
    attempt_count = v_job.attempt_count + 1,
    lock_token = p_lock_token,
    worker_id = btrim(p_worker_id),
    locked_at = v_now,
    last_attempt_started_at = v_now,
    last_attempt_finished_at = null,
    completed_at = null,
    last_error_code = null,
    last_error_message = null
  where id = v_job.id;

  return v_run.id;
end;
$$;

create function public.finish_rating_recalculation_run(
  p_job_id uuid,
  p_run_id uuid,
  p_lock_token uuid,
  p_entries jsonb,
  p_profile_updates jsonb,
  p_final_hash text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.event_rating_jobs%rowtype;
  v_run public.rating_recalculation_runs%rowtype;
  v_entry jsonb;
  v_profile jsonb;
  v_expected_entry_count integer;
  v_updated_profile_count integer := 0;
  v_latest_ledger_sequence bigint;
  v_job_status text;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_job
  from public.event_rating_jobs
  where id = p_job_id
    and recalculation_run_id = p_run_id
    and job_kind = 'recalculation'
  for update;

  select * into v_run
  from public.rating_recalculation_runs
  where id = p_run_id
  for update;

  if v_job.id is null or v_run.id is null then
    raise exception 'Rating recalculation job or run not found.';
  end if;
  if v_run.status = 'completed' and v_run.final_hash = p_final_hash
    and v_job.status in ('applied', 'skipped')
    and v_job.latest_ledger_sequence is not null then
    return v_job.latest_ledger_sequence;
  end if;
  if v_run.status <> 'processing' or v_run.lock_token is distinct from p_lock_token then
    raise exception 'The rating recalculation lock is no longer owned by this worker.';
  end if;
  if v_job.status <> 'processing' or v_job.lock_token is distinct from p_lock_token then
    raise exception 'The replay queue lock is no longer owned by this worker.';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_typeof(p_profile_updates) <> 'array' then
    raise exception 'Replay entries and profile updates must be complete arrays.';
  end if;
  if p_final_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid replay result hash.'; end if;

  select count(*) into v_expected_entry_count
  from public.event_rating_ledger ledger
  where ledger.entry_kind = 'initial'
    and ledger.processing_status in ('applied', 'skipped')
    and ledger.sequence >= v_run.earliest_ledger_sequence;
  if jsonb_array_length(p_entries) <> v_expected_entry_count then
    raise exception 'Canonical rating history changed while replay was processing.';
  end if;

  if jsonb_array_length(p_profile_updates) <> (
    select count(*) from public.rating_profiles where onboarding_status = 'completed'
  ) then
    raise exception 'A complete final profile set is required.';
  end if;
  if (
    select count(distinct value->>'appUserId')
    from jsonb_array_elements(p_profile_updates)
  ) <> jsonb_array_length(p_profile_updates) then
    raise exception 'The replay profile set contains duplicates.';
  end if;

  for v_profile in select value from jsonb_array_elements(p_profile_updates)
  loop
    update public.rating_profiles
    set
      mu = (v_profile->>'mu')::double precision,
      sigma = (v_profile->>'sigma')::double precision,
      rated_match_count = (v_profile->>'ratedMatchCount')::integer,
      is_provisional = (v_profile->>'ratedMatchCount')::integer < 6,
      engine_version = v_profile->>'engineVersion',
      first_official_rated_at = case
        when (v_profile->>'ratedMatchCount')::integer = 0 then first_official_rated_at
        else coalesce(first_official_rated_at, v_now)
      end
    where app_user_id = (v_profile->>'appUserId')::uuid
      and onboarding_status = 'completed'
      and abs(initial_mu - (v_profile->>'expectedInitialMu')::double precision)
        <= 0.000000001
      and abs(initial_sigma - (v_profile->>'expectedInitialSigma')::double precision)
        <= 0.000000001
      and initial_engine_version = v_profile->>'engineVersion';
    if not found then raise exception 'A rating baseline changed while replay was processing.'; end if;
    v_updated_profile_count := v_updated_profile_count + 1;
  end loop;

  if v_updated_profile_count <> jsonb_array_length(p_profile_updates) then
    raise exception 'The complete replay profile set was not published.';
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries)
  loop
    if (v_entry->>'originalLedgerSequence')::bigint < v_run.earliest_ledger_sequence then
      raise exception 'A replay entry precedes the requested suffix.';
    end if;
    if not exists (
      select 1 from public.event_rating_ledger source
      where source.sequence = (v_entry->>'originalLedgerSequence')::bigint
        and source.event_id = (v_entry->>'eventId')::uuid
        and source.entry_kind = 'initial'
        and source.processing_status in ('applied', 'skipped')
        and source.engine_manifest = v_entry->'engineManifest'
    ) then
      raise exception 'A replay entry does not match immutable source history.';
    end if;

    insert into public.event_rating_ledger (
      event_id, recalculation_run_id, entry_kind, eligibility_status,
      processing_status, attempt_number, attempt_started_at,
      attempt_finished_at, canonical_input, input_hash, canonical_output,
      output_hash, engine_manifest, audit_actor_app_user_id, audit_reason
    ) values (
      (v_entry->>'eventId')::uuid,
      v_run.id,
      v_entry->>'entryKind',
      v_entry->>'eligibilityStatus',
      v_entry->>'processingStatus',
      v_run.attempt_count,
      v_run.locked_at,
      v_now,
      v_entry->'canonicalInput',
      v_entry->>'inputHash',
      v_entry->'canonicalOutput',
      v_entry->>'outputHash',
      v_entry->'engineManifest',
      v_run.requested_by_app_user_id,
      v_run.reason
    ) returning sequence into v_latest_ledger_sequence;
  end loop;

  if v_latest_ledger_sequence is null then
    raise exception 'A completed replay must append at least one ledger entry.';
  end if;

  select case
    when exists (
      select 1 from jsonb_array_elements(p_entries) entry
      where entry->>'processingStatus' = 'applied'
    ) then 'applied'
    else 'skipped'
  end into v_job_status;

  update public.rating_recalculation_runs
  set
    status = 'completed',
    lock_token = null,
    worker_id = null,
    locked_at = null,
    completed_at = v_now,
    final_hash = p_final_hash,
    last_error_code = null,
    last_error_message = null
  where id = v_run.id;

  update public.event_rating_jobs
  set
    status = v_job_status,
    lock_token = null,
    worker_id = null,
    locked_at = null,
    last_attempt_finished_at = v_now,
    completed_at = v_now,
    latest_ledger_sequence = v_latest_ledger_sequence,
    last_error_code = null,
    last_error_message = null
  where id = v_job.id;

  return v_latest_ledger_sequence;
end;
$$;

create function public.fail_rating_recalculation_run(
  p_job_id uuid,
  p_run_id uuid,
  p_lock_token uuid,
  p_canonical_input jsonb,
  p_input_hash text,
  p_engine_manifest jsonb,
  p_error_code text,
  p_error_message text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.event_rating_jobs%rowtype;
  v_run public.rating_recalculation_runs%rowtype;
  v_ledger_sequence bigint;
  v_now timestamptz := clock_timestamp();
  v_next_status text;
  v_error_code text := left(
    coalesce(nullif(btrim(p_error_code), ''), 'rating_replay_failed'), 120
  );
  v_error_message text := left(
    coalesce(nullif(btrim(p_error_message), ''), 'Rating replay failed.'), 240
  );
begin
  select * into v_job
  from public.event_rating_jobs
  where id = p_job_id
    and recalculation_run_id = p_run_id
    and job_kind = 'recalculation'
  for update;

  select * into v_run
  from public.rating_recalculation_runs
  where id = p_run_id
  for update;

  if v_job.id is null or v_run.id is null
    or v_job.status <> 'processing'
    or v_run.status <> 'processing'
    or v_job.lock_token is distinct from p_lock_token
    or v_run.lock_token is distinct from p_lock_token then
    return;
  end if;

  v_next_status := case
    when v_job.attempt_count >= v_job.max_attempts then 'failed'
    else 'retryable'
  end;

  insert into public.event_rating_ledger (
    event_id,
    recalculation_run_id,
    entry_kind,
    eligibility_status,
    processing_status,
    attempt_number,
    attempt_started_at,
    attempt_finished_at,
    canonical_input,
    input_hash,
    engine_manifest,
    audit_actor_app_user_id,
    audit_reason,
    error_code,
    error_message
  ) values (
    v_run.affected_event_id,
    v_run.id,
    'replay',
    'eligible',
    'failed',
    v_job.attempt_count,
    v_job.last_attempt_started_at,
    v_now,
    p_canonical_input,
    p_input_hash,
    p_engine_manifest,
    v_run.requested_by_app_user_id,
    v_run.reason,
    v_error_code,
    v_error_message
  ) returning sequence into v_ledger_sequence;

  update public.rating_recalculation_runs
  set
    status = 'failed',
    lock_token = null,
    worker_id = null,
    locked_at = null,
    completed_at = null,
    final_hash = null,
    last_error_code = v_error_code,
    last_error_message = v_error_message
  where id = p_run_id
    and status = 'processing'
    and lock_token = p_lock_token;

  update public.event_rating_jobs
  set
    status = v_next_status,
    next_attempt_at = case
      when v_next_status = 'retryable' then v_now + make_interval(
        secs => least(3600, 60 * power(2, greatest(v_job.attempt_count - 1, 0))::integer)
      )
      else next_attempt_at
    end,
    lock_token = null,
    worker_id = null,
    locked_at = null,
    last_attempt_finished_at = v_now,
    completed_at = null,
    latest_ledger_sequence = v_ledger_sequence,
    last_error_code = v_error_code,
    last_error_message = v_error_message
  where id = v_job.id;
end;
$$;

revoke execute on function app_private.enqueue_rating_recalculation(uuid, uuid, text, text)
from public, anon, authenticated;
revoke execute on function public.correct_completed_match_score(uuid, uuid, uuid, uuid, integer, integer, text)
from public, anon, authenticated;
revoke execute on function public.set_completed_event_standings_eligibility(uuid, uuid, boolean, uuid, text)
from public, anon, authenticated;
revoke execute on function public.claim_rating_recalculation_run(uuid, uuid, text, uuid)
from public, anon, authenticated;
revoke execute on function public.finish_rating_recalculation_run(uuid, uuid, uuid, jsonb, jsonb, text)
from public, anon, authenticated;
revoke execute on function public.fail_rating_recalculation_run(uuid, uuid, uuid, jsonb, text, jsonb, text, text)
from public, anon, authenticated;

grant execute on function public.correct_completed_match_score(uuid, uuid, uuid, uuid, integer, integer, text)
to service_role;
grant execute on function public.set_completed_event_standings_eligibility(uuid, uuid, boolean, uuid, text)
to service_role;
grant execute on function public.claim_rating_recalculation_run(uuid, uuid, text, uuid)
to service_role;
grant execute on function public.finish_rating_recalculation_run(uuid, uuid, uuid, jsonb, jsonb, text)
to service_role;
grant execute on function public.fail_rating_recalculation_run(uuid, uuid, uuid, jsonb, text, jsonb, text, text)
to service_role;

comment on function public.claim_rating_recalculation_run(uuid, uuid, text, uuid) is
  'Claims one exact ordered replay job and its recalculation run under the same lock.';
comment on function public.finish_rating_recalculation_run(uuid, uuid, uuid, jsonb, jsonb, text) is
  'Atomically publishes a complete baseline replay and settles its queue job.';
