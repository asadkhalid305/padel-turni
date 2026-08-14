begin;

create function pg_temp.expect_failure(statement text, expected_message text)
returns void
language plpgsql
as $$
begin
  execute statement;
  raise exception 'Expected statement to fail: %', statement;
exception
  when others then
    if sqlerrm not like '%' || expected_message || '%' then
      raise exception 'Expected error containing %, got %', expected_message, sqlerrm;
    end if;
end;
$$;

insert into auth.users (id, email)
values
  ('a1270000-0000-4000-8000-000000000001', 'eligible@asa127.test'),
  ('a1270000-0000-4000-8000-000000000002', 'incomplete@asa127.test'),
  ('a1270000-0000-4000-8000-000000000003', 'inactive@asa127.test'),
  ('a1270000-0000-4000-8000-000000000004', 'invited@asa127.test'),
  ('a1270000-0000-4000-8000-000000000005', 'removed@asa127.test'),
  ('a1270000-0000-4000-8000-000000000006', 'backfill@asa127.test');

insert into public.app_users (id, email, display_name)
values
  ('a1270000-0000-4000-8000-000000000001', 'eligible@asa127.test', 'Eligible Account'),
  ('a1270000-0000-4000-8000-000000000002', 'incomplete@asa127.test', 'Incomplete Account'),
  ('a1270000-0000-4000-8000-000000000003', 'inactive@asa127.test', 'Inactive Account'),
  ('a1270000-0000-4000-8000-000000000004', 'invited@asa127.test', 'Invited Account'),
  ('a1270000-0000-4000-8000-000000000005', 'removed@asa127.test', 'Removed Account'),
  ('a1270000-0000-4000-8000-000000000006', 'backfill@asa127.test', 'Backfilled Account');

insert into public.workspaces (id, name)
values
  ('a1271000-0000-4000-8000-000000000001', 'ASA-127 Club A'),
  ('a1271000-0000-4000-8000-000000000002', 'ASA-127 Club B');

insert into public.workspace_memberships (workspace_id, app_user_id, role)
values
  ('a1271000-0000-4000-8000-000000000001', 'a1270000-0000-4000-8000-000000000001', 'member'),
  ('a1271000-0000-4000-8000-000000000002', 'a1270000-0000-4000-8000-000000000001', 'member'),
  ('a1271000-0000-4000-8000-000000000001', 'a1270000-0000-4000-8000-000000000002', 'member'),
  ('a1271000-0000-4000-8000-000000000001', 'a1270000-0000-4000-8000-000000000003', 'member'),
  ('a1271000-0000-4000-8000-000000000001', 'a1270000-0000-4000-8000-000000000006', 'member');

insert into public.workspace_invites (
  workspace_id,
  token_hash,
  invited_email,
  created_by_app_user_id,
  expires_at
)
values (
  'a1271000-0000-4000-8000-000000000001',
  repeat('a', 64),
  'invited@asa127.test',
  'a1270000-0000-4000-8000-000000000001',
  now() + interval '1 day'
);

insert into public.players (
  id,
  workspace_id,
  name,
  app_user_id,
  account_email,
  is_active
)
values
  ('a1272000-0000-4000-8000-000000000001', 'a1271000-0000-4000-8000-000000000001', 'Eligible A', 'a1270000-0000-4000-8000-000000000001', 'eligible@asa127.test', true),
  ('a1272000-0000-4000-8000-000000000002', 'a1271000-0000-4000-8000-000000000002', 'Eligible B', 'a1270000-0000-4000-8000-000000000001', 'eligible@asa127.test', true),
  ('a1272000-0000-4000-8000-000000000003', 'a1271000-0000-4000-8000-000000000001', 'Incomplete', 'a1270000-0000-4000-8000-000000000002', 'incomplete@asa127.test', true),
  ('a1272000-0000-4000-8000-000000000004', 'a1271000-0000-4000-8000-000000000001', 'Inactive', 'a1270000-0000-4000-8000-000000000003', 'inactive@asa127.test', false),
  ('a1272000-0000-4000-8000-000000000005', 'a1271000-0000-4000-8000-000000000001', 'Invited', 'a1270000-0000-4000-8000-000000000004', 'invited@asa127.test', true),
  ('a1272000-0000-4000-8000-000000000006', 'a1271000-0000-4000-8000-000000000001', 'Removed', 'a1270000-0000-4000-8000-000000000005', 'removed@asa127.test', true),
  ('a1272000-0000-4000-8000-000000000007', 'a1271000-0000-4000-8000-000000000001', 'Legacy Manual', null, 'legacy@asa127.test', true);

-- Existing accepted memberships are backfilled once, using stable IDs. The
-- repair is intentionally idempotent and ordinary roster reads never call it.
select app_private.backfill_account_player_proxies();
select app_private.backfill_account_player_proxies();

do $$
begin
  if (
    select count(*)
    from public.players
    where workspace_id = 'a1271000-0000-4000-8000-000000000001'
      and app_user_id = 'a1270000-0000-4000-8000-000000000006'
  ) <> 1 then
    raise exception 'Account player proxy backfill is not idempotent.';
  end if;
end;
$$;

insert into public.rating_profiles (
  app_user_id,
  onboarding_status,
  padel_experience_answer,
  padel_experience_score,
  racket_sport_answer,
  racket_sport_score,
  current_ability_answer,
  current_ability_score,
  initial_mu,
  initial_sigma,
  initial_displayed_level,
  initial_engine_version,
  mu,
  sigma,
  engine_version,
  questionnaire_completed_at
)
select
  app_user_id,
  'completed',
  'developing',
  2,
  'recreational',
  1,
  'beginner',
  1,
  19.23076923076923,
  12.5,
  3.0,
  'openskill-bradley-terry-full-v1',
  19.23076923076923,
  12.5,
  'openskill-bradley-terry-full-v1',
  now()
from unnest(array[
  'a1270000-0000-4000-8000-000000000001'::uuid,
  'a1270000-0000-4000-8000-000000000003'::uuid,
  'a1270000-0000-4000-8000-000000000004'::uuid,
  'a1270000-0000-4000-8000-000000000005'::uuid
]) as account(app_user_id);

insert into public.rating_profiles (app_user_id, onboarding_status)
values ('a1270000-0000-4000-8000-000000000002', 'in_progress');

insert into public.events (
  id,
  workspace_id,
  name,
  starts_at,
  competition_mode,
  rating_era
)
values
  ('a1273000-0000-4000-8000-000000000001', 'a1271000-0000-4000-8000-000000000001', 'Automated A', now(), 'official', 'automated'),
  ('a1273000-0000-4000-8000-000000000002', 'a1271000-0000-4000-8000-000000000002', 'Automated B', now(), 'official', 'automated'),
  ('a1273000-0000-4000-8000-000000000003', 'a1271000-0000-4000-8000-000000000001', 'Legacy History', now(), 'legacy', 'legacy'),
  ('a1273000-0000-4000-8000-000000000004', 'a1271000-0000-4000-8000-000000000001', 'Automated A Two', now(), 'official', 'automated');

-- One stable account can join both clubs through separate current memberships.
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
)
values
  ('a1274000-0000-4000-8000-000000000001', 'a1273000-0000-4000-8000-000000000001', 'a1272000-0000-4000-8000-000000000001', 'Eligible Account', 3.0, 'a1270000-0000-4000-8000-000000000001', 19.23076923076923, 12.5, 3.0, 'openskill-bradley-terry-full-v1', 0),
  ('a1274000-0000-4000-8000-000000000002', 'a1273000-0000-4000-8000-000000000002', 'a1272000-0000-4000-8000-000000000002', 'Eligible Account', 3.0, 'a1270000-0000-4000-8000-000000000001', 19.23076923076923, 12.5, 3.0, 'openskill-bradley-terry-full-v1', 0);

select pg_temp.expect_failure(
  $$insert into public.event_players (event_id, player_id, name_snapshot, rating_snapshot, display_order)
    values ('a1273000-0000-4000-8000-000000000001', 'a1272000-0000-4000-8000-000000000003', 'Incomplete', 5, 1)$$,
  'complete their rating profile'
);
select pg_temp.expect_failure(
  $$insert into public.event_players (event_id, player_id, name_snapshot, rating_snapshot, display_order)
    values ('a1273000-0000-4000-8000-000000000001', 'a1272000-0000-4000-8000-000000000004', 'Inactive', 5, 1)$$,
  'Inactive club members'
);

-- Once the second account becomes otherwise eligible, source identity still
-- cannot be swapped while retaining stale event snapshots.
update public.rating_profiles
set
  onboarding_status = 'completed',
  padel_experience_answer = 'developing',
  padel_experience_score = 2,
  racket_sport_answer = 'recreational',
  racket_sport_score = 1,
  current_ability_answer = 'beginner',
  current_ability_score = 1,
  initial_mu = 19.23076923076923,
  initial_sigma = 12.5,
  initial_displayed_level = 3.0,
  initial_engine_version = 'openskill-bradley-terry-full-v1',
  mu = 19.23076923076923,
  sigma = 12.5,
  engine_version = 'openskill-bradley-terry-full-v1',
  questionnaire_completed_at = now()
where app_user_id = 'a1270000-0000-4000-8000-000000000002';

select pg_temp.expect_failure(
  $$update public.event_players
    set player_id = 'a1272000-0000-4000-8000-000000000003'
    where id = 'a1274000-0000-4000-8000-000000000001'$$,
  'Event player source identity is immutable'
);
select pg_temp.expect_failure(
  $$update public.event_players
    set event_id = 'a1273000-0000-4000-8000-000000000004'
    where id = 'a1274000-0000-4000-8000-000000000001'$$,
  'Event player source identity is immutable'
);

select pg_temp.expect_failure(
  $$update public.players
    set app_user_id = 'a1270000-0000-4000-8000-000000000005'
    where id = 'a1272000-0000-4000-8000-000000000007'$$,
  'cannot be linked, unlinked, or reassigned'
);
select pg_temp.expect_failure(
  $$insert into public.event_players (event_id, player_id, name_snapshot, rating_snapshot, display_order)
    values ('a1273000-0000-4000-8000-000000000001', 'a1272000-0000-4000-8000-000000000005', 'Invited', 5, 1)$$,
  'accepted current club members'
);
select pg_temp.expect_failure(
  $$insert into public.event_players (event_id, player_id, name_snapshot, rating_snapshot, display_order)
    values ('a1273000-0000-4000-8000-000000000001', 'a1272000-0000-4000-8000-000000000006', 'Removed', 5, 1)$$,
  'accepted current club members'
);
select pg_temp.expect_failure(
  $$insert into public.event_players (event_id, player_id, name_snapshot, rating_snapshot, display_order)
    values ('a1273000-0000-4000-8000-000000000001', 'a1272000-0000-4000-8000-000000000007', 'Legacy Manual', 5, 1)$$,
  'Legacy manual players'
);

-- An UPDATE bypass is checked as well as INSERT and cannot retain stale snapshots.
select pg_temp.expect_failure(
  $$update public.event_players
    set player_id = 'a1272000-0000-4000-8000-000000000004'
    where id = 'a1274000-0000-4000-8000-000000000001'$$,
  'Inactive club members'
);

-- Legacy rows and snapshots stay readable and are never silently linked.
insert into public.event_players (
  id, event_id, player_id, name_snapshot, rating_snapshot, display_order
)
values (
  'a1274000-0000-4000-8000-000000000003',
  'a1273000-0000-4000-8000-000000000003',
  'a1272000-0000-4000-8000-000000000007',
  'Historical Name',
  6.5,
  0
);

do $$
declare
  snapshot record;
begin
  select event_player.name_snapshot, event_player.rating_snapshot, player.app_user_id
  into snapshot
  from public.event_players event_player
  join public.players player on player.id = event_player.player_id
  where event_player.id = 'a1274000-0000-4000-8000-000000000003';

  if snapshot.name_snapshot <> 'Historical Name'
    or snapshot.rating_snapshot <> 6.5
    or snapshot.app_user_id is not null
  then
    raise exception 'Legacy history was changed or silently linked.';
  end if;
end;
$$;

rollback;
