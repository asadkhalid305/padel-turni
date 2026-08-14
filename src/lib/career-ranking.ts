import type { MemberRatingPresentation } from "@/domain/ratings/member-presentation";

export type CareerPlayerStats = {
  playerId: string;
  playerName: string;
  events: number;
  matches: number;
  wins: number;
  averagePoints: number;
  winRate: number;
  ratingPresentation?: MemberRatingPresentation;
};

export type CareerSortKey =
  | "playerName"
  | "events"
  | "matches"
  | "wins"
  | "averagePoints"
  | "winRate";

export type SortDirection = "asc" | "desc";

export type CareerSort = {
  key: CareerSortKey;
  direction: SortDirection;
};

export const defaultCareerSort: CareerSort = {
  key: "averagePoints",
  direction: "desc",
};

function compareValues(
  first: CareerPlayerStats,
  second: CareerPlayerStats,
  key: CareerSortKey,
) {
  if (key === "playerName") {
    return first.playerName.localeCompare(second.playerName);
  }
  return first[key] - second[key];
}

function compareDescending(
  first: CareerPlayerStats,
  second: CareerPlayerStats,
  key: Exclude<CareerSortKey, "playerName">,
) {
  return second[key] - first[key];
}

export function sortCareerRows(
  rows: CareerPlayerStats[],
  sort: CareerSort = defaultCareerSort,
) {
  return [...rows].sort((first, second) => {
    const primary = compareValues(first, second, sort.key);
    if (primary !== 0) {
      return sort.direction === "asc" ? primary : -primary;
    }

    return (
      compareDescending(first, second, "averagePoints") ||
      compareDescending(first, second, "winRate") ||
      compareDescending(first, second, "matches") ||
      compareDescending(first, second, "events") ||
      first.playerName.localeCompare(second.playerName) ||
      first.playerId.localeCompare(second.playerId)
    );
  });
}
