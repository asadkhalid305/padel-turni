-- ASA-129: automated-era event rosters capture the account's global current
-- rating once. The snapshot is then the only rating input used by the draw.

-- Automated display levels include 0.5. Keep the wider legacy upper bound so
-- old manual snapshots remain valid and readable.
alter table public.event_players
drop constraint event_players_rating_snapshot_check,
add constraint event_players_rating_snapshot_check
  check (rating_snapshot between 0.5 and 10);

create function app_private.validate_automated_event_rating_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_rating_era text;
  v_app_user_id uuid;
  v_account_name text;
  v_onboarding_status text;
  v_mu double precision;
  v_sigma double precision;
  v_engine_version text;
  v_displayed_level numeric(2, 1);
begin
  select event.rating_era
  into v_rating_era
  from public.events event
  where event.id = new.event_id;

  if v_rating_era <> 'automated' then
    return new;
  end if;

  select
    player.app_user_id,
    coalesce(nullif(btrim(app_user.display_name), ''), app_user.email),
    profile.onboarding_status,
    profile.mu,
    profile.sigma,
    profile.engine_version
  into
    v_app_user_id,
    v_account_name,
    v_onboarding_status,
    v_mu,
    v_sigma,
    v_engine_version
  from public.players player
  join public.app_users app_user on app_user.id = player.app_user_id
  left join public.rating_profiles profile
    on profile.app_user_id = player.app_user_id
  where player.id = new.player_id;

  if v_app_user_id is null or v_onboarding_status is distinct from 'completed'
    or v_mu is null or v_sigma is null or v_engine_version is null then
    raise exception 'A completed current account rating is required for an automated event snapshot.';
  end if;

  v_displayed_level := greatest(
    0.5::numeric,
    least(7.0::numeric, round((0.5 + 6.5 * v_mu / 50.0)::numeric, 1))
  );

  if new.app_user_id_snapshot is distinct from v_app_user_id
    or new.name_snapshot is distinct from v_account_name
    -- Supabase serializes doubles through JSON before the application writes
    -- an immutable event snapshot. Compare those values at a precision far
    -- smaller than the rating engine can represent, rather than rejecting a
    -- harmless text round-trip difference such as 23.07692307692308 vs
    -- 23.0769230769231.
    or abs(new.rating_mu_snapshot - v_mu) > 0.000000001
    or abs(new.rating_sigma_snapshot - v_sigma) > 0.000000001
    or new.displayed_level_snapshot is distinct from v_displayed_level
    or new.rating_snapshot is distinct from v_displayed_level
    or new.rating_engine_version_snapshot is distinct from v_engine_version
  then
    raise exception 'Event rating snapshots must match the selected account current profile.';
  end if;

  return new;
end;
$$;

create trigger event_players_validate_automated_rating_snapshot
before insert on public.event_players
for each row execute function app_private.validate_automated_event_rating_snapshot();

comment on function app_private.validate_automated_event_rating_snapshot() is
  'Prevents direct inserts from forging account identity, name, or current rating snapshots for automated-era events.';

create or replace function public.replace_scheduled_event_draw(
  p_workspace_id uuid,
  p_event_id uuid,
  p_expected_seed integer,
  p_expected_draw_strategy text,
  p_draw_strategy text,
  p_seed integer,
  p_round_minutes integer,
  p_break_minutes integer,
  p_snapshots jsonb,
  p_rounds jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_match_count integer;
  v_scheduled_match_count integer;
  v_snapshot jsonb;
  v_round jsonb;
  v_match jsonb;
  v_round_id uuid;
begin
  if p_draw_strategy not in ('random', 'rating_balanced') then
    raise exception 'Choose a valid draw strategy.';
  end if;

  select * into v_event
  from public.events
  where id = p_event_id and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Event not found in this club.';
  end if;
  if v_event.status <> 'scheduled' or v_event.starts_at <= now() then
    raise exception 'The draw can only be replaced before the event starts.';
  end if;
  if v_event.seed <> p_expected_seed
    or v_event.draw_strategy <> p_expected_draw_strategy then
    raise exception 'The event draw changed while this form was open. Refresh and try again.';
  end if;

  select count(*), count(*) filter (where status = 'scheduled')
  into v_match_count, v_scheduled_match_count
  from public.matches
  where event_id = p_event_id;

  if v_match_count = 0 or v_match_count <> v_scheduled_match_count then
    raise exception 'Draws are locked once any match activity exists.';
  end if;
  if jsonb_typeof(p_snapshots) <> 'array'
    or jsonb_array_length(p_snapshots) < 4
    or jsonb_typeof(p_rounds) <> 'array'
    or jsonb_array_length(p_rounds) < 1 then
    raise exception 'A complete roster and draw are required.';
  end if;

  delete from public.matches where event_id = p_event_id;
  delete from public.event_rounds where event_id = p_event_id;
  -- Move existing orders out of the target range. Retained rows are updated in
  -- place below, so their immutable snapshot survives a current-profile change.
  update public.event_players
  set display_order = display_order + 10000
  where event_id = p_event_id;

  for v_snapshot in select value from jsonb_array_elements(p_snapshots)
  loop
    insert into public.event_players (
      id,
      event_id,
      player_id,
      name_snapshot,
      rating_snapshot,
      app_user_id_snapshot,
      rating_mu_snapshot,
      rating_sigma_snapshot,
      displayed_level_snapshot,
      rating_engine_version_snapshot,
      display_order
    ) values (
      (v_snapshot->>'id')::uuid,
      p_event_id,
      (v_snapshot->>'playerId')::uuid,
      v_snapshot->>'name',
      (v_snapshot->>'displayedLevel')::numeric,
      (v_snapshot->>'appUserId')::uuid,
      (v_snapshot->>'mu')::double precision,
      (v_snapshot->>'sigma')::double precision,
      (v_snapshot->>'displayedLevel')::numeric,
      v_snapshot->>'engineVersion',
      (v_snapshot->>'displayOrder')::integer
    )
    on conflict (id) do update
    set display_order = excluded.display_order;
  end loop;

  delete from public.event_players event_player
  where event_player.event_id = p_event_id
    and not exists (
      select 1
      from jsonb_array_elements(p_snapshots) snapshot
      where (snapshot->>'id')::uuid = event_player.id
    );

  for v_round in select value from jsonb_array_elements(p_rounds)
  loop
    insert into public.event_rounds (
      event_id, round_number, court_count, duration_seconds
    ) values (
      p_event_id,
      (v_round->>'roundNumber')::integer,
      jsonb_array_length(v_round->'matches'),
      p_round_minutes * 60
    ) returning id into v_round_id;

    for v_match in select value from jsonb_array_elements(v_round->'matches')
    loop
      insert into public.matches (
        event_id,
        round_id,
        court_number,
        team_one_player_one_id,
        team_one_player_two_id,
        team_two_player_one_id,
        team_two_player_two_id,
        timer_duration_seconds
      ) values (
        p_event_id,
        v_round_id,
        (v_match->>'courtNumber')::integer,
        (v_match->'teamOne'->>0)::uuid,
        (v_match->'teamOne'->>1)::uuid,
        (v_match->'teamTwo'->>0)::uuid,
        (v_match->'teamTwo'->>1)::uuid,
        p_round_minutes * 60
      );
    end loop;
  end loop;

  update public.events
  set
    draw_strategy = p_draw_strategy,
    seed = p_seed,
    round_minutes = p_round_minutes,
    break_minutes = p_break_minutes
  where id = p_event_id;
end;
$$;
