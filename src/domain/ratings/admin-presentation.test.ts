import { describe, expect, it } from "vitest";

import {
  safeRatingAdminError,
  selectAdminRatingPresentation,
  type RatingJobAdminFacts,
} from "@/domain/ratings/admin-presentation";

const baseJob: RatingJobAdminFacts = {
  id: "job-1",
  kind: "initial",
  status: "pending",
  locked: false,
  recalculationRunFailed: false,
  recalculationRunLocked: false,
  errorCode: null,
};

function select(job: RatingJobAdminFacts | null) {
  return selectAdminRatingPresentation({
    eventStatus: "completed",
    competitionMode: "official",
    ratingEra: "automated",
    job,
    audit: null,
  });
}

describe("admin rating presentation", () => {
  it.each([
    ["pending", "pending"],
    ["retryable", "pending"],
    ["processing", "processing"],
    ["applied", "applied"],
    ["skipped", "not_applicable"],
    ["failed", "failed"],
  ] as const)("maps an initial %s job to %s", (rawStatus, expected) => {
    expect(select({ ...baseJob, status: rawStatus }).status).toBe(expected);
  });

  it.each([
    ["pending", "recalculating"],
    ["retryable", "recalculating"],
    ["processing", "recalculating"],
    ["applied", "applied"],
    ["skipped", "applied"],
    ["failed", "failed"],
  ] as const)("maps a replay %s job to %s", (rawStatus, expected) => {
    expect(
      select({ ...baseJob, kind: "recalculation", status: rawStatus }).status,
    ).toBe(expected);
  });

  it("keeps Practice, legacy, and cancelled events not applicable", () => {
    for (const input of [
      {
        competitionMode: "practice" as const,
        ratingEra: "automated" as const,
        eventStatus: "completed",
      },
      {
        competitionMode: "legacy" as const,
        ratingEra: "legacy" as const,
        eventStatus: "completed",
      },
      {
        competitionMode: "official" as const,
        ratingEra: "automated" as const,
        eventStatus: "cancelled",
      },
    ]) {
      expect(
        selectAdminRatingPresentation({ ...input, job: baseJob, audit: null })
          .status,
      ).toBe("not_applicable");
    }
  });

  it("describes a completed Official event awaiting its durable queue row as pending", () => {
    expect(select(null).status).toBe("pending");
    expect(
      selectAdminRatingPresentation({
        eventStatus: "live",
        competitionMode: "official",
        ratingEra: "automated",
        job: null,
        audit: null,
      }).status,
    ).toBe("not_applicable");
  });

  it("only offers manual retry for an unlocked terminal failure", () => {
    expect(select({ ...baseJob, status: "failed" }).canRetry).toBe(true);
    expect(
      select({ ...baseJob, status: "failed", locked: true }).canRetry,
    ).toBe(false);
    expect(select({ ...baseJob, status: "retryable" }).canRetry).toBe(false);
    expect(
      select({
        ...baseJob,
        kind: "recalculation",
        status: "failed",
        recalculationRunFailed: true,
      }).canRetry,
    ).toBe(true);
    expect(
      select({
        ...baseJob,
        kind: "recalculation",
        status: "failed",
        recalculationRunFailed: false,
      }).canRetry,
    ).toBe(false);
  });

  it.each(["pending", "processing", "retryable", "failed"] as const)(
    "blocks exclusion conflicts while initial work is %s",
    (status) => {
      expect(select({ ...baseJob, status }).blocksEligibilityChange).toBe(true);
    },
  );

  it("blocks replay conflicts and refreshes only nonterminal work", () => {
    const replay = { ...baseJob, kind: "recalculation" as const };
    expect(select(replay).blocksEligibilityChange).toBe(true);
    expect(select(replay).refreshesUntilSettled).toBe(true);
    expect(select({ ...replay, status: "failed" }).refreshesUntilSettled).toBe(
      false,
    );
    expect(
      select({ ...replay, status: "applied" }).blocksEligibilityChange,
    ).toBe(false);
  });

  it("guards an event while another global replay is unfinished", () => {
    const presentation = selectAdminRatingPresentation({
      eventStatus: "completed",
      competitionMode: "official",
      ratingEra: "automated",
      job: { ...baseJob, status: "applied" },
      audit: null,
      hasGlobalRatingConflict: true,
      hasGlobalUnsettledWork: true,
    });
    expect(presentation.status).toBe("applied");
    expect(presentation.blocksEligibilityChange).toBe(true);
    expect(presentation.actionGuardCopy).toContain("queued rating work");
    expect(presentation.refreshesUntilSettled).toBe(true);
  });

  it("renders only stable safe error summaries", () => {
    expect(safeRatingAdminError("rating_worker_stale_lock")).toContain(
      "worker stopped",
    );
    expect(safeRatingAdminError("postgres://secret@host/player-name")).toBe(
      "Rating processing did not finish. The saved scores were not changed.",
    );
    expect(safeRatingAdminError(null)).toBeNull();
  });

  it("previews both standings and ratings from the database sequence", () => {
    const presentation = selectAdminRatingPresentation({
      eventStatus: "completed",
      competitionMode: "official",
      ratingEra: "automated",
      job: { ...baseJob, status: "applied" },
      audit: {
        trigger: "exclusion",
        actor: "Club Admin",
        occurredAt: "2026-07-22T12:00:00.000Z",
        sequenceFrom: 41,
        sequenceTo: 57,
        engineVersion: "openskill-bradley-terry-full-v1",
      },
    });
    expect(presentation.impactPreview).toContain(
      "Standings and ratings from database sequence 41 onward",
    );
    expect(presentation.audit?.actor).toBe("Club Admin");
  });
});
