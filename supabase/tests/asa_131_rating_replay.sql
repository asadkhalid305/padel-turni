begin;

insert into auth.users (id, email)
select ('a1310000-0000-4000-8000-00000000000' || value)::uuid,
       'rating-' || value || '@asa131.test'
from generate_series(1, 4) value;

insert into public.app_users (id, email, display_name)
select ('a1310000-0000-4000-8000-00000000000' || value)::uuid,
       'rating-' || value || '@asa131.test', 'Replay Account ' || value
from generate_series(1, 4) value;

insert into public.rating_profiles (
  app_user_id, onboarding_status,
  padel_experience_answer, padel_experience_score,
  racket_sport_answer, racket_sport_score,
  current_ability_answer, current_ability_score,
  initial_mu, initial_sigma, initial_displayed_level,
  initial_engine_version, mu, sigma, engine_version,
  questionnaire_completed_at
)
select ('a1310000-0000-4000-8000-00000000000' || value)::uuid,
       'completed', 'developing', 2, 'recreational', 1, 'beginner', 1,
       20 + value, 12.5, 3.5, 'openskill-bradley-terry-full-v1',
       20 + value, 12.5, 'openskill-bradley-terry-full-v1', now()
from generate_series(1, 4) value;

insert into public.workspaces (id, name)
values ('a1311000-0000-4000-8000-000000000001', 'ASA-131 Club');

insert into public.workspace_memberships (workspace_id, app_user_id, role)
select 'a1311000-0000-4000-8000-000000000001',
       ('a1310000-0000-4000-8000-00000000000' || value)::uuid,
       case when value = 1 then 'owner' else 'member' end
from generate_series(1, 4) value;

insert into public.players (id, workspace_id, name, app_user_id, is_active)
select ('a1314000-0000-4000-8000-00000000000' || value)::uuid,
       'a1311000-0000-4000-8000-000000000001', 'Replay Account ' || value,
       ('a1310000-0000-4000-8000-00000000000' || value)::uuid, true
from generate_series(1, 4) value;

insert into public.events (
  id, workspace_id, name, starts_at, status,
  competition_mode, rating_era, standings_eligible
) values (
  'a1312000-0000-4000-8000-000000000001',
  'a1311000-0000-4000-8000-000000000001',
  'Replay event', now() - interval '1 day', 'completed',
  'official', 'automated', true
);

insert into public.event_players (
  id, event_id, player_id, name_snapshot, rating_snapshot,
  app_user_id_snapshot, rating_mu_snapshot, rating_sigma_snapshot,
  displayed_level_snapshot, rating_engine_version_snapshot, display_order
)
select ('a1315000-0000-4000-8000-00000000000' || value)::uuid,
       'a1312000-0000-4000-8000-000000000001',
       ('a1314000-0000-4000-8000-00000000000' || value)::uuid,
       'Replay Account ' || value,
       greatest(0.5::numeric, least(7.0::numeric,
         round((0.5 + 6.5 * (20 + value) / 50.0)::numeric, 1))),
       ('a1310000-0000-4000-8000-00000000000' || value)::uuid,
       20 + value, 12.5,
       greatest(0.5::numeric, least(7.0::numeric,
         round((0.5 + 6.5 * (20 + value) / 50.0)::numeric, 1))),
       'openskill-bradley-terry-full-v1', value - 1
from generate_series(1, 4) value;

insert into public.event_rounds (id, event_id, round_number, court_count, duration_seconds)
values ('a1316000-0000-4000-8000-000000000001',
        'a1312000-0000-4000-8000-000000000001', 1, 1, 1200);

insert into public.matches (
  id, event_id, round_id, court_number, status,
  team_one_player_one_id, team_one_player_two_id,
  team_two_player_one_id, team_two_player_two_id,
  team_one_score, team_two_score, timer_duration_seconds, completed_at
) values (
  'a1317000-0000-4000-8000-000000000001',
  'a1312000-0000-4000-8000-000000000001',
  'a1316000-0000-4000-8000-000000000001', 1, 'completed',
  'a1315000-0000-4000-8000-000000000001',
  'a1315000-0000-4000-8000-000000000002',
  'a1315000-0000-4000-8000-000000000003',
  'a1315000-0000-4000-8000-000000000004',
  6, 4, 1200, now()
);

insert into public.event_rating_ledger (
  event_id, entry_kind, eligibility_status, processing_status,
  attempt_number, attempt_started_at, attempt_finished_at,
  canonical_input, input_hash, canonical_output, output_hash, engine_manifest
) values (
  'a1312000-0000-4000-8000-000000000001', 'initial', 'eligible', 'applied',
  1, now(), now(), '{}', repeat('a', 64), '{}', repeat('b', 64),
  '{"engineId":"openskill-bradley-terry-full-v1","package":"openskill","packageVersion":"5.0.1","model":"bradleyTerryFull","gamma":"openskill-default","mu":25,"sigma":8.333333333333334,"beta":4.166666666666667,"tau":0.08333333333333333,"epsilon":0.1,"z":3,"alpha":1,"target":0,"limitSigma":false,"balance":false,"kappa":0.0001}'::jsonb
);

-- A correction must invalidate an initial job that has already claimed its
-- work but has not yet reached a terminal ledger entry. Otherwise that worker
-- could publish a stale pre-correction plan.
do $$
declare
  v_run_id uuid;
begin
  insert into public.events (
    id, workspace_id, name, starts_at, status,
    competition_mode, rating_era, standings_eligible
  ) values (
    'a1312000-0000-4000-8000-000000000002',
    'a1311000-0000-4000-8000-000000000001',
    'In-flight initial rating event', now(), 'completed',
    'official', 'automated', true
  );

  insert into public.event_rating_jobs (event_id)
  values ('a1312000-0000-4000-8000-000000000002');

  if not public.claim_initial_event_rating_job(
    'a1312000-0000-4000-8000-000000000002',
    'stale-initial-worker',
    'a1313000-0000-4000-8000-000000000009'
  ) then raise exception 'Expected initial rating job to be claimed.'; end if;

  v_run_id := app_private.enqueue_rating_recalculation(
    'a1312000-0000-4000-8000-000000000002',
    'a1310000-0000-4000-8000-000000000001',
    'Correct a result before initial rating settles.',
    'correction'
  );
  if v_run_id is not null then
    raise exception 'A replay must not start before initial history exists.';
  end if;
  if not exists (
    select 1 from public.event_rating_jobs
    where event_id = 'a1312000-0000-4000-8000-000000000002'
      and status = 'retryable'
      and lock_token is null
      and last_error_code = 'rating_facts_changed'
  ) then
    raise exception 'Correction did not invalidate stale initial rating work.';
  end if;

  -- This isolated regression leaves the worker's retry in the queue only long
  -- enough to prove invalidation. Remove it so the independent replay scenario
  -- below can exercise its own ordered queue.
  delete from public.event_rating_jobs
  where event_id = 'a1312000-0000-4000-8000-000000000002';
end;
$$;

select public.correct_completed_match_score(
  'a1311000-0000-4000-8000-000000000001',
  'a1312000-0000-4000-8000-000000000001',
  'a1317000-0000-4000-8000-000000000001',
  'a1310000-0000-4000-8000-000000000001',
  4, 6, 'Winner was entered on the wrong side.'
);

do $$
declare
  v_source_sequence bigint;
begin
  select sequence into v_source_sequence from public.event_rating_ledger
  where entry_kind = 'initial' and event_id = 'a1312000-0000-4000-8000-000000000001';
  if not exists (
    select 1 from public.rating_recalculation_runs
    where earliest_ledger_sequence = v_source_sequence
      and affected_event_id = 'a1312000-0000-4000-8000-000000000001'
      and trigger_kind = 'correction'
      and reason = 'Winner was entered on the wrong side.'
      and status = 'pending'
  ) then raise exception 'Correction did not queue its audited earliest replay.'; end if;
  if (
    select count(*)
    from public.event_rating_jobs job
    join public.rating_recalculation_runs run
      on run.id = job.recalculation_run_id
    where run.affected_event_id = 'a1312000-0000-4000-8000-000000000001'
      and job.event_id = run.affected_event_id
      and job.job_kind = 'recalculation'
      and job.status = 'pending'
  ) <> 1 then
    raise exception 'Correction did not queue exactly one linked replay job.';
  end if;
  if not exists (
    select 1 from public.matches
    where id = 'a1317000-0000-4000-8000-000000000001'
      and team_one_score = 4 and team_two_score = 6
  ) then raise exception 'Authoritative corrected score was not saved.'; end if;

  begin
    perform public.set_completed_event_standings_eligibility(
      'a1311000-0000-4000-8000-000000000001',
      'a1312000-0000-4000-8000-000000000001', false,
      'a1310000-0000-4000-8000-000000000001', 'Duplicate event.'
    );
    raise exception 'Concurrent rating fact mutation unexpectedly succeeded.';
  exception when others then
    if sqlerrm not like '%existing rating recalculation%' then raise; end if;
  end;
  if not (select standings_eligible from public.events
          where id = 'a1312000-0000-4000-8000-000000000001') then
    raise exception 'Rejected concurrent request changed standings eligibility.';
  end if;
end;
$$;

select public.archive_completed_event(
  'a1311000-0000-4000-8000-000000000001',
  'a1312000-0000-4000-8000-000000000001'
);
select public.restore_archived_event(
  'a1311000-0000-4000-8000-000000000001',
  'a1312000-0000-4000-8000-000000000001'
);

do $$
begin
  if (select count(*) from public.rating_recalculation_runs) <> 1 then
    raise exception 'Archive or restore scheduled a rating replay.';
  end if;
end;
$$;

do $$
declare
  v_run_id uuid;
  v_job_id uuid;
  v_source_sequence bigint;
  v_profiles jsonb;
  v_entries jsonb;
begin
  select run.id, job.id into v_run_id, v_job_id
  from public.rating_recalculation_runs run
  join public.event_rating_jobs job
    on job.recalculation_run_id = run.id
  where run.affected_event_id = 'a1312000-0000-4000-8000-000000000001';

  v_run_id := public.claim_rating_recalculation_run(
    v_job_id, v_run_id,
    'asa-131-worker', 'a1313000-0000-4000-8000-000000000001'
  );
  if v_run_id is null then raise exception 'Pending replay was not claimed.'; end if;
  if public.claim_rating_recalculation_run(
    v_job_id, v_run_id,
    'overlap-worker', 'a1313000-0000-4000-8000-000000000002'
  ) is not null then raise exception 'Overlapping worker claimed the active replay.'; end if;
  if not exists (
    select 1 from public.event_rating_jobs
    where id = v_job_id and status = 'processing'
      and recalculation_run_id = v_run_id
      and lock_token = 'a1313000-0000-4000-8000-000000000001'
  ) then raise exception 'Replay job and run were not claimed together.'; end if;

  select sequence into v_source_sequence from public.event_rating_ledger
  where entry_kind = 'initial' and event_id = 'a1312000-0000-4000-8000-000000000001';
  select jsonb_agg(jsonb_build_object(
    'appUserId', app_user_id,
    'mu', case when app_user_id::text like 'a1310000-%' then initial_mu + 1 else mu end,
    'sigma', case when app_user_id::text like 'a1310000-%' then 10 else sigma end,
    'ratedMatchCount', case when app_user_id::text like 'a1310000-%' then 1 else rated_match_count end,
    'engineVersion', initial_engine_version,
    'expectedInitialMu', initial_mu + 0.00000000000001,
    'expectedInitialSigma', initial_sigma - 0.00000000000001
  ) order by app_user_id) into v_profiles
  from public.rating_profiles where onboarding_status = 'completed';

  -- The profile updates happen before source validation inside the function;
  -- this forced failure proves the whole transaction rolls them back.
  v_entries := jsonb_build_array(jsonb_build_object(
    'originalLedgerSequence', v_source_sequence + 999,
    'eventId', 'a1312000-0000-4000-8000-000000000001',
    'entryKind', 'replay', 'eligibilityStatus', 'eligible',
    'processingStatus', 'applied', 'canonicalInput', '{}'::jsonb,
    'inputHash', repeat('c', 64), 'canonicalOutput', '{}'::jsonb,
    'outputHash', repeat('d', 64), 'engineManifest',
    (select engine_manifest from public.event_rating_ledger where sequence = v_source_sequence)
  ));
  begin
    perform public.finish_rating_recalculation_run(
      v_job_id, v_run_id, 'a1313000-0000-4000-8000-000000000001',
      v_entries, v_profiles, repeat('e', 64)
    );
    raise exception 'Invalid replay unexpectedly committed.';
  exception when others then
    if sqlerrm not like '%does not match immutable source history%'
      and sqlerrm not like '%precedes the requested suffix%' then raise; end if;
  end;
  if exists (select 1 from public.rating_profiles
             where app_user_id::text like 'a1310000-%' and rated_match_count <> 0) then
    raise exception 'Failed replay exposed partial profile updates.';
  end if;

  perform public.fail_rating_recalculation_run(
    v_job_id, v_run_id, 'a1313000-0000-4000-8000-000000000001',
    '{}'::jsonb, repeat('a', 64),
    (select engine_manifest from public.event_rating_ledger
     where sequence = v_source_sequence),
    'forced_failure', 'Forced atomicity check.'
  );
  if not exists (
    select 1 from public.event_rating_jobs
    where id = v_job_id and status = 'retryable'
      and lock_token is null and last_error_code = 'forced_failure'
  ) then raise exception 'Failed replay did not settle its queue job.'; end if;

  update public.event_rating_jobs
  set next_attempt_at = now() - interval '1 second'
  where id = v_job_id;
  if public.claim_rating_recalculation_run(
    v_job_id, v_run_id,
    'retry-worker', 'a1313000-0000-4000-8000-000000000003'
  ) <> v_run_id then raise exception 'Failed replay was not retryable.'; end if;

  v_entries := jsonb_build_array(jsonb_build_object(
    'originalLedgerSequence', v_source_sequence,
    'eventId', 'a1312000-0000-4000-8000-000000000001',
    'entryKind', 'replay', 'eligibilityStatus', 'eligible',
    'processingStatus', 'applied', 'canonicalInput', '{}'::jsonb,
    'inputHash', repeat('c', 64), 'canonicalOutput', '{}'::jsonb,
    'outputHash', repeat('d', 64), 'engineManifest',
    (select engine_manifest from public.event_rating_ledger where sequence = v_source_sequence)
  ));
  perform public.finish_rating_recalculation_run(
    v_job_id, v_run_id, 'a1313000-0000-4000-8000-000000000003',
    v_entries, v_profiles, repeat('f', 64)
  );
  -- Same run/result is an idempotent no-op.
  perform public.finish_rating_recalculation_run(
    v_job_id, v_run_id, 'a1313000-0000-4000-8000-000000000003',
    v_entries, v_profiles, repeat('f', 64)
  );
end;
$$;

do $$
begin
  if (select count(*) from public.rating_profiles
      where app_user_id::text like 'a1310000-%' and rated_match_count = 1 and sigma = 10) <> 4 then
    raise exception 'Successful retry did not atomically publish every profile.';
  end if;
  if (select count(*) from public.event_rating_ledger
      where entry_kind = 'replay' and processing_status = 'applied') <> 1 then
    raise exception 'Idempotent finish appended duplicate replay history.';
  end if;
  if (select count(*) from public.event_rating_ledger
      where entry_kind = 'replay' and processing_status = 'failed') <> 1 then
    raise exception 'Failed replay attempt was not recorded exactly once.';
  end if;
  if not exists (select 1 from public.rating_recalculation_runs
    where status = 'completed' and final_hash = repeat('f', 64)
      and attempt_count = 2) then
    raise exception 'Replay run status, hash, or retry count is incorrect.';
  end if;
  if not exists (
    select 1 from public.event_rating_jobs job
    join public.event_rating_ledger ledger
      on ledger.sequence = job.latest_ledger_sequence
    where job.recalculation_run_id = ledger.recalculation_run_id
      and job.status = 'applied' and job.completed_at is not null
  ) then raise exception 'Completed replay did not settle its queue job.'; end if;
end;
$$;

do $$
begin
  update public.rating_profiles
  set rated_match_count = 0, is_provisional = true
  where app_user_id = 'a1310000-0000-4000-8000-000000000001';

  if not exists (
    select 1 from public.rating_profiles
    where app_user_id = 'a1310000-0000-4000-8000-000000000001'
      and rated_match_count = 0
      and first_official_rated_at is not null
  ) then
    raise exception 'Replay cleared the durable first Official appearance lock.';
  end if;

  begin
    update public.rating_profiles
    set initial_mu = initial_mu + 1
    where app_user_id = 'a1310000-0000-4000-8000-000000000001';
    raise exception 'Excluded profile unexpectedly changed its questionnaire baseline.';
  exception when others then
    if sqlerrm not like '%questionnaire baseline is locked%' then raise; end if;
  end;
end;
$$;

rollback;
