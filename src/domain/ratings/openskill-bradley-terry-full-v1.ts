import { rate } from "openskill";
import { bradleyTerryFull } from "openskill/models";

export const RATING_ENGINE_ID = "openskill-bradley-terry-full-v1" as const;

/**
 * Reproducibility contract persisted with rating calculations. Keep package
 * defaults explicit so a dependency upgrade cannot silently change policy.
 */
export const RATING_ENGINE_CONFIGURATION = Object.freeze({
  engineId: RATING_ENGINE_ID,
  package: "openskill",
  packageVersion: "5.0.1",
  model: "bradleyTerryFull",
  gamma: "openskill-default",
  mu: 25,
  sigma: 25 / 3,
  beta: 25 / 6,
  tau: 25 / 300,
  epsilon: 0.1,
  z: 3,
  alpha: 1,
  target: 0,
  limitSigma: false,
  balance: false,
  kappa: 0.0001,
});

export const serializeRatingEngineConfiguration = (): string =>
  JSON.stringify(RATING_ENGINE_CONFIGURATION);

export type RatingValue = Readonly<{
  mu: number;
  sigma: number;
}>;

export type RatingTeam = readonly [RatingValue, RatingValue];
export type RatingTeams = readonly [RatingTeam, RatingTeam];

export type MatchOutcome = "teamOneWin" | "draw" | "teamTwoWin";

export type RateTwoVsTwoInput = Readonly<{
  teams: RatingTeams;
  outcome: MatchOutcome;
}>;

export type RatedTeam = readonly [RatingValue, RatingValue];
export type RatedTeams = readonly [RatedTeam, RatedTeam];

const OUTCOME_RANKS: Readonly<Record<MatchOutcome, readonly [number, number]>> =
  Object.freeze({
    teamOneWin: [1, 2],
    draw: [1, 1],
    teamTwoWin: [2, 1],
  });

/**
 * Rates one 2v2 result. Its deliberately narrow input has no score or margin,
 * so a narrow win and a blowout are identical rating events by construction.
 */
export const rateTwoVsTwo = ({
  teams,
  outcome,
}: RateTwoVsTwoInput): RatedTeams => {
  const result = rate(teams, {
    model: bradleyTerryFull,
    rank: [...OUTCOME_RANKS[outcome]],
    mu: RATING_ENGINE_CONFIGURATION.mu,
    sigma: RATING_ENGINE_CONFIGURATION.sigma,
    beta: RATING_ENGINE_CONFIGURATION.beta,
    tau: RATING_ENGINE_CONFIGURATION.tau,
    epsilon: RATING_ENGINE_CONFIGURATION.epsilon,
    z: RATING_ENGINE_CONFIGURATION.z,
    alpha: RATING_ENGINE_CONFIGURATION.alpha,
    target: RATING_ENGINE_CONFIGURATION.target,
    limitSigma: RATING_ENGINE_CONFIGURATION.limitSigma,
    balance: RATING_ENGINE_CONFIGURATION.balance,
    kappa: RATING_ENGINE_CONFIGURATION.kappa,
  });

  return [
    [
      { mu: result[0][0].mu, sigma: result[0][0].sigma },
      { mu: result[0][1].mu, sigma: result[0][1].sigma },
    ],
    [
      { mu: result[1][0].mu, sigma: result[1][0].sigma },
      { mu: result[1][1].mu, sigma: result[1][1].sigma },
    ],
  ];
};
