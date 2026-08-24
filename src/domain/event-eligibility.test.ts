import { describe, expect, it } from "vitest";

import {
  decideEventEligibility,
  eventModePersistence,
  eventModeUpdatePersistence,
  requiresAutomatedRosterReplacement,
  selectableCompetitionMode,
} from "@/domain/event-eligibility";

describe("event eligibility", () => {
  it("uses the same decision for Official standings and ratings", () => {
    expect(
      decideEventEligibility({
        competitionMode: "official",
        ratingEra: "automated",
        status: "completed",
        included: true,
      }),
    ).toEqual({
      countsTowardStandings: true,
      eligibleForAutomatedRatings: true,
      reason: "eligible",
    });
  });

  it("keeps Practice results out of standings and ratings", () => {
    expect(
      decideEventEligibility({
        competitionMode: "practice",
        ratingEra: "automated",
        status: "completed",
        included: true,
      }),
    ).toMatchObject({
      countsTowardStandings: false,
      eligibleForAutomatedRatings: false,
      reason: "practice",
    });
  });

  it.each([
    ["scheduled", true, "not_completed"],
    ["live", true, "not_completed"],
    ["cancelled", true, "cancelled"],
    ["completed", false, "excluded"],
  ] as const)("makes %s included=%s ineligible", (status, included, reason) => {
    expect(
      decideEventEligibility({
        competitionMode: "official",
        ratingEra: "automated",
        status,
        included,
      }),
    ).toMatchObject({
      countsTowardStandings: false,
      eligibleForAutomatedRatings: false,
      reason,
    });
  });

  it("reinstates an excluded Official event for both consumers", () => {
    const excluded = decideEventEligibility({
      competitionMode: "official",
      ratingEra: "automated",
      status: "completed",
      included: false,
    });
    const reinstated = decideEventEligibility({
      competitionMode: "official",
      ratingEra: "automated",
      status: "completed",
      included: true,
    });
    expect(excluded.eligibleForAutomatedRatings).toBe(false);
    expect(reinstated).toMatchObject({
      countsTowardStandings: true,
      eligibleForAutomatedRatings: true,
    });
  });

  it("does not accept archive visibility as eligibility input", () => {
    const base = {
      competitionMode: "official" as const,
      ratingEra: "automated" as const,
      status: "completed",
      included: true,
    };
    expect(decideEventEligibility(base)).toEqual(
      decideEventEligibility({ ...base }),
    );
  });

  it("preserves legacy standings without importing them into ratings", () => {
    expect(
      decideEventEligibility({
        competitionMode: "legacy",
        ratingEra: "legacy",
        status: "completed",
        included: true,
      }),
    ).toMatchObject({
      countsTowardStandings: true,
      eligibleForAutomatedRatings: false,
      reason: "legacy",
    });
  });

  it("derives persisted inclusion from the chosen mode", () => {
    expect(eventModePersistence("official")).toMatchObject({
      competition_mode: "official",
      standings_eligible: true,
    });
    expect(eventModePersistence("practice")).toMatchObject({
      competition_mode: "practice",
      standings_eligible: false,
    });
  });

  it("copies selectable modes and gives legacy copies an Official default", () => {
    expect(selectableCompetitionMode("official")).toBe("official");
    expect(selectableCompetitionMode("practice")).toBe("practice");
    expect(selectableCompetitionMode("legacy")).toBe("official");
  });

  it("preserves locked live legacy mode during unrelated edits", () => {
    expect(
      eventModeUpdatePersistence({
        currentMode: "legacy",
        currentRatingEra: "legacy",
        currentIncluded: true,
        nextMode: "official",
        canChangeMode: false,
      }),
    ).toEqual({
      modeChanged: false,
      lockedLegacyMode: true,
      payload: {
        competition_mode: "legacy",
        rating_era: "legacy",
        standings_eligible: true,
      },
    });
  });

  it("lets an untouched scheduled legacy event enter a selectable mode", () => {
    expect(
      eventModeUpdatePersistence({
        currentMode: "legacy",
        currentRatingEra: "legacy",
        currentIncluded: true,
        nextMode: "practice",
        canChangeMode: true,
      }),
    ).toMatchObject({
      modeChanged: true,
      lockedLegacyMode: false,
      payload: {
        competition_mode: "practice",
        rating_era: "automated",
        standings_eligible: false,
      },
    });
  });

  it("requires a validated roster replacement when a legacy event enters the automated era", () => {
    expect(
      requiresAutomatedRosterReplacement({
        currentRatingEra: "legacy",
        nextRatingEra: "automated",
      }),
    ).toBe(true);
    expect(
      requiresAutomatedRosterReplacement({
        currentRatingEra: "automated",
        nextRatingEra: "automated",
      }),
    ).toBe(false);
  });
});
