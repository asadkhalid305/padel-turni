import { describe, expect, it } from "vitest";

import { diagnoseSchedule } from "@/domain/diagnostics";
import {
  calculateCourtSlots,
  calculatePlayerAppearanceRange,
  calculateScheduleCapacity,
  calculateScheduledAppearances,
  recommendMatchDuration,
} from "@/domain/schedule-calculations";
import { generateSchedule } from "@/domain/scheduler";
import type { PlayerSeed } from "@/domain/types";

function players(count: number): PlayerSeed[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `Player ${index + 1}`,
    rating: (index % 10) + 1,
  }));
}

describe("schedule calculations", () => {
  it("calculates court slots and appearances with unequal availability", () => {
    const rounds = [{ courtCount: 2 }, { courtCount: 1 }, { courtCount: 3 }];
    expect(calculateCourtSlots(rounds)).toBe(6);
    expect(calculateScheduledAppearances(rounds)).toBe(24);
  });

  it("recommends a whole-minute match duration", () => {
    expect(
      recommendMatchDuration({
        eventMinutes: 120,
        roundCount: 4,
        breakMinutes: 5,
      }),
    ).toBe(26);
  });

  it("calculates matches and expands rounds to use available event time", () => {
    expect(
      calculateScheduleCapacity({
        courtMinutes: [120, 120],
        requestedRoundMinutes: 20,
        breakMinutes: 3,
      }),
    ).toEqual({
      roundCount: 5,
      matchCount: 10,
      roundMinutes: 21,
      courtMinutes: [120, 120],
      courtNumbersByRound: [
        [1, 2],
        [1, 2],
        [1, 2],
        [1, 2],
        [1, 2],
      ],
      usedCourtMinutes: 234,
      unusedCourtMinutes: 6,
    });
  });

  it("keeps physical court numbers when availability differs", () => {
    expect(
      calculateScheduleCapacity({
        courtMinutes: [120, 180],
        requestedRoundMinutes: 20,
        breakMinutes: 3,
      }),
    ).toEqual({
      roundCount: 7,
      matchCount: 12,
      roundMinutes: 21,
      courtMinutes: [120, 180],
      courtNumbersByRound: [[1, 2], [1, 2], [1, 2], [1, 2], [1, 2], [2], [2]],
      usedCourtMinutes: 282,
      unusedCourtMinutes: 18,
    });
  });

  it("rejects events too short for one preferred match", () => {
    expect(() =>
      calculateScheduleCapacity({
        courtMinutes: [15, 15],
        requestedRoundMinutes: 20,
        breakMinutes: 3,
      }),
    ).toThrow("too short");
  });

  it("calculates exact and one-apart appearance ranges", () => {
    expect(calculatePlayerAppearanceRange(32, 8)).toEqual({
      minimum: 4,
      maximum: 4,
    });
    expect(calculatePlayerAppearanceRange(32, 9)).toEqual({
      minimum: 3,
      maximum: 4,
    });
  });
});

describe("schedule generation", () => {
  it("is deterministic for a seed", () => {
    const input = { players: players(9), courtCounts: [2, 2, 1, 2], seed: 42 };
    expect(generateSchedule(input)).toEqual(generateSchedule(input));
    expect(generateSchedule({ ...input, seed: 43 })).not.toEqual(
      generateSchedule(input),
    );
  });

  it("distributes appearances equally when possible", () => {
    const roster = players(8);
    const schedule = generateSchedule({
      players: roster,
      courtCounts: [2, 2, 2, 2],
      seed: 7,
    });
    const diagnostics = diagnoseSchedule(schedule, roster);
    expect(new Set(Object.values(diagnostics.appearanceCounts))).toEqual(
      new Set([4]),
    );
    expect(diagnostics.appearanceSpread).toBe(0);
  });

  it("keeps unavoidable differences to one", () => {
    const roster = players(9);
    const schedule = generateSchedule({
      players: roster,
      courtCounts: [2, 2, 2, 2, 2],
      seed: 11,
    });
    expect(
      diagnoseSchedule(schedule, roster).appearanceSpread,
    ).toBeLessThanOrEqual(1);
  });

  it("supports unequal court availability", () => {
    const roster = players(13);
    const schedule = generateSchedule({
      players: roster,
      courtCounts: [3, 1, 2, 3],
      seed: 3,
    });
    expect(schedule.rounds.map((round) => round.matches.length)).toEqual([
      3, 1, 2, 3,
    ]);
    expect(diagnoseSchedule(schedule, roster).isConsistent).toBe(true);
  });

  it("assigns matches to explicit court numbers for uneven court minutes", () => {
    const roster = players(8);
    const schedule = generateSchedule({
      players: roster,
      courtCounts: [2, 1, 1],
      courtNumbersByRound: [[1, 2], [2], [2]],
      seed: 31,
    });
    expect(schedule.rounds.map((round) => round.matches.length)).toEqual([
      2, 1, 1,
    ]);
    expect(
      schedule.rounds.map((round) =>
        round.matches.map((match) => match.courtNumber),
      ),
    ).toEqual([[1, 2], [2], [2]]);
  });

  it("limits consecutive rests when rotation can avoid them", () => {
    const roster = players(5);
    const schedule = generateSchedule({
      players: roster,
      courtCounts: [1, 1, 1, 1, 1],
      seed: 99,
    });
    expect(diagnoseSchedule(schedule, roster).maxConsecutiveRests).toBe(1);
  });

  it("avoids repeated partners while combinations remain", () => {
    const roster = players(8);
    const schedule = generateSchedule({
      players: roster,
      courtCounts: [2, 2, 2],
      seed: 19,
    });
    expect(diagnoseSchedule(schedule, roster).repeatedPartnerPairs).toBe(0);
  });

  it("balances team totals using captured displayed event levels", () => {
    const roster = [
      { id: "a", name: "A", rating: 6.5 },
      { id: "b", name: "B", rating: 5.5 },
      { id: "c", name: "C", rating: 2 },
      { id: "d", name: "D", rating: 1 },
    ];
    const [match] = generateSchedule({
      players: roster,
      courtCounts: [1],
      seed: 5,
      strategy: "rating_balanced",
    }).rounds[0].matches;
    const rating = new Map(roster.map((player) => [player.id, player.rating]));
    const teamRating = (team: [string, string]) =>
      team.reduce((total, id) => total + (rating.get(id) ?? 0), 0);
    expect(
      Math.abs(teamRating(match.teamOne) - teamRating(match.teamTwo)),
    ).toBe(0);
  });

  it("keeps random variety independent from player ratings", () => {
    const roster = players(9);
    const input = {
      players: roster,
      courtCounts: [2, 2, 1, 2, 2],
      seed: 73,
      strategy: "random" as const,
    };
    const changedRatings = roster.map((player, index) => ({
      ...player,
      rating: 10 - (index % 10),
    }));

    expect(generateSchedule(input)).toEqual(
      generateSchedule({ ...input, players: changedRatings }),
    );
  });

  it("applies shared appearance, rest, and variety priorities in both strategies", () => {
    const roster = players(8);
    for (const strategy of ["random", "rating_balanced"] as const) {
      const diagnostics = diagnoseSchedule(
        generateSchedule({
          players: roster,
          courtCounts: [1, 2, 1, 2],
          seed: 29,
          strategy,
        }),
        roster,
      );
      expect(diagnostics.appearanceSpread).toBeLessThanOrEqual(1);
      expect(diagnostics.maxConsecutiveRests).toBeLessThanOrEqual(1);
      expect(diagnostics.isConsistent).toBe(true);
    }
  });
});
