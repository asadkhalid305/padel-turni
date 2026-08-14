import { displayLevelToMu } from "./display-level";

export const QUESTIONNAIRE_ANSWER_SCORES = {
  padelHistory: {
    none: 0,
    limited: 1,
    developing: 2,
    experienced: 3,
    extensive: 4,
  },
  racketSportBackground: {
    none: 0,
    recreational: 1,
    competitive: 2,
  },
  currentPadelAbility: {
    new: 0,
    beginner: 1,
    intermediate: 2,
    advanced: 3,
  },
} as const;

const answerIds = <TAnswers extends Readonly<Record<string, number>>>(
  answers: TAnswers,
): [keyof TAnswers & string, ...(keyof TAnswers & string)[]] =>
  Object.keys(answers) as [
    keyof TAnswers & string,
    ...(keyof TAnswers & string)[],
  ];

export const QUESTIONNAIRE_ANSWER_IDS = {
  padelHistory: answerIds(QUESTIONNAIRE_ANSWER_SCORES.padelHistory),
  racketSportBackground: answerIds(
    QUESTIONNAIRE_ANSWER_SCORES.racketSportBackground,
  ),
  currentPadelAbility: answerIds(
    QUESTIONNAIRE_ANSWER_SCORES.currentPadelAbility,
  ),
} as const;

export const INITIAL_RATING_SIGMA = 12.5;
export const PROVISIONAL_OFFICIAL_APPEARANCES = 6;

export type PadelHistoryAnswerId =
  keyof typeof QUESTIONNAIRE_ANSWER_SCORES.padelHistory;
export type RacketSportBackgroundAnswerId =
  keyof typeof QUESTIONNAIRE_ANSWER_SCORES.racketSportBackground;
export type CurrentPadelAbilityAnswerId =
  keyof typeof QUESTIONNAIRE_ANSWER_SCORES.currentPadelAbility;

export type RatingQuestionnaireAnswers = Readonly<{
  padelHistory: PadelHistoryAnswerId;
  racketSportBackground: RacketSportBackgroundAnswerId;
  currentPadelAbility: CurrentPadelAbilityAnswerId;
}>;

export type QuestionnaireField = keyof RatingQuestionnaireAnswers;

export type QuestionnaireValidationIssue = Readonly<{
  field: QuestionnaireField;
  reason: "missing" | "invalid";
}>;

export type InitialRatingFromQuestionnaire = Readonly<{
  answers: RatingQuestionnaireAnswers;
  onboardingScore: number;
  displayLevel: number;
  mu: number;
  sigma: typeof INITIAL_RATING_SIGMA;
  officialRatedAppearances: 0;
  provisional: true;
  provisionalAppearancesRemaining: typeof PROVISIONAL_OFFICIAL_APPEARANCES;
  questionnaireEditable: true;
}>;

export type QuestionnaireRatingResult =
  | Readonly<{ ok: true; value: InitialRatingFromQuestionnaire }>
  | Readonly<{
      ok: false;
      issues: readonly QuestionnaireValidationIssue[];
    }>;

const QUESTIONNAIRE_FIELDS = [
  "padelHistory",
  "racketSportBackground",
  "currentPadelAbility",
] as const satisfies readonly QuestionnaireField[];

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasAnswer = <TAnswer extends string>(
  scores: Readonly<Record<TAnswer, number>>,
  value: unknown,
): value is TAnswer =>
  typeof value === "string" && Object.hasOwn(scores, value);

const validateQuestionnaireAnswers = (
  input: unknown,
):
  | Readonly<{ ok: true; answers: RatingQuestionnaireAnswers }>
  | Readonly<{
      ok: false;
      issues: readonly QuestionnaireValidationIssue[];
    }> => {
  const record = isRecord(input) ? input : {};
  const issues: QuestionnaireValidationIssue[] = [];

  for (const field of QUESTIONNAIRE_FIELDS) {
    if (!(field in record) || record[field] === undefined) {
      issues.push({ field, reason: "missing" });
    }
  }

  if (
    "padelHistory" in record &&
    record.padelHistory !== undefined &&
    !hasAnswer(QUESTIONNAIRE_ANSWER_SCORES.padelHistory, record.padelHistory)
  ) {
    issues.push({ field: "padelHistory", reason: "invalid" });
  }

  if (
    "racketSportBackground" in record &&
    record.racketSportBackground !== undefined &&
    !hasAnswer(
      QUESTIONNAIRE_ANSWER_SCORES.racketSportBackground,
      record.racketSportBackground,
    )
  ) {
    issues.push({ field: "racketSportBackground", reason: "invalid" });
  }

  if (
    "currentPadelAbility" in record &&
    record.currentPadelAbility !== undefined &&
    !hasAnswer(
      QUESTIONNAIRE_ANSWER_SCORES.currentPadelAbility,
      record.currentPadelAbility,
    )
  ) {
    issues.push({ field: "currentPadelAbility", reason: "invalid" });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    answers: {
      padelHistory: record.padelHistory as PadelHistoryAnswerId,
      racketSportBackground:
        record.racketSportBackground as RacketSportBackgroundAnswerId,
      currentPadelAbility:
        record.currentPadelAbility as CurrentPadelAbilityAnswerId,
    },
  };
};

export const getInitialRatingFromQuestionnaire = (
  input: unknown,
): QuestionnaireRatingResult => {
  const validation = validateQuestionnaireAnswers(input);

  if (!validation.ok) {
    return validation;
  }

  const { answers } = validation;
  const onboardingScore =
    QUESTIONNAIRE_ANSWER_SCORES.padelHistory[answers.padelHistory] +
    QUESTIONNAIRE_ANSWER_SCORES.racketSportBackground[
      answers.racketSportBackground
    ] +
    QUESTIONNAIRE_ANSWER_SCORES.currentPadelAbility[
      answers.currentPadelAbility
    ];
  const displayLevel = 1 + onboardingScore * 0.5;

  return {
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
  };
};

export const isProvisionalRating = (
  officialRatedAppearances: number,
): boolean =>
  Number.isInteger(officialRatedAppearances) &&
  officialRatedAppearances >= 0 &&
  officialRatedAppearances < PROVISIONAL_OFFICIAL_APPEARANCES;

export const canEditRatingQuestionnaire = (
  officialRatedAppearances: number,
): boolean => officialRatedAppearances === 0;
