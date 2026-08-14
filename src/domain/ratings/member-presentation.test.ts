import { describe, expect, it } from "vitest";

import {
  selectCurrentMemberRating,
  selectHistoricalMemberRating,
  selectMemberRating,
  selectMemberRatingUpdate,
} from "@/domain/ratings/member-presentation";

describe("member rating presentation", () => {
  it.each([
    [0, "0.5"],
    [25, "3.8"],
    [50, "7.0"],
    [-50, "0.5"],
    [100, "7.0"],
  ])("renders mu %s on the public one-decimal scale", (mu, level) => {
    expect(
      selectCurrentMemberRating({
        profile: { onboardingStatus: "completed", mu, ratedMatchCount: 6 },
      }),
    ).toEqual({ state: "current", level, provisional: null });
  });

  it.each([0, 1, 2, 3, 4, 5, 6])(
    "maps provisional progress for %s rated appearances",
    (ratedMatchCount) => {
      const result = selectCurrentMemberRating({
        profile: { onboardingStatus: "completed", mu: 25, ratedMatchCount },
      });
      expect(result).toEqual({
        state: "current",
        level: "3.8",
        provisional:
          ratedMatchCount < 6
            ? { completed: ratedMatchCount, target: 6 }
            : null,
      });
    },
  );

  it.each(["pending", "processing", "retryable", "failed"] as const)(
    "keeps %s work neutral and hides failure detail",
    (jobStatus) => {
      expect(
        selectCurrentMemberRating({
          profile: {
            onboardingStatus: "completed",
            mu: 25,
            ratedMatchCount: 2,
          },
          jobStatus,
        }),
      ).toEqual({ state: "updating", level: "3.8" });
    },
  );

  it.each(["pending", "processing", "retryable", "failed"] as const)(
    "maps an event-level %s job to the same member-safe updating state",
    (status) => {
      expect(selectMemberRatingUpdate(status)).toEqual({
        state: "updating",
        level: null,
      });
    },
  );

  it.each([null, "applied", "skipped"] as const)(
    "does not show an updating state for %s",
    (status) => {
      expect(selectMemberRatingUpdate(status)).toBeNull();
    },
  );

  it.each(["applied", "skipped"] as const)(
    "shows the current value after a %s job",
    (jobStatus) => {
      expect(
        selectCurrentMemberRating({
          profile: {
            onboardingStatus: "completed",
            mu: 25,
            ratedMatchCount: 6,
          },
          jobStatus,
        }),
      ).toMatchObject({ state: "current", level: "3.8" });
    },
  );

  it.each([
    null,
    { onboardingStatus: "not_started" as const, mu: null, ratedMatchCount: 0 },
    { onboardingStatus: "in_progress" as const, mu: null, ratedMatchCount: 0 },
    { onboardingStatus: "completed" as const, mu: null, ratedMatchCount: 0 },
  ])("does not invent a rating for a missing profile", (profile) => {
    expect(selectCurrentMemberRating({ profile })).toEqual({
      state: "no_profile",
    });
  });

  it("uses event-start snapshots instead of a later current level", () => {
    expect(
      selectMemberRating({
        context: "historical",
        competitionMode: "official",
        ratingEra: "automated",
        displayedLevelSnapshot: 2.45,
      }),
    ).toEqual({
      state: "snapshot",
      level: "2.5",
      eventMode: "official",
    });
  });

  it("keeps Practice snapshots while identifying the event mode", () => {
    expect(
      selectHistoricalMemberRating({
        competitionMode: "practice",
        ratingEra: "automated",
        displayedLevelSnapshot: 4.2,
      }),
    ).toEqual({ state: "snapshot", level: "4.2", eventMode: "practice" });
  });

  it("labels legacy history honestly and never falls back to its manual rating", () => {
    expect(
      selectHistoricalMemberRating({
        competitionMode: "legacy",
        ratingEra: "legacy",
        displayedLevelSnapshot: null,
      }),
    ).toEqual({ state: "legacy" });
  });

  it("shows no profile when an automated snapshot is missing", () => {
    expect(
      selectHistoricalMemberRating({
        competitionMode: "official",
        ratingEra: "automated",
        displayedLevelSnapshot: null,
      }),
    ).toEqual({ state: "no_profile" });
  });
});
