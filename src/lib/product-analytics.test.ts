import { beforeEach, describe, expect, it, vi } from "vitest";

const protectionMocks = vi.hoisted(() => ({
  checkPublicRequestLimit: vi.fn(),
}));

vi.mock("@/lib/public-request-protection", () => ({
  checkPublicRequestLimit: protectionMocks.checkPublicRequestLimit,
  LANDING_VIEW_WINDOW_SECONDS: 3600,
}));

import { recordAnonymousLandingView } from "@/lib/product-analytics";

describe("landing analytics", () => {
  beforeEach(() => {
    protectionMocks.checkPublicRequestLimit.mockReset();
  });

  it("deduplicates repeated anonymous views before inserting", async () => {
    protectionMocks.checkPublicRequestLimit.mockResolvedValue(false);
    const from = vi.fn();

    await recordAnonymousLandingView({ from } as never, "a".repeat(64));

    expect(from).not.toHaveBeenCalled();
  });

  it("ignores analytics write failures", async () => {
    protectionMocks.checkPublicRequestLimit.mockResolvedValue(true);
    const insert = vi.fn().mockRejectedValue(new Error("write failed"));
    const from = vi.fn(() => ({ insert }));

    await expect(
      recordAnonymousLandingView({ from } as never, "a".repeat(64)),
    ).resolves.toBeUndefined();
  });
});
