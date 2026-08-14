import { Medal, TrendingUp, Trophy } from "lucide-react";

import { AccessLimited } from "@/components/access-limited";
import { CareerBoard } from "@/components/career-board";
import { Card, SectionHeading } from "@/components/ui";
import {
  canViewPrivateData,
  getHistoricalPlayerStats,
  listEvents,
} from "@/lib/data";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "History" };

export default async function HistoryPage() {
  const user = await getAuthenticatedUser();
  if (!(await canViewPrivateData(user))) {
    return <AccessLimited />;
  }
  const workspaceId = user?.activeWorkspaceId;
  if (!workspaceId) return <AccessLimited />;

  const [players, events] = await Promise.all([
    getHistoricalPlayerStats(workspaceId),
    listEvents(workspaceId),
  ]);
  const completed = events.filter((event) => event.status === "completed");
  return (
    <div className="space-y-7">
      <SectionHeading
        eyebrow="Across every event"
        title="History"
        description="Player trends are derived from completed matches while each event keeps its original roster snapshots."
      />
      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <Trophy className="text-amber-500" />
          <p className="mt-4 text-3xl font-black">{completed.length}</p>
          <p className="text-sm font-bold">Completed events</p>
        </Card>
        <Card>
          <TrendingUp className="text-emerald-600" />
          <p className="mt-4 text-3xl font-black">
            {players.reduce((total, player) => total + player.matches, 0)}
          </p>
          <p className="text-sm font-bold">Player appearances</p>
        </Card>
        <Card>
          <Medal className="text-sky-600" />
          <p className="mt-4 text-3xl font-black">{players.length}</p>
          <p className="text-sm font-bold">Ranked players</p>
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="overflow-hidden p-0">
          <div className="p-5">
            <h2 className="text-xl font-black">Career board</h2>
            <p className="text-sm text-slate-500">
              Ranked by average points, then win rate. Levels shown here are
              current; each event page keeps its event-start snapshot.
            </p>
          </div>
          <CareerBoard players={players} />
        </Card>

        <Card>
          <h2 className="text-xl font-black">Completed nights</h2>
          <div className="mt-5 space-y-3">
            {completed.length ? (
              completed.map((event) => (
                <div key={event.id} className="rounded-2xl bg-slate-50 p-4">
                  <p className="font-bold">{event.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDate(event.startsAt)}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-[var(--green)]">
                    {event.completedMatches} results · {event.playerCount}{" "}
                    players
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                Completed events will appear here.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
