import {
  MAX_DISPLAY_LEVEL,
  MIN_DISPLAY_LEVEL,
  toDisplayLevel,
} from "@/domain/ratings/display-level";

export const PROVISIONAL_MATCH_TARGET = 6;

export type MemberRatingPresentation =
  | Readonly<{
      state: "current";
      level: string;
      provisional: Readonly<{ completed: number; target: 6 }> | null;
    }>
  | Readonly<{
      state: "snapshot";
      level: string;
      eventMode: "official" | "practice";
    }>
  | Readonly<{
      state: "updating";
      level: string | null;
    }>
  | Readonly<{ state: "legacy" }>
  | Readonly<{ state: "no_profile" }>;

export type MemberVisibleRatingJobStatus =
  | "pending"
  | "processing"
  | "retryable"
  | "applied"
  | "skipped"
  | "failed"
  | null;

type CurrentProfile = Readonly<{
  onboardingStatus: "not_started" | "in_progress" | "completed";
  mu: number | null;
  ratedMatchCount: number;
}>;

function formatStoredLevel(level: number): string | null {
  if (!Number.isFinite(level)) return null;
  const rounded = Math.round(level * 10) / 10;
  const clamped = Math.min(
    MAX_DISPLAY_LEVEL,
    Math.max(MIN_DISPLAY_LEVEL, rounded),
  );
  return clamped.toFixed(1);
}

function isUpdating(status: MemberVisibleRatingJobStatus): boolean {
  return (
    status === "pending" ||
    status === "processing" ||
    status === "retryable" ||
    status === "failed"
  );
}

export function selectMemberRatingUpdate(
  jobStatus: MemberVisibleRatingJobStatus,
): MemberRatingPresentation | null {
  return isUpdating(jobStatus) ? { state: "updating", level: null } : null;
}

/**
 * Shapes a global account profile for member-facing current-level surfaces.
 * Failed jobs deliberately collapse into the same neutral updating state as
 * queued work; internal recovery details are admin-only.
 */
export function selectCurrentMemberRating(options: {
  profile: CurrentProfile | null;
  jobStatus?: MemberVisibleRatingJobStatus;
}): MemberRatingPresentation {
  const profile = options.profile;
  if (
    !profile ||
    profile.onboardingStatus !== "completed" ||
    profile.mu === null ||
    !Number.isFinite(profile.mu)
  ) {
    return { state: "no_profile" };
  }

  const level = formatStoredLevel(toDisplayLevel(profile.mu));
  if (!level) return { state: "no_profile" };
  if (isUpdating(options.jobStatus ?? null)) {
    return { state: "updating", level };
  }

  const completed = Math.min(
    PROVISIONAL_MATCH_TARGET,
    Math.max(0, Math.trunc(profile.ratedMatchCount)),
  );
  return {
    state: "current",
    level,
    provisional:
      completed < PROVISIONAL_MATCH_TARGET
        ? { completed, target: PROVISIONAL_MATCH_TARGET }
        : null,
  };
}

/** Selects the immutable event-start value for historical event views. */
export function selectHistoricalMemberRating(options: {
  competitionMode: "official" | "practice" | "legacy";
  ratingEra: "automated" | "legacy";
  displayedLevelSnapshot: number | null;
}): MemberRatingPresentation {
  if (options.competitionMode === "legacy" || options.ratingEra === "legacy") {
    return { state: "legacy" };
  }

  if (options.displayedLevelSnapshot === null) {
    return { state: "no_profile" };
  }
  const level = formatStoredLevel(options.displayedLevelSnapshot);
  if (!level) return { state: "no_profile" };
  return {
    state: "snapshot",
    level,
    eventMode: options.competitionMode,
  };
}

export function selectMemberRating(
  options:
    | Readonly<{
        context: "current";
        profile: CurrentProfile | null;
        jobStatus?: MemberVisibleRatingJobStatus;
      }>
    | Readonly<{
        context: "historical";
        competitionMode: "official" | "practice" | "legacy";
        ratingEra: "automated" | "legacy";
        displayedLevelSnapshot: number | null;
      }>,
): MemberRatingPresentation {
  return options.context === "current"
    ? selectCurrentMemberRating(options)
    : selectHistoricalMemberRating(options);
}
