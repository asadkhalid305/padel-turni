import type { CompetitionMode } from "@/domain/types";

export type PersistedCompetitionMode = CompetitionMode | "legacy";
export type RatingEra = "automated" | "legacy";

export type EventEligibility = {
  countsTowardStandings: boolean;
  eligibleForAutomatedRatings: boolean;
  reason:
    | "eligible"
    | "not_completed"
    | "cancelled"
    | "practice"
    | "excluded"
    | "legacy";
};

/**
 * The single eligibility decision shared by aggregate standings and rating work.
 * Archival is deliberately absent: it changes visibility, never eligibility.
 */
export function decideEventEligibility(options: {
  competitionMode: PersistedCompetitionMode;
  ratingEra: RatingEra;
  status: string;
  included: boolean;
}): EventEligibility {
  if (options.status === "cancelled" || options.status === "archived") {
    return ineligible("cancelled");
  }
  if (options.status !== "completed") {
    return ineligible("not_completed");
  }
  if (options.competitionMode === "practice") {
    return ineligible("practice");
  }
  if (!options.included) {
    return ineligible("excluded");
  }
  if (options.competitionMode === "legacy" || options.ratingEra === "legacy") {
    return {
      countsTowardStandings: true,
      eligibleForAutomatedRatings: false,
      reason: "legacy",
    };
  }
  return {
    countsTowardStandings: true,
    eligibleForAutomatedRatings: true,
    reason: "eligible",
  };
}

export function eventModePersistence(competitionMode: CompetitionMode) {
  return {
    competition_mode: competitionMode,
    rating_era: "automated" as const,
    standings_eligible: competitionMode === "official",
  };
}

export function selectableCompetitionMode(
  competitionMode: PersistedCompetitionMode,
): CompetitionMode {
  return competitionMode === "practice" ? "practice" : "official";
}

export function eventModeUpdatePersistence(options: {
  currentMode: PersistedCompetitionMode;
  currentRatingEra: RatingEra;
  currentIncluded: boolean;
  nextMode: CompetitionMode;
  canChangeMode: boolean;
}) {
  if (options.currentMode === "legacy" && !options.canChangeMode) {
    return {
      modeChanged: false,
      lockedLegacyMode: true,
      payload: {
        competition_mode: "legacy" as const,
        rating_era: options.currentRatingEra,
        standings_eligible: options.currentIncluded,
      },
    };
  }

  return {
    modeChanged: options.currentMode !== options.nextMode,
    lockedLegacyMode: false,
    payload: eventModePersistence(options.nextMode),
  };
}

function ineligible(reason: EventEligibility["reason"]): EventEligibility {
  return {
    countsTowardStandings: false,
    eligibleForAutomatedRatings: false,
    reason,
  };
}
