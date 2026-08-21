import "server-only";

import {
  getInitialRatingFromQuestionnaire,
  QUESTIONNAIRE_ANSWER_SCORES,
  type RatingQuestionnaireAnswers,
} from "@/domain/ratings/questionnaire";
import { RATING_ENGINE_ID } from "@/domain/ratings/openskill-bradley-terry-full-v1";
import type { Database } from "@/types/database";

export type RatingProfileRow = Pick<
  Database["public"]["Tables"]["rating_profiles"]["Row"],
  | "app_user_id"
  | "onboarding_status"
  | "padel_experience_answer"
  | "racket_sport_answer"
  | "current_ability_answer"
  | "initial_displayed_level"
  | "first_official_rated_at"
  | "rated_match_count"
  | "is_provisional"
>;

export type RatingProfileWrite = Omit<
  Database["public"]["Tables"]["rating_profiles"]["Insert"],
  "questionnaire_score"
>;

export type RatingProfileStore = Readonly<{
  read: (appUserId: string) => Promise<RatingProfileRow | null>;
  upsert: (profile: RatingProfileWrite) => Promise<RatingProfileRow>;
}>;

export type PersistRatingQuestionnaireResult =
  | Readonly<{ ok: true; profile: RatingProfileRow }>
  | Readonly<{ ok: false; reason: "locked" | "persistence"; message: string }>;

export async function persistRatingQuestionnaire({
  answers,
  appUserId,
  now = new Date(),
  store,
}: {
  answers: RatingQuestionnaireAnswers;
  appUserId: string;
  now?: Date;
  store: RatingProfileStore;
}): Promise<PersistRatingQuestionnaireResult> {
  const existing = await store.read(appUserId);
  if (
    existing &&
    (existing.rated_match_count > 0 || existing.first_official_rated_at)
  ) {
    return {
      ok: false,
      reason: "locked",
      message:
        "Your questionnaire is locked because an Official rated match has already been recorded.",
    };
  }

  const calculated = getInitialRatingFromQuestionnaire(answers);
  if (!calculated.ok) {
    return {
      ok: false,
      reason: "persistence",
      message: "Choose one answer for every question.",
    };
  }

  const rating = calculated.value;
  try {
    const profile = await store.upsert({
      app_user_id: appUserId,
      onboarding_status: "completed",
      padel_experience_answer: answers.padelHistory,
      padel_experience_score:
        QUESTIONNAIRE_ANSWER_SCORES.padelHistory[answers.padelHistory],
      racket_sport_answer: answers.racketSportBackground,
      racket_sport_score:
        QUESTIONNAIRE_ANSWER_SCORES.racketSportBackground[
          answers.racketSportBackground
        ],
      current_ability_answer: answers.currentPadelAbility,
      current_ability_score:
        QUESTIONNAIRE_ANSWER_SCORES.currentPadelAbility[
          answers.currentPadelAbility
        ],
      initial_mu: rating.mu,
      initial_sigma: rating.sigma,
      initial_displayed_level: rating.displayLevel,
      initial_engine_version: RATING_ENGINE_ID,
      mu: rating.mu,
      sigma: rating.sigma,
      is_provisional: true,
      engine_version: RATING_ENGINE_ID,
      questionnaire_completed_at: now.toISOString(),
    });

    return { ok: true, profile };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("questionnaire baseline is locked")) {
      return {
        ok: false,
        reason: "locked",
        message:
          "Your questionnaire was locked when your first Official rated match was recorded.",
      };
    }
    return {
      ok: false,
      reason: "persistence",
      message:
        "We could not save your answers. They are still here so you can retry.",
    };
  }
}
