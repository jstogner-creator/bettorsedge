import { Game, Prediction } from "../types";

export interface MonteCarloResult {
  iterations: number;
  runtimeMs: number;
  winner: string;
  homeWinProbability: number;
  awayWinProbability: number;
  winProbability: number;
  confidence: number;
  scorePrediction: {
    home: number;
    away: number;
  };
  projectedTotal: number;
  recommendedTotalLine?: string;
  keyFactors: string[];
  confidenceBreakdown: string;
  projectionBasis: string;
}

interface SimulationContext {
  game: Game;
  prediction?: Prediction | null;
  iterations?: number;
}

interface LeagueConfig {
  homeAdvantage: number;
  marginStdDev: number;
  totalStdDev: number;
  minimumScore: number;
  defaultTotal: number;
  totalLineThreshold: number;
}

const DEFAULT_ITERATIONS = 10000;

const LEAGUE_CONFIG: Record<string, LeagueConfig> = {
  NBA: {
    homeAdvantage: 2.6,
    marginStdDev: 11.5,
    totalStdDev: 18,
    minimumScore: 80,
    defaultTotal: 224,
    totalLineThreshold: 3.5,
  },
  MLB: {
    homeAdvantage: 0.28,
    marginStdDev: 3.1,
    totalStdDev: 2.9,
    minimumScore: 0,
    defaultTotal: 8.7,
    totalLineThreshold: 0.55,
  },
  NHL: {
    homeAdvantage: 0.22,
    marginStdDev: 2.2,
    totalStdDev: 1.9,
    minimumScore: 0,
    defaultTotal: 6.1,
    totalLineThreshold: 0.35,
  },
  NFL: {
    homeAdvantage: 1.6,
    marginStdDev: 10.2,
    totalStdDev: 9.5,
    minimumScore: 7,
    defaultTotal: 44,
    totalLineThreshold: 2.5,
  },
  NCAA: {
    homeAdvantage: 3.4,
    marginStdDev: 12.8,
    totalStdDev: 14.5,
    minimumScore: 55,
    defaultTotal: 145,
    totalLineThreshold: 3,
  },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.+-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const parsePercentage = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = parseNumber(value);
  if (parsed === null) return null;
  if (parsed > 1) return parsed / 100;
  return parsed;
};

const parseRecordWinPct = (record?: string): number | null => {
  if (!record) return null;
  const match = String(record).match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!match) return null;
  const wins = Number(match[1]);
  const losses = Number(match[2]);
  const total = wins + losses;
  return total > 0 ? wins / total : null;
};

const parseRecentForm = (value?: string): number => {
  if (!value) return 0;
  const normalized = String(value).trim();
  if (/^[WL](?:-[WL])+/i.test(normalized)) {
    return normalized
      .split("-")
      .reduce((acc, token) => acc + (token.toUpperCase() === "W" ? 1 : token.toUpperCase() === "L" ? -1 : 0), 0);
  }
  const match = normalized.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (match) {
    return Number(match[1]) - Number(match[2]);
  }
  return 0;
};

const americanOddsToProbability = (odds?: number): number | null => {
  const value = parseNumber(odds);
  if (value === null || value === 0) return null;
  if (value > 0) return 100 / (value + 100);
  const abs = Math.abs(value);
  return abs / (abs + 100);
};

const getStatusPenalty = (status?: string): number => {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("out")) return 1.0;
  if (normalized.includes("doubt")) return 0.65;
  if (normalized.includes("question") || normalized.includes("gtd")) return 0.45;
  if (normalized.includes("prob")) return 0.18;
  return 0;
};

const collectWeightedInjuryPenalty = (injuries: Prediction["injuries"] | undefined, team: string, league: string): number => {
  if (!Array.isArray(injuries) || injuries.length === 0) return 0;
  const teamLower = team.toLowerCase();
  const leagueMultiplier = league === "NBA" ? 2.2 : league === "MLB" ? 0.38 : league === "NHL" ? 0.28 : league === "NFL" ? 1.4 : 0.95;

  return injuries.reduce((acc, injury) => {
    if (!injury?.team || !injury.player) return acc;
    const injuryTeam = String(injury.team).toLowerCase();
    if (!teamLower.includes(injuryTeam) && !injuryTeam.includes(teamLower)) return acc;
    return acc + getStatusPenalty(injury.status) * leagueMultiplier;
  }, 0);
};

const gaussian = (): number => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const average = (values: number[]): number => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const getTeamWinPct = (game: Game, side: "home" | "away"): number => {
  const stats = side === "home" ? game.homeTeamStats : game.awayTeamStats;
  return clamp(
    parsePercentage(stats?.winPercentage) ?? parseRecordWinPct(stats?.record) ?? 0.5,
    0.2,
    0.85
  );
};

const getRecentFormBonus = (game: Game, side: "home" | "away"): number => {
  const stats = side === "home" ? game.homeTeamStats : game.awayTeamStats;
  return clamp(parseRecentForm(stats?.last5) * 0.45, -2.25, 2.25);
};

const deriveTeamStatsEdge = (prediction: Prediction | null | undefined, side: "home" | "away", league: string): number => {
  if (!prediction) return 0;

  if (league === "NBA" && prediction.matchupRankings) {
    const homeRank = parseNumber(prediction.matchupRankings.homeRank) ?? 16;
    const awayRank = parseNumber(prediction.matchupRankings.awayRank) ?? 16;
    const homeOff = parseNumber(prediction.matchupRankings.homeOffenseRank) ?? 16;
    const awayOff = parseNumber(prediction.matchupRankings.awayOffenseRank) ?? 16;
    const homeDef = parseNumber(prediction.matchupRankings.homeDefenseRank) ?? 16;
    const awayDef = parseNumber(prediction.matchupRankings.awayDefenseRank) ?? 16;

    const homeComposite = (33 - homeRank) * 0.18 + (33 - homeOff) * 0.12 + (33 - homeDef) * 0.12;
    const awayComposite = (33 - awayRank) * 0.18 + (33 - awayOff) * 0.12 + (33 - awayDef) * 0.12;
    const diff = homeComposite - awayComposite;
    return side === "home" ? diff : -diff;
  }

  if (Array.isArray(prediction.teamStatsComparison) && prediction.teamStatsComparison.length > 0) {
    const diff = prediction.teamStatsComparison.reduce((acc, stat) => {
      if (stat.advantage === "home") return acc + 0.55;
      if (stat.advantage === "away") return acc - 0.55;
      return acc;
    }, 0);
    return side === "home" ? diff : -diff;
  }

  return 0;
};

const deriveMarketLean = (game: Game): { homeProb: number; awayProb: number; total: number } => {
  const homeProb = clamp(
    americanOddsToProbability(game.marketExpectations?.homeWinProb) ??
      (game.kalshiExpectations ? (game.kalshiExpectations.yes > 1 ? game.kalshiExpectations.yes / 100 : game.kalshiExpectations.yes) : 0.5),
    0.05,
    0.95
  );

  const awayProb = clamp(
    americanOddsToProbability(game.marketExpectations?.awayWinProb) ?? (1 - homeProb),
    0.05,
    0.95
  );

  const total = parseNumber(game.marketExpectations?.total) ?? LEAGUE_CONFIG[game.league].defaultTotal;
  return { homeProb, awayProb, total };
};

const buildRecommendedTotalLine = (projectedTotal: number, marketTotal: number, threshold: number): string | undefined => {
  const diff = projectedTotal - marketTotal;
  if (diff >= threshold) return `Over ${marketTotal.toFixed(1)}`;
  if (diff <= -threshold) return `Under ${marketTotal.toFixed(1)}`;
  return undefined;
};

export const runMonteCarloSimulation = ({ game, prediction, iterations = DEFAULT_ITERATIONS }: SimulationContext): MonteCarloResult => {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const config = LEAGUE_CONFIG[game.league] || LEAGUE_CONFIG.NBA;
  const market = deriveMarketLean(game);

  const homeWinPct = getTeamWinPct(game, "home");
  const awayWinPct = getTeamWinPct(game, "away");
  const homeFormBonus = getRecentFormBonus(game, "home");
  const awayFormBonus = getRecentFormBonus(game, "away");
  const homeInjuryPenalty = collectWeightedInjuryPenalty(prediction?.injuries, game.homeTeam, game.league);
  const awayInjuryPenalty = collectWeightedInjuryPenalty(prediction?.injuries, game.awayTeam, game.league);
  const marketHomeEdge = (market.homeProb - market.awayProb) * (game.league === "NBA" ? 13 : game.league === "MLB" ? 2.4 : game.league === "NHL" ? 1.7 : 8.5);
  const statHomeEdge = deriveTeamStatsEdge(prediction, "home", game.league);

  let expectedMargin = config.homeAdvantage + ((homeWinPct - awayWinPct) * 12) + homeFormBonus - awayFormBonus + marketHomeEdge + statHomeEdge - homeInjuryPenalty + awayInjuryPenalty;

  if (prediction?.winner && prediction.winner !== "PASS") {
    const aiLean = prediction.winner === game.homeTeam ? 1 : prediction.winner === game.awayTeam ? -1 : 0;
    expectedMargin += aiLean * Math.max(0.4, (prediction.confidence || 5) * 0.12);
  }

  const projectedTotalBase = clamp(
    (market.total * 0.72) +
      ((prediction?.projectedTotal ?? market.total) * 0.18) +
      ((prediction?.scorePrediction ? prediction.scorePrediction.home + prediction.scorePrediction.away : market.total) * 0.10),
    config.minimumScore * 2,
    config.defaultTotal + (game.league === "NBA" ? 45 : game.league === "MLB" ? 8 : game.league === "NHL" ? 4 : 20)
  );

  const homeScores: number[] = [];
  const awayScores: number[] = [];
  let homeWins = 0;

  for (let i = 0; i < iterations; i += 1) {
    const simulatedMargin = expectedMargin + gaussian() * config.marginStdDev;
    const simulatedTotal = Math.max(config.minimumScore * 2, projectedTotalBase + gaussian() * config.totalStdDev);

    let homeScore = (simulatedTotal + simulatedMargin) / 2 + gaussian() * (game.league === "NBA" ? 2.4 : game.league === "MLB" ? 0.45 : game.league === "NHL" ? 0.35 : 1.35);
    let awayScore = simulatedTotal - homeScore;

    if (game.league === "NBA" || game.league === "NCAA" || game.league === "NFL") {
      homeScore = Math.round(Math.max(config.minimumScore, homeScore));
      awayScore = Math.round(Math.max(config.minimumScore, awayScore));
    } else {
      homeScore = Math.max(0, Math.round(homeScore * 10) / 10);
      awayScore = Math.max(0, Math.round(awayScore * 10) / 10);
    }

    if (homeScore === awayScore) {
      if (Math.random() >= 0.5) homeScore += game.league === "NBA" || game.league === "NCAA" || game.league === "NFL" ? 1 : 0.1;
      else awayScore += game.league === "NBA" || game.league === "NCAA" || game.league === "NFL" ? 1 : 0.1;
    }

    if (homeScore > awayScore) homeWins += 1;
    homeScores.push(homeScore);
    awayScores.push(awayScore);
  }

  const homeWinProbability = clamp(homeWins / iterations, 0.01, 0.99);
  const awayWinProbability = clamp(1 - homeWinProbability, 0.01, 0.99);
  const winner = homeWinProbability >= awayWinProbability ? game.homeTeam : game.awayTeam;
  const winProbability = Math.max(homeWinProbability, awayWinProbability);
  const homeScore = average(homeScores);
  const awayScore = average(awayScores);
  const projectedTotal = homeScore + awayScore;
  const confidence = clamp(
    Math.round(
      4.5 +
        Math.abs(homeWinProbability - 0.5) * 12 +
        Math.min(1.2, Math.abs(expectedMargin) / (game.league === "NBA" ? 7.5 : game.league === "MLB" ? 1.8 : 1.6)) +
        Math.min(0.8, Math.abs(projectedTotalBase - market.total) / 10)
    ),
    1,
    10
  );

  const keyFactors = [
    `${winner} has a ${Math.round(winProbability * 100)}% Monte Carlo win rate over ${iterations.toLocaleString()} simulations.`,
    `Market anchor total ${market.total.toFixed(1)} blended with matchup context produced a projected total of ${projectedTotal.toFixed(1)}.`,
    `Injury penalty check: ${game.homeTeam} ${homeInjuryPenalty.toFixed(2)} vs ${game.awayTeam} ${awayInjuryPenalty.toFixed(2)} weighted impact.`,
  ];

  if (Math.abs(homeFormBonus - awayFormBonus) >= 0.75) {
    keyFactors.push(`Recent form swing favored ${homeFormBonus > awayFormBonus ? game.homeTeam : game.awayTeam}.`);
  }

  if (Math.abs(statHomeEdge) >= 0.8) {
    keyFactors.push(`Structured stat comparison leaned ${statHomeEdge > 0 ? game.homeTeam : game.awayTeam} before variance was added.`);
  }

  const finishedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

  return {
    iterations,
    runtimeMs: Math.round(finishedAt - startedAt),
    winner,
    homeWinProbability,
    awayWinProbability,
    winProbability,
    confidence,
    scorePrediction: {
      home: game.league === "NBA" || game.league === "NCAA" || game.league === "NFL" ? Math.round(homeScore) : Number(homeScore.toFixed(1)),
      away: game.league === "NBA" || game.league === "NCAA" || game.league === "NFL" ? Math.round(awayScore) : Number(awayScore.toFixed(1)),
    },
    projectedTotal: Number(projectedTotal.toFixed(1)),
    recommendedTotalLine: buildRecommendedTotalLine(projectedTotal, market.total, config.totalLineThreshold),
    keyFactors,
    confidenceBreakdown: `Monte Carlo engine split ${Math.round(homeWinProbability * 100)}% ${game.homeTeam} / ${Math.round(awayWinProbability * 100)}% ${game.awayTeam} over ${iterations.toLocaleString()} trials.`,
    projectionBasis: `10k Monte Carlo engine blended market expectations, team form, available stat edges, and weighted injuries in ${Math.round(finishedAt - startedAt)}ms.`,
  };
};
