import "server-only";

import { z } from "zod";

import { calculateStandings } from "@/domain/standings";
import type { CompletedMatch, Standing } from "@/domain/types";
import { isResendConfigured, sendViaResend } from "@/lib/email";
import { createServerClient, normalizeUserEmail } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

type ServerClient = NonNullable<ReturnType<typeof createServerClient>>;
type EventRow = Pick<
  Database["public"]["Tables"]["events"]["Row"],
  "id" | "name" | "venue" | "starts_at"
>;
type EventPlayerSnapshot = Pick<
  Database["public"]["Tables"]["event_players"]["Row"],
  "id" | "player_id" | "name_snapshot" | "rating_snapshot" | "display_order"
>;
type MatchRow = Pick<
  Database["public"]["Tables"]["matches"]["Row"],
  | "id"
  | "round_id"
  | "court_number"
  | "status"
  | "team_one_player_one_id"
  | "team_one_player_two_id"
  | "team_two_player_one_id"
  | "team_two_player_two_id"
  | "team_one_score"
  | "team_two_score"
>;
type PlayerLinkRow = Pick<
  Database["public"]["Tables"]["players"]["Row"],
  "id" | "app_user_id" | "account_email"
>;
type AppUserRow = Pick<
  Database["public"]["Tables"]["app_users"]["Row"],
  "id" | "email" | "display_name"
>;
type DeliveryInsert =
  Database["public"]["Tables"]["event_email_deliveries"]["Insert"];
type DeliveryUpdate =
  Database["public"]["Tables"]["event_email_deliveries"]["Update"];

export type EventEmailDeliverySummary = {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  skipped: number;
  lastAttemptAt: string | null;
  isConfigured: boolean;
  canRetry: boolean;
};

export type DeliveryAttemptResult = {
  sent: number;
  failed: number;
  pending: number;
  skipped: number;
  total: number;
  isConfigured: boolean;
};

type Recipient = {
  eventPlayerId: string;
  playerId: string;
  playerName: string;
  recipientAppUserId: string | null;
  recipientEmail: string;
  recipientName: string;
};

type CandidateRecipient = {
  eventPlayerId: string;
  playerId: string;
  playerName: string;
  appUserId: string | null;
  accountEmail: string | null;
  appUserEmail: string | null;
  appUserDisplayName: string | null;
};

type EmailContext = {
  client: ServerClient;
  event: EventRow;
  eventPlayers: EventPlayerSnapshot[];
  matches: MatchRow[];
  roundNumberById: Map<string, number>;
  playerLinks: PlayerLinkRow[];
  appUsers: AppUserRow[];
};

const DELIVERY_KIND = "final_standings";
const DELIVERY_PROVIDER = "resend";
const emailAddressSchema = z.string().email();

export function selectFinalStandingsRecipients(
  candidates: CandidateRecipient[],
): { recipients: Recipient[]; skipped: number } {
  const recipients: Recipient[] = [];
  const seenEmails = new Set<string>();
  let skipped = 0;

  for (const candidate of candidates) {
    const rawEmail = candidate.appUserEmail ?? candidate.accountEmail;
    if (!rawEmail) {
      skipped += 1;
      continue;
    }

    const normalizedEmail = normalizeUserEmail(rawEmail);
    if (!emailAddressSchema.safeParse(normalizedEmail).success) {
      skipped += 1;
      continue;
    }
    if (seenEmails.has(normalizedEmail)) {
      skipped += 1;
      continue;
    }

    seenEmails.add(normalizedEmail);
    recipients.push({
      eventPlayerId: candidate.eventPlayerId,
      playerId: candidate.playerId,
      playerName: candidate.playerName,
      recipientAppUserId: candidate.appUserId,
      recipientEmail: normalizedEmail,
      recipientName:
        candidate.appUserDisplayName || candidate.playerName || normalizedEmail,
    });
  }

  return { recipients, skipped };
}

export async function getEventEmailDeliverySummary(options: {
  client: ServerClient;
  workspaceId: string;
  eventId: string;
  rosterCount: number;
}): Promise<EventEmailDeliverySummary> {
  const { client, workspaceId, eventId, rosterCount } = options;
  const { data, error } = await client
    .from("event_email_deliveries")
    .select("status,last_attempt_at,sent_at")
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .eq("kind", DELIVERY_KIND);
  if (error) throw error;

  const sent = data.filter((row) => row.status === "sent").length;
  const failed = data.filter((row) => row.status === "failed").length;
  const pending = data.filter((row) => row.status === "pending").length;
  const lastAttemptAt =
    data
      .map((row) => row.last_attempt_at ?? row.sent_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  return {
    total: data.length,
    sent,
    failed,
    pending,
    skipped: Math.max(0, rosterCount - data.length),
    lastAttemptAt,
    isConfigured: isResendConfigured(),
    canRetry: pending > 0 || failed > 0,
  };
}

export async function deliverFinalStandingsEmails(options: {
  client: ServerClient;
  workspaceId: string;
  eventId: string;
  retryFailedOnly?: boolean;
}): Promise<DeliveryAttemptResult> {
  const context = await loadEmailContext(options);
  const players = context.eventPlayers.map((player) => ({
    id: player.id,
    name: player.name_snapshot,
    rating: Number(player.rating_snapshot),
  }));
  const standings = calculateStandings(players, buildCompletedMatches(context));

  const candidateRecipients = buildRecipientCandidates(context);
  const { recipients, skipped } =
    selectFinalStandingsRecipients(candidateRecipients);

  if (!recipients.length) {
    return {
      sent: 0,
      failed: 0,
      pending: 0,
      skipped,
      total: 0,
      isConfigured: isResendConfigured(),
    };
  }

  const payloadByEmail = new Map<string, Json>();
  const insertRows: DeliveryInsert[] = recipients.map((recipient) => {
    const payload = buildDeliveryPayload({
      event: context.event,
      recipient,
      standings,
    });
    payloadByEmail.set(recipient.recipientEmail, payload);
    return {
      workspace_id: options.workspaceId,
      event_id: options.eventId,
      event_player_id: recipient.eventPlayerId,
      recipient_app_user_id: recipient.recipientAppUserId,
      recipient_email: recipient.recipientEmail,
      recipient_name: recipient.recipientName,
      kind: DELIVERY_KIND,
      payload_snapshot: payload,
    };
  });

  const { error: insertError } = await context.client
    .from("event_email_deliveries")
    .upsert(insertRows, {
      onConflict: "workspace_id,event_id,recipient_email,kind",
      ignoreDuplicates: true,
    });
  if (insertError) throw insertError;

  let deliveries = await fetchOutstandingDeliveries({
    client: context.client,
    workspaceId: options.workspaceId,
    eventId: options.eventId,
    retryFailedOnly: options.retryFailedOnly ?? false,
  });
  if (!deliveries.length) {
    return {
      sent: 0,
      failed: 0,
      pending: 0,
      skipped,
      total: recipients.length,
      isConfigured: isResendConfigured(),
    };
  }

  if (!isResendConfigured()) {
    return {
      sent: 0,
      failed: 0,
      pending: deliveries.length,
      skipped,
      total: recipients.length,
      isConfigured: false,
    };
  }

  let sent = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    const matchingRecipient = recipients.find(
      (recipient) => recipient.recipientEmail === delivery.recipient_email,
    );
    if (!matchingRecipient) continue;

    const payload =
      payloadByEmail.get(delivery.recipient_email) ??
      buildDeliveryPayload({
        event: context.event,
        recipient: matchingRecipient,
        standings,
      });
    const email = renderFinalStandingsEmail({
      event: context.event,
      recipient: matchingRecipient,
      standings,
      workspaceId: options.workspaceId,
    });

    try {
      const providerMessageId = await sendViaResend({
        to: delivery.recipient_email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      await updateDelivery(context.client, delivery.id, {
        status: "sent",
        provider: DELIVERY_PROVIDER,
        provider_message_id: providerMessageId,
        payload_snapshot: payload,
        error_message: null,
        last_attempt_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
      });
      sent += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to send email.";
      await updateDelivery(context.client, delivery.id, {
        status: "failed",
        provider: DELIVERY_PROVIDER,
        payload_snapshot: payload,
        error_message: message,
        last_attempt_at: new Date().toISOString(),
      });
      failed += 1;
    }
  }

  deliveries = await fetchOutstandingDeliveries({
    client: context.client,
    workspaceId: options.workspaceId,
    eventId: options.eventId,
    retryFailedOnly: false,
  });

  return {
    sent,
    failed,
    pending: deliveries.filter((delivery) => delivery.status === "pending")
      .length,
    skipped,
    total: recipients.length,
    isConfigured: true,
  };
}

async function loadEmailContext(options: {
  client: ServerClient;
  workspaceId: string;
  eventId: string;
}): Promise<EmailContext> {
  const { client, workspaceId, eventId } = options;
  const [eventResult, eventPlayersResult, matchesResult, roundsResult] =
    await Promise.all([
      client
        .from("events")
        .select("id,name,venue,starts_at")
        .eq("id", eventId)
        .eq("workspace_id", workspaceId)
        .single(),
      client
        .from("event_players")
        .select("id,player_id,name_snapshot,rating_snapshot,display_order")
        .eq("event_id", eventId)
        .order("display_order"),
      client
        .from("matches")
        .select(
          "id,round_id,court_number,status,team_one_player_one_id,team_one_player_two_id,team_two_player_one_id,team_two_player_two_id,team_one_score,team_two_score",
        )
        .eq("event_id", eventId),
      client
        .from("event_rounds")
        .select("id,round_number")
        .eq("event_id", eventId),
    ]);

  if (eventResult.error) throw eventResult.error;
  if (eventPlayersResult.error) throw eventPlayersResult.error;
  if (matchesResult.error) throw matchesResult.error;
  if (roundsResult.error) throw roundsResult.error;

  const playerIds = eventPlayersResult.data.map((player) => player.player_id);
  const { data: playerLinks, error: playerError } = await client
    .from("players")
    .select("id,app_user_id,account_email")
    .eq("workspace_id", workspaceId)
    .in("id", playerIds);
  if (playerError) throw playerError;

  const appUserIds = playerLinks
    .map((player) => player.app_user_id)
    .filter((id): id is string => Boolean(id));
  const appUsers = appUserIds.length
    ? await fetchAppUsers(client, appUserIds)
    : [];

  return {
    client,
    event: eventResult.data,
    eventPlayers: eventPlayersResult.data,
    matches: matchesResult.data,
    roundNumberById: new Map(
      roundsResult.data.map((round) => [round.id, round.round_number]),
    ),
    playerLinks,
    appUsers,
  };
}

async function fetchAppUsers(client: ServerClient, appUserIds: string[]) {
  const { data, error } = await client
    .from("app_users")
    .select("id,email,display_name")
    .in("id", appUserIds);
  if (error) throw error;
  return data;
}

async function fetchOutstandingDeliveries(options: {
  client: ServerClient;
  workspaceId: string;
  eventId: string;
  retryFailedOnly: boolean;
}) {
  const { client, workspaceId, eventId, retryFailedOnly } = options;
  const statuses = retryFailedOnly
    ? (["failed"] as const)
    : (["pending", "failed"] as const);
  const { data, error } = await client
    .from("event_email_deliveries")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("event_id", eventId)
    .eq("kind", DELIVERY_KIND)
    .in("status", statuses);
  if (error) throw error;
  return data;
}

function buildCompletedMatches(context: EmailContext): CompletedMatch[] {
  return context.matches.flatMap((match) => {
    if (
      match.status !== "completed" ||
      match.team_one_score === null ||
      match.team_two_score === null
    ) {
      return [];
    }

    return [
      {
        id: match.id,
        roundNumber: context.roundNumberById.get(match.round_id) ?? 0,
        courtNumber: match.court_number,
        teamOne: [match.team_one_player_one_id, match.team_one_player_two_id],
        teamTwo: [match.team_two_player_one_id, match.team_two_player_two_id],
        status: "completed" as const,
        teamOneScore: match.team_one_score,
        teamTwoScore: match.team_two_score,
      },
    ];
  });
}

function buildRecipientCandidates(context: EmailContext): CandidateRecipient[] {
  const playerLinkById = new Map(
    context.playerLinks.map((player) => [player.id, player]),
  );
  const appUserById = new Map(context.appUsers.map((user) => [user.id, user]));

  return context.eventPlayers.map((eventPlayer) => {
    const linkedPlayer = playerLinkById.get(eventPlayer.player_id);
    const appUser = linkedPlayer?.app_user_id
      ? appUserById.get(linkedPlayer.app_user_id)
      : null;
    return {
      eventPlayerId: eventPlayer.id,
      playerId: eventPlayer.player_id,
      playerName: eventPlayer.name_snapshot,
      appUserId: linkedPlayer?.app_user_id ?? null,
      accountEmail: linkedPlayer?.account_email ?? null,
      appUserEmail: appUser?.email ?? null,
      appUserDisplayName: appUser?.display_name ?? null,
    };
  });
}

function buildDeliveryPayload(options: {
  event: EventRow;
  recipient: Recipient;
  standings: Standing[];
}): Json {
  const { event, recipient, standings } = options;
  return {
    eventName: event.name,
    venue: event.venue,
    startsAt: event.starts_at,
    recipientEmail: recipient.recipientEmail,
    recipientName: recipient.recipientName,
    recipientEventPlayerId: recipient.eventPlayerId,
    standings: standings.map((row) => ({
      rank: row.rank,
      playerId: row.playerId,
      playerName: row.playerName,
      played: row.played,
      pointsFor: row.pointsFor,
      averagePoints: Number(row.averagePoints.toFixed(2)),
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
    })),
  };
}

function renderFinalStandingsEmail(options: {
  event: EventRow;
  recipient: Recipient;
  standings: Standing[];
  workspaceId: string;
}) {
  const { event, recipient, standings, workspaceId } = options;
  const subject = `${event.name} final standings`;
  const appOrigin = (
    process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3100"
  )
    .trim()
    .replace(/\/+$/, "");
  const standingsUrl = `${appOrigin}/events/${
    event.id
  }?${new URLSearchParams({ view: "standings", workspaceId })}`;
  const historyUrl = `${appOrigin}/history?${new URLSearchParams({
    workspaceId,
  })}`;
  const dateLabel = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(event.starts_at));
  const usesAverage =
    new Set(standings.map((standing) => standing.played)).size > 1;
  const intro = usesAverage
    ? "Ranking uses average points because players finished different numbers of matches."
    : "Ranking uses total points because players finished the same number of matches.";

  const rowsHtml = standings
    .map((row) => {
      const isRecipient = row.playerId === recipient.eventPlayerId;
      return `<tr style="${
        isRecipient ? "background:#ecfdf5;" : ""
      }"><td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700;">${
        row.rank
      }</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(
        row.playerName,
      )}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${
        row.played
      }</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${
        usesAverage ? row.averagePoints.toFixed(2) : row.pointsFor
      }</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;">${
        row.wins
      }-${row.draws}-${row.losses}</td></tr>`;
    })
    .join("");

  const textRows = standings
    .map((row) => {
      const marker = row.playerId === recipient.eventPlayerId ? "-> " : "   ";
      const score = usesAverage
        ? row.averagePoints.toFixed(2)
        : row.pointsFor.toString();
      return `${marker}${row.rank}. ${row.playerName} | played ${row.played} | score ${score} | record ${row.wins}-${row.draws}-${row.losses}`;
    })
    .join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,sans-serif;">
    <div style="max-width:720px;margin:0 auto;padding:24px;">
      <div style="background:#0f172a;color:#fff;border-radius:24px;padding:24px 28px;">
        <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#86efac;">Tournament complete</p>
        <h1 style="margin:0;font-size:32px;line-height:1.1;">${escapeHtml(
          event.name,
        )}</h1>
        <p style="margin:12px 0 0;font-size:15px;color:#cbd5e1;">${escapeHtml(
          dateLabel,
        )}${event.venue ? ` · ${escapeHtml(event.venue)}` : ""}</p>
      </div>
      <div style="background:#fff;border-radius:24px;padding:24px 28px;margin-top:20px;">
        <p style="margin:0 0 12px;font-size:16px;">Hi ${escapeHtml(
          recipient.recipientName,
        )},</p>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.7;">Final standings are locked in. ${escapeHtml(
          intro,
        )}</p>
        <div style="margin:0 0 18px;padding:0;">
          <a href="${escapeHtml(
            standingsUrl,
          )}" style="display:inline-block;margin-right:12px;margin-bottom:10px;border-radius:999px;background:#0f172a;padding:12px 18px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">Open event standings</a>
          <a href="${escapeHtml(
            historyUrl,
          )}" style="display:inline-block;margin-bottom:10px;border-radius:999px;border:1px solid #cbd5e1;padding:12px 18px;color:#0f172a;font-size:14px;font-weight:700;text-decoration:none;">View all-time leaderboard</a>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px;">
          <thead>
            <tr style="background:#f1f5f9;text-align:left;">
              <th style="padding:8px;">Rank</th>
              <th style="padding:8px;">Player</th>
              <th style="padding:8px;text-align:right;">Played</th>
              <th style="padding:8px;text-align:right;">${
                usesAverage ? "Avg pts" : "Points"
              }</th>
              <th style="padding:8px;text-align:right;">Record</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
  </body>
</html>`;
  const text = `${event.name}\n${dateLabel}${
    event.venue ? ` · ${event.venue}` : ""
  }\n\nHi ${recipient.recipientName},\n\nFinal standings are locked in. ${intro}\n\nOpen event standings: ${standingsUrl}\nView all-time leaderboard: ${historyUrl}\n\n${textRows}`;

  return { subject, html, text };
}

export const __testUtils = {
  renderFinalStandingsEmail,
};

async function updateDelivery(
  client: ServerClient,
  deliveryId: string,
  payload: DeliveryUpdate,
) {
  const { error } = await client
    .from("event_email_deliveries")
    .update(payload)
    .eq("id", deliveryId);
  if (error) throw error;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
