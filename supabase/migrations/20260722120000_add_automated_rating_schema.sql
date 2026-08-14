-- ASA-125 automated-rating cutover.
--
-- Forward assumptions:
-- * Every event that exists when this migration runs belongs to the legacy era.
-- * Legacy player.rating and event_players.rating_snapshot values are preserved only
--   for historical display and scheduling; they are never copied into rating_profiles.
-- * New events enter the automated era and default to Official. ASA-128 owns the
--   application workflow that lets an admin choose Official or Practice before play.
-- * Ledger rows are immutable facts. Mutable retry/replay state lives in
--   rating_recalculation_runs and later worker-owned persistence.
--
-- Rollback assumptions:
-- * A rollback may safely drop the new tables, triggers, and columns only before
--   automated-era events or ratings have been created.
-- * After cutover data exists, rollback requires an explicit export/archive of the
--   rating ledger; legacy columns remain intact but cannot reconstruct new ratings.

create table public.rating_profiles (
  app_user_id uuid primary key references public.app_users(id) on delete cascade,
  onboarding_status text not null default 'not_started'
    check (onboarding_status in ('not_started', 'in_progress', 'completed')),
  padel_experience_answer text,
  padel_experience_score smallint check (padel_experience_score between 0 and 4),
  racket_sport_answer text,
  racket_sport_score smallint check (racket_sport_score between 0 and 2),
  current_ability_answer text,
  current_ability_score smallint check (current_ability_score between 0 and 3),
  questionnaire_score smallint generated always as (
    padel_experience_score + racket_sport_score + current_ability_score
  ) stored,
  initial_mu double precision,
  initial_sigma double precision,
  initial_displayed_level numeric(2, 1),
  initial_engine_version text,
  mu double precision,
  sigma double precision,
  rated_match_count integer not null default 0 check (rated_match_count >= 0),
  is_provisional boolean not null default true,
  engine_version text,
  questionnaire_completed_at timestamptz,
  first_official_rated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rating_profiles_rating_values_complete check (
    (onboarding_status = 'completed'
      and padel_experience_answer is not null
      and btrim(padel_experience_answer) <> ''
      and padel_experience_score is not null
      and racket_sport_answer is not null
      and btrim(racket_sport_answer) <> ''
      and racket_sport_score is not null
      and current_ability_answer is not null
      and btrim(current_ability_answer) <> ''
      and current_ability_score is not null
      and questionnaire_score between 0 and 9
      and initial_mu is not null
      and initial_sigma is not null
      and initial_sigma > 0
      and initial_displayed_level between 1.0 and 5.5
      and initial_engine_version is not null
      and btrim(initial_engine_version) <> ''
      and mu is not null
      and sigma is not null
      and sigma > 0
      and engine_version is not null
      and btrim(engine_version) <> ''
      and questionnaire_completed_at is not null)
    or
    (onboarding_status <> 'completed'
      and initial_mu is null
      and initial_sigma is null
      and initial_displayed_level is null
      and initial_engine_version is null
      and mu is null
      and sigma is null
      and engine_version is null
      and questionnaire_completed_at is null)
  ),
  constraint rating_profiles_questionnaire_pairs_complete check (
    (padel_experience_answer is null) = (padel_experience_score is null)
    and (racket_sport_answer is null) = (racket_sport_score is null)
    and (current_ability_answer is null) = (current_ability_score is null)
  ),
  constraint rating_profiles_provisional_matches_count check (
    is_provisional = (rated_match_count < 6)
  ),
  constraint rating_profiles_first_appearance_consistent check (
    (rated_match_count = 0 and first_official_rated_at is null)
    or
    (rated_match_count > 0
      and onboarding_status = 'completed'
      and first_official_rated_at is not null)
  )
);

create trigger rating_profiles_set_updated_at
before update on public.rating_profiles
for each row execute function app_private.set_updated_at();

create function app_private.protect_rating_profile_baseline()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.rated_match_count > 0 or new.rated_match_count > 0) and (
    new.padel_experience_answer is distinct from old.padel_experience_answer
    or new.padel_experience_score is distinct from old.padel_experience_score
    or new.racket_sport_answer is distinct from old.racket_sport_answer
    or new.racket_sport_score is distinct from old.racket_sport_score
    or new.current_ability_answer is distinct from old.current_ability_answer
    or new.current_ability_score is distinct from old.current_ability_score
    or new.initial_mu is distinct from old.initial_mu
    or new.initial_sigma is distinct from old.initial_sigma
    or new.initial_displayed_level is distinct from old.initial_displayed_level
    or new.initial_engine_version is distinct from old.initial_engine_version
    or new.questionnaire_completed_at is distinct from old.questionnaire_completed_at
  ) then
    raise exception 'The rating questionnaire baseline is locked after the first Official rated match.';
  end if;

  return new;
end;
$$;

create trigger rating_profiles_protect_baseline
before update on public.rating_profiles
for each row execute function app_private.protect_rating_profile_baseline();

alter table public.events
add column competition_mode text,
add column rating_era text;

-- This update is the clean boundary: no existing manual rating is imported.
update public.events
set
  competition_mode = 'legacy',
  rating_era = 'legacy';

alter table public.events
alter column competition_mode set default 'official',
alter column competition_mode set not null,
alter column rating_era set default 'automated',
alter column rating_era set not null,
add constraint events_competition_mode_check
  check (competition_mode in ('official', 'practice', 'legacy')),
add constraint events_rating_era_check
  check (rating_era in ('legacy', 'automated')),
add constraint events_rating_era_mode_consistent check (
  (rating_era = 'legacy' and competition_mode = 'legacy')
  or
  (rating_era = 'automated' and competition_mode in ('official', 'practice'))
);

alter table public.event_players
add column app_user_id_snapshot uuid references public.app_users(id) on delete restrict,
add column rating_mu_snapshot double precision,
add column rating_sigma_snapshot double precision,
add column displayed_level_snapshot numeric(2, 1),
add column rating_engine_version_snapshot text,
add constraint event_players_automated_rating_snapshot_complete check (
  (
    app_user_id_snapshot is null
    and rating_mu_snapshot is null
    and rating_sigma_snapshot is null
    and displayed_level_snapshot is null
    and rating_engine_version_snapshot is null
  )
  or
  (
    app_user_id_snapshot is not null
    and rating_mu_snapshot is not null
    and rating_sigma_snapshot is not null
    and rating_sigma_snapshot > 0
    and displayed_level_snapshot between 0.5 and 7.0
    and rating_engine_version_snapshot is not null
    and btrim(rating_engine_version_snapshot) <> ''
  )
);

create index event_players_app_user_id_snapshot_idx
on public.event_players(app_user_id_snapshot)
where app_user_id_snapshot is not null;

create function app_private.protect_event_player_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name_snapshot is distinct from old.name_snapshot
    or new.rating_snapshot is distinct from old.rating_snapshot
    or new.app_user_id_snapshot is distinct from old.app_user_id_snapshot
    or new.rating_mu_snapshot is distinct from old.rating_mu_snapshot
    or new.rating_sigma_snapshot is distinct from old.rating_sigma_snapshot
    or new.displayed_level_snapshot is distinct from old.displayed_level_snapshot
    or new.rating_engine_version_snapshot is distinct from old.rating_engine_version_snapshot
  then
    raise exception 'Event player identity and rating snapshots are immutable.';
  end if;

  return new;
end;
$$;

create trigger event_players_protect_snapshot
before update on public.event_players
for each row execute function app_private.protect_event_player_snapshot();

create table public.rating_recalculation_runs (
  id uuid primary key default gen_random_uuid(),
  earliest_ledger_sequence bigint not null check (earliest_ledger_sequence > 0),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  requested_by_app_user_id uuid not null
    references public.app_users(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  worker_id text,
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rating_recalculation_runs_lock_consistent check (
    (worker_id is null and locked_at is null)
    or
    (worker_id is not null and btrim(worker_id) <> '' and locked_at is not null)
  ),
  constraint rating_recalculation_runs_completion_consistent check (
    (status = 'completed' and completed_at is not null and last_error_message is null)
    or
    (status <> 'completed' and completed_at is null)
  ),
  constraint rating_recalculation_runs_error_consistent check (
    (status = 'failed' and last_error_message is not null)
    or
    (status <> 'failed')
  )
);

create index rating_recalculation_runs_status_created_at_idx
on public.rating_recalculation_runs(status, created_at);

create trigger rating_recalculation_runs_set_updated_at
before update on public.rating_recalculation_runs
for each row execute function app_private.set_updated_at();

create table public.event_rating_ledger (
  sequence bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete restrict,
  recalculation_run_id uuid references public.rating_recalculation_runs(id) on delete restrict,
  entry_kind text not null default 'initial'
    check (entry_kind in ('initial', 'replay', 'exclusion', 'reinstatement')),
  eligibility_status text not null
    check (eligibility_status in ('eligible', 'ineligible')),
  processing_status text not null
    check (processing_status in ('applied', 'skipped', 'failed')),
  attempt_number integer not null check (attempt_number > 0),
  attempt_started_at timestamptz not null,
  attempt_finished_at timestamptz not null,
  canonical_input jsonb not null check (jsonb_typeof(canonical_input) = 'object'),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  canonical_output jsonb,
  output_hash text,
  engine_manifest jsonb not null check (jsonb_typeof(engine_manifest) = 'object'),
  audit_actor_app_user_id uuid references public.app_users(id) on delete restrict,
  audit_reason text,
  error_code text,
  error_message text,
  created_at timestamptz not null default clock_timestamp(),
  constraint event_rating_ledger_context_consistent check (
    (entry_kind = 'initial' and recalculation_run_id is null)
    or
    (entry_kind <> 'initial' and recalculation_run_id is not null)
  ),
  constraint event_rating_ledger_attempt_time_consistent check (
    attempt_finished_at >= attempt_started_at
  ),
  constraint event_rating_ledger_output_consistent check (
    (processing_status = 'applied'
      and eligibility_status = 'eligible'
      and canonical_output is not null
      and jsonb_typeof(canonical_output) = 'object'
      and output_hash ~ '^[0-9a-f]{64}$'
      and error_code is null
      and error_message is null)
    or
    (processing_status = 'skipped'
      and eligibility_status = 'ineligible'
      and canonical_output is null
      and output_hash is null
      and error_code is null
      and error_message is null)
    or
    (processing_status = 'failed'
      and canonical_output is null
      and output_hash is null
      and error_message is not null)
  ),
  constraint event_rating_ledger_audit_consistent check (
    (entry_kind = 'initial')
    or
    (audit_actor_app_user_id is not null
      and audit_reason is not null
      and length(btrim(audit_reason)) between 3 and 500)
  )
);

create unique index event_rating_ledger_initial_attempt_unique
on public.event_rating_ledger(event_id, attempt_number)
where recalculation_run_id is null;

create unique index event_rating_ledger_recalculation_attempt_unique
on public.event_rating_ledger(recalculation_run_id, event_id, attempt_number)
where recalculation_run_id is not null;

-- Duplicate initial delivery cannot apply an Official event twice. Replay entries
-- remain separately scoped to one audited recalculation run.
create unique index event_rating_ledger_initial_applied_once
on public.event_rating_ledger(event_id)
where recalculation_run_id is null and processing_status = 'applied';

create unique index event_rating_ledger_recalculation_applied_once
on public.event_rating_ledger(recalculation_run_id, event_id)
where recalculation_run_id is not null and processing_status = 'applied';

create index event_rating_ledger_event_sequence_idx
on public.event_rating_ledger(event_id, sequence);

create index event_rating_ledger_recalculation_sequence_idx
on public.event_rating_ledger(recalculation_run_id, sequence)
where recalculation_run_id is not null;

alter table public.rating_recalculation_runs
add constraint rating_recalculation_runs_earliest_ledger_sequence_fkey
foreign key (earliest_ledger_sequence)
references public.event_rating_ledger(sequence)
on delete restrict;

create table public.event_rating_jobs (
  id uuid primary key default gen_random_uuid(),
  queue_sequence bigint generated always as identity unique,
  event_id uuid not null references public.events(id) on delete restrict,
  recalculation_run_id uuid references public.rating_recalculation_runs(id) on delete restrict,
  job_kind text not null default 'initial'
    check (job_kind in ('initial', 'recalculation')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retryable', 'applied', 'skipped', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  lock_token uuid,
  worker_id text,
  locked_at timestamptz,
  last_attempt_started_at timestamptz,
  last_attempt_finished_at timestamptz,
  completed_at timestamptz,
  latest_ledger_sequence bigint unique
    references public.event_rating_ledger(sequence) on delete restrict,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_rating_jobs_kind_consistent check (
    (job_kind = 'initial' and recalculation_run_id is null)
    or
    (job_kind = 'recalculation' and recalculation_run_id is not null)
  ),
  constraint event_rating_jobs_lock_consistent check (
    (lock_token is null and worker_id is null and locked_at is null)
    or
    (lock_token is not null
      and worker_id is not null
      and btrim(worker_id) <> ''
      and locked_at is not null)
  ),
  constraint event_rating_jobs_processing_lock check (
    status <> 'processing'
    or (lock_token is not null and locked_at is not null)
  ),
  constraint event_rating_jobs_attempt_time_consistent check (
    last_attempt_finished_at is null
    or (
      last_attempt_started_at is not null
      and last_attempt_finished_at >= last_attempt_started_at
    )
  ),
  constraint event_rating_jobs_completion_consistent check (
    (status in ('applied', 'skipped')
      and completed_at is not null
      and latest_ledger_sequence is not null
      and last_error_message is null)
    or
    (status not in ('applied', 'skipped') and completed_at is null)
  ),
  constraint event_rating_jobs_error_consistent check (
    (status in ('retryable', 'failed') and last_error_message is not null)
    or
    (status not in ('retryable', 'failed'))
  )
);

create unique index event_rating_jobs_initial_event_unique
on public.event_rating_jobs(event_id)
where recalculation_run_id is null;

create unique index event_rating_jobs_recalculation_event_unique
on public.event_rating_jobs(recalculation_run_id, event_id)
where recalculation_run_id is not null;

create index event_rating_jobs_claimable_idx
on public.event_rating_jobs(next_attempt_at, queue_sequence)
where status in ('pending', 'retryable');

create index event_rating_jobs_stale_lock_idx
on public.event_rating_jobs(locked_at)
where status = 'processing';

create trigger event_rating_jobs_set_updated_at
before update on public.event_rating_jobs
for each row execute function app_private.set_updated_at();

create function app_private.validate_event_rating_ledger_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_rating_era text;
begin
  select rating_era
  into v_rating_era
  from public.events
  where id = new.event_id;

  if v_rating_era is distinct from 'automated' then
    raise exception 'Legacy events cannot enter the automated rating ledger.';
  end if;

  return new;
end;
$$;

create trigger event_rating_ledger_validate_insert
before insert on public.event_rating_ledger
for each row execute function app_private.validate_event_rating_ledger_insert();

create function app_private.protect_event_rating_ledger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Event rating ledger entries are append-only.';
end;
$$;

create trigger event_rating_ledger_protect_history
before update or delete on public.event_rating_ledger
for each row execute function app_private.protect_event_rating_ledger();

alter table public.rating_profiles enable row level security;
alter table public.rating_recalculation_runs enable row level security;
alter table public.event_rating_ledger enable row level security;
alter table public.event_rating_jobs enable row level security;

revoke all on table public.rating_profiles from anon, authenticated;
revoke all on table public.rating_recalculation_runs from anon, authenticated;
revoke all on table public.event_rating_ledger from anon, authenticated;
revoke all on table public.event_rating_jobs from anon, authenticated;
revoke all on sequence public.event_rating_ledger_sequence_seq from anon, authenticated;
revoke all on sequence public.event_rating_jobs_queue_sequence_seq from anon, authenticated;

grant all on table public.rating_profiles to service_role;
grant all on table public.rating_recalculation_runs to service_role;
grant all on table public.event_rating_ledger to service_role;
grant all on table public.event_rating_jobs to service_role;
grant all on sequence public.event_rating_ledger_sequence_seq to service_role;
grant all on sequence public.event_rating_jobs_queue_sequence_seq to service_role;

create policy "Deny direct client access"
on public.rating_profiles
for all
to anon, authenticated
using (false)
with check (false);

create policy "Deny direct client access"
on public.rating_recalculation_runs
for all
to anon, authenticated
using (false)
with check (false);

create policy "Deny direct client access"
on public.event_rating_ledger
for all
to anon, authenticated
using (false)
with check (false);

create policy "Deny direct client access"
on public.event_rating_jobs
for all
to anon, authenticated
using (false)
with check (false);

comment on table public.rating_profiles is
  'Global account-keyed automated rating state. Legacy manual player ratings are never imported.';
comment on table public.event_rating_ledger is
  'Immutable, database-ordered rating calculation attempts and audit facts.';
comment on table public.event_rating_jobs is
  'Mutable server-only queue and bounded retry state; immutable outcomes are written to the ledger.';
comment on column public.events.rating_era is
  'Legacy marks pre-cutover history; automated marks events eligible for the new rating pipeline.';
