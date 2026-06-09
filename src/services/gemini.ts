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

const MODEL_VERSION = "openai-edge-v1.1.0";
const PROMPT_VERSION = "openai-sports-analysis-v1.1.0";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const MIN_EDGE_TO_PLAY = 0.035;

type DataQuality = "A" | "B" | "C" | "D";

type EdgeModelResult = {
  modelProbability: number;
  marketProbability?: number;
  edge?: number;
  dataQuality: DataQuality;
  dataQualityReasons: string[];
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
    const homeSeason = parseWinPercentage(game.homeTeamStats?.winPercentage);
    const awaySeason = parseWinPercentage(game.awayTeamStats?.winPercentage);
    const homeRecent = parseLastFive(game.homeTeamStats?.last5);
    const awayRecent = parseLastFive(game.awayTeamStats?.last5);

    let homeProbability = 0.5;
    const dataQualityReasons: string[] = [];

    homeProbability += 0.025;

    if (homeSeason !== undefined && awaySeason !== undefined) {
      homeProbability += (homeSeason - awaySeason) * 0.18;
      dataQualityReasons.push("season record available");
    }

    if (homeRecent !== undefined && awayRecent !== undefined) {
      homeProbability += (homeRecent - awayRecent) * 0.08;
      dataQualityReasons.push("recent form available");
    }

    if (game.league === "MLB" && mlbContext?.dataQuality) {
      dataQualityReasons.push(...(mlbContext.dataQuality.notes || []).slice(0, 6));
      if (mlbContext.pitching?.startersConfirmed) {
        dataQualityReasons.push("probable starting pitcher context available");
        homeProbability += 0.004;
      } else {
        dataQualityReasons.push("probable starting pitchers missing; MLB confidence capped");
        homeProbability = homeProbability * 0.9 + 0.5 * 0.1;
      }
      if (mlbContext.dataQuality.grade === "A") homeProbability += 0.005;
      if (mlbContext.dataQuality.grade === "D") homeProbability = homeProbability * 0.85 + 0.5 * 0.15;
    }

    if (game.marketExpectations?.homeWinProb !== undefined && game.marketExpectations?.awayWinProb !== undefined) {
      const homeMarketFromOdds = americanOddsToProbability(game.marketExpectations.homeWinProb);
      if (homeMarketFromOdds !== undefined) {
        homeProbability = homeProbability * 0.55 + homeMarketFromOdds * 0.45;
        dataQualityReasons.push("sportsbook market available");
      }
    }

    const kalshiYes = normalizeProbability(game.kalshiExpectations?.yes ?? game.kalshiOdds?.yes);
    if (kalshiYes !== undefined) {
      homeProbability = homeProbability * 0.75 + kalshiYes * 0.25;
      dataQualityReasons.push("Kalshi market available");
    }

    homeProbability = clamp(homeProbability, 0.05, 0.95);

    const homeMarketProbability = americanOddsToProbability(game.marketExpectations?.homeWinProb) ?? normalizeProbability(game.kalshiExpectations?.yes ?? game.kalshiOdds?.yes);
    const awayMarketProbability = americanOddsToProbability(game.marketExpectations?.awayWinProb) ?? normalizeProbability(game.kalshiExpectations?.no ?? game.kalshiOdds?.no);
    const predictedHome = homeProbability >= 0.5;
    const modelProbability = predictedHome ? homeProbability : 1 - homeProbability;
    const marketProbability = predictedHome ? homeMarketProbability : awayMarketProbability;
    const edge = marketProbability !== undefined ? modelProbability - marketProbability : undefined;

    const qualityPoints = [
      !!game.date,
      !!game.time,
      !!game.location && game.location !== "Unknown",
      homeSeason !== undefined && awaySeason !== undefined,
      homeRecent !== undefined && awayRecent !== undefined,
      marketProbability !== undefined,
      !!game.allSources?.length,
      game.league === "MLB" && mlbContext?.dataQuality?.grade && mlbContext.dataQuality.grade !== "D",
      game.league === "MLB" && !!mlbContext?.pitching?.startersConfirmed,
    ].filter(Boolean).length;

    const dataQuality: DataQuality = qualityPoints >= 7 ? "A" : qualityPoints >= 5 ? "B" : qualityPoints >= 3 ? "C" : "D";
    if (marketProbability === undefined) dataQualityReasons.push("market probability missing");
    if (!game.allSources?.length) dataQualityReasons.push("multi-book source data missing");

    let recommendation: EdgeModelResult["recommendation"] = "NO_PLAY";
    if (edge !== undefined && edge >= 0.07 && (dataQuality === "A" || dataQuality === "B")) recommendation = "PLAY";
    else if (edge !== undefined && edge >= MIN_EDGE_TO_PLAY && dataQuality !== "D") recommendation = "LEAN";

    return {
      modelProbability,
      marketProbability,
      edge,
      dataQuality,
      dataQualityReasons,
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

    const systemPrompt = "You are Bettors Edge, a disciplined sports analytics engine. You explain deterministic model output. Never invent injuries, odds, rosters, pitcher names, or news. If data is missing, say so. Return only JSON.";
    const userPrompt = `
Analyze this matchup using the provided deterministic model output. Do not override the edge/no-play rule.

Game with MLB context when available:
${JSON.stringify(analysisGame, null, 2)}

Deterministic model:
${JSON.stringify(edgeModel, null, 2)}

Existing prediction, if any:
${JSON.stringify(existingPrediction || null, null, 2)}

Return JSON with this shape:
{
  "reasoning": "short explanation",
  "devilsAdvocate": "why this could be wrong",
  "marketSentiment": "market read",
  "situationalFactors": "rest/travel/schedule notes",
  "scenarioAnalysis": "best/base/worst case",
  "keyFactors": ["factor 1", "factor 2", "factor 3"],
  "scorePrediction": { "home": 0, "away": 0 },
  "projectedTotal": 0,
  "recommendedTotalLine": "over/under/pass with reason",
  "injuries": [],
  "matchupAnalysis": {
    "h2h": "...",
    "playerStats": "...",
    "trends": "...",
    "confidenceBreakdown": "..."
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

    const confidenceFromEdge = edgeModel.edge === undefined ? 5 : clamp(5 + Math.abs(edgeModel.edge) * 45, 1, 10);

    const prediction: Prediction = {
      gameId: analysisGame.id,
      league: analysisGame.league,
      date,
      homeTeam: analysisGame.homeTeam,
      awayTeam: analysisGame.awayTeam,
      winner,
      confidence: winner === "PASS" ? Math.min(6, confidenceFromEdge) : confidenceFromEdge,
      reasoning: aiPayload.reasoning || `${edgeModel.recommendation}: model probability ${Math.round(edgeModel.modelProbability * 100)}%${edgeModel.edge !== undefined ? ` vs market ${Math.round((edgeModel.marketProbability || 0) * 100)}%` : " with no reliable market probability"}.`,
      devilsAdvocate: aiPayload.devilsAdvocate || "Primary risk: limited or stale market, injury, or pitcher data can distort the edge calculation.",
      marketSentiment: aiPayload.marketSentiment || (edgeModel.edge !== undefined ? `Estimated edge: ${(edgeModel.edge * 100).toFixed(1)}%.` : "No reliable market edge available."),
      situationalFactors: aiPayload.situationalFactors || "Situational data limited to available schedule, venue, recent form, market context, and MLB context when present.",
      scenarioAnalysis: aiPayload.scenarioAnalysis || "No-play if edge is below threshold or data quality is weak. Lean/play only when market gap is measurable.",
      keyFactors: aiPayload.keyFactors?.length ? aiPayload.keyFactors : edgeModel.dataQualityReasons,
      injuries: aiPayload.injuries || existingPrediction?.injuries || [],
      scorePrediction: aiPayload.scorePrediction,
      projectedTotal: aiPayload.projectedTotal,
      recommendedTotalLine: aiPayload.recommendedTotalLine || "PASS unless total edge is independently confirmed.",
      matchupAnalysis: aiPayload.matchupAnalysis,
      playerMatchups: aiPayload.playerMatchups,
      teamStatsComparison: aiPayload.teamStatsComparison,
      kalshiPrice: analysisGame.kalshiExpectations?.yes ?? analysisGame.kalshiOdds?.yes ?? edgeModel.marketProbability ?? 0.5,
      winProbability: edgeModel.modelProbability,
      lastUpdated: new Date().toISOString(),
      simulationCount: 0,
      predictionDataQuality: edgeModel.dataQuality,
      matchupDelta: edgeModel.edge,
      qaStatus: edgeModel.recommendation === "NO_PLAY" ? "flagged" : "verified",
      qaNotes: `OpenAI-only analysis. Model=${MODEL_VERSION}; prompt=${PROMPT_VERSION}; recommendation=${edgeModel.recommendation}; fairOdds=${edgeModel.fairOdds}; dataQuality=${edgeModel.dataQuality}.`,
      marketExpectations: analysisGame.marketExpectations,
      sourceAudit: {
        googleDriveAccessed: false,
        nbaOfficialAccessed: !!(analysisGame as any).apiSportsGameId,
        lastAuditTime: new Date().toISOString(),
        auditNotes: edgeModel.dataQualityReasons.join("; "),
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
      onProgress?.(`Analyzing ${game.awayTeam} @ ${game.homeTeam} with OpenAI...`);
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
      details: "OpenAI engine is active. External injury and pitcher verification should be connected through deterministic sports data providers, not AI-generated claims.",
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
