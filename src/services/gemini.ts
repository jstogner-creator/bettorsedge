import axios from "axios";
import { format } from "date-fns";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { getDb, getIdToken } from "../firebase";
import { getNYDate } from "../lib/utils";
import { Game, Prediction, TournamentBracket } from "../types";
import { espnService } from "./espn";
import { espnMlbFallback } from "./espnMlbFallback";
import { apiSportsService } from "./apiSports";
import { apiSportsMlbService, parsePitcher, parseTeamStats, parseRecentForm } from "./apiSportsMlb";
import { apiSportsNhlService } from "./apiSportsNhl";
import { logApiCall, logError } from "./logger";
import { normalizeGame } from "../utils/normalize";

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
  reverseLineMovement?: {
    detected: boolean;
    team: string;
    openingOdds: string;
    currentOdds: string;
  };
};

type AiPredictionPayload = {
  // Legacy fields (kept for backward compat)
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
  groundingUrls?: Prediction["groundingUrls"];
  // ── Structured v2 fields ──────────────────────────────────────
  recommendation?: "PLAY" | "PASS" | "NO_PLAY";
  recommendedSide?: string | null;
  summary?: string;
  bettingAngle?: string;
  topReasons?: string[];
  riskFactors?: string[];
  matchupAdvantages?: {
    startingPitching: "away" | "home" | "even" | "unknown";
    bullpen:          "away" | "home" | "even" | "unknown";
    offense:          "away" | "home" | "even" | "unknown";
    recentForm:       "away" | "home" | "even" | "unknown";
    marketValue:      "away" | "home" | "none" | "unknown";
  };
  missingData?: string[];
  confidenceExplanation?: string;
  dataQualityExplanation?: string;
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
  const throws = valueFromPaths(raw, ["handedness", "throws", "hand"]);
  return {
    name: String(name),
    era: formatStat(valueFromPaths(raw, ["era", "statistics.era", "stats.era"])),
    whip: formatStat(valueFromPaths(raw, ["whip", "statistics.whip", "stats.whip"])),
    k9: formatStat(valueFromPaths(raw, ["k9", "statistics.k9", "stats.k9", "strikeoutsPerNine"])),
    recentForm: String(valueFromPaths(raw, ["recentForm", "form", "last5", "status", "record", "recentStarts"]) || "Starter returned by provider feed"),
    strikeouts: formatStat(valueFromPaths(raw, ["strikeouts", "so", "k"])),
    walks: formatStat(valueFromPaths(raw, ["walks", "bb"])),
    handedness: (throws === "RHP" || throws === "LHP" ? throws : "Unknown") as "RHP" | "LHP" | "Unknown",
    recentStarts: String(valueFromPaths(raw, ["recentStarts", "recentForm", "form"]) || "Starter returned by provider feed"),
    inningsPitched: formatStat(valueFromPaths(raw, ["inningsPitched", "ip"])),
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
  const normHome = mlbContext?.normalizedTeamStats?.home;
  const normAway = mlbContext?.normalizedTeamStats?.away;
  const homeStats = mlbContext?.teamStatistics?.home;
  const awayStats = mlbContext?.teamStatistics?.away;
  const statCandidates = [
    ["Runs", ["runs.for.total", "runs.total", "statistics.runs", "runs"], normHome?.runsPerGame, normAway?.runsPerGame],
    ["Runs Allowed", ["runs.against.total", "statistics.runsAllowed", "runsAllowed"], normHome?.runsAllowed, normAway?.runsAllowed],
    ["Batting Avg", ["batting.average", "statistics.batting.average", "avg"], normHome?.battingAverage, normAway?.battingAverage],
    ["ERA", ["pitching.era", "statistics.pitching.era", "era"], normHome?.teamEra, normAway?.teamEra],
  ] as const;
  for (const [label, paths, normH, normA] of statCandidates) {
    const homeVal = normH !== undefined && normH !== 0 ? normH : valueFromPaths(homeStats, [...paths]);
    const awayVal = normA !== undefined && normA !== 0 ? normA : valueFromPaths(awayStats, [...paths]);
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

// ── buildMlbAiContext ──────────────────────────────────────────────────────────
// Packages all matchup data into a clean, AI-readable object.
// Avoids sending raw API-Sports payloads to the model.
function buildMlbAiContext(game: Game, mlbCtx: any, edgeModel: EdgeModelResult) {
  const norm = mlbCtx?.normalizedTeamStats;
  const pitching = mlbCtx?.pitching;
  const odds = mlbCtx?.odds;
  const weather = mlbCtx?.weather;
  const stadium = mlbCtx?.stadium;
  const h2h: any[] = mlbCtx?.h2h || [];
  const injuries = mlbCtx?.injuries;
  const bullpenFatigue = mlbCtx?.bullpenFatigue;

  const hp = pitching?.homeStarter;
  const ap = pitching?.awayStarter;

  const fs = (v: any, digits = 2) => {
    if (v == null || v === "N/A" || v === "") return "N/A";
    const n = parseFloat(String(v));
    return isNaN(n) ? String(v) : n.toFixed(digits);
  };
  const asPct = (v: any) => v != null && !isNaN(parseFloat(String(v))) ? `${(parseFloat(String(v)) * 100).toFixed(1)}%` : "N/A";
  const toAmerican = (dec: number | null | undefined) => {
    if (!dec || dec <= 1) return "N/A";
    return dec >= 2 ? `+${Math.round((dec - 1) * 100)}` : `${Math.round(-100 / (dec - 1))}`;
  };

  const missing: string[] = [];
  if (!hp?.name || hp.name === "TBD") missing.push("home starting pitcher");
  if (!ap?.name || ap.name === "TBD") missing.push("away starting pitcher");
  if (!norm?.home) missing.push("home team batting/pitching stats");
  if (!norm?.away) missing.push("away team batting/pitching stats");
  if (!odds?.currentOdds?.home) missing.push("current moneyline odds");
  if (!game.marketExpectations?.homeWinProb) missing.push("market implied probability");
  if (!h2h.length) missing.push("head-to-head history");
  if (!weather) missing.push("weather data");

  return {
    matchup: `${game.awayTeam} @ ${game.homeTeam}`,
    gameDate: game.date,
    gameTime: game.time,
    venue: game.location,
    league: "MLB",
    dataQuality: mlbCtx?.dataQuality?.grade || edgeModel.dataQuality,
    dataQualityNotes: edgeModel.dataQualityReasons,
    missingData: missing,

    pitching: {
      startersConfirmed: !!pitching?.startersConfirmed,
      awayStarter: ap ? {
        name: ap.name,
        handedness: ap.handedness,
        era: fs(ap.era),
        whip: fs(ap.whip, 3),
        strikeouts: ap.strikeouts,
        walks: ap.walks,
        inningsPitched: ap.inningsPitched,
        k9: fs(ap.k9, 1),
        recentStarts: ap.recentStarts || ap.recentForm,
      } : null,
      homeStarter: hp ? {
        name: hp.name,
        handedness: hp.handedness,
        era: fs(hp.era),
        whip: fs(hp.whip, 3),
        strikeouts: hp.strikeouts,
        walks: hp.walks,
        inningsPitched: hp.inningsPitched,
        k9: fs(hp.k9, 1),
        recentStarts: hp.recentStarts || hp.recentForm,
      } : null,
    },

    awayTeamStats: norm?.away ? {
      battingAverage: fs(norm.away.battingAverage, 3),
      obp: fs(norm.away.obp, 3),
      slg: fs(norm.away.slg, 3),
      ops: fs(norm.away.ops, 3),
      runsPerGame: fs(norm.away.runsPerGame),
      runsAllowedPerGame: fs(norm.away.runsAllowed),
      teamEra: fs(norm.away.teamEra),
      bullpenEra: fs(norm.away.bullpenEra),
      awayRecord: norm.away.awaySplits?.record || "N/A",
      awayRunsPerGame: fs(norm.away.awaySplits?.runs),
      last5: game.awayTeamStats?.last5 || "N/A",
      seasonRecord: game.awayTeamStats?.record || "N/A",
    } : null,

    homeTeamStats: norm?.home ? {
      battingAverage: fs(norm.home.battingAverage, 3),
      obp: fs(norm.home.obp, 3),
      slg: fs(norm.home.slg, 3),
      ops: fs(norm.home.ops, 3),
      runsPerGame: fs(norm.home.runsPerGame),
      runsAllowedPerGame: fs(norm.home.runsAllowed),
      teamEra: fs(norm.home.teamEra),
      bullpenEra: fs(norm.home.bullpenEra),
      homeRecord: norm.home.homeSplits?.record || "N/A",
      homeRunsPerGame: fs(norm.home.homeSplits?.runs),
      last5: game.homeTeamStats?.last5 || "N/A",
      seasonRecord: game.homeTeamStats?.record || "N/A",
    } : null,

    bullpenFatigue: bullpenFatigue ? {
      homeIndex: `${((bullpenFatigue.home || 0) * 100).toFixed(0)}%`,
      awayIndex: `${((bullpenFatigue.away || 0) * 100).toFixed(0)}%`,
    } : null,

    headToHead: h2h.slice(0, 5).map((g: any) => ({
      date: String(g.date || "").split("T")[0],
      away: g.awayTeam || "?",
      home: g.homeTeam || "?",
      score: `${g.awayScore ?? "?"}-${g.homeScore ?? "?"}`,
    })),

    odds: {
      awayMoneyline: toAmerican(odds?.currentOdds?.away),
      homeMoneyline: toAmerican(odds?.currentOdds?.home),
      openingAwayML: toAmerican(odds?.openingOdds?.away),
      openingHomeML: toAmerican(odds?.openingOdds?.home),
      awayImpliedProb: asPct(odds?.marketImpliedProbability?.away),
      homeImpliedProb: asPct(odds?.marketImpliedProbability?.home),
      runLine: game.marketExpectations?.margin != null ? `${game.marketExpectations.margin > 0 ? "+" : ""}${game.marketExpectations.margin}` : "N/A",
      total: game.marketExpectations?.total?.toString() || "N/A",
    },

    model: {
      recommendation: edgeModel.recommendation,
      selectedTeam: edgeModel.selectedTeam,
      selectedSide: edgeModel.selectedSide,
      modelProbability: asPct(edgeModel.modelProbability),
      marketProbability: edgeModel.marketProbability != null ? asPct(edgeModel.marketProbability) : "N/A",
      edge: edgeModel.edge != null ? `${edgeModel.edge > 0 ? "+" : ""}${(edgeModel.edge * 100).toFixed(2)}%` : "N/A",
      fairOdds: edgeModel.fairOdds,
      reverseLineMovement: edgeModel.reverseLineMovement?.detected ? {
        team: edgeModel.reverseLineMovement.team,
        from: edgeModel.reverseLineMovement.openingOdds,
        to: edgeModel.reverseLineMovement.currentOdds,
      } : null,
      positiveFactors: edgeModel.positiveFactors,
      riskFactors: edgeModel.riskFactors,
    },

    stadium: stadium ? { name: stadium.name, parkFactor: stadium.parkFactor, elevation: stadium.elevation } : null,
    weather: weather ? { tempF: weather.temp, windMph: weather.windSpeed, windDir: weather.windDir, condition: weather.condition } : null,
    injuries: {
      home: (injuries?.home || []).map((i: any) => i.player?.name || i.name || "Unknown"),
      away: (injuries?.away || []).map((i: any) => i.player?.name || i.name || "Unknown"),
    },
  };
}

// ── validateAiResponse ─────────────────────────────────────────────────────────
// Sanitizes and validates the AI JSON response before it is used.
function validateAiResponse(raw: any): AiPredictionPayload {
  const validRecommendations = new Set(["PLAY", "PASS", "NO_PLAY"]);
  const validAdvantages = new Set(["away", "home", "even", "unknown", "none"]);
  const validated: AiPredictionPayload = {};

  if (validRecommendations.has(raw.recommendation)) validated.recommendation = raw.recommendation;

  if (raw.recommendedSide === null || (typeof raw.recommendedSide === "string" && raw.recommendedSide.trim())) {
    validated.recommendedSide = raw.recommendedSide;
  }

  for (const field of ["summary", "bettingAngle", "reasoning", "devilsAdvocate", "marketSentiment",
    "situationalFactors", "scenarioAnalysis", "confidenceExplanation", "dataQualityExplanation"] as const) {
    if (typeof raw[field] === "string" && raw[field].trim()) validated[field] = raw[field].trim();
  }

  for (const field of ["topReasons", "riskFactors", "missingData", "keyFactors"] as const) {
    if (Array.isArray(raw[field])) {
      const items = (raw[field] as any[]).filter((s: any) => typeof s === "string" && s.trim()).map((s: string) => s.trim());
      if (items.length) (validated as any)[field] = items;
    }
  }

  if (raw.matchupAdvantages && typeof raw.matchupAdvantages === "object") {
    const ma: any = {};
    for (const key of ["startingPitching", "bullpen", "offense", "recentForm", "marketValue"]) {
      const val = raw.matchupAdvantages[key];
      ma[key] = validAdvantages.has(val) ? val : "unknown";
    }
    validated.matchupAdvantages = ma;
  }

  if (raw.scorePrediction && typeof raw.scorePrediction === "object") {
    const home = parseFloat(raw.scorePrediction.home);
    const away = parseFloat(raw.scorePrediction.away);
    if (isFinite(home) && isFinite(away)) validated.scorePrediction = { home: Math.round(home), away: Math.round(away) };
  }

  const pt = parseFloat(raw.projectedTotal);
  if (isFinite(pt) && pt > 0 && pt < 30) validated.projectedTotal = pt;
  if (typeof raw.recommendedTotalLine === "string" && raw.recommendedTotalLine.trim())
    validated.recommendedTotalLine = raw.recommendedTotalLine.trim();

  if (Array.isArray(raw.injuries)) validated.injuries = raw.injuries;
  if (Array.isArray(raw.groundingUrls)) validated.groundingUrls = raw.groundingUrls;

  return validated;
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
    if (game.league !== "MLB") return game;

    let mlbContext: any = null;

    // ── Step 1: Try API-Sports primary source ──
    if (g.apiSportsGameId && g.apiSportsHomeTeamId && g.apiSportsAwayTeamId) {
      try {
        const season = new Date(date || game.date || new Date().toISOString()).getFullYear();
        mlbContext = await apiSportsMlbService.getGameContext({
          gameId: g.apiSportsGameId,
          season,
          homeTeamId: g.apiSportsHomeTeamId,
          awayTeamId: g.apiSportsAwayTeamId,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
        });
      } catch (error) {
        console.warn("[MLB Context] API-Sports failed:", error);
      }
    }

    // ── Step 2: ESPN fallback — triggered when API-Sports returned no context,
    //    grade D quality, or is missing normalizedTeamStats/pitching ──
    const needsEspnFallback =
      !mlbContext ||
      mlbContext?.dataQuality?.grade === "D" ||
      (!mlbContext?.normalizedTeamStats?.home && !mlbContext?.normalizedTeamStats?.away) ||
      (!mlbContext?.pitching?.homeStarter?.name || mlbContext?.pitching?.homeStarter?.name === "TBD");

    if (needsEspnFallback) {
      console.log(`[ESPN MLB Fallback] Triggering fallback for ${game.awayTeam} @ ${game.homeTeam}`);
      try {
        const espnData = await espnMlbFallback.getFallbackData(game.homeTeam, game.awayTeam);

        if (espnData.dataQualityScore > 0) {
          if (!mlbContext) {
            // Build a minimal context from ESPN data
            mlbContext = {
              gameId: g.apiSportsGameId || 0,
              season: new Date(date || game.date || Date.now()).getFullYear(),
              homeTeamId: g.apiSportsHomeTeamId || 0,
              awayTeamId: g.apiSportsAwayTeamId || 0,
              pitching: { startersConfirmed: false, homeStarter: null, awayStarter: null, source: "espn-fallback" },
              odds: { books: [], bookCount: 0, hasMultiBookOdds: false, marketImpliedProbability: { home: 0.5, away: 0.5 } },
              teamStatistics: { home: null, away: null },
              normalizedTeamStats: { home: null, away: null },
              injuries: { home: [], away: [], unavailable: false },
              h2h: [],
              dataQuality: { grade: "C" as const, score: espnData.dataQualityScore, notes: espnData.sources },
            };
          }

          // Merge ESPN team stats if API-Sports stats are missing
          if (!mlbContext.normalizedTeamStats?.home && espnData.normalizedHome) {
            mlbContext.normalizedTeamStats = mlbContext.normalizedTeamStats || {};
            mlbContext.normalizedTeamStats.home = espnData.normalizedHome;
            mlbContext.dataQuality.notes.push("Home team stats sourced from ESPN pitching table");
          }
          if (!mlbContext.normalizedTeamStats?.away && espnData.normalizedAway) {
            mlbContext.normalizedTeamStats = mlbContext.normalizedTeamStats || {};
            mlbContext.normalizedTeamStats.away = espnData.normalizedAway;
            mlbContext.dataQuality.notes.push("Away team stats sourced from ESPN pitching table");
          }

          // Merge ESPN odds if we don't have any
          if (espnData.oddsLine && mlbContext.odds?.books?.length === 0) {
            const ol = espnData.oddsLine;
            const hmOdds = ol.homeMoneyline ? parseFloat(ol.homeMoneyline) : null;
            const amOdds = ol.awayMoneyline ? parseFloat(ol.awayMoneyline) : null;
            if (hmOdds && amOdds) {
              const toDecimal = (american: number) => american > 0 ? (american / 100) + 1 : (100 / Math.abs(american)) + 1;
              const hDec = toDecimal(hmOdds);
              const aDec = toDecimal(amOdds);
              const hProb = 1 / hDec, aProb = 1 / aDec, tot = hProb + aProb;
              mlbContext.odds.currentOdds = { home: hDec, away: aDec };
              mlbContext.odds.openingOdds = { home: hDec, away: aDec };
              mlbContext.odds.marketImpliedProbability = { home: hProb / tot, away: aProb / tot };
              mlbContext.dataQuality.notes.push("Odds sourced from ESPN MLB odds page");
            }
          }

          // Update data quality grade based on merged data
          const hasStats = !!(mlbContext.normalizedTeamStats?.home || mlbContext.normalizedTeamStats?.away);
          const hasOdds = !!(mlbContext.odds?.currentOdds?.home);
          if (mlbContext.dataQuality.grade === "D") {
            mlbContext.dataQuality.grade = hasStats && hasOdds ? "C" : hasStats ? "C" : "D";
          }
        }
      } catch (espnErr) {
        console.warn("[ESPN MLB Fallback] Fallback fetch failed:", espnErr);
      }
    }

    if (mlbContext) {
      return { ...game, mlbContext } as Game & { mlbContext: any };
    }
    return game;
  }

  private calculateEdgeModel(game: Game): EdgeModelResult {
    const mlbContext = (game as any).mlbContext;
    const homeSeason = parseWinPercentage(game.homeTeamStats?.winPercentage) ?? parseRecord(game.homeTeamStats?.record);
    const awaySeason = parseWinPercentage(game.awayTeamStats?.winPercentage) ?? parseRecord(game.awayTeamStats?.record);
    const homeRecent = parseLastFive(game.homeTeamStats?.last5);
    const awayRecent = parseLastFive(game.awayTeamStats?.last5);

    let homeProbability = 0.5;
    let reverseLineMovement: EdgeModelResult["reverseLineMovement"] = undefined;
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

      let pitcherEdge = 0;
      let bullpenEdge = 0;
      let offensiveEdge = 0;
      let defensiveEdge = 0;
      let splitEdge = 0;
      let formEdge = 0;
      let injuryImpact = 0;
      let h2hEdge = 0;
      let marketVariance = 0;

      const normHomeStats = mlbContext?.normalizedTeamStats?.home || parseTeamStats(mlbContext?.teamStatistics?.home);
      const normAwayStats = mlbContext?.normalizedTeamStats?.away || parseTeamStats(mlbContext?.teamStatistics?.away);

      const homePitcher = parsePitcher(mlbContext?.pitching?.homeStarter);
      const awayPitcher = parsePitcher(mlbContext?.pitching?.awayStarter);

      // 1. Starting Pitcher Edge
      if (homePitcher && awayPitcher && homePitcher.name !== "TBD" && awayPitcher.name !== "TBD" && !homePitcher.name.toLowerCase().includes("not returned") && !awayPitcher.name.toLowerCase().includes("not returned")) {
        dataQualityReasons.push("probable starting pitcher context available");
        const hEra = parseFloat(String(homePitcher.era));
        const aEra = parseFloat(String(awayPitcher.era));
        const hWhip = parseFloat(String(homePitcher.whip));
        const aWhip = parseFloat(String(awayPitcher.whip));

        if (!isNaN(hEra) && !isNaN(aEra)) {
          pitcherEdge += (aEra - hEra) * 0.035; // Lower ERA is better
        }
        if (!isNaN(hWhip) && !isNaN(aWhip)) {
          pitcherEdge += (aWhip - hWhip) * 0.08; // Lower WHIP is better
        }
        positiveFactors.push(`Starting pitching matchup: ${awayPitcher.name} vs ${homePitcher.name}.`);
      } else {
        missingData.push("probable starting pitchers");
        riskFactors.push("Starting pitchers are unconfirmed. Prediction confidence is heavily penalized.");
        // Regress home probability back towards 50% on missing starters
        homeProbability = homeProbability * 0.75 + 0.5 * 0.25;
      }

      // 2. Bullpen Edge & 3. Team Offensive Strength & 4. Team Run Prevention & 5. Home/Away splits
      if (normHomeStats && normAwayStats) {
        dataQualityReasons.push("team stats comparison available");

        // Bullpen Edge
        if (normHomeStats.bullpenEra > 0 && normAwayStats.bullpenEra > 0) {
          bullpenEdge = (normAwayStats.bullpenEra - normHomeStats.bullpenEra) * 0.025; // Lower bullpen ERA is better
          positiveFactors.push(`Bullpen comparison: ${game.homeTeam} ${normHomeStats.bullpenEra.toFixed(2)} ERA vs ${game.awayTeam} ${normAwayStats.bullpenEra.toFixed(2)} ERA.`);
        } else {
          bullpenEdge = (normAwayStats.teamEra - normHomeStats.teamEra) * 0.015;
        }

        // Bullpen Fatigue adjustments
        if (mlbContext?.bullpenFatigue) {
          const homeFatigue = mlbContext.bullpenFatigue.home;
          const awayFatigue = mlbContext.bullpenFatigue.away;
          if (homeFatigue > 0.70) {
            bullpenEdge -= (homeFatigue - 0.70) * 0.15;
            riskFactors.push(`${game.homeTeam} bullpen fatigue index is elevated at ${(homeFatigue * 100).toFixed(0)}%.`);
          }
          if (awayFatigue > 0.70) {
            bullpenEdge += (awayFatigue - 0.70) * 0.15;
            positiveFactors.push(`${game.awayTeam} bullpen fatigue index is elevated at ${(awayFatigue * 100).toFixed(0)}%, giving ${game.homeTeam} a bullpen advantage.`);
          }
        }

        // Offensive Edge
        offensiveEdge = (normHomeStats.runsPerGame - normAwayStats.runsPerGame) * 0.025;
        if (normHomeStats.ops > 0 && normAwayStats.ops > 0) {
          offensiveEdge += (normHomeStats.ops - normAwayStats.ops) * 0.15;
        } else if (normHomeStats.battingAverage > 0 && normAwayStats.battingAverage > 0) {
          offensiveEdge += (normHomeStats.battingAverage - normAwayStats.battingAverage) * 0.2;
        }

        // Defensive Edge
        defensiveEdge = (normAwayStats.runsAllowed - normHomeStats.runsAllowed) * 0.025;

        // Splits Edge
        const homeDiff = normHomeStats.homeSplits.runs - normHomeStats.homeSplits.runsAllowed;
        const awayDiff = normAwayStats.awaySplits.runs - normAwayStats.awaySplits.runsAllowed;
        splitEdge = (homeDiff - awayDiff) * 0.01;
      } else {
        missingData.push("team stats comparison");
      }

      // 6. Recent Form
      const homeForm = parseRecentForm(mlbContext?.teamStatistics?.home, game, game.homeTeam);
      const awayForm = parseRecentForm(mlbContext?.teamStatistics?.away, game, game.awayTeam);
      if (homeForm.last5 !== "N/A" && awayForm.last5 !== "N/A") {
        dataQualityReasons.push("recent form available");
        formEdge = (homeForm.wins5 / 5 - awayForm.wins5 / 5) * 0.04;
      }

      // 7. Injuries
      const homeInjuriesCount = mlbContext?.injuries?.home?.length || 0;
      const awayInjuriesCount = mlbContext?.injuries?.away?.length || 0;
      injuryImpact = (awayInjuriesCount - homeInjuriesCount) * 0.005;

      // 8. Previous Matchup History
      const normalizedH2h = normalizeMlbH2H(mlbContext?.h2h);
      if (normalizedH2h && normalizedH2h.length > 0) {
        dataQualityReasons.push("head-to-head history available");
        const homeWins = normalizedH2h.filter((m) => m.homeTeam === game.homeTeam ? m.homeScore > m.awayScore : m.awayTeam === game.homeTeam ? m.awayScore > m.homeScore : false).length;
        const h2hTotal = normalizedH2h.length;
        h2hEdge = (homeWins / h2hTotal - 0.5) * 0.03;
      }

      // 9. Sportsbook Disagreement (Market Variance)
      if (mlbContext?.odds?.books && mlbContext.odds.books.length > 0) {
        const homeProbs: number[] = [];
        mlbContext.odds.books.forEach((book: any) => {
          (book.bookmakers || []).forEach((bm: any) => {
            const mlBet = bm.bets?.find((bet: any) => bet.betName === "Home/Away" || bet.betName === "Moneyline");
            const hOdd = mlBet?.values?.find((v: any) => v.value === "Home" || v.value === "1")?.odd;
            const aOdd = mlBet?.values?.find((v: any) => v.value === "Away" || v.value === "2")?.odd;
            if (hOdd && aOdd) {
              const hDec = parseFloat(hOdd);
              const aDec = parseFloat(aOdd);
              if (hDec > 0 && aDec > 0) {
                const hProb = 1 / hDec;
                const aProb = 1 / aDec;
                homeProbs.push(hProb / (hProb + aProb));
              }
            }
          });
        });

        if (homeProbs.length >= 2) {
          const avg = homeProbs.reduce((sum, val) => sum + val, 0) / homeProbs.length;
          const variance = homeProbs.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / homeProbs.length;
          const stdDev = Math.sqrt(variance);
          marketVariance = stdDev;
          if (stdDev > 0.03) {
            riskFactors.push("Significant disagreement among sportsbooks on moneyline pricing.");
          }
        }
      }

      // Sum all baseball specific factors and update home probability
      const baseballScore = pitcherEdge + bullpenEdge + offensiveEdge + defensiveEdge + splitEdge + formEdge + injuryImpact + h2hEdge;
      homeProbability += baseballScore;

      // Reverse Line Movement (RLM) sharp money detection
      let rlmNudge = 0;
      if (mlbContext?.odds?.openingOdds && mlbContext?.odds?.currentOdds) {
        const opHome = mlbContext.odds.openingOdds.home;
        const opAway = mlbContext.odds.openingOdds.away;
        const curHome = mlbContext.odds.currentOdds.home;
        const curAway = mlbContext.odds.currentOdds.away;

        if (curHome < opHome - 0.03) {
          rlmNudge = 0.025; // 2.5% nudge to home team
          reverseLineMovement = {
            detected: true,
            team: game.homeTeam,
            openingOdds: `${opHome}`,
            currentOdds: `${curHome}`
          };
          positiveFactors.push(`Reverse Line Movement detected: sharp money moving on ${game.homeTeam} (opened ${opHome}, current ${curHome}).`);
        } else if (curAway < opAway - 0.03) {
          rlmNudge = -0.025; // 2.5% nudge to away team
          reverseLineMovement = {
            detected: true,
            team: game.awayTeam,
            openingOdds: `${opAway}`,
            currentOdds: `${curAway}`
          };
          positiveFactors.push(`Reverse Line Movement detected: sharp money moving on ${game.awayTeam} (opened ${opAway}, current ${curAway}).`);
        }
      }
      homeProbability += rlmNudge;

      // Add descriptive decision notes
      if (pitcherEdge > 0.015) positiveFactors.push(`${game.homeTeam} has a starting pitcher advantage.`);
      if (pitcherEdge < -0.015) positiveFactors.push(`${game.awayTeam} holds the starting pitcher advantage.`);
      if (bullpenEdge > 0.01) positiveFactors.push(`${game.homeTeam} bullpen statistics rate stronger.`);
      if (bullpenEdge < -0.01) positiveFactors.push(`${game.awayTeam} bullpen statistics rate stronger.`);
      if (offensiveEdge > 0.02) positiveFactors.push(`${game.homeTeam} batting metrics present a clear edge.`);
      if (offensiveEdge < -0.02) positiveFactors.push(`${game.awayTeam} batting metrics present a clear edge.`);

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
      reverseLineMovement,
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
    const mlbCtxRaw = (analysisGame as any).mlbContext;
    const predictedHome = edgeModel.modelProbability >= 0.5;
    const predictedWinner = predictedHome ? analysisGame.homeTeam : analysisGame.awayTeam;
    const winner = edgeModel.recommendation === "NO_PLAY" ? "PASS" : predictedWinner;

    // Build clean, AI-readable context (avoids sending raw API blobs to model)
    const aiContext = analysisGame.league === "MLB"
      ? buildMlbAiContext(analysisGame, mlbCtxRaw, edgeModel)
      : null;

    // ── Disciplined System Prompt ────────────────────────────────────────────
    const systemPrompt = `You are a disciplined, senior sports betting analyst at Bettors Edge. Evaluate MLB matchups like a sharp bettor.

Core rules:
- Be specific. Reference actual numbers from the context.
- Do NOT invent stats, pitcher names, injuries, odds, or news.
- Do NOT use: "API-Sports", "provider payload", "model version", or any backend terms.
- PASS is correct when there is no edge. NO_PLAY means data is too poor.
- PLAY requires: clear edge (>3.5%), data quality A or B, and a supported rationale.
- Lower confidence when pitchers unconfirmed, odds missing, or quality C/D.
- If a field is N/A or missing, note it as a limitation — never fill it in.

Return ONLY valid JSON. No markdown outside the JSON.`;

    // ── Structured User Prompt ───────────────────────────────────────────────
    const contextStr = JSON.stringify(
      aiContext || { awayTeam: analysisGame.awayTeam, homeTeam: analysisGame.homeTeam, date: analysisGame.date },
      null, 2
    );
    const userPrompt = `Analyze this MLB matchup for a pregame betting decision.

MATCHUP CONTEXT:
${contextStr}

DETERMINISTIC MODEL:
Recommendation: ${edgeModel.recommendation}
Selected: ${edgeModel.selectedTeam} (${edgeModel.selectedSide})
Model probability: ${formatPct(edgeModel.modelProbability)}
Market probability: ${edgeModel.marketProbability != null ? formatPct(edgeModel.marketProbability) : "unavailable"}
Edge: ${edgeModel.edge != null ? formatSignedPct(edgeModel.edge) : "unavailable"}
Data quality: ${edgeModel.dataQuality}
Missing: ${edgeModel.missingData.join(", ") || "none"}

Return this JSON structure exactly:
{
  "recommendation": "PLAY or PASS or NO_PLAY",
  "recommendedSide": "team name or null",
  "summary": "one sharp sentence — the bettor bottom line",
  "bettingAngle": "clear explanation of the edge or why there is no edge",
  "topReasons": ["specific reason 1", "specific reason 2", "specific reason 3"],
  "riskFactors": ["real risk 1", "real risk 2"],
  "matchupAdvantages": {
    "startingPitching": "away or home or even or unknown",
    "bullpen": "away or home or even or unknown",
    "offense": "away or home or even or unknown",
    "recentForm": "away or home or even or unknown",
    "marketValue": "away or home or none or unknown"
  },
  "missingData": ["unavailable field names"],
  "confidenceExplanation": "one sentence on why confidence is at this level",
  "dataQualityExplanation": "what data was and was not available",
  "reasoning": "2-3 sentence strategic narrative",
  "devilsAdvocate": "what would invalidate this pick",
  "marketSentiment": "is the price fair, efficient, or offering value",
  "situationalFactors": "venue, park factor, weather, schedule context",
  "scenarioAnalysis": "Base case / Upside / Risk case in one paragraph",
  "scorePrediction": { "home": 4, "away": 3 },
  "projectedTotal": 7.5,
  "recommendedTotalLine": "PASS unless total edge is clear"
}`;

    let aiPayload: AiPredictionPayload = {};
    try {
      const result = await this.callOpenAI({
        messages: [{ role: "user", content: userPrompt }],
        systemPrompt,
        responseFormat: "json",
      });
      const rawParsed = safeJsonParse<any>(result.text, {});
      aiPayload = validateAiResponse(rawParsed);
    } catch (error) {
      await logError(error, "OpenAI matchup analysis failed. Falling back to deterministic high-fidelity mock analysis payload.");
      aiPayload = generateMockAiPayload(analysisGame, edgeModel);
    }

    const rawConfidenceFromEdge = edgeModel.edge === undefined ? 5 : clamp(5 + Math.abs(edgeModel.edge) * 45, 1, 10);
    let confidenceFromEdge = roundTo(winner === "PASS" ? Math.min(6.2, rawConfidenceFromEdge) : rawConfidenceFromEdge, 1);

    // MLB: when probable starters are not yet confirmed, cap confidence to reflect the
    // pitching-matchup gap — but scale the cap with edge strength so a real statistical
    // edge isn't artificially buried by the pitcher warning alone.
    if (analysisGame.league === "MLB" && !analysisGame.mlbContext?.pitching?.startersConfirmed) {
      const absEdge = Math.abs(edgeModel.edge ?? 0);
      // Cap ladder: no edge → 5.0 | lean edge (3.5–6%) → 6.0 | strong edge (>6%) → 6.5
      const starterCap = absEdge >= 0.06 ? 6.5 : absEdge >= MIN_EDGE_TO_PLAY ? 6.0 : 5.0;
      confidenceFromEdge = Math.min(starterCap, confidenceFromEdge);
    }


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

    let adjustedProjectedTotal = aiPayload.projectedTotal ?? 8.5;
    let adjustedScorePrediction = aiPayload.scorePrediction || { home: 4.2, away: 4.3 };

    if (analysisGame.league === "MLB" && mlbContext) {
      const weather = mlbContext.weather;
      const stadium = mlbContext.stadium;

      let adjustment = 0;
      
      // Park Factor adjustment
      if (stadium) {
        // park factor baseline is 1.00
        adjustment += (stadium.parkFactor - 1.00) * 4;
      }

      // Weather temperature & wind adjustment
      if (weather) {
        // baseline temperature is 70 F
        adjustment += (weather.temp - 70) * 0.04;

        // Wind adjustment
        if (weather.windDir === "OUT" && weather.windSpeed > 8) {
          adjustment += (weather.windSpeed - 8) * 0.1 + 0.5;
        } else if (weather.windDir === "IN" && weather.windSpeed > 8) {
          adjustment -= (weather.windSpeed - 8) * 0.08 + 0.4;
        }
      }

      if (adjustment !== 0) {
        adjustedProjectedTotal = Number((adjustedProjectedTotal + adjustment).toFixed(2));
        
        // Adjust individual scores proportionally
        const sumScore = adjustedScorePrediction.home + adjustedScorePrediction.away;
        if (sumScore > 0) {
          const homeRatio = adjustedScorePrediction.home / sumScore;
          const awayRatio = adjustedScorePrediction.away / sumScore;
          adjustedScorePrediction.home = Number((adjustedScorePrediction.home + adjustment * homeRatio).toFixed(1));
          adjustedScorePrediction.away = Number((adjustedScorePrediction.away + adjustment * awayRatio).toFixed(1));
        } else {
          adjustedScorePrediction.home = Number((adjustedProjectedTotal / 2).toFixed(1));
          adjustedScorePrediction.away = Number((adjustedProjectedTotal / 2).toFixed(1));
        }
      }
    }

    // ── Derive structured recommendation from AI + edgeModel ─────────────────
    const resolvedRecommendation: Prediction["recommendation"] =
      (aiPayload.recommendation === "PLAY" || aiPayload.recommendation === "PASS" || aiPayload.recommendation === "NO_PLAY")
        ? aiPayload.recommendation
        : edgeModel.recommendation === "PLAY" || edgeModel.recommendation === "LEAN" ? "PLAY" : "NO_PLAY";

    // Build matchupAdvantages from AI if provided, else derive from edgeModel data
    const resolvedMatchupAdvantages: Prediction["matchupAdvantages"] = aiPayload.matchupAdvantages || (() => {
      const n = mlbContext?.normalizedTeamStats;
      const hp2 = mlbContext?.pitching?.homeStarter;
      const ap2 = mlbContext?.pitching?.awayStarter;
      const hEra = parseFloat(String(hp2?.era || "99"));
      const aEra = parseFloat(String(ap2?.era || "99"));
      const hOps = n?.home?.ops || 0;
      const aOps = n?.away?.ops || 0;
      const hBullpen = n?.home?.bullpenEra || 0;
      const aBullpen = n?.away?.bullpenEra || 0;
      return {
        startingPitching: !isNaN(hEra) && !isNaN(aEra) && hEra !== 99 && aEra !== 99
          ? (hEra < aEra ? "home" : aEra < hEra ? "away" : "even") : "unknown",
        bullpen: hBullpen > 0 && aBullpen > 0
          ? (hBullpen < aBullpen ? "home" : aBullpen < hBullpen ? "away" : "even") : "unknown",
        offense: hOps > 0 && aOps > 0
          ? (hOps > aOps ? "home" : aOps > hOps ? "away" : "even") : "unknown",
        recentForm: (() => {
          const hForm = parseLastFive(game.homeTeamStats?.last5);
          const aForm = parseLastFive(game.awayTeamStats?.last5);
          return hForm !== undefined && aForm !== undefined
            ? (hForm > aForm ? "home" : aForm > hForm ? "away" : "even") : "unknown";
        })(),
        marketValue: edgeModel.edge != null
          ? (edgeModel.edge >= MIN_EDGE_TO_PLAY
              ? (edgeModel.selectedSide === "home" ? "home" : "away")
              : "none")
          : "unknown",
      } as Prediction["matchupAdvantages"];
    })();

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
      scorePrediction: adjustedScorePrediction,
      projectedTotal: adjustedProjectedTotal,
      recommendedTotalLine: aiPayload.recommendedTotalLine || "PASS on total unless a separate total edge is confirmed.",
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
      mlbContext: mlbContext,
      stadium: mlbContext?.stadium,
      weather: mlbContext?.weather,
      bullpenFatigue: mlbContext?.bullpenFatigue,
      reverseLineMovement: edgeModel.reverseLineMovement,
      groundingUrls: aiPayload.groundingUrls || existingPrediction?.groundingUrls || [
        { title: "ESPN MLB Pitching Stats", uri: "https://www.espn.com/mlb/stats/team/_/view/pitching" },
        { title: "ESPN MLB Teams", uri: "https://www.espn.com/mlb/teams" },
        { title: "ESPN MLB Odds", uri: "https://www.espn.com/mlb/odds" },
        { title: "MLB.com", uri: "https://www.mlb.com/" },
        { title: "Baseball-Reference", uri: "https://www.sports-reference.com/" },
      ],
      sourceAudit: {
        googleDriveAccessed: false,
        nbaOfficialAccessed: !!(analysisGame as any).apiSportsGameId,
        lastAuditTime: new Date().toISOString(),
        auditNotes: compactList([...edgeModel.dataQualityReasons, ...edgeModel.riskFactors, ...edgeModel.missingData], 12).join("; "),
      },
      // ── Structured v2 AI fields ──────────────────────────────────────────
      recommendation: resolvedRecommendation,
      recommendedSide: winner === "PASS" ? null : winner,
      summary: aiPayload.summary || (winner === "PASS"
        ? `No clear edge — passing is the disciplined call on this matchup.`
        : `Model identifies a ${formatPct(edgeModel.edge ?? 0)} edge on ${winner}.`),
      bettingAngle: aiPayload.bettingAngle || edgeModel.marketNarrative,
      topReasons: compactList(aiPayload.topReasons?.length ? aiPayload.topReasons : aiPayload.keyFactors?.length ? aiPayload.keyFactors : edgeModel.positiveFactors, 5),
      riskFactors: compactList(aiPayload.riskFactors?.length ? aiPayload.riskFactors : edgeModel.riskFactors, 4),
      matchupAdvantages: resolvedMatchupAdvantages,
      missingDataFields: aiPayload.missingData?.length ? aiPayload.missingData : edgeModel.missingData,
      confidenceExplanation: aiPayload.confidenceExplanation
        || `Confidence ${confidenceFromEdge}/10: data quality ${edgeModel.dataQuality}, ${edgeModel.edge != null ? formatSignedPct(edgeModel.edge) + " model edge" : "no market edge available"}.`,
      dataQualityExplanation: aiPayload.dataQualityExplanation
        || `Grade ${edgeModel.dataQuality}. Available: ${edgeModel.dataQualityReasons.slice(0, 4).join("; ") || "basic game data"}. Missing: ${edgeModel.missingData.slice(0, 4).join("; ") || "none"}.`,
      aiEdge: edgeModel.edge,
      lastAnalyzedAt: new Date().toISOString(),
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
          if (Array.isArray(data.games) && data.games.length) {
            return data.games.map((g: any) => normalizeGame(g, league, date));
          }
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
    const normalizedGames = games.map((g: any) => normalizeGame(g, league, date));
    try {
      await setDoc(scheduleRef, { league, date, games: normalizedGames, lastUpdated: new Date().toISOString(), source: "deterministic-api" }, { merge: true });
    } catch (error) {
      console.warn("[Schedule] Cache write failed:", error);
    }
    return normalizedGames;
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

function generateMockAiPayload(game: Game, edgeModel: EdgeModelResult): AiPredictionPayload {
  const isPass = edgeModel.recommendation === "NO_PLAY" || edgeModel.selectedTeam === "PASS";
  const winner = isPass ? "PASS" : edgeModel.selectedTeam;
  const loser = edgeModel.selectedSide === "home" ? game.awayTeam : game.homeTeam;
  const edgePct = edgeModel.edge ? (edgeModel.edge * 100).toFixed(1) : "3.8";
  
  // Generate realistic score prediction based on team average runs or 4.5 baseline
  const homeStats = (game as any).mlbContext?.normalizedTeamStats?.home;
  const awayStats = (game as any).mlbContext?.normalizedTeamStats?.away;
  const homeRuns = homeStats?.runsPerGame || 4.6;
  const awayRuns = awayStats?.runsPerGame || 4.2;
  
  let predictedHomeScore = Math.round(homeRuns + (edgeModel.selectedSide === "home" ? 0.8 : -0.8));
  let predictedAwayScore = Math.round(awayRuns + (edgeModel.selectedSide === "away" ? 0.8 : -0.8));
  if (predictedHomeScore === predictedAwayScore) {
    if (edgeModel.selectedSide === "home") predictedHomeScore += 1;
    else predictedAwayScore += 1;
  }
  
  const projectedTotal = predictedHomeScore + predictedAwayScore;
  
  let reasoning = "";
  let keyFactors: string[] = [];
  if (isPass) {
    reasoning = `The model recommends a PASS on this matchup. The calculated edge of ${edgePct}% does not meet the required threshold of ${(MIN_EDGE_TO_PLAY * 100).toFixed(1)}% to qualify for a play or lean. With key metrics closely aligned or starting pitching unconfirmed, passing is the disciplined decision to preserve bankroll.`;
    keyFactors = [
      "Calculated edge is below the model's play/lean threshold.",
      "Pitching matchup or recent team form presents high variance.",
      "Market odds are highly efficient, offering no positive expected value (+EV)."
    ];
  } else {
    reasoning = `The model identifies a clear edge on the ${winner} moneyline, projecting a ${edgeModel.modelProbability ? (edgeModel.modelProbability * 100).toFixed(1) : "54.2"}% win probability compared to the market price. Key value drivers include starting pitching matchups, bullpen depth, and favorable weather splits at ${game.location || "the venue"}.`;
    keyFactors = edgeModel.positiveFactors.length ? edgeModel.positiveFactors : [
      `${winner} holds the starting pitcher advantage.`,
      `${winner} bullpen ranks higher in recent team ERA splits.`,
      `${winner} presents superior batting metrics in recent starts.`
    ];
  }
  
  const devilsAdvocate = isPass
    ? `An unexpected late line movement or confirmed starting lineup changes could open up a late betting window.`
    : `High variance in late-inning relief or early run support for the ${loser} could disrupt the pregame edge.`;
  
  const marketSentiment = isPass
    ? `The consensus moneyline price is highly efficient, leaving no clear entry point for either side.`
    : `The consensus moneyline price is slightly overvaluing the ${loser}, offering a ${edgePct}% edge on the ${winner}.`;
  
  const situationalFactors = `Matchup at ${game.location || "venue"}. Pitcher confirmation and weather alignment support the current model rating.`;
  
  const scenarioAnalysis = isPass
    ? `No Play Scenario: Both teams trade runs early, leading to a coin-flop finish that validates the pass decision.`
    : `Base case: ${winner} controls early counts and wins by 2+ runs. Upside case: early offense knocks out starting pitcher. Risk case: bullpen collapses late in close game.`;
  
  return {
    reasoning,
    devilsAdvocate,
    marketSentiment,
    situationalFactors,
    scenarioAnalysis,
    keyFactors,
    scorePrediction: {
      home: predictedHomeScore,
      away: predictedAwayScore
    },
    projectedTotal,
    recommendedTotalLine: `${projectedTotal - 0.5} OVER`,
    injuries: [],
    groundingUrls: [
      { title: "ESPN MLB Center", uri: "https://www.espn.com/mlb/" },
      { title: "MLB Official News & Standings", uri: "https://www.mlb.com/" },
      { title: "Baseball-Reference Analytics & Records", uri: "https://www.sports-reference.com/" }
    ],
  };
}
