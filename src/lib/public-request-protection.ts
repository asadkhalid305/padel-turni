import "server-only";

import { createHmac } from "node:crypto";

import { headers } from "next/headers";

import type { createServerClient } from "@/lib/supabase/server";

type ServerClient = NonNullable<ReturnType<typeof createServerClient>>;

export const LANDING_VIEW_WINDOW_SECONDS = 60 * 60;
export const FEEDBACK_WINDOW_SECONDS = 60 * 60;
export const FEEDBACK_REQUEST_LIMIT = 3;
export const MINIMUM_FEEDBACK_COMPLETION_MS = 3_000;

type PublicRequestScope = "landing_view" | "feedback";

export async function checkPublicRequestLimit({
  client,
  scope,
  userId,
  keyHash,
  windowSeconds,
  maxRequests,
}: {
  client: ServerClient;
  scope: PublicRequestScope;
  userId?: string | null;
  keyHash?: string | null;
  windowSeconds: number;
  maxRequests: number;
}) {
  try {
    const resolvedKeyHash =
      keyHash ?? (await createPublicRequestKey(scope, userId));
    if (!resolvedKeyHash) return false;

    const { data, error } = await client.rpc("consume_public_request_limit", {
      p_scope: scope,
      p_key_hash: resolvedKeyHash,
      p_window_seconds: windowSeconds,
      p_max_requests: maxRequests,
    });

    return !error && data === true;
  } catch {
    return false;
  }
}

export function isLikelyAutomatedFeedback({
  honeypot,
  startedAt,
  now = Date.now(),
}: {
  honeypot: FormDataEntryValue | null;
  startedAt: FormDataEntryValue | null;
  now?: number;
}) {
  if (typeof honeypot === "string" && honeypot.trim()) return true;
  if (typeof startedAt !== "string" || !/^\d{13}$/.test(startedAt)) {
    return true;
  }

  const elapsed = now - Number(startedAt);
  return (
    elapsed < MINIMUM_FEEDBACK_COMPLETION_MS || elapsed > 24 * 60 * 60 * 1000
  );
}

export async function createPublicRequestKey(
  scope: PublicRequestScope,
  userId?: string | null,
) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return null;

  const identity = userId ? `user:${userId}` : await requestAddress();
  if (!identity) return null;

  return createHmac("sha256", secret)
    .update(`${scope}:${identity}`)
    .digest("hex");
}

async function requestAddress() {
  const headerStore = await headers();
  const forwardedFor =
    headerStore.get("x-vercel-forwarded-for") ??
    headerStore.get("x-forwarded-for") ??
    headerStore.get("x-real-ip");

  return forwardedFor?.split(",")[0]?.trim() || null;
}
