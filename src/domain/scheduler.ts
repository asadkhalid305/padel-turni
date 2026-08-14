import { stableNoise } from "@/domain/random";
import type {
  DrawStrategy,
  PlayerSeed,
  Schedule,
  ScheduledMatch,
  ScheduledRound,
} from "@/domain/types";

type PairCounts = Map<string, number>;

type Candidate = {
  players: [PlayerSeed, PlayerSeed, PlayerSeed, PlayerSeed];
  teamOne: [PlayerSeed, PlayerSeed];
  teamTwo: [PlayerSeed, PlayerSeed];
  repeatedPartners: number;
  repeatedOpponents: number;
  ratingDifference: number;
  tieBreaker: number;
};

function pairKey(first: string, second: string) {
  return [first, second].sort().join(":");
}

function incrementPair(map: PairCounts, first: string, second: string) {
  const key = pairKey(first, second);
  map.set(key, (map.get(key) ?? 0) + 1);
}

function combinations<T>(items: T[], size: number, limit = 6000) {
  const result: T[][] = [];

  function visit(start: number, current: T[]) {
    if (result.length >= limit) return;
    if (current.length === size) {
      result.push([...current]);
      return;
    }

    for (let index = start; index < items.length; index += 1) {
      current.push(items[index]);
      visit(index + 1, current);
      current.pop();
    }
  }

  visit(0, []);
  return result;
}

function pairingOptions(
  group: [PlayerSeed, PlayerSeed, PlayerSeed, PlayerSeed],
) {
  const [a, b, c, d] = group;
  return [
    {
      teamOne: [a, b] as [PlayerSeed, PlayerSeed],
      teamTwo: [c, d] as [PlayerSeed, PlayerSeed],
    },
    {
      teamOne: [a, c] as [PlayerSeed, PlayerSeed],
      teamTwo: [b, d] as [PlayerSeed, PlayerSeed],
    },
    {
      teamOne: [a, d] as [PlayerSeed, PlayerSeed],
      teamTwo: [b, c] as [PlayerSeed, PlayerSeed],
    },
  ];
}

function candidatePriorities(
  teamOne: [PlayerSeed, PlayerSeed],
  teamTwo: [PlayerSeed, PlayerSeed],
  partners: PairCounts,
  opponents: PairCounts,
) {
  const repeatedPartners =
    (partners.get(pairKey(teamOne[0].id, teamOne[1].id)) ?? 0) +
    (partners.get(pairKey(teamTwo[0].id, teamTwo[1].id)) ?? 0);
  const repeatedOpponents = teamOne.reduce(
    (total, player) =>
      total +
      teamTwo.reduce(
        (teamTotal, opponent) =>
          teamTotal + (opponents.get(pairKey(player.id, opponent.id)) ?? 0),
        0,
      ),
    0,
  );
  const ratingDifference = Math.abs(
    teamOne[0].rating +
      teamOne[1].rating -
      teamTwo[0].rating -
      teamTwo[1].rating,
  );

  return { repeatedPartners, repeatedOpponents, ratingDifference };
}

function isBetterCandidate(
  candidate: Candidate,
  best: Candidate | undefined,
  strategy: DrawStrategy,
) {
  if (!best) return true;
  if (candidate.repeatedPartners !== best.repeatedPartners) {
    return candidate.repeatedPartners < best.repeatedPartners;
  }
  if (candidate.repeatedOpponents !== best.repeatedOpponents) {
    return candidate.repeatedOpponents < best.repeatedOpponents;
  }
  if (
    strategy === "rating_balanced" &&
    candidate.ratingDifference !== best.ratingDifference
  ) {
    return candidate.ratingDifference < best.ratingDifference;
  }
  return candidate.tieBreaker < best.tieBreaker;
}

function chooseMatch(
  remaining: PlayerSeed[],
  partners: PairCounts,
  opponents: PairCounts,
  seed: number,
  roundNumber: number,
  courtNumber: number,
  strategy: DrawStrategy,
) {
  let best: Candidate | undefined;
  const groups = combinations(remaining, 4);

  for (const rawGroup of groups) {
    const group = rawGroup as [PlayerSeed, PlayerSeed, PlayerSeed, PlayerSeed];
    for (const pairing of pairingOptions(group)) {
      const priorities = candidatePriorities(
        pairing.teamOne,
        pairing.teamTwo,
        partners,
        opponents,
      );
      const candidate: Candidate = {
        players: group,
        ...pairing,
        ...priorities,
        tieBreaker: stableNoise(
          `${roundNumber}:${courtNumber}:${group
            .map((player) => player.id)
            .sort()
            .join(",")}:${pairing.teamOne
            .map((player) => player.id)
            .sort()
            .join(",")}`,
          seed,
        ),
      };

      if (isBetterCandidate(candidate, best, strategy)) {
        best = candidate;
      }
    }
  }

  if (!best) {
    throw new Error("Unable to build a complete match.");
  }

  return best;
}

function validatePlayers(players: PlayerSeed[]) {
  if (players.length < 4) {
    throw new Error("At least four players are required.");
  }

  const ids = new Set<string>();
  for (const player of players) {
    if (!player.id.trim() || player.id.toLowerCase().includes("placeholder")) {
      throw new Error("Players must have stable, non-placeholder IDs.");
    }
    if (ids.has(player.id)) {
      throw new Error(`Duplicate player ID: ${player.id}`);
    }
    if (
      !Number.isFinite(player.rating) ||
      player.rating < 0.5 ||
      player.rating > 10
    ) {
      throw new Error(`Invalid rating for ${player.name}.`);
    }
    ids.add(player.id);
  }
}

export function generateSchedule(options: {
  players: PlayerSeed[];
  courtCounts: number[];
  courtNumbersByRound?: number[][];
  seed: number;
  strategy?: DrawStrategy;
}): Schedule {
  const {
    players,
    courtCounts,
    courtNumbersByRound,
    seed,
    strategy = "rating_balanced",
  } = options;
  validatePlayers(players);
  if (!courtCounts.length || courtCounts.some((count) => count < 1)) {
    throw new Error("Every round must have at least one court.");
  }
  if (
    courtNumbersByRound &&
    (courtNumbersByRound.length !== courtCounts.length ||
      courtNumbersByRound.some(
        (courtNumbers) =>
          !courtNumbers.length ||
          new Set(courtNumbers).size !== courtNumbers.length ||
          courtNumbers.some(
            (courtNumber) => !Number.isInteger(courtNumber) || courtNumber < 1,
          ),
      ))
  ) {
    throw new Error("Court numbers must match scheduled rounds.");
  }

  const appearances = new Map(players.map((player) => [player.id, 0]));
  const restStreaks = new Map(players.map((player) => [player.id, 0]));
  const partners: PairCounts = new Map();
  const opponents: PairCounts = new Map();
  const rounds: ScheduledRound[] = [];

  for (let roundIndex = 0; roundIndex < courtCounts.length; roundIndex += 1) {
    const roundNumber = roundIndex + 1;
    const roundCourtNumbers =
      courtNumbersByRound?.[roundIndex] ??
      Array.from(
        { length: courtCounts[roundIndex] },
        (_, courtIndex) => courtIndex + 1,
      );
    const courtCount = Math.min(
      roundCourtNumbers.length,
      Math.floor(players.length / 4),
    );
    const activeCourtNumbers = roundCourtNumbers.slice(0, courtCount);
    const playingCount = courtCount * 4;
    const selected = [...players]
      .sort((first, second) => {
        const firstScore =
          (appearances.get(first.id) ?? 0) * 1_000 -
          (restStreaks.get(first.id) ?? 0) * 120 +
          stableNoise(`${roundNumber}:${first.id}`, seed);
        const secondScore =
          (appearances.get(second.id) ?? 0) * 1_000 -
          (restStreaks.get(second.id) ?? 0) * 120 +
          stableNoise(`${roundNumber}:${second.id}`, seed);
        return firstScore - secondScore;
      })
      .slice(0, playingCount);

    const remaining = [...selected];
    const matches: ScheduledMatch[] = [];

    for (const courtNumber of activeCourtNumbers) {
      const chosen = chooseMatch(
        remaining,
        partners,
        opponents,
        seed,
        roundNumber,
        courtNumber,
        strategy,
      );
      const selectedIds = new Set(chosen.players.map((player) => player.id));
      remaining.splice(
        0,
        remaining.length,
        ...remaining.filter((player) => !selectedIds.has(player.id)),
      );

      incrementPair(partners, chosen.teamOne[0].id, chosen.teamOne[1].id);
      incrementPair(partners, chosen.teamTwo[0].id, chosen.teamTwo[1].id);
      for (const first of chosen.teamOne) {
        for (const second of chosen.teamTwo) {
          incrementPair(opponents, first.id, second.id);
        }
      }

      matches.push({
        id: `r${roundNumber}-c${courtNumber}`,
        roundNumber,
        courtNumber,
        teamOne: [chosen.teamOne[0].id, chosen.teamOne[1].id],
        teamTwo: [chosen.teamTwo[0].id, chosen.teamTwo[1].id],
      });
    }

    const selectedIds = new Set(selected.map((player) => player.id));
    const restingPlayerIds = players
      .filter((player) => !selectedIds.has(player.id))
      .map((player) => player.id);

    for (const player of players) {
      if (selectedIds.has(player.id)) {
        appearances.set(player.id, (appearances.get(player.id) ?? 0) + 1);
        restStreaks.set(player.id, 0);
      } else {
        restStreaks.set(player.id, (restStreaks.get(player.id) ?? 0) + 1);
      }
    }

    rounds.push({
      roundNumber,
      courtCount,
      matches,
      restingPlayerIds,
    });
  }

  return { seed, rounds };
}
