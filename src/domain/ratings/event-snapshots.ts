export type CompletedRatingProfile = Readonly<{
  onboardingStatus: "completed";
  mu: number;
  sigma: number;
  displayedLevel: number;
  engineVersion: string;
}>;

export type RatingSnapshotSource = Readonly<{
  playerId: string;
  appUserId: string;
  name: string;
  profile: CompletedRatingProfile;
}>;

export type EventRatingSnapshot = Readonly<{
  id: string;
  playerId: string;
  appUserId: string;
  name: string;
  mu: number;
  sigma: number;
  displayedLevel: number;
  engineVersion: string;
  displayOrder: number;
}>;

export type ExistingEventRatingSnapshot = Omit<
  EventRatingSnapshot,
  "displayOrder"
> & {
  displayOrder: number;
};

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label} is missing.`);
}

export function createEventRatingSnapshot(
  source: RatingSnapshotSource,
  id: string,
  displayOrder: number,
): EventRatingSnapshot {
  if (!source.playerId || !source.appUserId) {
    throw new Error("A stable account-owned player is required.");
  }
  if (!source.name.trim()) throw new Error("The account name is missing.");
  assertFinite(source.profile.mu, "Current rating mu");
  assertFinite(source.profile.sigma, "Current rating sigma");
  assertFinite(source.profile.displayedLevel, "Current displayed level");
  if (source.profile.sigma <= 0) {
    throw new Error("Current rating sigma must be positive.");
  }
  if (
    source.profile.displayedLevel < 0.5 ||
    source.profile.displayedLevel > 7
  ) {
    throw new Error("Current displayed level is outside the supported scale.");
  }
  if (!source.profile.engineVersion.trim()) {
    throw new Error("Current rating engine is missing.");
  }

  return {
    id,
    playerId: source.playerId,
    appUserId: source.appUserId,
    name: source.name,
    mu: source.profile.mu,
    sigma: source.profile.sigma,
    displayedLevel: source.profile.displayedLevel,
    engineVersion: source.profile.engineVersion,
    displayOrder,
  };
}

export function selectEventRatingSnapshots(options: {
  playerIds: readonly string[];
  existingSnapshots: readonly ExistingEventRatingSnapshot[];
  currentSources: readonly RatingSnapshotSource[];
  createId: () => string;
}): EventRatingSnapshot[] {
  const existingByPlayerId = new Map(
    options.existingSnapshots.map((snapshot) => [snapshot.playerId, snapshot]),
  );
  const sourceByPlayerId = new Map(
    options.currentSources.map((source) => [source.playerId, source]),
  );

  return options.playerIds.map((playerId, displayOrder) => {
    const existing = existingByPlayerId.get(playerId);
    if (existing) return { ...existing, displayOrder };
    const source = sourceByPlayerId.get(playerId);
    if (!source) {
      throw new Error(
        "Every newly selected account must have a completed current rating profile.",
      );
    }
    return createEventRatingSnapshot(source, options.createId(), displayOrder);
  });
}
