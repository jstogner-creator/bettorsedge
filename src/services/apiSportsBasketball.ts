import axios from "axios";
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

class ApiSportsBasketballService {
  private baseUrl = "/api/basketball";
  private bookmakersCache: Bookmaker[] | null = null;
  private bookmakersCacheTime: number = 0;
  private readonly BOOKMAKERS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  
  private oddsCache: Map<string, { data: NormalizedOddsResponse[], timestamp: number }> = new Map();
  private readonly ODDS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Helper to get auth headers
   */
  private async getHeaders() {
    const token = await getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private async fetchWithRetry(url: string, config: any = {}, retries = 3, delay = 2000): Promise<any> {
    for (let i = 0; i < retries; i++) {
      try {
        const headers = await this.getHeaders();
        const response = await axios.get(url, { 
          ...config, 
          headers: { ...headers, ...config.headers },
          timeout: 30000 // 30s timeout
        });
        return response.data;
      } catch (error: any) {
        const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
        const isRateLimit = error.response?.status === 429;
        const isNetworkError = !error.response;

        if ((isRateLimit || isTimeout || isNetworkError) && i < retries - 1) {
          console.warn(`[API-Sports Basketball] Fetch failed (${isTimeout ? 'Timeout' : isRateLimit ? 'Rate Limit' : 'Network Error'}). Retrying in ${delay}ms... (${retries - i - 1} left)`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Get the full list of supported bookmakers.
   * Caches the result in memory for 24 hours.
   */
  async getBookmakers(): Promise<Bookmaker[]> {
    if (this.bookmakersCache && Date.now() - this.bookmakersCacheTime < this.BOOKMAKERS_CACHE_TTL) {
      return this.bookmakersCache;
    }

    try {
      const data = await this.fetchWithRetry(`${this.baseUrl}/bookmakers`);

      if (data && data.response) {
        const bookmakers: Bookmaker[] = data.response.map((b: any) => ({
          id: b.id,
          name: b.name,
        }));
        
        this.bookmakersCache = bookmakers;
        this.bookmakersCacheTime = Date.now();
        return bookmakers;
      }
      return [];
    } catch (error: any) {
      console.error("[API-Sports Basketball] Error fetching bookmakers:", error);
      throw this.formatError(error);
    }
  }

  /**
   * Get odds with optional filters.
   */
  async getOdds(filters: {
    season?: string;
    league?: number | string;
    game?: number | string;
    bookmaker?: number | string;
    bet?: number | string;
    page?: number;
    limit?: number;
  }): Promise<NormalizedOddsResponse[]> {
    const cacheKey = JSON.stringify(filters);
    const cached = this.oddsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.ODDS_CACHE_TTL) {
      return cached.data;
    }

    try {
      const data = await this.fetchWithRetry(`${this.baseUrl}/odds`, { params: filters });

      if (data && data.response) {
        const normalized = await this.normalizeOddsResponse(data.response);
        this.oddsCache.set(cacheKey, { data: normalized, timestamp: Date.now() });
        return normalized;
      }
      return [];
    } catch (error: any) {
      console.error("[API-Sports Basketball] Error fetching odds:", error);
      throw this.formatError(error);
    }
  }

  /**
   * Helper to get odds for a specific game.
   */
  async getOddsForGame(
    gameId: number | string,
    options?: {
      season?: string;
      league?: number | string;
      bookmaker?: number | string;
      bet?: number | string;
    }
  ): Promise<NormalizedOddsResponse[]> {
    return this.getOdds({
      game: gameId,
      ...options,
    });
  }

  /**
   * Normalizes the raw API odds response into a cleaner structure.
   */
  async normalizeOddsResponse(apiResponse: any[]): Promise<NormalizedOddsResponse[]> {
    // Ensure we have bookmakers to map IDs to names
    let bookmakersMap: Record<number, string> = {};
    try {
      const bookmakers = await this.getBookmakers();
      bookmakersMap = bookmakers.reduce((acc, b) => {
        acc[b.id] = b.name;
        return acc;
      }, {} as Record<number, string>);
    } catch (e) {
      console.warn("[API-Sports Basketball] Failed to fetch bookmakers for mapping, names will fallback to 'Unknown'");
    }

    return apiResponse.map((item: any) => {
      const normalizedBookmakers = (item.bookmakers || []).map((b: any) => {
        const bookmakerName = bookmakersMap[b.id] || b.name || "Unknown";
        
        const normalizedBets = (b.bets || []).map((bet: any) => ({
          betId: bet.id,
          betName: bet.name,
          values: (bet.values || []).map((v: any) => ({
            value: String(v.value),
            odd: String(v.odd),
          })),
        }));

        return {
          bookmakerId: b.id,
          bookmakerName,
          bets: normalizedBets,
        };
      });

      return {
        leagueId: item.league?.id,
        leagueName: item.league?.name,
        season: item.league?.season,
        countryName: item.country?.name,
        countryCode: item.country?.code || null,
        gameId: item.game?.id,
        bookmakers: normalizedBookmakers,
      };
    });
  }

  /**
   * Formats Axios errors into a clean ApiError structure.
   */
  private formatError(error: any): ApiError {
    if (error.response) {
      return {
        message: error.response.data?.message || "API request failed",
        status: error.response.status,
        details: error.response.data,
      };
    } else if (error.request) {
      return {
        message: "No response received from the server",
      };
    } else {
      return {
        message: error.message || "An unexpected error occurred",
      };
    }
  }
}

export const apiSportsBasketballService = new ApiSportsBasketballService();
