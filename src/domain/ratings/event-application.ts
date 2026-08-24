import { decideEventEligibility } from "@/domain/event-eligibility";
import {
  RATING_ENGINE_CONFIGURATION,
  RATING_ENGINE_ID,
  rateTwoVsTwo,
  type MatchOutcome,
  type RatingValue,
} from "@/domain/ratings/openskill-bradley-terry-full-v1";

export type RatingApplicationSkipReason =
  | "already_applied"
  | "not_completed"
  | "cancelled"
  | "practice"
  | "excluded"
  | "legacy"
  | "no_completed_matches";

export type RatingApplicationEvent = Readonly<{
  id: string;
  status: string;
  competitionMode: "official" | "practice" | "legacy";
  ratingEra: "automated" | "legacy";
  included: boolean;
}>;

export type RatingApplicationMatch = Readonly<{
  id: string;
  roundNumber: number;
  courtNumber: number;
  status: string;
  teamOneScore: number | null;
  teamTwoScore: number | null;
  teamOne: readonly [string, string];
  teamTwo: readonly [string, string];
}>;

export type RatingApplicationPlayer = Readonly<{
  eventPlayerId: string;
  appUserId: string;
}>;

export type CurrentRatingProfile = Readonly<{
  appUserId: string;
  mu: number;
  sigma: number;
  ratedMatchCount: number;
}>;

export type CanonicalRatedMatch = Readonly<{
  id: string;
  roundNumber: number;
  courtNumber: number;
  outcome: MatchOutcome;
  teams: readonly [readonly [string, string], readonly [string, string]];
}>;

export type MatchRatingOutput = Readonly<{
  matchId: string;
  outcome: MatchOutcome;
  players: readonly {
    appUserId: string;
    before: RatingValue;
    after: RatingValue;
  }[];
}>;

export type FinalRatingProfile = CurrentRatingProfile &
  Readonly<{
    isProvisional: boolean;
    firstOfficialRatedAppearance: boolean;
  }>;

export type RatingApplicationPlan =
  | Readonly<{
      status: "skipped";
      reason: RatingApplicationSkipReason;
      canonicalInput: {
        eventId: string;
        eligibility: RatingApplicationSkipReason;
      };
    }>
  | Readonly<{
      status: "eligible";
      canonicalInput: {
        eventId: string;
        engineId: typeof RATING_ENGINE_ID;
        matches: readonly CanonicalRatedMatch[];
      };
      canonicalOutput: {
        matches: readonly MatchRatingOutput[];
        profiles: readonly FinalRatingProfile[];
      };
      engineManifest: typeof RATING_ENGINE_CONFIGURATION;
    }>;

const compareMatches = (
  first: RatingApplicationMatch,
  second: RatingApplicationMatch,
) =>
  first.roundNumber - second.roundNumber ||
  first.courtNumber - second.courtNumber ||
  first.id.localeCompare(second.id);

function outcomeFor(match: RatingApplicationMatch): MatchOutcome {
  if (match.teamOneScore === null || match.teamTwoScore === null) {
    throw new Error(`Completed match ${match.id} is missing its final score.`);
  }
  if (match.teamOneScore === match.teamTwoScore) return "draw";
  return match.teamOneScore > match.teamTwoScore ? "teamOneWin" : "teamTwoWin";
}

function assertRating(profile: CurrentRatingProfile) {
  if (
    !Number.isFinite(profile.mu) ||
    !Number.isFinite(profile.sigma) ||
    profile.sigma <= 0 ||
    !Number.isInteger(profile.ratedMatchCount) ||
    profile.ratedMatchCount < 0
  ) {
    throw new Error(
      `Account ${profile.appUserId} has an invalid rating profile.`,
    );
  }
}

/**
 * Builds one deterministic application from current global profiles. This
 * function has no persistence concerns: callers commit the complete output in
 * one transaction or none of it.
 */
export function planInitialEventRatingApplication(options: {
  event: RatingApplicationEvent;
  alreadyApplied: boolean;
  matches: readonly RatingApplicationMatch[];
  players: readonly RatingApplicationPlayer[];
  profiles: readonly CurrentRatingProfile[];
}): RatingApplicationPlan {
  if (options.alreadyApplied)
    return skipped(options.event.id, "already_applied");

  const eligibility = decideEventEligibility({
    competitionMode: options.event.competitionMode,
    ratingEra: options.event.ratingEra,
    status: options.event.status,
    included: options.event.included,
  });
  if (eligibility.reason !== "eligible") {
    return skipped(options.event.id, eligibility.reason);
  }

  const matches = options.matches
    .filter((match) => match.status === "completed")
    .slice()
    .sort(compareMatches);
  if (matches.length === 0) {
    return skipped(options.event.id, "no_completed_matches");
  }

  const accountByEventPlayer = new Map(
    options.players.map((player) => [player.eventPlayerId, player.appUserId]),
  );
  const currentByAccount = new Map<string, CurrentRatingProfile>();
  for (const profile of options.profiles) {
    assertRating(profile);
    if (currentByAccount.has(profile.appUserId)) {
      throw new Error(
        `Account ${profile.appUserId} has duplicate rating profiles.`,
      );
    }
    currentByAccount.set(profile.appUserId, { ...profile });
  }

  const touchedAccounts = new Set<string>();
  const canonicalMatches: CanonicalRatedMatch[] = [];
  const outputMatches: MatchRatingOutput[] = [];

  for (const match of matches) {
    const eventPlayerIds = [...match.teamOne, ...match.teamTwo];
    if (new Set(eventPlayerIds).size !== 4) {
      throw new Error(`Match ${match.id} must contain four distinct players.`);
    }
    const accountIds = eventPlayerIds.map((eventPlayerId) => {
      const accountId = accountByEventPlayer.get(eventPlayerId);
      if (!accountId) {
        throw new Error(
          `Match ${match.id} contains a player without an account snapshot.`,
        );
      }
      return accountId;
    });
    if (new Set(accountIds).size !== 4) {
      throw new Error(`Match ${match.id} must contain four distinct accounts.`);
    }
    const profiles = accountIds.map((accountId) => {
      const profile = currentByAccount.get(accountId);
      if (!profile) {
        throw new Error(
          `Account ${accountId} is missing its current rating profile.`,
        );
      }
      return profile;
    });
    const outcome = outcomeFor(match);
    const rated = rateTwoVsTwo({
      teams: [
        [profiles[0], profiles[1]],
        [profiles[2], profiles[3]],
      ],
      outcome,
    });

    canonicalMatches.push({
      id: match.id,
      roundNumber: match.roundNumber,
      courtNumber: match.courtNumber,
      outcome,
      teams: [
        [accountIds[0], accountIds[1]],
        [accountIds[2], accountIds[3]],
      ],
    });
    outputMatches.push({
      matchId: match.id,
      outcome,
      players: accountIds.map((appUserId, index) => ({
        appUserId,
        before: { mu: profiles[index].mu, sigma: profiles[index].sigma },
        after: {
          mu: rated[index < 2 ? 0 : 1][index % 2].mu,
          sigma: rated[index < 2 ? 0 : 1][index % 2].sigma,
        },
      })),
    });

    accountIds.forEach((appUserId, index) => {
      const previous = profiles[index];
      currentByAccount.set(appUserId, {
        appUserId,
        mu: rated[index < 2 ? 0 : 1][index % 2].mu,
        sigma: rated[index < 2 ? 0 : 1][index % 2].sigma,
        ratedMatchCount: previous.ratedMatchCount + 1,
      });
      touchedAccounts.add(appUserId);
    });
  }

  return {
    status: "eligible",
    canonicalInput: {
      eventId: options.event.id,
      engineId: RATING_ENGINE_ID,
      matches: canonicalMatches,
    },
    canonicalOutput: {
      matches: outputMatches,
      profiles: [...touchedAccounts].sort().map((appUserId) => {
        const profile = currentByAccount.get(appUserId)!;
        return {
          ...profile,
          isProvisional: profile.ratedMatchCount < 6,
          firstOfficialRatedAppearance:
            options.profiles.find(
              (candidate) => candidate.appUserId === appUserId,
            )!.ratedMatchCount === 0,
        };
      }),
    },
    engineManifest: RATING_ENGINE_CONFIGURATION,
  };
}

function skipped(
  eventId: string,
  reason: RatingApplicationSkipReason,
): RatingApplicationPlan {
  return {
    status: "skipped",
    reason,
    canonicalInput: { eventId, eligibility: reason },
  };
}
