import { NextResponse, type NextRequest } from "next/server";

import {
  createAuthClient,
  createServerClient,
  ensureAppUser,
  isSupabaseAuthConfigured,
} from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/navigation";
import { recordProductEvent } from "@/lib/product-analytics";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeInternalPath(requestUrl.searchParams.get("next") ?? "/");

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing-code", request.url),
    );
  }

  if (!isSupabaseAuthConfigured()) {
    return NextResponse.redirect(
      new URL("/login?error=auth-not-configured", request.url),
    );
  }

  const authClient = await createAuthClient();
  if (!authClient) {
    return NextResponse.redirect(
      new URL("/login?error=auth-not-configured", request.url),
    );
  }

  const { error } = await authClient.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=session-exchange-failed", request.url),
    );
  }

  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user?.email) {
    return NextResponse.redirect(
      new URL("/login?error=missing-email", request.url),
    );
  }

  const appUser = await ensureAppUser({
    id: user.id,
    email: user.email,
    displayName:
      typeof user.user_metadata.name === "string"
        ? user.user_metadata.name
        : "",
  });
  if (!appUser) {
    return NextResponse.redirect(
      new URL("/login?error=account-creation-failed", request.url),
    );
  }
  const eventClient = createServerClient();
  if (
    eventClient &&
    appUser.workspaces.length === 1 &&
    appUser.activeWorkspaceRole === "owner"
  ) {
    await recordProductEvent({
      client: eventClient,
      eventType: "first_club_ready",
      user: appUser,
    });
  }

  return NextResponse.redirect(new URL(next, request.url));
}
