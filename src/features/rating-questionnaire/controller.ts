import type {
  QuestionnaireField,
  RatingQuestionnaireAnswers,
} from "@/domain/ratings/questionnaire";

export const QUESTIONNAIRE_FIELDS = [
  "padelHistory",
  "racketSportBackground",
  "currentPadelAbility",
] as const satisfies readonly QuestionnaireField[];

export type QuestionnaireDraft = Partial<RatingQuestionnaireAnswers>;

export type QuestionnaireControllerState = Readonly<{
  step: number;
  answers: QuestionnaireDraft;
  validationMessage: string | null;
}>;

export type QuestionnaireControllerAction =
  | Readonly<{
      type: "answer";
      field: QuestionnaireField;
      value: RatingQuestionnaireAnswers[QuestionnaireField];
    }>
  | Readonly<{ type: "next" }>
  | Readonly<{ type: "back" }>;

export const createQuestionnaireControllerState = (
  answers: QuestionnaireDraft = {},
  startAtResult = false,
): QuestionnaireControllerState => ({
  step: startAtResult && isQuestionnaireComplete(answers) ? 3 : 0,
  answers,
  validationMessage: null,
});

export const isQuestionnaireComplete = (
  answers: QuestionnaireDraft,
): answers is RatingQuestionnaireAnswers =>
  QUESTIONNAIRE_FIELDS.every((field) => Boolean(answers[field]));

export function questionnaireControllerReducer(
  state: QuestionnaireControllerState,
  action: QuestionnaireControllerAction,
): QuestionnaireControllerState {
  if (action.type === "answer") {
    return {
      ...state,
      answers: { ...state.answers, [action.field]: action.value },
      validationMessage: null,
    };
  }

  if (action.type === "back") {
    return {
      ...state,
      step: Math.max(0, state.step - 1),
      validationMessage: null,
    };
  }

  if (state.step >= QUESTIONNAIRE_FIELDS.length) return state;
  const field = QUESTIONNAIRE_FIELDS[state.step];
  if (!state.answers[field]) {
    return {
      ...state,
      validationMessage: "Choose the answer that fits you best.",
    };
  }

  return {
    ...state,
    step: Math.min(QUESTIONNAIRE_FIELDS.length, state.step + 1),
    validationMessage: null,
  };
}
