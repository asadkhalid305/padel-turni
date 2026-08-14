import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  runRatingWorker: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/rating-worker", () => ({
  runRatingWorker: mocks.runRatingWorker,
}));

import { GET } from "@/app/api/cron/ratings/route";

function request(authorization?: string) {
  return new Request("https://padel-turni.example/api/cron/ratings", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("rating cron authentication", () => {
  beforeEach(() => {
    mocks.createServerClient.mockReset();
    mocks.runRatingWorker.mockReset();
    process.env.CRON_SECRET = "exact-cron-secret";
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it.each([
    ["a missing header", undefined],
    ["a wrong secret", "Bearer wrong"],
    ["a non-Bearer scheme", "Basic exact-cron-secret"],
    ["extra whitespace", "Bearer  exact-cron-secret"],
  ])(
    "rejects %s before creating a client or doing database work",
    async (_, auth) => {
      const response = await GET(request(auth));

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: "Unauthorized",
      });
      expect(mocks.createServerClient).not.toHaveBeenCalled();
      expect(mocks.runRatingWorker).not.toHaveBeenCalled();
    },
  );

  it("rejects every request when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(request("Bearer undefined"));

    expect(response.status).toBe(401);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("runs the worker only for the exact Bearer secret", async () => {
    const client = { rpc: vi.fn() };
    const result = {
      recoveredStale: 1,
      applied: 2,
      skipped: 0,
      failedAttempts: 0,
      contended: 0,
      deferredRecalculations: 0,
    };
    mocks.createServerClient.mockReturnValue(client);
    mocks.runRatingWorker.mockResolvedValue(result);

    const response = await GET(request("Bearer exact-cron-secret"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, ...result });
    expect(mocks.runRatingWorker).toHaveBeenCalledWith({ client });
  });

  it("returns only compact safe copy when worker execution fails", async () => {
    mocks.createServerClient.mockReturnValue({ rpc: vi.fn() });
    mocks.runRatingWorker.mockRejectedValue(
      new Error("database URL and private token"),
    );

    const response = await GET(request("Bearer exact-cron-secret"));

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain("Rating worker failed");
    expect(body).not.toContain("private token");
  });
});
