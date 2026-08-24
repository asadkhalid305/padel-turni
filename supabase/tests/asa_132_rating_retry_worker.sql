begin;

insert into public.workspaces (id, name)
values ('a1321000-0000-4000-8000-000000000001', 'ASA-132 Club');

insert into public.events (
  id, workspace_id, name, starts_at, status,
  competition_mode, rating_era, standings_eligible
)
select
  ('a1322000-0000-4000-8000-00000000000' || value)::uuid,
  'a1321000-0000-4000-8000-000000000001',
  'Worker event ' || value,
  now() - interval '1 day',
  'completed', 'official', 'automated', true
from generate_series(1, 5) value;

-- Immediate initial processing cannot overtake an earlier recalculation job.
insert into auth.users (id, email)
values ('a1320000-0000-4000-8000-000000000001', 'worker-admin@asa132.test');
insert into public.app_users (id, email, display_name)
values (
  'a1320000-0000-4000-8000-000000000001',
  'worker-admin@asa132.test', 'Worker Admin'
);

do $$
declare
  ledger_sequence bigint;
begin
  insert into public.event_rating_ledger (
    event_id, entry_kind, eligibility_status, processing_status,
    attempt_number, attempt_started_at, attempt_finished_at,
    canonical_input, input_hash, engine_manifest, error_code, error_message
  ) values (
    'a1322000-0000-4000-8000-000000000005',
    'initial', 'eligible', 'failed', 1,
    now() - interval '1 minute', now(), '{}', repeat('a', 64), '{}',
    'fixture', 'Fixture ledger entry.'
  ) returning sequence into ledger_sequence;

  insert into public.rating_recalculation_runs (
    id, earliest_ledger_sequence, affected_event_id, trigger_kind,
    requested_by_app_user_id, reason
  ) values (
    'a1325000-0000-4000-8000-000000000001', ledger_sequence,
    'a1322000-0000-4000-8000-000000000005', 'correction',
    'a1320000-0000-4000-8000-000000000001',
    'Verify replay ordering'
  );

  insert into public.event_rating_jobs (
    id, event_id, recalculation_run_id, job_kind, next_attempt_at
  ) values (
    'a1323000-0000-4000-8000-000000000010',
    'a1322000-0000-4000-8000-000000000005',
    'a1325000-0000-4000-8000-000000000001', 'recalculation', now()
  ) on conflict (recalculation_run_id) where recalculation_run_id is not null
    do update set next_attempt_at = excluded.next_attempt_at;
end;
$$;

insert into public.event_rating_jobs (
  id, event_id, recalculation_run_id, job_kind, next_attempt_at
)
values (
  'a1323000-0000-4000-8000-000000000011',
  'a1322000-0000-4000-8000-000000000001',
  null, 'initial', now()
);

do $$
begin
  if public.claim_initial_event_rating_job(
    'a1322000-0000-4000-8000-000000000001',
    'immediate-completion', 'a1324000-0000-4000-8000-000000000010'
  ) then
    raise exception 'Immediate initial work overtook an earlier replay job.';
  end if;
end;
$$;

delete from public.event_rating_jobs;

-- Stale replay recovery releases both the queue job and recalculation run, so
-- the exact job/run pair can be retried under one new lock.
update public.rating_recalculation_runs
set
  status = 'processing',
  attempt_count = 1,
  lock_token = 'a1324000-0000-4000-8000-000000000020',
  worker_id = 'stale-replay-worker',
  locked_at = now() - interval '10 minutes',
  started_at = now() - interval '10 minutes'
where id = 'a1325000-0000-4000-8000-000000000001';

insert into public.event_rating_jobs (
  id, event_id, recalculation_run_id, job_kind, status,
  attempt_count, max_attempts, next_attempt_at,
  lock_token, worker_id, locked_at, last_attempt_started_at
) values (
  'a1323000-0000-4000-8000-000000000020',
  'a1322000-0000-4000-8000-000000000005',
  'a1325000-0000-4000-8000-000000000001',
  'recalculation', 'processing', 1, 5, now() - interval '10 minutes',
  'a1324000-0000-4000-8000-000000000020',
  'stale-replay-worker', now() - interval '10 minutes',
  now() - interval '10 minutes'
);

do $$
declare
  recovered integer;
begin
  recovered := public.recover_stale_event_rating_jobs(
    now() - interval '5 minutes'
  );
  if recovered <> 1 then
    raise exception 'Expected one stale replay recovery.';
  end if;
  if not exists (
    select 1
    from public.event_rating_jobs job
    join public.rating_recalculation_runs run
      on run.id = job.recalculation_run_id
    where job.id = 'a1323000-0000-4000-8000-000000000020'
      and job.status = 'retryable' and job.lock_token is null
      and run.status = 'failed' and run.lock_token is null
      and run.last_error_code = 'rating_worker_stale_lock'
  ) then raise exception 'Stale replay did not release both locks.'; end if;

  update public.event_rating_jobs
  set next_attempt_at = now() - interval '1 second'
  where id = 'a1323000-0000-4000-8000-000000000020';

  if public.claim_rating_recalculation_run(
    'a1323000-0000-4000-8000-000000000020',
    'a1325000-0000-4000-8000-000000000001',
    'recovered-replay-worker',
    'a1324000-0000-4000-8000-000000000021'
  ) is null then raise exception 'Recovered replay was not retryable.'; end if;

  perform public.fail_rating_recalculation_run(
    'a1323000-0000-4000-8000-000000000020',
    'a1325000-0000-4000-8000-000000000001',
    'a1324000-0000-4000-8000-000000000021',
    '{}'::jsonb, repeat('a', 64), '{}'::jsonb,
    'fixture_cleanup', 'Fixture cleanup failure.'
  );
end;
$$;

delete from public.event_rating_jobs;

-- A stale earlier job is recovered but its backoff continues to block later
-- queue work, preserving global rating order.
insert into public.event_rating_jobs (
  id, event_id, status, attempt_count, max_attempts, next_attempt_at,
  lock_token, worker_id, locked_at, last_attempt_started_at
)
values
  (
    'a1323000-0000-4000-8000-000000000001',
    'a1322000-0000-4000-8000-000000000001',
    'processing', 1, 5, now() - interval '10 minutes',
    'a1324000-0000-4000-8000-000000000001',
    'interrupted-worker', now() - interval '10 minutes',
    now() - interval '10 minutes'
  ),
  (
    'a1323000-0000-4000-8000-000000000002',
    'a1322000-0000-4000-8000-000000000002',
    'pending', 0, 5, now() - interval '1 minute',
    null, null, null, null
  );

do $$
declare
  recovered integer;
begin
  recovered := public.recover_stale_event_rating_jobs(
    now() - interval '5 minutes'
  );
  if recovered <> 1 then
    raise exception 'Expected exactly one stale lock recovery.';
  end if;
  if not exists (
    select 1 from public.event_rating_jobs
    where id = 'a1323000-0000-4000-8000-000000000001'
      and status = 'retryable'
      and lock_token is null and worker_id is null and locked_at is null
      and last_attempt_finished_at is not null
      and last_error_code = 'rating_worker_stale_lock'
      and next_attempt_at between now() + interval '55 seconds'
        and now() + interval '65 seconds'
  ) then
    raise exception 'Stale job did not transition to bounded retry.';
  end if;
  if exists (select 1 from public.list_due_event_rating_jobs(1)) then
    raise exception 'Later work overtook the recovering earlier job.';
  end if;
end;
$$;

update public.event_rating_jobs
set next_attempt_at = now() - interval '1 second'
where id = 'a1323000-0000-4000-8000-000000000001';

do $$
declare
  due_id uuid;
begin
  select id into due_id from public.list_due_event_rating_jobs(1);
  if due_id <> 'a1323000-0000-4000-8000-000000000001' then
    raise exception 'Worker did not select the earliest due job.';
  end if;
  if not public.claim_initial_event_rating_job(
    'a1322000-0000-4000-8000-000000000001',
    'overlap-a', 'a1324000-0000-4000-8000-000000000002'
  ) then
    raise exception 'Expected the first overlapping worker to claim the job.';
  end if;
  if public.claim_initial_event_rating_job(
    'a1322000-0000-4000-8000-000000000001',
    'overlap-b', 'a1324000-0000-4000-8000-000000000003'
  ) then
    raise exception 'Two overlapping workers claimed the same job.';
  end if;
end;
$$;

delete from public.event_rating_jobs;

-- A stale final attempt becomes terminal, but one explicit recovery action can
-- put it back into the retry queue without resetting its audit counters.
insert into public.event_rating_jobs (
  id, event_id, status, attempt_count, max_attempts, next_attempt_at,
  lock_token, worker_id, locked_at, last_attempt_started_at
)
values (
  'a1323000-0000-4000-8000-000000000003',
  'a1322000-0000-4000-8000-000000000003',
  'processing', 5, 5, now() - interval '10 minutes',
  'a1324000-0000-4000-8000-000000000004',
  'interrupted-final-worker', now() - interval '10 minutes',
  now() - interval '10 minutes'
);

do $$
begin
  perform public.recover_stale_event_rating_jobs(now() - interval '5 minutes');
  if (select status from public.event_rating_jobs
      where id = 'a1323000-0000-4000-8000-000000000003') <> 'failed' then
    raise exception 'Final stale attempt was not terminal.';
  end if;
  if not public.retry_failed_event_rating_job(
    'a1323000-0000-4000-8000-000000000003'
  ) then
    raise exception 'Terminal job was not manually retryable.';
  end if;
  if (select status from public.event_rating_jobs
      where id = 'a1323000-0000-4000-8000-000000000003') <> 'retryable' then
    raise exception 'Manual retry did not return the job to the queue.';
  end if;
  if public.retry_failed_event_rating_job(
    'a1323000-0000-4000-8000-000000000003'
  ) then
    raise exception 'A non-failed job was manually retried twice.';
  end if;
end;
$$;

delete from public.event_rating_jobs;

-- Normal processor failures use the same exponential policy and become
-- terminal at max_attempts while retaining a compact immutable attempt trail.
insert into public.event_rating_jobs (
  id, event_id, status, attempt_count, max_attempts, next_attempt_at
)
values (
  'a1323000-0000-4000-8000-000000000004',
  'a1322000-0000-4000-8000-000000000004',
  'pending', 0, 3, now()
);

do $$
declare
  attempt integer;
  token uuid;
begin
  for attempt in 1..3 loop
    token := ('a1324000-0000-4000-8000-00000000000' || (4 + attempt))::uuid;
    update public.event_rating_jobs
    set next_attempt_at = now() - interval '1 second'
    where id = 'a1323000-0000-4000-8000-000000000004';

    if not public.claim_initial_event_rating_job(
      'a1322000-0000-4000-8000-000000000004',
      'bounded-retry-worker', token
    ) then
      raise exception 'Attempt % could not claim due work.', attempt;
    end if;

    perform public.fail_initial_event_rating_job(
      'a1322000-0000-4000-8000-000000000004', token,
      '{}'::jsonb, repeat('a', 64), '{}'::jsonb,
      'rating_processing_failed', repeat('x', 500)
    );

    if attempt < 3 and not exists (
      select 1 from public.event_rating_jobs
      where id = 'a1323000-0000-4000-8000-000000000004'
        and status = 'retryable'
        and next_attempt_at between
          now() + make_interval(secs => 60 * power(2, attempt - 1)::integer) - interval '5 seconds'
          and now() + make_interval(secs => 60 * power(2, attempt - 1)::integer) + interval '5 seconds'
    ) then
      raise exception 'Attempt % did not receive exponential backoff.', attempt;
    end if;
  end loop;

  if (select status from public.event_rating_jobs
      where id = 'a1323000-0000-4000-8000-000000000004') <> 'failed' then
    raise exception 'Retry limit did not produce terminal failure.';
  end if;
  if (select count(*) from public.event_rating_ledger
      where event_id = 'a1322000-0000-4000-8000-000000000004'
        and processing_status = 'failed') <> 3 then
    raise exception 'Failed attempts were not recorded immutably.';
  end if;
  if exists (
    select 1 from public.event_rating_ledger
    where event_id = 'a1322000-0000-4000-8000-000000000004'
      and length(error_message) > 240
  ) then
    raise exception 'Persisted errors exceeded the compact boundary.';
  end if;
end;
$$;

do $$
begin
  if has_function_privilege('anon', 'public.list_due_event_rating_jobs(integer)', 'execute')
    or has_function_privilege('authenticated', 'public.recover_stale_event_rating_jobs(timestamptz)', 'execute')
    or has_function_privilege('authenticated', 'public.retry_failed_event_rating_job(uuid)', 'execute') then
    raise exception 'Client roles can execute rating worker functions.';
  end if;
end;
$$;

rollback;
