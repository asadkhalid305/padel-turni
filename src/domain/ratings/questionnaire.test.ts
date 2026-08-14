import { describe, expect, it } from "vitest";

import { displayLevelToMu } from "./display-level";
import {
  canEditRatingQuestionnaire,
  getInitialRatingFromQuestionnaire,
  INITIAL_RATING_SIGMA,
  isProvisionalRating,
  PROVISIONAL_OFFICIAL_APPEARANCES,
  QUESTIONNAIRE_ANSWER_SCORES,
  type CurrentPadelAbilityAnswerId,
  type PadelHistoryAnswerId,
  type RacketSportBackgroundAnswerId,
  type RatingQuestionnaireAnswers,
} from "./questionnaire";

const padelHistoryAnswers = Object.entries(
  QUESTIONNAIRE_ANSWER_SCORES.padelHistory,
) as [PadelHistoryAnswerId, number][];
const racketSportBackgroundAnswers = Object.entries(
  QUESTIONNAIRE_ANSWER_SCORES.racketSportBackground,
) as [RacketSportBackgroundAnswerId, number][];
const currentPadelAbilityAnswers = Object.entries(
  QUESTIONNAIRE_ANSWER_SCORES.currentPadelAbility,
) as [CurrentPadelAbilityAnswerId, number][];

const allCombinations = padelHistoryAnswers.flatMap(
  ([padelHistory, padelHistoryScore]) =>
    racketSportBackgroundAnswers.flatMap(
      ([racketSportBackground, racketSportBackgroundScore]) =>
        currentPadelAbilityAnswers.map(
          ([currentPadelAbility, currentPadelAbilityScore]) => ({
            name: `${padelHistory} padel history + ${racketSportBackground} racket background + ${currentPadelAbility} current ability`,
            answers: {
              padelHistory,
              racketSportBackground,
              currentPadelAbility,
            } satisfies RatingQuestionnaireAnswers,
            onboardingScore:
              padelHistoryScore +
              racketSportBackgroundScore +
              currentPadelAbilityScore,
          }),
        ),
    ),
);

describe("cold-start rating questionnaire", () => {
  it("documents exactly 5 padel history, 3 racket background, and 4 current ability answers", () => {
    expect(padelHistoryAnswers).toHaveLength(5);
    expect(racketSportBackgroundAnswers).toHaveLength(3);
    expect(currentPadelAbilityAnswers).toHaveLength(4);
    expect(allCombinations).toHaveLength(60);
  });

  it.each(allCombinations)(
    "$name => onboarding score $onboardingScore",
    ({ answers, onboardingScore }) => {
      const result = getInitialRatingFromQuestionnaire(answers);
      const displayLevel = 1 + onboardingScore * 0.5;

      expect(result).toEqual({
        ok: true,
        value: {
          answers,
          onboardingScore,
          displayLevel,
          mu: displayLevelToMu(displayLevel),
          sigma: INITIAL_RATING_SIGMA,
          officialRatedAppearances: 0,
          provisional: true,
          provisionalAppearancesRemaining: PROVISIONAL_OFFICIAL_APPEARANCES,
          questionnaireEditable: true,
        },
      });
    },
  );

  it("makes every onboarding total from 0 through 9 reachable", () => {
    const totals = new Set(
      allCombinations.map(({ onboardingScore }) => onboardingScore),
    );

    expect([...totals].sort((left, right) => left - right)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it.each([
    {
      name: "a non-object submission",
      input: null,
      issues: [
        { field: "padelHistory", reason: "missing" },
        { field: "racketSportBackground", reason: "missing" },
        { field: "currentPadelAbility", reason: "missing" },
      ],
    },
    {
      name: "missing padel history",
      input: {
        racketSportBackground: "none",
        currentPadelAbility: "new",
      },
      issues: [{ field: "padelHistory", reason: "missing" }],
    },
    {
      name: "missing racket-sport background",
      input: { padelHistory: "none", currentPadelAbility: "new" },
      issues: [{ field: "racketSportBackground", reason: "missing" }],
    },
    {
      name: "missing current padel ability",
      input: { padelHistory: "none", racketSportBackground: "none" },
      issues: [{ field: "currentPadelAbility", reason: "missing" }],
    },
    {
      name: "an undefined answer",
      input: {
        padelHistory: undefined,
        racketSportBackground: "none",
        currentPadelAbility: "new",
      },
      issues: [{ field: "padelHistory", reason: "missing" }],
    },
    {
      name: "an unknown semantic answer ID",
      input: {
        padelHistory: "expert",
        racketSportBackground: "none",
        currentPadelAbility: "new",
      },
      issues: [{ field: "padelHistory", reason: "invalid" }],
    },
    {
      name: "an inherited object property instead of an answer ID",
      input: {
        padelHistory: "toString",
        racketSportBackground: "none",
        currentPadelAbility: "new",
      },
      issues: [{ field: "padelHistory", reason: "invalid" }],
    },
    {
      name: "numeric self-ratings instead of answer IDs",
      input: {
        padelHistory: 4,
        racketSportBackground: 2,
        currentPadelAbility: 3,
      },
      issues: [
        { field: "padelHistory", reason: "invalid" },
        { field: "racketSportBackground", reason: "invalid" },
        { field: "currentPadelAbility", reason: "invalid" },
      ],
    },
  ])("rejects $name", ({ input, issues }) => {
    expect(getInitialRatingFromQuestionnaire(input)).toEqual({
      ok: false,
      issues,
    });
  });

  it.each([
    { officialRatedAppearances: 0, provisional: true },
    { officialRatedAppearances: 1, provisional: true },
    { officialRatedAppearances: 5, provisional: true },
    { officialRatedAppearances: 6, provisional: false },
    { officialRatedAppearances: 7, provisional: false },
  ])(
    "marks $officialRatedAppearances official rated appearances as provisional=$provisional",
    ({ officialRatedAppearances, provisional }) => {
      expect(isProvisionalRating(officialRatedAppearances)).toBe(provisional);
    },
  );

  it("allows questionnaire correction only before the first official rated appearance", () => {
    expect(canEditRatingQuestionnaire(0)).toBe(true);
    expect(canEditRatingQuestionnaire(1)).toBe(false);
    expect(canEditRatingQuestionnaire(5)).toBe(false);
    expect(canEditRatingQuestionnaire(6)).toBe(false);
  });
});
