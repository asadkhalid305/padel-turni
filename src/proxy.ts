import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { safeInternalPath } from "@/lib/navigation";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/auth/callback",
  "/invites",
  "/support",
  "/contact",
];
const ACTIVE_WORKSPACE_COOKIE = "padeltour_active_workspace_id";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const isAdminApiPath = pathname.startsWith("/api/admin/users/");

  if (isAdminApiPath) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !publishableKey || !secretKey) {
    return isPublicPath ? NextResponse.next() : redirectToLogin(request);
  }

  let response = NextResponse.next({ request });
  const requestedWorkspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (requestedWorkspaceId && UUID_PATTERN.test(requestedWorkspaceId)) {
    request.cookies.set(ACTIVE_WORKSPACE_COOKIE, requestedWorkspaceId);
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath) {
    return redirectToLogin(request);
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(
      new URL(
        safeInternalPath(request.nextUrl.searchParams.get("next") ?? "/"),
        request.url,
      ),
    );
  }

  if (requestedWorkspaceId && UUID_PATTERN.test(requestedWorkspaceId)) {
    response.cookies.set(ACTIVE_WORKSPACE_COOKIE, requestedWorkspaceId, {
      sameSite: "lax",
      path: "/",
    });
  }

  return response;
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|opengraph-image|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
