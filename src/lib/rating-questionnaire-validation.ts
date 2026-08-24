import { z } from "zod";

import { QUESTIONNAIRE_ANSWER_IDS } from "@/domain/ratings/questionnaire";

export const ratingQuestionnaireSchema = z.object({
  padelHistory: z.enum(QUESTIONNAIRE_ANSWER_IDS.padelHistory),
  racketSportBackground: z.enum(QUESTIONNAIRE_ANSWER_IDS.racketSportBackground),
  currentPadelAbility: z.enum(QUESTIONNAIRE_ANSWER_IDS.currentPadelAbility),
});

export type ValidatedRatingQuestionnaire = z.infer<
  typeof ratingQuestionnaireSchema
>;

export function parseRatingQuestionnaireFormData(formData: FormData) {
  return ratingQuestionnaireSchema.safeParse({
    padelHistory: formData.get("padelHistory"),
    racketSportBackground: formData.get("racketSportBackground"),
    currentPadelAbility: formData.get("currentPadelAbility"),
  });
}
