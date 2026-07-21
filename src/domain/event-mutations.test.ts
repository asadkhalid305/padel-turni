import { describe, expect, it } from "vitest";

import {
  canArchiveEvent,
  canCancelEvent,
  canChangeEventSchedule,
  canChangeEventStandingsEligibility,
  canCompleteEvent,
  canDeleteEvent,
  canEditEventDetails,
  canRestoreEvent,
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

  it("separates cancelling live events from archiving completed events", () => {
    expect(canCancelEvent({ eventStatus: "live" })).toBe(true);
    expect(canCancelEvent({ eventStatus: "completed" })).toBe(false);
    expect(
      canArchiveEvent({ eventStatus: "completed", isArchived: false }),
    ).toBe(true);
    expect(canArchiveEvent({ eventStatus: "live", isArchived: false })).toBe(
      false,
    );
    expect(
      canRestoreEvent({ eventStatus: "completed", isArchived: true }),
    ).toBe(true);
    expect(
      canChangeEventStandingsEligibility({
        eventStatus: "live",
      }),
    ).toBe(false);
    expect(
      canChangeEventStandingsEligibility({
        eventStatus: "completed",
      }),
    ).toBe(true);
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

  it("allows admins to finish any live event with matches", () => {
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
    ).toBe(true);
    expect(
      canCompleteEvent({
        eventStatus: "scheduled",
        matchStatuses: ["scheduled"],
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
