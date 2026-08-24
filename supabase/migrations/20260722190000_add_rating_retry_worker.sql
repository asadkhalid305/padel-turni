-- ASA-132: production retry worker primitives. Application processors still
-- own the per-job transaction lock; these functions expose only ordered due
-- work, recover abandoned locks, and make terminal failures manually retryable.

create function public.list_due_event_rating_jobs(p_limit integer default 1)
returns table (
  id uuid,
  event_id uuid,
  job_kind text,
  recalculation_run_id uuid,
  attempt_count integer,
  max_attempts integer
)
language plpgsql
security invoker
stable
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 10 then
    raise exception 'Rating worker batch limit must be between 1 and 10.';
  end if;

  return query
  select
    job.id,
    job.event_id,
    job.job_kind,
    job.recalculation_run_id,
    job.attempt_count,
    job.max_attempts
  from public.event_rating_jobs job
  where job.status in ('pending', 'retryable')
    and job.next_attempt_at <= now()
    and not exists (
      select 1
      from public.event_rating_jobs earlier
      where earlier.queue_sequence < job.queue_sequence
        and earlier.status in ('pending', 'processing', 'retryable', 'failed')
    )
  order by job.queue_sequence
  limit p_limit;
end;
$$;

create function public.recover_stale_event_rating_jobs(
  p_stale_before timestamptz
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recovered integer;
begin
  if p_stale_before is null or p_stale_before >= clock_timestamp() then
    raise exception 'A past stale-lock cutoff is required.';
  end if;

  update public.rating_recalculation_runs run
  set
    status = 'failed',
    lock_token = null,
    worker_id = null,
    locked_at = null,
    completed_at = null,
    final_hash = null,
    last_error_code = 'rating_worker_stale_lock',
    last_error_message = 'The rating worker stopped before finishing this attempt.'
  where run.id in (
    select job.recalculation_run_id
    from public.event_rating_jobs job
    where job.status = 'processing'
      and job.job_kind = 'recalculation'
      and job.locked_at <= p_stale_before
      and job.recalculation_run_id is not null
  )
    and run.status = 'processing';

  update public.event_rating_jobs job
  set
    status = case
      when job.attempt_count >= job.max_attempts then 'failed'
      else 'retryable'
    end,
    next_attempt_at = case
      when job.attempt_count >= job.max_attempts then job.next_attempt_at
      else clock_timestamp() + make_interval(
        secs => least(3600, 60 * power(2, greatest(job.attempt_count - 1, 0))::integer)
      )
    end,
    lock_token = null,
    worker_id = null,
    locked_at = null,
    last_attempt_finished_at = clock_timestamp(),
    last_error_code = 'rating_worker_stale_lock',
    last_error_message = 'The rating worker stopped before finishing this attempt.'
  where job.status = 'processing'
    and job.locked_at <= p_stale_before;

  get diagnostics v_recovered = row_count;
  return v_recovered;
end;
$$;

create function public.retry_failed_event_rating_job(p_job_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_retried_id uuid;
begin
  update public.event_rating_jobs job
  set
    status = 'retryable',
    next_attempt_at = clock_timestamp(),
    completed_at = null
  where job.id = p_job_id
    and job.status = 'failed'
    and job.lock_token is null
    and (
      job.job_kind = 'initial'
      or exists (
        select 1
        from public.rating_recalculation_runs run
        where run.id = job.recalculation_run_id
          and run.status = 'failed'
          and run.lock_token is null
      )
    )
  returning job.id into v_retried_id;

  return v_retried_id is not null;
end;
$$;

-- Immediate completion and cron use the same global queue. An initial event
-- must therefore not overtake an earlier replay job owned by ASA-131.
create or replace function public.claim_initial_event_rating_job(
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
      where earlier.queue_sequence < job.queue_sequence
        and earlier.status in ('pending', 'processing', 'retryable', 'failed')
    )
  returning job.id into v_claimed_id;

  return v_claimed_id is not null;
end;
$$;

create or replace function public.fail_initial_event_rating_job(
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
    left(coalesce(nullif(btrim(p_error_code), ''), 'rating_processing_failed'), 120),
    left(coalesce(nullif(btrim(p_error_message), ''), 'Rating processing failed.'), 240)
  ) returning sequence into v_ledger_sequence;

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
    latest_ledger_sequence = v_ledger_sequence,
    last_error_code = left(
      coalesce(nullif(btrim(p_error_code), ''), 'rating_processing_failed'),
      120
    ),
    last_error_message = left(
      coalesce(nullif(btrim(p_error_message), ''), 'Rating processing failed.'),
      240
    )
  where id = v_job.id;
end;
$$;

revoke execute on function public.list_due_event_rating_jobs(integer)
from public, anon, authenticated;
revoke execute on function public.recover_stale_event_rating_jobs(timestamptz)
from public, anon, authenticated;
revoke execute on function public.retry_failed_event_rating_job(uuid)
from public, anon, authenticated;

grant execute on function public.list_due_event_rating_jobs(integer)
to service_role;
grant execute on function public.recover_stale_event_rating_jobs(timestamptz)
to service_role;
grant execute on function public.retry_failed_event_rating_job(uuid)
to service_role;

comment on function public.list_due_event_rating_jobs(integer) is
  'Returns only the earliest due rating work so later jobs cannot overtake it.';
comment on function public.recover_stale_event_rating_jobs(timestamptz) is
  'Releases abandoned worker locks into bounded retry or terminal failure.';
comment on function public.retry_failed_event_rating_job(uuid) is
  'Explicitly returns one terminal failed rating job to the retry queue.';
