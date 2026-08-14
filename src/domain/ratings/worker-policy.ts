export const RATING_JOB_DEFAULT_MAX_ATTEMPTS = 5;
export const RATING_JOB_RETRY_BASE_SECONDS = 60;
export const RATING_JOB_RETRY_MAX_SECONDS = 60 * 60;
export const RATING_JOB_STALE_LOCK_SECONDS = 5 * 60;
export const RATING_WORKER_BATCH_LIMIT = 10;

const ERROR_CODE_MAX_LENGTH = 120;
const ERROR_MESSAGE_MAX_LENGTH = 240;

export type RatingJobFailureTransition = {
  status: "retryable" | "failed";
  retryAfterSeconds: number | null;
};

export type SafeRatingWorkerError = {
  code: string;
  message: string;
};

export class ExpectedRatingWorkerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ExpectedRatingWorkerError";
    this.code = code;
  }
}

function boundedInteger(value: number, fallback: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function ratingJobRetryDelaySeconds(attemptCount: number): number {
  const safeAttemptCount = boundedInteger(attemptCount, 1);
  return Math.min(
    RATING_JOB_RETRY_MAX_SECONDS,
    RATING_JOB_RETRY_BASE_SECONDS * 2 ** (safeAttemptCount - 1),
  );
}

export function ratingJobFailureTransition(input: {
  attemptCount: number;
  maxAttempts: number;
}): RatingJobFailureTransition {
  const attemptCount = boundedInteger(input.attemptCount, 1);
  const maxAttempts = boundedInteger(
    input.maxAttempts,
    RATING_JOB_DEFAULT_MAX_ATTEMPTS,
  );
  if (attemptCount >= maxAttempts) {
    return { status: "failed", retryAfterSeconds: null };
  }
  return {
    status: "retryable",
    retryAfterSeconds: ratingJobRetryDelaySeconds(attemptCount),
  };
}

export function ratingJobStaleBefore(now: Date): string {
  return new Date(
    now.getTime() - RATING_JOB_STALE_LOCK_SECONDS * 1_000,
  ).toISOString();
}

function compact(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * Only deliberately constructed errors may persist their message. Unexpected
 * provider/database errors can contain URLs, tokens, SQL, or player data, so
 * they are represented by stable operational copy without stack or context.
 */
export function serializeRatingWorkerError(
  error: unknown,
): SafeRatingWorkerError {
  if (error instanceof ExpectedRatingWorkerError) {
    return {
      code:
        compact(error.code, ERROR_CODE_MAX_LENGTH) ||
        "rating_processing_failed",
      message:
        compact(error.message, ERROR_MESSAGE_MAX_LENGTH) ||
        "Rating processing failed.",
    };
  }
  return {
    code: "rating_processing_failed",
    message: "Rating processing failed. Retry the job or inspect server logs.",
  };
}
