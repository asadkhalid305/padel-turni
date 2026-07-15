import { CalendarPlus, Link2, UsersRound } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui";

const firstRunSteps = [
  {
    title: "Add roster",
    body: "Create player names and ratings.",
    icon: UsersRound,
  },
  {
    title: "Invite members",
    body: "Share private links from Players.",
    icon: Link2,
  },
  {
    title: "Run event",
    body: "Create a fair draw from the roster.",
    icon: CalendarPlus,
  },
];

export function WorkspaceEmptyState({
  canCreateEvent,
  canManage,
}: {
  canCreateEvent: boolean;
  canManage: boolean;
}) {
  return (
    <Card className="border-emerald-200 bg-emerald-50/80">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--green)]">
            First club setup
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--ink)]">
            Turn this private club into your first event desk.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Add at least four players, invite real members when you are ready,
            then create the first event. Until you invite someone, only you can
            see this club.
          </p>
          <ol className="mt-5 grid gap-3 sm:grid-cols-3">
            {firstRunSteps.map((step) => (
              <li key={step.title} className="rounded-xl bg-white/75 p-3">
                <step.icon className="text-[var(--green)]" size={18} />
                <p className="mt-2 text-sm font-black text-[var(--ink)]">
                  {step.title}
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
        {canManage ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-3">
              <Link
                href="/players"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-4 text-sm font-bold text-white"
              >
                <UsersRound size={17} />
                Add players
              </Link>
              {canCreateEvent ? (
                <Link
                  href="/events/new"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--lime)] px-4 text-sm font-bold text-[var(--ink)]"
                >
                  <CalendarPlus size={17} />
                  Create event
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-200 px-4 text-sm font-bold text-slate-500"
                >
                  <CalendarPlus size={17} />
                  Create event
                </span>
              )}
            </div>
            {!canCreateEvent ? (
              <p className="max-w-sm text-xs font-semibold leading-5 text-slate-500">
                Add at least four players before creating an event.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
