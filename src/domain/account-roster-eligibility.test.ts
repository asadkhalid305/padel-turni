import { describe, expect, it } from "vitest";

import {
  assertAccountRosterSelection,
  decideAccountRosterEligibility,
  type AccountRosterCandidate,
  type RatingProfileState,
  type RosterMembershipState,
} from "@/domain/account-roster-eligibility";

const eligibleCandidate: AccountRosterCandidate = {
  playerId: "player-1",
  workspaceId: "club-a",
  appUserId: "account-1",
  accountExists: true,
  membershipState: "accepted",
  playerIsActive: true,
  ratingProfileState: "completed",
};

describe("account-only future roster eligibility", () => {
  it("accepts only the complete active account-member state", () => {
    expect(decideAccountRosterEligibility(eligibleCandidate)).toEqual({
      eligible: true,
      reason: null,
    });
  });

  it.each([
    ["invited", "membership_not_accepted"],
    ["removed", "membership_not_accepted"],
    ["inactive", "membership_inactive"],
  ] satisfies [RosterMembershipState, string][])(
    "rejects a %s membership",
    (membershipState, reason) => {
      expect(
        decideAccountRosterEligibility({
          ...eligibleCandidate,
          membershipState,
        }),
      ).toEqual({ eligible: false, reason });
    },
  );

  it.each([
    "missing",
    "not_started",
    "in_progress",
  ] satisfies RatingProfileState[])(
    "rejects a %s rating profile",
    (ratingProfileState) => {
      expect(
        decideAccountRosterEligibility({
          ...eligibleCandidate,
          ratingProfileState,
        }),
      ).toEqual({ eligible: false, reason: "rating_profile_incomplete" });
    },
  );

  it("rejects a workspace-inactive linked account", () => {
    expect(
      decideAccountRosterEligibility({
        ...eligibleCandidate,
        playerIsActive: false,
      }),
    ).toEqual({ eligible: false, reason: "player_inactive" });
  });

  it("rejects a missing account and a legacy manual player", () => {
    expect(
      decideAccountRosterEligibility({
        ...eligibleCandidate,
        accountExists: false,
      }),
    ).toEqual({ eligible: false, reason: "account_missing" });
    expect(
      decideAccountRosterEligibility({
        ...eligibleCandidate,
        appUserId: null,
      }),
    ).toEqual({ eligible: false, reason: "legacy_manual_player" });
  });

  it("blocks direct server selection bypasses, duplicates, and cross-club proxies", () => {
    const incomplete = {
      ...eligibleCandidate,
      playerId: "player-2",
      ratingProfileState: "in_progress" as const,
    };
    const otherClub = {
      ...eligibleCandidate,
      playerId: "player-3",
      workspaceId: "club-b",
    };

    for (const selectedPlayerIds of [
      [incomplete.playerId],
      [otherClub.playerId],
      [eligibleCandidate.playerId, eligibleCandidate.playerId],
      ["unknown-player"],
    ]) {
      expect(() =>
        assertAccountRosterSelection({
          workspaceId: "club-a",
          selectedPlayerIds,
          candidates: [eligibleCandidate, incomplete, otherClub],
        }),
      ).toThrow();
    }
  });

  it("reuses one global account identity across clubs without sharing membership", () => {
    const clubA = eligibleCandidate;
    const clubB = {
      ...eligibleCandidate,
      playerId: "club-b-player-proxy",
      workspaceId: "club-b",
    };
    const clubC = {
      ...eligibleCandidate,
      playerId: "club-c-player-proxy",
      workspaceId: "club-c",
      membershipState: "removed" as const,
    };

    expect(clubA.appUserId).toBe(clubB.appUserId);
    expect(decideAccountRosterEligibility(clubA).eligible).toBe(true);
    expect(decideAccountRosterEligibility(clubB).eligible).toBe(true);
    expect(decideAccountRosterEligibility(clubC).eligible).toBe(false);
  });

  it("does not mutate or relink legacy history while deciding eligibility", () => {
    const historical = Object.freeze({
      ...eligibleCandidate,
      playerId: "legacy-player",
      appUserId: null,
    });
    const before = { ...historical };

    expect(decideAccountRosterEligibility(historical).eligible).toBe(false);
    expect(historical).toEqual(before);
  });
});
