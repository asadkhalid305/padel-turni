import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  planInitialEventRatingApplication,
  type CurrentRatingProfile,
  type RatingApplicationMatch,
} from "@/domain/ratings/event-application";
import {
  RATING_ENGINE_CONFIGURATION,
  RATING_ENGINE_ID,
} from "@/domain/ratings/openskill-bradley-terry-full-v1";
import { serializeRatingWorkerError } from "@/domain/ratings/worker-policy";
import { createServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

type ServerClient = NonNullable<ReturnType<typeof createServerClient>>;

export type InitialRatingProcessingResult =
  | { status: "not_claimed" }
  | { status: "applied"; ledgerSequence: number }
  | { status: "skipped"; reason: string; ledgerSequence: number };

const asJson = (value: unknown): Json =>
  JSON.parse(JSON.stringify(value)) as Json;

function canonicalStringify(value: unknown): string {
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

const hashCanonicalJson = (value: unknown) =>
  createHash("sha256").update(canonicalStringify(value)).digest("hex");

async function loadApplicationState(client: ServerClient, eventId: string) {
  const [eventResult, roundsResult, matchesResult, playersResult] =
    await Promise.all([
      client
        .from("events")
        .select("id,status,competition_mode,rating_era,standings_eligible")
        .eq("id", eventId)
        .single(),
      client
        .from("event_rounds")
        .select("id,round_number")
        .eq("event_id", eventId),
      client
        .from("matches")
        .select(
          "id,round_id,court_number,status,team_one_score,team_two_score,team_one_player_one_id,team_one_player_two_id,team_two_player_one_id,team_two_player_two_id",
        )
        .eq("event_id", eventId),
      client
        .from("event_players")
        .select("id,app_user_id_snapshot")
        .eq("event_id", eventId),
    ]);

  if (eventResult.error) throw eventResult.error;
  if (roundsResult.error) throw roundsResult.error;
  if (matchesResult.error) throw matchesResult.error;
  if (playersResult.error) throw playersResult.error;

  const roundById = new Map(
    roundsResult.data.map((round) => [round.id, round.round_number]),
  );
  const players = playersResult.data.map((player) => {
    if (!player.app_user_id_snapshot) {
      throw new Error(
        `Event player ${player.id} is missing its immutable account snapshot.`,
      );
    }
    return {
      eventPlayerId: player.id,
      appUserId: player.app_user_id_snapshot,
    };
  });
  const accountIds = [...new Set(players.map((player) => player.appUserId))];
  const profilesResult = await client
    .from("rating_profiles")
    .select(
      "app_user_id,onboarding_status,mu,sigma,rated_match_count,engine_version",
    )
    .in("app_user_id", accountIds);
  if (profilesResult.error) throw profilesResult.error;

  const profiles: CurrentRatingProfile[] = profilesResult.data.map(
    (profile) => {
      if (
        profile.onboarding_status !== "completed" ||
        profile.mu === null ||
        profile.sigma === null ||
        profile.engine_version !== RATING_ENGINE_ID
      ) {
        throw new Error(
          `Account ${profile.app_user_id} has no compatible completed rating profile.`,
        );
      }
      return {
        appUserId: profile.app_user_id,
        mu: profile.mu,
        sigma: profile.sigma,
        ratedMatchCount: profile.rated_match_count,
      };
    },
  );

  const matches: RatingApplicationMatch[] = matchesResult.data.map((match) => {
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
      teamOne: [match.team_one_player_one_id, match.team_one_player_two_id],
      teamTwo: [match.team_two_player_one_id, match.team_two_player_two_id],
    };
  });

  return {
    event: {
      id: eventResult.data.id,
      status: eventResult.data.status,
      competitionMode: eventResult.data.competition_mode,
      ratingEra: eventResult.data.rating_era,
      included: eventResult.data.standings_eligible,
    },
    matches,
    players,
    profiles,
  };
}

/**
 * Claims and processes the initial job created by event completion. Scores are
 * already committed before this function is called. Its final RPC is the only
 * boundary allowed to change latest profiles and append the successful ledger.
 */
export async function processInitialEventRating(options: {
  client?: ServerClient;
  eventId: string;
  workerId?: string;
}): Promise<InitialRatingProcessingResult> {
  const client = options.client ?? createServerClient();
  if (!client) throw new Error("Rating processing is not configured.");

  const lockToken = randomUUID();
  const { data: claimed, error: claimError } = await client.rpc(
    "claim_initial_event_rating_job",
    {
      p_event_id: options.eventId,
      p_worker_id: options.workerId ?? "event-completion-action",
      p_lock_token: lockToken,
    },
  );
  if (claimError) throw claimError;
  if (!claimed) return { status: "not_claimed" };

  let failureInput: unknown = { eventId: options.eventId };
  try {
    const state = await loadApplicationState(client, options.eventId);
    const plan = planInitialEventRatingApplication({
      ...state,
      alreadyApplied: false,
    });
    failureInput = plan.canonicalInput;

    if (plan.status === "skipped") {
      const { data, error } = await client.rpc(
        "finish_initial_event_rating_job",
        {
          p_event_id: options.eventId,
          p_lock_token: lockToken,
          p_eligibility_status: "ineligible",
          p_processing_status: "skipped",
          p_canonical_input: asJson(plan.canonicalInput),
          p_input_hash: hashCanonicalJson(plan.canonicalInput),
          p_canonical_output: null,
          p_output_hash: null,
          p_engine_manifest: asJson(RATING_ENGINE_CONFIGURATION),
          p_profile_updates: [],
        },
      );
      if (error) throw error;
      return { status: "skipped", reason: plan.reason, ledgerSequence: data };
    }

    const initialByAccount = new Map(
      state.profiles.map((profile) => [profile.appUserId, profile]),
    );
    const profileUpdates = plan.canonicalOutput.profiles.map((profile) => {
      const initial = initialByAccount.get(profile.appUserId)!;
      return {
        ...profile,
        engineVersion: RATING_ENGINE_ID,
        expectedMu: initial.mu,
        expectedSigma: initial.sigma,
        expectedRatedMatchCount: initial.ratedMatchCount,
      };
    });
    const { data, error } = await client.rpc(
      "finish_initial_event_rating_job",
      {
        p_event_id: options.eventId,
        p_lock_token: lockToken,
        p_eligibility_status: "eligible",
        p_processing_status: "applied",
        p_canonical_input: asJson(plan.canonicalInput),
        p_input_hash: hashCanonicalJson(plan.canonicalInput),
        p_canonical_output: asJson(plan.canonicalOutput),
        p_output_hash: hashCanonicalJson(plan.canonicalOutput),
        p_engine_manifest: asJson(plan.engineManifest),
        p_profile_updates: asJson(profileUpdates),
      },
    );
    if (error) throw error;
    return { status: "applied", ledgerSequence: data };
  } catch (error) {
    const safeError = serializeRatingWorkerError(error);
    await client.rpc("fail_initial_event_rating_job", {
      p_event_id: options.eventId,
      p_lock_token: lockToken,
      p_canonical_input: asJson(failureInput),
      p_input_hash: hashCanonicalJson(failureInput),
      p_engine_manifest: asJson(RATING_ENGINE_CONFIGURATION),
      p_error_code: safeError.code,
      p_error_message: safeError.message,
    });
    throw error;
  }
}
