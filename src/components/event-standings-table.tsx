"use client";

import type { Standing } from "@/domain/types";
import type { MemberRatingPresentation } from "@/domain/ratings/member-presentation";
import { MemberRating } from "@/components/member-rating";
import {
  defaultStandingSort,
  sortStandingRows,
  type StandingSort,
  type StandingSortKey,
} from "@/lib/standing-sort";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";

type Column = {
  key: StandingSortKey;
  label: string;
  render: (row: Standing) => string | number;
};

const columns: Column[] = [
  {
    key: "rank",
    label: "#",
    render: (row) => row.rank,
  },
  {
    key: "playerName",
    label: "Player",
    render: (row) => row.playerName,
  },
  {
    key: "played",
    label: "P",
    render: (row) => row.played,
  },
  {
    key: "wins",
    label: "W",
    render: (row) => row.wins,
  },
  {
    key: "draws",
    label: "D",
    render: (row) => row.draws,
  },
  {
    key: "losses",
    label: "L",
    render: (row) => row.losses,
  },
  {
    key: "pointsFor",
    label: "PF",
    render: (row) => row.pointsFor,
  },
  {
    key: "pointDifference",
    label: "+/-",
    render: (row) => row.pointDifference,
  },
  {
    key: "averagePoints",
    label: "Avg",
    render: (row) => row.averagePoints.toFixed(1),
  },
  {
    key: "winRate",
    label: "Win %",
    render: (row) => `${(row.winRate * 100).toFixed(0)}%`,
  },
];

type EventStandingsTableProps = {
  standings: Standing[];
  ratings?: Record<string, MemberRatingPresentation>;
};

export function EventStandingsTable({
  standings,
  ratings = {},
}: EventStandingsTableProps) {
  const [sort, setSort] = useState<StandingSort>(defaultStandingSort);
  const sortedStandings = useMemo(
    () => sortStandingRows(standings, sort),
    [standings, sort],
  );

  function updateSort(key: StandingSortKey) {
    setSort((current) => {
      if (current.key !== key) {
        return {
          key,
          direction: key === "rank" || key === "playerName" ? "asc" : "desc",
        };
      }
      return {
        key,
        direction: current.direction === "asc" ? "desc" : "asc",
      };
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead className="bg-[var(--ink)] text-left text-xs uppercase tracking-[0.12em] text-white/60">
          <tr>
            {columns.map((column) => {
              const active = sort.key === column.key;
              const Icon = active
                ? sort.direction === "asc"
                  ? ArrowUp
                  : ArrowDown
                : ArrowUpDown;
              return (
                <th
                  key={column.key}
                  className="px-4 py-3 font-bold"
                  aria-sort={
                    active
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="inline-flex min-h-10 items-center gap-2 rounded-md font-black transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    onClick={() => updateSort(column.key)}
                  >
                    <span>{column.label}</span>
                    <Icon
                      className={cn(
                        "size-4",
                        active ? "text-white" : "text-white/35",
                      )}
                      aria-hidden="true"
                    />
                    <span className="sr-only">
                      Sort by {column.label}{" "}
                      {active && sort.direction === "desc"
                        ? "ascending"
                        : "descending"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedStandings.map((row) => (
            <tr
              key={row.playerId}
              className="border-b border-slate-100 last:border-0"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-4 py-4",
                    column.key === "rank" && "font-black text-[var(--green)]",
                    column.key === "playerName" && "font-bold",
                  )}
                >
                  {column.key === "playerName" ? (
                    <div className="flex min-w-48 flex-wrap items-center gap-2">
                      <span>{row.playerName}</span>
                      {ratings[row.playerId] ? (
                        <MemberRating rating={ratings[row.playerId]} compact />
                      ) : null}
                    </div>
                  ) : (
                    column.render(row)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
