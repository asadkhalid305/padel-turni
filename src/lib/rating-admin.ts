import "server-only";

import {
  selectAdminRatingPresentation,
  type AdminRatingPresentation,
  type RatingAuditFacts,
  type RatingJobAdminFacts,
} from "@/domain/ratings/admin-presentation";
import { createServerClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

type ServerClient = NonNullable<ReturnType<typeof createServerClient>>;
type EventRow = Pick<
  Database["public"]["Tables"]["events"]["Row"],
  "id" | "status" | "competition_mode" | "rating_era" | "workspace_id"
>;
type JobRow = Pick<
  Database["public"]["Tables"]["event_rating_jobs"]["Row"],
  | "id"
  | "job_kind"
  | "status"
  | "lock_token"
  | "recalculation_run_id"
  | "last_error_code"
  | "created_at"
  | "updated_at"
  | "completed_at"
>;

export type EventRatingAdminDiagnostics = AdminRatingPresentation & {
  eventId: string;
  jobId: string | null;
};

function engineVersion(manifest: Json | null): string | null {
  if (!manifest || Array.isArray(manifest) || typeof manifest !== "object") {
    return null;
  }
  return typeof manifest.engineId === "string" ? manifest.engineId : null;
}

async function loadInitialAudit(
  client: ServerClient,
  eventId: string,
  job: JobRow,
): Promise<RatingAuditFacts | null> {
  const { data, error } = await client
    .from("event_rating_ledger")
    .select("sequence,engine_manifest,created_at")
    .eq("event_id", eventId)
    .is("recalculation_run_id", null)
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    trigger: "completion",
    actor: null,
    occurredAt: job.completed_at ?? data.created_at ?? job.updated_at,
    sequenceFrom: data.sequence,
    sequenceTo: data.sequence,
    engineVersion: engineVersion(data.engine_manifest),
  };
}

async function loadReplayAudit(
  client: ServerClient,
  runId: string,
): Promise<{
  audit: RatingAuditFacts;
  runFailed: boolean;
  runLocked: boolean;
  errorCode: string | null;
}> {
  const { data: run, error: runError } = await client
    .from("rating_recalculation_runs")
    .select(
      "status,lock_token,trigger_kind,requested_by_app_user_id,earliest_ledger_sequence,created_at,completed_at,last_error_code",
    )
    .eq("id", runId)
    .single();
  if (runError) throw runError;

  const [actorResult, latestSourceResult, replayLedgerResult] =
    await Promise.all([
      client
        .from("app_users")
        .select("display_name")
        .eq("id", run.requested_by_app_user_id)
        .maybeSingle(),
      client
        .from("event_rating_ledger")
        .select("sequence")
        .eq("entry_kind", "initial")
        .in("processing_status", ["applied", "skipped"])
        .order("sequence", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from("event_rating_ledger")
        .select("engine_manifest,created_at")
        .eq("recalculation_run_id", runId)
        .order("sequence", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  if (actorResult.error) throw actorResult.error;
  if (latestSourceResult.error) throw latestSourceResult.error;
  if (replayLedgerResult.error) throw replayLedgerResult.error;

  return {
    audit: {
      trigger: run.trigger_kind,
      actor: actorResult.data?.display_name?.trim() || "Club admin",
      occurredAt:
        run.completed_at ??
        replayLedgerResult.data?.created_at ??
        run.created_at,
      sequenceFrom: run.earliest_ledger_sequence,
      sequenceTo:
        latestSourceResult.data?.sequence ?? run.earliest_ledger_sequence,
      engineVersion: engineVersion(
        replayLedgerResult.data?.engine_manifest ?? null,
      ),
    },
    runFailed: run.status === "failed",
    runLocked: Boolean(run.lock_token),
    errorCode: run.last_error_code,
  };
}

export async function getEventRatingAdminDiagnostics(options: {
  eventId: string;
  workspaceId: string;
  isWorkspaceAdmin: boolean;
  client?: ServerClient;
}): Promise<EventRatingAdminDiagnostics | null> {
  if (!options.isWorkspaceAdmin) return null;
  const client = options.client ?? createServerClient();
  if (!client) return null;

  const [
    { data: event, error: eventError },
    { data: activeRun, error: activeRunError },
  ] = await Promise.all([
    client
      .from("events")
      .select("id,status,competition_mode,rating_era,workspace_id")
      .eq("id", options.eventId)
      .eq("workspace_id", options.workspaceId)
      .maybeSingle(),
    client
      .from("rating_recalculation_runs")
      .select("id,status")
      .in("status", ["pending", "processing", "failed"])
      .limit(1)
      .maybeSingle(),
  ]);
  if (eventError) throw eventError;
  if (activeRunError) throw activeRunError;
  if (!event) return null;

  const scopedEvent = event as EventRow;
  const { data: job, error: jobError } = await client
    .from("event_rating_jobs")
    .select(
      "id,job_kind,status,lock_token,recalculation_run_id,last_error_code,created_at,updated_at,completed_at",
    )
    .eq("event_id", scopedEvent.id)
    .order("queue_sequence", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jobError) throw jobError;

  let audit: RatingAuditFacts | null = null;
  let replay = {
    runFailed: false,
    runLocked: false,
    errorCode: null as string | null,
  };
  if (job?.recalculation_run_id) {
    const replayAudit = await loadReplayAudit(client, job.recalculation_run_id);
    audit = replayAudit.audit;
    replay = replayAudit;
  } else if (job) {
    audit = await loadInitialAudit(client, scopedEvent.id, job);
  }

  const jobFacts: RatingJobAdminFacts | null = job
    ? {
        id: job.id,
        kind: job.job_kind,
        status: job.status,
        locked: Boolean(job.lock_token),
        recalculationRunFailed: replay.runFailed,
        recalculationRunLocked: replay.runLocked,
        errorCode: replay.errorCode ?? job.last_error_code,
      }
    : null;
  return {
    ...selectAdminRatingPresentation({
      eventStatus:
        scopedEvent.status === "archived" ? "completed" : scopedEvent.status,
      competitionMode:
        scopedEvent.competition_mode ??
        (scopedEvent.rating_era === "legacy" ? "legacy" : "official"),
      ratingEra: scopedEvent.rating_era,
      job: jobFacts,
      audit,
      hasGlobalRatingConflict: Boolean(activeRun),
      hasGlobalUnsettledWork: Boolean(
        activeRun && activeRun.status !== "failed",
      ),
    }),
    eventId: scopedEvent.id,
    jobId: job?.id ?? null,
  };
}
