import { z } from "zod";

import {
  calculateMinimumEventPlayerCount,
  formatMinimumEventPlayerMessage,
} from "@/domain/event-requirements";
import { competitionModes, drawStrategies } from "@/domain/types";
import { parseEventStart } from "@/lib/event-time";

export const eventSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    venue: z.string().trim().max(120),
    startsAt: z.string().trim(),
    startsAtTimezoneOffsetMinutes: z.coerce
      .number()
      .int()
      .min(-840)
      .max(840)
      .default(0),
    courtCount: z.coerce.number().int().min(1).max(20),
    courtMinutes: z
      .array(z.coerce.number().int().min(5).max(1440))
      .min(1)
      .max(20),
    requestedRoundMinutes: z.coerce.number().int().min(5).max(120),
    breakMinutes: z.coerce.number().int().min(0).max(30),
    notes: z.string().trim().max(1000),
    playerIds: z.array(z.string().uuid()),
    drawStrategy: z.enum(drawStrategies).default("random"),
    competitionMode: z.enum(competitionModes).default("official"),
    originalCompetitionMode: z.enum(competitionModes).optional(),
    originalDrawStrategy: z.enum(drawStrategies).optional(),
    confirmDrawReplacement: z.coerce.boolean().default(false),
  })
  .superRefine((event, context) => {
    if (!parseEventStart(event.startsAt, event.startsAtTimezoneOffsetMinutes)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose a valid event start time.",
        path: ["startsAt"],
      });
    }
  })
  .transform((event) => {
    const startsAt = parseEventStart(
      event.startsAt,
      event.startsAtTimezoneOffsetMinutes,
    );

    return {
      name: event.name,
      venue: event.venue,
      startsAt: startsAt ?? new Date(Number.NaN),
      courtCount: event.courtCount,
      courtMinutes: event.courtMinutes,
      requestedRoundMinutes: event.requestedRoundMinutes,
      breakMinutes: event.breakMinutes,
      notes: event.notes,
      playerIds: event.playerIds,
      drawStrategy: event.drawStrategy,
      competitionMode: event.competitionMode,
      originalCompetitionMode: event.originalCompetitionMode,
      originalDrawStrategy: event.originalDrawStrategy,
      confirmDrawReplacement: event.confirmDrawReplacement,
    };
  })
  .superRefine((event, context) => {
    if (event.courtMinutes.length !== event.courtCount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter availability minutes for each court.",
        path: ["courtMinutes"],
      });
    }

    const requiredPlayers = calculateMinimumEventPlayerCount(event.courtCount);
    if (event.playerIds.length < requiredPlayers) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: formatMinimumEventPlayerMessage({
          courtCount: event.courtCount,
          selectedPlayerCount: event.playerIds.length,
        }),
        path: ["playerIds"],
      });
    }
  });

export const scoreSchema = z.object({
  matchId: z.string().uuid(),
  eventId: z.string().uuid(),
  teamOneScore: z.coerce.number().int().min(0).max(99),
  teamTwoScore: z.coerce.number().int().min(0).max(99),
});
