create table public.match_corrections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  corrected_by_app_user_id uuid not null references public.app_users(id) on delete restrict,
  correction_type text not null check (correction_type in ('score', 'reopen')),
  previous_status text not null,
  previous_team_one_score integer,
  previous_team_two_score integer,
  new_status text not null,
  new_team_one_score integer,
  new_team_two_score integer,
  created_at timestamptz not null default now()
);

create index match_corrections_event_id_created_at_idx
on public.match_corrections(event_id, created_at desc);

create index match_corrections_match_id_created_at_idx
on public.match_corrections(match_id, created_at desc);

alter table public.match_corrections enable row level security;

revoke all on table public.match_corrections from anon, authenticated;
grant all on table public.match_corrections to service_role;

create policy "Deny direct client access"
on public.match_corrections
for all
to anon, authenticated
using (false)
with check (false);

create or replace function app_private.protect_completed_match()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'completed' then
      raise exception 'Completed matches cannot be deleted';
    end if;
    return old;
  end if;

  if old.status = 'completed'
    and current_setting('app.completed_match_mutation', true) is distinct from 'allowed'
    and (
      new.status is distinct from old.status
      or new.event_id is distinct from old.event_id
      or new.round_id is distinct from old.round_id
      or new.court_number is distinct from old.court_number
      or new.team_one_player_one_id is distinct from old.team_one_player_one_id
      or new.team_one_player_two_id is distinct from old.team_one_player_two_id
      or new.team_two_player_one_id is distinct from old.team_two_player_one_id
      or new.team_two_player_two_id is distinct from old.team_two_player_two_id
      or new.team_one_score is distinct from old.team_one_score
      or new.team_two_score is distinct from old.team_two_score
      or new.completed_at is distinct from old.completed_at
    ) then
    raise exception 'Completed matches cannot be overwritten';
  end if;
  return new;
end;
$$;

create function public.correct_completed_match_score(
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
    and event.status not in ('completed', 'archived')
  for update of match;

  if not found then
    raise exception 'Match not found in this club.';
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

create function public.reopen_completed_match(
  p_workspace_id uuid,
  p_event_id uuid,
  p_match_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_status text;
  v_match public.matches%rowtype;
begin
  select event.status
  into v_event_status
  from public.events event
  where event.id = p_event_id
    and event.workspace_id = p_workspace_id
  for update;

  if v_event_status is null then
    raise exception 'Event not found in this club.';
  end if;
  if v_event_status in ('completed', 'archived') then
    raise exception 'Matches in completed or archived events cannot be reopened.';
  end if;

  select *
  into v_match
  from public.matches
  where id = p_match_id and event_id = p_event_id
  for update;

  if not found then
    raise exception 'Match not found in this event.';
  end if;
  if v_match.status <> 'completed' then
    raise exception 'Only completed matches can be reopened.';
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
    'reopen',
    v_match.status,
    v_match.team_one_score,
    v_match.team_two_score,
    'scheduled',
    null,
    null
  );

  perform set_config('app.completed_match_mutation', 'allowed', true);
  update public.matches
  set
    status = 'scheduled',
    team_one_score = null,
    team_two_score = null,
    timer_started_at = null,
    timer_paused_at = null,
    timer_accumulated_pause_seconds = 0,
    completed_at = null
  where id = p_match_id;
  perform set_config('app.completed_match_mutation', '', true);
end;
$$;

create function public.archive_live_event(
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
  if v_event_status = 'completed' then
    raise exception 'Completed events stay in history and cannot be archived here.';
  end if;
  if v_event_status = 'archived' then
    raise exception 'This event is already archived.';
  end if;
  if v_event_status <> 'live' and v_starts_at > now() then
    raise exception 'Future scheduled events should be deleted instead.';
  end if;

  update public.matches
  set
    status = 'cancelled',
    timer_paused_at = null
  where event_id = p_event_id
    and status <> 'completed';

  update public.events
  set status = 'archived'
  where id = p_event_id and workspace_id = p_workspace_id;
end;
$$;

revoke execute on function public.correct_completed_match_score(uuid, uuid, uuid, uuid, integer, integer)
from public, anon, authenticated;
revoke execute on function public.reopen_completed_match(uuid, uuid, uuid, uuid)
from public, anon, authenticated;
revoke execute on function public.archive_live_event(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.correct_completed_match_score(uuid, uuid, uuid, uuid, integer, integer)
to service_role;
grant execute on function public.reopen_completed_match(uuid, uuid, uuid, uuid)
to service_role;
grant execute on function public.archive_live_event(uuid, uuid)
to service_role;
