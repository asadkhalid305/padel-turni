"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { assertCanRegenerate } from "@/domain/consistency";
import { canEditDrawLineup } from "@/domain/draw-permissions";
import {
  eventModePersistence,
  eventModeUpdatePersistence,
} from "@/domain/event-eligibility";
import {
  canChangeEventCompetitionMode,
  canChangeEventSchedule,
  canCompleteEvent,
  canDeleteEvent as canDeleteEventRecord,
  canEditEventDetails,
  canReshuffleRandomDraw,
  hasSameStableIds,
} from "@/domain/event-mutations";
import { effectiveEventStatus } from "@/domain/event-status";
import { assertValidRoundLineup } from "@/domain/lineup-validation";
import { calculateScheduleCapacity } from "@/domain/schedule-calculations";
import type { ScheduleCapacity } from "@/domain/schedule-calculations";
import { generateSchedule } from "@/domain/scheduler";
import {
  selectEventRatingSnapshots,
  type EventRatingSnapshot,
  type ExistingEventRatingSnapshot,
} from "@/domain/ratings/event-snapshots";
import type { DrawStrategy, PlayerSeed, Schedule } from "@/domain/types";
import {
  ACTIVE_WORKSPACE_COOKIE,
  createAuthClient,
  createServerClient,
  getAuthenticatedUser,
  requireWorkspaceAdminUser,
} from "@/lib/supabase/server";
import { deliverFinalStandingsEmails } from "@/lib/event-completion-emails";
import { processInitialEventRating } from "@/lib/event-rating-application";
import { sendViaResend } from "@/lib/email";
import { getOrderedEligibleRosterSourcePlayers } from "@/lib/account-rosters";
import { recordProductEvent } from "@/lib/product-analytics";
import {
  checkPublicRequestLimit,
  FEEDBACK_REQUEST_LIMIT,
  FEEDBACK_WINDOW_SECONDS,
  isLikelyAutomatedFeedback,
} from "@/lib/public-request-protection";
import { eventSchema, scoreSchema } from "@/lib/validation";
import { requestOrigin } from "@/lib/request-origin";
import { ensureWorkspaceMemberPlayer } from "@/lib/workspaces";
import type { Database } from "@/types/database";

export type ActionState = {
  ok: boolean;
  message: string;
  inviteUrl?: string;
  drawSeed?: number;
};

const unavailable: ActionState = {
  ok: false,
  message: "Connect Supabase to enable persistent changes.",
};

const forbidden: ActionState = {
  ok: false,
  message: "Only admins can make changes.",
};

const guardedFeedback: ActionState = {
  ok: true,
  message: "Thanks. If your message was accepted, it will be reviewed.",
};

const workspaceMemberRosterSettingsSchema = z.object({
  membershipId: z.string().uuid(),
  role: z.enum(["member", "admin"]).optional(),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});
const workspaceMembershipIdSchema = z.string().uuid();
const workspaceIdSchema = z.string().uuid();

const eventIdSchema = z.string().uuid();
const retryRatingJobSchema = z.object({
  eventId: z.string().uuid(),
  jobId: z.string().uuid(),
});
const reshuffleSchema = z.object({
  eventId: z.string().uuid(),
  expectedSeed: z.coerce.number().int().positive(),
});
const matchMutationSchema = z.object({
  eventId: z.string().uuid(),
  matchId: z.string().uuid(),
});
const inviteTokenSchema = z.string().min(32).max(256);
const inviteEmailSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim().toLowerCase();
  return trimmed ? trimmed : null;
}, z.string().email().nullable());
const inviteExpiryDaysSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(30)
  .default(14);
const feedbackSchema = z.object({
  email: inviteEmailSchema,
  category: z
    .enum(["general", "bug", "onboarding", "invite", "event"])
    .default("general"),
  message: z.string().trim().min(10).max(2000),
});
type EventInput = z.infer<typeof eventSchema>;
type ServerClient = NonNullable<ReturnType<typeof createServerClient>>;
type WorkspaceAdminUser = NonNullable<
  Awaited<ReturnType<typeof requireWorkspaceAdminUser>>
> & { activeWorkspaceId: string };
type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventPlayerSnapshot = Pick<
  Database["public"]["Tables"]["event_players"]["Row"],
  | "id"
  | "player_id"
  | "name_snapshot"
  | "rating_snapshot"
  | "display_order"
  | "app_user_id_snapshot"
  | "rating_mu_snapshot"
  | "rating_sigma_snapshot"
  | "displayed_level_snapshot"
  | "rating_engine_version_snapshot"
>;
type RoundCapacityRow = Pick<
  Database["public"]["Tables"]["event_rounds"]["Row"],
  "round_number" | "court_count" | "duration_seconds"
> & {
  matches: Pick<
    Database["public"]["Tables"]["matches"]["Row"],
    "court_number"
  >[];
};

const roundLineupSchema = z
  .object({
    eventId: z.string().uuid(),
    roundNumber: z.coerce.number().int().positive(),
    matchIds: z.array(z.string().uuid()).min(1),
    playerIds: z.array(z.string().uuid()).min(4),
  })
  .superRefine((draw, context) => {
    if (new Set(draw.matchIds).size !== draw.matchIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each match can only appear once in a round draw.",
        path: ["matchIds"],
      });
    }
    if (draw.playerIds.length !== draw.matchIds.length * 4) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose four players for every court.",
        path: ["playerIds"],
      });
    }
  });

async function requireWorkspaceAdminAction(): Promise<
  WorkspaceAdminUser | ActionState
> {
  const user = await requireWorkspaceAdminUser();
  if (!user?.activeWorkspaceId) return forbidden;

  return user as WorkspaceAdminUser;
}

function isActionState(value: ActionState | object): value is ActionState {
  return "ok" in value && "message" in value;
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function signOut() {
  const authClient = await createAuthClient();
  if (authClient) {
    await authClient.auth.signOut();
  }
  redirect("/login");
}

export async function switchActiveWorkspace(formData: FormData) {
  const workspaceId = workspaceIdSchema.safeParse(formData.get("workspaceId"));
  if (!workspaceId.success) {
    redirect("/");
  }

  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const client = createServerClient();
  if (!client) {
    redirect("/");
  }

  const { data: membership, error } = await client
    .from("workspace_memberships")
    .select("workspace_id")
    .eq("workspace_id", workspaceId.data)
    .eq("app_user_id", user.id)
    .maybeSingle();
  if (error || !membership) {
    redirect("/");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, membership.workspace_id, {
    sameSite: "lax",
    path: "/",
  });
  revalidatePath("/", "layout");
  redirect(safeInternalPath(formData.get("nextPath")));
}

function safeInternalPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function formatDeliveryResult(result: {
  sent: number;
  failed: number;
  pending: number;
  skipped: number;
  total: number;
  isConfigured: boolean;
}) {
  if (!result.total && !result.skipped) {
    return "No linked player emails were eligible for final standings.";
  }

  if (!result.isConfigured) {
    return `Final standings emails were queued for ${result.total} linked players, but Resend is not configured yet.`;
  }

  const parts = [`${result.sent} sent`];
  if (result.failed) parts.push(`${result.failed} failed`);
  if (result.pending) parts.push(`${result.pending} pending`);
  return `Final standings emails: ${parts.join(", ")}.`;
}

export async function submitFeedback(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (
    isLikelyAutomatedFeedback({
      honeypot: formData.get("company"),
      startedAt: formData.get("startedAt"),
    })
  ) {
    return guardedFeedback;
  }

  const parsed = feedbackSchema.safeParse({
    email: formData.get("email"),
    category: formData.get("category") || undefined,
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  const client = createServerClient();
  if (!client) {
    return { ok: false, message: "Unable to send feedback right now." };
  }
  const isAllowed = await checkPublicRequestLimit({
    client,
    scope: "feedback",
    windowSeconds: FEEDBACK_WINDOW_SECONDS,
    maxRequests: FEEDBACK_REQUEST_LIMIT,
  });
  if (!isAllowed) return guardedFeedback;

  const user = await getAuthenticatedUser();

  try {
    await sendContactFeedbackEmail({
      category: parsed.data.category,
      email: parsed.data.email,
      message: parsed.data.message,
      user,
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to send feedback.",
    };
  }

  await client.from("feedback_messages").insert({
    workspace_id: user?.activeWorkspaceId ?? null,
    app_user_id: user?.id ?? null,
    email: parsed.data.email,
    category: parsed.data.category,
    message: parsed.data.message,
  });

  await recordProductEvent({
    client,
    eventType: "feedback_submitted",
    metadata: { category: parsed.data.category },
    user: user ?? undefined,
  });

  return { ok: true, message: "Thanks. Your feedback was sent." };
}

async function sendContactFeedbackEmail({
  category,
  email,
  message,
  user,
}: {
  category: "general" | "bug" | "onboarding" | "invite" | "event";
  email: string | null;
  message: string;
  user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
}) {
  const to = process.env.RESEND_SUPPORT_EMAIL;
  if (!to) {
    throw new Error("Support email is not configured.");
  }

  const requester = email ?? user?.email ?? "No email provided";
  const workspace = user?.activeWorkspaceId ?? "Public visitor";
  const subject = `Padel Turni feedback: ${category}`;
  const text = [
    `Topic: ${category}`,
    `From: ${requester}`,
    `User: ${user?.email ?? "Not signed in"}`,
    `Workspace: ${workspace}`,
    "",
    message,
  ].join("\n");

  await sendViaResend({
    to,
    subject,
    text,
    html: `<p><strong>Topic:</strong> ${escapeHtml(category)}</p><p><strong>From:</strong> ${escapeHtml(requester)}</p><p><strong>User:</strong> ${escapeHtml(user?.email ?? "Not signed in")}</p><p><strong>Workspace:</strong> ${escapeHtml(workspace)}</p><hr /><p>${escapeHtml(message).replaceAll("\n", "<br />")}</p>`,
    replyTo: email,
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function updateWorkspaceMemberRosterSettings(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = workspaceMemberRosterSettingsSchema.safeParse({
    membershipId: formData.get("membershipId"),
    role: formData.get("workspaceRole") || undefined,
    isActive: formData.getAll("isActive").includes("true") ? "true" : "false",
  });
  if (!parsed.success) {
    return { ok: false, message: "Choose valid member roster settings." };
  }
  const adminUser = await requireWorkspaceAdminAction();
  if (isActionState(adminUser)) return adminUser;

  const client = createServerClient();
  if (!client) return unavailable;
  const { data: membership, error: membershipError } = await client
    .from("workspace_memberships")
    .select("id,app_user_id,role")
    .eq("id", parsed.data.membershipId)
    .eq("workspace_id", adminUser.activeWorkspaceId)
    .single();
  if (membershipError) return { ok: false, message: membershipError.message };
  if (
    parsed.data.role &&
    membership.app_user_id === adminUser.id &&
    parsed.data.role !== membership.role
  ) {
    return { ok: false, message: "You cannot change your own club role." };
  }
  if (parsed.data.role && membership.role === "owner") {
    return { ok: false, message: "Club owners cannot be changed here." };
  }

  const { error: playerError } = await client
    .from("players")
    .update({ is_active: parsed.data.isActive })
    .eq("workspace_id", adminUser.activeWorkspaceId)
    .eq("app_user_id", membership.app_user_id);
  if (playerError) return { ok: false, message: playerError.message };

  if (parsed.data.role && parsed.data.role !== membership.role) {
    const { error: roleError } = await client
      .from("workspace_memberships")
      .update({ role: parsed.data.role })
      .eq("id", membership.id)
      .eq("workspace_id", adminUser.activeWorkspaceId);
    if (roleError) return { ok: false, message: roleError.message };
  }

  revalidatePath("/players");
  revalidatePath("/events/new");
  revalidatePath("/");
  return { ok: true, message: "Member roster settings updated." };
}

export async function removeWorkspaceMember(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const membershipId = workspaceMembershipIdSchema.safeParse(
    formData.get("membershipId"),
  );
  if (!membershipId.success) {
    return { ok: false, message: "Choose a valid member." };
  }

  const adminUser = await requireWorkspaceAdminAction();
  if (isActionState(adminUser)) return adminUser;

  const client = createServerClient();
  if (!client) return unavailable;

  const { data: membership, error: membershipError } = await client
    .from("workspace_memberships")
    .select("id,app_user_id,role")
    .eq("id", membershipId.data)
    .eq("workspace_id", adminUser.activeWorkspaceId)
    .single();
  if (membershipError) return { ok: false, message: membershipError.message };
  if (membership.app_user_id === adminUser.id) {
    return { ok: false, message: "You cannot remove yourself." };
  }
  if (membership.role === "owner") {
    return { ok: false, message: "Club owners cannot be removed here." };
  }

  const { error } = await client
    .from("workspace_memberships")
    .delete()
    .eq("id", membership.id)
    .eq("workspace_id", adminUser.activeWorkspaceId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/players");
  return { ok: true, message: "Member removed." };
}

export async function createWorkspaceInvite(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const adminUser = await requireWorkspaceAdminAction();
  if (isActionState(adminUser)) return adminUser;

  const invitedEmail = inviteEmailSchema.safeParse(formData.get("email"));
  if (!invitedEmail.success) {
    return { ok: false, message: invitedEmail.error.issues[0].message };
  }
  const expiresInDays = inviteExpiryDaysSchema.safeParse(
    formData.get("expiresInDays") || undefined,
  );
  if (!expiresInDays.success) {
    return {
      ok: false,
      message: "Choose an invite expiry between 1 and 30 days.",
    };
  }

  const client = createServerClient();
  if (!client) return unavailable;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + expiresInDays.data * 24 * 60 * 60 * 1000,
  );
  const { error } = await client.from("workspace_invites").insert({
    workspace_id: adminUser.activeWorkspaceId,
    token_hash: hashInviteToken(token),
    invited_email: invitedEmail.data,
    created_by_app_user_id: adminUser.id,
    expires_at: expiresAt.toISOString(),
  });
  if (error) return { ok: false, message: error.message };
  await recordProductEvent({
    client,
    eventType: "invite_created",
    metadata: {
      hasInvitedEmail: Boolean(invitedEmail.data),
      expiresInDays: expiresInDays.data,
    },
    user: adminUser,
  });

  const inviteUrl = `${await requestOrigin()}/invites/${token}`;
  revalidatePath("/players");
  return {
    ok: true,
    message:
      "Club invite link created. Share it with the person you want to add.",
    inviteUrl,
  };
}

export async function revokeWorkspaceInvite(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const adminUser = await requireWorkspaceAdminAction();
  if (isActionState(adminUser)) return adminUser;

  const inviteId = z.string().uuid().safeParse(formData.get("inviteId"));
  if (!inviteId.success) {
    return { ok: false, message: "Choose a valid invite." };
  }

  const client = createServerClient();
  if (!client) return unavailable;

  const { error } = await client
    .from("workspace_invites")
    .update({ status: "revoked" })
    .eq("id", inviteId.data)
    .eq("workspace_id", adminUser.activeWorkspaceId)
    .eq("status", "pending");
  if (error) return { ok: false, message: error.message };

  revalidatePath("/players");
  return { ok: true, message: "Invite revoked." };
}

export async function acceptWorkspaceInvite(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = inviteTokenSchema.safeParse(formData.get("token"));
  if (!token.success) {
    return { ok: false, message: "This invite link is invalid." };
  }

  const user = await getAuthenticatedUser();
  if (!user) {
    return { ok: false, message: "Sign in to accept this invite." };
  }

  const client = createServerClient();
  if (!client) return unavailable;

  const { data: invite, error: inviteError } = await client
    .from("workspace_invites")
    .select("id,workspace_id,invited_email,status,expires_at")
    .eq("token_hash", hashInviteToken(token.data))
    .maybeSingle();
  if (inviteError) return { ok: false, message: inviteError.message };
  if (!invite) return { ok: false, message: "This invite was not found." };
  if (invite.status !== "pending") {
    return { ok: false, message: "This invite is no longer active." };
  }
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    await client
      .from("workspace_invites")
      .update({ status: "expired" })
      .eq("id", invite.id);
    return { ok: false, message: "This invite has expired." };
  }
  if (invite.invited_email && invite.invited_email !== user.email) {
    return {
      ok: false,
      message: "This invite was created for a different email address.",
    };
  }

  const { error: membershipError } = await client
    .from("workspace_memberships")
    .upsert(
      {
        workspace_id: invite.workspace_id,
        app_user_id: user.id,
        role: "member",
      },
      { onConflict: "workspace_id,app_user_id", ignoreDuplicates: true },
    );
  if (membershipError) {
    return { ok: false, message: membershipError.message };
  }
  try {
    await ensureWorkspaceMemberPlayer(client, invite.workspace_id, user);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to create player profile.",
    };
  }

  if (invite.invited_email) {
    const { error: updateError } = await client
      .from("workspace_invites")
      .update({
        status: "accepted",
        accepted_by_app_user_id: user.id,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invite.id);
    if (updateError) return { ok: false, message: updateError.message };
  }
  await recordProductEvent({
    client,
    eventType: "invite_accepted",
    metadata: { emailRestricted: Boolean(invite.invited_email) },
    user,
    workspaceId: invite.workspace_id,
  });

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, invite.workspace_id, {
    sameSite: "lax",
    path: "/",
  });
  revalidatePath("/");
  redirect("/rating");
}

function parseEventFormData(formData: FormData) {
  return eventSchema.safeParse({
    name: formData.get("name"),
    venue: formData.get("venue"),
    startsAt: formData.get("startsAt"),
    startsAtTimezoneOffsetMinutes: formData.get(
      "startsAtTimezoneOffsetMinutes",
    ),
    courtCount: formData.get("courtCount"),
    courtMinutes: formData.getAll("courtMinutes"),
    requestedRoundMinutes: formData.get("requestedRoundMinutes"),
    breakMinutes: formData.get("breakMinutes"),
    notes: formData.get("notes"),
    playerIds: formData.getAll("playerIds"),
    drawStrategy: formData.get("drawStrategy") ?? undefined,
    competitionMode: formData.get("competitionMode") ?? undefined,
    originalCompetitionMode:
      formData.get("originalCompetitionMode") || undefined,
    originalDrawStrategy: formData.get("originalDrawStrategy") || undefined,
    confirmDrawReplacement: formData.get("confirmDrawReplacement") === "true",
  });
}

function eventSeed(event: EventInput) {
  return (
    Math.abs(
      Array.from(`${event.name}:${event.startsAt.toISOString()}`).reduce(
        (hash, character) => (hash * 31 + character.charCodeAt(0)) | 0,
        17,
      ),
    ) || 1
  );
}

function freshEventSeed(currentSeed?: number) {
  let seed = randomBytes(4).readUInt32BE(0) & 0x7fffffff;
  if (!seed) seed = 1;
  return seed === currentSeed ? (seed % 0x7fffffff) + 1 : seed;
}

async function getOrderedSourcePlayers(
  client: ServerClient,
  workspaceId: string,
  playerIds: string[],
) {
  return getOrderedEligibleRosterSourcePlayers(client, workspaceId, playerIds);
}

async function insertEventSchedule(options: {
  client: ServerClient;
  workspaceId: string;
  eventId: string;
  event: EventInput;
  capacity: ScheduleCapacity;
  seed: number;
}) {
  const { client, workspaceId, eventId, event, capacity, seed } = options;
  const orderedPlayers = await getOrderedSourcePlayers(
    client,
    workspaceId,
    event.playerIds,
  );
  const preparedSnapshots = selectEventRatingSnapshots({
    playerIds: event.playerIds,
    existingSnapshots: [],
    currentSources: orderedPlayers,
    createId: randomUUID,
  });
  const { data: snapshots, error: snapshotError } = await client
    .from("event_players")
    .insert(
      preparedSnapshots.map((player) => ({
        id: player.id,
        event_id: eventId,
        player_id: player.playerId,
        name_snapshot: player.name,
        rating_snapshot: player.displayedLevel,
        app_user_id_snapshot: player.appUserId,
        rating_mu_snapshot: player.mu,
        rating_sigma_snapshot: player.sigma,
        displayed_level_snapshot: player.displayedLevel,
        rating_engine_version_snapshot: player.engineVersion,
        display_order: player.displayOrder,
      })),
    )
    .select("id,name_snapshot,rating_snapshot");
  if (snapshotError) throw snapshotError;

  const schedule = generateSchedule({
    players: snapshots.map((player) => ({
      id: player.id,
      name: player.name_snapshot,
      rating: Number(player.rating_snapshot),
    })),
    courtCounts: capacity.courtNumbersByRound.map(
      (courtNumbers) => courtNumbers.length,
    ),
    courtNumbersByRound: capacity.courtNumbersByRound,
    seed,
    strategy: event.drawStrategy,
  });

  for (const round of schedule.rounds) {
    const { data: savedRound, error: roundError } = await client
      .from("event_rounds")
      .insert({
        event_id: eventId,
        round_number: round.roundNumber,
        court_count: round.courtCount,
        duration_seconds: capacity.roundMinutes * 60,
      })
      .select("id")
      .single();
    if (roundError) throw roundError;

    const { error: matchError } = await client.from("matches").insert(
      round.matches.map((match) => ({
        event_id: eventId,
        round_id: savedRound.id,
        court_number: match.courtNumber,
        team_one_player_one_id: match.teamOne[0],
        team_one_player_two_id: match.teamOne[1],
        team_two_player_one_id: match.teamTwo[0],
        team_two_player_two_id: match.teamTwo[1],
        timer_duration_seconds: capacity.roundMinutes * 60,
      })),
    );
    if (matchError) throw matchError;
  }
}

function sameOrderedValues(
  first: readonly unknown[],
  second: readonly unknown[],
) {
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

function courtNumbersByRound(rounds: RoundCapacityRow[]) {
  return rounds
    .slice()
    .sort((first, second) => first.round_number - second.round_number)
    .map((round) =>
      round.matches
        .map((match) => match.court_number)
        .sort((first, second) => first - second),
    );
}

function hasDrawChanges(options: {
  event: EventRow;
  players: EventPlayerSnapshot[];
  rounds: RoundCapacityRow[];
  nextEvent: EventInput;
  nextCapacity: ScheduleCapacity;
}) {
  const { event, players, rounds, nextEvent, nextCapacity } = options;
  const existingPlayerIds = players
    .slice()
    .sort((first, second) => first.display_order - second.display_order)
    .map((player) => player.player_id);
  const existingCourtsByRound = courtNumbersByRound(rounds);

  return (
    event.round_minutes !== nextCapacity.roundMinutes ||
    event.break_minutes !== nextEvent.breakMinutes ||
    !hasSameStableIds(existingPlayerIds, nextEvent.playerIds) ||
    event.draw_strategy !== nextEvent.drawStrategy ||
    existingCourtsByRound.length !== nextCapacity.courtNumbersByRound.length ||
    existingCourtsByRound.some(
      (courtNumbers, index) =>
        !sameOrderedValues(
          courtNumbers,
          nextCapacity.courtNumbersByRound[index] ?? [],
        ),
    )
  );
}

type PreparedSnapshot = EventRatingSnapshot;

function currentSnapshotsForRoster(
  snapshots: EventPlayerSnapshot[],
  playerIds: string[],
): PreparedSnapshot[] | null {
  const byPlayerId = new Map(
    snapshots.map((snapshot) => [snapshot.player_id, snapshot]),
  );
  if (
    byPlayerId.size !== playerIds.length ||
    playerIds.some((id) => !byPlayerId.has(id))
  ) {
    return null;
  }

  if (
    snapshots.some(
      (snapshot) =>
        !snapshot.app_user_id_snapshot ||
        snapshot.rating_mu_snapshot === null ||
        snapshot.rating_sigma_snapshot === null ||
        snapshot.displayed_level_snapshot === null ||
        !snapshot.rating_engine_version_snapshot,
    )
  ) {
    return null;
  }

  return snapshots
    .slice()
    .sort((first, second) => first.display_order - second.display_order)
    .map((snapshot, displayOrder) => {
      return {
        id: snapshot.id,
        playerId: snapshot.player_id,
        appUserId: snapshot.app_user_id_snapshot as string,
        name: snapshot.name_snapshot,
        mu: Number(snapshot.rating_mu_snapshot),
        sigma: Number(snapshot.rating_sigma_snapshot),
        displayedLevel: Number(snapshot.displayed_level_snapshot),
        engineVersion: snapshot.rating_engine_version_snapshot as string,
        displayOrder,
      };
    });
}

async function prepareSnapshots(options: {
  client: ServerClient;
  workspaceId: string;
  playerIds: string[];
  existingSnapshots: EventPlayerSnapshot[];
}) {
  const preserved = currentSnapshotsForRoster(
    options.existingSnapshots,
    options.playerIds,
  );
  if (preserved) return preserved;

  const players = await getOrderedSourcePlayers(
    options.client,
    options.workspaceId,
    options.playerIds,
  );
  return selectEventRatingSnapshots({
    playerIds: options.playerIds,
    existingSnapshots: options.existingSnapshots
      .filter(
        (snapshot) =>
          snapshot.app_user_id_snapshot &&
          snapshot.rating_mu_snapshot !== null &&
          snapshot.rating_sigma_snapshot !== null &&
          snapshot.displayed_level_snapshot !== null &&
          snapshot.rating_engine_version_snapshot,
      )
      .map(
        (snapshot): ExistingEventRatingSnapshot => ({
          id: snapshot.id,
          playerId: snapshot.player_id,
          appUserId: snapshot.app_user_id_snapshot as string,
          name: snapshot.name_snapshot,
          mu: Number(snapshot.rating_mu_snapshot),
          sigma: Number(snapshot.rating_sigma_snapshot),
          displayedLevel: Number(snapshot.displayed_level_snapshot),
          engineVersion: snapshot.rating_engine_version_snapshot as string,
          displayOrder: snapshot.display_order,
        }),
      ),
    currentSources: players,
    createId: randomUUID,
  });
}

function generatePreparedSchedule(options: {
  snapshots: PreparedSnapshot[];
  capacity: ScheduleCapacity;
  seed: number;
  strategy: DrawStrategy;
}) {
  return generateSchedule({
    players: options.snapshots.map(
      (snapshot): PlayerSeed => ({
        id: snapshot.id,
        name: snapshot.name,
        rating: snapshot.displayedLevel,
      }),
    ),
    courtCounts: options.capacity.courtNumbersByRound.map(
      (courtNumbers) => courtNumbers.length,
    ),
    courtNumbersByRound: options.capacity.courtNumbersByRound,
    seed: options.seed,
    strategy: options.strategy,
  });
}

async function replaceEventDraw(options: {
  client: ServerClient;
  workspaceId: string;
  eventId: string;
  event: EventRow;
  snapshots: PreparedSnapshot[];
  schedule: Schedule;
  capacity: ScheduleCapacity;
  breakMinutes: number;
  strategy: DrawStrategy;
}) {
  const { error } = await options.client.rpc("replace_scheduled_event_draw", {
    p_workspace_id: options.workspaceId,
    p_event_id: options.eventId,
    p_expected_seed: options.event.seed,
    p_expected_draw_strategy: options.event.draw_strategy,
    p_draw_strategy: options.strategy,
    p_seed: options.schedule.seed,
    p_round_minutes: options.capacity.roundMinutes,
    p_break_minutes: options.breakMinutes,
    p_snapshots: options.snapshots,
    p_rounds: options.schedule.rounds,
  });
  if (error) throw error;
}

function hasStartTimeChange(currentStartsAt: string, nextStartsAt: Date) {
  return new Date(currentStartsAt).getTime() !== nextStartsAt.getTime();
}

async function createEventWithErrorPath(formData: FormData, errorPath: string) {
  const parsed = parseEventFormData(formData);
  if (!parsed.success) {
    redirect(
      `${errorPath}?error=${encodeURIComponent(parsed.error.issues[0].message)}`,
    );
  }
  const adminUser = await requireWorkspaceAdminUser();
  if (!adminUser?.activeWorkspaceId) {
    redirect("/events?error=Only%20admins%20can%20create%20events");
  }

  const client = createServerClient();
  if (!client) {
    redirect(`${errorPath}?error=Connect%20Supabase%20to%20create%20events`);
  }

  let capacity: ScheduleCapacity;
  try {
    capacity = calculateScheduleCapacity(parsed.data);
  } catch (error) {
    redirect(
      `${errorPath}?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Invalid event availability",
      )}`,
    );
  }
  const seed = eventSeed(parsed.data);

  const { data: event, error: eventError } = await client
    .from("events")
    .insert({
      workspace_id: adminUser.activeWorkspaceId,
      name: parsed.data.name,
      venue: parsed.data.venue,
      starts_at: parsed.data.startsAt.toISOString(),
      status: effectiveEventStatus({
        status: "scheduled",
        startsAt: parsed.data.startsAt,
      }),
      seed,
      draw_strategy: parsed.data.drawStrategy,
      ...eventModePersistence(parsed.data.competitionMode),
      round_minutes: capacity.roundMinutes,
      break_minutes: parsed.data.breakMinutes,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();
  if (eventError) {
    redirect(`${errorPath}?error=${encodeURIComponent(eventError.message)}`);
  }

  try {
    await insertEventSchedule({
      client,
      workspaceId: adminUser.activeWorkspaceId,
      eventId: event.id,
      event: parsed.data,
      capacity,
      seed,
    });
  } catch (error) {
    await client.from("events").delete().eq("id", event.id);
    redirect(
      `${errorPath}?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Unable to create event",
      )}`,
    );
  }

  revalidatePath("/");
  revalidatePath("/events");
  await recordProductEvent({
    client,
    eventType: "event_created",
    metadata: {
      courtCount: parsed.data.courtCount,
      playerCount: parsed.data.playerIds.length,
    },
    user: adminUser,
  });
  redirect(`/events/${event.id}`);
}

export async function createEvent(formData: FormData) {
  await createEventWithErrorPath(formData, "/events/new");
}

export async function updateEvent(formData: FormData) {
  const eventId = eventIdSchema.safeParse(formData.get("eventId"));
  const parsed = parseEventFormData(formData);
  if (!eventId.success || !parsed.success) {
    redirect(
      `/events/${eventId.success ? eventId.data : ""}/edit?error=${encodeURIComponent(
        parsed.success
          ? "Choose a valid event."
          : parsed.error.issues[0].message,
      )}`,
    );
  }
  const adminUser = await requireWorkspaceAdminUser();
  if (!adminUser?.activeWorkspaceId) {
    redirect("/events?error=Only%20admins%20can%20edit%20events");
  }

  const client = createServerClient();
  if (!client) {
    redirect(
      `/events/${eventId.data}/edit?error=Connect%20Supabase%20to%20edit%20events`,
    );
  }

  let capacity: ScheduleCapacity;
  try {
    capacity = calculateScheduleCapacity(parsed.data);
  } catch (error) {
    redirect(
      `/events/${eventId.data}/edit?error=${encodeURIComponent(
        error instanceof Error ? error.message : "Invalid event availability",
      )}`,
    );
  }

  const [{ data: event, error: eventError }, playersResult, roundsResult] =
    await Promise.all([
      client
        .from("events")
        .select("*")
        .eq("id", eventId.data)
        .eq("workspace_id", adminUser.activeWorkspaceId)
        .single(),
      client
        .from("event_players")
        .select(
          "id,player_id,name_snapshot,rating_snapshot,display_order,app_user_id_snapshot,rating_mu_snapshot,rating_sigma_snapshot,displayed_level_snapshot,rating_engine_version_snapshot",
        )
        .eq("event_id", eventId.data),
      client
        .from("event_rounds")
        .select(
          "round_number,court_count,duration_seconds,matches(court_number)",
        )
        .eq("event_id", eventId.data),
    ]);
  if (eventError) {
    redirect(`/events/${eventId.data}/edit?error=Event%20not%20found`);
  }
  if (playersResult.error) {
    redirect(
      `/events/${eventId.data}/edit?error=${encodeURIComponent(
        playersResult.error.message,
      )}`,
    );
  }
  if (roundsResult.error) {
    redirect(
      `/events/${eventId.data}/edit?error=${encodeURIComponent(
        roundsResult.error.message,
      )}`,
    );
  }

  const { data: matches, error: matchesError } = await client
    .from("matches")
    .select("status")
    .eq("event_id", eventId.data);
  if (matchesError) {
    redirect(
      `/events/${eventId.data}/edit?error=${encodeURIComponent(
        matchesError.message,
      )}`,
    );
  }
  const matchStatuses = matches.map((match) => match.status);
  if (
    !canEditEventDetails({
      eventStatus: event.status,
      matchStatuses,
    })
  ) {
    redirect(
      `/events/${eventId.data}/edit?error=Completed%20event%20data%20is%20locked`,
    );
  }

  const drawChanges = hasDrawChanges({
    event,
    players: playersResult.data,
    rounds: roundsResult.data as RoundCapacityRow[],
    nextEvent: parsed.data,
    nextCapacity: capacity,
  });
  if (
    parsed.data.originalDrawStrategy &&
    parsed.data.originalDrawStrategy !== event.draw_strategy
  ) {
    redirect(
      `/events/${eventId.data}/edit?error=The%20draw%20strategy%20changed%20while%20this%20form%20was%20open.%20Refresh%20and%20try%20again`,
    );
  }
  const strategyChanged = event.draw_strategy !== parsed.data.drawStrategy;
  if (strategyChanged && !parsed.data.confirmDrawReplacement) {
    redirect(
      `/events/${eventId.data}/edit?error=Confirm%20the%20draw%20replacement%20before%20changing%20strategy`,
    );
  }
  if (
    parsed.data.originalCompetitionMode &&
    parsed.data.originalCompetitionMode !== event.competition_mode
  ) {
    redirect(
      `/events/${eventId.data}/edit?error=The%20event%20mode%20changed%20while%20this%20form%20was%20open.%20Refresh%20and%20try%20again`,
    );
  }
  if (
    event.competition_mode !== "legacy" &&
    !parsed.data.originalCompetitionMode
  ) {
    redirect(
      `/events/${eventId.data}/edit?error=Refresh%20the%20event%20form%20before%20changing%20its%20mode`,
    );
  }
  const canChangeMode = canChangeEventCompetitionMode({ matchStatuses });
  const modeUpdate = eventModeUpdatePersistence({
    currentMode: event.competition_mode,
    currentRatingEra: event.rating_era,
    currentIncluded: event.standings_eligible,
    nextMode: parsed.data.competitionMode,
    canChangeMode,
  });
  const modeChanged = modeUpdate.modeChanged;
  if (modeChanged && !canChangeEventCompetitionMode({ matchStatuses })) {
    redirect(
      `/events/${eventId.data}/edit?error=Event%20mode%20is%20locked%20once%20a%20match%20starts`,
    );
  }
  const lockedScheduleChanges =
    drawChanges || hasStartTimeChange(event.starts_at, parsed.data.startsAt);
  if (lockedScheduleChanges && !canChangeEventSchedule({ matchStatuses })) {
    redirect(
      `/events/${eventId.data}/edit?error=Player%2C%20court%2C%20and%20time%20changes%20are%20locked%20once%20a%20match%20starts`,
    );
  }

  const seed = drawChanges ? freshEventSeed(event.seed) : event.seed;
  if (drawChanges) {
    try {
      const snapshots = await prepareSnapshots({
        client,
        workspaceId: adminUser.activeWorkspaceId,
        playerIds: parsed.data.playerIds,
        existingSnapshots: playersResult.data,
      });
      const schedule = generatePreparedSchedule({
        snapshots,
        capacity,
        seed,
        strategy: parsed.data.drawStrategy,
      });
      await replaceEventDraw({
        client,
        workspaceId: adminUser.activeWorkspaceId,
        eventId: eventId.data,
        event,
        snapshots,
        schedule,
        capacity,
        breakMinutes: parsed.data.breakMinutes,
        strategy: parsed.data.drawStrategy,
      });
    } catch (error) {
      redirect(
        `/events/${eventId.data}/edit?error=${encodeURIComponent(
          error instanceof Error ? error.message : "Unable to update event",
        )}`,
      );
    }
  }
  const { error: updateError } = await client
    .from("events")
    .update({
      name: parsed.data.name,
      venue: parsed.data.venue,
      starts_at: parsed.data.startsAt.toISOString(),
      status: effectiveEventStatus({
        status: event.status,
        startsAt: parsed.data.startsAt,
      }),
      seed,
      draw_strategy: parsed.data.drawStrategy,
      ...modeUpdate.payload,
      round_minutes: capacity.roundMinutes,
      break_minutes: parsed.data.breakMinutes,
      notes: parsed.data.notes,
    })
    .eq("id", eventId.data);
  if (updateError) {
    redirect(
      `/events/${eventId.data}/edit?error=${encodeURIComponent(
        updateError.message,
      )}`,
    );
  }

  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath(`/events/${eventId.data}`);
  redirect(`/events/${eventId.data}`);
}

export async function duplicateEvent(formData: FormData) {
  const sourceEventId = eventIdSchema.safeParse(formData.get("sourceEventId"));
  const errorPath = sourceEventId.success
    ? `/events/${sourceEventId.data}/duplicate`
    : "/events/new";
  await createEventWithErrorPath(formData, errorPath);
}

export async function reshuffleRandomDraw(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = reshuffleSchema.safeParse({
    eventId: formData.get("eventId"),
    expectedSeed: formData.get("expectedSeed"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Choose a valid event draw to reshuffle." };
  }
  const adminUser = await requireWorkspaceAdminAction();
  if (isActionState(adminUser)) return adminUser;
  const client = createServerClient();
  if (!client) return unavailable;

  const [eventResult, snapshotsResult, roundsResult] = await Promise.all([
    client
      .from("events")
      .select("*")
      .eq("id", parsed.data.eventId)
      .eq("workspace_id", adminUser.activeWorkspaceId)
      .single(),
    client
      .from("event_players")
      .select(
        "id,player_id,name_snapshot,rating_snapshot,display_order,app_user_id_snapshot,rating_mu_snapshot,rating_sigma_snapshot,displayed_level_snapshot,rating_engine_version_snapshot",
      )
      .eq("event_id", parsed.data.eventId)
      .order("display_order"),
    client
      .from("event_rounds")
      .select("round_number,matches(court_number,status)")
      .eq("event_id", parsed.data.eventId)
      .order("round_number"),
  ]);
  if (eventResult.error)
    return { ok: false, message: eventResult.error.message };
  if (snapshotsResult.error) {
    return { ok: false, message: snapshotsResult.error.message };
  }
  if (roundsResult.error)
    return { ok: false, message: roundsResult.error.message };

  const event = eventResult.data;
  const matchStatuses = roundsResult.data.flatMap((round) =>
    round.matches.map((match) => match.status),
  );
  if (
    !canReshuffleRandomDraw({
      eventStatus: effectiveEventStatus({
        status: event.status,
        startsAt: event.starts_at,
      }),
      drawStrategy: event.draw_strategy,
      matchStatuses,
    })
  ) {
    return {
      ok: false,
      message: "Random draws can only be reshuffled before any match activity.",
    };
  }
  if (event.seed !== parsed.data.expectedSeed) {
    return {
      ok: false,
      message: "The draw already changed. Refresh before reshuffling again.",
    };
  }

  const snapshots: PreparedSnapshot[] = snapshotsResult.data.map(
    (snapshot) => ({
      id: snapshot.id,
      playerId: snapshot.player_id,
      appUserId: snapshot.app_user_id_snapshot as string,
      name: snapshot.name_snapshot,
      mu: Number(snapshot.rating_mu_snapshot),
      sigma: Number(snapshot.rating_sigma_snapshot),
      displayedLevel: Number(snapshot.displayed_level_snapshot),
      engineVersion: snapshot.rating_engine_version_snapshot as string,
      displayOrder: snapshot.display_order,
    }),
  );
  const courtNumbers = roundsResult.data.map((round) =>
    round.matches
      .map((match) => match.court_number)
      .sort((first, second) => first - second),
  );
  const capacity: ScheduleCapacity = {
    roundCount: courtNumbers.length,
    matchCount: courtNumbers.reduce(
      (total, courts) => total + courts.length,
      0,
    ),
    roundMinutes: event.round_minutes,
    courtMinutes: [],
    courtNumbersByRound: courtNumbers,
    usedCourtMinutes: 0,
    unusedCourtMinutes: 0,
  };
  const seed = freshEventSeed(event.seed);
  const schedule = generatePreparedSchedule({
    snapshots,
    capacity,
    seed,
    strategy: "random",
  });

  try {
    await replaceEventDraw({
      client,
      workspaceId: adminUser.activeWorkspaceId,
      eventId: parsed.data.eventId,
      event,
      snapshots,
      schedule,
      capacity,
      breakMinutes: event.break_minutes,
      strategy: "random",
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to reshuffle the draw.",
    };
  }

  revalidatePath(`/events/${parsed.data.eventId}`);
  return {
    ok: true,
    message: "Random draw reshuffled with a fresh seed.",
    drawSeed: seed,
  };
}

export async function deleteEvent(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = eventIdSchema.safeParse(formData.get("eventId"));
  if (!parsed.success) {
    return { ok: false, message: "Choose a valid event to delete." };
  }
  const adminUser = await requireWorkspaceAdminAction();
  if (isActionState(adminUser)) return adminUser;

  const client = createServerClient();
  if (!client) return unavailable;

  const [{ data: event, error: eventError }, matchesResult] = await Promise.all(
    [
      client
        .from("events")
        .select("status,starts_at")
        .eq("id", parsed.data)
        .eq("workspace_id", adminUser.activeWorkspaceId)
        .single(),
      client.from("matches").select("status").eq("event_id", parsed.data),
    ],
  );
  if (eventError) return { ok: false, message: eventError.message };
  if (matchesResult.error) {
    return { ok: false, message: matchesResult.error.message };
  }
  if (
    !canDeleteEventRecord({
      eventStatus: effectiveEventStatus({
        status: event.status,
        startsAt: event.starts_at,
      }),
      matchStatuses: matchesResult.data.map((match) => match.status),
    })
  ) {
    return {
      ok: false,
      message: "Only fully scheduled events can be deleted.",
    };
  }

  const { error } = await client
    .from("events")
    .delete()
    .eq("id", parsed.data)
    .eq("workspace_id", adminUser.activeWorkspaceId);
  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  revalidatePath("/events");
  redirect("/events");
}

function revalidateEventPolicyPaths(eventId: string) {
  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath("/history");
  revalidatePath(`/events/${eventId}`);
}

async function runEventPolicyAction(options: {
  formData: FormData;
  rpc: "archive_completed_event" | "restore_archived_event";
  invalidMessage: string;
  redirectTo: string;
}): Promise<ActionState> {
  const eventId = eventIdSchema.safeParse(options.formData.get("eventId"));
  if (!eventId.success) {
    return { ok: false, message: options.invalidMessage };
  }
  const adminUser = await requireWorkspaceAdminAction();
  if (isActionState(adminUser)) return adminUser;

  const client = createServerClient();
  if (!client) return unavailable;

  const { error } = await client.rpc(options.rpc, {
    p_workspace_id: adminUser.activeWorkspaceId,
    p_event_id: eventId.data,
  });
  if (error) return { ok: false, message: error.message };

  revalidateEventPolicyPaths(eventId.data);
  redirect(options.redirectTo);
}

export async function cancelEvent(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const eventId = eventIdSchema.safeParse(formData.get("eventId"));
  if (!eventId.success) {
    return { ok: false, message: "Choose a valid event to cancel." };
  }
  const adminUser = await requireWorkspaceAdminAction();
  if (isActionState(adminUser)) return adminUser;

  const client = createServerClient();
  if (!client) return unavailable;

  const { error } = await client.rpc("cancel_live_event", {
    p_workspace_id: adminUser.activeWorkspaceId,
    p_event_id: eventId.data,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath("/history");
  redirect("/events?view=archived");
}

export async function archiveEvent(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runEventPolicyAction({
    formData,
    rpc: "archive_completed_event",
    invalidMessage: "Choose a valid completed event to archive.",
    redirectTo: "/events?view=archived",
  });
}

export async function restoreEvent(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runEventPolicyAction({
    formData,
    rpc: "restore_archived_event",
    invalidMessage: "Choose a valid archived event to restore.",
    redirectTo: "/events",
  });
}

export async function changeEventStandingsEligibility(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      eventId: z.string().uuid(),
      standingsEligible: z
        .enum(["true", "false"])
        .transform((value) => value === "true"),
      reason: z.string().trim().min(3).max(500),
    })
    .safeParse({
      eventId: formData.get("eventId"),
      standingsEligible: formData.get("standingsEligible"),
      reason: formData.get("reason"),
    });
  if (!parsed.success) {
    return { ok: false, message: "Choose a valid completed event." };
  }
  const adminUser = await requireWorkspaceAdminAction();
  if (isActionState(adminUser)) return adminUser;

  const client = createServerClient();
  if (!client) return unavailable;

  const { error } = await client.rpc(
    "set_completed_event_standings_eligibility",
    {
      p_workspace_id: adminUser.activeWorkspaceId,
      p_event_id: parsed.data.eventId,
      p_standings_eligible: parsed.data.standingsEligible,
      p_actor_id: adminUser.id,
      p_reason: parsed.data.reason,
    },
  );
  if (error) return { ok: false, message: error.message };

  revalidateEventPolicyPaths(parsed.data.eventId);
  return {
    ok: true,
    message: parsed.data.standingsEligible
      ? "Event results reinstated. Standings and any applicable automated ratings are recalculating."
      : "Event results excluded. Standings and any applicable automated ratings are recalculating.",
  };
}

export async function retryEventRatingJob(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = retryRatingJobSchema.safeParse({
    eventId: formData.get("eventId"),
    jobId: formData.get("jobId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Choose valid rating work to retry." };
  }
  const adminUser = await requireWorkspaceAdminAction();
  if (isActionState(adminUser)) return adminUser;

  const client = createServerClient();
  if (!client) return unavailable;
  const { data: event, error: eventError } = await client
    .from("events")
    .select("id")
    .eq("id", parsed.data.eventId)
    .eq("workspace_id", adminUser.activeWorkspaceId)
    .maybeSingle();
  if (eventError || !event) {
    return { ok: false, message: "Rating work is not available in this club." };
  }

  const { data: job, error: jobError } = await client
    .from("event_rating_jobs")
    .select("id,status,lock_token")
    .eq("id", parsed.data.jobId)
    .eq("event_id", event.id)
    .maybeSingle();
  if (jobError || !job || job.status !== "failed" || job.lock_token !== null) {
    return {
      ok: false,
      message: "This rating work is already queued or cannot be retried.",
    };
  }

  const { data: retried, error: retryError } = await client.rpc(
    "retry_failed_event_rating_job",
    { p_job_id: job.id },
  );
  if (retryError || !retried) {
    return {
      ok: false,
      message: "This rating work is already queued or cannot be retried.",
    };
  }

  revalidateEventPolicyPaths(event.id);
  return {
    ok: true,
    message: "Rating work queued for a safe retry.",
  };
}

export async function completeEvent(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = eventIdSchema.safeParse(formData.get("eventId"));
  if (!parsed.success) {
    return { ok: false, message: "Choose a valid event to complete." };
  }
  const adminUser = await requireWorkspaceAdminAction();
  if (isActionState(adminUser)) return adminUser;

  const client = createServerClient();
  if (!client) return unavailable;

  const [{ data: event, error: eventError }, matchesResult] = await Promise.all(
    [
      client
        .from("events")
        .select("status,starts_at")
        .eq("id", parsed.data)
        .eq("workspace_id", adminUser.activeWorkspaceId)
        .single(),
      client.from("matches").select("status").eq("event_id", parsed.data),
    ],
  );
  if (eventError) return { ok: false, message: eventError.message };
  if (matchesResult.error) {
    return { ok: false, message: matchesResult.error.message };
  }

  if (
    !canCompleteEvent({
      eventStatus: effectiveEventStatus({
        status: event.status,
        startsAt: event.starts_at,
      }),
      matchStatuses: matchesResult.data.map((match) => match.status),
    })
  ) {
    return {
      ok: false,
      message: "Only live events with matches can be completed.",
    };
  }

  const { error: completionError } = await client.rpc("complete_live_event", {
    p_workspace_id: adminUser.activeWorkspaceId,
    p_event_id: parsed.data,
  });
  if (completionError) return { ok: false, message: completionError.message };

  let message = "Tournament completed. Every unfinished match was cancelled.";

  try {
    const ratingResult = await processInitialEventRating({
      client,
      eventId: parsed.data,
    });
    if (ratingResult.status === "applied") {
      message = `${message} Official ratings updated.`;
    }
  } catch {
    message = `${message} Rating updates are queued and will retry separately.`;
  }

  try {
    const deliveryResult = await deliverFinalStandingsEmails({
      client,
      workspaceId: adminUser.activeWorkspaceId,
      eventId: parsed.data,
    });
    message = `${message} ${formatDeliveryResult(deliveryResult)}`;
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Unable to prepare email sends.";
    message = `${message} Final standings emails could not be processed: ${detail}`;
  }

  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath("/history");
  revalidatePath(`/events/${parsed.data}`);
  await recordProductEvent({
    client,
    eventType: "event_completed",
    metadata: {
      totalMatches: matchesResult.data.length,
      completedMatches: matchesResult.data.filter(
        (match) => match.status === "completed",
      ).length,
    },
    user: adminUser,
  });
  return {
    ok: true,
    message,
  };
}

export async function retryFinalStandingsEmails(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = eventIdSchema.safeParse(formData.get("eventId"));
  if (!parsed.success) {
    return { ok: false, message: "Choose a valid event to retry." };
  }

  const adminUser = await requireWorkspaceAdminAction();
  if (isActionState(adminUser)) return adminUser;

  const client = createServerClient();
  if (!client) return unavailable;

  const { data: event, error } = await client
    .from("events")
    .select("status")
    .eq("id", parsed.data)
    .eq("workspace_id", adminUser.activeWorkspaceId)
    .single();
  if (error) return { ok: false, message: error.message };
  if (event.status !== "completed") {
    return {
      ok: false,
      message: "Final standings emails can only be retried after completion.",
    };
  }

  try {
    const deliveryResult = await deliverFinalStandingsEmails({
      client,
      workspaceId: adminUser.activeWorkspaceId,
      eventId: parsed.data,
    });
    revalidatePath(`/events/${parsed.data}`);
    return {
      ok: true,
      message: formatDeliveryResult(deliveryResult),
    };
  } catch (retryError) {
    return {
      ok: false,
      message:
        retryError instanceof Error
          ? retryError.message
          : "Unable to retry final standings emails.",
    };
  }
}

export async function saveScore(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = scoreSchema.safeParse({
    matchId: formData.get("matchId"),
    eventId: formData.get("eventId"),
    teamOneScore: formData.get("teamOneScore"),
    teamTwoScore: formData.get("teamTwoScore"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const adminUser = await requireWorkspaceAdminAction();
  if (isActionState(adminUser)) return adminUser;

  const client = createServerClient();
  if (!client) return unavailable;

  const [{ data: existing, error: readError }, eventResult] = await Promise.all(
    [
      client
        .from("matches")
        .select("status")
        .eq("id", parsed.data.matchId)
        .eq("event_id", parsed.data.eventId)
        .single(),
      client
        .from("events")
        .select("status,starts_at")
        .eq("id", parsed.data.eventId)
        .eq("workspace_id", adminUser.activeWorkspaceId)
        .single(),
    ],
  );
  if (readError) return { ok: false, message: readError.message };
  if (eventResult.error) {
    return { ok: false, message: eventResult.error.message };
  }
  if (
    effectiveEventStatus({
      status: eventResult.data.status,
      startsAt: eventResult.data.starts_at,
    }) !== "live"
  ) {
    return { ok: false, message: "The event must be live to record scores." };
  }
  if (existing.status === "completed") {
    return { ok: false, message: "Completed scores are locked." };
  }

  const { error } = await client
    .from("matches")
    .update({
      team_one_score: parsed.data.teamOneScore,
      team_two_score: parsed.data.teamTwoScore,
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.matchId);
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/events/${parsed.data.eventId}`);
  return { ok: true, message: "Score recorded." };
}

export async function correctCompletedMatchScore(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = scoreSchema
    .extend({ reason: z.string().trim().min(3).max(500) })
    .safeParse({
      matchId: formData.get("matchId"),
      eventId: formData.get("eventId"),
      teamOneScore: formData.get("teamOneScore"),
      teamTwoScore: formData.get("teamTwoScore"),
      reason: formData.get("reason"),
    });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const adminUser = await requireWorkspaceAdminAction();
  if (isActionState(adminUser)) return adminUser;

  const client = createServerClient();
  if (!client) return unavailable;

  const { error } = await client.rpc("correct_completed_match_score", {
    p_workspace_id: adminUser.activeWorkspaceId,
    p_event_id: parsed.data.eventId,
    p_match_id: parsed.data.matchId,
    p_actor_id: adminUser.id,
    p_team_one_score: parsed.data.teamOneScore,
    p_team_two_score: parsed.data.teamTwoScore,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/events/${parsed.data.eventId}`);
  revalidatePath("/history");
  return { ok: true, message: "Completed score corrected." };
}

export async function reopenCompletedMatch(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = matchMutationSchema.safeParse({
    matchId: formData.get("matchId"),
    eventId: formData.get("eventId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Choose a valid completed match." };
  }
  const adminUser = await requireWorkspaceAdminAction();
  if (isActionState(adminUser)) return adminUser;

  const client = createServerClient();
  if (!client) return unavailable;

  const { error } = await client.rpc("reopen_completed_match", {
    p_workspace_id: adminUser.activeWorkspaceId,
    p_event_id: parsed.data.eventId,
    p_match_id: parsed.data.matchId,
    p_actor_id: adminUser.id,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath(`/events/${parsed.data.eventId}`);
  return { ok: true, message: "Match reopened with score and timer cleared." };
}

export async function updateTimer(formData: FormData) {
  const adminUser = await requireWorkspaceAdminUser();
  if (!adminUser?.activeWorkspaceId) return;

  const client = createServerClient();
  if (!client) return;
  const matchId = String(formData.get("matchId"));
  const eventId = String(formData.get("eventId"));
  const operation = String(formData.get("operation"));
  const now = new Date().toISOString();
  const [{ data: match }, { data: event }] = await Promise.all([
    client
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .eq("event_id", eventId)
      .single(),
    client
      .from("events")
      .select("status,starts_at")
      .eq("id", eventId)
      .eq("workspace_id", adminUser.activeWorkspaceId)
      .single(),
  ]);
  if (
    !match ||
    !event ||
    match.status === "completed" ||
    effectiveEventStatus({
      status: event.status,
      startsAt: event.starts_at,
    }) !== "live"
  ) {
    return;
  }

  if (operation === "start" && !match.timer_started_at) {
    await client
      .from("matches")
      .update({ status: "live", timer_started_at: now })
      .eq("id", matchId);
  } else if (operation === "pause" && !match.timer_paused_at) {
    await client
      .from("matches")
      .update({ status: "paused", timer_paused_at: now })
      .eq("id", matchId);
  } else if (operation === "resume" && match.timer_paused_at) {
    const pauseSeconds = Math.floor(
      (Date.now() - new Date(match.timer_paused_at).getTime()) / 1000,
    );
    await client
      .from("matches")
      .update({
        status: "live",
        timer_paused_at: null,
        timer_accumulated_pause_seconds:
          match.timer_accumulated_pause_seconds + Math.max(0, pauseSeconds),
      })
      .eq("id", matchId);
  }
  revalidatePath(`/events/${eventId}`);
}

export async function updateRoundLineup(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = roundLineupSchema.safeParse({
    eventId: formData.get("eventId"),
    roundNumber: formData.get("roundNumber"),
    matchIds: formData.getAll("matchIds"),
    playerIds: formData.getAll("playerIds"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  const adminUser = await requireWorkspaceAdminAction();
  if (isActionState(adminUser)) return adminUser;

  const client = createServerClient();
  if (!client) return unavailable;
  const { eventId, roundNumber, matchIds, playerIds } = parsed.data;
  const { data: submittedMatches, error: readError } = await client
    .from("matches")
    .select("id,round_id,court_number,status")
    .eq("event_id", eventId)
    .in("id", matchIds);
  if (readError) return { ok: false, message: readError.message };
  if (submittedMatches.length !== matchIds.length) {
    return { ok: false, message: "Every match must belong to this event." };
  }

  const roundIds = new Set(submittedMatches.map((match) => match.round_id));
  if (roundIds.size !== 1) {
    return { ok: false, message: "Every match must belong to the same round." };
  }
  const roundId = submittedMatches[0].round_id;

  const [eventResult, roundResult, roundMatchesResult, eventPlayersResult] =
    await Promise.all([
      client
        .from("events")
        .select("status,starts_at")
        .eq("id", eventId)
        .eq("workspace_id", adminUser.activeWorkspaceId)
        .single(),
      client
        .from("event_rounds")
        .select("round_number")
        .eq("id", roundId)
        .eq("event_id", eventId)
        .single(),
      client
        .from("matches")
        .select(
          "id,court_number,status,team_one_player_one_id,team_one_player_two_id,team_two_player_one_id,team_two_player_two_id",
        )
        .eq("event_id", eventId)
        .eq("round_id", roundId),
      client
        .from("event_players")
        .select("id,name_snapshot")
        .eq("event_id", eventId),
    ]);
  const { data: event, error: eventError } = eventResult;
  if (eventError) return { ok: false, message: eventError.message };
  if (roundResult.error) {
    return { ok: false, message: roundResult.error.message };
  }
  if (roundMatchesResult.error) {
    return { ok: false, message: roundMatchesResult.error.message };
  }
  if (eventPlayersResult.error) {
    return { ok: false, message: eventPlayersResult.error.message };
  }
  if (roundResult.data.round_number !== roundNumber) {
    return { ok: false, message: "Round number does not match this draw." };
  }

  const roundMatchIds = new Set(
    roundMatchesResult.data.map((match) => match.id),
  );
  if (matchIds.some((matchId) => !roundMatchIds.has(matchId))) {
    return { ok: false, message: "Every match must belong to this round." };
  }
  const eventStatus = effectiveEventStatus({
    status: event.status,
    startsAt: event.starts_at,
  });
  if (
    submittedMatches.some(
      (match) =>
        !canEditDrawLineup({
          canManage: true,
          eventStatus,
          matchStatus: match.status,
        }),
    )
  ) {
    return { ok: false, message: "Draws are locked once a match starts." };
  }

  const matchById = new Map(
    roundMatchesResult.data.map((match) => [match.id, match]),
  );
  const submittedPlayerIdsByMatchId = new Map(
    matchIds.map((matchId, index) => [
      matchId,
      playerIds.slice(index * 4, index * 4 + 4),
    ]),
  );
  const selectedMatches = matchIds.map((matchId, index) => {
    const match = matchById.get(matchId);
    return {
      id: matchId,
      courtNumber: match?.court_number ?? 0,
      playerIds: playerIds.slice(index * 4, index * 4 + 4),
    };
  });
  const proposedRoundMatches = roundMatchesResult.data.map((match) => ({
    id: match.id,
    courtNumber: match.court_number,
    playerIds: submittedPlayerIdsByMatchId.get(match.id) ?? [
      match.team_one_player_one_id,
      match.team_one_player_two_id,
      match.team_two_player_one_id,
      match.team_two_player_two_id,
    ],
  }));

  try {
    assertValidRoundLineup({
      selectedMatches: proposedRoundMatches,
      eventPlayers: eventPlayersResult.data.map((player) => ({
        id: player.id,
        name: player.name_snapshot,
      })),
      roundNumber,
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Choose a valid round draw.",
    };
  }

  const { error } = await client.rpc("update_scheduled_round_draw", {
    p_event_id: eventId,
    p_round_id: roundId,
    p_assignments: selectedMatches.map((match) => ({
      match_id: match.id,
      player_ids: match.playerIds,
    })),
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/events/${eventId}`);
  return { ok: true, message: `Round ${roundNumber} draw updated.` };
}

export async function regenerateEvent(formData: FormData) {
  const adminUser = await requireWorkspaceAdminUser();
  if (!adminUser?.activeWorkspaceId) return;

  const client = createServerClient();
  if (!client) return;
  const eventId = String(formData.get("eventId"));
  const { data: event } = await client
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("workspace_id", adminUser.activeWorkspaceId)
    .single();
  if (!event) return;

  const { data: matches } = await client
    .from("matches")
    .select("status")
    .eq("event_id", eventId);
  assertCanRegenerate(matches?.map((match) => match.status) ?? []);
}
