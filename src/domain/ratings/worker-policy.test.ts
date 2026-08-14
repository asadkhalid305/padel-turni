import { describe, expect, it } from "vitest";

import {
  ExpectedRatingWorkerError,
  ratingJobFailureTransition,
  ratingJobRetryDelaySeconds,
  ratingJobStaleBefore,
  serializeRatingWorkerError,
} from "@/domain/ratings/worker-policy";

describe("rating worker retry policy", () => {
  it("uses bounded exponential backoff from one minute to one hour", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(ratingJobRetryDelaySeconds)).toEqual([
      60, 120, 240, 480, 960, 1_920, 3_600, 3_600,
    ]);
  });

  it("keeps a failed attempt retryable until the configured limit", () => {
    expect(
      ratingJobFailureTransition({ attemptCount: 4, maxAttempts: 5 }),
    ).toEqual({ status: "retryable", retryAfterSeconds: 480 });
    expect(
      ratingJobFailureTransition({ attemptCount: 5, maxAttempts: 5 }),
    ).toEqual({ status: "failed", retryAfterSeconds: null });
  });

  it("uses a five-minute stale-lock cutoff", () => {
    expect(ratingJobStaleBefore(new Date("2026-07-22T12:10:00.000Z"))).toBe(
      "2026-07-22T12:05:00.000Z",
    );
  });
});

describe("rating worker error serialization", () => {
  it("does not persist unexpected secrets, URLs, SQL, or stacks", () => {
    const error = new Error(
      "Bearer secret-token at https://database.invalid/?key=private SQL select *",
    );
    error.stack = "private stack";

    const serialized = serializeRatingWorkerError(error);

    expect(serialized).toEqual({
      code: "rating_processing_failed",
      message:
        "Rating processing failed. Retry the job or inspect server logs.",
    });
    expect(JSON.stringify(serialized)).not.toContain("secret-token");
    expect(JSON.stringify(serialized)).not.toContain("database.invalid");
    expect(JSON.stringify(serialized)).not.toContain("private stack");
  });

  it("keeps compact intentional operational errors", () => {
    const serialized = serializeRatingWorkerError(
      new ExpectedRatingWorkerError(
        "rating_profile_incompatible",
        "  A completed rating profile is required.\nRetry after repair.  ",
      ),
    );
    expect(serialized).toEqual({
      code: "rating_profile_incompatible",
      message: "A completed rating profile is required. Retry after repair.",
    });
  });
});
