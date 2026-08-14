import { describe, expect, it, vi } from "vitest";

import {
  getInitialRatingFromQuestionnaire,
  QUESTIONNAIRE_ANSWER_IDS,
  QUESTIONNAIRE_ANSWER_SCORES,
  type RatingQuestionnaireAnswers,
} from "@/domain/ratings/questionnaire";
import { RATING_ENGINE_ID } from "@/domain/ratings/openskill-bradley-terry-full-v1";
import {
  persistRatingQuestionnaire,
  type RatingProfileRow,
  type RatingProfileStore,
  type RatingProfileWrite,
} from "@/lib/rating-questionnaire-persistence";

const USER_ID = "00000000-0000-4000-8000-000000000126";

function profileFromWrite(write: RatingProfileWrite): RatingProfileRow {
  return {
    app_user_id: write.app_user_id,
    onboarding_status: write.onboarding_status ?? "not_started",
    padel_experience_answer: write.padel_experience_answer ?? null,
    racket_sport_answer: write.racket_sport_answer ?? null,
    current_ability_answer: write.current_ability_answer ?? null,
    initial_displayed_level: write.initial_displayed_level ?? null,
    rated_match_count: write.rated_match_count ?? 0,
    is_provisional: write.is_provisional ?? true,
  };
}

function memoryStore(initial: RatingProfileRow | null = null) {
  let row = initial;
  const upsert = vi.fn(async (write: RatingProfileWrite) => {
    row = profileFromWrite(write);
    return row;
  });
  const store: RatingProfileStore = {
    read: vi.fn(async () => row),
    upsert,
  };
  return { store, upsert, read: () => row };
}

describe("rating questionnaire persistence", () => {
  it("hands every questionnaire result to the expected stored rating", async () => {
    let combinations = 0;
    for (const padelHistory of QUESTIONNAIRE_ANSWER_IDS.padelHistory) {
      for (const racketSportBackground of QUESTIONNAIRE_ANSWER_IDS.racketSportBackground) {
        for (const currentPadelAbility of QUESTIONNAIRE_ANSWER_IDS.currentPadelAbility) {
          combinations += 1;
          const answers: RatingQuestionnaireAnswers = {
            padelHistory,
            racketSportBackground,
            currentPadelAbility,
          };
          const expected = getInitialRatingFromQuestionnaire(answers);
          expect(expected.ok).toBe(true);
          if (!expected.ok) throw new Error("Expected valid questionnaire");
          const { store, upsert } = memoryStore();

          const result = await persistRatingQuestionnaire({
            answers,
            appUserId: USER_ID,
            now: new Date("2026-07-22T12:00:00.000Z"),
            store,
          });

          expect(result.ok).toBe(true);
          expect(upsert).toHaveBeenCalledWith(
            expect.objectContaining({
              app_user_id: USER_ID,
              onboarding_status: "completed",
              padel_experience_answer: padelHistory,
              padel_experience_score:
                QUESTIONNAIRE_ANSWER_SCORES.padelHistory[padelHistory],
              racket_sport_answer: racketSportBackground,
              racket_sport_score:
                QUESTIONNAIRE_ANSWER_SCORES.racketSportBackground[
                  racketSportBackground
                ],
              current_ability_answer: currentPadelAbility,
              current_ability_score:
                QUESTIONNAIRE_ANSWER_SCORES.currentPadelAbility[
                  currentPadelAbility
                ],
              initial_displayed_level: expected.value.displayLevel,
              initial_mu: expected.value.mu,
              initial_sigma: expected.value.sigma,
              mu: expected.value.mu,
              sigma: expected.value.sigma,
              initial_engine_version: RATING_ENGINE_ID,
              engine_version: RATING_ENGINE_ID,
              is_provisional: true,
            }),
          );
        }
      }
    }
    expect(combinations).toBe(60);
  });

  it("is idempotent for a retry and retains one profile", async () => {
    const holder = memoryStore();
    const input = {
      answers: {
        padelHistory: "developing",
        racketSportBackground: "recreational",
        currentPadelAbility: "intermediate",
      } as const,
      appUserId: USER_ID,
      now: new Date("2026-07-22T12:00:00.000Z"),
      store: holder.store,
    };

    const first = await persistRatingQuestionnaire(input);
    const retry = await persistRatingQuestionnaire(input);

    expect(first.ok).toBe(true);
    expect(retry.ok).toBe(true);
    expect(holder.read()?.app_user_id).toBe(USER_ID);
    expect(holder.upsert).toHaveBeenCalledTimes(2);
  });

  it("allows edits before the first Official appearance", async () => {
    const holder = memoryStore({
      app_user_id: USER_ID,
      onboarding_status: "completed",
      padel_experience_answer: "none",
      racket_sport_answer: "none",
      current_ability_answer: "new",
      initial_displayed_level: 1,
      rated_match_count: 0,
      is_provisional: true,
    });

    const result = await persistRatingQuestionnaire({
      answers: {
        padelHistory: "experienced",
        racketSportBackground: "competitive",
        currentPadelAbility: "advanced",
      },
      appUserId: USER_ID,
      store: holder.store,
    });

    expect(result.ok).toBe(true);
    expect(holder.read()?.padel_experience_answer).toBe("experienced");
  });

  it("locks edits after the first Official appearance without writing", async () => {
    const holder = memoryStore({
      app_user_id: USER_ID,
      onboarding_status: "completed",
      padel_experience_answer: "limited",
      racket_sport_answer: "none",
      current_ability_answer: "beginner",
      initial_displayed_level: 2,
      rated_match_count: 1,
      is_provisional: true,
    });

    const result = await persistRatingQuestionnaire({
      answers: {
        padelHistory: "extensive",
        racketSportBackground: "competitive",
        currentPadelAbility: "advanced",
      },
      appUserId: USER_ID,
      store: holder.store,
    });

    expect(result).toMatchObject({ ok: false, reason: "locked" });
    expect(holder.upsert).not.toHaveBeenCalled();
  });

  it("turns a database race lock into retry-safe member copy", async () => {
    const store: RatingProfileStore = {
      read: vi.fn(async () => null),
      upsert: vi.fn(async () => {
        throw new Error(
          "The rating questionnaire baseline is locked after the first Official rated match.",
        );
      }),
    };

    const result = await persistRatingQuestionnaire({
      answers: {
        padelHistory: "none",
        racketSportBackground: "none",
        currentPadelAbility: "new",
      },
      appUserId: USER_ID,
      store,
    });

    expect(result).toMatchObject({ ok: false, reason: "locked" });
  });
});
