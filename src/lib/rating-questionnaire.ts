import "server-only";

import {
  QUESTIONNAIRE_ANSWER_IDS,
  type RatingQuestionnaireAnswers,
} from "@/domain/ratings/questionnaire";
import {
  persistRatingQuestionnaire,
  type RatingProfileRow,
  type RatingProfileStore,
} from "@/lib/rating-questionnaire-persistence";
import { createServerClient } from "@/lib/supabase/server";

const PROFILE_COLUMNS =
  "app_user_id,onboarding_status,padel_experience_answer,racket_sport_answer,current_ability_answer,initial_displayed_level,first_official_rated_at,rated_match_count,is_provisional";

export async function getRatingQuestionnaireProfile(
  appUserId: string,
): Promise<RatingProfileRow | null> {
  const client = createServerClient();
  if (!client) return null;

  const { data, error } = await client
    .from("rating_profiles")
    .select(PROFILE_COLUMNS)
    .eq("app_user_id", appUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveRatingQuestionnaireForCurrentUser({
  answers,
  appUserId,
}: {
  answers: RatingQuestionnaireAnswers;
  appUserId: string;
}) {
  const client = createServerClient();
  if (!client) {
    return {
      ok: false as const,
      reason: "persistence" as const,
      message: "Connect Supabase to save your rating profile.",
    };
  }

  const store: RatingProfileStore = {
    read: async (userId) => {
      const { data, error } = await client
        .from("rating_profiles")
        .select(PROFILE_COLUMNS)
        .eq("app_user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    upsert: async (profile) => {
      const { data, error } = await client
        .from("rating_profiles")
        .upsert(profile, { onConflict: "app_user_id" })
        .select(PROFILE_COLUMNS)
        .single();
      if (error) throw error;
      return data;
    },
  };

  return persistRatingQuestionnaire({
    answers,
    appUserId,
    store,
  });
}

export function answersFromRatingProfile(
  profile: RatingProfileRow | null,
): Partial<RatingQuestionnaireAnswers> {
  if (!profile) return {};

  return {
    ...(isPadelHistory(profile.padel_experience_answer)
      ? { padelHistory: profile.padel_experience_answer }
      : {}),
    ...(isRacketBackground(profile.racket_sport_answer)
      ? { racketSportBackground: profile.racket_sport_answer }
      : {}),
    ...(isCurrentAbility(profile.current_ability_answer)
      ? { currentPadelAbility: profile.current_ability_answer }
      : {}),
  };
}

function isPadelHistory(
  value: string | null,
): value is RatingQuestionnaireAnswers["padelHistory"] {
  return QUESTIONNAIRE_ANSWER_IDS.padelHistory.some(
    (answer) => answer === value,
  );
}

function isRacketBackground(
  value: string | null,
): value is RatingQuestionnaireAnswers["racketSportBackground"] {
  return QUESTIONNAIRE_ANSWER_IDS.racketSportBackground.some(
    (answer) => answer === value,
  );
}

function isCurrentAbility(
  value: string | null,
): value is RatingQuestionnaireAnswers["currentPadelAbility"] {
  return QUESTIONNAIRE_ANSWER_IDS.currentPadelAbility.some(
    (answer) => answer === value,
  );
}
