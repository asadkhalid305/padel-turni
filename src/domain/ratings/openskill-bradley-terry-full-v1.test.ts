import { describe, expect, expectTypeOf, it } from "vitest";

import {
  type MatchOutcome,
  type RateTwoVsTwoInput,
  RATING_ENGINE_CONFIGURATION,
  RATING_ENGINE_ID,
  type RatingTeams,
  rateTwoVsTwo,
  serializeRatingEngineConfiguration,
} from "./openskill-bradley-terry-full-v1";

const DEFAULT_SIGMA = 25 / 3;
const GOLDEN_TOLERANCE_DIGITS = 12;

const equalTeams: RatingTeams = [
  [
    { mu: 25, sigma: DEFAULT_SIGMA },
    { mu: 25, sigma: DEFAULT_SIGMA },
  ],
  [
    { mu: 25, sigma: DEFAULT_SIGMA },
    { mu: 25, sigma: DEFAULT_SIGMA },
  ],
];

type GoldenCase = Readonly<{
  name: string;
  teams: RatingTeams;
  outcome: MatchOutcome;
  expected: RatingTeams;
}>;

const goldenCases: readonly GoldenCase[] = [
  {
    name: "equal win",
    teams: equalTeams,
    outcome: "teamOneWin",
    expected: [
      [
        { mu: 26.964294621803063, sigma: 8.177962604389991 },
        { mu: 26.964294621803063, sigma: 8.177962604389991 },
      ],
      [
        { mu: 23.035705378196937, sigma: 8.177962604389991 },
        { mu: 23.035705378196937, sigma: 8.177962604389991 },
      ],
    ],
  },
  {
    name: "equal loss",
    teams: equalTeams,
    outcome: "teamTwoWin",
    expected: [
      [
        { mu: 23.035705378196937, sigma: 8.177962604389991 },
        { mu: 23.035705378196937, sigma: 8.177962604389991 },
      ],
      [
        { mu: 26.964294621803063, sigma: 8.177962604389991 },
        { mu: 26.964294621803063, sigma: 8.177962604389991 },
      ],
    ],
  },
  {
    name: "equal draw",
    teams: equalTeams,
    outcome: "draw",
    expected: [
      [
        { mu: 25, sigma: 8.177962604389991 },
        { mu: 25, sigma: 8.177962604389991 },
      ],
      [
        { mu: 25, sigma: 8.177962604389991 },
        { mu: 25, sigma: 8.177962604389991 },
      ],
    ],
  },
  {
    name: "expected result",
    teams: [
      [
        { mu: 35, sigma: 4 },
        { mu: 33, sigma: 5 },
      ],
      [
        { mu: 17, sigma: 6 },
        { mu: 15, sigma: 7 },
      ],
    ],
    outcome: "teamOneWin",
    expected: [
      [
        { mu: 35.06973026014965, sigma: 3.995614197374373 },
        { mu: 33.108936514880206, sigma: 4.990431747240041 },
      ],
      [
        { mu: 16.843144729338, sigma: 5.975021823535628 },
        { mu: 14.78651347250497, sigma: 6.959884412077111 },
      ],
    ],
  },
  {
    name: "upset result",
    teams: [
      [
        { mu: 35, sigma: 4 },
        { mu: 33, sigma: 5 },
      ],
      [
        { mu: 17, sigma: 6 },
        { mu: 15, sigma: 7 },
      ],
    ],
    outcome: "teamTwoWin",
    expected: [
      [
        { mu: 33.80722572507926, sigma: 3.995614197374373 },
        { mu: 31.13658127375723, sigma: 4.990431747240041 },
      ],
      [
        { mu: 19.683095277858584, sigma: 5.975021823535628 },
        { mu: 18.65180392976818, sigma: 6.959884412077111 },
      ],
    ],
  },
  {
    name: "mixed uncertainty",
    teams: [
      [
        { mu: 28, sigma: 3 },
        { mu: 22, sigma: 12.5 },
      ],
      [
        { mu: 26, sigma: 5 },
        { mu: 24, sigma: 8 },
      ],
    ],
    outcome: "teamOneWin",
    expected: [
      [
        { mu: 28.264910130718953, sigma: 2.9923027750365674 },
        { mu: 26.595792483660134, sigma: 11.844192089641188 },
      ],
      [
        { mu: 25.264501633986928, sigma: 4.970585663507665 },
        { mu: 22.117442810457515, sigma: 7.876552001045659 },
      ],
    ],
  },
];

const expectTeamsCloseTo = (actual: RatingTeams, expected: RatingTeams) => {
  for (const teamIndex of [0, 1] as const) {
    for (const playerIndex of [0, 1] as const) {
      expect(actual[teamIndex][playerIndex].mu).toBeCloseTo(
        expected[teamIndex][playerIndex].mu,
        GOLDEN_TOLERANCE_DIGITS,
      );
      expect(actual[teamIndex][playerIndex].sigma).toBeCloseTo(
        expected[teamIndex][playerIndex].sigma,
        GOLDEN_TOLERANCE_DIGITS,
      );
    }
  }
};

describe("openskill-bradley-terry-full-v1", () => {
  it("exposes a serializable, fully explicit engine configuration", () => {
    expect(RATING_ENGINE_ID).toBe("openskill-bradley-terry-full-v1");
    expect(JSON.parse(serializeRatingEngineConfiguration())).toEqual({
      engineId: "openskill-bradley-terry-full-v1",
      package: "openskill",
      packageVersion: "5.0.1",
      model: "bradleyTerryFull",
      gamma: "openskill-default",
      mu: 25,
      sigma: 25 / 3,
      beta: 25 / 6,
      tau: 25 / 300,
      epsilon: 0.1,
      z: 3,
      alpha: 1,
      target: 0,
      limitSigma: false,
      balance: false,
      kappa: 0.0001,
    });
    expect(Object.isFrozen(RATING_ENGINE_CONFIGURATION)).toBe(true);
  });

  it.each(goldenCases)(
    "matches the pinned package golden vector for $name",
    ({ teams, outcome, expected }) => {
      expectTeamsCloseTo(rateTwoVsTwo({ teams, outcome }), expected);
    },
  );

  it("is invariant when team order and the winning rank are swapped", () => {
    const teams = goldenCases[5].teams;
    const original = rateTwoVsTwo({ teams, outcome: "teamOneWin" });
    const swapped = rateTwoVsTwo({
      teams: [teams[1], teams[0]],
      outcome: "teamTwoWin",
    });

    expectTeamsCloseTo(swapped, [original[1], original[0]]);
  });

  it("is invariant to player order within each team", () => {
    const teams = goldenCases[5].teams;
    const original = rateTwoVsTwo({ teams, outcome: "teamOneWin" });
    const reordered = rateTwoVsTwo({
      teams: [
        [teams[0][1], teams[0][0]],
        [teams[1][1], teams[1][0]],
      ],
      outcome: "teamOneWin",
    });

    expectTeamsCloseTo(reordered, [
      [original[0][1], original[0][0]],
      [original[1][1], original[1][0]],
    ]);
  });

  it("makes an expected result smaller than an upset for every player", () => {
    const expected = rateTwoVsTwo({
      teams: goldenCases[3].teams,
      outcome: "teamOneWin",
    });
    const upset = rateTwoVsTwo({
      teams: goldenCases[4].teams,
      outcome: "teamTwoWin",
    });

    for (const playerIndex of [0, 1] as const) {
      expect(
        expected[0][playerIndex].mu - goldenCases[3].teams[0][playerIndex].mu,
      ).toBeLessThan(
        goldenCases[4].teams[0][playerIndex].mu - upset[0][playerIndex].mu,
      );
      expect(
        goldenCases[3].teams[1][playerIndex].mu - expected[1][playerIndex].mu,
      ).toBeLessThan(
        upset[1][playerIndex].mu - goldenCases[4].teams[1][playerIndex].mu,
      );
    }
  });

  it("represents narrow and blowout wins with the same margin-free input", () => {
    expectTypeOf<keyof RateTwoVsTwoInput>().toEqualTypeOf<
      "teams" | "outcome"
    >();

    const ratingEvent = { teams: equalTeams, outcome: "teamOneWin" } as const;

    const narrowWin = rateTwoVsTwo(ratingEvent);
    const blowoutWin = rateTwoVsTwo(ratingEvent);

    expect(blowoutWin).toEqual(narrowWin);
  });

  it("does not mutate or round full-precision input ratings", () => {
    const teams: RatingTeams = [
      [
        { mu: 26.923076923076923, sigma: 12.5 },
        { mu: 19.23076923076923, sigma: 4.123456789012345 },
      ],
      [
        { mu: 25.000000000000004, sigma: 8.333333333333334 },
        { mu: 22.22222222222222, sigma: 6.666666666666667 },
      ],
    ];
    const before = structuredClone(teams);

    const result = rateTwoVsTwo({ teams, outcome: "draw" });

    expect(teams).toEqual(before);
    expect(result[0][0].mu).not.toBe(Math.round(result[0][0].mu * 10) / 10);
  });
});
