import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getEventRatingAdminDiagnostics } from "@/lib/rating-admin";

describe("rating admin diagnostics authorization", () => {
  it("does not access persistence for a normal workspace member", async () => {
    const from = vi.fn();

    await expect(
      getEventRatingAdminDiagnostics({
        eventId: "event-1",
        workspaceId: "workspace-1",
        isWorkspaceAdmin: false,
        client: { from } as never,
      }),
    ).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});
