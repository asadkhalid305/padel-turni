import { describe, expect, it } from "vitest";

import {
  createEventRatingSnapshot,
  selectEventRatingSnapshots,
  type RatingSnapshotSource,
} from "@/domain/ratings/event-snapshots";

const source = (overrides: Partial<RatingSnapshotSource> = {}) => ({
  playerId: "club-a-player",
  appUserId: "global-account",
  name: "Account Name",
  profile: {
    onboardingStatus: "completed" as const,
    mu: 27.125,
    sigma: 8.75,
    displayedLevel: 4,
    engineVersion: "openskill-bradley-terry-full-v1",
  },
  ...overrides,
});

describe("event rating snapshots", () => {
  it("captures the global account profile at full precision", () => {
    expect(createEventRatingSnapshot(source(), "snapshot-a", 2)).toEqual({
      id: "snapshot-a",
      playerId: "club-a-player",
      appUserId: "global-account",
      name: "Account Name",
      mu: 27.125,
      sigma: 8.75,
      displayedLevel: 4,
      engineVersion: "openskill-bradley-terry-full-v1",
      displayOrder: 2,
    });
  });

  it("rejects an incomplete or missing current profile at the boundary", () => {
    expect(() =>
      selectEventRatingSnapshots({
        playerIds: ["new-player"],
        existingSnapshots: [],
        currentSources: [],
        createId: () => "new-snapshot",
      }),
    ).toThrow("completed current rating profile");
  });

  it("preserves historical snapshots when the current global profile changes", () => {
    const historical = {
      id: "historical-snapshot",
      playerId: "club-a-player",
      appUserId: "global-account",
      name: "Historical Name",
      mu: 20,
      sigma: 12.5,
      displayedLevel: 3.1,
      engineVersion: "openskill-bradley-terry-full-v1",
      displayOrder: 0,
    };
    const [selected] = selectEventRatingSnapshots({
      playerIds: ["club-a-player"],
      existingSnapshots: [historical],
      currentSources: [source()],
      createId: () => "must-not-be-used",
    });
    expect(selected).toEqual(historical);
  });

  it("uses one global profile for account proxies selected in different clubs", () => {
    const clubA = createEventRatingSnapshot(source(), "event-a", 0);
    const clubB = createEventRatingSnapshot(
      source({ playerId: "club-b-player" }),
      "event-b",
      0,
    );
    expect(clubA.playerId).not.toBe(clubB.playerId);
    expect(clubA.appUserId).toBe(clubB.appUserId);
    expect([clubA.mu, clubA.sigma, clubA.displayedLevel]).toEqual([
      clubB.mu,
      clubB.sigma,
      clubB.displayedLevel,
    ]);
  });
});
