import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const applicationMocks = vi.hoisted(() => ({
  processInitialEventRating: vi.fn(),
}));
const replayMocks = vi.hoisted(() => ({
  processNextRatingReplay: vi.fn(),
}));

vi.mock("@/lib/event-rating-application", () => ({
  processInitialEventRating: applicationMocks.processInitialEventRating,
}));
vi.mock("@/lib/rating-replay", () => ({
  processNextRatingReplay: replayMocks.processNextRatingReplay,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));

import { runRatingWorker, type DueRatingJob } from "@/lib/rating-worker";

function job(
  id: string,
  kind: "initial" | "recalculation" = "initial",
): DueRatingJob {
  return {
    id,
    event_id: `event-${id}`,
    job_kind: kind,
    recalculation_run_id: kind === "recalculation" ? `run-${id}` : null,
    attempt_count: 0,
    max_attempts: 5,
  };
}

function clientWithDueJobs(jobs: DueRatingJob[], recoveredStale = 0) {
  const remaining = [...jobs];
  const rpc = vi.fn(async (name: string) => {
    if (name === "recover_stale_event_rating_jobs") {
      return { data: recoveredStale, error: null };
    }
    if (name === "list_due_event_rating_jobs") {
      return { data: remaining.length ? [remaining.shift()] : [], error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  return { client: { rpc } as never, rpc };
}

describe("runRatingWorker", () => {
  beforeEach(() => {
    applicationMocks.processInitialEventRating.mockReset();
    replayMocks.processNextRatingReplay.mockReset();
  });

  it("recovers stale locks before selecting due work", async () => {
    const { client, rpc } = clientWithDueJobs([], 2);

    const result = await runRatingWorker({
      client,
      workerId: "cron-a",
      dependencies: { now: () => new Date("2026-07-22T12:10:00.000Z") },
    });

    expect(rpc.mock.calls[0]).toEqual([
      "recover_stale_event_rating_jobs",
      { p_stale_before: "2026-07-22T12:05:00.000Z" },
    ]);
    expect(result.recoveredStale).toBe(2);
  });

  it("processes initial jobs in order up to the bounded batch limit", async () => {
    const { client } = clientWithDueJobs([job("1"), job("2")]);
    applicationMocks.processInitialEventRating
      .mockResolvedValueOnce({ status: "applied", ledgerSequence: 1 })
      .mockResolvedValueOnce({
        status: "skipped",
        reason: "Practice event",
        ledgerSequence: 2,
      });

    const result = await runRatingWorker({
      client,
      workerId: "cron-a",
      limit: 2,
    });

    expect(applicationMocks.processInitialEventRating).toHaveBeenNthCalledWith(
      1,
      { client, eventId: "event-1", workerId: "cron-a" },
    );
    expect(applicationMocks.processInitialEventRating).toHaveBeenNthCalledWith(
      2,
      { client, eventId: "event-2", workerId: "cron-a" },
    );
    expect(result).toMatchObject({ applied: 1, skipped: 1 });
  });

  it("stops after overlapping workers contend for the same claim", async () => {
    const { client } = clientWithDueJobs([job("1"), job("2")]);
    applicationMocks.processInitialEventRating.mockResolvedValue({
      status: "not_claimed",
    });

    const result = await runRatingWorker({ client, workerId: "cron-b" });

    expect(applicationMocks.processInitialEventRating).toHaveBeenCalledTimes(1);
    expect(result.contended).toBe(1);
  });

  it("stops after a persisted failed attempt so later jobs cannot overtake it", async () => {
    const { client } = clientWithDueJobs([job("1"), job("2")]);
    applicationMocks.processInitialEventRating.mockRejectedValue(
      new Error("attempt persisted as retryable"),
    );

    const result = await runRatingWorker({ client, workerId: "cron-a" });

    expect(applicationMocks.processInitialEventRating).toHaveBeenCalledTimes(1);
    expect(result.failedAttempts).toBe(1);
  });

  it("dispatches replay work through the production exact-job adapter", async () => {
    const replayJob = job("1", "recalculation");
    const { client } = clientWithDueJobs([replayJob]);
    replayMocks.processNextRatingReplay.mockResolvedValue({
      status: "applied",
      runId: "run-1",
      finalHash: "a".repeat(64),
      ledgerSequence: 3,
    });

    const result = await runRatingWorker({ client, workerId: "cron-a" });

    expect(replayMocks.processNextRatingReplay).toHaveBeenCalledWith({
      client,
      jobId: replayJob.id,
      recalculationRunId: replayJob.recalculation_run_id,
      workerId: "cron-a",
    });
    expect(result.applied).toBe(1);
    expect(result.deferredRecalculations).toBe(0);
    expect(applicationMocks.processInitialEventRating).not.toHaveBeenCalled();
  });

  it("dispatches replay work through the typed ASA-131 integration seam", async () => {
    const replay = vi.fn().mockResolvedValue({
      status: "applied",
      ledgerSequence: 3,
    });
    const replayJob = job("1", "recalculation");
    const { client } = clientWithDueJobs([replayJob]);

    const result = await runRatingWorker({
      client,
      workerId: "cron-a",
      processRecalculation: replay,
    });

    expect(replay).toHaveBeenCalledWith({
      client,
      job: replayJob,
      workerId: "cron-a",
    });
    expect(result.applied).toBe(1);
  });
});
