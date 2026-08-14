"use client";

import { useReducer } from "react";

import {
  createQuestionnaireControllerState,
  questionnaireControllerReducer,
  type QuestionnaireDraft,
} from "@/features/rating-questionnaire/controller";

export function useRatingQuestionnaire(
  initialAnswers: QuestionnaireDraft,
  startAtResult: boolean,
) {
  return useReducer(
    questionnaireControllerReducer,
    { initialAnswers, startAtResult },
    ({ initialAnswers: answers, startAtResult: showResult }) =>
      createQuestionnaireControllerState(answers, showResult),
  );
}
