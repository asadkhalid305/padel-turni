-- ASA-127: future rosters are account-owned and workspace-membership scoped.
-- Legacy players and event snapshots remain untouched and readable.

-- An account proxy may use the same historical email as an unlinked legacy
-- player. Email is display/contact data, never an identity or merge key.
drop index if exists public.players_workspace_account_email_unique;

-- Existing accepted memberships receive one compatibility proxy keyed only by
-- their stable account and workspace IDs. Re-running the statement is safe;
-- neither names nor emails are used to find or merge an existing player.
create function app_private.backfill_account_player_proxies()
returns void
language sql
set search_path = ''
as $$
  insert into public.players (
    workspace_id,
    name,
    app_user_id,
    account_email,
    rating,
    is_active
  )
  select
    membership.workspace_id,
    coalesce(nullif(btrim(app_user.display_name), ''), app_user.email),
    membership.app_user_id,
    app_user.email,
    5,
    true
  from public.workspace_memberships membership
  join public.app_users app_user on app_user.id = membership.app_user_id
  where not exists (
    select 1
    from public.players player
    where player.workspace_id = membership.workspace_id
      and player.app_user_id = membership.app_user_id
  )
  on conflict do nothing;
$$;

select app_private.backfill_account_player_proxies();

create function app_private.protect_player_account_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.app_user_id is distinct from old.app_user_id then
    raise exception 'Player account identity cannot be linked, unlinked, or reassigned.';
  end if;

  return new;
end;
$$;

create trigger players_protect_account_identity
before update of app_user_id on public.players
for each row execute function app_private.protect_player_account_identity();

create function app_private.validate_account_owned_event_player()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_event_workspace_id uuid;
  v_rating_era text;
  v_player_workspace_id uuid;
  v_app_user_id uuid;
  v_player_is_active boolean;
begin
  select event.workspace_id, event.rating_era
  into v_event_workspace_id, v_rating_era
  from public.events event
  where event.id = new.event_id;

  if v_event_workspace_id is null then
    raise exception 'Event workspace is required for roster eligibility.';
  end if;

  select player.workspace_id, player.app_user_id, player.is_active
  into v_player_workspace_id, v_app_user_id, v_player_is_active
  from public.players player
  where player.id = new.player_id;

  if v_rating_era = 'automated' then
    if v_app_user_id is null then
      raise exception 'Legacy manual players cannot join a new event roster.';
    end if;

    if v_player_workspace_id is distinct from v_event_workspace_id then
      raise exception 'Roster accounts must belong to the event workspace.';
    end if;

    if not coalesce(v_player_is_active, false) then
      raise exception 'Inactive club members cannot join a new event roster.';
    end if;

    if not exists (
      select 1
      from public.workspace_memberships membership
      where membership.workspace_id = v_event_workspace_id
        and membership.app_user_id = v_app_user_id
    ) then
      raise exception 'Only accepted current club members can join a new event roster.';
    end if;

    if not exists (
      select 1
      from public.rating_profiles profile
      where profile.app_user_id = v_app_user_id
        and profile.onboarding_status = 'completed'
    ) then
      raise exception 'Club members must complete their rating profile before joining a new event roster.';
    end if;
  end if;

  if tg_op = 'UPDATE' and (
    new.event_id is distinct from old.event_id
    or new.player_id is distinct from old.player_id
  ) then
    raise exception 'Event player source identity is immutable.';
  end if;

  return new;
end;
$$;

create trigger event_players_validate_account_roster
before insert or update of event_id, player_id on public.event_players
for each row execute function app_private.validate_account_owned_event_player();

comment on function app_private.validate_account_owned_event_player() is
  'Enforces account-owned, accepted, active, profile-complete rosters for automated-era events while preserving legacy history.';
