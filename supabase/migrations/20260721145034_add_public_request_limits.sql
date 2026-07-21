create table public.public_request_limits (
  scope text not null
    check (scope in ('landing_view', 'feedback')),
  key_hash text not null
    check (key_hash ~ '^[0-9a-f]{64}$'),
  request_count integer not null default 1
    check (request_count > 0),
  window_started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (scope, key_hash),
  check (expires_at > window_started_at)
);

create index public_request_limits_expires_at_idx
on public.public_request_limits(expires_at);

alter table public.public_request_limits enable row level security;

revoke all on table public.public_request_limits from anon, authenticated;
grant all on table public.public_request_limits to service_role;

create policy "Deny direct client access"
on public.public_request_limits
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.consume_public_request_limit(
  p_scope text,
  p_key_hash text,
  p_window_seconds integer,
  p_max_requests integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request_count integer;
  v_allowed boolean;
  v_now timestamptz := clock_timestamp();
begin
  if p_scope not in ('landing_view', 'feedback') then
    raise exception 'Unsupported public request limit scope';
  end if;
  if p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid public request limit key';
  end if;
  if p_window_seconds < 1 or p_max_requests < 1 then
    raise exception 'Public request limit values must be positive';
  end if;

  insert into public.public_request_limits (
    scope,
    key_hash,
    request_count,
    window_started_at,
    expires_at
  )
  values (
    p_scope,
    p_key_hash,
    1,
    v_now,
    v_now + make_interval(secs => p_window_seconds)
  )
  on conflict (scope, key_hash) do update
  set request_count = case
        when public.public_request_limits.expires_at <= v_now then 1
        else public.public_request_limits.request_count + 1
      end,
      window_started_at = case
        when public.public_request_limits.expires_at <= v_now then v_now
        else public.public_request_limits.window_started_at
      end,
      expires_at = case
        when public.public_request_limits.expires_at <= v_now
          then v_now + make_interval(secs => p_window_seconds)
        else public.public_request_limits.expires_at
      end
  where public.public_request_limits.expires_at <= v_now
    or public.public_request_limits.request_count < p_max_requests
  returning request_count into v_request_count;

  v_allowed := found and v_request_count <= p_max_requests;

  return v_allowed;
end;
$$;

revoke execute on function public.consume_public_request_limit(
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.consume_public_request_limit(
  text,
  text,
  integer,
  integer
) to service_role;

update public.app_events
set metadata = jsonb_build_object(
  'destination',
  case
    when metadata ->> 'next' = '/' then 'home'
    when metadata ->> 'next' = '/invites'
      or metadata ->> 'next' like '/invites/%' then 'invite'
    else 'app'
  end
)
where event_type = 'sign_in_started'
  and metadata ? 'next';

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'padel-turni-data-retention',
  '15 3 * * *',
  $retention$
    delete from public.app_events
    where created_at < now() - interval '90 days';

    delete from public.public_request_limits
    where expires_at < now();

    delete from cron.job_run_details
    where end_time < now() - interval '7 days';
  $retention$
);
