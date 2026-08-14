import {
  QUESTIONNAIRE_ANSWER_IDS,
  type CurrentPadelAbilityAnswerId,
  type PadelHistoryAnswerId,
  type QuestionnaireField,
  type RacketSportBackgroundAnswerId,
  RatingQuestionnaireAnswers,
} from "@/domain/ratings/questionnaire";

const PADEL_HISTORY_COPY: Readonly<
  Record<
    PadelHistoryAnswerId,
    Omit<QuestionnaireOption<PadelHistoryAnswerId>, "value">
  >
> = {
  none: { title: "None yet", description: "I have not played padel before." },
  limited: {
    title: "A few times",
    description: "I know the basics from a handful of games or lessons.",
  },
  developing: {
    title: "Regular beginner",
    description: "I play occasionally and can keep a simple rally going.",
  },
  experienced: {
    title: "Experienced",
    description:
      "I play regularly and understand positioning, walls, and tactics.",
  },
  extensive: {
    title: "Extensive",
    description: "I have played frequently for years or competed seriously.",
  },
};

const RACKET_BACKGROUND_COPY: Readonly<
  Record<
    RacketSportBackgroundAnswerId,
    Omit<QuestionnaireOption<RacketSportBackgroundAnswerId>, "value">
  >
> = {
  none: {
    title: "No background",
    description: "I have not played another racket sport regularly.",
  },
  recreational: {
    title: "Recreational",
    description: "I have played another racket sport casually.",
  },
  competitive: {
    title: "Competitive",
    description: "I trained or competed regularly in another racket sport.",
  },
};

const CURRENT_ABILITY_COPY: Readonly<
  Record<
    CurrentPadelAbilityAnswerId,
    Omit<QuestionnaireOption<CurrentPadelAbilityAnswerId>, "value">
  >
> = {
  new: {
    title: "Still learning",
    description: "I am learning the rules, scoring, and basic strokes.",
  },
  beginner: {
    title: "Basic rallies",
    description: "I can serve, return, and sustain simple rallies.",
  },
  intermediate: {
    title: "Confident play",
    description: "I use the walls, move with my partner, and build points.",
  },
  advanced: {
    title: "Advanced play",
    description:
      "I control pace and positioning and use varied tactical shots.",
  },
};

type QuestionnaireOption<TValue extends string> = Readonly<{
  value: TValue;
  title: string;
  description: string;
}>;

export type QuestionnaireGroup<TField extends QuestionnaireField> = Readonly<{
  field: TField;
  eyebrow: string;
  title: string;
  description: string;
  options: readonly QuestionnaireOption<RatingQuestionnaireAnswers[TField]>[];
}>;

export const RATING_QUESTIONNAIRE_GROUPS = [
  {
    field: "padelHistory",
    eyebrow: "Question 1 of 3",
    title: "How much padel have you played?",
    description:
      "Choose the answer that best describes your actual playing history.",
    options: QUESTIONNAIRE_ANSWER_IDS.padelHistory.map((value) => ({
      value,
      ...PADEL_HISTORY_COPY[value],
    })),
  },
  {
    field: "racketSportBackground",
    eyebrow: "Question 2 of 3",
    title: "What is your racket-sport background?",
    description:
      "Think about tennis, squash, badminton, pickleball, or similar sports.",
    options: QUESTIONNAIRE_ANSWER_IDS.racketSportBackground.map((value) => ({
      value,
      ...RACKET_BACKGROUND_COPY[value],
    })),
  },
  {
    field: "currentPadelAbility",
    eyebrow: "Question 3 of 3",
    title: "What can you do on a padel court today?",
    description:
      "Pick the closest description. Your match results will refine the level later.",
    options: QUESTIONNAIRE_ANSWER_IDS.currentPadelAbility.map((value) => ({
      value,
      ...CURRENT_ABILITY_COPY[value],
    })),
  },
] as const satisfies readonly QuestionnaireGroup<QuestionnaireField>[];

export const QUESTIONNAIRE_RESULT_COPY = {
  title: "Your starting level is ready",
  description:
    "This provisional level helps create fair first matches. Your Official match results will take over and refine it as you play.",
  editable:
    "You can change these answers until your first Official rated match.",
  locked:
    "Your questionnaire is locked because you have played an Official rated match. Match results now control your level.",
} as const;
