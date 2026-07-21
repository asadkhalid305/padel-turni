export type PlayerSeed = {
  id: string;
  name: string;
  rating: number;
};

export const drawStrategies = ["random", "rating_balanced"] as const;

export type DrawStrategy = (typeof drawStrategies)[number];

export type ScheduledMatch = {
  id: string;
  roundNumber: number;
  courtNumber: number;
  teamOne: [string, string];
  teamTwo: [string, string];
};

export type ScheduledRound = {
  roundNumber: number;
  courtCount: number;
  matches: ScheduledMatch[];
  restingPlayerIds: string[];
};

export type Schedule = {
  seed: number;
  rounds: ScheduledRound[];
};

export type CompletedMatch = ScheduledMatch & {
  status: "completed";
  teamOneScore: number;
  teamTwoScore: number;
};

export type Standing = {
  playerId: string;
  playerName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  averagePoints: number;
  winRate: number;
  rank: number;
};
