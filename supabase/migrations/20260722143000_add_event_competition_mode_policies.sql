-- ASA-128: competition mode is the source of truth for standings and rating
-- eligibility. Archive state remains visibility-only.

alter table public.events
add constraint events_practice_never_standings_eligible check (
  competition_mode <> 'practice' or standings_eligible = false
),
add constraint events_official_pre_completion_is_included check (
  competition_mode <> 'official'
  or standings_eligible = true
  or status in ('completed', 'cancelled', 'archived')
);

create function app_private.protect_event_competition_mode()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.competition_mode is distinct from old.competition_mode
    and exists (
      select 1
      from public.matches match
      where match.event_id = old.id
        and match.status <> 'scheduled'
    )
  then
    raise exception 'Event mode is locked once a match starts.';
  end if;

  return new;
end;
$$;

create trigger events_protect_competition_mode
before update of competition_mode on public.events
for each row execute function app_private.protect_event_competition_mode();

create or replace function public.set_completed_event_standings_eligibility(
  p_workspace_id uuid,
  p_event_id uuid,
  p_standings_eligible boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_competition_mode text;
begin
  select competition_mode
  into v_competition_mode
  from public.events
  where id = p_event_id
    and workspace_id = p_workspace_id
    and status = 'completed'
  for update;

  if not found then
    raise exception 'Only completed events can change standings eligibility.';
  end if;
  if v_competition_mode = 'practice' then
    raise exception 'Practice events never affect standings or player ratings.';
  end if;

  update public.events
  set standings_eligible = p_standings_eligible
  where id = p_event_id
    and workspace_id = p_workspace_id;
end;
$$;

revoke execute on function public.set_completed_event_standings_eligibility(uuid, uuid, boolean)
from public, anon, authenticated;
grant execute on function public.set_completed_event_standings_eligibility(uuid, uuid, boolean)
to service_role;
