-- ASA-130: completion durably queues rating work; a server-side worker then
-- commits the immutable attempt and every profile update atomically.

create or replace function public.complete_live_event(
  p_workspace_id uuid,
  p_event_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_status text;
  v_starts_at timestamptz;
  v_rating_era text;
begin
  select status, starts_at, rating_era
  into v_event_status, v_starts_at, v_rating_era
  from public.events
  where id = p_event_id and workspace_id = p_workspace_id
  for update;

  if v_event_status is null then
    raise exception 'Event not found in this club.';
  end if;
  if v_event_status not in ('scheduled', 'live') or v_starts_at > now() then
    raise exception 'Only live events can be completed.';
  end if;
  if not exists (select 1 from public.matches where event_id = p_event_id) then
    raise exception 'An event needs matches before it can be completed.';
  end if;

  update public.matches
  set
    status = 'cancelled',
    team_one_score = null,
    team_two_score = null,
    timer_started_at = null,
    timer_paused_at = null,
    timer_accumulated_pause_seconds = 0,
    completed_at = null
  where event_id = p_event_id
    and status <> 'completed';

  update public.events
  set status = 'completed'
  where id = p_event_id and workspace_id = p_workspace_id;

  -- The queue is mutable pending state. The ledger remains append-only and is
  -- written only when this attempt has a terminal result.
  if v_rating_era = 'automated' then
    insert into public.event_rating_jobs (event_id, job_kind)
    values (p_event_id, 'initial')
    on conflict (event_id) where recalculation_run_id is null do nothing;
  end if;
end;
$$;

create function public.claim_initial_event_rating_job(
  p_event_id uuid,
  p_worker_id text,
  p_lock_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claimed_id uuid;
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception 'A worker identifier is required.';
  end if;

  update public.event_rating_jobs job
  set
    status = 'processing',
    attempt_count = job.attempt_count + 1,
    lock_token = p_lock_token,
    worker_id = p_worker_id,
    locked_at = clock_timestamp(),
    last_attempt_started_at = clock_timestamp(),
    last_attempt_finished_at = null,
    last_error_code = null,
    last_error_message = null
  where job.event_id = p_event_id
    and job.recalculation_run_id is null
    and job.status in ('pending', 'retryable')
    and job.next_attempt_at <= now()
    and not exists (
      select 1
      from public.event_rating_jobs earlier
      where earlier.recalculation_run_id is null
        and earlier.queue_sequence < job.queue_sequence
        and earlier.status in ('pending', 'processing', 'retryable', 'failed')
    )
  returning job.id into v_claimed_id;

  return v_claimed_id is not null;
end;
$$;

create function public.finish_initial_event_rating_job(
  p_event_id uuid,
  p_lock_token uuid,
  p_eligibility_status text,
  p_processing_status text,
  p_canonical_input jsonb,
  p_input_hash text,
  p_canonical_output jsonb,
  p_output_hash text,
  p_engine_manifest jsonb,
  p_profile_updates jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.event_rating_jobs%rowtype;
  v_profile jsonb;
  v_ledger_sequence bigint;
  v_now timestamptz := clock_timestamp();
begin
  if p_processing_status not in ('applied', 'skipped') then
    raise exception 'Only a successful or skipped attempt can be finished.';
  end if;
  if (p_processing_status = 'applied') is distinct from
     (p_eligibility_status = 'eligible') then
    raise exception 'Eligibility and processing status do not agree.';
  end if;

  select * into v_job
  from public.event_rating_jobs
  where event_id = p_event_id
    and recalculation_run_id is null
  for update;

  if not found or v_job.status <> 'processing'
    or v_job.lock_token is distinct from p_lock_token then
    raise exception 'The rating job lock is no longer owned by this worker.';
  end if;

  if p_processing_status = 'applied' then
    if jsonb_typeof(p_profile_updates) <> 'array'
      or jsonb_array_length(p_profile_updates) < 4 then
      raise exception 'A complete set of profile updates is required.';
    end if;

    for v_profile in select value from jsonb_array_elements(p_profile_updates)
    loop
      update public.rating_profiles
      set
        mu = (v_profile->>'mu')::double precision,
        sigma = (v_profile->>'sigma')::double precision,
        rated_match_count = (v_profile->>'ratedMatchCount')::integer,
        is_provisional = (v_profile->>'isProvisional')::boolean,
        first_official_rated_at = case
          when (v_profile->>'firstOfficialRatedAppearance')::boolean
            then coalesce(first_official_rated_at, v_now)
          else first_official_rated_at
        end,
        engine_version = v_profile->>'engineVersion'
      where app_user_id = (v_profile->>'appUserId')::uuid
        and onboarding_status = 'completed'
        -- Supabase serializes doubles through JSON before the worker returns
        -- its optimistic-lock values. Preserve the stale-write guard while
        -- allowing only representation-level round-trip differences.
        and abs(mu - (v_profile->>'expectedMu')::double precision)
          <= 0.000000001
        and abs(sigma - (v_profile->>'expectedSigma')::double precision)
          <= 0.000000001
        and rated_match_count = (v_profile->>'expectedRatedMatchCount')::integer;

      if not found then
        raise exception 'A current rating profile changed while the event was processing.';
      end if;
    end loop;
  end if;

  insert into public.event_rating_ledger (
    event_id,
    entry_kind,
    eligibility_status,
    processing_status,
    attempt_number,
    attempt_started_at,
    attempt_finished_at,
    canonical_input,
    input_hash,
    canonical_output,
    output_hash,
    engine_manifest
  ) values (
    p_event_id,
    'initial',
    p_eligibility_status,
    p_processing_status,
    v_job.attempt_count,
    v_job.last_attempt_started_at,
    v_now,
    p_canonical_input,
    p_input_hash,
    p_canonical_output,
    p_output_hash,
    p_engine_manifest
  )
  returning sequence into v_ledger_sequence;

  update public.event_rating_jobs
  set
    status = p_processing_status,
    lock_token = null,
    worker_id = null,
    locked_at = null,
    last_attempt_finished_at = v_now,
    completed_at = v_now,
    latest_ledger_sequence = v_ledger_sequence,
    last_error_code = null,
    last_error_message = null
  where id = v_job.id;

  return v_ledger_sequence;
end;
$$;

create function public.fail_initial_event_rating_job(
  p_event_id uuid,
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
  v_ledger_sequence bigint;
  v_now timestamptz := clock_timestamp();
  v_next_status text;
begin
  select * into v_job
  from public.event_rating_jobs
  where event_id = p_event_id
    and recalculation_run_id is null
  for update;

  if not found or v_job.status <> 'processing'
    or v_job.lock_token is distinct from p_lock_token then
    return;
  end if;

  v_next_status := case
    when v_job.attempt_count >= v_job.max_attempts then 'failed'
    else 'retryable'
  end;

  insert into public.event_rating_ledger (
    event_id,
    entry_kind,
    eligibility_status,
    processing_status,
    attempt_number,
    attempt_started_at,
    attempt_finished_at,
    canonical_input,
    input_hash,
    engine_manifest,
    error_code,
    error_message
  ) values (
    p_event_id,
    'initial',
    'eligible',
    'failed',
    v_job.attempt_count,
    v_job.last_attempt_started_at,
    v_now,
    p_canonical_input,
    p_input_hash,
    p_engine_manifest,
    left(coalesce(p_error_code, 'rating_application_failed'), 120),
    left(coalesce(nullif(btrim(p_error_message), ''), 'Rating application failed.'), 2000)
  ) returning sequence into v_ledger_sequence;

  update public.event_rating_jobs
  set
    status = v_next_status,
    next_attempt_at = case
      when v_next_status = 'retryable' then now() + interval '1 minute'
      else next_attempt_at
    end,
    lock_token = null,
    worker_id = null,
    locked_at = null,
    last_attempt_finished_at = v_now,
    latest_ledger_sequence = v_ledger_sequence,
    last_error_code = left(coalesce(p_error_code, 'rating_application_failed'), 120),
    last_error_message = left(coalesce(nullif(btrim(p_error_message), ''), 'Rating application failed.'), 2000)
  where id = v_job.id;
end;
$$;

revoke execute on function public.claim_initial_event_rating_job(uuid, text, uuid)
from public, anon, authenticated;
revoke execute on function public.finish_initial_event_rating_job(
  uuid, uuid, text, text, jsonb, text, jsonb, text, jsonb, jsonb
) from public, anon, authenticated;
revoke execute on function public.fail_initial_event_rating_job(
  uuid, uuid, jsonb, text, jsonb, text, text
) from public, anon, authenticated;

grant execute on function public.claim_initial_event_rating_job(uuid, text, uuid)
to service_role;
grant execute on function public.finish_initial_event_rating_job(
  uuid, uuid, text, text, jsonb, text, jsonb, text, jsonb, jsonb
) to service_role;
grant execute on function public.fail_initial_event_rating_job(
  uuid, uuid, jsonb, text, jsonb, text, text
) to service_role;

comment on function public.claim_initial_event_rating_job(uuid, text, uuid) is
  'Claims one due initial rating job without overtaking earlier initial work.';
comment on function public.finish_initial_event_rating_job(
  uuid, uuid, text, text, jsonb, text, jsonb, text, jsonb, jsonb
) is 'Atomically records an immutable rating result and all latest profile updates.';
