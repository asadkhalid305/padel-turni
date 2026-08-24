begin;

insert into auth.users (id, email)
select
  ('a1300000-0000-4000-8000-00000000000' || value)::uuid,
  'rating-' || value || '@asa130.test'
from generate_series(1, 4) value;

insert into public.app_users (id, email, display_name)
select
  ('a1300000-0000-4000-8000-00000000000' || value)::uuid,
  'rating-' || value || '@asa130.test',
  'Rating Account ' || value
from generate_series(1, 4) value;

insert into public.rating_profiles (
  app_user_id, onboarding_status,
  padel_experience_answer, padel_experience_score,
  racket_sport_answer, racket_sport_score,
  current_ability_answer, current_ability_score,
  initial_mu, initial_sigma, initial_displayed_level,
  initial_engine_version, mu, sigma, engine_version,
  questionnaire_completed_at
)
select
  ('a1300000-0000-4000-8000-00000000000' || value)::uuid,
  'completed', 'developing', 2, 'recreational', 1, 'beginner', 1,
  20 + value, 12.5, 3.5,
  'openskill-bradley-terry-full-v1', 20 + value, 12.5,
  'openskill-bradley-terry-full-v1', now()
from generate_series(1, 4) value;

insert into public.workspaces (id, name)
values ('a1301000-0000-4000-8000-000000000001', 'ASA-130 Club');

insert into public.workspace_memberships (workspace_id, app_user_id, role)
select
  'a1301000-0000-4000-8000-000000000001',
  ('a1300000-0000-4000-8000-00000000000' || value)::uuid,
  'member'
from generate_series(1, 4) value;

insert into public.players (
  id, workspace_id, name, account_email, app_user_id, is_active
)
select
  ('a1304000-0000-4000-8000-00000000000' || value)::uuid,
  'a1301000-0000-4000-8000-000000000001',
  'Rating Account ' || value,
  'rating-' || value || '@asa130.test',
  ('a1300000-0000-4000-8000-00000000000' || value)::uuid,
  true
from generate_series(1, 4) value;

insert into public.events (
  id, workspace_id, name, starts_at, status,
  competition_mode, rating_era, standings_eligible
)
values
  ('a1302000-0000-4000-8000-000000000001', 'a1301000-0000-4000-8000-000000000001', 'First rating event', now() - interval '1 hour', 'live', 'official', 'automated', true),
  ('a1302000-0000-4000-8000-000000000002', 'a1301000-0000-4000-8000-000000000001', 'Atomic failure event', now(), 'completed', 'official', 'automated', true);

insert into public.event_players (
  id, event_id, player_id, name_snapshot, rating_snapshot,
  app_user_id_snapshot, rating_mu_snapshot, rating_sigma_snapshot,
  displayed_level_snapshot, rating_engine_version_snapshot, display_order
)
select
  ('a1305000-0000-4000-8000-00000000000' || value)::uuid,
  'a1302000-0000-4000-8000-000000000001',
  ('a1304000-0000-4000-8000-00000000000' || value)::uuid,
  'Rating Account ' || value,
  greatest(0.5::numeric, least(7.0::numeric, round((0.5 + 6.5 * (20 + value) / 50.0)::numeric, 1))),
  ('a1300000-0000-4000-8000-00000000000' || value)::uuid,
  20 + value,
  12.5,
  greatest(0.5::numeric, least(7.0::numeric, round((0.5 + 6.5 * (20 + value) / 50.0)::numeric, 1))),
  'openskill-bradley-terry-full-v1',
  value - 1
from generate_series(1, 4) value;

insert into public.event_rounds (
  id, event_id, round_number, court_count, duration_seconds
)
values (
  'a1306000-0000-4000-8000-000000000001',
  'a1302000-0000-4000-8000-000000000001', 1, 2, 1200
);

insert into public.matches (
  id, event_id, round_id, court_number, status,
  team_one_player_one_id, team_one_player_two_id,
  team_two_player_one_id, team_two_player_two_id,
  team_one_score, team_two_score, timer_duration_seconds, completed_at
)
values
  (
    'a1307000-0000-4000-8000-000000000001',
    'a1302000-0000-4000-8000-000000000001',
    'a1306000-0000-4000-8000-000000000001', 1, 'completed',
    'a1305000-0000-4000-8000-000000000001',
    'a1305000-0000-4000-8000-000000000002',
    'a1305000-0000-4000-8000-000000000003',
    'a1305000-0000-4000-8000-000000000004',
    6, 4, 1200, now()
  ),
  (
    'a1307000-0000-4000-8000-000000000002',
    'a1302000-0000-4000-8000-000000000001',
    'a1306000-0000-4000-8000-000000000001', 2, 'scheduled',
    'a1305000-0000-4000-8000-000000000003',
    'a1305000-0000-4000-8000-000000000004',
    'a1305000-0000-4000-8000-000000000001',
    'a1305000-0000-4000-8000-000000000002',
    null, null, 1200, null
  );

select public.complete_live_event(
  'a1301000-0000-4000-8000-000000000001',
  'a1302000-0000-4000-8000-000000000001'
);

do $$
begin
  if (select count(*) from public.event_rating_jobs
      where event_id = 'a1302000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Completion did not enqueue exactly one initial job.';
  end if;
  if not exists (select 1 from public.matches
      where id = 'a1307000-0000-4000-8000-000000000001'
        and status = 'completed' and team_one_score = 6 and team_two_score = 4) then
    raise exception 'Completion changed an authoritative completed score.';
  end if;
  if not exists (select 1 from public.matches
      where id = 'a1307000-0000-4000-8000-000000000002'
        and status = 'cancelled' and team_one_score is null) then
    raise exception 'Completion did not cancel its unfinished match.';
  end if;

  begin
    perform public.complete_live_event(
      'a1301000-0000-4000-8000-000000000001',
      'a1302000-0000-4000-8000-000000000001'
    );
    raise exception 'Duplicate completion unexpectedly succeeded.';
  exception
    when others then
      if sqlerrm not like '%Only live events%' then raise; end if;
  end;

  if (select count(*) from public.event_rating_jobs
      where event_id = 'a1302000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Duplicate completion created duplicate work.';
  end if;
end;
$$;

insert into public.event_rating_jobs (event_id)
values ('a1302000-0000-4000-8000-000000000002');

do $$
declare
  claimed boolean;
begin
  claimed := public.claim_initial_event_rating_job(
    'a1302000-0000-4000-8000-000000000001',
    'asa-130-test',
    'a1303000-0000-4000-8000-000000000001'
  );
  if not claimed then raise exception 'Expected pending job to be claimed.'; end if;
  if public.claim_initial_event_rating_job(
    'a1302000-0000-4000-8000-000000000002',
    'overtaking-worker',
    'a1303000-0000-4000-8000-000000000004'
  ) then
    raise exception 'A later queue sequence overtook earlier processing.';
  end if;
end;
$$;

select public.finish_initial_event_rating_job(
  'a1302000-0000-4000-8000-000000000001',
  'a1303000-0000-4000-8000-000000000001',
  'eligible',
  'applied',
  '{"eventId":"a1302000-0000-4000-8000-000000000001"}'::jsonb,
  repeat('a', 64),
  '{"matches":[],"profiles":[]}'::jsonb,
  repeat('b', 64),
  '{"engineId":"openskill-bradley-terry-full-v1"}'::jsonb,
  (
    select jsonb_agg(jsonb_build_object(
      'appUserId', app_user_id,
      'mu', mu + 1,
      'sigma', 10,
      'ratedMatchCount', 1,
      'isProvisional', true,
      'firstOfficialRatedAppearance', true,
      'engineVersion', 'openskill-bradley-terry-full-v1',
      -- Model the harmless decimal difference introduced by a
      -- PostgREST JSON double round trip.
      'expectedMu', mu + 0.00000000000001,
      'expectedSigma', sigma - 0.00000000000001,
      'expectedRatedMatchCount', rated_match_count
    ) order by app_user_id)
    from public.rating_profiles
    where app_user_id::text like 'a1300000-%'
  )
);

do $$
begin
  if (select count(*) from public.rating_profiles
      where app_user_id::text like 'a1300000-%'
        and rated_match_count = 1 and sigma = 10) <> 4 then
    raise exception 'All four latest profiles were not updated atomically.';
  end if;
  if (select count(*) from public.event_rating_ledger
      where event_id = 'a1302000-0000-4000-8000-000000000001'
        and processing_status = 'applied') <> 1 then
    raise exception 'Exactly one applied ledger entry was not recorded.';
  end if;
  if (select status from public.event_rating_jobs
      where event_id = 'a1302000-0000-4000-8000-000000000001') <> 'applied' then
    raise exception 'Applied job did not become terminal.';
  end if;
  if public.claim_initial_event_rating_job(
    'a1302000-0000-4000-8000-000000000001',
    'duplicate-worker',
    'a1303000-0000-4000-8000-000000000002'
  ) then
    raise exception 'A duplicate invocation claimed an applied event.';
  end if;
end;
$$;

do $$
begin
  if not public.claim_initial_event_rating_job(
    'a1302000-0000-4000-8000-000000000002',
    'atomic-test',
    'a1303000-0000-4000-8000-000000000003'
  ) then
    raise exception 'Expected second pending job to be claimed.';
  end if;
end;
$$;

do $$
begin
  perform public.finish_initial_event_rating_job(
    'a1302000-0000-4000-8000-000000000002',
    'a1303000-0000-4000-8000-000000000003',
    'eligible', 'applied', '{}', repeat('c', 64), '{}', repeat('d', 64), '{}',
    (
      select jsonb_agg(jsonb_build_object(
        'appUserId', app_user_id,
        'mu', mu + 1,
        'sigma', 9,
        'ratedMatchCount', 2,
        'isProvisional', true,
        'firstOfficialRatedAppearance', false,
        'engineVersion', 'openskill-bradley-terry-full-v1',
        'expectedMu', mu,
        'expectedSigma', sigma,
        'expectedRatedMatchCount', case
          when app_user_id = 'a1300000-0000-4000-8000-000000000004' then 999
          else rated_match_count
        end
      ) order by app_user_id)
      from public.rating_profiles
      where app_user_id::text like 'a1300000-%'
    )
  );
  raise exception 'Expected stale profile application to fail.';
exception
  when others then
    if sqlerrm not like '%profile changed%' then raise; end if;
end;
$$;

do $$
begin
  if exists (select 1 from public.rating_profiles
      where app_user_id::text like 'a1300000-%' and rated_match_count <> 1) then
    raise exception 'A failed application left partial latest-profile changes.';
  end if;
  if exists (select 1 from public.event_rating_ledger
      where event_id = 'a1302000-0000-4000-8000-000000000002') then
    raise exception 'A failed atomic finish left a ledger result.';
  end if;
end;
$$;

rollback;
