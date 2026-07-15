import "server-only";

import type { createServerClient } from "@/lib/supabase/server";

type ServerClient = NonNullable<ReturnType<typeof createServerClient>>;

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
