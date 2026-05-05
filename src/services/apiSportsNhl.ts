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

class ApiSportsNhlService {
  private baseUrl = "/api/nhl";
  private bookmakersCache: Bookmaker[] | null = null;
  private bookmakersCacheTime: number = 0;
  private readonly BOOKMAKERS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  
  private oddsCache: Map<string, { data: NormalizedOddsResponse[], timestamp: number }> = new Map();
  private readonly ODDS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private async getHeaders() {
    const token = await getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async getBookmakers(): Promise<Bookmaker[]> {
    if (this.bookmakersCache && Date.now() - this.bookmakersCacheTime < this.BOOKMAKERS_CACHE_TTL) {
      return this.bookmakersCache;
    }

    try {
      const headers = await this.getHeaders();
      const response = await axios.get(`${this.baseUrl}/bookmakers`, { headers });

      if (response.data && response.data.response) {
        const bookmakers: Bookmaker[] = response.data.response.map((b: any) => ({
          id: b.id,
          name: b.name,
        }));
        
        this.bookmakersCache = bookmakers;
        this.bookmakersCacheTime = Date.now();
        return bookmakers;
      }
      return [];
    } catch (error: any) {
      console.error("[API-Sports NHL] Error fetching bookmakers:", error);
      throw this.formatError(error);
    }
  }

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
      const headers = await this.getHeaders();
      const response = await axios.get(`${this.baseUrl}/odds`, {
        params: filters,
        headers,
      });

      if (response.data && response.data.response) {
        const normalized = await this.normalizeOddsResponse(response.data.response);
        this.oddsCache.set(cacheKey, { data: normalized, timestamp: Date.now() });
        return normalized;
      }
      return [];
    } catch (error: any) {
      console.error("[API-Sports NHL] Error fetching odds:", error);
      throw this.formatError(error);
    }
  }

  async getGames(date: Date): Promise<any[]> {
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const headers = await this.getHeaders();
      const response = await axios.get(`${this.baseUrl}/games`, {
        params: { date: dateStr },
        headers
      });

      if (response.data && response.data.response) {
        return response.data.response;
      }
      return [];
    } catch (error) {
      console.error("[API-Sports NHL] Error fetching games:", error);
      return [];
    }
  }

  async getH2H(homeId: number, awayId: number): Promise<any[]> {
    try {
      const headers = await this.getHeaders();
      const response = await axios.get(`${this.baseUrl}/games/h2h`, {
        params: { h2h: `${homeId}-${awayId}` },
        headers
      });

      if (response.data && response.data.response) {
        return response.data.response;
      }
      return [];
    } catch (error) {
      console.error("[API-Sports NHL] Error fetching H2H:", error);
      return [];
    }
  }

  async normalizeOddsResponse(apiResponse: any[]): Promise<NormalizedOddsResponse[]> {
    let bookmakersMap: Record<number, string> = {};
    try {
      const bookmakers = await this.getBookmakers();
      bookmakersMap = bookmakers.reduce((acc, b) => {
        acc[b.id] = b.name;
        return acc;
      }, {} as Record<number, string>);
    } catch (e) {
      console.warn("[API-Sports NHL] Failed to fetch bookmakers for mapping, names will fallback to 'Unknown'");
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

export const apiSportsNhlService = new ApiSportsNhlService();
