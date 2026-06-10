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


  private normalizeLeagueValue(value: unknown, fallback = "NBA"): Game["league"] {
    const raw = (() => {
      if (typeof value === "string") return value;
      if (value && typeof value === "object") {
        const obj = value as { name?: unknown; code?: unknown; sport?: unknown; id?: unknown };
        return obj.code ?? obj.name ?? obj.sport ?? obj.id ?? fallback;
      }
      return value ?? fallback;
    })();

    const key = String(raw).toUpperCase();
    if (key.includes("MLB") || key.includes("BASEBALL") || key === "1") return "MLB";
    if (key.includes("NBA") || key.includes("BASKETBALL") || key === "12") return "NBA";
    if (key.includes("NHL") || key.includes("HOCKEY") || key === "57") return "NHL";
    if (key.includes("NFL") || key.includes("FOOTBALL")) return "NFL";
    if (key.includes("NCAA")) return "NCAA";
    return fallback.toUpperCase() as Game["league"];
  }

  private normalizeScheduleGame(raw: any, fallbackLeague: string, fallbackDate: string): Game | null {
    if (!raw) return null;
    const league = this.normalizeLeagueValue(raw.league, fallbackLeague);

    const homeTeam = raw.homeTeam ?? raw.teams?.home?.name;
    const awayTeam = raw.awayTeam ?? raw.teams?.away?.name;
    if (!homeTeam || !awayTeam) return null;

    const rawDate = raw.date ? String(raw.date) : fallbackDate;
    const dateOnly = rawDate.includes("T") ? rawDate.split("T")[0] : rawDate;
    const time = raw.time || (rawDate.includes("T") ? rawDate.split("T")[1]?.substring(0, 5) : undefined) || "TBD";
    const statusCode = String(raw.status?.short ?? raw.status ?? "NS").toUpperCase();
    const status: Game["status"] =
      ["FT", "AOT", "FINAL", "FINISHED"].includes(statusCode) ? "finished" :
      statusCode.startsWith("IN") || ["LIVE", "1Q", "2Q", "3Q", "4Q", "OT", "HT"].includes(statusCode) ? "live" :
      "scheduled";

    const venue = raw.location ?? raw.venue?.name ?? raw.venue;
    const id = raw.id && raw.homeTeam && raw.awayTeam
      ? String(raw.id)
      : `${league}-${awayTeam}-${homeTeam}-${dateOnly}`.toLowerCase().replace(/[^a-z0-9]/g, "-");

    return stripUndefined({
      ...raw,
      id,
      league,
      homeTeam,
      awayTeam,
      homeLogo: raw.homeLogo ?? raw.teams?.home?.logo,
      awayLogo: raw.awayLogo ?? raw.teams?.away?.logo,
      date: dateOnly,
      time,
      location: typeof venue === "string" ? venue : venue?.name ?? "Unknown",
      status,
      homeScore: raw.homeScore ?? raw.scores?.home?.total,
      awayScore: raw.awayScore ?? raw.scores?.away?.total,
      apiSportsGameId: raw.apiSportsGameId ?? raw.id,
      apiSportsHomeTeamId: raw.apiSportsHomeTeamId ?? raw.teams?.home?.id,
      apiSportsAwayTeamId: raw.apiSportsAwayTeamId ?? raw.teams?.away?.id,
    }) as Game;
  }

  private normalizeScheduleGames(rawGames: any[], fallbackLeague: string, fallbackDate: string): Game[] {
    return rawGames
      .map((game) => this.normalizeScheduleGame(game, fallbackLeague, fallbackDate))
      .filter((game): game is Game => Boolean(game));
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
    positiveFactors.push(`Home-field adjustment applied for ${game.homeTeam}.`);

    if (homeSeason !== undefined && awaySeason !== undefined) {
      const seasonDelta = homeSeason - awaySeason;
      homeProbability += seasonDelta * 0.22;
      dataQualityReasons.push("season record available");
      const strongerTeam = seasonDelta >= 0 ? game.homeTeam : game.awayTeam;
      positiveFactors.push(`${strongerTeam} has the stronger season record (${game.homeTeamStats?.record || formatPct(homeSeason)} vs ${game.awayTeamStats?.record || formatPct(awaySeason)}).`);
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

      if (mlbContext.game) positiveFactors.push("API-Sports game detail was matched by game ID.");
      else missingData.push("API-Sports game-detail lookup did not return a payload");

      if (mlbContext.pitching?.startersConfirmed) {
        dataQualityReasons.push("probable starting pitcher context available");
        positiveFactors.push("Probable starting pitcher context is available, so the MLB model can use a fuller pregame profile.");
        homeProbability += 0.004;
      } else {
        dataQualityReasons.push("probable starting pitchers missing; MLB confidence capped");
        riskFactors.push("Probable starters are missing, so MLB confidence is capped and the model avoids forcing a bet.");
        missingData.push("probable starting pitchers unavailable");
        homeProbability = homeProbability * 0.90 + 0.5 * 0.10;
      }

      if (mlbContext.odds?.hasMultiBookOdds) positiveFactors.push(`Multi-book odds are available (${mlbContext.odds.bookCount || "multiple"} book entries).`);
      else missingData.push("multi-book odds unavailable");

      if (mlbContext.teamStatistics?.home || mlbContext.teamStatistics?.away) positiveFactors.push("API-Sports team statistics are available for matchup context.");
      else missingData.push("team-statistics endpoint unavailable");

      if (Array.isArray(mlbContext.h2h) && mlbContext.h2h.length) positiveFactors.push(`Head-to-head context available (${mlbContext.h2h.length} prior games returned).`);
      else missingData.push("head-to-head context unavailable");

      if (mlbContext.injuries?.unavailable) riskFactors.push("At least one injury endpoint failed; analysis continued without blocking.");
      else positiveFactors.push("Injury endpoint checked without blocking the analysis flow.");

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
      positiveFactors.push(`Sportsbook moneyline context available (${game.marketExpectations?.source || "market source"}).`);
    } else {
      missingData.push("sportsbook moneyline probability unavailable");
    }

    const kalshiYes = normalizeProbability(game.kalshiExpectations?.yes ?? game.kalshiOdds?.yes);
    if (kalshiYes !== undefined) {
      homeProbability = homeProbability * 0.94 + kalshiYes * 0.06;
      dataQualityReasons.push("Kalshi market available");
      positiveFactors.push(`Kalshi market available at ${formatPct(kalshiYes)} YES.`);
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
    const fallbackTeamStatsComparison: Prediction["teamStatsComparison"] = compactList([
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
      kalshiPrice: analysisGame.kalshiExpectations?.yes ?? analysisGame.kalshiOdds?.yes ?? edgeModel.marketProbability ?? 0.5,
      winProbability: edgeModel.modelProbability,
      lastUpdated: new Date().toISOString(),
      simulationCount: 10000,
      predictionDataQuality: edgeModel.dataQuality,
      matchupDelta: edgeModel.edge,
      qaStatus: edgeModel.missingData.length ? "adjusted" : "verified",
      qaNotes: `Model=${MODEL_VERSION}; prompt=${PROMPT_VERSION}; recommendation=${edgeModel.recommendation}; selected=${edgeModel.selectedTeam}; fairOdds=${edgeModel.fairOdds}; dataQuality=${edgeModel.dataQuality}; risks=${edgeModel.riskFactors.join(" | ") || "none"}.`,
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
    const normalizedLeague = this.normalizeLeagueValue(league, league);
    const docId = `${normalizedLeague}-${date}`;
    const scheduleRef = doc(db, "schedules", docId);

    if (!force) {
      try {
        const cached = await getDoc(scheduleRef);
        if (cached.exists()) {
          const data = cached.data();
          if (Array.isArray(data.games) && data.games.length) {
            const normalizedCachedGames = this.normalizeScheduleGames(data.games, normalizedLeague, date);
            if (normalizedCachedGames.length) {
              // Self-heal old cached schedules where API-Sports stored league as an object.
              await setDoc(scheduleRef, {
                league: normalizedLeague,
                date,
                games: normalizedCachedGames,
                lastUpdated: data.lastUpdated || new Date().toISOString(),
                normalizedAt: new Date().toISOString(),
                source: data.source || "cache-normalized",
              }, { merge: true });
              return normalizedCachedGames;
            }
          }
        }
      } catch (error) {
        console.warn("[Schedule] Cache read failed:", error);
      }
    }

    const dateObj = new Date(`${date}T12:00:00`);
    let rawGames: any[] = [];
    try {
      if (normalizedLeague === "NBA") rawGames = await apiSportsService.getGames(dateObj) as any;
      else if (normalizedLeague === "MLB") rawGames = await apiSportsMlbService.getGames(dateObj) as any;
      else if (normalizedLeague === "NHL") rawGames = await apiSportsNhlService.getGames(dateObj) as any;
    } catch (error) {
      console.warn(`[Schedule] API-Sports ${normalizedLeague} fetch failed:`, error);
    }

    let games = this.normalizeScheduleGames(rawGames, normalizedLeague, date);

    if (!games.length) {
      try {
        games = this.normalizeScheduleGames(await espnService.getSchedule(normalizedLeague, dateObj), normalizedLeague, date);
      } catch (error) {
        console.warn(`[Schedule] ESPN ${normalizedLeague} fetch failed:`, error);
      }
    }

    try {
      await setDoc(scheduleRef, {
        league: normalizedLeague,
        date,
        games,
        lastUpdated: new Date().toISOString(),
        source: "deterministic-api-normalized",
      }, { merge: true });
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
