import { diagnoseSchedule } from "@/domain/diagnostics";
import { generateSchedule } from "@/domain/scheduler";
import { calculateStandings } from "@/domain/standings";
import type { CompletedMatch, PlayerSeed } from "@/domain/types";

export const demoPlayers: PlayerSeed[] = [
  { id: "p1", name: "Maya Fischer", rating: 7.5 },
  { id: "p2", name: "Noah Becker", rating: 6 },
  { id: "p3", name: "Sofia Keller", rating: 8 },
  { id: "p4", name: "Leon Weber", rating: 5.5 },
  { id: "p5", name: "Amira Wagner", rating: 7 },
  { id: "p6", name: "Elias Hoffmann", rating: 6.5 },
  { id: "p7", name: "Nina Bauer", rating: 5 },
  { id: "p8", name: "Jonas Richter", rating: 8.5 },
  { id: "p9", name: "Lina Schmitt", rating: 6 },
];

const generated = generateSchedule({
  players: demoPlayers,
  courtCounts: [2, 2, 1, 2, 2],
  seed: 27,
  strategy: "rating_balanced",
});

const completedMatches: CompletedMatch[] = generated.rounds
  .slice(0, 2)
  .flatMap((round, roundIndex) =>
    round.matches.map((match, matchIndex) => ({
      ...match,
      status: "completed" as const,
      teamOneScore: 10 + roundIndex + matchIndex,
      teamTwoScore: 7 + matchIndex,
    })),
  );

export const demoEvent = {
  id: "demo-event",
  name: "Sunday Court Social",
  venue: "Court Haus Berlin",
  startsAt: "2026-06-21T10:00:00.000Z",
  status: "live",
  seed: 27,
  drawStrategy: "rating_balanced" as const,
  roundMinutes: 20,
  breakMinutes: 3,
  notes: "Friendly Americano with rotating partners.",
  players: demoPlayers,
  schedule: generated,
  completedMatches,
  standings: calculateStandings(demoPlayers, completedMatches),
  diagnostics: diagnoseSchedule(generated, demoPlayers),
};

export const demoEvents = [
  demoEvent,
  {
    ...demoEvent,
    id: "demo-event-2",
    name: "After Work Americano",
    startsAt: "2026-06-11T17:30:00.000Z",
    status: "completed",
  },
  {
    ...demoEvent,
    id: "demo-event-3",
    name: "Summer Ladder Night",
    startsAt: "2026-06-28T16:00:00.000Z",
    status: "scheduled",
  },
];
