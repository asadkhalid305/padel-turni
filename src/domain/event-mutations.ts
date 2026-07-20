export function canDeleteEvent(options: {
  eventStatus: string;
  matchStatuses: string[];
}) {
  return (
    options.eventStatus === "scheduled" &&
    options.matchStatuses.every((status) => status === "scheduled")
  );
}

export function canArchiveEvent(options: { eventStatus: string }) {
  return options.eventStatus === "live";
}

export function canEditEventDetails(options: {
  eventStatus: string;
  matchStatuses: string[];
}) {
  return options.eventStatus !== "completed";
}

export function canChangeEventSchedule(options: { matchStatuses: string[] }) {
  return options.matchStatuses.every((status) => status === "scheduled");
}

export function canCompleteEvent(options: {
  eventStatus: string;
  matchStatuses: string[];
}) {
  return (
    options.eventStatus !== "completed" &&
    options.matchStatuses.length > 0 &&
    options.matchStatuses.every(
      (status) =>
        status === "scheduled" ||
        status === "completed" ||
        status === "cancelled",
    )
  );
}
