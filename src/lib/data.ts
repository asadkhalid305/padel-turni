import "server-only";

import { createHash } from "node:crypto";

import { canChangeEventSchedule } from "@/domain/event-mutations";
import { effectiveEventStatus } from "@/domain/event-status";
import { calculateStandings } from "@/domain/standings";
import type {
  CompletedMatch,
  DrawStrategy,
  PlayerSeed,
  ScheduledMatch,
} from "@/domain/types";
import { demoEvent, demoEvents, demoPlayers } from "@/lib/demo-data";
import { sortCareerRows, type CareerPlayerStats } from "@/lib/career-ranking";
import { getEventEmailDeliverySummary } from "@/lib/event-completion-emails";
import type { AppUserRole, WorkspaceRole } from "@/lib/roles";
import {
  createServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { ensureWorkspaceMemberPlayers } from "@/lib/workspaces";
import type { Database } from "@/types/database";

type PlayerRecord = {
  id: string;
  name: string;
  appUserId: string | null;
  accountEmail: string | null;
  accountDisplayName: string | null;
  rating: number;
  isActive: boolean;
};

export type EventFormInitialValues = {
  name: string;
  venue: string;
  startsAt: string;
  courtCount: number;
  courtMinutes: number[];
  requestedRoundMinutes: number;
  breakMinutes: number;
  notes: string;
  playerIds: string[];
  scheduleLocked: boolean;
  drawStrategy: DrawStrategy;
};

export type WorkspaceInvite = {
  id: string;
  invitedEmail: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
};

export type WorkspaceInvitePreview = {
  status: "pending" | "accepted" | "revoked" | "expired" | "missing";
  workspaceName: string | null;
  invitedEmail: string | null;
  expiresAt: string | null;
};

export type WorkspaceMember = {
  membershipId: string;
  appUserId: string;
  email: string;
  displayName: string;
  role: WorkspaceRole;
  linkedPlayerName: string | null;
};

type EventSummary = {
  id: string;
  name: string;
  venue: string;
  startsAt: string;
  status: string;
  isArchived: boolean;
  standingsEligible: boolean;
  playerCount: number;
  completedMatches: number;
  totalMatches: number;
};

export type EventMatch = ScheduledMatch & {
  status: string;
  teamOneScore: number | null;
  teamTwoScore: number | null;
  timerStartedAt: string | null;
  timerPausedAt: string | null;
  timerAccumulatedPauseSeconds: number;
  timerDurationSeconds: number;
};

type EventSummaryQuery = Pick<
  Database["public"]["Tables"]["events"]["Row"],
  | "id"
  | "name"
  | "venue"
  | "starts_at"
  | "status"
  | "archived_at"
  | "standings_eligible"
> & {
  event_players: { count: number }[];
  matches: { status: string }[];
};

type MatchRow = Database["public"]["Tables"]["matches"]["Row"];
type RoundWithMatches = Database["public"]["Tables"]["event_rounds"]["Row"] & {
  matches: MatchRow[];
};
type PlayerReadRow = Pick<
  Database["public"]["Tables"]["players"]["Row"],
  "id" | "name" | "account_email" | "rating" | "is_active"
> & {
  app_user_id: string | null;
};
type EventPlayerRow = Database["public"]["Tables"]["event_players"]["Row"];

export async function listPlayers(
  workspaceId?: string | null,
): Promise<PlayerRecord[]> {
  const client = createServerClient();
  if (!client) {
    return demoPlayers.map((player) => ({
      ...player,
      appUserId: null,
      accountEmail: null,
      accountDisplayName: null,
      isActive: true,
    }));
  }
  if (!workspaceId) return [];

  await ensureWorkspaceMemberPlayers(client, workspaceId);

  const { data, error } = await client
    .from("players")
    .select("id,name,app_user_id,account_email,rating,is_active")
    .eq("workspace_id", workspaceId)
    .order("is_active", { ascending: false })
    .order("name");
  let players: PlayerReadRow[];
  if (isUndefinedColumnError(error)) {
    const { data: fallbackData, error: fallbackError } = await client
      .from("players")
      .select("id,name,account_email,rating,is_active")
      .eq("workspace_id", workspaceId)
      .order("is_active", { ascending: false })
      .order("name");
    if (fallbackError) throw fallbackError;
    players = fallbackData.map((player) => ({
      ...player,
      app_user_id: null,
    }));
  } else {
    if (error) throw error;
    players = data;
  }

  const appUserIds = players
    .map((player) => player.app_user_id)
    .filter((id): id is string => Boolean(id));
  const accountEmails = players
    .map((player) => player.account_email)
    .filter((email): email is string => Boolean(email));
  const userById = new Map<
    string,
    { id: string; email: string; displayName: string }
  >();
  const userByEmail = new Map<
    string,
    { id: string; email: string; displayName: string }
  >();
  if (appUserIds.length || accountEmails.length) {
    const { data: users, error: usersError } = await client
      .from("app_users")
      .select("id,email,display_name")
      .or(
        [
          appUserIds.length ? `id.in.(${appUserIds.join(",")})` : null,
          accountEmails.length ? `email.in.(${accountEmails.join(",")})` : null,
        ]
          .filter((clause): clause is string => Boolean(clause))
          .join(","),
      );
    if (usersError) throw usersError;
    users.forEach((user) => {
      const appUser = {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
      };
      userById.set(user.id, appUser);
      userByEmail.set(user.email, appUser);
    });
  }

  return players.map((player) => {
    const linkedUser =
      userById.get(player.app_user_id ?? "") ??
      userByEmail.get(player.account_email ?? "");
    return {
      id: player.id,
      name: linkedUser?.displayName || player.name,
      appUserId: player.app_user_id ?? linkedUser?.id ?? null,
      accountEmail: linkedUser?.email ?? player.account_email,
      accountDisplayName: linkedUser?.displayName ?? null,
      rating: Number(player.rating),
      isActive: player.is_active,
    };
  });
}

export async function listWorkspaceInvites(
  workspaceId?: string | null,
): Promise<WorkspaceInvite[]> {
  const client = createServerClient();
  if (!client || !workspaceId) return [];

  const { data, error } = await client
    .from("workspace_invites")
    .select("id,invited_email,status,expires_at,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return data.map((invite) => ({
    id: invite.id,
    invitedEmail: invite.invited_email,
    status: invite.status,
    expiresAt: invite.expires_at,
    createdAt: invite.created_at,
  }));
}

export async function listWorkspaceMembers(
  workspaceId?: string | null,
): Promise<WorkspaceMember[]> {
  const client = createServerClient();
  if (!client || !workspaceId) return [];

  const { data: memberships, error: membershipsError } = await client
    .from("workspace_memberships")
    .select("id,app_user_id,role")
    .eq("workspace_id", workspaceId)
    .order("created_at");
  if (membershipsError) throw membershipsError;
  if (!memberships.length) return [];

  const appUserIds = memberships.map((membership) => membership.app_user_id);
  const [{ data: users, error: usersError }, playersResult] = await Promise.all(
    [
      client
        .from("app_users")
        .select("id,email,display_name")
        .in("id", appUserIds)
        .order("email"),
      client
        .from("players")
        .select("name,app_user_id")
        .eq("workspace_id", workspaceId)
        .in("app_user_id", appUserIds),
    ],
  );
  if (usersError) throw usersError;
  if (playersResult.error) throw playersResult.error;

  const userById = new Map(users.map((user) => [user.id, user]));
  const playerNameByAppUserId = new Map(
    playersResult.data.map((player) => [player.app_user_id, player.name]),
  );

  return memberships.map((membership) => {
    const user = userById.get(membership.app_user_id);
    return {
      membershipId: membership.id,
      appUserId: membership.app_user_id,
      email: user?.email ?? "unknown account",
      displayName: user?.display_name ?? "",
      role: membership.role,
      linkedPlayerName:
        playerNameByAppUserId.get(membership.app_user_id) ?? null,
    };
  });
}

export async function getWorkspaceInvitePreview(
  token: string,
): Promise<WorkspaceInvitePreview> {
  const client = createServerClient();
  if (!client) {
    return {
      status: "missing",
      workspaceName: null,
      invitedEmail: null,
      expiresAt: null,
    };
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await client
    .from("workspace_invites")
    .select("invited_email,status,expires_at,workspaces(name)")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      status: "missing",
      workspaceName: null,
      invitedEmail: null,
      expiresAt: null,
    };
  }
  const workspaceName = getInviteWorkspaceName(data.workspaces);
  if (data.status === "pending" && new Date(data.expires_at) <= new Date()) {
    return {
      status: "expired",
      workspaceName,
      invitedEmail: data.invited_email,
      expiresAt: data.expires_at,
    };
  }

  return {
    status: data.status,
    workspaceName,
    invitedEmail: data.invited_email,
    expiresAt: data.expires_at,
  };
}

export async function canViewPrivateData(
  user: {
    id: string;
    email?: string;
    role: AppUserRole;
    activeWorkspaceId?: string | null;
  } | null,
) {
  const client = createServerClient();
  if (!client) return true;
  if (!user) return false;
  return Boolean(user.activeWorkspaceId);
}

function isUndefinedColumnError(error: { code?: string } | null) {
  return error?.code === "42703";
}

function getInviteWorkspaceName(value: unknown) {
  if (!value || Array.isArray(value)) return null;
  if (typeof value !== "object" || !("name" in value)) return null;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" ? name : null;
}

export async function listEvents(
  workspaceId?: string | null,
  view: "active" | "archived" = "active",
): Promise<EventSummary[]> {
  const client = createServerClient();
  if (!client) {
    return demoEvents.map((event) => ({
      id: event.id,
      name: event.name,
      venue: event.venue,
      startsAt: event.startsAt,
      status: effectiveEventStatus({
        status: event.status,
        startsAt: event.startsAt,
      }),
      isArchived: false,
      standingsEligible: true,
      playerCount: event.players.length,
      completedMatches: event.completedMatches.length,
      totalMatches: event.schedule.rounds.flatMap((round) => round.matches)
        .length,
    }));
  }
  if (!workspaceId) return [];

  const { data, error } = await client
    .from("events")
    .select(
      "id,name,venue,starts_at,status,archived_at,standings_eligible,event_players(count),matches(status)",
    )
    .eq("workspace_id", workspaceId)
    .order("starts_at", { ascending: false });
  if (error) throw error;

  const eventRows = data as unknown as EventSummaryQuery[];
  return eventRows
    .filter((event) => {
      const isArchived =
        Boolean(event.archived_at) ||
        event.status === "archived" ||
        event.status === "cancelled";
      return view === "archived" ? isArchived : !isArchived;
    })
    .map((event) => {
      const matches = event.matches;
      const playerAggregate = event.event_players;
      return {
        id: event.id,
        name: event.name,
        venue: event.venue,
        startsAt: event.starts_at,
        status:
          event.status === "archived"
            ? "cancelled"
            : effectiveEventStatus({
                status: event.status,
                startsAt: event.starts_at,
              }),
        isArchived: Boolean(event.archived_at) || event.status === "archived",
        standingsEligible: event.standings_eligible,
        playerCount: playerAggregate[0]?.count ?? 0,
        completedMatches: matches.filter(
          (match) => match.status === "completed",
        ).length,
        totalMatches: matches.length,
      };
    });
}

export async function getEvent(eventId: string, workspaceId?: string | null) {
  if (!isSupabaseConfigured() && eventId.startsWith("demo-event")) {
    return {
      ...demoEvent,
      id: eventId,
      isArchived: false,
      standingsEligible: true,
      emailDeliverySummary: null,
    };
  }

  const client = createServerClient();
  if (!client) return null;
  if (!workspaceId) return null;

  const [{ data: event, error: eventError }, playersResult, roundsResult] =
    await Promise.all([
      client
        .from("events")
        .select("*")
        .eq("id", eventId)
        .eq("workspace_id", workspaceId)
        .single(),
      client
        .from("event_players")
        .select("*")
        .eq("event_id", eventId)
        .order("display_order"),
      client
        .from("event_rounds")
        .select("*,matches(*)")
        .eq("event_id", eventId)
        .order("round_number"),
    ]);

  if (eventError) return null;
  if (playersResult.error) throw playersResult.error;
  if (roundsResult.error) throw roundsResult.error;

  const players: PlayerSeed[] = playersResult.data.map((player) => ({
    id: player.id,
    name: player.name_snapshot,
    rating: Number(player.rating_snapshot),
  }));
  const emailDeliverySummary = await getEventEmailDeliverySummary({
    client,
    workspaceId,
    eventId,
    rosterCount: players.length,
  });
  const playerById = new Map(players.map((player) => [player.id, player]));
  const completedMatches: CompletedMatch[] = [];
  const rounds = roundsResult.data as unknown as RoundWithMatches[];

  const schedule = {
    seed: event.seed,
    rounds: rounds.map((round) => {
      const matches = round.matches
        .slice()
        .sort((first, second) => first.court_number - second.court_number)
        .map((match): EventMatch => {
          const scheduled = {
            id: match.id,
            roundNumber: round.round_number,
            courtNumber: match.court_number,
            teamOne: [
              match.team_one_player_one_id,
              match.team_one_player_two_id,
            ] as [string, string],
            teamTwo: [
              match.team_two_player_one_id,
              match.team_two_player_two_id,
            ] as [string, string],
          };
          if (
            match.status === "completed" &&
            match.team_one_score !== null &&
            match.team_two_score !== null
          ) {
            completedMatches.push({
              ...scheduled,
              status: "completed",
              teamOneScore: match.team_one_score,
              teamTwoScore: match.team_two_score,
            });
          }
          return {
            ...scheduled,
            status: match.status,
            teamOneScore: match.team_one_score,
            teamTwoScore: match.team_two_score,
            timerStartedAt: match.timer_started_at,
            timerPausedAt: match.timer_paused_at,
            timerAccumulatedPauseSeconds: match.timer_accumulated_pause_seconds,
            timerDurationSeconds: match.timer_duration_seconds,
          };
        });
      const playing = new Set(
        matches.flatMap((match) => [...match.teamOne, ...match.teamTwo]),
      );
      return {
        roundNumber: round.round_number,
        courtCount: round.court_count,
        matches,
        restingPlayerIds: players
          .filter((player) => !playing.has(player.id))
          .map((player) => player.id),
      };
    }),
  };

  return {
    id: event.id,
    name: event.name,
    venue: event.venue,
    startsAt: event.starts_at,
    status: effectiveEventStatus({
      status: event.status === "archived" ? "cancelled" : event.status,
      startsAt: event.starts_at,
    }),
    isArchived: Boolean(event.archived_at) || event.status === "archived",
    standingsEligible: event.standings_eligible,
    drawStrategy: event.draw_strategy,
    seed: event.seed,
    roundMinutes: event.round_minutes,
    breakMinutes: event.break_minutes,
    notes: event.notes,
    players,
    playerById,
    schedule,
    completedMatches,
    standings: calculateStandings(players, completedMatches),
    emailDeliverySummary,
  };
}

export async function getEventFormInitialValues(
  eventId: string,
  workspaceId?: string | null,
): Promise<EventFormInitialValues | null> {
  const client = createServerClient();
  if (!client) return null;
  if (!workspaceId) return null;

  const [{ data: event, error: eventError }, playersResult, roundsResult] =
    await Promise.all([
      client
        .from("events")
        .select(
          "name,venue,starts_at,round_minutes,break_minutes,notes,draw_strategy",
        )
        .eq("id", eventId)
        .eq("workspace_id", workspaceId)
        .single(),
      client
        .from("event_players")
        .select("*")
        .eq("event_id", eventId)
        .order("display_order"),
      client
        .from("event_rounds")
        .select("round_number,matches(court_number,status)")
        .eq("event_id", eventId)
        .order("round_number"),
    ]);

  if (eventError) return null;
  if (playersResult.error) throw playersResult.error;
  if (roundsResult.error) throw roundsResult.error;

  const players = playersResult.data as EventPlayerRow[];
  const matchStatuses = roundsResult.data.flatMap((round) =>
    round.matches.map((match) => match.status),
  );
  const courtSlotCounts = new Map<number, number>();
  for (const round of roundsResult.data) {
    for (const match of round.matches) {
      courtSlotCounts.set(
        match.court_number,
        (courtSlotCounts.get(match.court_number) ?? 0) + 1,
      );
    }
  }
  const courtCount = Math.max(...courtSlotCounts.keys(), 1);
  const courtMinutes = Array.from({ length: courtCount }, (_, index) => {
    const slots = courtSlotCounts.get(index + 1) ?? 0;
    return slots > 0
      ? slots * event.round_minutes + (slots - 1) * event.break_minutes
      : event.round_minutes;
  });

  return {
    name: event.name,
    venue: event.venue,
    startsAt: event.starts_at,
    courtCount,
    courtMinutes,
    requestedRoundMinutes: event.round_minutes,
    breakMinutes: event.break_minutes,
    notes: event.notes,
    playerIds: players.map((player) => player.player_id),
    scheduleLocked: !canChangeEventSchedule({ matchStatuses }),
    drawStrategy: event.draw_strategy,
  };
}

export async function getHistoricalPlayerStats(workspaceId?: string | null) {
  const client = createServerClient();
  if (!client) {
    return sortCareerRows(
      demoEvent.standings.map((standing) => ({
        playerId: standing.playerId,
        playerName: standing.playerName,
        events: 2,
        matches: standing.played * 2,
        wins: standing.wins * 2,
        averagePoints: standing.averagePoints,
        winRate: standing.winRate,
      })),
    );
  }
  if (!workspaceId) return [];

  const { data: workspaceEvents, error: workspaceEventsError } = await client
    .from("events")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("standings_eligible", true);
  if (workspaceEventsError) throw workspaceEventsError;
  const eventIds = workspaceEvents.map((event) => event.id);
  if (!eventIds.length) return [];

  const [snapshotsResult, matchesResult] = await Promise.all([
    client
      .from("event_players")
      .select("id,player_id,name_snapshot,event_id")
      .in("event_id", eventIds),
    client
      .from("matches")
      .select(
        "event_id,team_one_player_one_id,team_one_player_two_id,team_two_player_one_id,team_two_player_two_id,team_one_score,team_two_score",
      )
      .in("event_id", eventIds)
      .eq("status", "completed"),
  ]);
  if (snapshotsResult.error) throw snapshotsResult.error;
  if (matchesResult.error) throw matchesResult.error;

  const snapshotById = new Map(
    snapshotsResult.data.map((snapshot) => [snapshot.id, snapshot]),
  );
  const stats = new Map<
    string,
    {
      playerId: string;
      playerName: string;
      events: Set<string>;
      matches: number;
      wins: number;
      points: number;
    }
  >();

  for (const match of matchesResult.data) {
    const teams = [
      {
        ids: [match.team_one_player_one_id, match.team_one_player_two_id],
        points: match.team_one_score ?? 0,
        won: (match.team_one_score ?? 0) > (match.team_two_score ?? 0),
      },
      {
        ids: [match.team_two_player_one_id, match.team_two_player_two_id],
        points: match.team_two_score ?? 0,
        won: (match.team_two_score ?? 0) > (match.team_one_score ?? 0),
      },
    ];
    for (const team of teams) {
      for (const snapshotId of team.ids) {
        const snapshot = snapshotById.get(snapshotId);
        if (!snapshot) continue;
        const current = stats.get(snapshot.player_id) ?? {
          playerId: snapshot.player_id,
          playerName: snapshot.name_snapshot,
          events: new Set<string>(),
          matches: 0,
          wins: 0,
          points: 0,
        };
        current.events.add(match.event_id);
        current.matches += 1;
        current.wins += team.won ? 1 : 0;
        current.points += team.points;
        stats.set(snapshot.player_id, current);
      }
    }
  }

  const rows: CareerPlayerStats[] = [...stats.values()].map((row) => ({
    ...row,
    events: row.events.size,
    averagePoints: row.matches ? row.points / row.matches : 0,
    winRate: row.matches ? row.wins / row.matches : 0,
  }));

  return sortCareerRows(rows);
}
