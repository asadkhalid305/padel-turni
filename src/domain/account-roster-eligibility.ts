export const rosterMembershipStates = [
  "accepted",
  "invited",
  "inactive",
  "removed",
] as const;

export type RosterMembershipState = (typeof rosterMembershipStates)[number];

export const ratingProfileStates = [
  "missing",
  "not_started",
  "in_progress",
  "completed",
] as const;

export type RatingProfileState = (typeof ratingProfileStates)[number];

export type AccountRosterCandidate = {
  playerId: string;
  workspaceId: string;
  appUserId: string | null;
  accountExists: boolean;
  membershipState: RosterMembershipState;
  playerIsActive: boolean;
  ratingProfileState: RatingProfileState;
};

export type RosterIneligibilityReason =
  | "legacy_manual_player"
  | "account_missing"
  | "membership_not_accepted"
  | "membership_inactive"
  | "player_inactive"
  | "rating_profile_incomplete";

export type AccountRosterEligibility =
  | { eligible: true; reason: null }
  | { eligible: false; reason: RosterIneligibilityReason };

/**
 * The one durable rule for future event rosters. Ratings belong to app
 * accounts globally; permission to join a roster belongs to the accepted,
 * current club membership and its workspace-local activation control.
 */
export function decideAccountRosterEligibility(
  candidate: AccountRosterCandidate,
): AccountRosterEligibility {
  if (!candidate.appUserId) {
    return { eligible: false, reason: "legacy_manual_player" };
  }
  if (!candidate.accountExists) {
    return { eligible: false, reason: "account_missing" };
  }
  if (candidate.membershipState === "inactive") {
    return { eligible: false, reason: "membership_inactive" };
  }
  if (candidate.membershipState !== "accepted") {
    return { eligible: false, reason: "membership_not_accepted" };
  }
  if (!candidate.playerIsActive) {
    return { eligible: false, reason: "player_inactive" };
  }
  if (candidate.ratingProfileState !== "completed") {
    return { eligible: false, reason: "rating_profile_incomplete" };
  }

  return { eligible: true, reason: null };
}

export function assertAccountRosterSelection(options: {
  workspaceId: string;
  selectedPlayerIds: readonly string[];
  candidates: readonly AccountRosterCandidate[];
}) {
  const uniqueIds = new Set(options.selectedPlayerIds);
  if (uniqueIds.size !== options.selectedPlayerIds.length) {
    throw new Error("Choose each eligible club member only once.");
  }

  const byPlayerId = new Map(
    options.candidates.map((candidate) => [candidate.playerId, candidate]),
  );
  for (const playerId of options.selectedPlayerIds) {
    const candidate = byPlayerId.get(playerId);
    if (
      !candidate ||
      candidate.workspaceId !== options.workspaceId ||
      !decideAccountRosterEligibility(candidate).eligible
    ) {
      throw new Error(
        "Every participant must be an active club member who accepted the invitation and completed their rating profile.",
      );
    }
  }
}
