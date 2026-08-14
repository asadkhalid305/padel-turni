import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { NavigationProgress } from "@/components/navigation-progress";
import { listEligibleRosterPlayers } from "@/lib/data";
import { getRatingQuestionnaireProfile } from "@/lib/rating-questionnaire";
import { getAuthenticatedUser } from "@/lib/supabase/server";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3100",
  ),
  title: {
    default: "Padel Turni",
    template: "%s | Padel Turni",
  },
  description:
    "Padel Turni is a free web app for clubs and casual groups to create fair padel draws, run live matches, and track standings.",
  applicationName: "Padel Turni",
  openGraph: {
    type: "website",
    siteName: "Padel Turni",
    title: "Padel Turni",
    description:
      "Free padel tournament management for clubs and casual groups.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Padel Turni",
    description:
      "Free padel tournament management for clubs and casual groups.",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-padeltour-pathname") ?? "/";
  const user = await getAuthenticatedUser();

  if (user && !isOnboardingExemptPath(pathname)) {
    const ratingProfile = await getRatingQuestionnaireProfile(user.id);
    if (ratingProfile?.onboarding_status !== "completed") {
      redirect("/rating");
    }
  }

  const userPromise = Promise.resolve(user);
  const activePlayerCountPromise = userPromise.then(async (user) => {
    if (!user?.activeWorkspaceId) return 0;
    const players = await listEligibleRosterPlayers(user.activeWorkspaceId);
    return players.length;
  });

  return (
    <html lang="en">
      <body>
        <NavigationProgress />
        <AppShell
          userPromise={userPromise}
          activePlayerCountPromise={activePlayerCountPromise}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}

function isOnboardingExemptPath(pathname: string) {
  return [
    "/rating",
    "/invites",
    "/support",
    "/contact",
    "/privacy",
    "/imprint",
    "/terms",
  ].some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
