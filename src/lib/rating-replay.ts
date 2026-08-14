import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  planRatingReplay,
  type RatingBaseline,
  type ReplayEvent,
} from "@/domain/ratings/replay";
import {
  RATING_ENGINE_CONFIGURATION,
  RATING_ENGINE_ID,
} from "@/domain/ratings/openskill-bradley-terry-full-v1";
import { createServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

type ServerClient = NonNullable<ReturnType<typeof createServerClient>>;
const asJson = (value: unknown): Json =>
  JSON.parse(JSON.stringify(value)) as Json;

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
    .join(",")}}`;
}

export const hashCanonicalJson = (value: unknown) =>
  createHash("sha256").update(canonicalStringify(value)).digest("hex");

async function loadReplayFacts(client: ServerClient) {
  const [profilesResult, ledgerResult] = await Promise.all([
    client
      .from("rating_profiles")
      .select("app_user_id,initial_mu,initial_sigma,initial_engine_version")
      .eq("onboarding_status", "completed"),
    client
      .from("event_rating_ledger")
      .select("sequence,event_id,engine_manifest,processing_status")
      .eq("entry_kind", "initial")
      .in("processing_status", ["applied", "skipped"])
      .order("sequence", { ascending: true }),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (ledgerResult.error) throw ledgerResult.error;

  const baselines: RatingBaseline[] = profilesResult.data.map((profile) => {
    if (
      profile.initial_mu === null ||
      profile.initial_sigma === null ||
      profile.initial_engine_version !== RATING_ENGINE_ID
    ) {
      throw new Error(
        `Account ${profile.app_user_id} has no supported immutable rating baseline.`,
      );
    }
    return {
      appUserId: profile.app_user_id,
      initialMu: profile.initial_mu,
      initialSigma: profile.initial_sigma,
    };
  });
  const baselineByAccount = new Map(
    baselines.map((baseline) => [baseline.appUserId, baseline]),
  );
  const eventIds = [
    ...new Set(ledgerResult.data.map((entry) => entry.event_id)),
  ];
  if (eventIds.length === 0)
    throw new Error("Canonical rating history is empty.");

  const [eventsResult, roundsResult, matchesResult, playersResult] =
    await Promise.all([
      client
        .from("events")
        .select("id,status,competition_mode,rating_era,standings_eligible")
        .in("id", eventIds),
      client
        .from("event_rounds")
        .select("id,event_id,round_number")
        .in("event_id", eventIds),
      client
        .from("matches")
        .select(
          "id,event_id,round_id,court_number,status,team_one_score,team_two_score,team_one_player_one_id,team_one_player_two_id,team_two_player_one_id,team_two_player_two_id",
        )
        .in("event_id", eventIds),
      client
        .from("event_players")
        .select("id,event_id,app_user_id_snapshot")
        .in("event_id", eventIds),
    ]);
  if (eventsResult.error) throw eventsResult.error;
  if (roundsResult.error) throw roundsResult.error;
  if (matchesResult.error) throw matchesResult.error;
  if (playersResult.error) throw playersResult.error;

  const eventById = new Map(
    eventsResult.data.map((event) => [event.id, event]),
  );
  const roundById = new Map(
    roundsResult.data.map((round) => [round.id, round.round_number]),
  );
  const replayEvents: ReplayEvent[] = ledgerResult.data.map((ledger) => {
    const event = eventById.get(ledger.event_id);
    if (!event)
      throw new Error(
        `Event ${ledger.event_id} is missing from rating history.`,
      );
    const eventPlayers = playersResult.data
      .filter((player) => player.event_id === event.id)
      .map((player) => {
        if (!player.app_user_id_snapshot) {
          throw new Error(
            `Event player ${player.id} has no immutable account snapshot.`,
          );
        }
        return {
          eventPlayerId: player.id,
          appUserId: player.app_user_id_snapshot,
        };
      });
    const matches = matchesResult.data
      .filter((match) => match.event_id === event.id)
      .map((match) => {
        const roundNumber = roundById.get(match.round_id);
        if (roundNumber === undefined) {
          throw new Error(`Match ${match.id} has no canonical event round.`);
        }
        return {
          id: match.id,
          roundNumber,
          courtNumber: match.court_number,
          status: match.status,
          teamOneScore: match.team_one_score,
          teamTwoScore: match.team_two_score,
          teamOne: [
            match.team_one_player_one_id,
            match.team_one_player_two_id,
          ] as const,
          teamTwo: [
            match.team_two_player_one_id,
            match.team_two_player_two_id,
          ] as const,
        };
      });
    return {
      originalLedgerSequence: ledger.sequence,
      event: {
        id: event.id,
        status: event.status,
        competitionMode: event.competition_mode,
        ratingEra: event.rating_era,
        included: event.standings_eligible,
      },
      players: eventPlayers,
      matches,
      engineManifest: ledger.engine_manifest,
    };
  });

  return { baselines, baselineByAccount, replayEvents };
}

export type RatingReplayProcessingResult =
  | { status: "not_claimed" }
  | {
      status: "applied" | "skipped";
      runId: string;
      finalHash: string;
      ledgerSequence: number;
    };

/** Claims and atomically publishes one whole replay. A thrown calculation or
 * persistence error marks the run retryable without exposing partial profiles. */
export async function processNextRatingReplay(options: {
  client?: ServerClient;
  jobId: string;
  recalculationRunId: string;
  workerId?: string;
}): Promise<RatingReplayProcessingResult> {
  const client = options.client ?? createServerClient();
  if (!client) throw new Error("Rating replay is not configured.");
  const lockToken = randomUUID();
  const { data: runId, error: claimError } = await client.rpc(
    "claim_rating_recalculation_run",
    {
      p_job_id: options.jobId,
      p_run_id: options.recalculationRunId,
      p_worker_id: options.workerId ?? "rating-replay-worker",
      p_lock_token: lockToken,
    },
  );
  if (claimError) throw claimError;
  if (!runId) return { status: "not_claimed" };
  if (runId !== options.recalculationRunId) {
    throw new Error(
      "The claimed replay does not match the selected queue job.",
    );
  }

  try {
    const { data: run, error: runError } = await client
      .from("rating_recalculation_runs")
      .select("id,earliest_ledger_sequence,affected_event_id,trigger_kind")
      .eq("id", runId)
      .single();
    if (runError) throw runError;
    const facts = await loadReplayFacts(client);
    const plan = planRatingReplay({
      earliestLedgerSequence: run.earliest_ledger_sequence,
      affectedEventId: run.affected_event_id,
      trigger: run.trigger_kind,
      baselines: facts.baselines,
      events: facts.replayEvents,
    });
    const entries = plan.entries.map((entry) => {
      const eligible = entry.plan.status === "eligible";
      const canonicalOutput = eligible ? entry.plan.canonicalOutput : null;
      return {
        originalLedgerSequence: entry.originalLedgerSequence,
        eventId: entry.eventId,
        entryKind: entry.entryKind,
        eligibilityStatus: eligible ? "eligible" : "ineligible",
        processingStatus: eligible ? "applied" : "skipped",
        canonicalInput: entry.plan.canonicalInput,
        inputHash: hashCanonicalJson(entry.plan.canonicalInput),
        canonicalOutput,
        outputHash: canonicalOutput ? hashCanonicalJson(canonicalOutput) : null,
        engineManifest: entry.engineManifest,
      };
    });
    const profileUpdates = plan.finalProfiles.map((profile) => {
      const baseline = facts.baselineByAccount.get(profile.appUserId);
      if (!baseline)
        throw new Error(
          `Account ${profile.appUserId} lost its rating baseline.`,
        );
      return {
        ...profile,
        engineVersion: RATING_ENGINE_ID,
        expectedInitialMu: baseline.initialMu,
        expectedInitialSigma: baseline.initialSigma,
      };
    });
    const finalHash = hashCanonicalJson({
      entries,
      profiles: plan.finalProfiles,
    });
    const { data: ledgerSequence, error: finishError } = await client.rpc(
      "finish_rating_recalculation_run",
      {
        p_job_id: options.jobId,
        p_run_id: runId,
        p_lock_token: lockToken,
        p_entries: asJson(entries),
        p_profile_updates: asJson(profileUpdates),
        p_final_hash: finalHash,
      },
    );
    if (finishError) throw finishError;
    return {
      status: entries.some((entry) => entry.processingStatus === "applied")
        ? "applied"
        : "skipped",
      runId,
      finalHash,
      ledgerSequence,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Rating replay failed.";
    await client.rpc("fail_rating_recalculation_run", {
      p_job_id: options.jobId,
      p_run_id: runId,
      p_lock_token: lockToken,
      p_canonical_input: asJson({
        recalculationRunId: options.recalculationRunId,
        selectedJobId: options.jobId,
      }),
      p_input_hash: hashCanonicalJson({
        recalculationRunId: options.recalculationRunId,
        selectedJobId: options.jobId,
      }),
      p_engine_manifest: asJson(RATING_ENGINE_CONFIGURATION),
      p_error_code: "rating_replay_failed",
      p_error_message: message,
    });
    throw error;
  }
}
