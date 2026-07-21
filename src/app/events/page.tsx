import { ArrowRight, Calendar, MapPin, Users } from "lucide-react";
import Link from "next/link";

import { AccessLimited } from "@/components/access-limited";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { WorkspaceEmptyState } from "@/components/workspace-empty-state";
import { canViewPrivateData, listEvents, listPlayers } from "@/lib/data";
import { isWorkspaceAdminRole } from "@/lib/roles";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Events" };

function eventTone(status: string) {
  if (status === "live") return "live" as const;
  if (status === "completed") return "success" as const;
  return "info" as const;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const eventView = view === "archived" ? "archived" : "active";
  const user = await getAuthenticatedUser();
  if (!(await canViewPrivateData(user))) {
    return <AccessLimited />;
  }
  const workspaceId = user?.activeWorkspaceId;
  if (!workspaceId) return <AccessLimited />;

  const [events, players] = await Promise.all([
    listEvents(workspaceId, eventView),
    listPlayers(workspaceId),
  ]);
  const canManage = isWorkspaceAdminRole(user?.activeWorkspaceRole ?? null);
  const canCreateEvent =
    players.filter((player) => player.isActive).length >= 4;
  return (
    <div className="space-y-7">
      <SectionHeading
        eyebrow="Event operations"
        title="Events"
        description="Everything from first draw to final table, kept together."
        action={
          canManage && canCreateEvent ? (
            <Link
              href="/events/new"
              className="inline-flex min-h-11 items-center rounded-xl bg-[var(--ink)] px-4 text-sm font-bold text-white"
            >
              Create event
            </Link>
          ) : canManage ? (
            <span
              aria-disabled="true"
              className="inline-flex min-h-11 cursor-not-allowed items-center rounded-xl bg-slate-200 px-4 text-sm font-bold text-slate-500"
              title="Add at least four players before creating an event."
            >
              Create event
            </span>
          ) : null
        }
      />
      <nav className="flex w-fit gap-1 rounded-2xl border border-white/70 bg-white/65 p-1.5">
        <Link
          href="/events"
          className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
            eventView === "active"
              ? "bg-[var(--ink)] text-white"
              : "text-slate-500 hover:bg-white"
          }`}
        >
          Active
        </Link>
        <Link
          href="/events?view=archived"
          className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
            eventView === "archived"
              ? "bg-[var(--ink)] text-white"
              : "text-slate-500 hover:bg-white"
          }`}
        >
          Archived
        </Link>
      </nav>
      {!events.length && eventView === "active" ? (
        <WorkspaceEmptyState
          canCreateEvent={canCreateEvent}
          canManage={canManage}
        />
      ) : null}
      {!events.length && eventView === "archived" ? (
        <Card>
          <p className="font-black text-[var(--ink)]">No archived events</p>
          <p className="mt-1 text-sm text-slate-500">
            Completed events you archive and cancelled events will appear here.
          </p>
        </Card>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {events.map((event) => (
          <Card key={event.id} className="group">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge tone={eventTone(event.status)}>{event.status}</Badge>
                {event.isArchived && event.status === "completed" ? (
                  <Badge>archived</Badge>
                ) : null}
                {!event.standingsEligible ? (
                  <Badge tone="warning">excluded from standings</Badge>
                ) : null}
              </div>
              <span className="text-xs font-bold text-slate-400">
                {event.completedMatches}/{event.totalMatches} played
              </span>
            </div>
            <h2 className="mt-5 text-2xl font-black tracking-tight text-[var(--ink)]">
              {event.name}
            </h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <Calendar size={16} className="text-[var(--green)]" />
                {formatDate(event.startsAt)}
              </p>
              <p className="flex items-center gap-2">
                <MapPin size={16} className="text-[var(--green)]" />
                {event.venue || "Venue not set"}
              </p>
              <p className="flex items-center gap-2">
                <Users size={16} className="text-[var(--green)]" />
                {event.playerCount} players
              </p>
            </div>
            <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[var(--lime)]"
                style={{
                  width: `${
                    event.totalMatches
                      ? (event.completedMatches / event.totalMatches) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
            <Link
              href={`/events/${event.id}`}
              className="mt-5 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm font-black text-[var(--ink)] transition group-hover:bg-[var(--ink)] group-hover:text-white"
            >
              {canManage ? "Manage event" : "Open event"}{" "}
              <ArrowRight size={17} />
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
