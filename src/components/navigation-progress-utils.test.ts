import { describe, expect, it } from "vitest";

import { shouldStartNavigation } from "@/components/navigation-progress-utils";

const baseClick = {
  altKey: false,
  button: 0,
  ctrlKey: false,
  currentUrl: "http://localhost:3100/events/one?view=overview",
  defaultPrevented: false,
  download: false,
  href: "http://localhost:3100/events",
  metaKey: false,
  shiftKey: false,
  target: null,
};

describe("shouldStartNavigation", () => {
  it("starts for internal route and query transitions", () => {
    expect(shouldStartNavigation(baseClick)).toBe(true);
    expect(
      shouldStartNavigation({
        ...baseClick,
        href: "http://localhost:3100/events/one?view=standings",
      }),
    ).toBe(true);
  });

  it("ignores the current destination and hash-only changes", () => {
    expect(
      shouldStartNavigation({
        ...baseClick,
        href: "http://localhost:3100/events/one?view=overview",
      }),
    ).toBe(false);
    expect(
      shouldStartNavigation({
        ...baseClick,
        href: "http://localhost:3100/events/one?view=overview#scores",
      }),
    ).toBe(false);
  });

  it("ignores external and modified navigation", () => {
    expect(
      shouldStartNavigation({
        ...baseClick,
        href: "https://example.com/events",
      }),
    ).toBe(false);
    expect(shouldStartNavigation({ ...baseClick, metaKey: true })).toBe(false);
    expect(shouldStartNavigation({ ...baseClick, target: "_blank" })).toBe(
      false,
    );
  });
});
