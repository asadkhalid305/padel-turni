begin;

-- Local demo data for the automated-ratings product. The main workspace is
-- claimed by the matching Google account on first login; its fixture members
-- are account-owned profiles, never legacy/manual players.

alter table public.matches disable trigger matches_protect_completed;
delete from public.events where id::text like '93000000-0000-4000-8000-%';
alter table public.matches enable trigger matches_protect_completed;

delete from public.workspace_invites where id = '96000000-0000-4000-8000-000000000001';
delete from public.workspace_memberships where app_user_id::text like '91000000-0000-4000-8000-%';
delete from public.players where id::text like '92000000-0000-4000-8000-%';
delete from public.rating_profiles where app_user_id::text like '91000000-0000-4000-8000-%';
delete from public.app_users where id::text like '91000000-0000-4000-8000-%';
delete from auth.users where id::text like '91000000-0000-4000-8000-%';

delete from public.workspace_memberships
where workspace_id in (
  '90000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000002'
);
delete from public.workspaces
where id in (
  '90000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000002'
);

insert into public.workspaces (id, name, personal_owner_app_user_id)
values
  ('90000000-0000-4000-8000-000000000001', 'Asad Ullah Khalid demo club', null),
  ('90000000-0000-4000-8000-000000000002', 'Asad Projects clean club', null);

-- These fixture identities exist only to make the primary local workspace
-- demoable. They have completed automated profiles and are valid roster
-- members, but invitation acceptance should still be demonstrated with a
-- real second Google account using the seeded open invite below.
insert into auth.users (id, email)
values
  ('91000000-0000-4000-8000-000000000001', 'maya.demo@padelturni.local'),
  ('91000000-0000-4000-8000-000000000002', 'noah.demo@padelturni.local'),
  ('91000000-0000-4000-8000-000000000003', 'sofia.demo@padelturni.local'),
  ('91000000-0000-4000-8000-000000000004', 'leon.demo@padelturni.local'),
  ('91000000-0000-4000-8000-000000000005', 'amira.demo@padelturni.local'),
  ('91000000-0000-4000-8000-000000000006', 'elias.demo@padelturni.local'),
  ('91000000-0000-4000-8000-000000000007', 'nina.demo@padelturni.local'),
  ('91000000-0000-4000-8000-000000000008', 'jonas.demo@padelturni.local');

insert into public.app_users (id, email, display_name)
values
  ('91000000-0000-4000-8000-000000000001', 'maya.demo@padelturni.local', 'Maya Fischer'),
  ('91000000-0000-4000-8000-000000000002', 'noah.demo@padelturni.local', 'Noah Becker'),
  ('91000000-0000-4000-8000-000000000003', 'sofia.demo@padelturni.local', 'Sofia Keller'),
  ('91000000-0000-4000-8000-000000000004', 'leon.demo@padelturni.local', 'Leon Weber'),
  ('91000000-0000-4000-8000-000000000005', 'amira.demo@padelturni.local', 'Amira Wagner'),
  ('91000000-0000-4000-8000-000000000006', 'elias.demo@padelturni.local', 'Elias Hoffmann'),
  ('91000000-0000-4000-8000-000000000007', 'nina.demo@padelturni.local', 'Nina Bauer'),
  ('91000000-0000-4000-8000-000000000008', 'jonas.demo@padelturni.local', 'Jonas Richter');

insert into public.rating_profiles (
  app_user_id, onboarding_status,
  padel_experience_answer, padel_experience_score,
  racket_sport_answer, racket_sport_score,
  current_ability_answer, current_ability_score,
  initial_mu, initial_sigma, initial_displayed_level, initial_engine_version,
  mu, sigma, rated_match_count, is_provisional, engine_version,
  questionnaire_completed_at, first_official_rated_at
)
select
  id, 'completed', 'developing', 2, 'recreational', 1, 'intermediate', 2,
  (3.5 - 0.5) * 50 / 6.5, 12.5, 3.5, 'openskill-bradley-terry-full-v1',
  (current_level - 0.5) * 50 / 6.5,
  case when rated_matches = 0 then 12.5 else 10 end,
  rated_matches, rated_matches < 6, 'openskill-bradley-terry-full-v1',
  now() - interval '30 days',
  case when rated_matches = 0 then null else now() - interval '20 days' end
from (values
  ('91000000-0000-4000-8000-000000000001'::uuid, 2.5::double precision, 1),
  ('91000000-0000-4000-8000-000000000002'::uuid, 3.0::double precision, 3),
  ('91000000-0000-4000-8000-000000000003'::uuid, 3.5::double precision, 0),
  ('91000000-0000-4000-8000-000000000004'::uuid, 4.0::double precision, 6),
  ('91000000-0000-4000-8000-000000000005'::uuid, 4.5::double precision, 2),
  ('91000000-0000-4000-8000-000000000006'::uuid, 3.2::double precision, 5),
  ('91000000-0000-4000-8000-000000000007'::uuid, 5.0::double precision, 6),
  ('91000000-0000-4000-8000-000000000008'::uuid, 3.5::double precision, 0)
) as demo(id, current_level, rated_matches);

insert into public.workspace_memberships (workspace_id, app_user_id, role)
select '90000000-0000-4000-8000-000000000001', id, 'member'
from public.app_users
where id::text like '91000000-0000-4000-8000-%';

insert into public.players (id, workspace_id, name, rating, is_active, app_user_id, account_email)
select
  ('92000000-0000-4000-8000-00000000000' || row_number() over (order by user_row.id))::uuid,
  '90000000-0000-4000-8000-000000000001', user_row.display_name,
  round((0.5 + 6.5 * profile.mu / 50)::numeric, 1), true,
  user_row.id, user_row.email
from public.app_users user_row
join public.rating_profiles profile on profile.app_user_id = user_row.id
where user_row.id::text like '91000000-0000-4000-8000-%';

insert into public.events (
  id, workspace_id, name, venue, starts_at, status, archived_at,
  competition_mode, rating_era, standings_eligible, seed, draw_strategy,
  round_minutes, break_minutes, notes
)
values
  ('93000000-0000-4000-8000-000000000007', '90000000-0000-4000-8000-000000000001', 'New Wednesday Draft', 'PadelBox Mitte', now() + interval '17 days', 'draft', null, 'official', 'automated', true, 9307, 'rating_balanced', 20, 3, 'Draft event: edit its roster and details before generating or starting play.'),
  ('93000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'Thursday Official', 'PadelBox Mitte', now() + interval '3 days', 'scheduled', null, 'official', 'automated', true, 9301, 'rating_balanced', 20, 3, 'Scheduled Official event ready to edit, duplicate, or start.'),
  ('93000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', 'Live Club Night', 'Racket Club Kreuzberg', now() - interval '45 minutes', 'live', null, 'official', 'automated', true, 9302, 'random', 20, 3, 'Live Official event with completed, paused, and scoreable matches.'),
  ('93000000-0000-4000-8000-000000000008', '90000000-0000-4000-8000-000000000001', 'Monday Ladder', 'PadelBox Mitte', now() - interval '12 days', 'completed', null, 'official', 'automated', true, 9308, 'rating_balanced', 20, 3, 'Completed Official event: results populate the career board and standings history.'),
  ('93000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000001', 'Sunday Social', 'PadelBox Mitte', now() - interval '7 days', 'completed', null, 'practice', 'automated', false, 9303, 'random', 20, 3, 'Completed Practice event: results remain visible but ratings stay unchanged.'),
  ('93000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000001', 'Spring Official Finals', 'Racket Club Kreuzberg', now() - interval '21 days', 'archived', now() - interval '14 days', 'official', 'automated', true, 9304, 'rating_balanced', 20, 3, 'Archived Official event for the archive view.'),
  ('93000000-0000-4000-8000-000000000005', '90000000-0000-4000-8000-000000000001', 'Rain Check', 'Outdoor Courts', now() - interval '2 days', 'cancelled', null, 'official', 'automated', false, 9305, 'random', 20, 3, 'Cancelled event for the archive view.'),
  ('93000000-0000-4000-8000-000000000006', '90000000-0000-4000-8000-000000000001', 'Friday Social', 'PadelBox Mitte', now() + interval '10 days', 'scheduled', null, 'practice', 'automated', false, 9306, 'random', 20, 3, 'Scheduled Practice event for a non-rating flow.');

insert into public.event_players (
  event_id, player_id, name_snapshot, rating_snapshot, app_user_id_snapshot,
  rating_mu_snapshot, rating_sigma_snapshot, displayed_level_snapshot,
  rating_engine_version_snapshot, display_order
)
select
  event.id, player.id, user_row.display_name,
  round((0.5 + 6.5 * profile.mu / 50)::numeric, 1), user_row.id,
  profile.mu, profile.sigma, round((0.5 + 6.5 * profile.mu / 50)::numeric, 1),
  profile.engine_version, row_number() over (partition by event.id order by player.id) - 1
from public.events event
cross join public.players player
join public.app_users user_row on user_row.id = player.app_user_id
join public.rating_profiles profile on profile.app_user_id = user_row.id
where event.id::text like '93000000-0000-4000-8000-%'
  and player.id in (
    '92000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000003',
    '92000000-0000-4000-8000-000000000004'
  );

insert into public.event_rounds (id, event_id, round_number, court_count, starts_at, duration_seconds)
values
  ('94000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 1, 1, now() + interval '3 days', 1200),
  ('94000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000002', 1, 1, now() - interval '40 minutes', 1200),
  ('94000000-0000-4000-8000-000000000009', '93000000-0000-4000-8000-000000000008', 1, 1, now() - interval '12 days', 1200),
  ('94000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000003', 1, 1, now() - interval '7 days', 1200),
  ('94000000-0000-4000-8000-000000000004', '93000000-0000-4000-8000-000000000004', 1, 1, now() - interval '21 days', 1200),
  ('94000000-0000-4000-8000-000000000005', '93000000-0000-4000-8000-000000000005', 1, 1, now() - interval '2 days', 1200),
  ('94000000-0000-4000-8000-000000000006', '93000000-0000-4000-8000-000000000006', 1, 1, now() + interval '10 days', 1200),
  ('94000000-0000-4000-8000-000000000007', '93000000-0000-4000-8000-000000000002', 2, 1, now() - interval '15 minutes', 1200),
  ('94000000-0000-4000-8000-000000000008', '93000000-0000-4000-8000-000000000002', 3, 1, now() - interval '5 minutes', 1200);

insert into public.matches (
  event_id, round_id, court_number, status,
  team_one_player_one_id, team_one_player_two_id,
  team_two_player_one_id, team_two_player_two_id,
  team_one_score, team_two_score, timer_started_at, timer_paused_at,
  timer_duration_seconds, completed_at
)
select
  scenario.event_id, scenario.round_id, 1, scenario.status,
  (select player.id from public.event_players player where player.event_id = scenario.event_id and player.display_order = 0),
  (select player.id from public.event_players player where player.event_id = scenario.event_id and player.display_order = 1),
  (select player.id from public.event_players player where player.event_id = scenario.event_id and player.display_order = 2),
  (select player.id from public.event_players player where player.event_id = scenario.event_id and player.display_order = 3),
  scenario.team_one_score, scenario.team_two_score,
  scenario.timer_started_at, scenario.timer_paused_at, 1200, scenario.completed_at
from (values
  ('93000000-0000-4000-8000-000000000001'::uuid, '94000000-0000-4000-8000-000000000001'::uuid, 'scheduled', null::integer, null::integer, null::timestamptz, null::timestamptz, null::timestamptz),
  ('93000000-0000-4000-8000-000000000002'::uuid, '94000000-0000-4000-8000-000000000002'::uuid, 'completed', 6, 4, now() - interval '40 minutes', null::timestamptz, now() - interval '20 minutes'),
  ('93000000-0000-4000-8000-000000000008'::uuid, '94000000-0000-4000-8000-000000000009'::uuid, 'completed', 6, 3, now() - interval '12 days', null::timestamptz, now() - interval '11 days 23 hours 40 minutes'),
  ('93000000-0000-4000-8000-000000000003'::uuid, '94000000-0000-4000-8000-000000000003'::uuid, 'completed', 6, 2, now() - interval '7 days', null::timestamptz, now() - interval '6 days 23 hours 40 minutes'),
  ('93000000-0000-4000-8000-000000000004'::uuid, '94000000-0000-4000-8000-000000000004'::uuid, 'completed', 6, 3, now() - interval '21 days', null::timestamptz, now() - interval '20 days 23 hours 40 minutes'),
  ('93000000-0000-4000-8000-000000000005'::uuid, '94000000-0000-4000-8000-000000000005'::uuid, 'cancelled', null::integer, null::integer, null::timestamptz, null::timestamptz, null::timestamptz),
  ('93000000-0000-4000-8000-000000000006'::uuid, '94000000-0000-4000-8000-000000000006'::uuid, 'scheduled', null::integer, null::integer, null::timestamptz, null::timestamptz, null::timestamptz),
  ('93000000-0000-4000-8000-000000000002'::uuid, '94000000-0000-4000-8000-000000000007'::uuid, 'paused', null::integer, null::integer, now() - interval '15 minutes', now() - interval '5 minutes', null::timestamptz),
  ('93000000-0000-4000-8000-000000000002'::uuid, '94000000-0000-4000-8000-000000000008'::uuid, 'scheduled', null::integer, null::integer, null::timestamptz, null::timestamptz, null::timestamptz)
) as scenario(event_id, round_id, status, team_one_score, team_two_score, timer_started_at, timer_paused_at, completed_at);

insert into public.workspace_invites (
  id, workspace_id, token_hash, invited_email, status, created_by_app_user_id, expires_at
)
values (
  '96000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  encode(digest('demo-join', 'sha256'), 'hex'), null, 'pending',
  '91000000-0000-4000-8000-000000000001', now() + interval '90 days'
);

commit;
