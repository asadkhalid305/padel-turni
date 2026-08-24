import { expect, test, type Page } from "@playwright/test";

import {
  completeRatingProfileFor,
  createLocalTestMember,
  createLocalTestUser,
  ratingProfileFor,
  signInAs,
  type LocalTestUser,
} from "./fixtures";

test.describe("automated ratings through event completion", () => {
  test("an Official result updates a calibrated member's provisional rating", async ({
    browser,
  }) => {
    const setup = await createRatingEventSetup();
    const adminContext = await browser.newContext();
    const memberContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const memberPage = await memberContext.newPage();

    try {
      await signInAs(memberContext, setup.member);
      await completeQuestionnaire(memberPage);
      const initialProfile = await ratingProfileFor(setup.member);

      await signInAs(adminContext, setup.admin);
      await createAndCompleteEvent({
        page: adminPage,
        members: setup.roster,
        mode: "official",
      });

      const updatedProfile = await ratingProfileFor(setup.member);
      expect(updatedProfile).toMatchObject({
        onboarding_status: "completed",
        rated_match_count: 1,
        is_provisional: true,
      });
      expect(updatedProfile.mu).not.toBe(initialProfile.mu);
      expect(updatedProfile.sigma).toBeLessThan(initialProfile.sigma);

      await memberPage.goto("/players");
      const memberRow = ratingMemberRow(memberPage, setup.member.displayName);
      await expect(
        memberRow.getByLabel("1 of 6 calibration matches"),
      ).toBeVisible();
      await expect(
        memberRow.getByLabel(`Level ${displayLevel(updatedProfile.mu)}`),
      ).toBeVisible();
    } finally {
      await adminContext.close();
      await memberContext.close();
    }
  });

  test("a Practice result leaves a calibrated member's rating unchanged", async ({
    browser,
  }) => {
    const setup = await createRatingEventSetup();
    const adminContext = await browser.newContext();
    const memberContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const memberPage = await memberContext.newPage();

    try {
      await signInAs(memberContext, setup.member);
      await completeQuestionnaire(memberPage);
      const initialProfile = await ratingProfileFor(setup.member);

      await signInAs(adminContext, setup.admin);
      await createAndCompleteEvent({
        page: adminPage,
        members: setup.roster,
        mode: "practice",
      });

      await expect
        .poll(() => ratingProfileFor(setup.member))
        .toMatchObject({
          mu: initialProfile.mu,
          sigma: initialProfile.sigma,
          rated_match_count: 0,
          is_provisional: true,
        });

      await memberPage.goto("/players");
      const memberRow = ratingMemberRow(memberPage, setup.member.displayName);
      await expect(
        memberRow.getByLabel("0 of 6 calibration matches"),
      ).toBeVisible();
      await expect(
        memberRow.getByLabel(`Level ${displayLevel(initialProfile.mu)}`),
      ).toBeVisible();
    } finally {
      await adminContext.close();
      await memberContext.close();
    }
  });
});

async function createRatingEventSetup() {
  const admin = await createLocalTestUser("E2E Ratings Admin");
  await completeRatingProfileFor(admin);
  const member = await createLocalTestMember({
    displayName: "E2E Ratings Member",
    workspaceId: admin.workspaceId,
  });
  const supportingMembers = await Promise.all(
    ["One", "Two", "Three"].map((suffix) =>
      createLocalTestMember({
        displayName: `E2E Ratings Supporting ${suffix}`,
        workspaceId: admin.workspaceId,
        completedProfile: true,
      }),
    ),
  );

  return {
    admin,
    member,
    supportingMembers,
    roster: [member, ...supportingMembers],
  };
}

async function completeQuestionnaire(page: Page) {
  await page.goto("/rating");
  await expect(
    page.getByRole("heading", { name: "Tell us how you play." }),
  ).toBeVisible();

  for (const field of [
    "padelHistory",
    "racketSportBackground",
    "currentPadelAbility",
  ]) {
    await page.locator(`input[name="${field}"]`).first().check();
    await page.getByRole("button", { name: "Continue" }).click();
  }

  await page.getByRole("button", { name: "Save my level" }).click();
  await expect(page.getByText("ready to join a roster")).toBeVisible();
}

async function createAndCompleteEvent({
  page,
  members,
  mode,
}: {
  page: Page;
  members: readonly LocalTestUser[];
  mode: "official" | "practice";
}) {
  await page.goto("/events/new");
  await page.getByLabel("Event name").fill(`E2E ${mode} rating event`);
  await page.getByLabel("Starts").fill(oneDayAgoLocal());
  await page.getByLabel("Number of courts").fill("1");
  await page.getByLabel("Minutes for each court").fill("20");

  if (mode === "practice") {
    await page.getByLabel(/Practice \/ social/).check();
  }
  for (const { displayName } of members) {
    await page
      .locator("label")
      .filter({ hasText: displayName })
      .getByRole("checkbox")
      .check();
  }

  await page.getByRole("button", { name: "Generate event" }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]+$/);
  await page.getByRole("link", { name: "Live" }).click();

  const scoreForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Complete match" }) })
    .first();
  await scoreForm.getByLabel("Team one score").fill("6");
  await scoreForm.getByLabel("Team two score").fill("2");
  await scoreForm.getByRole("button", { name: "Complete match" }).click();
  await expect(
    page.getByRole("button", { name: "Complete tournament" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Complete tournament" }).click();
  const dialog = page.getByRole("dialog", { name: "Complete tournament?" });
  await dialog.getByRole("button", { name: "Complete tournament" }).click();
  if (mode === "official") {
    await expect(page.getByText("Official ratings updated.")).toBeVisible();
  } else {
    await expect(page.getByRole("status")).toContainText(
      "Tournament completed. Every unfinished match was cancelled.",
    );
  }
}

function oneDayAgoLocal() {
  const date = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function displayLevel(mu: number | null) {
  if (mu === null) throw new Error("Expected a member rating.");
  return Math.min(
    7,
    Math.max(0.5, Math.round((0.5 + (6.5 * mu) / 50) * 10) / 10),
  );
}

function ratingMemberRow(page: Page, displayName: string) {
  return page
    .getByText(displayName, { exact: true })
    .locator("..")
    .locator("..")
    .locator("..");
}
