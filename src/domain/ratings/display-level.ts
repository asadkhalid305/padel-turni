export const MIN_DISPLAY_LEVEL = 0.5;
export const MAX_DISPLAY_LEVEL = 7;

const INTERNAL_MU_RANGE = 50;
const DISPLAY_LEVEL_RANGE = MAX_DISPLAY_LEVEL - MIN_DISPLAY_LEVEL;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const roundToOneDecimal = (value: number): number =>
  Math.round(value * 10) / 10;

/**
 * Converts a full-precision engine mu to the level shown to members.
 * Rounding is deliberately presentation-only.
 */
export const toDisplayLevel = (mu: number): number => {
  const unroundedLevel =
    MIN_DISPLAY_LEVEL + (DISPLAY_LEVEL_RANGE * mu) / INTERNAL_MU_RANGE;

  return clamp(
    roundToOneDecimal(unroundedLevel),
    MIN_DISPLAY_LEVEL,
    MAX_DISPLAY_LEVEL,
  );
};

/**
 * Converts a displayed level back to the canonical mu used for cold starts.
 * Out-of-range levels are clamped to the same public scale as presentation.
 */
export const displayLevelToMu = (displayLevel: number): number => {
  const clampedLevel = clamp(
    displayLevel,
    MIN_DISPLAY_LEVEL,
    MAX_DISPLAY_LEVEL,
  );

  return (
    ((clampedLevel - MIN_DISPLAY_LEVEL) * INTERNAL_MU_RANGE) /
    DISPLAY_LEVEL_RANGE
  );
};
