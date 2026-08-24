export function canDeleteEvent(options: {
  eventStatus: string;
  matchStatuses: string[];
}) {
  return (
    options.eventStatus === "scheduled" &&
    options.matchStatuses.every((status) => status === "scheduled")
  );
}

export function canCompleteEvent(options: {
  eventStatus: string;
  matchStatuses: string[];
}) {
  return options.eventStatus === "live" && options.matchStatuses.length > 0;
}

export function canCancelEvent(options: { eventStatus: string }) {
  return options.eventStatus === "live";
}

export function canArchiveEvent(options: {
  eventStatus: string;
  isArchived: boolean;
}) {
  return options.eventStatus === "completed" && !options.isArchived;
}

export function canRestoreEvent(options: {
  eventStatus: string;
  isArchived: boolean;
}) {
  return options.eventStatus === "completed" && options.isArchived;
}

export function canChangeEventStandingsEligibility(options: {
  eventStatus: string;
  competitionMode?: string;
}) {
  return (
    options.eventStatus === "completed" &&
    options.competitionMode !== "practice"
  );
}

export function canEditEventDetails(options: {
  eventStatus: string;
  matchStatuses: string[];
}) {
  return (
    options.eventStatus !== "completed" &&
    options.eventStatus !== "cancelled" &&
    options.eventStatus !== "archived"
  );
}

export function canChangeEventSchedule(options: { matchStatuses: string[] }) {
  return options.matchStatuses.every((status) => status === "scheduled");
}

export function canChangeEventCompetitionMode(options: {
  matchStatuses: string[];
}) {
  return options.matchStatuses.every((status) => status === "scheduled");
}

export function hasSameStableIds(
  first: readonly string[],
  second: readonly string[],
) {
  if (first.length !== second.length) return false;
  const secondIds = new Set(second);
  return first.every((id) => secondIds.has(id));
}

export function canReshuffleRandomDraw(options: {
  eventStatus: string;
  drawStrategy: string;
  matchStatuses: string[];
}) {
  return (
    options.eventStatus === "scheduled" &&
    options.drawStrategy === "random" &&
    options.matchStatuses.length > 0 &&
    canChangeEventSchedule({ matchStatuses: options.matchStatuses })
  );
}
