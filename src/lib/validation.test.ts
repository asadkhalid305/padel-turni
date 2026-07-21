import { describe, expect, it } from "vitest";

import {
  calculateMinimumEventPlayerCount,
  formatMinimumEventPlayerMessage,
} from "@/domain/event-requirements";
import { eventSchema } from "@/lib/validation";

const eventInput = {
  name: "Sunday padel",
  venue: "Main club",
  startsAt: "2026-06-20T10:00",
  startsAtTimezoneOffsetMinutes: "-120",
  courtCount: "2",
  courtMinutes: ["120", "120"],
  requestedRoundMinutes: "20",
  breakMinutes: "5",
  notes: "",
};

describe("event validation", () => {
  it("calculates the minimum event roster from the court count", () => {
    expect(calculateMinimumEventPlayerCount(1)).toBe(4);
    expect(calculateMinimumEventPlayerCount(2)).toBe(8);
    expect(calculateMinimumEventPlayerCount(3)).toBe(12);
  });

  it("formats the shortage message from selected and required players", () => {
    expect(
      formatMinimumEventPlayerMessage({
        courtCount: 2,
        selectedPlayerCount: 2,
      }),
    ).toBe(
      "Select at least 6 more players for 2 courts. You have only selected 2 players.",
    );
  });

  it("requires the dynamic player minimum for the selected courts", () => {
    const parsed = eventSchema.safeParse({
      ...eventInput,
      playerIds: [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ],
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error("Expected event validation to fail.");
    }
    expect(parsed.error.issues[0].message).toBe(
      "Select at least 6 more players for 2 courts. You have only selected 2 players.",
    );
  });

  it("accepts eight players for two courts", () => {
    const parsed = eventSchema.safeParse({
      ...eventInput,
      playerIds: [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000003",
        "00000000-0000-4000-8000-000000000004",
        "00000000-0000-4000-8000-000000000005",
        "00000000-0000-4000-8000-000000000006",
        "00000000-0000-4000-8000-000000000007",
        "00000000-0000-4000-8000-000000000008",
      ],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Expected event validation to pass.");
    expect(parsed.data.drawStrategy).toBe("random");
  });

  it("validates persisted enum-style draw strategies", () => {
    const valid = eventSchema.safeParse({
      ...eventInput,
      drawStrategy: "rating_balanced",
      playerIds: Array.from(
        { length: 8 },
        (_, index) =>
          `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      ),
    });
    const invalid = eventSchema.safeParse({
      ...eventInput,
      drawStrategy: "fairness_toggle",
      playerIds: Array.from(
        { length: 8 },
        (_, index) =>
          `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      ),
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it("preserves the selected local event time with the submitted timezone offset", () => {
    const parsed = eventSchema.safeParse({
      ...eventInput,
      startsAt: "2026-06-20T07:00",
      startsAtTimezoneOffsetMinutes: "-180",
      playerIds: [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000003",
        "00000000-0000-4000-8000-000000000004",
        "00000000-0000-4000-8000-000000000005",
        "00000000-0000-4000-8000-000000000006",
        "00000000-0000-4000-8000-000000000007",
        "00000000-0000-4000-8000-000000000008",
      ],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error("Expected event validation to pass.");
    }
    expect(parsed.data.startsAt.toISOString()).toBe("2026-06-20T04:00:00.000Z");
  });
});
