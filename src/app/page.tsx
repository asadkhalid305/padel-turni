import {
  ArrowRight,
  CalendarDays,
  CircleCheckBig,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { AccessLimited } from "@/components/access-limited";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { PublicLanding } from "@/components/public-landing";
import { WorkspaceEmptyState } from "@/components/workspace-empty-state";
import { canViewPrivateData, listEvents, listPlayers } from "@/lib/data";
import { isWorkspaceAdminRole } from "@/lib/roles";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Padel Tourni",
  description:
    "Padel Tourni is a free web app for clubs and casual groups to organize fair padel events, run live matches, and keep standings.",
  openGraph: {
    title: "Padel Tourni",
    description:
      "Free padel tournament management for clubs and casual groups.",
  },
};

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return <PublicLanding />;
  }

  if (!(await canViewPrivateData(user))) {
    return <AccessLimited />;
  }
  const workspaceId = user?.activeWorkspaceId;
  if (!workspaceId) return <AccessLimited />;

  const [players, events] = await Promise.all([
    listPlayers(workspaceId),
    listEvents(workspaceId),
  ]);
  const liveEvents = events.filter((event) => event.status === "live");
  const canManage = isWorkspaceAdminRole(user?.activeWorkspaceRole ?? null);
  const canCreateEvent =
    players.filter((player) => player.isActive).length >= 4;
  const completedMatches = events.reduce(
    (total, event) => total + event.completedMatches,
    0,
  );
  const nextEvent =
    events
      .filter((event) => new Date(event.startsAt) >= new Date())
      .sort(
        (first, second) =>
          new Date(first.startsAt).getTime() -
          new Date(second.startsAt).getTime(),
      )[0] ?? events[0];

  return (
    <div className="space-y-7">
      <SectionHeading
        eyebrow="Tournament desk"
        title="Good games start with a fair draw."
        description="Build balanced rotations, keep every court moving, and let live results update the table."
      />
      {!players.length && !events.length ? (
        <WorkspaceEmptyState
          canCreateEvent={canCreateEvent}
          canManage={canManage}
        />
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Active players",
            value: players.filter((player) => player.isActive).length,
            icon: Users,
            note: `${players.length} in the roster`,
          },
          {
            label: "Events",
            value: events.length,
            icon: CalendarDays,
            note: `${liveEvents.length} live now`,
          },
          {
            label: "Matches played",
            value: completedMatches,
            icon: CircleCheckBig,
            note: "Results are locked",
          },
          {
            label: "Fairness engine",
            value: "On",
            icon: Sparkles,
            note: "Seeded and deterministic",
          },
        ].map((stat) => (
          <Card key={stat.label} className="relative overflow-hidden">
            <div className="absolute -right-5 -top-5 size-24 rounded-full bg-[var(--lime)]/20" />
            <stat.icon className="text-[var(--green)]" size={21} />
            <p className="mt-5 text-3xl font-black tracking-tight text-[var(--ink)]">
              {stat.value}
            </p>
            <p className="mt-1 text-sm font-bold">{stat.label}</p>
            <p className="mt-1 text-xs text-slate-500">{stat.note}</p>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <Card className="court-lines overflow-hidden bg-[var(--ink)] p-0 text-white">
          {nextEvent ? (
            <div className="grid min-h-[300px] gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="self-start">
                <Badge tone={nextEvent.status === "live" ? "live" : "success"}>
                  {nextEvent.status}
                </Badge>
                <p className="mt-6 text-sm font-bold text-[var(--lime)]">
                  Up next
                </p>
                <h2 className="mt-2 max-w-xl text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                  {nextEvent.name}
                </h2>
                <p className="mt-4 text-white/65">
                  {formatDate(nextEvent.startsAt)} · {nextEvent.venue}
                </p>
                <div className="mt-6 flex flex-wrap gap-5 text-sm">
                  <span>
                    <strong className="block text-2xl text-white">
                      {nextEvent.playerCount}
                    </strong>
                    <span className="text-white/50">players</span>
                  </span>
                  <span>
                    <strong className="block text-2xl text-white">
                      {nextEvent.totalMatches}
                    </strong>
                    <span className="text-white/50">matches</span>
                  </span>
                </div>
              </div>
              <Link
                href={`/events/${nextEvent.id}`}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--lime)] px-5 font-black text-[var(--ink)]"
              >
                Open event <ArrowRight size={18} />
              </Link>
            </div>
          ) : (
            <div className="space-y-4 p-8">
              <h2 className="text-3xl font-black">Your first event awaits.</h2>
              <p className="max-w-lg text-sm leading-6 text-white/65">
                Add players first, then create an event with a balanced draw.
              </p>
              <Link
                href={players.length ? "/events/new" : "/players"}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--lime)] px-5 font-black text-[var(--ink)]"
              >
                {players.length ? "Create an event" : "Add players"}
                <ArrowRight size={18} />
              </Link>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--green)]">
                Recent activity
              </p>
              <h2 className="mt-1 text-xl font-black">Event pulse</h2>
            </div>
            <Link
              href="/events"
              className="text-sm font-bold text-[var(--green)]"
            >
              View all
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {events.length ? (
              events.slice(0, 4).map((event) => (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/40"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 font-black text-emerald-800">
                    {event.name[0]}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">
                      {event.name}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {event.completedMatches}/{event.totalMatches} matches
                    </span>
                  </span>
                  <ArrowRight className="ml-auto text-slate-300" size={17} />
                </Link>
              ))
            ) : (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                Events created in this club will appear here.
              </p>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
