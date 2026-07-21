import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { NavigationProgress } from "@/components/navigation-progress";
import { listPlayers } from "@/lib/data";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userPromise = getAuthenticatedUser();
  const activePlayerCountPromise = userPromise.then(async (user) => {
    if (!user?.activeWorkspaceId) return 0;
    const players = await listPlayers(user.activeWorkspaceId);
    return players.filter((player) => player.isActive).length;
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
