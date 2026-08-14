"use server";

import { revalidatePath } from "next/cache";

import { saveRatingQuestionnaireForCurrentUser } from "@/lib/rating-questionnaire";
import { parseRatingQuestionnaireFormData } from "@/lib/rating-questionnaire-validation";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export type RatingQuestionnaireActionState = Readonly<{
  ok: boolean;
  message: string;
}>;

export async function saveRatingQuestionnaire(
  _previous: RatingQuestionnaireActionState,
  formData: FormData,
): Promise<RatingQuestionnaireActionState> {
  const parsed = parseRatingQuestionnaireFormData(formData);
  if (!parsed.success) {
    return { ok: false, message: "Choose one answer for every question." };
  }

  const user = await getAuthenticatedUser();
  if (!user) {
    return { ok: false, message: "Sign in to save your rating profile." };
  }

  const result = await saveRatingQuestionnaireForCurrentUser({
    answers: parsed.data,
    appUserId: user.id,
  });
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath("/");
  revalidatePath("/rating");
  return {
    ok: true,
    message: "Your provisional level is saved. You are ready to join a roster.",
  };
}
