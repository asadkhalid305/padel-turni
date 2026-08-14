import { describe, expect, it } from "vitest";

import {
  planInitialEventRatingApplication,
  type CurrentRatingProfile,
  type RatingApplicationEvent,
  type RatingApplicationMatch,
} from "@/domain/ratings/event-application";

const accountIds = [
  "account-a",
  "account-b",
  "account-c",
  "account-d",
] as const;
const eventPlayerIds = [
  "player-a",
  "player-b",
  "player-c",
  "player-d",
] as const;

const officialEvent: RatingApplicationEvent = {
  id: "event-1",
  status: "completed",
  competitionMode: "official",
  ratingEra: "automated",
  included: true,
};

const profiles = (ratedMatchCount = 0): CurrentRatingProfile[] =>
  accountIds.map((appUserId, index) => ({
    appUserId,
    mu: 20 + index * 2,
    sigma: 12.5,
    ratedMatchCount,
  }));

const players = eventPlayerIds.map((eventPlayerId, index) => ({
  eventPlayerId,
  appUserId: accountIds[index],
}));

const match = (
  overrides: Partial<RatingApplicationMatch> = {},
): RatingApplicationMatch => ({
  id: "match-1",
  roundNumber: 1,
  courtNumber: 1,
  status: "completed",
  teamOneScore: 6,
  teamTwoScore: 4,
  teamOne: [eventPlayerIds[0], eventPlayerIds[1]],
  teamTwo: [eventPlayerIds[2], eventPlayerIds[3]],
  ...overrides,
});

describe("initial event rating application", () => {
  it.each([
    ["practice", { competitionMode: "practice" }, "practice"],
    ["cancelled", { status: "cancelled" }, "cancelled"],
    ["excluded", { included: false }, "excluded"],
    [
      "legacy mode",
      { competitionMode: "legacy", ratingEra: "legacy" },
      "legacy",
    ],
    ["not completed", { status: "live" }, "not_completed"],
  ] as const)(
    "skips %s events for the documented reason",
    (_label, eventPatch, reason) => {
      const result = planInitialEventRatingApplication({
        event: { ...officialEvent, ...eventPatch },
        alreadyApplied: false,
        matches: [match()],
        players,
        profiles: profiles(),
      });

      expect(result).toMatchObject({ status: "skipped", reason });
    },
  );

  it("skips duplicate delivery before doing any calculations", () => {
    expect(
      planInitialEventRatingApplication({
        event: officialEvent,
        alreadyApplied: true,
        matches: [match({ teamOneScore: null })],
        players: [],
        profiles: [],
      }),
    ).toMatchObject({ status: "skipped", reason: "already_applied" });
  });

  it("skips a completed Official event without a completed appearance", () => {
    expect(
      planInitialEventRatingApplication({
        event: officialEvent,
        alreadyApplied: false,
        matches: [
          match({
            status: "cancelled",
            teamOneScore: null,
            teamTwoScore: null,
          }),
        ],
        players,
        profiles: profiles(),
      }),
    ).toMatchObject({ status: "skipped", reason: "no_completed_matches" });
  });

  it("orders matches by round, court, then stable match ID and feeds updated profiles forward", () => {
    const result = planInitialEventRatingApplication({
      event: officialEvent,
      alreadyApplied: false,
      matches: [
        match({
          id: "match-z",
          roundNumber: 2,
          teamOneScore: 2,
          teamTwoScore: 6,
        }),
        match({
          id: "match-b",
          roundNumber: 1,
          courtNumber: 2,
          teamOneScore: 3,
          teamTwoScore: 3,
        }),
        match({ id: "match-a", roundNumber: 1, courtNumber: 1 }),
      ],
      players,
      profiles: profiles(),
    });

    expect(result.status).toBe("eligible");
    if (result.status !== "eligible") return;
    expect(result.canonicalInput.matches.map(({ id }) => id)).toEqual([
      "match-a",
      "match-b",
      "match-z",
    ]);
    expect(result.canonicalInput.matches.map(({ outcome }) => outcome)).toEqual(
      ["teamOneWin", "draw", "teamTwoWin"],
    );
    expect(result.canonicalOutput.matches[1].players[0].before).toEqual(
      result.canonicalOutput.matches[0].players[0].after,
    );
    expect(result.canonicalOutput.profiles).toHaveLength(4);
    expect(
      result.canonicalOutput.profiles.every(
        (profile) => profile.ratedMatchCount === 3,
      ),
    ).toBe(true);
  });

  it("uses only outcome, so a narrow win and blowout produce identical outputs", () => {
    const narrow = planInitialEventRatingApplication({
      event: officialEvent,
      alreadyApplied: false,
      matches: [match({ teamOneScore: 7, teamTwoScore: 6 })],
      players,
      profiles: profiles(),
    });
    const blowout = planInitialEventRatingApplication({
      event: officialEvent,
      alreadyApplied: false,
      matches: [match({ teamOneScore: 11, teamTwoScore: 0 })],
      players,
      profiles: profiles(),
    });

    expect(narrow.status).toBe("eligible");
    expect(blowout.status).toBe("eligible");
    if (narrow.status !== "eligible" || blowout.status !== "eligible") return;
    expect(narrow.canonicalOutput).toEqual(blowout.canonicalOutput);
  });

  it("increments every completed appearance and ends provisional status after match six", () => {
    const result = planInitialEventRatingApplication({
      event: officialEvent,
      alreadyApplied: false,
      matches: [match()],
      players,
      profiles: profiles(5),
    });

    expect(result.status).toBe("eligible");
    if (result.status !== "eligible") return;
    expect(result.canonicalOutput.profiles).toEqual(
      expect.arrayContaining(
        accountIds.map((appUserId) =>
          expect.objectContaining({
            appUserId,
            ratedMatchCount: 6,
            isProvisional: false,
            firstOfficialRatedAppearance: false,
          }),
        ),
      ),
    );
  });

  it("marks only a player's actual first Official appearance", () => {
    const result = planInitialEventRatingApplication({
      event: officialEvent,
      alreadyApplied: false,
      matches: [match()],
      players,
      profiles: profiles(),
    });
    expect(result.status).toBe("eligible");
    if (result.status !== "eligible") return;
    expect(
      result.canonicalOutput.profiles.every(
        (profile) => profile.firstOfficialRatedAppearance,
      ),
    ).toBe(true);
  });

  it.each([
    [
      "missing final score",
      [match({ teamOneScore: null })],
      players,
      profiles(),
    ],
    [
      "duplicate match player",
      [match({ teamTwo: [eventPlayerIds[0], eventPlayerIds[3]] })],
      players,
      profiles(),
    ],
    ["missing account snapshot", [match()], players.slice(0, 3), profiles()],
    ["missing current profile", [match()], players, profiles().slice(0, 3)],
  ] as const)(
    "rejects %s without returning a partial application",
    (_label, matches, playerRows, profileRows) => {
      expect(() =>
        planInitialEventRatingApplication({
          event: officialEvent,
          alreadyApplied: false,
          matches,
          players: playerRows,
          profiles: profileRows,
        }),
      ).toThrow();
    },
  );

  it("naturally narrows uncertainty over representative win, loss, and draw appearances", () => {
    const repeatedMatches = Array.from({ length: 6 }, (_, index) =>
      match({
        id: `match-${index}`,
        roundNumber: index + 1,
        teamOneScore: index % 3 === 0 ? 6 : index % 3 === 1 ? 2 : 5,
        teamTwoScore: index % 3 === 0 ? 2 : index % 3 === 1 ? 6 : 5,
      }),
    );
    const result = planInitialEventRatingApplication({
      event: officialEvent,
      alreadyApplied: false,
      matches: repeatedMatches,
      players,
      profiles: profiles(),
    });

    expect(result.status).toBe("eligible");
    if (result.status !== "eligible") return;
    expect(
      result.canonicalOutput.profiles.every((profile) => profile.sigma < 12.5),
    ).toBe(true);
    expect(
      result.canonicalOutput.profiles.every(
        (profile) => !profile.isProvisional,
      ),
    ).toBe(true);
  });
});
