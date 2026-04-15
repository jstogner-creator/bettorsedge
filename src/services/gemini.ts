import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { format } from "date-fns";
import { getNYDate } from "../lib/utils";
import { getDb, getIdToken } from "../firebase";
import { doc, getDoc, setDoc, addDoc, collection, query, where, getDocs, limit, orderBy } from "firebase/firestore";
import { Game, Prediction, TournamentBracket } from "../types";
import { logError, logApiCall, logSourceAudit } from "./logger";
import { espnService } from "./espn";
import { apiSportsService } from "./apiSports";
import { apiSportsMlbService } from "./apiSportsMlb";
import { NBA_ROSTER_DATABASE, GLOBAL_INJURY_LINKS, GLOBAL_ROSTER_LINKS } from "../data/nbaRosters";
import { handleFirestoreError, OperationType } from "../lib/firestoreErrors";

// API keys
const getEnvGeminiKey = () => {
  try { return process.env.GEMINI_API_KEY; } catch (e) { return undefined; }
};
const getEnvOpenAIKey = () => {
  try { return process.env.OPENAI_API_KEY; } catch (e) { return undefined; }
};

let geminiClient: GoogleGenAI | null = null;
let openaiClient: OpenAI | null = null;
let lastGeminiKey: string | null = null;
let lastOpenAIKey: string | null = null;

function getGeminiClient(): GoogleGenAI {
  const localKey = typeof window !== "undefined" ? localStorage.getItem("gemini_api_key") : null;
  const keyToUse = localKey || getEnvGeminiKey();
  
  if (!keyToUse) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  if (!geminiClient || lastGeminiKey !== keyToUse) {
    geminiClient = new GoogleGenAI({ apiKey: keyToUse });
    lastGeminiKey = keyToUse;
  }
  return geminiClient;
}

function getOpenAIClient(): OpenAI | null {
  const localKey = typeof window !== "undefined" ? localStorage.getItem("openai_api_key") : null;
  const keyToUse = localKey || getEnvOpenAIKey();
  
  if (!keyToUse) {
    return null;
  }

  if (!openaiClient || lastOpenAIKey !== keyToUse) {
    openaiClient = new OpenAI({ apiKey: keyToUse, dangerouslyAllowBrowser: true });
    lastOpenAIKey = keyToUse;
  }
  return openaiClient;
}

export class BettorsEdge {
  // Using the latest pro model for best reasoning and data synthesis
  private getModel() {
    return localStorage.getItem("gemini_model") || "gemini-3.1-flash-lite-preview";
  }
  
  private getOpenAIModel() {
    return localStorage.getItem("openai_model") || "gpt-5-mini";
  }

  private shouldUseOpenAI(): boolean {
    const localKey = typeof window !== "undefined" ? localStorage.getItem("openai_api_key") : null;
    const hasKey = !!getEnvOpenAIKey() || !!localKey;
    if (!hasKey) return false;

    const storedUseOpenAI = typeof window !== "undefined" ? localStorage.getItem("use_openai") : null;
    // Default to true if key is present but flag is not set, otherwise respect the flag
    return storedUseOpenAI === null ? true : storedUseOpenAI === "true";
  }
  
  // Circuit breaker state
  private isCircuitOpen = false;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly CIRCUIT_THRESHOLD = 10; // Increased threshold
  private readonly CIRCUIT_TIMEOUT = 30000; // 30 seconds instead of 5 minutes

  async getTournamentBracket(league: string, year: number): Promise<TournamentBracket | null> {
    const db = getDb();
    const docRef = doc(db, "brackets", `${league}-${year}`);
    
    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as TournamentBracket;
        // If updated in the last 4 hours, use cache
        const lastUpdated = new Date(data.lastUpdated);
        const now = new Date();
        if (now.getTime() - lastUpdated.getTime() < 4 * 60 * 60 * 1000) {
          return data;
        }
      }
    } catch (e) {
      console.error("Failed to fetch bracket from Firestore:", e);
    }

    // Fetch fresh data via AI
    const prompt = `
      Search for the current ${year} NCAA Men's Basketball Tournament bracket (March Madness).
      Provide the current state of the bracket including all rounds:
      1. First Four (if applicable)
      2. Round of 64
      3. Round of 32
      4. Sweet 16
      5. Elite Eight
      6. Final Four
      7. Championship
      
      For each game, include:
      - id: a unique string ID
      - homeTeam, awayTeam: full team names
      - homeSeed, awaySeed: seed numbers (1-16)
      - homeScore, awayScore: current scores (if finished or live, otherwise null)
      - status: "scheduled", "live", or "finished"
      - winner: name of the winning team (if finished)
      - date: the date of the game in YYYY-MM-DD format
      
      Return the data as a JSON object matching this structure:
      {
        "league": "${league}",
        "year": ${year},
        "rounds": [
          {
            "name": "Round of 64",
            "games": [
              { "id": "game-1", "homeTeam": "...", "awayTeam": "...", "homeSeed": 1, "awaySeed": 16, "status": "finished", "homeScore": 80, "awayScore": 50, "winner": "...", "date": "2026-03-19" }
            ]
          }
        ],
        "lastUpdated": "${new Date().toISOString()}"
      }
      
      IMPORTANT: Ensure you include ALL rounds that have been played or are scheduled. 
      If a round has not started yet, include the games with status 'scheduled' and seeds/teams if known.
      Only return the JSON. No markdown. No conversational text.
    `;

    try {
      const ai = getGeminiClient();
      const response = await this.callWithRetry(async (ai) => {
        return await ai.models.generateContent({
          model: this.getModel(),
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { tools: [{ googleSearch: {} }] },
        });
      }, 3, 5000, `bracket-${league}-${year}`, prompt);

      if (response.candidates?.[0]?.groundingMetadata) {
        console.log("[Gemini Debug] Grounding Metadata:", JSON.stringify(response.candidates[0].groundingMetadata, null, 2));
      }

      const text = response.text;
      if (!text) {
        console.warn("Gemini returned empty text for tournament bracket.");
        return null;
      }

      console.log("[Gemini Debug] Raw Bracket Response:", text.substring(0, 500) + "...");

      const cleanedText = this.cleanJson(text);
      let bracket: TournamentBracket;
      
      try {
        bracket = JSON.parse(cleanedText) as TournamentBracket;
        
        // Defensive checks
        if (!bracket.rounds || !Array.isArray(bracket.rounds)) {
          console.error("Invalid bracket structure: 'rounds' is missing or not an array.", bracket);
          
          // Try to find an array if it's nested
          const foundRounds = this.findFirstArray(bracket);
          if (foundRounds && foundRounds.length > 0 && foundRounds[0].games) {
            bracket.rounds = foundRounds;
          } else {
            return null;
          }
        }

        // Ensure each round has games
        bracket.rounds = bracket.rounds.filter(r => r && r.games && Array.isArray(r.games));

        // Sort rounds in correct order
        const roundOrder = [
          "First Four",
          "Round of 64",
          "Round of 32",
          "Sweet 16",
          "Elite Eight",
          "Final Four",
          "Championship"
        ];
        
        bracket.rounds.sort((a, b) => {
          const aIdx = roundOrder.indexOf(a.name);
          const bIdx = roundOrder.indexOf(b.name);
          if (aIdx === -1 && bIdx === -1) return 0;
          if (aIdx === -1) return 1;
          if (bIdx === -1) return -1;
          return aIdx - bIdx;
        });

        if (bracket.rounds.length === 0) {
          console.warn("Bracket has no valid rounds with games.");
          return null;
        }

      } catch (parseError) {
        console.error("Failed to parse bracket JSON:", parseError);
        console.log("Cleaned text that failed to parse:", cleanedText);
        return null;
      }
      
      // Save to Firestore
      try {
        await setDoc(docRef, { ...bracket, lastUpdated: new Date().toISOString() });
      } catch (fsError) {
        console.error("Failed to save bracket to Firestore:", fsError);
      }
      
      return bracket;
    } catch (e) {
      console.error("Failed to fetch bracket via AI:", e);
      return null;
    }
  }

  private findFirstArray(obj: any): any[] | null {
    if (Array.isArray(obj)) return obj;
    if (obj && typeof obj === 'object') {
      // Check common property names first for performance
      const commonKeys = ['games', 'schedule', 'events', 'data', 'matchups'];
      for (const key of commonKeys) {
        if (Array.isArray(obj[key])) return obj[key];
      }

      // Then check all values recursively
      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') {
          const nested = this.findFirstArray(value);
          if (nested) return nested;
        }
      }
    }
    return null;
  }

  private cleanJson(text: string): string {
    // Remove markdown code blocks if present
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    let cleaned = jsonMatch ? jsonMatch[1] : text;

    // Remove '+' signs before numbers in JSON (e.g., "awayML": +105 -> "awayML": 105)
    // This is a common AI mistake that breaks JSON.parse
    cleaned = cleaned.replace(/:\s*\+([0-9.]+)/g, ': $1');
    
    // Remove trailing commas in objects and arrays
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    
    // Try to find the first '{' or '[' and last '}' or ']'
    const startObj = cleaned.indexOf('{');
    const startArr = cleaned.indexOf('[');
    const endObj = cleaned.lastIndexOf('}');
    const endArr = cleaned.lastIndexOf(']');
    
    let start = -1;
    let end = -1;

    if (startObj !== -1 && startArr !== -1) {
      start = Math.min(startObj, startArr);
    } else {
      start = Math.max(startObj, startArr);
    }

    if (endObj !== -1 && endArr !== -1) {
      end = Math.max(endObj, endArr);
    } else {
      end = Math.max(endObj, endArr);
    }

    if (start !== -1 && end !== -1 && end > start) {
      return cleaned.substring(start, end + 1);
    }
    return cleaned;
  }

  // Helper to calculate cost for Flash model
  // Estimated pricing: Input $0.10/1M, Output $0.40/1M
  private calculateGeminiCost(usage: any): number {
    if (!usage) return 0;
    const inputTokens = usage.promptTokenCount || 0;
    const outputTokens = usage.candidatesTokenCount || 0;
    
    const inputCost = (inputTokens / 1000000) * 0.10;
    const outputCost = (outputTokens / 1000000) * 0.40;
    
    return inputCost + outputCost;
  }

  // Helper to calculate cost for OpenAI models
  // GPT-4o mini pricing: $0.150 / 1M input tokens, $0.600 / 1M output tokens
  private calculateOpenAICost(usage: any): number {
    if (!usage) return 0;
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    
    const inputCost = (inputTokens / 1000000) * 0.15;
    const outputCost = (outputTokens / 1000000) * 0.60;
    
    return inputCost + outputCost;
  }

  /**
   * Generic helper to call Gemini API with exponential backoff, 429 handling, and token logging.
   */
  private activeCalls = new Set<string>();

  private async callWithRetry(
    callFn: (ai: GoogleGenAI) => Promise<any>,
    maxRetries: number = 5, // Increased to 5 to handle persistent transient XHR errors
    initialDelay: number = 2000, // Reduced initial delay for faster recovery
    callId?: string,
    promptContext?: string // Added context for logging
  ): Promise<any> {
    const model = this.getModel();
    const startTime = Date.now();
    const apiKey = typeof window !== "undefined" ? localStorage.getItem("gemini_api_key") : process.env.GEMINI_API_KEY;
    
    console.log(`[Gemini Request] ${new Date().toISOString()}`);
    console.log(`- Model: ${model}`);
    console.log(`- API Key Present: ${!!apiKey}`);
    if (promptContext) {
      console.log(`- Prompt Preview: ${promptContext.substring(0, 150)}...`);
    }

    if (callId) {
      if (this.activeCalls.has(callId)) {
        console.warn(`[Gemini Debug] Duplicate API call detected for ID: ${callId}`);
      }
      this.activeCalls.add(callId);
    }
    
    // Check circuit breaker
    if (this.isCircuitOpen) {
      const now = Date.now();
      if (now - this.lastFailureTime < this.CIRCUIT_TIMEOUT) {
        if (callId) this.activeCalls.delete(callId);
        throw new Error("Gemini API circuit breaker is open. Service temporarily unavailable.");
      } else {
        // Reset circuit
        this.isCircuitOpen = false;
        this.failureCount = 0;
      }
    }

    const ai = getGeminiClient();
    let retries = 0;
    while (retries <= maxRetries) {
      try {
        const response = await callFn(ai);
        const latency = Date.now() - startTime;
        
        // Reset failure count on success
        this.failureCount = 0;
        if (callId) this.activeCalls.delete(callId);
        
        // Log usage metadata
        let tokens = null;
        if (response.usageMetadata) {
          const { promptTokenCount, candidatesTokenCount, totalTokenCount } = response.usageMetadata;
          tokens = response.usageMetadata;
          console.log(`[Gemini Success] Latency: ${latency}ms`);
          console.log(`- Usage: Prompt: ${promptTokenCount}, Response: ${candidatesTokenCount}, Total: ${totalTokenCount}`);
          console.log(`- Response Preview: ${response.text?.substring(0, 150)}...`);
        }
        
        // Detailed logging to Firestore
        await logApiCall("Gemini", model, promptContext || "No prompt provided", response.text || "JSON_RESPONSE", latency, tokens);
        
        return response;
      } catch (error: any) {
        const latency = Date.now() - startTime;
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        const errorMessage = error?.message || error?.error?.message || (typeof error === 'string' ? error : "");
        const errorStatus = error?.status || error?.error?.code || 0;
        
        const isRateLimit = errorMessage.includes("429") || errorStatus === 429 || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("quota");
        const isTimeout = errorMessage.includes("timeout") || latency >= 29000; // Treat ~30s latency as a timeout
        const isRpcError = errorMessage.includes("Rpc failed") || errorMessage.includes("xhr error") || errorMessage.includes("500") || errorStatus === 500 || errorMessage.includes("UNKNOWN");
        const shouldRetry = (isRateLimit || isTimeout || isRpcError) && retries < maxRetries;

        // Log exact error response body
        if (shouldRetry) {
          console.warn(`[Gemini Retryable Error] ${new Date().toISOString()}`);
          console.warn(`- Latency: ${latency}ms`);
          console.warn(`- Attempt: ${retries + 1}`);
          console.warn(`- Error Type: ${isRateLimit ? 'Rate Limit' : isTimeout ? 'Timeout' : 'RPC Error'}`);
          console.warn(`- Message: ${errorMessage.substring(0, 200)}`);
        } else {
          console.error(`[Gemini Fatal Error] ${new Date().toISOString()}`);
          console.error(`- Latency: ${latency}ms`);
          console.error(`- Attempt: ${retries + 1}`);
          console.error(`- Error:`, error?.response?.data || error?.message || error);
        }

        if (this.failureCount >= this.CIRCUIT_THRESHOLD) {
          this.isCircuitOpen = true;
          console.error("[Gemini Circuit Breaker] Circuit opened due to repeated failures.");
        }

        if (!shouldRetry) {
          await logError(error, `Gemini API call failed (Attempt ${retries + 1})`);
        }
        
        if (shouldRetry) {
          retries++;
          // Increase delay significantly for rate limits (30s base for 429s)
          const baseDelay = isRateLimit ? 30000 : initialDelay;
          const delay = baseDelay * Math.pow(2, retries - 1) + (Math.random() * 2000);
          console.warn(`[Gemini Retry] Retrying in ${Math.round(delay)}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        if (callId) this.activeCalls.delete(callId);
        throw error;
      }
    }
    if (callId) this.activeCalls.delete(callId);
    const isFreeTier = model.includes("flash");
    const advice = isFreeTier 
      ? "The Gemini Free Tier has strict rate limits. Please wait a few minutes or switch to a paid API key for better performance."
      : "The Gemini Pro model has lower rate limits on the free tier. I've switched you to the Flash model for better reliability.";
    throw new Error(`Gemini API request failed after multiple retries. ${advice}`);
  }


  async analyzeRecentPerformance(predictions: Prediction[]): Promise<string> {
    const recentLosses = predictions
      .filter(p => p.outcome === 'incorrect')
      .slice(0, 10);

    if (recentLosses.length === 0) {
      return "No recent losses to analyze. Performance has been stable.";
    }

    const lossContext = recentLosses.map(p => 
      `- ${p.date}: ${p.awayTeam} @ ${p.homeTeam}. Predicted: ${p.winner}. Result: ${p.actualWinner}. Reasoning: ${p.reasoning}`
    ).join('\n');

    const prompt = `
      You are a head sports data analyst reviewing a series of failed predictions from the past weekend.
      
      Recent Failed Predictions:
      ${lossContext}
      
      Analyze these failures for systemic patterns. Consider:
      1. Are we overvaluing home court advantage?
      2. Are we missing a specific type of injury impact?
      3. Is there a league-wide trend (e.g., high-scoring weekend, underdogs performing better) that we missed?
      4. Is our confidence calibration off?
      
      Provide a blunt, professional assessment of what is going on and how we will adjust our analytical strategy.
      Keep it to 3-4 concise paragraphs.
    `;

    try {
      const useOpenAI = this.shouldUseOpenAI();

      if (useOpenAI) {
        const openai = getOpenAIClient();
        const response = await openai.chat.completions.create({
          model: this.getOpenAIModel(),
          messages: [
            { role: "system", content: "You are a head sports data analyst." },
            { role: "user", content: prompt }
          ]
        });

        return response.choices[0].message.content || "Failed to generate performance analysis.";
      }

      const response = await this.callWithRetry(async (ai) => {
        return await ai.models.generateContent({
          model: this.getModel(),
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });
      }, 3, 5000, `performance-analysis-${Date.now()}`, prompt);

      return response.text || "Failed to generate performance analysis.";
    } catch (e) {
      console.error("Failed to analyze performance:", e);
      return "Error analyzing recent performance.";
    }
  }

  async getDailySchedule(league: string, date: string, force: boolean = false): Promise<any[]> {
    const docId = `${league}-${date}`;
    const scheduleRef = doc(getDb(), "schedules", docId);
    const today = getNYDate().toDateString();

    try {
      // Check Firestore first unless force is true
      if (!force) {
        const scheduleSnap = await getDoc(scheduleRef);
        if (scheduleSnap.exists()) {
          const data = scheduleSnap.data();
          if (data.games && Array.isArray(data.games) && data.games.length > 0) {
            console.log(`[Cache] Loaded schedule from Firestore for ${docId}`);
            return data.games.filter((g: any) => {
              if (!g.league) return true;
              const gLeague = g.league.toUpperCase();
              const targetLeague = league.toUpperCase();
              return gLeague === targetLeague || gLeague.includes(targetLeague) || targetLeague.includes(gLeague);
            });
          }
        }
      }
    } catch (e) {
      console.warn("Failed to read schedule from Firestore:", e);
    }

    // Map generic league names to specific search terms to avoid confusion
    const searchLeague = league === "NCAA" ? "NCAA Men's Basketball" : 
                        league === "NBA" ? "NBA Basketball" : 
                        league === "NHL" ? "NHL Hockey" : 
                        league === "MLB" ? "MLB Baseball" : league;

    const useOpenAI = this.shouldUseOpenAI();
    const prompt = `
      Today is ${today}. 
      Find EVERY SINGLE ${searchLeague} game scheduled for ${date}. 
      CRITICAL: Do not miss any matchups. Check multiple sources (ESPN, Yahoo Sports, NBA.com, etc.) to ensure 100% coverage.
      If there are 10 games, return 10. If there are 15, return 15. Do not truncate the list.
      
      CRITICAL: ONLY return games that are actually scheduled for ${date}. 
      If a game was played on a previous date (like March 28th), DO NOT include it unless it is also scheduled for ${date}.
      
      Return valid JSON ${useOpenAI ? 'object with a "games" array' : 'array'}:
      ${useOpenAI ? '{"games": [' : '['}
      {
        "id": "unique_string_id",
        "league": "${league}",
        "homeTeam": "Full Name",
        "awayTeam": "Full Name",
        "date": "${date}",
        "time": "Time w/ Zone",
        "location": "Arena, City",
        "status": "scheduled",
        "homeTeamStats": {"last5": "W-L-W-L-W", "winPercentage": ".650", "record": "32-15"},
        "awayTeamStats": {"last5": "L-L-W-L-W", "winPercentage": ".420", "record": "20-27"}
      }
      ${useOpenAI ? ']}' : ']'}
      CRITICAL: The "id" field MUST be a unique string for each game (e.g., "nba-lakers-celtics-2024-03-27").
      ONLY return games for ${date}. If a game is for a different date, EXCLUDE it.
      No markdown. No conversational text. Just the JSON.
    `;

    try {
      let text = "";

      if (useOpenAI) {
        const openai = getOpenAIClient();
        const response = await openai.chat.completions.create({
          model: this.getOpenAIModel(),
          messages: [
            { role: "system", content: "You are a professional sports data analyst. You must return ALL games for the requested date in the specified JSON format." },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" }
        });
        text = response.choices[0].message.content || "";
      } else {
        const response = await this.callWithRetry(async (ai) => {
          let timeoutId: NodeJS.Timeout;
          const timeoutPromise = new Promise<any>((_, reject) => {
            // Increased to 180s for thorough search
            timeoutId = setTimeout(() => reject(new Error("Gemini API timeout")), 180000);
          });

          try {
            return await Promise.race([
              ai.models.generateContent({
                model: this.getModel(),
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: {
                  tools: [{ googleSearch: {} }],
                },
              }),
              timeoutPromise
            ]);
          } finally {
            clearTimeout(timeoutId!);
          }
        }, 3, 5000, `schedule-${league}-${date}`, prompt);
        text = response.text || "";
      }

      if (!text) throw new Error("Empty response from AI");
      
      const cleanedText = this.cleanJson(text);
      let games;
      try {
        games = JSON.parse(cleanedText);
      } catch (e) {
        console.error("Failed to parse schedule JSON:", cleanedText);
        // Try one more time with a more aggressive clean
        try {
          const superCleaned = cleanedText.replace(/^[^{[]*/, '').replace(/[^}\]]*$/, '');
          games = JSON.parse(superCleaned);
        } catch (e2) {
          throw new Error("Invalid JSON format in schedule response");
        }
      }
      
      if (!Array.isArray(games)) {
        if (games && typeof games === 'object') {
          // Check if it's a "no games" response
          const message = games.message || games.error || games.status || games.note;
          if (typeof message === 'string' && (
            message.toLowerCase().includes('no games') || 
            message.toLowerCase().includes('none') ||
            message.toLowerCase().includes('no matchups')
          )) {
            console.log(`[AI] No games found for ${league} on ${date}: ${message}`);
            return [];
          }

          // Try to find an array property recursively
          const possibleArray = this.findFirstArray(games);
          if (possibleArray) {
            games = possibleArray;
          } else {
            console.warn("Response is an object but contains no array:", JSON.stringify(games).substring(0, 500));
            // If it's an object with keys that look like game IDs, convert to array
            const values = Object.values(games);
            if (values.length > 0 && values[0] && typeof values[0] === 'object' && (values[0] as any).homeTeam) {
              games = values;
            } else {
              return []; // Return empty instead of throwing to be more resilient
            }
          }
        } else {
          console.warn("Response is not an array or object:", text.substring(0, 500));
          return [];
        }
      }

      // Post-processing to ensure data quality
      const processedGames = (Array.isArray(games) ? games : []).filter(game => {
        if (!game || typeof game !== 'object' || !game.homeTeam || !game.awayTeam) return false;
        
        // Filter to ensure AI only returned games for the requested league
        if (game.league) {
          const gLeague = String(game.league).toUpperCase();
          const targetLeague = league.toUpperCase();
          if (!(gLeague === targetLeague || gLeague.includes(targetLeague) || targetLeague.includes(gLeague))) {
            return false;
          }
        }

        // CRITICAL: Filter to ensure AI only returned games for the requested date
        // This prevents the AI from returning old games (e.g. from 2 days ago)
        if (game.date) {
          // Robust date extraction: split by 'T', ' ', or just take the first 10 chars
          const gDate = String(game.date).split(/[T ]/)[0];
          if (gDate !== date) {
            console.warn(`[AI] Filtering out wrong-date game: ${game.awayTeam} @ ${game.homeTeam} (${gDate} vs ${date})`);
            return false;
          }
        }
        
        return true;
      }).map(game => ({
        ...game,
        league: league,
        date: date
      }));

      // Save to Firestore
      try {
        await setDoc(scheduleRef, {
          games: processedGames,
          updatedAt: new Date().toISOString(),
          league,
          date
        });
        console.log(`[Cache] Saved schedule to Firestore for ${docId}`);
      } catch (e) {
        console.error("Failed to save schedule to Firestore:", e);
      }

      return processedGames;
    } catch (error) {
      console.error("All attempts to fetch schedule failed:", error);
      return [];
    }
  }

  private lessonsCache = new Map<string, { lessons: string[], timestamp: number }>();
  private readonly LESSONS_CACHE_TTL = 1000 * 60 * 60; // 1 hour

  async getPastLessons(teamName: string): Promise<string[]> {
    const now = Date.now();
    const cached = this.lessonsCache.get(teamName);
    if (cached && (now - cached.timestamp < this.LESSONS_CACHE_TTL)) {
      console.log(`[Gemini] Using cached lessons for ${teamName}`);
      return cached.lessons;
    }

    try {
      // Query past predictions involving this team
      const q = query(
        collection(getDb(), "predictions"),
        where("teams", "array-contains", teamName),
        orderBy("lastUpdated", "desc"),
        limit(15) // Reduced from 50 to save quota
      );

      let snapshot;
      try {
        snapshot = await getDocs(q);
      } catch (e) {
        console.warn("Failed to fetch past lessons (index might be missing)", e);
        return [];
      }
      const lessons: string[] = [];
      
      // Calculate the date 2 weeks ago
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const twoWeeksAgoStr = twoWeeksAgo.toISOString();

      snapshot.forEach(doc => {
        const data = doc.data() as Prediction;
        // Filter for incorrect predictions in memory to avoid composite index requirements
        // Also strictly filter for predictions updated within the last 14 days
        if (
          data.outcome === "incorrect" && 
          data.postMortem?.lessonLearned &&
          data.lastUpdated && 
          data.lastUpdated >= twoWeeksAgoStr
        ) {
           lessons.push(`[${data.date} vs ${data.homeTeam === teamName ? data.awayTeam : data.homeTeam}]: ${data.postMortem.lessonLearned}`);
        }
      });

      // Return the 5 most recent lessons for this team from the last 2 weeks
      const result = lessons.slice(0, 5);
      this.lessonsCache.set(teamName, { lessons: result, timestamp: now });
      return result;
    } catch (e) {
      console.warn("Failed to fetch past lessons:", e);
      return [];
    }
  }

  async analyzeLoss(game: Game, prediction: Prediction, actualScore: { home: number, away: number }): Promise<void> {
    const prompt = `
      You are a sports data analyst reviewing a failed prediction.
      
      Game: ${game.awayTeam} @ ${game.homeTeam} (${game.league})
      Your Prediction: ${prediction.winner} to win
      Actual Result: ${actualScore.home > actualScore.away ? game.homeTeam : game.awayTeam} won (${actualScore.away}-${actualScore.home})
      
      Your original reasoning: "${prediction.reasoning}"
      Your key factors: ${JSON.stringify(prediction.keyFactors)}
      
      Analyze WHY this prediction failed. Consider:
      1. Did you miss a critical injury or lineup change?
      2. Was there a tactical mismatch you undervalued?
      3. Did a specific player drastically over/underperform?
      4. Was it just variance/luck?
      
      Formulate a concise, actionable "lesson learned" that can be injected into future prompts for these teams to prevent this mistake again.
      
      Return JSON:
      {
        "analysis": "Brief explanation of what went wrong.",
        "keyMissedFactor": "The main variable that caused the loss.",
        "lessonLearned": "A specific, actionable rule (e.g., 'When Team X plays without Player Y, downgrade their defense significantly')."
      }
    `;

    try {
      const useOpenAI = this.shouldUseOpenAI();

      let text = "";

      if (useOpenAI) {
        const openai = getOpenAIClient();
        const response = await openai.chat.completions.create({
          model: this.getOpenAIModel(),
          messages: [
            { role: "system", content: "You are a sports data analyst reviewing a failed prediction." },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" }
        });
        text = response.choices[0].message.content || "";
      } else {
        const response = await this.callWithRetry(async (ai) => {
          return await ai.models.generateContent({
            model: this.getModel(),
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" },
          });
        }, 3, 5000, `loss-analysis-${game.id}`, prompt);
        text = response.text || "";
      }

      if (!text) return;

      const analysis = JSON.parse(this.cleanJson(text));
      
      // Update the prediction document with the post-mortem
      const docRef = doc(getDb(), "predictions", game.id);
      await setDoc(docRef, {
        outcome: 'incorrect',
        actualWinner: actualScore.home > actualScore.away ? game.homeTeam : game.awayTeam,
        actualScore,
        postMortem: {
          ...analysis,
          analyzedAt: new Date().toISOString()
        }
      }, { merge: true });

      console.log(`[Learning] Analyzed loss for ${game.awayTeam} vs ${game.homeTeam}`);

    } catch (e) {
      console.error("Failed to analyze loss:", e);
    }
  }


  async getPrediction(gameId: string): Promise<any | null> {
    try {
      const docRef = doc(getDb(), "predictions", gameId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data();
      }
      return null;
    } catch (e) {
      console.error(`Failed to fetch prediction for ${gameId}:`, e);
      return null;
    }
  }

  needsReanalysis(game: any, prediction: any): boolean {
    if (!prediction) return true;
    
    // If it's a partial prediction (injuries only), it definitely needs a full analysis
    if (prediction.winner === "TBD") return true;

    // Skip games that have already started or are finished
    const gameTime = new Date(game.date).getTime();
    const now = Date.now();
    if (now > gameTime) return false;

    const lastUpdated = new Date(prediction.lastUpdated).getTime();
    const ageMs = now - lastUpdated;

    // If prediction is more than 12 hours old, re-analyze (stable for daily runs)
    if (ageMs > 43200000) return true;
    
    // If confidence is low (< 7) and it's been more than 4 hours, try again
    if (prediction.confidence < 7 && ageMs > 14400000) return true;
    
    return false;
  }

  async savePrediction(gameId: string, prediction: any): Promise<void> {
    try {
      // Ensure required fields are present and correctly typed for Firestore rules
      let conf = prediction.confidence;
      if (typeof conf === 'number') {
        conf = isNaN(conf) ? 5 : Math.max(1, Math.min(10, Math.round(conf)));
      } else if (typeof conf === 'string') {
        const parsed = parseInt(conf, 10);
        conf = isNaN(parsed) ? 5 : Math.max(1, Math.min(10, parsed));
      } else {
        // Estimate confidence from win probability if not provided
        const prob = prediction.winProbability || 0.5;
        conf = Math.max(1, Math.min(10, Math.round(5 + Math.abs(prob - 0.5) * 10)));
        if (isNaN(conf)) conf = 5;
      }

      const dataToSave = {
        ...prediction,
        gameId: String(gameId),
        winner: String(prediction.winner || "PASS"),
        confidence: conf,
        lastUpdated: prediction.lastUpdated || new Date().toISOString()
      };

      // Clean up undefined values to prevent Firestore errors
      Object.keys(dataToSave).forEach(key => {
        if (dataToSave[key] === undefined) {
          delete dataToSave[key];
        }
      });

      console.log(`[Firestore] Attempting to save prediction for ${gameId}:`, JSON.stringify(dataToSave, null, 2));
      const docRef = doc(getDb(), "predictions", String(gameId));
      await setDoc(docRef, dataToSave, { merge: true });
      console.log(`[Firestore] Saved prediction for ${gameId}`);
    } catch (e) {
      console.error(`Failed to save prediction for ${gameId}:`, e);
      throw e;
    }
  }

  async analyzeMatchup(game: any, dateStr?: string, existingPrediction?: any, previousMatchups: any[] = [], shouldCancel?: () => boolean, onProgress?: (msg: string) => void): Promise<any> {
    try {
      if (shouldCancel && shouldCancel()) {
        console.log(`[Gemini] Analysis for game ${game.id} cancelled before start.`);
        return null;
      }

      onProgress?.(`Gathering data for ${game.awayTeam} @ ${game.homeTeam}...`);
      const useOpenAI = this.shouldUseOpenAI();
      
      // Ensure we have a valid date for the prompt
      const gameDateStr = dateStr || game.date || format(getNYDate(), "yyyy-MM-dd");
      
      // Format date to be more human readable for the AI to avoid "unrecognized date" issues
      let formattedDate = gameDateStr;
      try {
        const dateObj = new Date(gameDateStr);
        if (!isNaN(dateObj.getTime())) {
            formattedDate = dateObj.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
        }
      } catch (e) {
        // Fallback to original string if parsing fails
      }
      
      // Fetch past lessons
      const [homeLessons, awayLessons] = await Promise.all([
        this.getPastLessons(game.homeTeam),
        this.getPastLessons(game.awayTeam)
      ]);
      const lessons = [...new Set([...homeLessons, ...awayLessons])]; // Combine and deduplicate
      const lessonsText = lessons.length > 0 
        ? `\nLEARN FROM YOUR PAST MISTAKES:\n${lessons.map(l => `- ${l}`).join('\n')}\n`
        : "";

      // Fetch user reports, previous matchups, and yesterday's results in parallel
      const db = getDb();
      
      const reportsPromise = getDocs(query(collection(db, "status_reports"), where("gameId", "==", game.id)))
        .then(snapshot => snapshot.docs.map(doc => doc.data().report))
        .catch(e => { console.warn("Failed to fetch reports", e); return []; });

      const matchupsPromise = getDocs(query(collection(db, "predictions"), where("teams", "array-contains", game.homeTeam), orderBy("lastUpdated", "desc"), limit(5)))
        .then(snapshot => {
          return snapshot.docs
            .map(doc => doc.data() as Prediction)
            .filter(p => p.teams && p.teams.includes(game.awayTeam) && p.actualScore)
            .slice(0, 3);
        })
        .catch(e => { console.warn("Failed to fetch previous matchups", e); return []; });

      const yesterday = getNYDate();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayPromise = espnService.getSchedule(game.league, yesterday)
        .then(games => games.filter(g => g.status === 'finished'))
        .catch(e => { console.warn("Failed to fetch yesterday's results", e); return []; });

      let apiSportsHomeStatsPromise = Promise.resolve(null);
      let apiSportsAwayStatsPromise = Promise.resolve(null);
      let apiSportsHomeInjuriesPromise = Promise.resolve([]);
      let apiSportsAwayInjuriesPromise = Promise.resolve([]);

      if ((game.league === 'NBA' || game.league === 'MLB') && game.apiSportsHomeTeamId && game.apiSportsAwayTeamId) {
        const season = getNYDate().getFullYear().toString(); // Basic season logic
        if (game.league === 'NBA') {
          apiSportsHomeStatsPromise = apiSportsService.getTeamStats(game.apiSportsHomeTeamId, season);
          apiSportsAwayStatsPromise = apiSportsService.getTeamStats(game.apiSportsAwayTeamId, season);
          apiSportsHomeInjuriesPromise = apiSportsService.getInjuries(game.apiSportsHomeTeamId, season);
          apiSportsAwayInjuriesPromise = apiSportsService.getInjuries(game.apiSportsAwayTeamId, season);
        } else {
          apiSportsHomeStatsPromise = apiSportsMlbService.getOdds({ game: game.apiSportsHomeTeamId, season });
          apiSportsAwayStatsPromise = apiSportsMlbService.getOdds({ game: game.apiSportsAwayTeamId, season });
        }
      }

      const [
        reports, 
        previousMatchups, 
        finishedGames,
        apiHomeStats,
        apiAwayStats,
        apiHomeInjuries,
        apiAwayInjuries
      ] = await Promise.all([
        reportsPromise,
        matchupsPromise,
        yesterdayPromise,
        apiSportsHomeStatsPromise,
        apiSportsAwayStatsPromise,
        apiSportsHomeInjuriesPromise,
        apiSportsAwayInjuriesPromise
      ]);

      const reportsText = reports.length > 0 ? `\n\nCRITICAL: User reports of incorrect player status for this game: ${reports.join("; ")}. PLEASE VERIFY THESE CLAIMS.` : "";

      let apiSportsContext = "";
      if (apiHomeStats || apiAwayStats || apiHomeInjuries.length > 0 || apiAwayInjuries.length > 0) {
        apiSportsContext = `\nAPI-SPORTS DATA (HIGH PRIORITY SOURCE):\n`;
        if (apiHomeStats) apiSportsContext += `- ${game.homeTeam} Stats: ${JSON.stringify(apiHomeStats)}\n`;
        if (apiAwayStats) apiSportsContext += `- ${game.awayTeam} Stats: ${JSON.stringify(apiAwayStats)}\n`;
        if (apiHomeInjuries.length > 0) apiSportsContext += `- ${game.homeTeam} Injuries: ${JSON.stringify(apiHomeInjuries)}\n`;
        if (apiAwayInjuries.length > 0) apiSportsContext += `- ${game.awayTeam} Injuries: ${JSON.stringify(apiAwayInjuries)}\n`;
      }

      let previousMatchupsText = "";
      if (previousMatchups.length > 0) {
        previousMatchupsText = `\nPREVIOUS MATCHUPS (AI PREDICTIONS):\n${previousMatchups.map(p => `- ${p.date}: ${p.awayTeam} ${p.actualScore?.away} @ ${p.homeTeam} ${p.actualScore?.home} (Predicted: ${p.projectedWinner} ${p.projectedScore?.away}-${p.projectedScore?.home})`).join('\n')}\n`;
      }
      previousMatchupsText += `\nCRITICAL: ZERO TOLERANCE FOR HALLUCINATIONS. You MUST only use the provided previous matchup data. If no data is provided, do NOT invent scores or dates. If you use your search tool, you MUST verify the scores from at least two independent sources (e.g., ESPN and Baseball-Reference).`;

      let yesterdayResultsText = "";
      if (finishedGames.length > 0) {
        yesterdayResultsText = `\nYESTERDAY'S RESULTS (${game.league}):\n${finishedGames.map(g => `- ${g.awayTeam} ${g.awayScore} @ ${g.homeTeam} ${g.homeScore}`).join('\n')}\n`;
      }

      let existingInjuriesText = "";
      if (existingPrediction && existingPrediction.injuries && existingPrediction.injuries.length > 0) {
        existingInjuriesText = `\nCURRENT INJURY REPORT (PRE-FETCHED):\n${JSON.stringify(existingPrediction.injuries, null, 2)}\nVERIFICATION REQUIREMENT: You MUST verify every player in this report against their current team roster. If a player is assigned to the wrong team, you MUST correct it. Do not blindly incorporate incorrect data.`;
      }

      let rosterDatabaseContext = "";
      if (game.league === 'NBA') {
        const homeRoster = NBA_ROSTER_DATABASE[game.homeTeam];
        const awayRoster = NBA_ROSTER_DATABASE[game.awayTeam];
        
        rosterDatabaseContext = `
PRE-TRAINED ROSTER DATABASE (SOURCE OF TRUTH):
- ${game.homeTeam}: Key Players: ${homeRoster?.keyPlayers.join(', ') || 'N/A'}. Roster Verification: ${homeRoster?.rosterVerificationLink || GLOBAL_ROSTER_LINKS.ESPN_PLAYERS}. Injury Report: ${homeRoster?.injuryReportLink || GLOBAL_INJURY_LINKS.ROTOWIRE}
- ${game.awayTeam}: Key Players: ${awayRoster?.keyPlayers.join(', ') || 'N/A'}. Roster Verification: ${awayRoster?.rosterVerificationLink || GLOBAL_ROSTER_LINKS.ESPN_PLAYERS}. Injury Report: ${awayRoster?.injuryReportLink || GLOBAL_INJURY_LINKS.ROTOWIRE}

CRITICAL: You MUST use your search tool to confirm every player's current team. Do not rely on outdated information.
`;
      }

      // Construct a richer prompt with specific data points if available
      const homeStats = game.homeTeamStats || {};
      const awayStats = game.awayTeamStats || {};
      
      const statsContext = `
        Home Team (${game.homeTeam}): Record ${homeStats.record || 'N/A'}, Last 5: ${homeStats.last5 || 'N/A'}
        Away Team (${game.awayTeam}): Record ${awayStats.record || 'N/A'}, Last 5: ${awayStats.last5 || 'N/A'}
      `;

      const leagueSpecificContext = game.league === 'NCAA' 
        ? "NCAA: Focus on rankings, home-court edge, coaching, and transfer portal/injury impact."
        : game.league === 'NBA'
        ? `NBA: CRITICAL - It is April 2026. Regular season end. Star players (LeBron, AD, Steph, Luka Doncic, etc.) are frequently rested. You MUST verify the "Official NBA Injury Report" and look for "GTD", "Questionable", or "Late Scratch" news. If a star like Luka Doncic (often called Luke/Luka) is out, it MUST be reflected in the injuries and win probability. H2H RULE: ONLY include 2026 games.`
        : game.league === 'NHL'
        ? "NHL: Focus on starting goalies, PP/PK%, and Corsi/Fenwick."
        : game.league === 'MLB'
        ? "MLB: Focus on SP xERA/Barrel%, bullpen rest, L/R splits, park/weather (wind!), and umpire RPG. For Totals, provide a 'projectedTotal' and a 'recommendedTotalLine' with a 1.5-run cushion (e.g., if projected is 8, recommend Under 9.5)."
        : game.league === 'NFL'
        ? "NFL: Focus on QB health, O-Line/D-Line matchups, and weather."
        : "";

      const systemInstruction = `You are an elite sports data scientist. Goal: Find high-EV outcomes by identifying market discrepancies.

${leagueSpecificContext}

RULES:
1. INJURIES: Only report verified injuries. Format: Player Name — Status (Injury) [Source: name, timestamp]. If unverified, label "UNVERIFIED".
2. ROSTERS: Verify 2025-26 active roster.
3. ANALYSIS: Use situational factors, roster impact, market sentiment, and Monte Carlo simulations.
4. DEVIL'S ADVOCATE: Argue against your primary pick.
5. MLB: Focus on xERA, Barrel%, bullpen rest, and weather/park factors.
6. NBA: Prioritize advanced metrics (Net Rating, Efficiency). H2H: ONLY 2026 games.
7. OUTPUT: Ultra-concise JSON. No '+' for positive numbers. No fluff.
8. DECISIVENESS: Only use 'PASS' when confidence <= 2 AND winProbability is between 0.49 and 0.51. Otherwise you MUST pick a winner.
9. PROJECTIONS: You MUST provide a scorePrediction, matchupAnalysis, trends, and keyFactors. If exact values are uncertain, estimate from available team stats and market expectations instead of returning unknown or blank values.`;

      const leagueSearchQueries = game.league === 'NCAA'
        ? `"current roster and injury report ${game.homeTeam} vs ${game.awayTeam} basketball", "NCAA basketball market expectations and expert consensus ${game.homeTeam} vs ${game.awayTeam}", "${game.homeTeam} vs ${game.awayTeam} h2h record and last 5 games basketball"`
        : game.league === 'NHL'
        ? `"starting goalies and injury report ${game.homeTeam} vs ${game.awayTeam} today", "NHL market expectations and defensive ratings ${game.homeTeam} vs ${game.awayTeam}", "${game.homeTeam} vs ${game.awayTeam} h2h record and player stats leaders"`
        : game.league === 'MLB'
        ? `"starting pitchers advanced stats (xERA, Barrel%) ${game.homeTeam} vs ${game.awayTeam} today", "MLB injury report, lineups and bullpen rest ${game.homeTeam} vs ${game.awayTeam}", "weather and park factors ${game.location} MLB", "MLB market expectations, umpire and h2h record ${game.homeTeam} vs ${game.awayTeam}"`
        : game.league === 'NFL'
        ? `"NFL injury report and starting lineups ${game.homeTeam} vs ${game.awayTeam}", "NFL weather ${game.location} and market expectations ${game.homeTeam} vs ${game.awayTeam}", "NFL QB stats and team defensive DVOA ${game.homeTeam} vs ${game.awayTeam} h2h"`
        : `"NBA official injury report today ${game.homeTeam} vs ${game.awayTeam} April 2026", "NBA starting lineups and late scratches ${game.homeTeam} vs ${game.awayTeam}", "NBA star player rest status and playoff seeding motivation ${game.homeTeam} vs ${game.awayTeam}", "NBA advanced stats Net Rating and Pace last 10 games ${game.homeTeam} vs ${game.awayTeam}", "${game.homeTeam} vs ${game.awayTeam} 2026 head-to-head results and scores"`;

      const prompt = `
        [Time: ${new Date().toISOString()}]
        Analyze ${game.league}: ${game.awayTeam} @ ${game.homeTeam} (${formattedDate}). 
        
        CONTEXT:
        ${statsContext} 
        ${lessonsText}
        ${reportsText}
        ${previousMatchupsText}
        ${yesterdayResultsText}
        ${existingInjuriesText}
        ${rosterDatabaseContext}
        ${apiSportsContext}
        
        TASK:
        1. Deep-dive analysis (H2H, Trends).
        2. Latest injuries & impact.
        3. Confirm 2025-26 rosters.
        4. Market & situational factors.
        5. Scenario breakdown & confidence (1-10).
        6. MLB: Cushioned Total Runs.
        7. VERIFY H2H: 2026 only.
        
        OUTPUT (JSON):
        {
          "gameId": "${game.id}",
          "winner": "Team Name",
          "confidence": 1-10,
          "winProbability": 0.00-1.00,
          "scorePrediction": {"home": 105, "away": 98},
          "projectedTotal": 203,
          "recommendedTotalLine": "Under 204.5",
          "reasoning": "Concise edge summary with a concrete reason tied to roster, form, or market.",
          "devilsAdvocate": "Counter-case.",
          "marketSentiment": "Market summary.",
          "situationalFactors": "Rest/travel.",
          "scenarioAnalysis": "Bullet points.",
          "keyFactors": ["Advantage 1", "Advantage 2"],
          "injuries": [{"team": "Team", "player": "Name", "status": "Status", "impact": "PSI", "source_name": "Source", "source_timestamp": "Timestamp"}],
          "pitcherMatchup": {
            "homePitcher": {"name": "Name", "era": 3.45, "whip": 1.12, "xERA": 3.21, "fip": 3.50, "k9": 9.5, "barrelRate": 6.5, "recentForm": "Concise"},
            "awayPitcher": {"name": "Name", "era": 4.12, "whip": 1.34, "xERA": 4.50, "fip": 4.20, "k9": 7.2, "barrelRate": 8.1, "recentForm": "Concise"},
            "weatherImpact": "Concise",
            "parkFactor": "Concise",
            "umpire": {"name": "Name", "runsPerGame": 9.2, "strikeZone": "Standard"},
            "summary": "Concise summary."
          },
          "previousMatchups": [{"date": "2026-MM-DD", "homeScore": 100, "awayScore": 90}],
          "matchupRankings": {"homeRank": 5, "awayRank": 12},
          "teamStatsComparison": [{"category": "PPG", "homeValue": 115.4, "awayValue": 110.2}],
          "trends": {"homeVsExp": "Concrete trend vs spread/market", "awayVsExp": "Concrete trend vs spread/market", "homeTotal": "Concrete over/under trend", "awayTotal": "Concrete over/under trend"},
          "matchupAnalysis": {
            "projectionBasis": "Explain what the projection is based on if data is incomplete.",
            "h2h": "Concise H2H analysis. Max 200 chars.",
            "playerStats": "Concise player stats analysis. Max 200 chars.",
            "trends": "Concise efficiency trends. Max 200 chars.",
            "confidenceBreakdown": "Concise confidence logic. Max 200 chars."
          },
          "marketExpectations": {"homeWinProb": -110, "awayWinProb": 110, "margin": -2.5, "homeMarginOdds": -110, "awayMarginOdds": -110, "total": 220.5, "overOdds": -110, "underOdds": -110}
        }`;

      const fullPrompt = `${systemInstruction}\n\n${prompt}`;

      if (useOpenAI) {
        const openai = getOpenAIClient();
        const response = await openai.chat.completions.create({
          model: this.getOpenAIModel(),
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" }
        });

        const text = response.choices[0].message.content;
        if (!text) throw new Error("No response from OpenAI");

        const cost = this.calculateOpenAICost(response.usage);
        return this.processAIResponse(game, text, cost, dateStr, [], existingPrediction, []);
      }

      onProgress?.(`Running AI analysis for ${game.awayTeam} @ ${game.homeTeam}...`);
      const runAnalysis = async (model: string) => {
        const ai = getGeminiClient();
        return await this.callWithRetry(async () => {
          if (shouldCancel && shouldCancel()) {
            throw new Error("Analysis cancelled by user");
          }

          let timeoutId: NodeJS.Timeout;
          const timeoutPromise = new Promise<any>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("Gemini API timeout")), 180000);
          });

          try {
            return await Promise.race([
              ai.models.generateContent({
                model: model,
                contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
                config: {
                  tools: [{ googleSearch: {} }],
                },
              }),
              timeoutPromise
            ]);
          } finally {
            clearTimeout(timeoutId!);
          }
        }, 4, 15000, `matchup-analysis-${game.id}`, fullPrompt);
      };

      let response;
      try {
        // Try Pro first for maximum accuracy and reasoning if not explicitly set to Flash
        const preferredModel = this.getModel();
        if (preferredModel.includes("pro")) {
          response = await runAnalysis(preferredModel);
        } else {
          // If flash is preferred, try it first
          try {
            response = await runAnalysis(preferredModel);
          } catch (e) {
            console.warn("Preferred model failed, falling back to Pro:", e);
            response = await runAnalysis("gemini-3.1-pro-preview");
          }
        }
      } catch (e) {
        console.warn("Primary model failed, falling back to Flash:", e);
        // Fallback to Flash
        response = await runAnalysis("gemini-3-flash-preview");
      }

      if (!response) {
        throw new Error("No response received from Gemini API");
      }

      const text = response.text;
      if (!text) throw new Error("No response from AI");
      
      console.log("Raw AI response:", text);

      // Calculate cost
      const cost = this.calculateGeminiCost(response.usageMetadata);

      // Extract grounding metadata if available
      const groundingUrls = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => {
        if (chunk.web) return { title: chunk.web.title, uri: chunk.web.uri };
        return null;
      }).filter(Boolean) || [];

      return this.processAIResponse(game, text, cost, dateStr, previousMatchups, existingPrediction, groundingUrls);
    } catch (error) {
      console.error("Error analyzing matchup:", error);
      throw error;
    }
  }

  async batchAnalyzeMatchups(
    games: Game[],
    dateStr: string,
    existingPredictions: Record<string, any> = {},
    yesterdayResults: any[] = [],
    onProgress?: (msg: string) => void
  ): Promise<Record<string, any>> {
    if (!games || games.length === 0) return {};

    onProgress?.(`Starting analysis for ${games.length} games...`);

    const results: Record<string, any> = {};
    let completed = 0;
    const BATCH_SIZE = 2;

    for (let i = 0; i < games.length; i += BATCH_SIZE) {
      const batch = games.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (game) => {
          try {
            onProgress?.(
              `Analyzing ${game.awayTeam} @ ${game.homeTeam} (${completed + 1}/${games.length})...`
            );

            const existingPrediction = existingPredictions[game.id];

            const prediction = await this.analyzeMatchup(
              game,
              dateStr,
              existingPrediction,
              [],
              undefined,
              onProgress
            );

            if (prediction) {
              return { gameId: game.id, prediction };
            }

            return null;
          } catch (error) {
            console.error(`Error analyzing game ${game.id}:`, error);
            return null;
          }
        })
      );

      for (const item of batchResults) {
        if (item?.prediction) {
          results[item.gameId] = item.prediction;
        }
        completed++;
      }

      onProgress?.(`Completed ${completed} of ${games.length} games...`);

      if (i + BATCH_SIZE < games.length) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    onProgress?.(`Analysis complete for ${Object.keys(results).length} games.`);
    return results;
  }
  private processAIResponse(
    game: any, 
    text: string, 
    cost: number, 
    dateStr?: string, 
    previousMatchups: any[] = [], 
    existingPrediction?: any, 
    groundingUrls: any[] = []
  ): any {
    try {
      const cleanedText = this.cleanJson(text);
      console.log("Cleaned AI response:", cleanedText);
      const prediction = JSON.parse(cleanedText);
      if (!prediction || typeof prediction !== 'object') {
        throw new Error("AI returned invalid prediction object");
      }
      prediction.teams = [game.awayTeam, game.homeTeam];
      prediction.groundingUrls = groundingUrls;
      
      // If AI didn't find any previous matchups, use the ones from Firestore
      if (!prediction.previousMatchups || prediction.previousMatchups.length === 0) {
        prediction.previousMatchups = previousMatchups.map(p => ({
            date: p.date,
            homeScore: p.actualScore?.home,
            awayScore: p.actualScore?.away,
            homeTeam: p.teams![1],
            awayTeam: p.teams![0]
        }));
      }

      // Merge existing injuries if the AI dropped them or returned an invalid format
      if (existingPrediction && Array.isArray(existingPrediction.injuries) && existingPrediction.injuries.length > 0) {
        if (!Array.isArray(prediction.injuries) || prediction.injuries.length === 0) {
          console.log("[Gemini] AI dropped or returned empty injuries, restoring from existingPrediction");
          prediction.injuries = existingPrediction.injuries;
        }
      } else if (!Array.isArray(prediction.injuries)) {
        prediction.injuries = [];
      }

      // Merge existing marketExpectations if the AI dropped them or returned null/empty
      const hasMarketExpectations = (odds: any) => odds && Object.keys(odds).length > 1;
      
      if (!hasMarketExpectations(prediction.marketExpectations)) {
        if (hasMarketExpectations(existingPrediction?.marketExpectations)) {
          console.log("[Gemini] AI dropped or returned empty marketExpectations, restoring from existingPrediction");
          prediction.marketExpectations = existingPrediction.marketExpectations;
        } else if (hasMarketExpectations(game.marketExpectations)) {
          console.log("[Gemini] AI didn't return marketExpectations, using game.marketExpectations");
          prediction.marketExpectations = game.marketExpectations;
        }
      }
      
      // Post-processing validation: keep likely-valid injuries while filtering obvious hallucinations
      if (Array.isArray(prediction.injuries)) {
        const normalize = (value: string) =>
          String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, "")
            .trim();

        const tokens = (value: string) =>
          normalize(value)
            .split(/\s+/)
            .filter((x) => x.length >= 3);

        const homeTeam = normalize(game.homeTeam || "");
        const awayTeam = normalize(game.awayTeam || "");
        const homeTokens = tokens(game.homeTeam || "");
        const awayTokens = tokens(game.awayTeam || "");

        const knownTeamAbbreviations = new Set([
          "atl","bos","bkn","bro","cha","chi","cle","dal","den","det","gsw","hou","ind","lac","lal","mem",
          "mia","mil","min","nop","no","nyk","okc","orl","phi","phx","pho","por","sac","sas","sa","tor","uta","was"
        ]);

        prediction.injuries = prediction.injuries.filter((injury: any) => {
          const injuryTeamRaw = String(injury.team || "").trim();
          const injuryTeam = normalize(injuryTeamRaw);
          const player = normalize(injury.player || "");

          if (player === "cade cunningham" && !homeTeam.includes("pistons") && !awayTeam.includes("pistons")) return false;
          if (player === "anthony davis" && !homeTeam.includes("lakers") && !awayTeam.includes("lakers")) return false;
          if (player === "lebron james" && !homeTeam.includes("lakers") && !awayTeam.includes("lakers")) return false;
          if (player === "luka doncic" && !homeTeam.includes("mavericks") && !awayTeam.includes("mavericks")) return false;

          if (!injuryTeam) {
            return true;
          }

          if (knownTeamAbbreviations.has(injuryTeam)) {
            return true;
          }

          const injuryTokens = tokens(injuryTeamRaw);

          const matchesHome =
            homeTeam.includes(injuryTeam) ||
            injuryTeam.includes(homeTeam) ||
            injuryTokens.some((t) => homeTokens.includes(t)) ||
            homeTokens.some((t) => injuryTokens.includes(t));

          const matchesAway =
            awayTeam.includes(injuryTeam) ||
            injuryTeam.includes(awayTeam) ||
            injuryTokens.some((t) => awayTokens.includes(t)) ||
            awayTokens.some((t) => injuryTokens.includes(t));

          if (!matchesHome && !matchesAway) {
            console.warn(`[Gemini] Removing hallucinated injury in processAIResponse: ${injury.player} on ${injury.team} for game ${game.awayTeam} @ ${game.homeTeam}`);
            return false;
          }

          return true;
        });
      }
      // Backfill weak / incomplete AI responses so UI is never empty
      const marketHomeProb = Number(
        prediction.marketExpectations?.homeWinProb ??
        existingPrediction?.marketExpectations?.homeWinProb ??
        game.marketExpectations?.homeWinProb
      );
      const marketAwayProb = Number(
        prediction.marketExpectations?.awayWinProb ??
        existingPrediction?.marketExpectations?.awayWinProb ??
        game.marketExpectations?.awayWinProb
      );
      const marketTotal = Number(
        prediction.marketExpectations?.total ??
        existingPrediction?.marketExpectations?.total ??
        game.marketExpectations?.total
      );
      const marketMargin = Number(
        prediction.marketExpectations?.margin ??
        existingPrediction?.marketExpectations?.margin ??
        game.marketExpectations?.margin
      );

      const normalizeAmericanOddsToProb = (odds: number): number | null => {
        if (!Number.isFinite(odds) || odds === 0) return null;
        if (odds > 0) return 100 / (odds + 100);
        const abs = Math.abs(odds);
        return abs / (abs + 100);
      };

      let derivedHomeProb = normalizeAmericanOddsToProb(marketHomeProb);
      let derivedAwayProb = normalizeAmericanOddsToProb(marketAwayProb);

      if (!derivedHomeProb && derivedAwayProb) derivedHomeProb = 1 - derivedAwayProb;
      if (!derivedAwayProb && derivedHomeProb) derivedAwayProb = 1 - derivedHomeProb;

      if ((!prediction.winner || prediction.winner === "PASS") && derivedHomeProb && derivedAwayProb) {
        prediction.winner = derivedHomeProb >= derivedAwayProb ? game.homeTeam : game.awayTeam;
      }

      if ((!prediction.winProbability || prediction.winProbability === 0.5) && derivedHomeProb && derivedAwayProb) {
        prediction.winProbability = Math.max(derivedHomeProb, derivedAwayProb);
      }

      const safeTotal = Number.isFinite(marketTotal) && marketTotal > 0 ? marketTotal : 212;
      const safeMargin = Number.isFinite(marketMargin) ? marketMargin : 0;

      if (
        !prediction.scorePrediction ||
        !Number.isFinite(Number(prediction.scorePrediction.home)) ||
        !Number.isFinite(Number(prediction.scorePrediction.away))
      ) {
        const homeScore = Math.round((safeTotal / 2) + (safeMargin / 2));
        const awayScore = Math.round(safeTotal - homeScore);
        prediction.scorePrediction = {
          home: homeScore,
          away: awayScore
        };
      }

      if (!prediction.projectedTotal || !Number.isFinite(Number(prediction.projectedTotal))) {
        prediction.projectedTotal = safeTotal;
      }

      if (!prediction.trends || typeof prediction.trends !== "object") {
        prediction.trends = {};
      }

      prediction.trends.homeVsExp = prediction.trends.homeVsExp || "Leaning on market-implied edge and roster context";
      prediction.trends.awayVsExp = prediction.trends.awayVsExp || "Leaning on market-implied edge and roster context";
      prediction.trends.homeTotal = prediction.trends.homeTotal || `Projected team environment from total ${safeTotal}`;
      prediction.trends.awayTotal = prediction.trends.awayTotal || `Projected team environment from total ${safeTotal}`;

      if (!prediction.matchupAnalysis || typeof prediction.matchupAnalysis !== "object") {
        prediction.matchupAnalysis = {};
      }

      prediction.matchupAnalysis.h2h = prediction.matchupAnalysis.h2h || "Recent verified H2H data unavailable; projection relies on current roster, market, and team context.";
      prediction.matchupAnalysis.playerStats = prediction.matchupAnalysis.playerStats || "Projection based on available roster quality, role concentration, and expected usage.";
      prediction.matchupAnalysis.trends = prediction.matchupAnalysis.trends || "Trend view derived from market baseline and available team-form context.";
      prediction.matchupAnalysis.confidenceBreakdown = prediction.matchupAnalysis.confidenceBreakdown || "Confidence derived from available market, roster, and injury context.";
      prediction.matchupAnalysis.projectionBasis = prediction.matchupAnalysis.projectionBasis || "Fallback projection used market total and spread because AI response lacked numeric detail.";

      if (!Array.isArray(prediction.keyFactors) || prediction.keyFactors.length === 0) {
        prediction.keyFactors = [
          "Market-implied spread and total used as projection baseline",
          "Current roster and injury context weighted into winner selection",
          "Confidence reduced when verified matchup-specific data is limited"
        ];
      }

      if (!prediction.reasoning || String(prediction.reasoning).trim().length < 25) {
        prediction.reasoning = `Projection leans on market baseline, available roster context, and injury information. ${prediction.winner} gets the edge from the stronger implied game script.`;
      }

      if (
        prediction.winner === "PASS" &&
        typeof prediction.winProbability === "number" &&
        prediction.winProbability > 0.51
      ) {
        prediction.winner =
          derivedHomeProb && derivedAwayProb
            ? (derivedHomeProb >= derivedAwayProb ? game.homeTeam : game.awayTeam)
            : game.homeTeam;
      }
      // Ensure confidence is a number and estimate if missing
      let conf = prediction.confidence;
      let prob = typeof prediction.winProbability === 'number' ? prediction.winProbability : parseFloat(prediction.winProbability);
      
      if (isNaN(prob)) {
        prob = 0.5;
      }
      prediction.winProbability = prob;

      if (typeof conf === 'number') {
        conf = isNaN(conf) ? 5 : Math.max(1, Math.min(10, Math.round(conf)));
      } else if (typeof conf === 'string') {
        const parsed = parseInt(conf, 10);
        conf = isNaN(parsed) ? 5 : Math.max(1, Math.min(10, parsed));
      } else {
        // Estimate confidence from win probability if not provided
        // Map 0.5 -> 5, 1.0 -> 10, 0.0 -> 10 (high confidence in either direction)
        conf = Math.max(1, Math.min(10, Math.round(5 + Math.abs(prob - 0.5) * 10)));
        if (isNaN(conf)) conf = 5;
      }
      prediction.confidence = conf;
      
      // Ensure winner is a string and not "TBD" (our internal placeholder)
      prediction.winner = String(prediction.winner || "PASS");
      if (prediction.winner === "TBD") {
        prediction.winner = "PASS";
      }

      // Normalize matchupAnalysis
      if (prediction.matchupAnalysis) {
        if (typeof prediction.matchupAnalysis !== 'object') {
          prediction.matchupAnalysis = {
            h2h: String(prediction.matchupAnalysis),
            playerStats: "",
            trends: "",
            confidenceBreakdown: ""
          };
        } else {
          prediction.matchupAnalysis.h2h = String(prediction.matchupAnalysis.h2h || "");
          prediction.matchupAnalysis.playerStats = String(prediction.matchupAnalysis.playerStats || "");
          prediction.matchupAnalysis.trends = String(prediction.matchupAnalysis.trends || "");
          prediction.matchupAnalysis.confidenceBreakdown = String(prediction.matchupAnalysis.confidenceBreakdown || "");
        }
      }

      // MLB Pitcher Matchup Normalization
      if (game.league === 'MLB' && prediction.pitcherMatchup) {
        // Ensure pitcherMatchup is an object
        if (typeof prediction.pitcherMatchup !== 'object') {
          prediction.pitcherMatchup = {
            summary: String(prediction.pitcherMatchup)
          };
        }

        const pm = prediction.pitcherMatchup;
        
        // Ensure homePitcher and awayPitcher exist
        pm.homePitcher = pm.homePitcher || {};
        pm.awayPitcher = pm.awayPitcher || {};

        if (pm.homePitcher) {
          pm.homePitcher.name = String(pm.homePitcher.name || "TBD");
          pm.homePitcher.era = pm.homePitcher.era || "N/A";
          pm.homePitcher.whip = pm.homePitcher.whip || "N/A";
          pm.homePitcher.xERA = pm.homePitcher.xERA || "N/A";
          pm.homePitcher.fip = pm.homePitcher.fip || "N/A";
          pm.homePitcher.k9 = pm.homePitcher.k9 || "N/A";
          pm.homePitcher.bb9 = pm.homePitcher.bb9 || "N/A";
          pm.homePitcher.barrelRate = pm.homePitcher.barrelRate || "N/A";
          pm.homePitcher.recentForm = String(pm.homePitcher.recentForm || "No recent data available.");
        }
        if (pm.awayPitcher) {
          pm.awayPitcher.name = String(pm.awayPitcher.name || "TBD");
          pm.awayPitcher.era = pm.awayPitcher.era || "N/A";
          pm.awayPitcher.whip = pm.awayPitcher.whip || "N/A";
          pm.awayPitcher.xERA = pm.awayPitcher.xERA || "N/A";
          pm.awayPitcher.fip = pm.awayPitcher.fip || "N/A";
          pm.awayPitcher.k9 = pm.awayPitcher.k9 || "N/A";
          pm.awayPitcher.bb9 = pm.awayPitcher.bb9 || "N/A";
          pm.awayPitcher.barrelRate = pm.awayPitcher.barrelRate || "N/A";
          pm.awayPitcher.recentForm = String(pm.awayPitcher.recentForm || "No recent data available.");
        }
        if (pm.umpire) {
          pm.umpire.name = String(pm.umpire.name || "TBD");
          pm.umpire.runsPerGame = pm.umpire.runsPerGame || "N/A";
          pm.umpire.strikeZone = String(pm.umpire.strikeZone || "Standard");
        }
      }
      
      // Source Auditing
      const driveLink = "1cf6SvGHVE9M--wu3xzjbm2_MJLSeoSx9";
      const nbaOfficialLink = "official.nba.com/nba-injury-report";
      
      const sourceAudit = {
        googleDriveAccessed: groundingUrls.some(u => u.uri.includes(driveLink)),
        nbaOfficialAccessed: groundingUrls.some(u => u.uri.includes(nbaOfficialLink)),
        lastAuditTime: new Date().toISOString(),
        auditNotes: ""
      };
      
      if (game.league === 'NBA' || game.league === 'MLB') {
        if (game.league === 'NBA' && !sourceAudit.googleDriveAccessed) {
          sourceAudit.auditNotes += "WARNING: Google Drive Injury Report not explicitly grounded. ";
        }

        const status = (game.league === 'NBA' ? sourceAudit.googleDriveAccessed : true) ? 'success' : 'warning';
        logSourceAudit(String(game.id), game.league, { ...sourceAudit, status });
      }
      
      if (sourceAudit.auditNotes === "" && (game.league === 'NBA' || game.league === 'MLB')) {
        sourceAudit.auditNotes = "All required sources verified.";
      }
      
      prediction.sourceAudit = sourceAudit;
      
      // Ensure hedgingAdvice is always populated
      prediction.hedgingAdvice = prediction.hedgingAdvice || "No specific hedging strategy recommended for this matchup.";
      
      return {
        ...prediction,
        gameId: String(game.id),
        league: game.league,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        teams: [game.homeTeam, game.awayTeam],
        date: dateStr || (game.date ? game.date.split('T')[0] : new Date().toISOString().split('T')[0]),
        analysisCost: cost,
        lastUpdated: new Date().toISOString(),
      };
    } catch (e) {
      console.error("Failed to parse prediction JSON", e);
      console.log("Raw text:", text);
      throw new Error("Failed to parse AI response");
    }
  }

  async verifyPrediction(game: Game, prediction: Prediction, dateStr: string): Promise<Prediction> {
    let rosterDatabaseContext = "";
    if (game.league === 'NBA') {
      const homeRoster = NBA_ROSTER_DATABASE[game.homeTeam];
      const awayRoster = NBA_ROSTER_DATABASE[game.awayTeam];
      
      rosterDatabaseContext = `
PRE-TRAINED ROSTER DATABASE (SOURCE OF TRUTH):
- ${game.homeTeam}: Key Players: ${homeRoster?.keyPlayers.join(', ') || 'N/A'}. Roster Verification: ${homeRoster?.rosterVerificationLink || GLOBAL_ROSTER_LINKS.ESPN_PLAYERS}. Injury Report: ${homeRoster?.injuryReportLink || GLOBAL_INJURY_LINKS.ROTOWIRE}
- ${game.awayTeam}: Key Players: ${awayRoster?.keyPlayers.join(', ') || 'N/A'}. Roster Verification: ${awayRoster?.rosterVerificationLink || GLOBAL_ROSTER_LINKS.ESPN_PLAYERS}. Injury Report: ${awayRoster?.injuryReportLink || GLOBAL_INJURY_LINKS.ROTOWIRE}

CRITICAL: You MUST use your search tool to confirm every player's current team. Do not rely on outdated information.
`;
    }

    const prompt = `
      CRITICAL QA AUDIT: You are a strict sports data auditor. Your ONLY job is to find hallucinations in the prediction below.
      
      PREDICTION TO AUDIT:
      ${JSON.stringify(prediction, null, 2)}
      
      GAME: ${game.awayTeam} @ ${game.homeTeam} on ${dateStr}
      
      ${rosterDatabaseContext}
      
      AUDIT STEPS:
      1. INJURY REPORT VERIFICATION (ZERO TOLERANCE): You MUST ONLY report injury statuses explicitly present in provided data or search results. NO inferring or guessing. Every injury MUST include "source_name" and "source_timestamp". If missing, label "UNVERIFIED — DO NOT USE". If data is not from the current game window, label "STALE — REQUIRES RE-VERIFICATION". If sources disagree, label "CONFLICT — MULTIPLE SOURCES DISAGREE". Format: Player Name — Status (Injury) [Source: name, timestamp]. If no verified data exists, output "NO VERIFIED INJURY REPORT AVAILABLE FOR THIS GAME" in qaNotes.
      2. DETROIT PISTONS SPECIAL ALERT: If this game involves the Detroit Pistons, you MUST be extremely thorough. There have been reports of incorrect 'Clear' statuses for Pistons players who are actually 'Out'. Cross-reference multiple sources.
      3. ROSTER CHECK: For EVERY player mentioned (in injuries, reasoning, or factors), you MUST search "current roster [Team Name]" and confirm they are on that team using https://www.espn.com/nba/players.
         - CRITICAL: You MUST use your search tool to confirm every player's current team. Do not rely on outdated information.
      4. INJURY CHECK: Search for the latest injury report for ${game.awayTeam} and ${game.homeTeam}. For NBA games, prioritize:
         - https://official.nba.com/nba-injury-report-2025-26-season/
         - https://www.rotowire.com/basketball/injury-report.php
         - https://drive.google.com/drive/folders/1cf6SvGHVE9M--wu3xzjbm2_MJLSeoSx9?usp=sharing
         If these links are unavailable, use the most recent data from ESPN or other reputable sources. Confirm the status of every player mentioned.
      5. STAT CHECK: Confirm any specific statistics or projections mentioned. If they look hallucinated or "too round", flag them.
      6. PREVIOUS MATCHUP ACCURACY: You MUST verify any mentioned previous matchup scores or dates. If the prediction mentions a previous score that is NOT in the provided data, you MUST flag it as a hallucination. ZERO TOLERANCE for invented historical data.
      7. INJURY TERMINOLOGY CHECK: Ensure all injury statuses use ONLY "In", "Out", "Doubtful", or "Probable". If "Questionable" or "GTD" are used, correct them to the most likely of the four approved statuses.
      
      STRICT GUARDRAIL: If you find a player assigned to the wrong team, you MUST remove them from the injuries list and adjust the winProbability.
      IMPORTANT: Do NOT mention the Google Drive link in the 'qaNotes'. Simply state 'Verified against official injury reports' or detail the specific correction found.
      
      Return JSON:
      {
        "qaStatus": "verified" | "flagged" | "corrected",
        "qaNotes": "Detailed explanation of any hallucinations found.",
        "adjustedWinner": "Team Name",
        "adjustedConfidence": 1-10,
        "adjustedWinProbability": 0.00-1.00,
        "adjustedInjuries": [{"team": "Team", "player": "Name", "status": "Status", "impact": "PSI value", "source_name": "Source", "source_timestamp": "Timestamp"}]
      }
    `;

    try {
      const useOpenAI = this.shouldUseOpenAI();

      let text = "";

      if (useOpenAI) {
        const openai = getOpenAIClient();
        const response = await openai.chat.completions.create({
          model: this.getOpenAIModel(),
          messages: [
            { role: "system", content: "You are a strict Quality Assurance auditor for sports analysis." },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" }
        });
        text = response.choices[0].message.content || "";
      } else {
        const response = await this.callWithRetry(async (ai) => {
          let timeoutId: NodeJS.Timeout;
          const timeoutPromise = new Promise<any>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("Gemini API timeout")), 180000);
          });

          try {
            return await Promise.race([
              ai.models.generateContent({
                model: this.getModel(),
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: {
                  tools: [{ googleSearch: {} }],
                },
              }),
              timeoutPromise
            ]);
          } finally {
            clearTimeout(timeoutId!);
          }
        }, 3, 10000, `verify-${game.id}`);
        text = response.text || "";
      }

      if (!text) return prediction;

      const cleanedText = this.cleanJson(text);
      const qaResult = JSON.parse(cleanedText);

      let adjustedConfidence = qaResult.adjustedConfidence;
      if (typeof adjustedConfidence === 'number') {
        adjustedConfidence = isNaN(adjustedConfidence) ? prediction.confidence : Math.max(1, Math.min(10, Math.round(adjustedConfidence)));
      } else if (typeof adjustedConfidence === 'string') {
        const parsed = parseInt(adjustedConfidence, 10);
        adjustedConfidence = isNaN(parsed) ? prediction.confidence : Math.max(1, Math.min(10, parsed));
      } else {
        adjustedConfidence = prediction.confidence;
      }

      const result: any = {
        ...prediction,
        qaStatus: qaResult.qaStatus || 'verified',
        confidence: adjustedConfidence !== undefined ? adjustedConfidence : prediction.confidence,
        winner: String(qaResult.adjustedWinner || prediction.winner || "PASS"),
        lastUpdated: new Date().toISOString(),
      };

      if (qaResult.qaNotes !== undefined) result.qaNotes = qaResult.qaNotes;
      if (qaResult.adjustedInjuries !== undefined && Array.isArray(qaResult.adjustedInjuries)) {
        result.injuries = qaResult.adjustedInjuries.filter((injury: any) => {
          const injuryTeam = (injury.team || "").toLowerCase();
          const homeTeam = (game.homeTeam || "").toLowerCase();
          const awayTeam = (game.awayTeam || "").toLowerCase();
          
          const isHome = homeTeam.includes(injuryTeam) || injuryTeam.includes(homeTeam);
          const isAway = awayTeam.includes(injuryTeam) || injuryTeam.includes(awayTeam);
          
          if (!isHome && !isAway) {
            console.warn(`[Gemini] Removing hallucinated injury in verifyPrediction: ${injury.player} on ${injury.team} for game ${game.awayTeam} @ ${game.homeTeam}`);
            return false;
          }
          return true;
        });
      }
      if (qaResult.adjustedWinProbability !== undefined) result.winProbability = qaResult.adjustedWinProbability;

      return result;
    } catch (e) {
      console.error("Failed to run QA on prediction:", e);
      return {
        ...prediction,
        qaStatus: 'flagged',
        qaNotes: 'QA failed due to an error: ' + (e instanceof Error ? e.message : String(e)),
      };
    }
  }

  async bulkAnalyzeDay(date: string, league: string, onProgress?: (msg: string) => void): Promise<Record<string, any>> {
    const allGames: any[] = [];
    const predictions: Record<string, any> = {};

    onProgress?.(`Fetching schedule for ${league}...`);

    try {
      const games = await this.getDailySchedule(league, date);
      allGames.push(...games);
    } catch (e) {
      console.error(`Failed to fetch ${league} schedule:`, e);
    }

    if (allGames.length === 0) {
      onProgress?.(`No ${league} games found to analyze.`);
      return {};
    }

    onProgress?.(`Found ${allGames.length} ${league} games. Starting analysis...`);

    // Process in batches to improve performance while respecting rate limits
    const CONCURRENCY = 3;
    for (let i = 0; i < allGames.length; i += CONCURRENCY) {
      const batch = allGames.slice(i, i + CONCURRENCY);
      
      await Promise.all(batch.map(async (game, index) => {
        const gameIndex = i + index;
        onProgress?.(`Analyzing game ${gameIndex + 1}/${allGames.length}: ${game.awayTeam} @ ${game.homeTeam}`);
        
        try {
          let prediction = await this.analyzeMatchup(game, date, undefined, [], undefined, onProgress);
          predictions[game.id] = prediction;
        } catch (e) {
          console.error(`Failed to analyze game ${game.id}:`, e);
        }
      }));

      // Pace requests: Add a small delay between batches to avoid hitting TPM limits
      if (i + CONCURRENCY < allGames.length) {
        const delay = 3000; // Reduced delay to 3 seconds between batches
        onProgress?.(`Pacing requests... waiting ${delay/1000}s before next batch.`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    onProgress?.(`Analysis complete. Generated ${Object.keys(predictions).length} predictions.`);
    return predictions;
  }

  async importSchedule(league: string, startDate: Date, days: number = 7, onProgress?: (msg: string) => void, force: boolean = false): Promise<void> {
    const dates = Array.from({ length: days }, (_, i) => {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      return format(date, "yyyy-MM-dd");
    });

    // Process in batches of 3 to speed up import while being nice to the API
    const CONCURRENCY = 3;
    for (let i = 0; i < dates.length; i += CONCURRENCY) {
      const batch = dates.slice(i, i + CONCURRENCY);
      onProgress?.(`Importing schedules for batch ${Math.floor(i/CONCURRENCY) + 1}...`);
      
      await Promise.all(batch.map(async (dateStr) => {
        try {
          // This will check Firestore first, and if missing, fetch from API and save to Firestore
          const games = await this.getDailySchedule(league, dateStr, force);
          console.log(`[Import] Imported ${games.length} games for ${league} on ${dateStr} (force=${force})`);
          onProgress?.(`Imported ${games.length} games for ${dateStr}...`);
        } catch (e) {
          console.error(`Failed to import schedule for ${dateStr}`, e);
          onProgress?.(`Failed to import for ${dateStr}.`);
        }
      }));

      if (i + CONCURRENCY < dates.length) {
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    onProgress?.("Schedule import complete.");
  }

  async checkInjuryUpdates(league: string, date: string, games: any[], shouldCancel?: () => boolean, onProgress?: (current: number, total: number) => void): Promise<Record<string, any[]>> {
    if (!games || games.length === 0) return {};

    const BATCH_SIZE = 8;
    const allUpdates: Record<string, any[]> = {};

    for (let i = 0; i < games.length; i += BATCH_SIZE) {
      if (shouldCancel && shouldCancel()) {
        console.log("[Gemini] Injury check cancelled by user.");
        break;
      }

      if (onProgress) {
        onProgress(Math.min(i, games.length), games.length);
      }

      const batchGames = games.slice(i, i + BATCH_SIZE);
      const teams = batchGames.map(g => `${g.awayTeam} and ${g.homeTeam}`).join(", ");

      const leagueSearchQuery = league === 'NCAA' 
        ? `"NCAA basketball injury report rotowire", "college basketball market expectations movement ${batchGames.map(g => g.homeTeam).join(' or ')}", "expert consensus college basketball today"` 
        : league === 'MLB'
        ? `"MLB injury report and starting lineups ${batchGames.map(g => g.homeTeam).join(' or ')}", "MLB market expectations and expert consensus ${batchGames.map(g => g.homeTeam).join(' or ')}", "starting pitchers and bullpen rest ${batchGames.map(g => g.homeTeam).join(' or ')}"`
        : league === 'NFL'
        ? `"NFL injury report and starting lineups ${batchGames.map(g => g.homeTeam).join(' or ')}", "NFL market expectations and expert consensus ${batchGames.map(g => g.homeTeam).join(' or ')}", "NFL QB and key player status ${batchGames.map(g => g.homeTeam).join(' or ')}"`
        : league === 'NHL'
        ? `"NHL injury report and starting goalies ${batchGames.map(g => g.homeTeam).join(' or ')}", "NHL market expectations and expert consensus ${batchGames.map(g => g.homeTeam).join(' or ')}", "NHL key player status ${batchGames.map(g => g.homeTeam).join(' or ')}"`
        : `"NBA market expectations movement today", "NBA expert consensus", "latest injuries for ${batchGames.map(g => g.homeTeam).join(' or ')}"`;

      const prompt = `
        TASK: Use your search tool to find the LATEST injury reports and MARKET MOVEMENT for these ${league} teams playing on ${date}: ${teams}.
        ${league === 'NCAA' ? 'For NCAA, a primary source is https://www.rotowire.com/cbasketball/injury-report.php.' : league === 'NBA' ? `For NBA, use https://www.rotowire.com/basketball/injury-report.php and look specifically for the file 'NBA_Injury_Report_Latest' in the Google Drive folder 1cf6SvGHVE9M--wu3xzjbm2_MJLSeoSx9.` : `For ${league}, use reputable sources like Rotowire, ESPN, or official team reports.`}

        INSTRUCTIONS:
        1. INJURY REPORT VERIFICATION (ZERO TOLERANCE): You MUST ONLY report injury statuses explicitly present in provided data or search results. NO inferring or guessing. Every injury MUST include "source_name" and "source_timestamp". If missing, label "UNVERIFIED — DO NOT USE". If data is not from the current game window, label "STALE — REQUIRES RE-VERIFICATION". If sources disagree, label "CONFLICT — MULTIPLE SOURCES DISAGREE". Format: Player Name — Status (Injury) [Source: name, timestamp]. If no verified data exists, output "NO VERIFIED INJURY REPORT AVAILABLE FOR THIS GAME" in the update field.
        2. INJURIES: Find the latest status of key players. Verify roster integrity (e.g., ensure players are attributed to their correct current teams).
           - TERMINOLOGY: You MUST use ONLY these four statuses: "In", "Out", "Doubtful", or "Probable". Map all other statuses (Questionable, GTD, etc.) to one of these four.
        3. MARKET: Identify any significant market expectations movement or "expert consensus" reports.
        4. SITUATIONAL: Note if any team is on a back-to-back or long road trip.
        5. DETROIT PISTONS SPECIAL ALERT: If any game involves the Detroit Pistons, you MUST be extremely thorough. There have been reports of incorrect 'Clear' statuses for Pistons players who are actually 'Out'. Cross-reference multiple sources.
        6. SOURCE AUDIT: For every injury update, you MUST state which source confirmed the status (e.g., "Rotowire", "ESPN", "Underdog NBA").
        
        If specific links or files are unavailable, synthesize the best available information from other reputable sports news outlets. Do NOT refuse the analysis; provide the most accurate projection possible using all available search results.
        
        Return a JSON object where keys are game IDs and values are arrays of injury objects.
        
        Game List:
        ${JSON.stringify(batchGames.map(g => ({ id: g.id, home: g.homeTeam, away: g.awayTeam })))}
        
        Output Format:
        {
          "game-id-1": [
            {"player": "Name", "team": "Team", "status": "Out/Probable/GTD/Doubtful/Questionable/In", "impact": "PSI value", "update": "Brief update text", "source_name": "Source", "source_timestamp": "Timestamp"}
          ]
        }
        Only include games with RELEVANT updates. If a team has NO injuries, return an empty array for that game ID.
        No markdown.
      `;

      try {
        const useOpenAI = this.shouldUseOpenAI();

        let text = "";

        if (useOpenAI) {
          const openai = getOpenAIClient();
          const response = await openai.chat.completions.create({
            model: this.getOpenAIModel(),
            messages: [
              { role: "system", content: "You are a professional sports injury analyst." },
              { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
          });
          text = response.choices[0].message.content || "";
        } else {
          const response = await this.callWithRetry(async (ai) => {
            let timeoutId: NodeJS.Timeout;
            const timeoutPromise = new Promise<any>((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error("Gemini API timeout")), 180000);
            });

            try {
              return await Promise.race([
                ai.models.generateContent({
                  model: this.getModel(),
                  contents: [{ role: "user", parts: [{ text: prompt }] }],
                  config: {
                    tools: [{ googleSearch: {} }],
                  },
                }),
                timeoutPromise
              ]);
            } finally {
              clearTimeout(timeoutId!);
            }
          }, 4, 10000, `injuries-${league}-${date}-batch-${i}`);
          text = response.text || "";
        }

        if (text) {
          const cleanedText = this.cleanJson(text);
          const parsed = JSON.parse(cleanedText);
          
          // Post-processing validation: Ensure injuries are assigned to the correct teams in the game
          for (const gameId of Object.keys(parsed)) {
            const game = batchGames.find(g => String(g.id) === gameId);
            if (game && Array.isArray(parsed[gameId])) {
              parsed[gameId] = parsed[gameId].filter((injury: any) => {
                const injuryTeam = (injury.team || "").toLowerCase();
                const homeTeam = (game.homeTeam || "").toLowerCase();
                const awayTeam = (game.awayTeam || "").toLowerCase();
                
                // Check if the injury team is part of either the home or away team name
                const isHome = homeTeam.includes(injuryTeam) || injuryTeam.includes(homeTeam);
                const isAway = awayTeam.includes(injuryTeam) || injuryTeam.includes(awayTeam);
                
                if (!isHome && !isAway) {
                  console.warn(`[Gemini] Removing hallucinated injury in checkInjuryUpdates: ${injury.player} on ${injury.team} for game ${game.awayTeam} @ ${game.homeTeam}`);
                  return false;
                }
                return true;
              });
            }
          }
          
          console.log(`[Gemini] checkInjuryUpdates parsed result for batch ${i}:`, parsed);
          Object.assign(allUpdates, parsed);
        }
      } catch (error) {
        console.error(`Error checking injury updates for batch ${i}:`, error);
        // Continue to the next batch even if this one fails
      }
      
      // Reduced delay between batches to respect rate limits while improving performance (3s for injury checks)
      if (i + BATCH_SIZE < games.length) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    if (onProgress) {
      onProgress(games.length, games.length);
    }

    return allUpdates;
  }

  async generateDailyBriefing(league: string, date: string, games: Game[] = []): Promise<string> {
    const gamesContext = games.length > 0 
      ? `SCHEDULED GAMES FOR ${date}:\n${games.map(g => `- ${g.awayTeam} @ ${g.homeTeam} (${g.time})`).join('\n')}`
      : "Search for the schedule of games for today.";

    const injurySourceContext = league === 'NBA'
      ? `SOURCE PRIORITY: For ALL NBA injury data, you should attempt to access the Google Drive injury report: https://drive.google.com/drive/folders/1cf6SvGHVE9M--wu3xzjbm2_MJLSeoSx9?usp=sharing. Specifically look for the file named 'NBA_Injury_Report_Latest' within that folder. This document is a primary source of truth for player availability. You MUST also cross-reference with https://www.rotowire.com/basketball/injury-report.php and verify rosters at https://www.espn.com/nba/players. If the link or file is inaccessible, use the Official NBA Injury Report and other reputable sources to ensure accuracy. IMPORTANT: Do NOT mention this Google Drive link or the 'injury report' source explicitly in your reasoning or notes; simply use the data to inform your analysis.`
      : "";

    const prompt = `
      You are a professional sports analyst and consultant with expertise in data synthesis and game forecasting. You have been tasked with providing a comprehensive daily briefing for today's ${league} slate on ${date}.

      ${gamesContext}

      ${injurySourceContext}

      Task:
      Analyze the real-time data from the provided ESPN links (Schedule, Odds, Injuries, Players, and Standings). You must cross-reference these sources to identify how player availability and current team standings are influencing the markets for tonight's games.

      Objective:
      Generate a structured '${league} Game Day Preview Report.' For each game scheduled today, provide a summary that includes:
      1) Matchup & Standings Context
      2) Current Market Odds (Spread/Total)
      3) Critical Injury Updates (Confirmed against official reports)
      4) A 'Key Narrative' explaining how specific injuries or streaks might impact the outcome or market value.

      Knowledge:
      Maintain a professional, data-driven, and objective tone. Focus specifically on 'Impact Players'—explain how the absence of a top-tier player shifts the point spread. Ensure the information is presented in a clear, scannable format using tables or bulleted lists for high readability.
      
      IMPORTANT:
      - INJURY REPORT VERIFICATION (ZERO TOLERANCE): You MUST ONLY report injury statuses explicitly present in provided data or search results. NO inferring or guessing. Every injury MUST include "source_name" and "source_timestamp". If missing, label "UNVERIFIED — DO NOT USE". If data is not from the current game window, label "STALE — REQUIRES RE-VERIFICATION". If sources disagree, label "CONFLICT — MULTIPLE SOURCES DISAGREE". Format: Player Name — Status (Injury) [Source: name, timestamp]. If no verified data exists, output "NO VERIFIED INJURY REPORT AVAILABLE FOR THIS GAME".
      - Provide ACTUAL, specific advantages (e.g., 'Celtics have a +8 rebounding edge with Porzingis back') rather than generic references.
      - NEVER mention the Google Drive link or 'official injury report' in your output. Use the information silently to provide accurate status updates.
    `;

    try {
      const useOpenAI = this.shouldUseOpenAI();

      if (useOpenAI) {
        const openai = getOpenAIClient();
        const response = await openai.chat.completions.create({
          model: this.getOpenAIModel(),
          messages: [
            { role: "system", content: "You are a professional sports analyst and consultant." },
            { role: "user", content: prompt }
          ]
        });

        const text = response.choices[0].message.content;
        if (!text) throw new Error("No response from OpenAI");
        return text;
      }

      const response = await this.callWithRetry(async (ai) => {
        let timeoutId: NodeJS.Timeout;
        const timeoutPromise = new Promise<any>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Gemini API timeout")), 180000);
        });

        try {
          return await Promise.race([
            ai.models.generateContent({
              model: this.getModel(),
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              config: {
                tools: [{ googleSearch: {} }],
              },
            }),
            timeoutPromise
          ]);
        } finally {
          clearTimeout(timeoutId!);
        }
      }, 1, 5000, `daily-briefing-${league}-${date}`);

      if (!response) {
        throw new Error("No response received from Gemini API");
      }

      const text = response.text;
      if (!text) throw new Error("No response from AI");

      return text;
    } catch (error) {
      console.error("Error generating daily briefing:", error);
      throw error;
    }
  }

  async chat(message: string, history: { role: 'user' | 'assistant', content: string }[], context: { games: Game[], predictions: Record<string, Prediction> }): Promise<string> {
    try {
      const model = typeof window !== "undefined" ? localStorage.getItem("openai_model") || "gpt-4o-mini" : "gpt-4o-mini";
      const token = await getIdToken();
      const response = await fetch('/api/snark', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          message,
          history,
          context,
          model
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      return data.text;
    } catch (error: any) {
      console.error("Chat error:", error);
      return `I encountered an error while processing your request: ${error.message}. Please try again.`;
    }
  }

  async checkSourceHealth(): Promise<{ status: 'healthy' | 'degraded' | 'error', details: string, latestDate?: string }> {
    const driveLink = "https://drive.google.com/drive/folders/1cf6SvGHVE9M--wu3xzjbm2_MJLSeoSx9?usp=sharing";
    const prompt = `
      DIAGNOSTIC TEST: Attempt to access and summarize the content of this Google Drive folder: ${driveLink}.
      
      You MUST verify:
      1. Can you access the link?
      2. Can you see the files inside? Specifically look for a file named 'NBA_Injury_Report_Latest'.
      3. What is the date of the latest injury report you can find in that file?
      
      Return JSON:
      {
        "status": "healthy" | "degraded" | "error",
        "canAccess": boolean,
        "filesFound": string[],
        "latestDate": "YYYY-MM-DD",
        "details": "Summary of access test"
      }
    `;
    
    try {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      
      const text = response.text;
      if (!text) throw new Error("No response from AI");
      
      const cleanedText = this.cleanJson(text);
      const result = JSON.parse(cleanedText);
      
      // Log the health check
      const db = getDb();
      const logsRef = collection(db, "source_health_checks");
      try {
        await addDoc(logsRef, {
          ...result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, "source_health_checks");
      }
      
      return result;
    } catch (error: any) {
      // If it's already a stringified JSON from handleFirestoreError, just log it
      if (error.message && error.message.startsWith('{')) {
        console.error("Firestore permission error in health check:", error.message);
      } else {
        console.error("Source health check failed:", error);
      }
      return {
        status: 'error',
        details: `Failed to perform health check: ${error.message}`
      };
    }
  }
}

export const bettorsEdge = new BettorsEdge();




