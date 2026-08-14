import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  save: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));
vi.mock("@/lib/rating-questionnaire", () => ({
  saveRatingQuestionnaireForCurrentUser: mocks.save,
}));

import { saveRatingQuestionnaire } from "@/app/rating/actions";

function validFormData() {
  const formData = new FormData();
  formData.set("padelHistory", "limited");
  formData.set("racketSportBackground", "recreational");
  formData.set("currentPadelAbility", "beginner");
  return formData;
}

describe("saveRatingQuestionnaire action", () => {
  beforeEach(() => {
    mocks.getAuthenticatedUser.mockReset();
    mocks.save.mockReset();
    mocks.revalidatePath.mockReset();
  });

  it("rejects invalid input before auth or persistence", async () => {
    const result = await saveRatingQuestionnaire(
      { ok: false, message: "" },
      new FormData(),
    );

    expect(result.ok).toBe(false);
    expect(mocks.getAuthenticatedUser).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("requires the submitting account and never accepts a user ID from input", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);
    const formData = validFormData();
    formData.set("appUserId", "00000000-0000-4000-8000-000000000999");

    const result = await saveRatingQuestionnaire(
      { ok: false, message: "" },
      formData,
    );

    expect(result).toEqual({
      ok: false,
      message: "Sign in to save your rating profile.",
    });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("persists for the authenticated account and revalidates onboarding", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "current-user" });
    mocks.save.mockResolvedValue({ ok: true, profile: {} });

    const result = await saveRatingQuestionnaire(
      { ok: false, message: "" },
      validFormData(),
    );

    expect(result.ok).toBe(true);
    expect(mocks.save).toHaveBeenCalledWith({
      appUserId: "current-user",
      answers: {
        padelHistory: "limited",
        racketSportBackground: "recreational",
        currentPadelAbility: "beginner",
      },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/rating");
  });

  it("returns persistence and lock failures for an in-place retry", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "current-user" });
    mocks.save.mockResolvedValue({
      ok: false,
      reason: "persistence",
      message:
        "We could not save your answers. They are still here so you can retry.",
    });

    const result = await saveRatingQuestionnaire(
      { ok: false, message: "" },
      validFormData(),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("retry");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
