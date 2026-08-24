import { describe, expect, it } from "vitest";

import {
  createQuestionnaireControllerState,
  isQuestionnaireComplete,
  questionnaireControllerReducer,
} from "@/features/rating-questionnaire/controller";

describe("rating questionnaire controller", () => {
  it("keeps the member on a question until they choose an answer", () => {
    const state = questionnaireControllerReducer(
      createQuestionnaireControllerState(),
      { type: "next" },
    );

    expect(state.step).toBe(0);
    expect(state.validationMessage).toBe(
      "Choose the answer that fits you best.",
    );
  });

  it("moves forward, backward, and clears validation after an answer", () => {
    const answered = questionnaireControllerReducer(
      createQuestionnaireControllerState(),
      { type: "answer", field: "padelHistory", value: "developing" },
    );
    const next = questionnaireControllerReducer(answered, { type: "next" });
    const back = questionnaireControllerReducer(next, { type: "back" });

    expect(next.step).toBe(1);
    expect(back.step).toBe(0);
    expect(back.answers.padelHistory).toBe("developing");
    expect(back.validationMessage).toBeNull();
  });

  it("resumes completed answers at the result and never advances past it", () => {
    const state = createQuestionnaireControllerState(
      {
        padelHistory: "experienced",
        racketSportBackground: "recreational",
        currentPadelAbility: "intermediate",
      },
      true,
    );

    expect(isQuestionnaireComplete(state.answers)).toBe(true);
    expect(state.step).toBe(3);
    expect(questionnaireControllerReducer(state, { type: "next" })).toBe(state);
  });

  it("does not treat a partial saved draft as complete", () => {
    const state = createQuestionnaireControllerState(
      { padelHistory: "limited" },
      true,
    );

    expect(state.step).toBe(0);
    expect(isQuestionnaireComplete(state.answers)).toBe(false);
  });
});
