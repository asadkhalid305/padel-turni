"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import {
  defaultCareerSort,
  sortCareerRows,
  type CareerPlayerStats,
  type CareerSort,
  type CareerSortKey,
} from "@/lib/career-ranking";
import { MemberRating } from "@/components/member-rating";
import { cn } from "@/lib/utils";

type Column = {
  key: CareerSortKey;
  label: string;
  align?: "left" | "right";
  render: (player: CareerPlayerStats) => string | number;
};

const columns: Column[] = [
  {
    key: "playerName",
    label: "Player",
    render: (player) => player.playerName,
  },
  {
    key: "events",
    label: "Events",
    align: "right",
    render: (player) => player.events,
  },
  {
    key: "matches",
    label: "Matches",
    align: "right",
    render: (player) => player.matches,
  },
  {
    key: "wins",
    label: "Wins",
    align: "right",
    render: (player) => player.wins,
  },
  {
    key: "averagePoints",
    label: "Avg",
    align: "right",
    render: (player) => player.averagePoints.toFixed(1),
  },
  {
    key: "winRate",
    label: "Win %",
    align: "right",
    render: (player) => `${(player.winRate * 100).toFixed(0)}%`,
  },
];

type CareerBoardProps = {
  players: CareerPlayerStats[];
};

export function CareerBoard({ players }: CareerBoardProps) {
  const [sort, setSort] = useState<CareerSort>(defaultCareerSort);
  const sortedPlayers = useMemo(
    () => sortCareerRows(players, sort),
    [players, sort],
  );

  function updateSort(key: CareerSortKey) {
    setSort((current) => {
      if (current.key !== key) {
        return {
          key,
          direction: key === "playerName" ? "asc" : "desc",
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
      <table className="w-full min-w-[620px] text-sm">
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
                  className={cn(
                    "px-4 py-3",
                    column.align === "right" && "text-right",
                  )}
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
                    className={cn(
                      "inline-flex min-h-10 items-center gap-2 rounded-md font-black transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                      column.align === "right" && "justify-end",
                    )}
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
          {sortedPlayers.map((player, index) => (
            <tr key={player.playerId} className="border-b border-slate-100">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-4 py-4",
                    column.key === "playerName" && "font-bold",
                    column.align === "right" && "text-right",
                  )}
                >
                  {column.key === "playerName" ? (
                    <div className="flex min-w-48 flex-wrap items-center gap-2">
                      <span className="mr-3 text-[var(--green)]">
                        {index + 1}.
                      </span>
                      <span>{player.playerName}</span>
                      {player.ratingPresentation ? (
                        <MemberRating
                          rating={player.ratingPresentation}
                          compact
                        />
                      ) : null}
                    </div>
                  ) : (
                    column.render(player)
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
