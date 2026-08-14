import { describe, expect, it } from "vitest";

import {
  planRatingReplay,
  type RatingBaseline,
  type ReplayEvent,
  type ReplayTrigger,
} from "@/domain/ratings/replay";
import { RATING_ENGINE_CONFIGURATION } from "@/domain/ratings/openskill-bradley-terry-full-v1";

const accounts = ["a", "b", "c", "d"] as const;
const players = ["pa", "pb", "pc", "pd"] as const;
const baselines: RatingBaseline[] = accounts.map((appUserId, index) => ({
  appUserId,
  initialMu: 20 + index,
  initialSigma: 12.5,
}));

function replayEvent(
  sequence: number,
  outcome: "teamOneWin" | "draw" | "teamTwoWin",
  overrides: Partial<ReplayEvent> = {},
): ReplayEvent {
  const score =
    outcome === "draw" ? [5, 5] : outcome === "teamOneWin" ? [6, 3] : [2, 6];
  return {
    originalLedgerSequence: sequence,
    event: {
      id: `event-${sequence}`,
      status: "completed",
      competitionMode: "official",
      ratingEra: "automated",
      included: true,
    },
    players: players.map((eventPlayerId, index) => ({
      eventPlayerId,
      appUserId: accounts[index],
    })),
    matches: [
      {
        id: `match-${sequence}`,
        roundNumber: 1,
        courtNumber: 1,
        status: "completed",
        teamOneScore: score[0],
        teamTwoScore: score[1],
        teamOne: [players[0], players[1]],
        teamTwo: [players[2], players[3]],
      },
    ],
    engineManifest: { ...RATING_ENGINE_CONFIGURATION },
    ...overrides,
  };
}

function plan(
  events: readonly ReplayEvent[],
  sequence: number,
  trigger: ReplayTrigger = "correction",
) {
  return planRatingReplay({
    earliestLedgerSequence: sequence,
    affectedEventId: `event-${sequence}`,
    trigger,
    baselines,
    events,
  });
}

describe("deterministic rating replay", () => {
  it.each([1, 2, 3])(
    "replays an early, middle, or latest correction from sequence %s",
    (sequence) => {
      const result = plan(
        [
          replayEvent(1, "teamOneWin"),
          replayEvent(2, "draw"),
          replayEvent(3, "teamTwoWin"),
        ],
        sequence,
      );
      expect(
        result.entries.map((entry) => entry.originalLedgerSequence),
      ).toEqual([1, 2, 3].filter((candidate) => candidate >= sequence));
    },
  );

  it.each([
    ["draw to win", "draw", "teamOneWin"],
    ["winner reversal", "teamOneWin", "teamTwoWin"],
  ] as const)(
    "rebuilds a %s from canonical corrected scores",
    (_label, before, after) => {
      const original = plan(
        [replayEvent(1, before), replayEvent(2, "draw")],
        1,
      );
      const corrected = plan(
        [replayEvent(1, after), replayEvent(2, "draw")],
        1,
      );
      expect(corrected.finalProfiles).not.toEqual(original.finalProfiles);
    },
  );

  it("makes exclusion and reinstatement exact inverses through fresh replay", () => {
    const events = [replayEvent(1, "teamOneWin"), replayEvent(2, "teamTwoWin")];
    const full = plan(events, 1);
    const excluded = plan(
      events.map((event) =>
        event.originalLedgerSequence === 1
          ? { ...event, event: { ...event.event, included: false } }
          : event,
      ),
      1,
      "exclusion",
    );
    const reinstated = plan(events, 1, "reinstatement");
    expect(excluded.entries[0]).toMatchObject({
      entryKind: "exclusion",
      plan: { status: "skipped", reason: "excluded" },
    });
    expect(reinstated.finalProfiles).toEqual(full.finalProfiles);
  });

  it("is archive invariant because archive visibility is absent from replay input", () => {
    const events = [replayEvent(1, "teamOneWin"), replayEvent(2, "draw")];
    expect(plan(structuredClone(events), 1)).toEqual(plan(events, 1));
  });

  it("produces partial replay equality with a fresh full replay", () => {
    const corrected = [
      replayEvent(1, "teamOneWin"),
      replayEvent(2, "teamTwoWin"),
      replayEvent(3, "draw"),
    ];
    const partial = plan(corrected, 2);
    const full = plan(corrected, 1);
    expect(partial.finalProfiles).toEqual(full.finalProfiles);
    expect(partial.entries).toEqual(full.entries.slice(1));
  });

  it("is idempotent for identical canonical facts", () => {
    const events = [replayEvent(1, "teamOneWin"), replayEvent(2, "draw")];
    expect(plan(events, 1)).toEqual(plan(events, 1));
  });

  it("uses the recorded manifest and refuses package-default drift", () => {
    const drifted = replayEvent(1, "teamOneWin", {
      engineManifest: { ...RATING_ENGINE_CONFIGURATION, epsilon: 0.2 },
    });
    expect(() => plan([drifted], 1)).toThrow(
      "unsupported recorded rating engine manifest",
    );
  });

  it.each([
    [
      "duplicate sequence",
      [replayEvent(1, "draw"), replayEvent(1, "teamOneWin")],
    ],
    [
      "duplicate event",
      [
        replayEvent(1, "draw"),
        replayEvent(2, "teamOneWin", {
          event: { ...replayEvent(1, "draw").event },
        }),
      ],
    ],
  ] as const)(
    "rejects %s instead of calculating ambiguous order",
    (_label, events) => {
      expect(() => plan(events, 1)).toThrow();
    },
  );
});
