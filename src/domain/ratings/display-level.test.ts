import { describe, expect, it } from "vitest";

import {
  displayLevelToMu,
  MAX_DISPLAY_LEVEL,
  MIN_DISPLAY_LEVEL,
  toDisplayLevel,
} from "./display-level";

describe("automated rating display levels", () => {
  it.each([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5])(
    "round-trips onboarding level %s through full-precision mu",
    (level) => {
      const mu = displayLevelToMu(level);

      expect(toDisplayLevel(mu)).toBe(level);
      expect(mu).toBeCloseTo(((level - 0.5) * 50) / 6.5, 12);
    },
  );

  it.each([
    { mu: -100, level: MIN_DISPLAY_LEVEL },
    { mu: 0, level: MIN_DISPLAY_LEVEL },
    { mu: 50, level: MAX_DISPLAY_LEVEL },
    { mu: 100, level: MAX_DISPLAY_LEVEL },
  ])("clamps mu $mu to display level $level", ({ mu, level }) => {
    expect(toDisplayLevel(mu)).toBe(level);
  });

  it.each([
    { level: -1, mu: 0 },
    { level: MIN_DISPLAY_LEVEL, mu: 0 },
    { level: MAX_DISPLAY_LEVEL, mu: 50 },
    { level: 9, mu: 50 },
  ])("clamps inverse level $level to mu $mu", ({ level, mu }) => {
    expect(displayLevelToMu(level)).toBe(mu);
  });

  it("rounds to one decimal only after applying the linear mapping", () => {
    const muForUnroundedLevel = (level: number) =>
      ((level - MIN_DISPLAY_LEVEL) * 50) / 6.5;

    expect(toDisplayLevel(muForUnroundedLevel(3.049))).toBe(3);
    expect(toDisplayLevel(muForUnroundedLevel(3.05))).toBe(3.1);
    expect(toDisplayLevel(muForUnroundedLevel(3.149))).toBe(3.1);
    expect(toDisplayLevel(muForUnroundedLevel(3.15))).toBe(3.2);
  });

  it("does not round the inverse mu used for storage", () => {
    expect(displayLevelToMu(4)).toBe(26.923076923076923);
  });
});
