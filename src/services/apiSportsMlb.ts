import axios from "axios";
import { format } from "date-fns";
import { getIdToken } from "../firebase";

export type Bookmaker = {
  id: number;
  name: string;
};

export type NormalizedOddsResponse = {
  leagueId: number;
  leagueName: string;
  season: string;
  countryName: string;
  countryCode: string | null;
  gameId: number;
  bookmakers: Array<{
    bookmakerId: number;
    bookmakerName: string;
    bets: Array<{
      betId: number;
      betName: string;
      values: Array<{
        value: string;
        odd: string;
      }>;
    }>;
  }>;
};

export type ApiError = {
  message: string;
  status?: number;
  details?: unknown;
};

type DataQualityGrade = "A" | "B" | "C" | "D";

export type MlbGameContext = {
  gameId: number;
  season: number | string;
  homeTeamId: number;
  awayTeamId: number;
  game?: any | null;
  pitching: {
    startersConfirmed: boolean;
    homeStarter?: any | null;
    awayStarter?: any | null;
    source: string;
  };
  odds: {
    books: NormalizedOddsResponse[];
    bookCount: number;
    hasMultiBookOdds: boolean;
  };
  teamStatistics: {
    home?: any | null;
    away?: any | null;
  };
  injuries: {
    home: any[];
    away: any[];
    unavailable: boolean;
    error?: string;
  };
  h2h: any[];
  dataQuality: {
    grade: DataQualityGrade;
    score: number;
    notes: string[];
  };
};

class ApiSportsMlbService {
  private baseUrl = "/api/mlb";
  // API-Sports Baseball v1 MLB league id. Keep centralized so endpoint params stay aligned.
  private readonly mlbLeagueId = 1;
  private bookmakersCache: Bookmaker[] | null = null;
  private bookmakersCacheTime = 0;
  private readonly BOOKMAKERS_CACHE_TTL = 24 * 60 * 60 * 1000;
  private oddsCache: Map<string, { data: NormalizedOddsResponse[]; timestamp: number }> = new Map();
  private readonly ODDS_CACHE_TTL = 5 * 60 * 1000;

  private async getHeaders() {
    const token = await getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private async fetchWithRetry(url: string, config: any = {}, retries = 3, delay = 1500): Promise<any> {
    let lastError: any;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const authHeaders = await this.getHeaders();
        const response = await axios.get(url, {
          ...config,
          headers: { ...authHeaders, ...config.headers },
          timeout: config.timeout ?? 30000,
        });
        return response.data;
      } catch (error: any) {
        lastError = error;
        const isTimeout = error.code === "ECONNABORTED" || String(error.message || "").includes("timeout");
        const isRateLimit = error.response?.status === 429;
        const isNetworkError = !error.response;

        if ((isTimeout || isRateLimit || isNetworkError) && attempt < retries - 1) {
          console.warn(`[API-Sports MLB] Request failed (${isRateLimit ? "rate limit" : isTimeout ? "timeout" : "network"}). Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

  async getBookmakers(): Promise<Bookmaker[]> {
    if (this.bookmakersCache && Date.now() - this.bookmakersCacheTime < this.BOOKMAKERS_CACHE_TTL) {
      return this.bookmakersCache;
    }

    try {
      const data = await this.fetchWithRetry(`${this.baseUrl}/bookmakers`);
      const bookmakers: Bookmaker[] = Array.isArray(data?.response)
        ? data.response.map((b: any) => ({ id: b.id, name: b.name }))
        : [];

      this.bookmakersCache = bookmakers;
      this.bookmakersCacheTime = Date.now();
      return bookmakers;
    } catch (error: any) {
      console.error("[API-Sports MLB] Error fetching bookmakers:", error);
      throw this.formatError(error);
    }
  }

  async getGames(date: Date): Promise<any[]> {
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const data = await this.fetchWithRetry(`${this.baseUrl}/games`, {
        // API-Sports Baseball v1 documented syntax for games by date.
        params: {
          league: this.mlbLeagueId,
          season: date.getFullYear(),
          date: dateStr,
        },
      });

      return Array.isArray(data?.response) ? data.response : [];
    } catch (error) {
      console.error("[API-Sports MLB] Error fetching games:", error);
      return [];
    }
  }

  async getOdds(filters: {
    season?: string | number;
    league?: number | string;
    game?: number | string;
    bookmaker?: number | string;
    bet?: number | string;
    page?: number;
    limit?: number;
  }): Promise<NormalizedOddsResponse[]> {
    const normalizedFilters = {
      league: filters.league ?? this.mlbLeagueId,
      ...filters,
    };
    const cacheKey = JSON.stringify(normalizedFilters);
    const cached = this.oddsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.ODDS_CACHE_TTL) {
      return cached.data;
    }

    try {
      const data = await this.fetchWithRetry(`${this.baseUrl}/odds`, { params: normalizedFilters });
      const normalized = Array.isArray(data?.response)
        ? await this.normalizeOddsResponse(data.response)
        : [];

      this.oddsCache.set(cacheKey, { data: normalized, timestamp: Date.now() });
      return normalized;
    } catch (error: any) {
      console.error("[API-Sports MLB] Error fetching odds:", error);
      throw this.formatError(error);
    }
  }

  async getOddsForGame(
    gameId: number | string,
    options?: {
      season?: string | number;
      league?: number | string;
      bookmaker?: number | string;
      bet?: number | string;
    }
  ): Promise<NormalizedOddsResponse[]> {
    return this.getOdds({ game: gameId, ...options });
  }

  async getTeamStatistics(teamId: number, season: string | number): Promise<any | null> {
    try {
      const data = await this.fetchWithRetry(`${this.baseUrl}/teams/statistics`, {
        params: {
          league: this.mlbLeagueId,
          season,
          team: teamId,
        },
      });
      return data?.response ?? null;
    } catch (error) {
      console.warn(`[API-Sports MLB] Team statistics unavailable for team ${teamId}:`, error);
      return null;
    }
  }

  async getInjuries(teamId: number, season: string | number): Promise<any[]> {
    try {
      const data = await this.fetchWithRetry(`${this.baseUrl}/injuries`, {
        params: {
          league: this.mlbLeagueId,
          season,
          team: teamId,
        },
      });
      return Array.isArray(data?.response) ? data.response : [];
    } catch (error) {
      console.warn(`[API-Sports MLB] Injury data unavailable for team ${teamId}; continuing without injuries:`, error);
      return [];
    }
  }

  async getH2H(homeTeamId: number, awayTeamId: number): Promise<any[]> {
    const h2h = `${homeTeamId}-${awayTeamId}`;

    try {
      const data = await this.fetchWithRetry(`${this.baseUrl}/games`, {
        params: { h2h },
      });
      return Array.isArray(data?.response) ? data.response : [];
    } catch (error) {
      console.warn("[API-Sports MLB] H2H unavailable; continuing without H2H:", error);
      return [];
    }
  }

  async getGameById(gameId: number | string): Promise<any | null> {
    try {
      const data = await this.fetchWithRetry(`${this.baseUrl}/games`, {
        params: { id: gameId },
      });
      return Array.isArray(data?.response) ? data.response[0] ?? null : null;
    } catch (error) {
      console.warn(`[API-Sports MLB] Game details unavailable for game ${gameId}:`, error);
      return null;
    }
  }

  async getGameContext(params: {
    gameId: number;
    season: string | number;
    homeTeamId: number;
    awayTeamId: number;
  }): Promise<MlbGameContext> {
    const { gameId, season, homeTeamId, awayTeamId } = params;

    const [gameResult, oddsResult, homeStatsResult, awayStatsResult, homeInjuriesResult, awayInjuriesResult, h2hResult] =
      await Promise.allSettled([
        this.getGameById(gameId),
        this.getOdds({ game: gameId, season, league: this.mlbLeagueId }),
        this.getTeamStatistics(homeTeamId, season),
        this.getTeamStatistics(awayTeamId, season),
        this.getInjuries(homeTeamId, season),
        this.getInjuries(awayTeamId, season),
        this.getH2H(homeTeamId, awayTeamId),
      ]);

    const game = gameResult.status === "fulfilled" ? gameResult.value : null;
    const odds = oddsResult.status === "fulfilled" ? oddsResult.value : [];
    const homeStats = homeStatsResult.status === "fulfilled" ? homeStatsResult.value : null;
    const awayStats = awayStatsResult.status === "fulfilled" ? awayStatsResult.value : null;
    const homeInjuries = homeInjuriesResult.status === "fulfilled" ? homeInjuriesResult.value : [];
    const awayInjuries = awayInjuriesResult.status === "fulfilled" ? awayInjuriesResult.value : [];
    const h2h = h2hResult.status === "fulfilled" ? h2hResult.value : [];

    const homeStarter = game?.pitchers?.home ?? game?.pitching?.home ?? game?.teams?.home?.pitcher ?? null;
    const awayStarter = game?.pitchers?.away ?? game?.pitching?.away ?? game?.teams?.away?.pitcher ?? null;
    const startersConfirmed = Boolean(homeStarter && awayStarter);

    const injuriesUnavailable = homeInjuriesResult.status === "rejected" || awayInjuriesResult.status === "rejected";
    const notes: string[] = [
      "API-Sports MLB game/team IDs available",
    ];

    if (game) notes.push("game details fetched by API-Sports game id");
    else notes.push("game details unavailable by API-Sports game id");

    if (startersConfirmed) notes.push("probable starting pitcher context available");
    else notes.push("probable starting pitchers missing from provider payload");

    if (odds.length > 0) notes.push("sportsbook odds available");
    else notes.push("sportsbook odds missing");

    if (odds.some((book) => book.bookmakers.length >= 2)) notes.push("multi-book odds available");
    else notes.push("multi-book odds missing");

    if (homeStats || awayStats) notes.push("team statistics available");
    else notes.push("team statistics unavailable");

    if (h2h.length > 0) notes.push("head-to-head context available");
    else notes.push("head-to-head context unavailable");

    if (injuriesUnavailable) notes.push("injury endpoint failed; analysis continued without blocking");
    else notes.push("injury endpoint checked");

    const score = [
      true,
      Boolean(game),
      startersConfirmed,
      odds.length > 0,
      odds.some((book) => book.bookmakers.length >= 2),
      Boolean(homeStats || awayStats),
      h2h.length > 0,
      !injuriesUnavailable,
    ].filter(Boolean).length;

    const grade: DataQualityGrade = score >= 7 ? "A" : score >= 5 ? "B" : score >= 3 ? "C" : "D";

    return {
      gameId,
      season,
      homeTeamId,
      awayTeamId,
      game,
      pitching: {
        startersConfirmed,
        homeStarter,
        awayStarter,
        source: startersConfirmed ? "api-sports-game-payload" : "unavailable",
      },
      odds: {
        books: odds,
        bookCount: odds.reduce((total, item) => total + item.bookmakers.length, 0),
        hasMultiBookOdds: odds.some((item) => item.bookmakers.length >= 2),
      },
      teamStatistics: {
        home: homeStats,
        away: awayStats,
      },
      injuries: {
        home: homeInjuries,
        away: awayInjuries,
        unavailable: injuriesUnavailable,
        error: injuriesUnavailable ? "At least one injury request failed. Analysis continued with remaining context." : undefined,
      },
      h2h,
      dataQuality: {
        grade,
        score,
        notes,
      },
    };
  }

  async normalizeOddsResponse(apiResponse: any[]): Promise<NormalizedOddsResponse[]> {
    let bookmakersMap: Record<number, string> = {};
    try {
      const bookmakers = await this.getBookmakers();
      bookmakersMap = bookmakers.reduce((acc, b) => {
        acc[b.id] = b.name;
        return acc;
      }, {} as Record<number, string>);
    } catch (error) {
      console.warn("[API-Sports MLB] Failed to fetch bookmakers for mapping; falling back to raw names.", error);
    }

    return apiResponse.map((item: any) => ({
      leagueId: item.league?.id,
      leagueName: item.league?.name,
      season: String(item.league?.season ?? ""),
      countryName: item.country?.name,
      countryCode: item.country?.code || null,
      gameId: item.game?.id,
      bookmakers: (item.bookmakers || []).map((b: any) => ({
        bookmakerId: b.id,
        bookmakerName: bookmakersMap[b.id] || b.name || "Unknown",
        bets: (b.bets || []).map((bet: any) => ({
          betId: bet.id,
          betName: bet.name,
          values: (bet.values || []).map((v: any) => ({
            value: String(v.value),
            odd: String(v.odd),
          })),
        })),
      })),
    }));
  }

  private formatError(error: any): ApiError {
    if (error.response) {
      return {
        message: error.response.data?.message || "API request failed",
        status: error.response.status,
        details: error.response.data,
      };
    }
    if (error.request) {
      return { message: "No response received from the server" };
    }
    return { message: error.message || "An unexpected error occurred" };
  }
}

export const apiSportsMlbService = new ApiSportsMlbService();
