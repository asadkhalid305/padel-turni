import { describe, expect, it } from "vitest";

import {
  parseRatingQuestionnaireFormData,
  ratingQuestionnaireSchema,
} from "@/lib/rating-questionnaire-validation";

describe("rating questionnaire boundary validation", () => {
  it("accepts canonical answer IDs", () => {
    expect(
      ratingQuestionnaireSchema.parse({
        padelHistory: "extensive",
        racketSportBackground: "competitive",
        currentPadelAbility: "advanced",
      }),
    ).toEqual({
      padelHistory: "extensive",
      racketSportBackground: "competitive",
      currentPadelAbility: "advanced",
    });
  });

  it("rejects missing, numeric, and invented self-ratings", () => {
    expect(ratingQuestionnaireSchema.safeParse({}).success).toBe(false);
    expect(
      ratingQuestionnaireSchema.safeParse({
        padelHistory: 4,
        racketSportBackground: 2,
        currentPadelAbility: 3,
      }).success,
    ).toBe(false);
    expect(
      ratingQuestionnaireSchema.safeParse({
        padelHistory: "professional",
        racketSportBackground: "competitive",
        currentPadelAbility: "advanced",
      }).success,
    ).toBe(false);
  });

  it("reads only the three expected form fields", () => {
    const formData = new FormData();
    formData.set("padelHistory", "none");
    formData.set("racketSportBackground", "none");
    formData.set("currentPadelAbility", "new");
    formData.set("displayLevel", "7.0");

    expect(parseRatingQuestionnaireFormData(formData)).toMatchObject({
      success: true,
      data: {
        padelHistory: "none",
        racketSportBackground: "none",
        currentPadelAbility: "new",
      },
    });
  });
});
