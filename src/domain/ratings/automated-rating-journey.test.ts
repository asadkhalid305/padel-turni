import { describe, expect, it } from "vitest";

import {
  assertAccountRosterSelection,
  decideAccountRosterEligibility,
  type AccountRosterCandidate,
} from "@/domain/account-roster-eligibility";
import { decideEventEligibility } from "@/domain/event-eligibility";
import {
  planInitialEventRatingApplication,
  type CurrentRatingProfile,
  type RatingApplicationEvent,
  type RatingApplicationMatch,
  type RatingApplicationPlayer,
} from "@/domain/ratings/event-application";
import {
  createEventRatingSnapshot,
  selectEventRatingSnapshots,
  type RatingSnapshotSource,
} from "@/domain/ratings/event-snapshots";
import {
  rateTwoVsTwo,
  RATING_ENGINE_CONFIGURATION,
  type MatchOutcome,
  type RatingTeams,
} from "@/domain/ratings/openskill-bradley-terry-full-v1";
import {
  selectCurrentMemberRating,
  selectHistoricalMemberRating,
} from "@/domain/ratings/member-presentation";
import {
  canEditRatingQuestionnaire,
  getInitialRatingFromQuestionnaire,
  INITIAL_RATING_SIGMA,
  PROVISIONAL_OFFICIAL_APPEARANCES,
  QUESTIONNAIRE_ANSWER_SCORES,
  type CurrentPadelAbilityAnswerId,
  type PadelHistoryAnswerId,
  type RacketSportBackgroundAnswerId,
  type RatingQuestionnaireAnswers,
} from "@/domain/ratings/questionnaire";
import {
  planRatingReplay,
  type RatingBaseline,
  type ReplayEvent,
  type ReplayTrigger,
} from "@/domain/ratings/replay";
import {
  ExpectedRatingWorkerError,
  ratingJobFailureTransition,
  serializeRatingWorkerError,
} from "@/domain/ratings/worker-policy";

const ACCOUNT_IDS = [
  "account-a",
  "account-b",
  "account-c",
  "account-d",
] as const;
const EVENT_PLAYER_IDS = [
  "player-a",
  "player-b",
  "player-c",
  "player-d",
] as const;

const officialEvent = (
  id: string,
  overrides: Partial<RatingApplicationEvent> = {},
): RatingApplicationEvent => ({
  id,
  status: "completed",
  competitionMode: "official",
  ratingEra: "automated",
  included: true,
  ...overrides,
});

const rosterCandidate = (
  playerId: string,
  appUserId: string,
  workspaceId: string,
  overrides: Partial<AccountRosterCandidate> = {},
): AccountRosterCandidate => ({
  playerId,
  appUserId,
  workspaceId,
  accountExists: true,
  membershipState: "accepted",
  playerIsActive: true,
  ratingProfileState: "completed",
  ...overrides,
});

const eventPlayers = (): RatingApplicationPlayer[] =>
  EVENT_PLAYER_IDS.map((eventPlayerId, index) => ({
    eventPlayerId,
    appUserId: ACCOUNT_IDS[index],
  }));

const profiles = (
  values: readonly (readonly [number, number])[] = [
    [25, 12.5],
    [25, 12.5],
    [25, 12.5],
    [25, 12.5],
  ],
  ratedMatchCount = 0,
): CurrentRatingProfile[] =>
  ACCOUNT_IDS.map((appUserId, index) => ({
    appUserId,
    mu: values[index][0],
    sigma: values[index][1],
    ratedMatchCount,
  }));

const completedMatch = (
  id: string,
  outcome: MatchOutcome,
  overrides: Partial<RatingApplicationMatch> = {},
): RatingApplicationMatch => {
  const score =
    outcome === "draw"
      ? ([5, 5] as const)
      : outcome === "teamOneWin"
        ? ([6, 4] as const)
        : ([3, 6] as const);
  return {
    id,
    roundNumber: 1,
    courtNumber: 1,
    status: "completed",
    teamOneScore: score[0],
    teamTwoScore: score[1],
    teamOne: [EVENT_PLAYER_IDS[0], EVENT_PLAYER_IDS[1]],
    teamTwo: [EVENT_PLAYER_IDS[2], EVENT_PLAYER_IDS[3]],
    ...overrides,
  };
};

const applyEvent = (options: {
  event?: RatingApplicationEvent;
  matches?: readonly RatingApplicationMatch[];
  currentProfiles?: readonly CurrentRatingProfile[];
  alreadyApplied?: boolean;
}) =>
  planInitialEventRatingApplication({
    event: options.event ?? officialEvent("event-1"),
    matches: options.matches ?? [completedMatch("match-1", "teamOneWin")],
    players: eventPlayers(),
    profiles: options.currentProfiles ?? profiles(),
    alreadyApplied: options.alreadyApplied ?? false,
  });

const padelAnswers = Object.entries(
  QUESTIONNAIRE_ANSWER_SCORES.padelHistory,
) as [PadelHistoryAnswerId, number][];
const racketAnswers = Object.entries(
  QUESTIONNAIRE_ANSWER_SCORES.racketSportBackground,
) as [RacketSportBackgroundAnswerId, number][];
const abilityAnswers = Object.entries(
  QUESTIONNAIRE_ANSWER_SCORES.currentPadelAbility,
) as [CurrentPadelAbilityAnswerId, number][];

const questionnaireVectors = padelAnswers.flatMap(
  ([padelHistory, padelScore]) =>
    racketAnswers.flatMap(([racketSportBackground, racketScore]) =>
      abilityAnswers.map(([currentPadelAbility, abilityScore]) => ({
        answers: {
          padelHistory,
          racketSportBackground,
          currentPadelAbility,
        } satisfies RatingQuestionnaireAnswers,
        score: padelScore + racketScore + abilityScore,
      })),
    ),
);

const snapshotSource = (
  playerId: string,
  workspace: "club-a" | "club-b",
  overrides: Partial<RatingSnapshotSource["profile"]> = {},
): RatingSnapshotSource => ({
  playerId: `${workspace}-${playerId}`,
  appUserId: playerId,
  name: playerId,
  profile: {
    onboardingStatus: "completed",
    mu: 25,
    sigma: 12.5,
    displayedLevel: 3.8,
    engineVersion: RATING_ENGINE_CONFIGURATION.engineId,
    ...overrides,
  },
});

const baselines: RatingBaseline[] = ACCOUNT_IDS.map((appUserId, index) => ({
  appUserId,
  initialMu: 20 + index * 2,
  initialSigma: 12.5,
}));

const replayEvent = (
  sequence: number,
  outcome: MatchOutcome,
  overrides: Partial<ReplayEvent> = {},
): ReplayEvent => ({
  originalLedgerSequence: sequence,
  event: officialEvent(`event-${sequence}`),
  players: eventPlayers(),
  matches: [completedMatch(`match-${sequence}`, outcome)],
  engineManifest: { ...RATING_ENGINE_CONFIGURATION },
  ...overrides,
});

const replay = (
  events: readonly ReplayEvent[],
  earliestLedgerSequence: number,
  trigger: ReplayTrigger = "correction",
) =>
  planRatingReplay({
    events,
    baselines,
    earliestLedgerSequence,
    affectedEventId: `event-${earliestLedgerSequence}`,
    trigger,
  });

describe("automated rating journey contract", () => {
  describe("1. an invited account establishes one reproducible global baseline", () => {
    it("maps all 60 valid answer combinations to the exact starting vector", () => {
      expect(questionnaireVectors).toHaveLength(5 * 3 * 4);

      for (const { answers, score } of questionnaireVectors) {
        const result = getInitialRatingFromQuestionnaire(answers);
        expect(result.ok).toBe(true);
        if (!result.ok) continue;

        const displayLevel = 1 + score * 0.5;
        expect(result.value).toMatchObject({
          answers,
          onboardingScore: score,
          displayLevel,
          sigma: INITIAL_RATING_SIGMA,
          officialRatedAppearances: 0,
          provisional: true,
          provisionalAppearancesRemaining: PROVISIONAL_OFFICIAL_APPEARANCES,
          questionnaireEditable: true,
        });
        expect(result.value.mu).toBe((displayLevel - 0.5) * (50 / 6.5));
      }
    });

    it("rejects invalid onboarding and locks answers after the first Official appearance", () => {
      expect(
        getInitialRatingFromQuestionnaire({
          padelHistory: "expert",
          racketSportBackground: "none",
        }),
      ).toEqual({
        ok: false,
        issues: [
          { field: "currentPadelAbility", reason: "missing" },
          { field: "padelHistory", reason: "invalid" },
        ],
      });
      expect(canEditRatingQuestionnaire(0)).toBe(true);
      expect(canEditRatingQuestionnaire(1)).toBe(false);
    });
  });

  describe("2. club membership selects the global account and freezes event history", () => {
    it("accepts joined active members and blocks direct roster bypass attempts", () => {
      const candidates = ACCOUNT_IDS.map((accountId, index) =>
        rosterCandidate(EVENT_PLAYER_IDS[index], accountId, "club-a"),
      );
      expect(
        candidates.every(
          (candidate) => decideAccountRosterEligibility(candidate).eligible,
        ),
      ).toBe(true);
      expect(() =>
        assertAccountRosterSelection({
          workspaceId: "club-a",
          selectedPlayerIds: EVENT_PLAYER_IDS,
          candidates,
        }),
      ).not.toThrow();

      const bypasses = [
        rosterCandidate("legacy", "", "club-a", { appUserId: null }),
        rosterCandidate("invited", "account-invited", "club-a", {
          membershipState: "invited",
        }),
        rosterCandidate("incomplete", "account-incomplete", "club-a", {
          ratingProfileState: "in_progress",
        }),
        rosterCandidate("other-club", "account-other", "club-b"),
      ];
      for (const bypass of bypasses) {
        expect(() =>
          assertAccountRosterSelection({
            workspaceId: "club-a",
            selectedPlayerIds: [bypass.playerId],
            candidates: [bypass],
          }),
        ).toThrow("active club member");
      }
      expect(() =>
        assertAccountRosterSelection({
          workspaceId: "club-a",
          selectedPlayerIds: [EVENT_PLAYER_IDS[0], EVENT_PLAYER_IDS[0]],
          candidates,
        }),
      ).toThrow("only once");
    });

    it("carries one account rating across clubs without mutating an old event snapshot", () => {
      const clubA = createEventRatingSnapshot(
        snapshotSource("account-a", "club-a"),
        "snapshot-a",
        0,
      );
      const clubB = createEventRatingSnapshot(
        snapshotSource("account-a", "club-b"),
        "snapshot-b",
        0,
      );
      expect(clubA.appUserId).toBe(clubB.appUserId);
      expect([clubA.mu, clubA.sigma, clubA.displayedLevel]).toEqual([
        clubB.mu,
        clubB.sigma,
        clubB.displayedLevel,
      ]);

      const [historical] = selectEventRatingSnapshots({
        playerIds: [clubA.playerId],
        existingSnapshots: [clubA],
        currentSources: [
          snapshotSource("account-a", "club-a", {
            mu: 31,
            sigma: 7,
            displayedLevel: 4.5,
          }),
        ],
        createId: () => "must-not-replace-history",
      });
      expect(historical).toEqual(clubA);
    });
  });

  describe("3. completed Official results update ratings from outcomes only", () => {
    const strongVersusDeveloping: RatingTeams = [
      [
        { mu: 35, sigma: 4 },
        { mu: 33, sigma: 5 },
      ],
      [
        { mu: 17, sigma: 6 },
        { mu: 15, sigma: 7 },
      ],
    ];

    it("documents expected wins, upsets, losses, draws, and mixed certainty", () => {
      const expectedWin = rateTwoVsTwo({
        teams: strongVersusDeveloping,
        outcome: "teamOneWin",
      });
      const upset = rateTwoVsTwo({
        teams: strongVersusDeveloping,
        outcome: "teamTwoWin",
      });
      const draw = rateTwoVsTwo({
        teams: strongVersusDeveloping,
        outcome: "draw",
      });

      // These approved package vectors make a dependency/default drift visible.
      expect(expectedWin[0][0].mu).toBeCloseTo(35.06973026014965, 12);
      expect(expectedWin[0][1].mu).toBeCloseTo(33.108936514880206, 12);
      expect(expectedWin[1][0].mu).toBeCloseTo(16.843144729338, 12);
      expect(expectedWin[1][1].mu).toBeCloseTo(14.78651347250497, 12);
      expect(upset[0][0].mu).toBeCloseTo(33.80722572507926, 12);
      expect(upset[0][1].mu).toBeCloseTo(31.13658127375723, 12);
      expect(upset[1][0].mu).toBeCloseTo(19.683095277858584, 12);
      expect(upset[1][1].mu).toBeCloseTo(18.65180392976818, 12);
      for (const result of [expectedWin, upset, draw]) {
        expect(result[0][0].sigma).toBeCloseTo(3.995614197374373, 12);
        expect(result[0][1].sigma).toBeCloseTo(4.990431747240041, 12);
        expect(result[1][0].sigma).toBeCloseTo(5.975021823535628, 12);
        expect(result[1][1].sigma).toBeCloseTo(6.959884412077111, 12);
      }

      expect(expectedWin[0][0].mu).toBeGreaterThan(
        strongVersusDeveloping[0][0].mu,
      );
      expect(expectedWin[1][0].mu).toBeLessThan(
        strongVersusDeveloping[1][0].mu,
      );
      expect(upset[1][0].mu - strongVersusDeveloping[1][0].mu).toBeGreaterThan(
        expectedWin[0][0].mu - strongVersusDeveloping[0][0].mu,
      );
      expect(draw[0][0].mu).toBeLessThan(strongVersusDeveloping[0][0].mu);
      expect(draw[1][0].mu).toBeGreaterThan(strongVersusDeveloping[1][0].mu);
      expect(expectedWin[0][0].sigma).toBeLessThan(
        strongVersusDeveloping[0][0].sigma,
      );
      expect(expectedWin[1][1].sigma).toBeLessThan(
        strongVersusDeveloping[1][1].sigma,
      );
    });

    it("supports changed partners and repeated appearances in canonical match order", () => {
      const result = applyEvent({
        matches: [
          completedMatch("match-3", "draw", {
            roundNumber: 3,
            teamOne: [EVENT_PLAYER_IDS[0], EVENT_PLAYER_IDS[3]],
            teamTwo: [EVENT_PLAYER_IDS[1], EVENT_PLAYER_IDS[2]],
          }),
          completedMatch("match-1", "teamOneWin", { roundNumber: 1 }),
          completedMatch("match-2", "teamTwoWin", {
            roundNumber: 2,
            teamOne: [EVENT_PLAYER_IDS[0], EVENT_PLAYER_IDS[2]],
            teamTwo: [EVENT_PLAYER_IDS[1], EVENT_PLAYER_IDS[3]],
          }),
        ],
      });
      expect(result.status).toBe("eligible");
      if (result.status !== "eligible") return;
      expect(result.canonicalInput.matches.map(({ id }) => id)).toEqual([
        "match-1",
        "match-2",
        "match-3",
      ]);
      expect(
        result.canonicalOutput.profiles.every(
          ({ ratedMatchCount }) => ratedMatchCount === 3,
        ),
      ).toBe(true);
    });

    it("makes a narrow win and a blowout identical and graduates match six", () => {
      const narrow = applyEvent({
        matches: [
          completedMatch("narrow", "teamOneWin", {
            teamOneScore: 7,
            teamTwoScore: 6,
          }),
        ],
        currentProfiles: profiles(undefined, 5),
      });
      const blowout = applyEvent({
        matches: [
          completedMatch("narrow", "teamOneWin", {
            teamOneScore: 11,
            teamTwoScore: 0,
          }),
        ],
        currentProfiles: profiles(undefined, 5),
      });
      expect(narrow.status).toBe("eligible");
      expect(blowout.status).toBe("eligible");
      if (narrow.status !== "eligible" || blowout.status !== "eligible") return;
      expect(narrow.canonicalOutput).toEqual(blowout.canonicalOutput);
      expect(
        narrow.canonicalOutput.profiles.every(
          (profile) => profile.ratedMatchCount === 6 && !profile.isProvisional,
        ),
      ).toBe(true);

      const graduated = narrow.canonicalOutput.profiles[0];
      expect(
        selectCurrentMemberRating({
          profile: {
            onboardingStatus: "completed",
            mu: graduated.mu,
            ratedMatchCount: graduated.ratedMatchCount,
          },
          jobStatus: "applied",
        }),
      ).toMatchObject({ state: "current", provisional: null });
    });

    it("shows immutable Official and Practice snapshots without changing their eligibility", () => {
      expect(
        selectHistoricalMemberRating({
          competitionMode: "official",
          ratingEra: "automated",
          displayedLevelSnapshot: 3.8,
        }),
      ).toEqual({ state: "snapshot", level: "3.8", eventMode: "official" });
      expect(
        selectHistoricalMemberRating({
          competitionMode: "practice",
          ratingEra: "automated",
          displayedLevelSnapshot: 3.8,
        }),
      ).toEqual({ state: "snapshot", level: "3.8", eventMode: "practice" });
    });
  });

  describe("4. standings and ratings share the same event eligibility", () => {
    it.each([
      ["Official", officialEvent("official"), "eligible", true],
      [
        "Practice",
        officialEvent("practice", { competitionMode: "practice" }),
        "practice",
        false,
      ],
      [
        "cancelled",
        officialEvent("cancelled", { status: "cancelled" }),
        "cancelled",
        false,
      ],
      [
        "incomplete",
        officialEvent("live", { status: "live" }),
        "not_completed",
        false,
      ],
      [
        "excluded",
        officialEvent("excluded", { included: false }),
        "excluded",
        false,
      ],
      [
        "legacy",
        officialEvent("legacy", {
          competitionMode: "legacy",
          ratingEra: "legacy",
        }),
        "legacy",
        true,
      ],
    ] as const)(
      "keeps %s policy aligned",
      (_label, event, reason, standingsEligible) => {
        const decision = decideEventEligibility(event);
        const application = applyEvent({ event });
        expect(decision.countsTowardStandings).toBe(standingsEligible);
        expect(
          application.status === "eligible" ? "eligible" : application.reason,
        ).toBe(reason);
        expect(decision.eligibleForAutomatedRatings).toBe(
          application.status === "eligible",
        );
      },
    );

    it("makes duplicate processing a no-op before reading invalid event facts", () => {
      expect(
        planInitialEventRatingApplication({
          event: officialEvent("duplicate"),
          alreadyApplied: true,
          matches: [
            completedMatch("invalid", "teamOneWin", { teamOneScore: null }),
          ],
          players: [],
          profiles: [],
        }),
      ).toMatchObject({ status: "skipped", reason: "already_applied" });
    });
  });

  describe("5. audited changes rebuild deterministic history", () => {
    const history = [
      replayEvent(1, "teamOneWin"),
      replayEvent(2, "draw"),
      replayEvent(3, "teamTwoWin"),
    ];

    it("makes incremental correction replay equal a fresh full replay", () => {
      const corrected = history.map((event) =>
        event.originalLedgerSequence === 2
          ? replayEvent(2, "teamTwoWin")
          : event,
      );
      const incremental = replay(corrected, 2);
      const full = replay(corrected, 1);
      expect(incremental.finalProfiles).toEqual(full.finalProfiles);
      expect(incremental.entries).toEqual(full.entries.slice(1));
    });

    it("excludes and reinstates together; archive visibility is deliberately absent from replay input", () => {
      const full = replay(history, 1);
      const excluded = replay(
        history.map((event) =>
          event.originalLedgerSequence === 1
            ? { ...event, event: { ...event.event, included: false } }
            : event,
        ),
        1,
        "exclusion",
      );
      const reinstated = replay(history, 1, "reinstatement");
      const archiveCopy = replay(structuredClone(history), 1);

      expect(excluded.entries[0]).toMatchObject({
        entryKind: "exclusion",
        plan: { status: "skipped", reason: "excluded" },
      });
      expect(reinstated.finalProfiles).toEqual(full.finalProfiles);
      expect(archiveCopy).toEqual(full);
      expect(
        decideEventEligibility(history[0].event).countsTowardStandings,
      ).toBe(true);
      expect(
        decideEventEligibility({ ...history[0].event, included: false })
          .countsTowardStandings,
      ).toBe(false);
    });

    it("fails closed on corrupt replay facts without mutating the baseline input", () => {
      const immutableBaselines = structuredClone(baselines);
      const unsupported = replayEvent(1, "teamOneWin", {
        engineManifest: { ...RATING_ENGINE_CONFIGURATION, epsilon: 0.2 },
      });
      expect(() => replay([unsupported], 1)).toThrow(
        "unsupported recorded rating engine manifest",
      );
      expect(baselines).toEqual(immutableBaselines);
    });
  });

  describe("6. failures preserve scores and expose bounded recovery", () => {
    it("redacts unexpected outage details and retries with a terminal limit", () => {
      expect(
        serializeRatingWorkerError(
          new Error("postgres://secret@host/player-name"),
        ),
      ).toEqual({
        code: "rating_processing_failed",
        message:
          "Rating processing failed. Retry the job or inspect server logs.",
      });
      expect(
        ratingJobFailureTransition({ attemptCount: 1, maxAttempts: 3 }),
      ).toEqual({
        status: "retryable",
        retryAfterSeconds: 60,
      });
      expect(
        ratingJobFailureTransition({ attemptCount: 3, maxAttempts: 3 }),
      ).toEqual({
        status: "failed",
        retryAfterSeconds: null,
      });
    });

    it("persists only deliberately safe operational failure copy", () => {
      expect(
        serializeRatingWorkerError(
          new ExpectedRatingWorkerError(
            "rating_profile_missing",
            "A required rating profile is missing.",
          ),
        ),
      ).toEqual({
        code: "rating_profile_missing",
        message: "A required rating profile is missing.",
      });
    });
  });
});
