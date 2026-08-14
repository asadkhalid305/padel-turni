export type AdminRatingStatus =
  | "not_applicable"
  | "pending"
  | "processing"
  | "applied"
  | "recalculating"
  | "failed";

export type RatingJobAdminFacts = {
  id: string;
  kind: "initial" | "recalculation";
  status:
    | "pending"
    | "processing"
    | "retryable"
    | "applied"
    | "skipped"
    | "failed";
  locked: boolean;
  recalculationRunFailed: boolean;
  recalculationRunLocked: boolean;
  errorCode: string | null;
};

export type RatingAuditFacts = {
  trigger: "completion" | "correction" | "exclusion" | "reinstatement";
  actor: string | null;
  occurredAt: string;
  sequenceFrom: number | null;
  sequenceTo: number | null;
  engineVersion: string | null;
};

export type AdminRatingPresentation = {
  status: AdminRatingStatus;
  label: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "info" | "danger";
  refreshesUntilSettled: boolean;
  blocksEligibilityChange: boolean;
  actionGuardCopy: string | null;
  canRetry: boolean;
  safeError: string | null;
  audit: RatingAuditFacts | null;
  impactPreview: string;
};

const PRESENTATION: Record<
  AdminRatingStatus,
  Pick<AdminRatingPresentation, "label" | "detail" | "tone">
> = {
  not_applicable: {
    label: "Not applicable",
    detail: "This event does not change automated player ratings.",
    tone: "neutral",
  },
  pending: {
    label: "Pending",
    detail: "Rating work is queued and will run in database order.",
    tone: "info",
  },
  processing: {
    label: "Processing",
    detail: "Completed scores are saved. Player levels are updating now.",
    tone: "info",
  },
  applied: {
    label: "Applied",
    detail: "This event's rating result is recorded in the audit ledger.",
    tone: "success",
  },
  recalculating: {
    label: "Recalculating",
    detail:
      "An audited change is replaying ratings from the earliest affected result.",
    tone: "warning",
  },
  failed: {
    label: "Failed",
    detail:
      "Completed scores remain safe, but an admin must recover this rating work.",
    tone: "danger",
  },
};

export function safeRatingAdminError(errorCode: string | null): string | null {
  if (!errorCode) return null;
  if (errorCode === "rating_worker_stale_lock") {
    return "The worker stopped before finishing. The saved scores were not changed.";
  }
  return "Rating processing did not finish. The saved scores were not changed.";
}

function statusFor(input: {
  eventStatus: string;
  competitionMode: "official" | "practice" | "legacy";
  ratingEra: "automated" | "legacy";
  job: RatingJobAdminFacts | null;
}): AdminRatingStatus {
  if (
    input.competitionMode !== "official" ||
    input.ratingEra !== "automated" ||
    input.eventStatus === "cancelled"
  ) {
    return "not_applicable";
  }
  if (!input.job) {
    return input.eventStatus === "completed" ? "pending" : "not_applicable";
  }
  if (input.job.status === "failed") return "failed";
  if (input.job.kind === "recalculation") {
    return input.job.status === "applied" || input.job.status === "skipped"
      ? "applied"
      : "recalculating";
  }
  if (input.job.status === "processing") return "processing";
  if (input.job.status === "applied") return "applied";
  if (input.job.status === "skipped") return "not_applicable";
  return "pending";
}

export function selectAdminRatingPresentation(input: {
  eventStatus: string;
  competitionMode: "official" | "practice" | "legacy";
  ratingEra: "automated" | "legacy";
  job: RatingJobAdminFacts | null;
  audit: RatingAuditFacts | null;
  hasGlobalRatingConflict?: boolean;
  hasGlobalUnsettledWork?: boolean;
}): AdminRatingPresentation {
  const status = statusFor(input);
  const unfinished =
    status === "pending" ||
    status === "processing" ||
    status === "recalculating" ||
    status === "failed";
  const blocksEligibilityChange =
    unfinished || Boolean(input.hasGlobalRatingConflict);
  const canRetry = Boolean(
    input.job?.status === "failed" &&
    !input.job.locked &&
    (input.job.kind === "initial" ||
      (input.job.recalculationRunFailed && !input.job.recalculationRunLocked)),
  );
  const sequence = input.audit?.sequenceFrom;

  return {
    status,
    ...PRESENTATION[status],
    refreshesUntilSettled:
      status === "pending" ||
      status === "processing" ||
      status === "recalculating" ||
      Boolean(input.hasGlobalUnsettledWork),
    blocksEligibilityChange,
    actionGuardCopy: blocksEligibilityChange
      ? status === "failed"
        ? "Retry or resolve the failed rating work before changing event eligibility."
        : "Wait for queued rating work to settle before changing event eligibility."
      : null,
    canRetry,
    safeError:
      status === "failed"
        ? safeRatingAdminError(input.job?.errorCode ?? null)
        : null,
    audit: input.audit,
    impactPreview: sequence
      ? `Standings and ratings from database sequence ${sequence} onward will be recalculated.`
      : "Standings will be recalculated immediately. If rating work has not applied yet, it will use the updated eligibility when it runs.",
  };
}
