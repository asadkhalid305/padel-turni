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
values ('a1290000-0000-4000-8000-000000000001', 'snapshot@asa129.test');

insert into public.app_users (id, email, display_name)
values (
  'a1290000-0000-4000-8000-000000000001',
  'snapshot@asa129.test',
  'Snapshot Account'
);

insert into public.workspaces (id, name)
values ('a1291000-0000-4000-8000-000000000001', 'ASA-129 Club');

insert into public.workspace_memberships (workspace_id, app_user_id, role)
values (
  'a1291000-0000-4000-8000-000000000001',
  'a1290000-0000-4000-8000-000000000001',
  'member'
);

insert into public.players (
  id, workspace_id, name, app_user_id, account_email, is_active
)
values (
  'a1292000-0000-4000-8000-000000000001',
  'a1291000-0000-4000-8000-000000000001',
  'Compatibility Name',
  'a1290000-0000-4000-8000-000000000001',
  'snapshot@asa129.test',
  true
);

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
values (
  'a1290000-0000-4000-8000-000000000001',
  'completed',
  'developing', 2,
  'recreational', 1,
  'beginner', 1,
  19.23076923076923,
  12.5,
  3.0,
  'openskill-bradley-terry-full-v1',
  19.23076923076923,
  12.5,
  'openskill-bradley-terry-full-v1',
  now()
);

insert into public.events (
  id, workspace_id, name, starts_at, competition_mode, rating_era
)
values
  ('a1293000-0000-4000-8000-000000000001', 'a1291000-0000-4000-8000-000000000001', 'Captured event', now() + interval '1 day', 'official', 'automated'),
  ('a1293000-0000-4000-8000-000000000002', 'a1291000-0000-4000-8000-000000000001', 'Bypass event', now() + interval '2 days', 'official', 'automated');

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
values (
  'a1294000-0000-4000-8000-000000000001',
  'a1293000-0000-4000-8000-000000000001',
  'a1292000-0000-4000-8000-000000000001',
  'Snapshot Account',
  3.0,
  'a1290000-0000-4000-8000-000000000001',
  19.23076923076923,
  12.5,
  3.0,
  'openskill-bradley-terry-full-v1',
  0
);

update public.rating_profiles
set mu = 30, sigma = 8
where app_user_id = 'a1290000-0000-4000-8000-000000000001';

do $$
begin
  if not exists (
    select 1
    from public.event_players
    where id = 'a1294000-0000-4000-8000-000000000001'
      and rating_mu_snapshot = 19.23076923076923
      and rating_sigma_snapshot = 12.5
      and displayed_level_snapshot = 3.0
  ) then
    raise exception 'Historical event snapshot changed with the current profile.';
  end if;
end;
$$;

select pg_temp.expect_failure(
  $$update public.event_players
    set rating_mu_snapshot = 30
    where id = 'a1294000-0000-4000-8000-000000000001'$$,
  'snapshots are immutable'
);

select pg_temp.expect_failure(
  $$insert into public.event_players (
      event_id, player_id, name_snapshot, rating_snapshot,
      app_user_id_snapshot, rating_mu_snapshot, rating_sigma_snapshot,
      displayed_level_snapshot, rating_engine_version_snapshot, display_order
    ) values (
      'a1293000-0000-4000-8000-000000000002',
      'a1292000-0000-4000-8000-000000000001',
      'Snapshot Account', 3.0,
      'a1290000-0000-4000-8000-000000000001',
      19.23076923076923, 12.5, 3.0,
      'openskill-bradley-terry-full-v1', 0
    )$$,
  'must match the selected account current profile'
);

-- Scheduled draw replacement is allowed to remove a roster row; immutability
-- protects retained snapshots, not deletion of an unplayed roster.
delete from public.event_players
where id = 'a1294000-0000-4000-8000-000000000001';

rollback;
