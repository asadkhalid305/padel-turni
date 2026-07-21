"use server";

import { redirect } from "next/navigation";

import {
  createAuthClient,
  createServerClient,
  isSupabaseAuthConfigured,
} from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/navigation";
import { recordProductEvent } from "@/lib/product-analytics";
import { requestOrigin } from "@/lib/request-origin";

export async function signInWithGoogle(formData: FormData) {
  if (!isSupabaseAuthConfigured()) {
    redirect("/login?error=auth-not-configured");
  }

  const authClient = await createAuthClient();
  if (!authClient) {
    redirect("/login?error=auth-not-configured");
  }

  const next = safeInternalPath(String(formData.get("next") ?? "/"));
  const eventClient = createServerClient();
  if (eventClient) {
    await recordProductEvent({
      client: eventClient,
      eventType: "sign_in_started",
      metadata: { destination: signInDestination(next) },
    });
  }

  const origin = await requestOrigin();
  const { data, error } = await authClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    redirect("/login?error=google-sign-in-failed");
  }

  redirect(data.url);
}

function signInDestination(next: string) {
  if (next === "/") return "home";
  if (next === "/invites" || next.startsWith("/invites/")) return "invite";
  return "app";
}
