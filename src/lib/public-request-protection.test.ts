import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headerMocks = vi.hoisted(() => ({
  headers: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: headerMocks.headers,
}));

import {
  checkPublicRequestLimit,
  createPublicRequestKey,
  isLikelyAutomatedFeedback,
} from "@/lib/public-request-protection";

describe("public request protection", () => {
  const originalSecret = process.env.SUPABASE_SECRET_KEY;

  beforeEach(() => {
    process.env.SUPABASE_SECRET_KEY = "test-secret-key";
    headerMocks.headers.mockReset();
    headerMocks.headers.mockResolvedValue({
      get: vi.fn((name: string) =>
        name === "x-vercel-forwarded-for" ? "203.0.113.42" : null,
      ),
    });
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.SUPABASE_SECRET_KEY;
    } else {
      process.env.SUPABASE_SECRET_KEY = originalSecret;
    }
  });

  it("hashes the client address without retaining the raw IP", async () => {
    const keyHash = await createPublicRequestKey("feedback");

    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(keyHash).not.toContain("203.0.113.42");
    await expect(createPublicRequestKey("feedback")).resolves.toBe(keyHash);
  });

  it("fails closed when the shared limiter is unavailable", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: new Error("database unavailable"),
    });

    await expect(
      checkPublicRequestLimit({
        client: { rpc } as never,
        scope: "feedback",
        windowSeconds: 3600,
        maxRequests: 3,
      }),
    ).resolves.toBe(false);
  });

  it("returns the atomic limiter decision", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });

    await expect(
      checkPublicRequestLimit({
        client: { rpc } as never,
        scope: "landing_view",
        keyHash: "a".repeat(64),
        windowSeconds: 3600,
        maxRequests: 1,
      }),
    ).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("consume_public_request_limit", {
      p_scope: "landing_view",
      p_key_hash: "a".repeat(64),
      p_window_seconds: 3600,
      p_max_requests: 1,
    });
  });

  it("rejects honeypots and implausibly fast submissions", () => {
    expect(
      isLikelyAutomatedFeedback({
        honeypot: "bot company",
        startedAt: String(Date.now() - 10_000),
      }),
    ).toBe(true);
    expect(
      isLikelyAutomatedFeedback({
        honeypot: "",
        startedAt: "1720000000000",
        now: 1720000001000,
      }),
    ).toBe(true);
    expect(
      isLikelyAutomatedFeedback({
        honeypot: "",
        startedAt: "1720000000000",
        now: 1720000005000,
      }),
    ).toBe(false);
  });
});
