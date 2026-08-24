import { expect, test } from "@playwright/test";

import {
  createLocalTestUser,
  deleteLocalTestUser,
  ratingProfileFor,
  signInAs,
} from "./fixtures";

test("a member can establish a provisional rating through the real questionnaire", async ({
  context,
  page,
}) => {
  const member = await createLocalTestUser("E2E Rating Member");

  try {
    await signInAs(context, member);
    await page.goto("/");
    await expect(page).toHaveURL(/\/rating$/);

    await expect(
      page.getByRole("heading", { name: "Tell us how you play." }),
    ).toBeVisible();
    await expect(page.locator("[data-padeltour-app-shell]")).toHaveCount(0);

    for (const field of [
      "padelHistory",
      "racketSportBackground",
      "currentPadelAbility",
    ]) {
      await page.locator(`input[name="${field}"]`).first().check();
      await page.getByRole("button", { name: "Continue" }).click();
    }

    await expect(
      page.getByRole("heading", { name: "Your starting level" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save my level" }).click();
    await expect(page.getByRole("status")).toContainText(
      "ready to join a roster",
    );

    await expect
      .poll(() => ratingProfileFor(member))
      .toMatchObject({
        onboarding_status: "completed",
        initial_displayed_level: 1,
        sigma: 12.5,
        rated_match_count: 0,
      });

    await page.goto("/");
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/players");
    await expect(
      page.getByText("E2E Rating Member", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Roster ready", { exact: true })).toBeVisible();
  } finally {
    await deleteLocalTestUser(member);
  }
});
