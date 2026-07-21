alter table public.events
add column draw_strategy text;

update public.events
set draw_strategy = 'rating_balanced';

alter table public.events
alter column draw_strategy set default 'random',
alter column draw_strategy set not null,
add constraint events_draw_strategy_check
  check (draw_strategy in ('random', 'rating_balanced'));

create function public.replace_scheduled_event_draw(
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
  delete from public.event_players where event_id = p_event_id;

  for v_snapshot in select value from jsonb_array_elements(p_snapshots)
  loop
    insert into public.event_players (
      id, event_id, player_id, name_snapshot, rating_snapshot, display_order
    ) values (
      (v_snapshot->>'id')::uuid,
      p_event_id,
      (v_snapshot->>'playerId')::uuid,
      v_snapshot->>'name',
      (v_snapshot->>'rating')::numeric,
      (v_snapshot->>'displayOrder')::integer
    );
  end loop;

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

revoke all on function public.replace_scheduled_event_draw(
  uuid, uuid, integer, text, text, integer, integer, integer, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.replace_scheduled_event_draw(
  uuid, uuid, integer, text, text, integer, integer, integer, jsonb, jsonb
) to service_role;
