-- Supabase returns double precision values through JSON. Re-inserting a
-- snapshot must preserve the underlying rating while tolerating its harmless
-- decimal representation round trip.
create or replace function app_private.validate_automated_event_rating_snapshot()
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
  select event.rating_era into v_rating_era
  from public.events event where event.id = new.event_id;

  if v_rating_era <> 'automated' then return new; end if;

  select player.app_user_id,
    coalesce(nullif(btrim(app_user.display_name), ''), app_user.email),
    profile.onboarding_status, profile.mu, profile.sigma, profile.engine_version
  into v_app_user_id, v_account_name, v_onboarding_status, v_mu, v_sigma, v_engine_version
  from public.players player
  join public.app_users app_user on app_user.id = player.app_user_id
  left join public.rating_profiles profile on profile.app_user_id = player.app_user_id
  where player.id = new.player_id;

  if v_app_user_id is null or v_onboarding_status is distinct from 'completed'
    or v_mu is null or v_sigma is null or v_engine_version is null then
    raise exception 'A completed current account rating is required for an automated event snapshot.';
  end if;

  v_displayed_level := greatest(0.5::numeric, least(7.0::numeric,
    round((0.5 + 6.5 * v_mu / 50.0)::numeric, 1)));

  if new.app_user_id_snapshot is distinct from v_app_user_id
    or new.name_snapshot is distinct from v_account_name
    or abs(new.rating_mu_snapshot - v_mu) > 0.000000001
    or abs(new.rating_sigma_snapshot - v_sigma) > 0.000000001
    or new.displayed_level_snapshot is distinct from v_displayed_level
    or new.rating_snapshot is distinct from v_displayed_level
    or new.rating_engine_version_snapshot is distinct from v_engine_version then
    raise exception 'Event rating snapshots must match the selected account current profile.';
  end if;

  return new;
end;
$$;
