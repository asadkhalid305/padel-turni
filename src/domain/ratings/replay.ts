import {
  planInitialEventRatingApplication,
  type CurrentRatingProfile,
  type RatingApplicationEvent,
  type RatingApplicationMatch,
  type RatingApplicationPlayer,
  type RatingApplicationPlan,
} from "@/domain/ratings/event-application";
import {
  RATING_ENGINE_CONFIGURATION,
  RATING_ENGINE_ID,
} from "@/domain/ratings/openskill-bradley-terry-full-v1";

export type RatingBaseline = Readonly<{
  appUserId: string;
  initialMu: number;
  initialSigma: number;
}>;

export type ReplayTrigger = "correction" | "exclusion" | "reinstatement";

export type ReplayEvent = Readonly<{
  originalLedgerSequence: number;
  event: RatingApplicationEvent;
  players: readonly RatingApplicationPlayer[];
  matches: readonly RatingApplicationMatch[];
  engineManifest: unknown;
}>;

export type ReplayEntry = Readonly<{
  originalLedgerSequence: number;
  eventId: string;
  entryKind: "replay" | "exclusion" | "reinstatement";
  plan: RatingApplicationPlan;
  engineManifest: typeof RATING_ENGINE_CONFIGURATION;
}>;

export type RatingReplayPlan = Readonly<{
  earliestLedgerSequence: number;
  entries: readonly ReplayEntry[];
  finalProfiles: readonly CurrentRatingProfile[];
}>;

const manifestMatchesRecordedEngine = (
  manifest: unknown,
): manifest is typeof RATING_ENGINE_CONFIGURATION => {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return false;
  }
  const expected = RATING_ENGINE_CONFIGURATION as Record<string, unknown>;
  const actual = manifest as Record<string, unknown>;
  const expectedKeys = Object.keys(expected).sort();
  const actualKeys = Object.keys(actual).sort();
  return (
    expectedKeys.length === actualKeys.length &&
    expectedKeys.every(
      (key, index) =>
        key === actualKeys[index] && actual[key] === expected[key],
    )
  );
};

function assertBaseline(baseline: RatingBaseline) {
  if (
    !baseline.appUserId ||
    !Number.isFinite(baseline.initialMu) ||
    !Number.isFinite(baseline.initialSigma) ||
    baseline.initialSigma <= 0
  ) {
    throw new Error(
      `Account ${baseline.appUserId || "unknown"} has an invalid rating baseline.`,
    );
  }
}

/**
 * Reconstructs rating state from immutable onboarding baselines and canonical
 * event facts. Events before the affected sequence are calculated to establish
 * the exact prefix state; only the affected suffix becomes new audit entries.
 */
export function planRatingReplay(options: {
  earliestLedgerSequence: number;
  affectedEventId: string;
  trigger: ReplayTrigger;
  baselines: readonly RatingBaseline[];
  events: readonly ReplayEvent[];
}): RatingReplayPlan {
  if (
    !Number.isInteger(options.earliestLedgerSequence) ||
    options.earliestLedgerSequence <= 0
  ) {
    throw new Error("The earliest ledger sequence must be a positive integer.");
  }

  const currentByAccount = new Map<string, CurrentRatingProfile>();
  for (const baseline of options.baselines) {
    assertBaseline(baseline);
    if (currentByAccount.has(baseline.appUserId)) {
      throw new Error(
        `Account ${baseline.appUserId} has duplicate rating baselines.`,
      );
    }
    currentByAccount.set(baseline.appUserId, {
      appUserId: baseline.appUserId,
      mu: baseline.initialMu,
      sigma: baseline.initialSigma,
      ratedMatchCount: 0,
    });
  }

  const orderedEvents = options.events
    .slice()
    .sort(
      (first, second) =>
        first.originalLedgerSequence - second.originalLedgerSequence ||
        first.event.id.localeCompare(second.event.id),
    );
  const seenSequences = new Set<number>();
  const seenEvents = new Set<string>();
  const entries: ReplayEntry[] = [];
  let affectedEventFound = false;

  for (const replayEvent of orderedEvents) {
    if (
      !Number.isInteger(replayEvent.originalLedgerSequence) ||
      replayEvent.originalLedgerSequence <= 0 ||
      seenSequences.has(replayEvent.originalLedgerSequence)
    ) {
      throw new Error(
        "Replay events require unique positive database sequences.",
      );
    }
    if (seenEvents.has(replayEvent.event.id)) {
      throw new Error(
        `Event ${replayEvent.event.id} appears more than once in replay history.`,
      );
    }
    seenSequences.add(replayEvent.originalLedgerSequence);
    seenEvents.add(replayEvent.event.id);

    if (!manifestMatchesRecordedEngine(replayEvent.engineManifest)) {
      throw new Error(
        `Event ${replayEvent.event.id} uses an unsupported recorded rating engine manifest.`,
      );
    }

    const result = planInitialEventRatingApplication({
      event: replayEvent.event,
      alreadyApplied: false,
      matches: replayEvent.matches,
      players: replayEvent.players,
      profiles: [...currentByAccount.values()],
    });
    if (result.status === "eligible") {
      for (const profile of result.canonicalOutput.profiles) {
        currentByAccount.set(profile.appUserId, {
          appUserId: profile.appUserId,
          mu: profile.mu,
          sigma: profile.sigma,
          ratedMatchCount: profile.ratedMatchCount,
        });
      }
    }

    if (replayEvent.event.id === options.affectedEventId) {
      affectedEventFound = true;
      if (
        replayEvent.originalLedgerSequence !== options.earliestLedgerSequence
      ) {
        throw new Error(
          "The affected event does not match the earliest ledger sequence.",
        );
      }
    }

    if (replayEvent.originalLedgerSequence >= options.earliestLedgerSequence) {
      entries.push({
        originalLedgerSequence: replayEvent.originalLedgerSequence,
        eventId: replayEvent.event.id,
        entryKind:
          replayEvent.event.id === options.affectedEventId &&
          options.trigger !== "correction"
            ? options.trigger
            : "replay",
        plan: result,
        engineManifest: RATING_ENGINE_CONFIGURATION,
      });
    }
  }

  if (!affectedEventFound) {
    throw new Error(
      "The affected event is missing from canonical rating history.",
    );
  }
  if (entries.length === 0) {
    throw new Error("The replay suffix is empty.");
  }

  return {
    earliestLedgerSequence: options.earliestLedgerSequence,
    entries,
    finalProfiles: [...currentByAccount.values()].sort((first, second) =>
      first.appUserId.localeCompare(second.appUserId),
    ),
  };
}

export const SUPPORTED_REPLAY_ENGINE_ID = RATING_ENGINE_ID;
