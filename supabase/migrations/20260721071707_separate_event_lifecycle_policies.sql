alter table public.events
add column archived_at timestamptz,
add column standings_eligible boolean not null default true;

alter table public.events drop constraint if exists events_status_check;
alter table public.events
add constraint events_status_check
check (status in ('draft', 'scheduled', 'live', 'completed', 'cancelled', 'archived'));

update public.events
set
  archived_at = coalesce(updated_at, now()),
  standings_eligible = false
where status = 'archived';

create index events_workspace_archived_starts_at_idx
on public.events(workspace_id, archived_at, starts_at desc);

create index events_workspace_standings_eligible_idx
on public.events(workspace_id, id)
where standings_eligible;

create or replace function public.correct_completed_match_score(
  p_workspace_id uuid,
  p_event_id uuid,
  p_match_id uuid,
  p_actor_id uuid,
  p_team_one_score integer,
  p_team_two_score integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_match public.matches%rowtype;
begin
  if p_team_one_score not between 0 and 99
    or p_team_two_score not between 0 and 99 then
    raise exception 'Scores must be between 0 and 99.';
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
  if v_match.status <> 'completed' then
    raise exception 'Only completed match scores can be corrected.';
  end if;

  insert into public.match_corrections (
    workspace_id,
    event_id,
    match_id,
    corrected_by_app_user_id,
    correction_type,
    previous_status,
    previous_team_one_score,
    previous_team_two_score,
    new_status,
    new_team_one_score,
    new_team_two_score
  ) values (
    p_workspace_id,
    p_event_id,
    p_match_id,
    p_actor_id,
    'score',
    v_match.status,
    v_match.team_one_score,
    v_match.team_two_score,
    'completed',
    p_team_one_score,
    p_team_two_score
  );

  perform set_config('app.completed_match_mutation', 'allowed', true);
  update public.matches
  set
    team_one_score = p_team_one_score,
    team_two_score = p_team_two_score
  where id = p_match_id;
  perform set_config('app.completed_match_mutation', '', true);
end;
$$;

create function public.complete_live_event(
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
begin
  select status, starts_at
  into v_event_status, v_starts_at
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
end;
$$;

create function public.cancel_live_event(
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
begin
  select status, starts_at
  into v_event_status, v_starts_at
  from public.events
  where id = p_event_id and workspace_id = p_workspace_id
  for update;

  if v_event_status is null then
    raise exception 'Event not found in this club.';
  end if;
  if v_event_status not in ('scheduled', 'live') or v_starts_at > now() then
    raise exception 'Only live events can be cancelled.';
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
  set
    status = 'cancelled',
    standings_eligible = false,
    archived_at = now()
  where id = p_event_id and workspace_id = p_workspace_id;
end;
$$;

create function public.archive_completed_event(
  p_workspace_id uuid,
  p_event_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.events
  set archived_at = now()
  where id = p_event_id
    and workspace_id = p_workspace_id
    and status = 'completed'
    and archived_at is null;

  if not found then
    raise exception 'Only active completed events can be archived.';
  end if;
end;
$$;

create function public.restore_archived_event(
  p_workspace_id uuid,
  p_event_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.events
  set archived_at = null
  where id = p_event_id
    and workspace_id = p_workspace_id
    and status = 'completed'
    and archived_at is not null;

  if not found then
    raise exception 'Only archived completed events can be restored.';
  end if;
end;
$$;

create function public.set_completed_event_standings_eligibility(
  p_workspace_id uuid,
  p_event_id uuid,
  p_standings_eligible boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.events
  set standings_eligible = p_standings_eligible
  where id = p_event_id
    and workspace_id = p_workspace_id
    and status = 'completed';

  if not found then
    raise exception 'Only completed events can change standings eligibility.';
  end if;
end;
$$;

create or replace function public.archive_live_event(
  p_workspace_id uuid,
  p_event_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.cancel_live_event(p_workspace_id, p_event_id);
end;
$$;

revoke execute on function public.complete_live_event(uuid, uuid)
from public, anon, authenticated;
revoke execute on function public.cancel_live_event(uuid, uuid)
from public, anon, authenticated;
revoke execute on function public.archive_completed_event(uuid, uuid)
from public, anon, authenticated;
revoke execute on function public.restore_archived_event(uuid, uuid)
from public, anon, authenticated;
revoke execute on function public.set_completed_event_standings_eligibility(uuid, uuid, boolean)
from public, anon, authenticated;

grant execute on function public.complete_live_event(uuid, uuid) to service_role;
grant execute on function public.cancel_live_event(uuid, uuid) to service_role;
grant execute on function public.archive_completed_event(uuid, uuid) to service_role;
grant execute on function public.restore_archived_event(uuid, uuid) to service_role;
grant execute on function public.set_completed_event_standings_eligibility(uuid, uuid, boolean)
to service_role;
