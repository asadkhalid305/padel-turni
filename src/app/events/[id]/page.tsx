import {
  CalendarClock,
  CircleCheckBig,
  Clock3,
  ListChecks,
  Scale,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessLimited } from "@/components/access-limited";
import { CompletedMatchActions } from "@/components/completed-match-actions";
import { EventAdminActions } from "@/components/event-admin-actions";
import { EventStandingsTable } from "@/components/event-standings-table";
import { MatchTimer } from "@/components/match-timer";
import { PageBackLink } from "@/components/page-back-link";
import { RoundDrawEditor } from "@/components/round-draw-editor";
import { ScoreForm } from "@/components/score-form";
import {
  TimerSoundProvider,
  TimerSoundToggle,
} from "@/components/timer-sound-toggle";
import { Badge, Card } from "@/components/ui";
import { diagnoseSchedule } from "@/domain/diagnostics";
import { canEditDrawLineup } from "@/domain/draw-permissions";
import {
  canArchiveEvent,
  canCompleteEvent,
  canDeleteEvent,
} from "@/domain/event-mutations";
import { canManageLiveMatches } from "@/domain/event-status";
import type { ScheduledMatch } from "@/domain/types";
import { canViewPrivateData, getEvent, type EventMatch } from "@/lib/data";
import { isWorkspaceAdminRole } from "@/lib/roles";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { formatDate, initials } from "@/lib/utils";

function statusTone(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "live") return "live" as const;
  if (status === "paused") return "warning" as const;
  if (status === "cancelled") return "danger" as const;
  return "info" as const;
}

function formatDuration(seconds: number) {
  const minutes = seconds / 60;
  return Number.isInteger(minutes)
    ? `${minutes} min`
    : `${minutes.toFixed(1)} min`;
}

function formatCourtList(courts: number[]) {
  if (!courts.length) return "No courts";
  return courts.map((court) => `Court ${court}`).join(", ");
}

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ id }, { view = "overview" }] = await Promise.all([
    params,
    searchParams,
  ]);
  const user = await getAuthenticatedUser();
  if (!(await canViewPrivateData(user))) {
    return <AccessLimited />;
  }
  const workspaceId = user?.activeWorkspaceId;
  if (!workspaceId) return <AccessLimited />;

  const event = await getEvent(id, workspaceId);
  if (!event) notFound();
  const canManage = isWorkspaceAdminRole(user?.activeWorkspaceRole ?? null);
  const initialTimerNow = new Date().toISOString();
  const liveControlsEnabled = canManageLiveMatches({
    canManage,
    eventStatus: event.status,
  });

  const playerById = new Map(
    event.players.map((player) => [player.id, player]),
  );
  const diagnostics =
    "diagnostics" in event
      ? event.diagnostics
      : diagnoseSchedule(event.schedule, event.players);
  const completedById = new Map(
    event.completedMatches.map((match) => [match.id, match]),
  );
  const allMatches = event.schedule.rounds.flatMap((round) => round.matches);
  const matchStatuses = allMatches.map((match) => {
    const enriched = match as ScheduledMatch & Partial<EventMatch>;
    return enriched.status ?? "scheduled";
  });
  const canDeleteCurrentEvent =
    canManage &&
    canDeleteEvent({
      eventStatus: event.status,
      matchStatuses,
    });
  const canCompleteCurrentEvent =
    canManage &&
    canCompleteEvent({
      eventStatus: event.status,
      matchStatuses,
    });
  const canArchiveCurrentEvent =
    canManage && canArchiveEvent({ eventStatus: event.status });
  const courtNumbers = [
    ...new Set(allMatches.map((match) => match.courtNumber)),
  ].sort((first, second) => first - second);
  const roundTiming = event.schedule.rounds.map((round, index) => {
    const durations = [
      ...new Set(
        round.matches.map((match) => {
          const enriched = match as ScheduledMatch & Partial<EventMatch>;
          return enriched.timerDurationSeconds ?? event.roundMinutes * 60;
        }),
      ),
    ].sort((first, second) => first - second);
    return {
      roundNumber: round.roundNumber,
      courts: round.matches
        .map((match) => match.courtNumber)
        .sort((first, second) => first - second),
      durations,
      breakMinutes:
        index === event.schedule.rounds.length - 1 ? 0 : event.breakMinutes,
    };
  });

  const tabs = [
    { value: "overview", label: "Overview" },
    { value: "draw", label: "Draw" },
    { value: "live", label: "Live" },
    { value: "standings", label: "Standings" },
  ];
  const drawTransparencyCard = (
    <Card className="xl:col-span-2">
      <div className="flex items-center gap-2">
        <ListChecks size={19} className="text-[var(--green)]" />
        <h2 className="text-xl font-black">Draw transparency</h2>
      </div>
      <div className="mt-3 grid gap-3 text-sm leading-6 text-slate-600 lg:grid-cols-2">
        <p>
          The draw first balances how often every player appears, then limits
          back-to-back rests, avoids repeat partners and opponents, and then
          uses snapshot ratings to make each match as even as possible.
        </p>
        <p>
          For each match, the scheduler compares the possible team pairs and
          prefers the lowest gap between the two team rating totals, for example
          8+5 against 7+6.
        </p>
      </div>
      <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold leading-6 text-emerald-900">
        Avg rating gap is not the gap between partners. It measures how close
        each player&apos;s matches were between the two sides. If a perfectly
        balanced pairing is not possible, the draw uses the fairest available
        compromise; ask an admin if a draw should be changed.
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              {[
                "Player",
                "Apps",
                "Rests",
                "Max rest",
                "Repeat partners",
                "Repeat opponents",
                "Avg rating gap",
              ].map((heading) => (
                <th key={heading} className="px-4 py-3 font-black">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {diagnostics.playerFairness.map((player) => (
              <tr
                key={player.playerId}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-4 py-3 font-bold text-[var(--ink)]">
                  {player.playerName}
                </td>
                <td className="px-4 py-3">{player.appearances}</td>
                <td className="px-4 py-3">{player.rests}</td>
                <td className="px-4 py-3">{player.maxConsecutiveRests}</td>
                <td className="px-4 py-3">{player.repeatedPartners}</td>
                <td className="px-4 py-3">{player.repeatedOpponents}</td>
                <td className="px-4 py-3">
                  {player.averageRatingDifference.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageBackLink href="/events" label="All events" />

      <section className="court-lines overflow-hidden rounded-[1.6rem] bg-[var(--ink)] p-6 text-white shadow-xl sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge tone={statusTone(event.status)}>{event.status}</Badge>
            <h1 className="mt-5 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              {event.name}
            </h1>
            <p className="mt-3 text-sm text-white/60 sm:text-base">
              {formatDate(event.startsAt)} · {event.venue || "Venue not set"}
            </p>
            {canManage ? (
              <div className="mt-5">
                <EventAdminActions
                  eventId={event.id}
                  canComplete={canCompleteCurrentEvent}
                  canDelete={canDeleteCurrentEvent}
                  canArchive={canArchiveCurrentEvent}
                  canRetryEmails={Boolean(event.emailDeliverySummary?.canRetry)}
                  showDelete={event.status === "scheduled"}
                />
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Players", event.players.length],
              ["Rounds", event.schedule.rounds.length],
              ["Played", event.completedMatches.length],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center"
              >
                <strong className="block text-2xl text-[var(--lime)]">
                  {value}
                </strong>
                <span className="text-xs text-white/50">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-white/70 bg-white/65 p-1.5">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={`/events/${event.id}?view=${tab.value}`}
            className={`min-w-max rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              view === tab.value
                ? "bg-[var(--ink)] text-white"
                : "text-slate-500 hover:bg-white hover:text-[var(--ink)]"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {view === "overview" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
          <Card>
            <div className="flex items-center gap-2">
              <Users size={19} className="text-[var(--green)]" />
              <h2 className="text-xl font-black">Event roster</h2>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {event.players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-emerald-100 text-xs font-black text-emerald-900">
                    {initials(player.name)}
                  </span>
                  <span>
                    <span className="block text-sm font-bold">
                      {player.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      Snapshot rating {player.rating.toFixed(1)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-2">
              <ShieldCheck size={19} className="text-[var(--green)]" />
              <h2 className="text-xl font-black">Fairness check</h2>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                ["Appearance spread", diagnostics.appearanceSpread],
                ["Max rest streak", diagnostics.maxConsecutiveRests],
                ["Repeated partners", diagnostics.repeatedPartnerPairs],
                ["Repeated opponents", diagnostics.repeatedOpponentPairs],
                [
                  "Avg. rating gap",
                  diagnostics.averageRatingDifference.toFixed(1),
                ],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-emerald-50 p-4">
                  <strong className="block text-2xl font-black text-[var(--ink)]">
                    {value}
                  </strong>
                  <span className="text-xs font-semibold text-slate-500">
                    {label}
                  </span>
                </div>
              ))}
            </div>
            <div
              className={`mt-4 rounded-xl p-3 text-sm font-bold ${
                diagnostics.isConsistent
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-rose-100 text-rose-800"
              }`}
            >
              {diagnostics.isConsistent
                ? "Schedule consistency checks pass."
                : diagnostics.issues.join(" ")}
            </div>
          </Card>
          {canManage && event.status === "completed" ? (
            <Card>
              <div className="flex items-center gap-2">
                <CircleCheckBig size={19} className="text-[var(--green)]" />
                <h2 className="text-xl font-black">Standings emails</h2>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {[
                  ["Sent", event.emailDeliverySummary?.sent ?? 0],
                  ["Failed", event.emailDeliverySummary?.failed ?? 0],
                  ["Pending", event.emailDeliverySummary?.pending ?? 0],
                  ["Skipped", event.emailDeliverySummary?.skipped ?? 0],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-slate-50 p-4">
                    <strong className="block text-2xl font-black text-[var(--ink)]">
                      {value}
                    </strong>
                    <span className="text-xs font-semibold text-slate-500">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                {event.emailDeliverySummary?.isConfigured
                  ? "Emails use the configured Resend sender."
                  : "Resend is not configured yet. Deliveries stay pending until the server env vars are set."}
              </div>
            </Card>
          ) : null}
          {drawTransparencyCard}
        </div>
      ) : null}

      {view === "draw" ? (
        <div className="space-y-5">
          {event.schedule.rounds.map((round) => {
            const roundMatches = round.matches.map((match) => {
              const enriched = match as ScheduledMatch & Partial<EventMatch>;
              const completed = completedById.get(match.id);
              const status =
                enriched.status ?? (completed ? "completed" : "scheduled");
              return { match, status };
            });
            const roundEditorMatches = roundMatches.map(
              ({ match, status }) => ({
                id: match.id,
                courtNumber: match.courtNumber,
                playerIds: [...match.teamOne, ...match.teamTwo] as [
                  string,
                  string,
                  string,
                  string,
                ],
                isEditable: canEditDrawLineup({
                  canManage,
                  eventStatus: event.status,
                  matchStatus: status,
                }),
              }),
            );
            const hasEditableMatches = roundEditorMatches.some(
              (match) => match.isEditable,
            );
            return (
              <section key={round.roundNumber}>
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-xl font-black text-[var(--ink)]">
                    Round {round.roundNumber}
                  </h2>
                  <span className="text-sm font-semibold text-slate-500">
                    {round.matches.length} court
                    {round.matches.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  {roundMatches.map(({ match, status }) => (
                    <Card
                      key={match.id}
                      className="border-emerald-950/10 bg-white p-0"
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-5 pt-5 text-xs font-black uppercase tracking-[0.16em] text-[var(--green)]">
                          Court {match.courtNumber}
                        </span>
                        <span className="px-5 pt-5">
                          <Badge tone={statusTone(status)}>{status}</Badge>
                        </span>
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3 p-5">
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-center">
                          <p className="mb-2 text-[0.68rem] font-black uppercase tracking-[0.14em] text-emerald-700">
                            Team 1
                          </p>
                          {match.teamOne.map((playerId) => (
                            <p
                              key={playerId}
                              className="text-base font-black leading-7 text-[var(--ink)]"
                            >
                              {playerById.get(playerId)?.name ?? "Unknown"}
                            </p>
                          ))}
                        </div>
                        <span className="self-center rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-400">
                          VS
                        </span>
                        <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-center">
                          <p className="mb-2 text-[0.68rem] font-black uppercase tracking-[0.14em] text-sky-700">
                            Team 2
                          </p>
                          {match.teamTwo.map((playerId) => (
                            <p
                              key={playerId}
                              className="text-base font-black leading-7 text-[var(--ink)]"
                            >
                              {playerById.get(playerId)?.name ?? "Unknown"}
                            </p>
                          ))}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
                {hasEditableMatches ? (
                  <RoundDrawEditor
                    eventId={event.id}
                    roundNumber={round.roundNumber}
                    matches={roundEditorMatches}
                    players={event.players}
                  />
                ) : null}
                {round.restingPlayerIds.length ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-800">
                      Waiting this round
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {round.restingPlayerIds.map((playerId) => {
                        const player = playerById.get(playerId);
                        return (
                          <span
                            key={playerId}
                            className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-amber-950 shadow-sm"
                          >
                            <span className="grid size-6 place-items-center rounded-full bg-amber-100 text-[0.65rem] font-black">
                              {player ? initials(player.name) : "?"}
                            </span>
                            {player?.name ?? "Unknown"}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </section>
            );
          })}
          {drawTransparencyCard}
        </div>
      ) : null}

      {view === "live" ? (
        <TimerSoundProvider>
          <div className="space-y-4">
            <TimerSoundToggle />
            {canManage && !liveControlsEnabled ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
                Match timers and scores unlock when the event start time
                arrives. Edit the event start time first if play is beginning
                now.
              </div>
            ) : null}
            <div className="grid gap-4 xl:grid-cols-2">
              {allMatches.map((match) => {
                const enriched = match as ScheduledMatch & Partial<EventMatch>;
                const completed = completedById.get(match.id);
                const status =
                  enriched.status ?? (completed ? "completed" : "scheduled");
                const teamOneScore =
                  enriched.teamOneScore ?? completed?.teamOneScore ?? 0;
                const teamTwoScore =
                  enriched.teamTwoScore ?? completed?.teamTwoScore ?? 0;
                return (
                  <Card
                    key={match.id}
                    className={status === "live" ? "ring-2 ring-rose-300" : ""}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-[0.16em] text-[var(--green)]">
                        Round {match.roundNumber} · Court {match.courtNumber}
                      </span>
                      <Badge tone={statusTone(status)}>{status}</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <div className="text-center">
                        {match.teamOne.map((playerId) => (
                          <p key={playerId} className="text-sm font-bold">
                            {playerById.get(playerId)?.name}
                          </p>
                        ))}
                      </div>
                      <span className="text-sm font-black text-slate-300">
                        VS
                      </span>
                      <div className="text-center">
                        {match.teamTwo.map((playerId) => (
                          <p key={playerId} className="text-sm font-bold">
                            {playerById.get(playerId)?.name}
                          </p>
                        ))}
                      </div>
                    </div>
                    {status === "completed" ? (
                      <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-center">
                        <CircleCheckBig
                          className="mx-auto text-emerald-600"
                          size={22}
                        />
                        <p className="mt-2 text-3xl font-black text-[var(--ink)]">
                          {teamOneScore} : {teamTwoScore}
                        </p>
                        <p className="text-xs font-bold text-emerald-700">
                          Final score locked
                        </p>
                        {canManage && event.status !== "completed" ? (
                          <CompletedMatchActions
                            eventId={event.id}
                            matchId={match.id}
                            eventStatus={event.status}
                            teamOneScore={teamOneScore}
                            teamTwoScore={teamTwoScore}
                          />
                        ) : null}
                      </div>
                    ) : status === "cancelled" ? (
                      <div className="mt-5 rounded-2xl bg-rose-50 p-4 text-center">
                        <p className="text-sm font-black text-rose-800">
                          Match cancelled
                        </p>
                        <p className="mt-1 text-xs font-bold text-rose-700">
                          Not played and excluded from standings
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="mt-5">
                          <MatchTimer
                            matchId={match.id}
                            eventId={event.id}
                            durationSeconds={
                              enriched.timerDurationSeconds ??
                              event.roundMinutes * 60
                            }
                            startedAt={enriched.timerStartedAt ?? null}
                            pausedAt={enriched.timerPausedAt ?? null}
                            accumulatedPauseSeconds={
                              enriched.timerAccumulatedPauseSeconds ?? 0
                            }
                            initialNow={initialTimerNow}
                            canManage={canManage}
                            disabled={!liveControlsEnabled}
                          />
                        </div>
                        {canManage ? (
                          <ScoreForm
                            matchId={match.id}
                            eventId={event.id}
                            disabled={!liveControlsEnabled}
                          />
                        ) : null}
                      </>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        </TimerSoundProvider>
      ) : null}

      {view === "standings" ? (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between p-5">
            <div>
              <h2 className="text-xl font-black">Official table</h2>
              <p className="mt-1 text-sm text-slate-500">
                {new Set(event.standings.map((row) => row.played)).size > 1
                  ? "Average points ranking because match counts differ."
                  : "Total points ranking because match counts are equal."}
              </p>
            </div>
            <Scale className="text-[var(--green)]" />
          </div>
          <EventStandingsTable standings={event.standings} />
        </Card>
      ) : null}

      {view === "live" || view === "standings" ? drawTransparencyCard : null}

      {view === "overview" ? (
        <>
          <Card>
            <div className="flex items-center gap-2">
              <CalendarClock size={19} className="text-[var(--green)]" />
              <h2 className="text-xl font-black">Tournament timing</h2>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    {["Round", "Courts", "Match time", "Break after"].map(
                      (heading) => (
                        <th key={heading} className="px-4 py-3 font-black">
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {roundTiming.map((round) => (
                    <tr
                      key={round.roundNumber}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="px-4 py-3 font-bold text-[var(--ink)]">
                        Round {round.roundNumber}
                      </td>
                      <td className="px-4 py-3">
                        {formatCourtList(round.courts)}
                      </td>
                      <td className="px-4 py-3">
                        {round.durations.map(formatDuration).join(", ")}
                      </td>
                      <td className="px-4 py-3">
                        {round.breakMinutes
                          ? `${round.breakMinutes} min`
                          : "Done"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="flex items-center gap-3 py-4">
              <Clock3 className="text-[var(--green)]" size={20} />
              <span>
                <strong className="block text-sm">
                  {event.roundMinutes} min
                </strong>
                <span className="text-xs text-slate-500">match duration</span>
              </span>
            </Card>
            <Card className="flex items-center gap-3 py-4">
              <CalendarClock className="text-[var(--green)]" size={20} />
              <span>
                <strong className="block text-sm">
                  {event.breakMinutes} min
                </strong>
                <span className="text-xs text-slate-500">between rounds</span>
              </span>
            </Card>
            <Card className="flex items-center gap-3 py-4">
              <Users className="text-[var(--green)]" size={20} />
              <span>
                <strong className="block text-sm">{courtNumbers.length}</strong>
                <span className="text-xs text-slate-500">courts used</span>
              </span>
            </Card>
            <Card className="flex items-center gap-3 py-4">
              <ShieldCheck className="text-[var(--green)]" size={20} />
              <span>
                <strong className="block text-sm">Protected</strong>
                <span className="text-xs text-slate-500">
                  completed matches
                </span>
              </span>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
