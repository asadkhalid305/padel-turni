import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assertAccountRosterSelection,
  decideAccountRosterEligibility,
  type AccountRosterCandidate,
  type RatingProfileState,
} from "@/domain/account-roster-eligibility";
import { toDisplayLevel } from "@/domain/ratings/display-level";
import type { RatingSnapshotSource } from "@/domain/ratings/event-snapshots";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

export type AccountRosterPlayer = {
  id: string;
  name: string;
  rating: number;
  isActive: true;
  appUserId: string;
};

type SourcePlayer = {
  id: string;
  workspace_id: string | null;
  name: string;
  rating: number;
  is_active: boolean;
  app_user_id: string | null;
};

type LoadedRosterCandidate = AccountRosterCandidate & {
  source: SourcePlayer;
  accountName: string | null;
  ratingProfile: {
    onboarding_status: RatingProfileState;
    mu: number | null;
    sigma: number | null;
    engine_version: string | null;
  } | null;
};

function snapshotSource(
  candidate: LoadedRosterCandidate,
): RatingSnapshotSource {
  const profile = candidate.ratingProfile;
  if (
    candidate.ratingProfileState !== "completed" ||
    !profile ||
    profile.mu === null ||
    profile.sigma === null ||
    !profile.engine_version
  ) {
    throw new Error(
      "Every selected account must have a completed current rating profile.",
    );
  }
  return {
    playerId: candidate.source.id,
    appUserId: candidate.appUserId as string,
    name: candidate.accountName || candidate.source.name,
    profile: {
      onboardingStatus: "completed",
      mu: Number(profile.mu),
      sigma: Number(profile.sigma),
      displayedLevel: toDisplayLevel(Number(profile.mu)),
      engineVersion: profile.engine_version,
    },
  };
}

export async function listEligibleAccountRosterPlayers(
  client: Client,
  workspaceId: string,
): Promise<AccountRosterPlayer[]> {
  const candidates = await loadRosterCandidates(client, workspaceId);

  return candidates
    .filter((candidate) => decideAccountRosterEligibility(candidate).eligible)
    .map((candidate) => {
      const snapshot = snapshotSource(candidate);
      return {
        id: candidate.playerId,
        name: snapshot.name,
        rating: snapshot.profile.displayedLevel,
        isActive: true as const,
        appUserId: snapshot.appUserId,
      };
    })
    .sort((first, second) => first.name.localeCompare(second.name));
}

export async function getOrderedEligibleRosterSourcePlayers(
  client: Client,
  workspaceId: string,
  playerIds: string[],
) {
  const candidates = await loadRosterCandidates(client, workspaceId, playerIds);
  assertAccountRosterSelection({
    workspaceId,
    selectedPlayerIds: playerIds,
    candidates,
  });

  const byPlayerId = new Map(
    candidates.map((candidate) => [candidate.playerId, candidate]),
  );
  return playerIds.map((playerId) => {
    const candidate = byPlayerId.get(playerId);
    if (!candidate) {
      throw new Error("Selected club member no longer exists.");
    }
    return snapshotSource(candidate);
  });
}

async function loadRosterCandidates(
  client: Client,
  workspaceId: string,
  playerIds?: string[],
): Promise<LoadedRosterCandidate[]> {
  let playerQuery = client
    .from("players")
    .select("id,workspace_id,name,rating,is_active,app_user_id")
    .eq("workspace_id", workspaceId);
  if (playerIds) playerQuery = playerQuery.in("id", playerIds);

  const { data: players, error: playersError } = await playerQuery;
  if (playersError) throw playersError;
  if (!players.length) return [];

  const appUserIds = [
    ...new Set(
      players
        .map((player) => player.app_user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!appUserIds.length) {
    return players.map((player) =>
      candidateFromRows({
        player,
        workspaceId,
        accountName: null,
        accountExists: false,
        hasMembership: false,
        ratingProfileState: "missing",
        ratingProfile: null,
      }),
    );
  }

  const [accountsResult, membershipsResult, profilesResult] = await Promise.all(
    [
      client
        .from("app_users")
        .select("id,display_name,email")
        .in("id", appUserIds),
      client
        .from("workspace_memberships")
        .select("app_user_id")
        .eq("workspace_id", workspaceId)
        .in("app_user_id", appUserIds),
      client
        .from("rating_profiles")
        .select("app_user_id,onboarding_status,mu,sigma,engine_version")
        .in("app_user_id", appUserIds),
    ],
  );
  if (accountsResult.error) throw accountsResult.error;
  if (membershipsResult.error) throw membershipsResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const accountById = new Map(
    accountsResult.data.map((account) => [account.id, account]),
  );
  const memberIds = new Set(
    membershipsResult.data.map((membership) => membership.app_user_id),
  );
  const profileStateById = new Map(
    profilesResult.data.map((profile) => [
      profile.app_user_id,
      profile.onboarding_status as RatingProfileState,
    ]),
  );

  return players.map((player) => {
    const account = player.app_user_id
      ? accountById.get(player.app_user_id)
      : undefined;
    return candidateFromRows({
      player,
      workspaceId,
      accountName: account?.display_name || account?.email || null,
      accountExists: Boolean(account),
      hasMembership: Boolean(
        player.app_user_id && memberIds.has(player.app_user_id),
      ),
      ratingProfileState: player.app_user_id
        ? (profileStateById.get(player.app_user_id) ?? "missing")
        : "missing",
      ratingProfile: player.app_user_id
        ? (profilesResult.data.find(
            (profile) => profile.app_user_id === player.app_user_id,
          ) ?? null)
        : null,
    });
  });
}

function candidateFromRows(options: {
  player: SourcePlayer;
  workspaceId: string;
  accountName: string | null;
  accountExists: boolean;
  hasMembership: boolean;
  ratingProfileState: RatingProfileState;
  ratingProfile: LoadedRosterCandidate["ratingProfile"];
}): LoadedRosterCandidate {
  return {
    playerId: options.player.id,
    workspaceId: options.workspaceId,
    appUserId: options.player.app_user_id,
    accountExists: options.accountExists,
    membershipState: options.hasMembership ? "accepted" : "removed",
    playerIsActive: options.player.is_active,
    ratingProfileState: options.ratingProfileState,
    ratingProfile: options.ratingProfile,
    source: options.player,
    accountName: options.accountName,
  };
}
