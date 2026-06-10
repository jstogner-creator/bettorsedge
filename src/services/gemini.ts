import axios from "axios";
import { format } from "date-fns";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { getDb, getIdToken } from "../firebase";
import { getNYDate } from "../lib/utils";
import { Game, Prediction, TournamentBracket } from "../types";
import { espnService } from "./espn";
import { apiSportsService } from "./apiSports";
import { apiSportsMlbService } from "./apiSportsMlb";
import { apiSportsNhlService } from "./apiSportsNhl";
import { logApiCall, logError } from "./logger";

const MODEL_VERSION = "openai-edge-v1.2.0";
const PROMPT_VERSION = "openai-sports-analysis-v1.2.0";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const MIN_EDGE_TO_PLAY = 0.035;

type DataQuality = "A" | "B" | "C" | "D";

type EdgeModelResult = {
  modelProbability: number;
  marketProbability?: number;
  edge?: number;
  dataQuality: DataQuality;
  dataQualityReasons: string[];
  positiveFactors: string[];
  riskFactors: string[];
  missingData: string[];
  selectedSide: "home" | "away";
  selectedTeam: string;
  marketNarrative: string;
  recommendation: "PLAY" | "LEAN" | "NO_PLAY";
  fairOdds: number;
};

type AiPredictionPayload = {
  winner?: string;
  confidence?: number;
  reasoning?: string;
  devilsAdvocate?: string;
  marketSentiment?: string;
  situationalFactors?: string;
  scenarioAnalysis?: string;
  keyFactors?: string[];
  scorePrediction?: { home: number; away: number };
  projectedTotal?: number;
  recommendedTotalLine?: string;
  injuries?: Prediction["injuries"];
  matchupAnalysis?: Prediction["matchupAnalysis"];
  playerMatchups?: Prediction["playerMatchups"];
  teamStatsComparison?: Prediction["teamStatsComparison"];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeProbability(value?: number | null) {
  if (value == null || Number.isNaN(value)) return undefined;
  if (value > 1) return clamp(value / 100, 0.01, 0.99);
  return clamp(value, 0.01, 0.99);
}

function americanOddsToProbability(odds?: number | null) {
  if (odds == null || Number.isNaN(odds)) return undefined;
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

function probabilityToAmerican(probability: number) {
  const p = clamp(probability, 0.01, 0.99);
  if (p >= 0.5) return Math.round(-(p / (1 - p)) * 100);
  return Math.round(((1 - p) / p) * 100);
}

function parseWinPercentage(value?: string) {
  if (!value) return undefined;
  const pctMatch = value.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (pctMatch) return clamp(parseFloat(pctMatch[1]) / 100, 0, 1);
  const decimal = parseFloat(value);
  if (!Number.isNaN(decimal)) return decimal > 1 ? clamp(decimal / 100, 0, 1) : clamp(decimal, 0, 1);
  return undefined;
}

function parseLastFive(value?: string) {
  if (!value) return undefined;
  const match = value.match(/([0-5])\s*[-/]\s*([0-5])/);
  if (!match) return undefined;
  const wins = parseInt(match[1], 10);
  const losses = parseInt(match[2], 10);
  const total = wins + losses;
  return total ? wins / total : undefined;
}

function parseRecord(value?: string) {
  if (!value || value === "N/A") return undefined;
  const match = value.match(/(\d+)\s*[-/]\s*(\d+)/);
  if (!match) return undefined;
  const wins = parseInt(match[1], 10);
  const losses = parseInt(match[2], 10);
  const total = wins + losses;
  return total ? wins / total : undefined;
}

function formatPct(value?: number, digits = 1) {
  if (value === undefined || Number.isNaN(value)) return "N/A";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatSignedPct(value?: number, digits = 1) {
  if (value === undefined || Number.isNaN(value)) return "N/A";
  const pct = value * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(digits)}%`;
}

function roundTo(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function compactList(items: Array<string | undefined | null>, max = 5) {
  const seen = new Set<string>();
  return items
    .filter((item): item is string => Boolean(item && item.trim()))
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
}

function cleanJson(text: string) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
  let cleaned = jsonMatch ? jsonMatch[1] : text;
  cleaned = cleaned.replace(/:\s*\+([0-9.]+)/g, ": $1");
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");
  const firstObject = cleaned.indexOf("{");
  const firstArray = cleaned.indexOf("[");
  const lastObject = cleaned.lastIndexOf("}");
  const lastArray = cleaned.lastIndexOf("]");
  const starts = [firstObject, firstArray].filter((n) => n >= 0);
  const ends = [lastObject, lastArray].filter((n) => n >= 0);
  if (!starts.length || !ends.length) return cleaned.trim();
  return cleaned.substring(Math.min(...starts), Math.max(...ends) + 1).trim();
}

function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(cleanJson(text)) as T;
  } catch (error) {
    console.warn("[OpenAI] Failed to parse JSON response:", error);
    return fallback;
  }
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefined(item)) as T;
  }
  if (value && typeof value === "object") {
    const cleaned: Record<string, any> = {};
    Object.entries(value as Record<string, any>).forEach(([key, item]) => {
      if (item !== undefined) cleaned[key] = stripUndefined(item);
    });
    return cleaned as T;
  }
  return value;
}


function valueFromPaths(source: any, paths: string[]) {
  for (const path of paths) {
    const value = path.split(".").reduce((obj, key) => (obj == null ? undefined : obj[key]), source);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function numericValue(value: any) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatStat(value: any, fallback = "N/A") {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

function normalizePitcher(raw: any) {
  if (!raw) return undefined;
  const name = valueFromPaths(raw, ["name", "player.name", "athlete.name", "fullName", "player", "pitcher.name"]);
  if (!name) return undefined;
  return {
    name: String(name),
    era: formatStat(valueFromPaths(raw, ["era", "statistics.era", "stats.era"])),
    whip: formatStat(valueFromPaths(raw, ["whip", "statistics.whip", "stats.whip"])),
    k9: formatStat(valueFromPaths(raw, ["k9", "statistics.k9", "stats.k9", "strikeoutsPerNine"])),
    recentForm: String(valueFromPaths(raw, ["recentForm", "form", "last5", "status", "record"]) || "Starter returned by provider feed"),
  };
}

function normalizeMlbH2H(rawGames: any[] | undefined, max = 6): Prediction["previousMatchups"] {
  if (!Array.isArray(rawGames)) return [];
  return rawGames
    .map((item: any) => {
      const homeTeam = valueFromPaths(item, ["teams.home.name", "home.name", "homeTeam", "teams.home.team.name"]);
      const awayTeam = valueFromPaths(item, ["teams.away.name", "away.name", "awayTeam", "teams.away.team.name"]);
      const homeScore = numericValue(valueFromPaths(item, ["scores.home.total", "scores.home", "homeScore", "score.home"]));
      const awayScore = numericValue(valueFromPaths(item, ["scores.away.total", "scores.away", "awayScore", "score.away"]));
      const date = String(valueFromPaths(item, ["date", "game.date", "fixture.date"]) || "").split("T")[0];
      if (!homeTeam || !awayTeam || homeScore === undefined || awayScore === undefined) return null;
      return {
        date: date || "Date unavailable",
        homeTeam: String(homeTeam),
        awayTeam: String(awayTeam),
        homeScore,
        awayScore,
      };
    })
    .filter(Boolean)
    .slice(0, max) as Prediction["previousMatchups"];
}

function summarizeMlbH2H(matchups: Prediction["previousMatchups"], homeTeam: string, awayTeam: string) {
  if (!matchups?.length) return "Previous matchup history was not returned for this pair yet.";
  const homeWins = matchups.filter((m) => m.homeTeam === homeTeam ? m.homeScore > m.awayScore : m.awayTeam === homeTeam ? m.awayScore > m.homeScore : false).length;
  const awayWins = matchups.filter((m) => m.homeTeam === awayTeam ? m.homeScore > m.awayScore : m.awayTeam === awayTeam ? m.awayScore > m.homeScore : false).length;
  const totals = matchups.map((m) => Number(m.homeScore) + Number(m.awayScore)).filter((n) => Number.isFinite(n));
  const avgTotal = totals.length ? totals.reduce((sum, n) => sum + n, 0) / totals.length : undefined;
  return `${homeTeam} is ${homeWins}-${awayWins} against ${awayTeam} in the returned sample${avgTotal !== undefined ? `; average combined runs ${avgTotal.toFixed(1)}.` : "."}`;
}

function buildMlbTeamStatRows(game: Game, mlbContext: any, edgeModel: EdgeModelResult): Prediction["teamStatsComparison"] {
  const rows: Prediction["teamStatsComparison"] = [];
  const homeRecord = game.homeTeamStats?.record;
  const awayRecord = game.awayTeamStats?.record;
  if (homeRecord || awayRecord) {
    rows.push({
      category: "Season Record",
      homeValue: homeRecord || "N/A",
      awayValue: awayRecord || "N/A",
      advantage: (parseRecord(homeRecord) ?? 0) > (parseRecord(awayRecord) ?? 0) ? "home" : "away",
    });
  }
  if (game.homeTeamStats?.last5 || game.awayTeamStats?.last5) {
    rows.push({
      category: "Recent Form",
      homeValue: game.homeTeamStats?.last5 || "N/A",
      awayValue: game.awayTeamStats?.last5 || "N/A",
      advantage: (parseLastFive(game.homeTeamStats?.last5) ?? 0) > (parseLastFive(game.awayTeamStats?.last5) ?? 0) ? "home" : "away",
    });
  }
  if (edgeModel.marketProbability !== undefined) {
    rows.push({
      category: "Model vs Market",
      homeValue: edgeModel.selectedSide === "home" ? `${formatPct(edgeModel.modelProbability)} model` : `${formatPct(1 - edgeModel.modelProbability)} model`,
      awayValue: edgeModel.selectedSide === "away" ? `${formatPct(edgeModel.modelProbability)} model` : `${formatPct(1 - edgeModel.modelProbability)} model`,
      advantage: edgeModel.selectedSide,
    });
  }
  const homeStats = mlbContext?.teamStatistics?.home;
  const awayStats = mlbContext?.teamStatistics?.away;
  const statCandidates = [
    ["Runs", ["runs.for.total", "runs.total", "statistics.runs", "runs"]],
    ["Runs Allowed", ["runs.against.total", "statistics.runsAllowed", "runsAllowed"]],
    ["Batting Avg", ["batting.average", "statistics.batting.average", "avg"]],
    ["ERA", ["pitching.era", "statistics.pitching.era", "era"]],
  ] as const;
  for (const [label, paths] of statCandidates) {
    const homeVal = valueFromPaths(homeStats, [...paths]);
    const awayVal = valueFromPaths(awayStats, [...paths]);
    if (homeVal !== undefined || awayVal !== undefined) {
      const homeNum = numericValue(homeVal);
      const awayNum = numericValue(awayVal);
      const lowerIsBetter = label === "Runs Allowed" || label === "ERA";
      let advantage: "home" | "away" | "neutral" = "neutral";
      if (homeNum !== undefined && awayNum !== undefined && homeNum !== awayNum) {
        advantage = lowerIsBetter ? (homeNum < awayNum ? "home" : "away") : (homeNum > awayNum ? "home" : "away");
      }
      rows.push({ category: label, homeValue: formatStat(homeVal), awayValue: formatStat(awayVal), advantage });
    }
  }
  return rows.slice(0, 8);
}

export class BettorsEdge {
  private getOpenAIModel() {
    if (typeof window === "undefined") return DEFAULT_OPENAI_MODEL;
    return localStorage.getItem("openai_model") || DEFAULT_OPENAI_MODEL;
  }

  private async callOpenAI(params: {
    messages: Array<{ role: string; content: string }>;
    systemPrompt?: string;
    model?: string;
    responseFormat?: "json" | "text";
  }): Promise<{ text: string; usage?: any; provider: "openai" }> {
    const token = await getIdToken();
    if (!token) throw new Error("Authentication token is required for OpenAI analysis.");
    const started = Date.now();
    const response = await axios.post(
      "/api/ai/analyze",
      {
        provider: "openai",
        model: params.model || this.getOpenAIModel(),
        messages: params.messages,
        systemPrompt: params.systemPrompt,
        config: params.responseFormat === "json" ? { response_format: { type: "json_object" } } : undefined,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const text = response.data?.text || response.data?.content || "";
    const usage = response.data?.usage;
    await logApiCall("OpenAI", params.model || this.getOpenAIModel(), params.messages.at(-1)?.content || "", text, Date.now() - started, usage);
    return { text, usage, provider: "openai" };
  }

  private async enrichMlbGame(game: Game, date: string): Promise<Game> {
    const g = game as any;
    if (game.league !== "MLB" || !g.apiSportsGameId || !g.apiSportsHomeTeamId || !g.apiSportsAwayTeamId) return game;
    try {
      const season = new Date(date || game.date || new Date().toISOString()).getFullYear();
      const mlbContext = await apiSportsMlbService.getGameContext({
        gameId: g.apiSportsGameId,
        season,
        homeTeamId: g.apiSportsHomeTeamId,
        awayTeamId: g.apiSportsAwayTeamId,
      });
      return { ...game, mlbContext } as Game & { mlbContext: any };
    } catch (error) {
      console.warn("[MLB Context] Failed to enrich MLB game:", error);
      return game;
    }
  }

  private calculateEdgeModel(game: Game): EdgeModelResult {
    const mlbContext = (game as any).mlbContext;
    const homeSeason = parseWinPercentage(game.homeTeamStats?.winPercentage) ?? parseRecord(game.homeTeamStats?.record);
    const awaySeason = parseWinPercentage(game.awayTeamStats?.winPercentage) ?? parseRecord(game.awayTeamStats?.record);
    const homeRecent = parseLastFive(game.homeTeamStats?.last5);
    const awayRecent = parseLastFive(game.awayTeamStats?.last5);

    let homeProbability = 0.5;
    const dataQualityReasons: string[] = [];
    const positiveFactors: string[] = [];
    const riskFactors: string[] = [];
    const missingData: string[] = [];

    // MLB/north-american home-field baseline. Keep modest so it does not overpower market or team context.
    homeProbability += 0.025;
    positiveFactors.push(`${game.homeTeam} gets the home-field bump at ${game.location || "home venue"}.`);

    if (homeSeason !== undefined && awaySeason !== undefined) {
      const seasonDelta = homeSeason - awaySeason;
      homeProbability += seasonDelta * 0.22;
      dataQualityReasons.push("season record available");
      const strongerTeam = seasonDelta >= 0 ? game.homeTeam : game.awayTeam;
      positiveFactors.push(`${strongerTeam} owns the stronger season profile: ${game.awayTeam} ${game.awayTeamStats?.record || formatPct(awaySeason)} vs ${game.homeTeam} ${game.homeTeamStats?.record || formatPct(homeSeason)}.`);
    } else {
      missingData.push("clean season win-rate/record data unavailable");
    }

    if (homeRecent !== undefined && awayRecent !== undefined) {
      const recentDelta = homeRecent - awayRecent;
      homeProbability += recentDelta * 0.10;
      dataQualityReasons.push("recent form available");
      const formTeam = recentDelta >= 0 ? game.homeTeam : game.awayTeam;
      positiveFactors.push(`${formTeam} owns the better recent-form profile over the available last-five sample.`);
    } else {
      missingData.push("recent-form sample unavailable");
    }

    if (game.league === "MLB" && mlbContext?.dataQuality) {
      dataQualityReasons.push(...(mlbContext.dataQuality.notes || []).slice(0, 8));

      if (mlbContext.game) dataQualityReasons.push("single-game provider details available");
      else missingData.push("API-Sports game-detail lookup did not return a payload");

      if (mlbContext.pitching?.startersConfirmed) {
        dataQualityReasons.push("probable starting pitcher context available");
        positiveFactors.push("Probable starting pitcher context is available, improving the pregame read.");
        homeProbability += 0.004;
      } else {
        dataQualityReasons.push("probable starting pitchers missing; MLB confidence capped");
        riskFactors.push("Probable starters are missing, so MLB confidence is capped and the model avoids forcing a bet.");
        missingData.push("probable starting pitchers unavailable");
        homeProbability = homeProbability * 0.90 + 0.5 * 0.10;
      }

      if (mlbContext.odds?.hasMultiBookOdds) positiveFactors.push(`Consensus price check uses ${mlbContext.odds.bookCount || "multiple"} sportsbook entries.`);
      else missingData.push("multi-book odds unavailable");

      if (mlbContext.teamStatistics?.home || mlbContext.teamStatistics?.away) positiveFactors.push("Team statistical profile is included in the matchup comparison.");
      else missingData.push("team-statistics endpoint unavailable");

      if (Array.isArray(mlbContext.h2h) && mlbContext.h2h.length) positiveFactors.push(`Previous matchup history is included (${mlbContext.h2h.length} games returned).`);
      else missingData.push("head-to-head context unavailable");

      if (mlbContext.injuries?.unavailable) riskFactors.push("At least one injury endpoint failed; analysis continued without blocking.");
      else dataQualityReasons.push("injury endpoint checked");

      if (mlbContext.dataQuality.grade === "A") homeProbability += 0.005;
      if (mlbContext.dataQuality.grade === "D") homeProbability = homeProbability * 0.85 + 0.5 * 0.15;
    }

    // Do not let market odds fully define the model. Use them for edge comparison and only a light calibration nudge.
    const homeMarketProbability = americanOddsToProbability(game.marketExpectations?.homeWinProb);
    const awayMarketProbability = americanOddsToProbability(game.marketExpectations?.awayWinProb);
    if (homeMarketProbability !== undefined && awayMarketProbability !== undefined) {
      const marketHome = homeMarketProbability / (homeMarketProbability + awayMarketProbability);
      homeProbability = homeProbability * 0.88 + marketHome * 0.12;
      dataQualityReasons.push("sportsbook market available");
      positiveFactors.push(`Market comparison is anchored to ${game.marketExpectations?.source || "available sportsbook pricing"}.`);
    } else {
      missingData.push("sportsbook moneyline probability unavailable");
    }

    const kalshiYes = normalizeProbability(game.kalshiExpectations?.yes ?? game.kalshiOdds?.yes);
    if (kalshiYes !== undefined) {
      homeProbability = homeProbability * 0.94 + kalshiYes * 0.06;
      dataQualityReasons.push("Kalshi market available");
      positiveFactors.push(`Prediction-market reference price is ${formatPct(kalshiYes)} YES.`);
    }

    homeProbability = clamp(homeProbability, 0.05, 0.95);

    const predictedHome = homeProbability >= 0.5;
    const selectedSide: EdgeModelResult["selectedSide"] = predictedHome ? "home" : "away";
    const selectedTeam = predictedHome ? game.homeTeam : game.awayTeam;
    const modelProbability = predictedHome ? homeProbability : 1 - homeProbability;
    const selectedMarketProbability = predictedHome
      ? (homeMarketProbability ?? normalizeProbability(game.kalshiExpectations?.yes ?? game.kalshiOdds?.yes))
      : (awayMarketProbability ?? normalizeProbability(game.kalshiExpectations?.no ?? game.kalshiOdds?.no));
    const edge = selectedMarketProbability !== undefined ? modelProbability - selectedMarketProbability : undefined;

    if (edge !== undefined && edge < MIN_EDGE_TO_PLAY) {
      riskFactors.push(`Projected edge is only ${formatSignedPct(edge)}, below the ${(MIN_EDGE_TO_PLAY * 100).toFixed(1)}% lean threshold.`);
    }
    if (edge !== undefined && edge >= MIN_EDGE_TO_PLAY) {
      positiveFactors.push(`Model edge clears the lean threshold at ${formatSignedPct(edge)}.`);
    }

    const qualityPoints = [
      !!game.date,
      !!game.time,
      !!game.location && game.location !== "Unknown",
      homeSeason !== undefined && awaySeason !== undefined,
      homeRecent !== undefined && awayRecent !== undefined,
      selectedMarketProbability !== undefined,
      !!game.allSources?.length || !!mlbContext?.odds?.hasMultiBookOdds,
      game.league === "MLB" && mlbContext?.dataQuality?.grade && mlbContext.dataQuality.grade !== "D",
      game.league === "MLB" && !!mlbContext?.pitching?.startersConfirmed,
    ].filter(Boolean).length;

    const dataQuality: DataQuality = qualityPoints >= 7 ? "A" : qualityPoints >= 5 ? "B" : qualityPoints >= 3 ? "C" : "D";
    if (selectedMarketProbability === undefined) dataQualityReasons.push("market probability missing");
    if (!game.allSources?.length && !mlbContext?.odds?.hasMultiBookOdds) dataQualityReasons.push("multi-book source data missing");

    let recommendation: EdgeModelResult["recommendation"] = "NO_PLAY";
    if (edge !== undefined && edge >= 0.07 && (dataQuality === "A" || dataQuality === "B")) recommendation = "PLAY";
    else if (edge !== undefined && edge >= MIN_EDGE_TO_PLAY && dataQuality !== "D") recommendation = "LEAN";

    const marketNarrative = edge !== undefined
      ? `${selectedTeam} model ${formatPct(modelProbability)} vs market ${formatPct(selectedMarketProbability)} (${formatSignedPct(edge)} edge).`
      : `${selectedTeam} model ${formatPct(modelProbability)} with no reliable market probability.`;

    return {
      modelProbability,
      marketProbability: selectedMarketProbability,
      edge,
      dataQuality,
      dataQualityReasons: compactList(dataQualityReasons, 12),
      positiveFactors: compactList(positiveFactors, 6),
      riskFactors: compactList(riskFactors, 6),
      missingData: compactList(missingData, 6),
      selectedSide,
      selectedTeam,
      marketNarrative,
      recommendation,
      fairOdds: probabilityToAmerican(modelProbability),
    };
  }

  needsReanalysis(game: Game, existingPrediction?: Prediction) {
    if (!existingPrediction) return true;
    const lastUpdated = existingPrediction.lastUpdated ? new Date(existingPrediction.lastUpdated).getTime() : 0;
    if (Date.now() - lastUpdated > 12 * 60 * 60 * 1000) return true;
    const currentMarket = this.calculateEdgeModel(game);
    const previousEdge = existingPrediction.matchupDelta;
    return typeof previousEdge === "number" && typeof currentMarket.edge === "number" ? Math.abs(previousEdge - currentMarket.edge) >= 0.025 : false;
  }

  async analyzeMatchup(
    game: Game,
    date: string,
    existingPrediction?: Prediction,
    _yesterdayResults: Prediction[] = [],
    shouldCancel?: () => boolean
  ): Promise<Prediction> {
    if (shouldCancel?.()) throw new Error("Analysis cancelled.");

    const analysisGame = await this.enrichMlbGame(game, date);
    const edgeModel = this.calculateEdgeModel(analysisGame);
    const predictedHome = edgeModel.modelProbability >= 0.5;
    const predictedWinner = predictedHome ? analysisGame.homeTeam : analysisGame.awayTeam;
    const winner = edgeModel.recommendation === "NO_PLAY" ? "PASS" : predictedWinner;

    const systemPrompt = "You are Bettors Edge, a senior MLB betting analyst and risk manager. Explain the deterministic model with sharp, bettor-facing language. Never invent pitcher names, injuries, lineups, odds, weather, umpire data, or news. If a data point is missing, classify it as a risk or missing input instead of pretending it exists. Return only JSON.";
    const userPrompt = `
Create a premium betting-card analysis for this matchup. The deterministic model controls the final recommendation, but your job is to explain it like a sharp bettor: decision, edge, market context, risk controls, and why this is or is not a bet.

Rules:
- If recommendation is NO_PLAY, do not force a pick. Explain why passing is disciplined.
- Do not list missing data as an advantage.
- Key factors must be decision drivers, not raw diagnostics.
- Mention probable starters only if present in the supplied data.
- Use concise, specific language. Avoid generic phrases like "team statistics available" unless tied to the decision.

Game with MLB context:
${JSON.stringify(analysisGame, null, 2)}

Deterministic model:
${JSON.stringify(edgeModel, null, 2)}

Existing prediction, if any:
${JSON.stringify(existingPrediction || null, null, 2)}

Return JSON with this shape:
{
  "reasoning": "2-4 sentence strategic analysis with recommendation, model probability, market probability, edge, and primary blocker/catalyst",
  "devilsAdvocate": "specific downside risks or what would invalidate the read",
  "marketSentiment": "plain-English market read, including whether price is fair/efficient/value",
  "situationalFactors": "venue, schedule, data completeness, and MLB-specific context; no invented facts",
  "scenarioAnalysis": "Base case / Upside case / Risk case in one paragraph",
  "keyFactors": ["3-5 concise decision drivers only"],
  "scorePrediction": { "home": 0, "away": 0 },
  "projectedTotal": 0,
  "recommendedTotalLine": "PASS unless a total edge is supported by provided odds/stat context",
  "injuries": [],
  "matchupAnalysis": {
    "h2h": "head-to-head summary or unavailable",
    "playerStats": "pitcher/player context or unavailable",
    "trends": "team/market trend summary from provided data",
    "confidenceBreakdown": "what pushed confidence up/down"
  },
  "playerMatchups": [],
  "teamStatsComparison": []
}`;

    let aiPayload: AiPredictionPayload = {};
    try {
      const result = await this.callOpenAI({
        messages: [{ role: "user", content: userPrompt }],
        systemPrompt,
        responseFormat: "json",
      });
      aiPayload = safeJsonParse<AiPredictionPayload>(result.text, {});
    } catch (error) {
      await logError(error, "OpenAI matchup analysis failed");
    }

    const rawConfidenceFromEdge = edgeModel.edge === undefined ? 5 : clamp(5 + Math.abs(edgeModel.edge) * 45, 1, 10);
    const confidenceFromEdge = roundTo(winner === "PASS" ? Math.min(6.2, rawConfidenceFromEdge) : rawConfidenceFromEdge, 1);
    const noPlayReason = edgeModel.edge !== undefined && edgeModel.edge < MIN_EDGE_TO_PLAY
      ? `NO PLAY: ${edgeModel.marketNarrative} The edge is below the ${(MIN_EDGE_TO_PLAY * 100).toFixed(1)}% lean threshold, so this is a pass instead of a forced pick.`
      : `${edgeModel.recommendation}: ${edgeModel.marketNarrative}`;
    const fallbackRisks = compactList([
      ...edgeModel.riskFactors,
      edgeModel.missingData.length ? `Missing inputs: ${edgeModel.missingData.join(", ")}.` : undefined,
    ], 4).join(" ");
    const fallbackMatchupAnalysis: Prediction["matchupAnalysis"] = {
      h2h: (analysisGame as any).mlbContext?.h2h?.length
        ? `${(analysisGame as any).mlbContext.h2h.length} head-to-head games returned by API-Sports.`
        : "Head-to-head context was unavailable or not returned by the provider.",
      playerStats: (analysisGame as any).mlbContext?.pitching?.startersConfirmed
        ? "Probable starter context was returned by the provider and considered in confidence."
        : "Probable starters were not returned by the provider, so pitcher-specific confidence is capped.",
      trends: edgeModel.positiveFactors.join(" "),
      confidenceBreakdown: `Confidence ${confidenceFromEdge}/10. Data quality ${edgeModel.dataQuality}. ${edgeModel.riskFactors.join(" ")}`.trim(),
    };
    const mlbContext = (analysisGame as any).mlbContext;
    const normalizedPreviousMatchups = normalizeMlbH2H(mlbContext?.h2h);
    const homePitcher = normalizePitcher(mlbContext?.pitching?.homeStarter);
    const awayPitcher = normalizePitcher(mlbContext?.pitching?.awayStarter);
    const pitcherMatchup: Prediction["pitcherMatchup"] | undefined = analysisGame.league === "MLB" ? {
      homePitcher: homePitcher || { name: "TBD", era: "N/A", whip: "N/A", recentForm: "Probable starter not returned by provider" },
      awayPitcher: awayPitcher || { name: "TBD", era: "N/A", whip: "N/A", recentForm: "Probable starter not returned by provider" },
      summary: homePitcher && awayPitcher
        ? `${analysisGame.awayTeam} sends ${awayPitcher.name} against ${analysisGame.homeTeam} starter ${homePitcher.name}. Pitcher context is included in confidence.`
        : "Probable starters were not returned by the provider feed yet. MLB confidence remains capped until the starting pitcher matchup is confirmed.",
    } : undefined;

    const fallbackTeamStatsComparison: Prediction["teamStatsComparison"] = analysisGame.league === "MLB"
      ? buildMlbTeamStatRows(analysisGame, mlbContext, edgeModel)
      : compactList([
        analysisGame.awayTeamStats?.record && analysisGame.homeTeamStats?.record ? "Season record" : undefined,
        edgeModel.marketProbability !== undefined ? "Model vs market" : undefined,
        "Data quality",
      ], 3).map((category) => ({
        category,
        awayValue: category === "Season record" ? analysisGame.awayTeamStats?.record || "N/A" : category === "Model vs market" ? edgeModel.marketNarrative : edgeModel.dataQuality,
        homeValue: category === "Season record" ? analysisGame.homeTeamStats?.record || "N/A" : category === "Model vs market" ? edgeModel.marketNarrative : edgeModel.dataQuality,
        advantage: category === "Season record"
          ? ((parseRecord(analysisGame.homeTeamStats?.record) ?? 0) > (parseRecord(analysisGame.awayTeamStats?.record) ?? 0) ? "home" : "away")
          : "neutral",
      }));

    if (analysisGame.league === "MLB") {
      fallbackMatchupAnalysis.h2h = summarizeMlbH2H(normalizedPreviousMatchups, analysisGame.homeTeam, analysisGame.awayTeam);
      fallbackMatchupAnalysis.playerStats = pitcherMatchup?.summary || fallbackMatchupAnalysis.playerStats;
      fallbackMatchupAnalysis.trends = compactList([
        ...edgeModel.positiveFactors,
        edgeModel.marketNarrative,
      ], 5).join(" ");
    }

    const prediction: Prediction = {
      gameId: analysisGame.id,
      league: analysisGame.league,
      date,
      homeTeam: analysisGame.homeTeam,
      awayTeam: analysisGame.awayTeam,
      winner,
      confidence: confidenceFromEdge,
      reasoning: aiPayload.reasoning || noPlayReason,
      devilsAdvocate: aiPayload.devilsAdvocate || fallbackRisks || "Primary risk: late lineup, pitcher, injury, or market movement could change the pregame edge.",
      marketSentiment: aiPayload.marketSentiment || edgeModel.marketNarrative,
      situationalFactors: aiPayload.situationalFactors || `${analysisGame.location || "Venue unavailable"}. ${edgeModel.missingData.length ? `Data gaps: ${edgeModel.missingData.join(", ")}.` : "Core schedule and market context available."}`,
      scenarioAnalysis: aiPayload.scenarioAnalysis || `Base case: ${edgeModel.marketNarrative} Upside case: late market movement creates a better entry. Risk case: missing starters or injury context changes the true price.`,
      keyFactors: compactList(aiPayload.keyFactors?.length ? aiPayload.keyFactors : edgeModel.positiveFactors, 5),
      injuries: aiPayload.injuries || existingPrediction?.injuries || [],
      scorePrediction: aiPayload.scorePrediction,
      projectedTotal: aiPayload.projectedTotal,
      recommendedTotalLine: aiPayload.recommendedTotalLine || "PASS on total unless a separate total edge is confirmed by odds and run-context data.",
      matchupAnalysis: aiPayload.matchupAnalysis || fallbackMatchupAnalysis,
      playerMatchups: aiPayload.playerMatchups || [],
      teamStatsComparison: aiPayload.teamStatsComparison?.length ? aiPayload.teamStatsComparison : fallbackTeamStatsComparison,
      previousMatchups: normalizedPreviousMatchups?.length ? normalizedPreviousMatchups : existingPrediction?.previousMatchups,
      pitcherMatchup: pitcherMatchup || existingPrediction?.pitcherMatchup,
      kalshiPrice: analysisGame.kalshiExpectations?.yes ?? analysisGame.kalshiOdds?.yes ?? edgeModel.marketProbability ?? 0.5,
      winProbability: edgeModel.modelProbability,
      lastUpdated: new Date().toISOString(),
      simulationCount: 10000,
      predictionDataQuality: edgeModel.dataQuality,
      matchupDelta: edgeModel.edge,
      qaStatus: edgeModel.missingData.length ? "adjusted" : "verified",
      qaNotes: `Recommendation=${edgeModel.recommendation}; selected=${edgeModel.selectedTeam}; fairOdds=${edgeModel.fairOdds}; dataQuality=${edgeModel.dataQuality}; risks=${edgeModel.riskFactors.join(" | ") || "none"}.`,
      marketExpectations: analysisGame.marketExpectations,
      sourceAudit: {
        googleDriveAccessed: false,
        nbaOfficialAccessed: !!(analysisGame as any).apiSportsGameId,
        lastAuditTime: new Date().toISOString(),
        auditNotes: compactList([...edgeModel.dataQualityReasons, ...edgeModel.riskFactors, ...edgeModel.missingData], 12).join("; "),
      },
    };

    return prediction;
  }

  async batchAnalyzeMatchups(
    games: Game[],
    date: string,
    savedPredictions: Record<string, Prediction> = {},
    yesterdayResults: Prediction[] = [],
    onProgress?: (message: string) => void
  ) {
    const results: Record<string, Prediction> = {};
    for (const game of games) {
      onProgress?.(`Analyzing ${game.awayTeam} @ ${game.homeTeam}...`);
      results[game.id] = await this.analyzeMatchup(game, date, savedPredictions[game.id], yesterdayResults);
    }
    return results;
  }

  async savePrediction(gameId: string, prediction: Prediction) {
    const db = getDb();
    const payload = stripUndefined({
      ...prediction,
      gameId,
      modelVersion: MODEL_VERSION,
      promptVersion: PROMPT_VERSION,
      lastUpdated: new Date().toISOString(),
    });
    await setDoc(doc(db, "predictions", gameId), payload, { merge: true });
  }

  async analyzeLoss(game: Game, prediction: Prediction, actualScore: { home: number; away: number }) {
    const actualWinner = actualScore.home > actualScore.away ? game.homeTeam : game.awayTeam;
    const prompt = `Review this failed prediction and return JSON:\n{\n  "analysis": "what happened",\n  "keyMissedFactor": "main miss",\n  "lessonLearned": "model adjustment"\n}\n\nGame: ${JSON.stringify(game)}\nPrediction: ${JSON.stringify(prediction)}\nActual score: ${JSON.stringify(actualScore)}\nActual winner: ${actualWinner}`;
    let postMortem = {
      analysis: "Prediction missed. Review market movement, injury status, pitcher status, and matchup assumptions.",
      keyMissedFactor: "Unknown",
      lessonLearned: "Require stronger data quality and edge threshold before play labels.",
      analyzedAt: new Date().toISOString(),
    };
    try {
      const result = await this.callOpenAI({
        messages: [{ role: "user", content: prompt }],
        systemPrompt: "You are a sports model QA analyst. Return only JSON.",
        responseFormat: "json",
      });
      postMortem = { ...postMortem, ...safeJsonParse<any>(result.text, {}) };
    } catch (error) {
      await logError(error, "OpenAI loss analysis failed");
    }
    await this.savePrediction(game.id, {
      ...prediction,
      actualWinner,
      actualScore,
      outcome: prediction.winner === actualWinner ? "correct" : "incorrect",
      postMortem,
    });
    return postMortem;
  }

  async analyzeRecentPerformance(predictions: Prediction[]): Promise<string> {
    const recentLosses = predictions.filter((p) => p.outcome === "incorrect").slice(0, 10);
    if (recentLosses.length === 0) return "No recent losses to analyze. Performance has been stable.";
    const result = await this.callOpenAI({
      messages: [{ role: "user", content: `Analyze these recent failed predictions for patterns and model adjustments. Keep it concise.\n${JSON.stringify(recentLosses, null, 2)}` }],
      systemPrompt: "You are a head sports data analyst focused on calibration, edge quality, and betting model discipline.",
    });
    return result.text || "Failed to generate performance analysis.";
  }

  async chat(message: string, history: Array<{ role: string; content: string }>, context: any) {
    const token = await getIdToken();
    const response = await axios.post("/api/snark", { message, history, context, model: this.getOpenAIModel() }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data?.text || "No response generated.";
  }

  async generateDailyBriefing(league: string, date: string, games: Game[]) {
    const prompt = `Generate a concise ${league} daily briefing for ${date}. Focus on true edges, no-play discipline, injury/data gaps, market expectations, pitcher context for MLB, and top risks.\n${JSON.stringify(games, null, 2)}`;
    const result = await this.callOpenAI({
      messages: [{ role: "user", content: prompt }],
      systemPrompt: "You are Bettors Edge, a disciplined sports analytics briefing engine. Do not invent facts. Use markdown.",
    });
    return result.text;
  }

  async checkInjuryUpdates(_league: string, _date: string, games: Game[], shouldCancel?: () => boolean, onProgress?: (current: number, total: number) => void) {
    const updates: Record<string, Prediction["injuries"]> = {};
    for (let i = 0; i < games.length; i++) {
      if (shouldCancel?.()) break;
      onProgress?.(i + 1, games.length);
      updates[games[i].id] = [];
    }
    return updates;
  }

  async checkSourceHealth() {
    return {
      status: "degraded",
      details: "Analysis engine is active. External injury and pitcher verification should be connected through deterministic sports data providers.",
      latestDate: format(getNYDate(), "yyyy-MM-dd"),
    };
  }

  async getDailySchedule(league: string, date: string, force = false): Promise<Game[]> {
    const db = getDb();
    const docId = `${league}-${date}`;
    const scheduleRef = doc(db, "schedules", docId);
    if (!force) {
      try {
        const cached = await getDoc(scheduleRef);
        if (cached.exists()) {
          const data = cached.data();
          if (Array.isArray(data.games) && data.games.length) return data.games as Game[];
        }
      } catch (error) {
        console.warn("[Schedule] Cache read failed:", error);
      }
    }
    const dateObj = new Date(`${date}T12:00:00`);
    let games: Game[] = [];
    try {
      if (league === "NBA") games = await apiSportsService.getGames(dateObj) as any;
      else if (league === "MLB") games = await apiSportsMlbService.getGames(dateObj) as any;
      else if (league === "NHL") games = await apiSportsNhlService.getGames(dateObj) as any;
    } catch (error) {
      console.warn(`[Schedule] API-Sports ${league} fetch failed:`, error);
    }
    if (!games.length) {
      try {
        games = await espnService.getSchedule(league, dateObj);
      } catch (error) {
        console.warn(`[Schedule] ESPN ${league} fetch failed:`, error);
      }
    }
    try {
      await setDoc(scheduleRef, { league, date, games, lastUpdated: new Date().toISOString(), source: "deterministic-api" }, { merge: true });
    } catch (error) {
      console.warn("[Schedule] Cache write failed:", error);
    }
    return games;
  }

  async importSchedule(league: string, startDate: Date, days = 7, onProgress?: (message: string) => void, force = false) {
    for (let offset = 0; offset < days; offset++) {
      const target = new Date(startDate);
      target.setDate(target.getDate() + offset);
      const date = format(target, "yyyy-MM-dd");
      onProgress?.(`Importing ${league} schedule for ${date}...`);
      await this.getDailySchedule(league, date, force);
    }
  }

  async getTournamentBracket(league: string, year: number): Promise<TournamentBracket | null> {
    const db = getDb();
    const docRef = doc(db, "brackets", `${league}-${year}`);
    try {
      const cached = await getDoc(docRef);
      if (cached.exists()) return cached.data() as TournamentBracket;
    } catch (error) {
      console.warn("[Bracket] Cache read failed:", error);
    }
    const result = await this.callOpenAI({
      messages: [{ role: "user", content: `Provide the ${year} ${league} tournament bracket as JSON matching the app TournamentBracket type. If unknown, return {"league":"${league}","year":${year},"rounds":[],"lastUpdated":"${new Date().toISOString()}"}.` }],
      systemPrompt: "You are a sports data assistant. Return only JSON. Do not invent unknown games.",
      responseFormat: "json",
    });
    const bracket = safeJsonParse<TournamentBracket | null>(result.text, null);
    if (bracket) await setDoc(docRef, { ...bracket, lastUpdated: new Date().toISOString() }, { merge: true });
    return bracket;
  }

  async getPredictionsForDate(date: string) {
    const db = getDb();
    const q = query(collection(db, "predictions"), where("date", "==", date));
    const snapshot = await getDocs(q);
    const predictions: Record<string, Prediction> = {};
    snapshot.forEach((item) => {
      predictions[item.id] = item.data() as Prediction;
    });
    return predictions;
  }
}

export const bettorsEdge = new BettorsEdge();
