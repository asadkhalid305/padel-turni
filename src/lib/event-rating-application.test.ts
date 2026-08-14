import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));

import { processInitialEventRating } from "@/lib/event-rating-application";

function thenableQuery(result: { data: unknown[]; error: Error | null }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    single: vi.fn(async () => result),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return query;
}

describe("processInitialEventRating failure persistence", () => {
  it("persists safe compact copy instead of provider or database context", async () => {
    const privateError = new Error(
      "Bearer private-token https://database.invalid/select?secret=value",
    );
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const client = {
      rpc,
      from: vi.fn((table: string) =>
        thenableQuery({
          data: [],
          error: table === "events" ? privateError : null,
        }),
      ),
    };

    await expect(
      processInitialEventRating({
        client: client as never,
        eventId: "00000000-0000-4000-8000-000000000132",
      }),
    ).rejects.toBe(privateError);

    expect(rpc).toHaveBeenLastCalledWith(
      "fail_initial_event_rating_job",
      expect.objectContaining({
        p_error_code: "rating_processing_failed",
        p_error_message:
          "Rating processing failed. Retry the job or inspect server logs.",
      }),
    );
    expect(JSON.stringify(rpc.mock.lastCall)).not.toContain("private-token");
    expect(JSON.stringify(rpc.mock.lastCall)).not.toContain("database.invalid");
  });
});
