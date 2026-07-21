import "server-only";

import {
  checkPublicRequestLimit,
  LANDING_VIEW_WINDOW_SECONDS,
} from "@/lib/public-request-protection";
import type { createServerClient } from "@/lib/supabase/server";

type ServerClient = NonNullable<ReturnType<typeof createServerClient>>;

export async function recordAnonymousLandingView(
  client: ServerClient,
  keyHash: string | null,
) {
  try {
    const shouldRecord = await checkPublicRequestLimit({
      client,
      scope: "landing_view",
      keyHash,
      windowSeconds: LANDING_VIEW_WINDOW_SECONDS,
      maxRequests: 1,
    });
    if (!shouldRecord) return;

    await recordProductEvent({
      client,
      eventType: "landing_viewed",
    });
  } catch {
    // Landing analytics are best-effort and must never affect the page.
  }
}

export async function recordProductEvent({
  client,
  eventType,
  metadata = {},
  user,
  workspaceId,
}: {
  client: ServerClient;
  eventType: string;
  metadata?: Record<string, string | number | boolean | null>;
  user?: { id: string; activeWorkspaceId?: string | null };
  workspaceId?: string | null;
}) {
  try {
    await client.from("app_events").insert({
      workspace_id: workspaceId ?? user?.activeWorkspaceId ?? null,
      app_user_id: user?.id ?? null,
      event_type: eventType,
      metadata,
    });
  } catch {
    // Analytics must never block the product action being measured.
  }
}
