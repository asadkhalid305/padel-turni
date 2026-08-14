import "server-only";

import { randomUUID } from "node:crypto";

import {
  RATING_WORKER_BATCH_LIMIT,
  ratingJobStaleBefore,
} from "@/domain/ratings/worker-policy";
import { processInitialEventRating } from "@/lib/event-rating-application";
import { processNextRatingReplay } from "@/lib/rating-replay";
import { createServerClient } from "@/lib/supabase/server";

type ServerClient = NonNullable<ReturnType<typeof createServerClient>>;

export type DueRatingJob = {
  id: string;
  event_id: string;
  job_kind: "initial" | "recalculation";
  recalculation_run_id: string | null;
  attempt_count: number;
  max_attempts: number;
};

export type RecalculationJobProcessor = (options: {
  client: ServerClient;
  job: DueRatingJob & {
    job_kind: "recalculation";
    recalculation_run_id: string;
  };
  workerId: string;
}) => Promise<RatingJobProcessingResult>;

export type RatingJobProcessingResult =
  | { status: "not_claimed" }
  | { status: "applied" | "skipped" };

export type RatingWorkerResult = {
  recoveredStale: number;
  applied: number;
  skipped: number;
  failedAttempts: number;
  contended: number;
  deferredRecalculations: number;
};

type RatingWorkerDependencies = {
  processInitial: typeof processInitialEventRating;
  processRecalculation?: RecalculationJobProcessor;
  now: () => Date;
};

const defaultDependencies: RatingWorkerDependencies = {
  processInitial: processInitialEventRating,
  processRecalculation: ({ client, job, workerId }) =>
    processNextRatingReplay({
      client,
      jobId: job.id,
      recalculationRunId: job.recalculation_run_id,
      workerId,
    }),
  now: () => new Date(),
};

function emptyResult(recoveredStale: number): RatingWorkerResult {
  return {
    recoveredStale,
    applied: 0,
    skipped: 0,
    failedAttempts: 0,
    contended: 0,
    deferredRecalculations: 0,
  };
}

/**
 * Processes jobs in database queue order. The initial and recalculation
 * processors own their transaction locks; this coordinator deliberately stops
 * after contention or failure so a later rating update cannot overtake an
 * earlier one.
 *
 * The production replay adapter uses the exact queue job selected here. Tests
 * can still inject either processor without weakening the production path.
 */
export async function runRatingWorker(options?: {
  client?: ServerClient;
  workerId?: string;
  limit?: number;
  processRecalculation?: RecalculationJobProcessor;
  dependencies?: Partial<RatingWorkerDependencies>;
}): Promise<RatingWorkerResult> {
  const client = options?.client ?? createServerClient();
  if (!client) throw new Error("Rating processing is not configured.");

  const dependencies = {
    ...defaultDependencies,
    ...options?.dependencies,
    processRecalculation:
      options?.processRecalculation ??
      options?.dependencies?.processRecalculation ??
      defaultDependencies.processRecalculation,
  };
  const workerId = options?.workerId ?? `rating-worker-${randomUUID()}`;
  const limit = Math.min(
    RATING_WORKER_BATCH_LIMIT,
    Math.max(1, Math.trunc(options?.limit ?? RATING_WORKER_BATCH_LIMIT)),
  );

  const { data: recovered, error: recoveryError } = await client.rpc(
    "recover_stale_event_rating_jobs",
    { p_stale_before: ratingJobStaleBefore(dependencies.now()) },
  );
  if (recoveryError) throw recoveryError;
  const result = emptyResult(recovered ?? 0);

  for (let index = 0; index < limit; index += 1) {
    const { data, error } = await client.rpc("list_due_event_rating_jobs", {
      p_limit: 1,
    });
    if (error) throw error;
    const job = (data?.[0] ?? null) as DueRatingJob | null;
    if (!job) break;

    if (job.job_kind === "recalculation") {
      if (!job.recalculation_run_id || !dependencies.processRecalculation) {
        result.deferredRecalculations += 1;
        break;
      }
      try {
        const processingResult = await dependencies.processRecalculation({
          client,
          job: {
            ...job,
            job_kind: "recalculation",
            recalculation_run_id: job.recalculation_run_id,
          },
          workerId,
        });
        if (processingResult.status === "not_claimed") {
          result.contended += 1;
          break;
        }
        result[processingResult.status] += 1;
      } catch {
        result.failedAttempts += 1;
        break;
      }
      continue;
    }

    try {
      const processingResult = await dependencies.processInitial({
        client,
        eventId: job.event_id,
        workerId,
      });
      if (processingResult.status === "not_claimed") {
        result.contended += 1;
        break;
      }
      result[processingResult.status] += 1;
    } catch {
      result.failedAttempts += 1;
      break;
    }
  }

  return result;
}
