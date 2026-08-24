import { expect, test } from "@playwright/test";

import {
  createLocalTestMember,
  createLocalTestUser,
  deleteLocalTestUser,
  signInAs,
} from "./fixtures";

test("a member can view their club but cannot manage it or read another club", async ({
  context,
  page,
}) => {
  const owner = await createLocalTestUser("E2E Access Owner");
  const member = await createLocalTestMember({
    displayName: "E2E Access Member",
    workspaceId: owner.workspaceId,
    completedProfile: true,
  });

  try {
    await signInAs(context, member);

    await page.goto("/players");
    await expect(
      page.getByText("E2E Access Member", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Invite club members" }),
    ).toHaveCount(0);

    await page.goto("/events/new");
    await expect(page).toHaveURL(/\/events$/);

    await page.goto(
      "/events/93000000-0000-4000-8000-000000000001?view=standings",
    );
    await expect(page.getByText("404")).toBeVisible();
  } finally {
    await deleteLocalTestUser(member);
    await deleteLocalTestUser(owner);
  }
});
