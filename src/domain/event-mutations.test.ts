import { describe, expect, it } from "vitest";

import {
  canArchiveEvent,
  canChangeEventSchedule,
  canCompleteEvent,
  canDeleteEvent,
  canEditEventDetails,
} from "@/domain/event-mutations";

describe("event mutation policy", () => {
  it("allows full event deletion only while every match is scheduled", () => {
    expect(
      canDeleteEvent({
        eventStatus: "scheduled",
        matchStatuses: ["scheduled", "scheduled"],
      }),
    ).toBe(true);
    expect(
      canDeleteEvent({
        eventStatus: "scheduled",
        matchStatuses: ["scheduled", "live"],
      }),
    ).toBe(false);
  });

  it("offers guarded archiving for live events without treating it as deletion", () => {
    expect(canArchiveEvent({ eventStatus: "live" })).toBe(true);
    expect(canArchiveEvent({ eventStatus: "scheduled" })).toBe(false);
    expect(canArchiveEvent({ eventStatus: "completed" })).toBe(false);
  });

  it("allows event detail edits with completed matches but locks started schedules", () => {
    expect(
      canEditEventDetails({
        eventStatus: "scheduled",
        matchStatuses: ["scheduled", "completed"],
      }),
    ).toBe(true);
    expect(
      canEditEventDetails({
        eventStatus: "completed",
        matchStatuses: ["completed"],
      }),
    ).toBe(false);
    expect(
      canChangeEventSchedule({
        matchStatuses: ["scheduled", "paused"],
      }),
    ).toBe(false);
    expect(
      canChangeEventSchedule({
        matchStatuses: ["scheduled", "scheduled"],
      }),
    ).toBe(true);
  });

  it("allows admins to finish an event when no match is in progress", () => {
    expect(
      canCompleteEvent({
        eventStatus: "live",
        matchStatuses: ["completed", "scheduled", "cancelled"],
      }),
    ).toBe(true);
    expect(
      canCompleteEvent({
        eventStatus: "live",
        matchStatuses: ["completed", "live"],
      }),
    ).toBe(false);
    expect(
      canCompleteEvent({
        eventStatus: "completed",
        matchStatuses: ["completed", "scheduled"],
      }),
    ).toBe(false);
  });
});
