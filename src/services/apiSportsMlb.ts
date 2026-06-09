import axios from "axios";
import { format } from "date-fns";
import { getIdToken } from "../firebase";
import type { Game } from "../types";

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

export type MlbDataQualityGrade = "A" | "B" | "C" | "D";

export type MlbGameContext = {
  gameId: number | string;
  season: string;
  homeTeamId: number | string;
  awayTeamId: number | string;
  fetchedAt: string;
  game: any | null;
  odds: NormalizedOddsResponse[];
  teams: {
    home: {
      id: number | string;
      statistics: any | null;
      injuries: any[];
    };
    away: {
      id: number | string;
      statistics: any | null;
      injuries: any[];
    };
  };
  pitching: {
    probableStarters: {
      home: any | null;
      away: any | null;
    };
    startersConfirmed: boolean;
    notes: string[];
  };
  h2h: any[];
  dataQuality: {
    grade: MlbDataQualityGrade;
    score: number;
    maxScore: number;
    present: Record<string, boolean>;
    notes: string[];
  };
};

class ApiSportsMlbService {
  private baseUrl = "/api/mlb";
  private bookmakersCache: Bookmaker[] | null = null;
  private bookmakersCacheTime: number = 0;
  private readonly BOOKMAKERS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  
  private oddsCache: Map<string, { data: NormalizedOddsResponse[], timestamp: number }> = new Map();
  private readonly ODDS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private gameContextCache: Map<string, { data: MlbGameContext, timestamp: number }> = new Map();
  private readonly GAME_CONTEXT_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  private gamesCache: Map<string, { data: Game[], timestamp: number }> = new Map();
  private readonly GAMES_CACHE_TTL = 24 * 60 * 60 * 1000; // daily static schedule cache

  private async getHeaders() {
    const token = await getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private getLocalGamesCache(dateStr: string): Game[] | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(`bettorsedge-mlb-games-${dateStr}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { timestamp: number; data: Game[] };
      if (!parsed?.timestamp || !Array.isArray(parsed.data)) return null;
      if (Date.now() - parsed.timestamp > this.GAMES_CACHE_TTL) return null;
      return parsed.data.map((g) => this.normalizeStoredGame(g, dateStr)).filter(Boolean) as Game[];
    } catch (error) {
      console.warn("[API-Sports MLB] Failed to read local game cache:", error);
      return null;
    }
  }

  private setLocalGamesCache(dateStr: string, games: Game[]) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(`bettorsedge-mlb-games-${dateStr}`, JSON.stringify({
        timestamp: Date.now(),
        data: games,
      }));
    } catch (error) {
      console.warn("[API-Sports MLB] Failed to write local game cache:", error);
    }
  }

  private normalizeStoredGame(raw: any, dateStr: string): Game | null {
    if (!raw) return null;
    if (raw.homeTeam && raw.awayTeam) {
      const safeDate = String(raw.date || dateStr).split("T")[0] || dateStr;
      return {
        ...raw,
        id: String(raw.id || `mlb-${raw.awayTeam}-${raw.homeTeam}-${safeDate}`).toLowerCase().replace(/[^a-z0-9]/g, "-"),
        league: "MLB",
        homeTeam: String(raw.homeTeam),
        awayTeam: String(raw.awayTeam),
        date: safeDate,
        time: String(raw.time || "00:00"),
        location: raw.location || raw.venue?.name || raw.venue || "Unknown",
        status: raw.status === "live" || raw.status === "finished" ? raw.status : "scheduled",
      } as Game;
    }
    return this.normalizeApiSportsGame(raw, dateStr);
  }

  private normalizeApiSportsGame(raw: any, dateStr: string): Game | null {
    if (!raw?.teams?.home?.name || !raw?.teams?.away?.name) return null;

    const statusStr = raw.status?.short || raw.status?.long || "NS";
    let status: Game["status"] = "scheduled";
    if (["IN1", "IN2", "IN3", "IN4", "IN5", "IN6", "IN7", "IN8", "IN9", "IN10", "IN11", "IN12", "IN", "LIVE"].includes(statusStr)) {
      status = "live";
    }
    if (["FT", "AOT", "FINAL"].includes(statusStr)) {
      status = "finished";
    }

    const dateVal = raw.date ? String(raw.date) : dateStr;
    const safeDateStr = dateVal.split("T")[0] || dateStr;
    const timeStr = raw.time || (dateVal.includes("T") ? dateVal.split("T")[1]?.substring(0, 5) : "00:00") || "00:00";
    const venue = raw.venue?.name || raw.venue || raw.game?.venue?.name || "Unknown";

    return {
      id: `mlb-${raw.teams.away.name}-${raw.teams.home.name}-${safeDateStr}`.toLowerCase().replace(/[^a-z0-9]/g, "-"),
      league: "MLB",
      homeTeam: String(raw.teams.home.name),
      awayTeam: String(raw.teams.away.name),
      homeLogo: raw.teams.home.logo,
      awayLogo: raw.teams.away.logo,
      date: safeDateStr,
      time: timeStr,
      location: venue,
      status,
      homeScore: raw.scores?.home?.total,
      awayScore: raw.scores?.away?.total,
      apiSportsGameId: raw.id,
      apiSportsHomeTeamId: raw.teams.home.id,
      apiSportsAwayTeamId: raw.teams.away.id,
    };
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
      console.error("[API-Sports MLB] Error fetching bookmakers:", error);
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
      console.error("[API-Sports MLB] Error fetching odds:", error);
      throw this.formatError(error);
    }
  }

  async getGames(date: Date): Promise<Game[]> {
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const memoryCached = this.gamesCache.get(dateStr);
      if (memoryCached && Date.now() - memoryCached.timestamp < this.GAMES_CACHE_TTL) {
        return memoryCached.data;
      }

      const localCached = this.getLocalGamesCache(dateStr);
      if (localCached && localCached.length > 0) {
        this.gamesCache.set(dateStr, { data: localCached, timestamp: Date.now() });
        console.log(`[API-Sports MLB] Using static local cache for ${dateStr}: ${localCached.length} games`);
        return localCached;
      }

      const headers = await this.getHeaders();
      const response = await axios.get(`${this.baseUrl}/games`, {
        params: { date: dateStr },
        headers
      });

      if (response.data && Array.isArray(response.data.response)) {
        const games = response.data.response
          .map((raw: any) => this.normalizeApiSportsGame(raw, dateStr))
          .filter(Boolean) as Game[];
        this.gamesCache.set(dateStr, { data: games, timestamp: Date.now() });
        this.setLocalGamesCache(dateStr, games);
        return games;
      }
      return [];
    } catch (error) {
      console.error("[API-Sports MLB] Error fetching games:", error);
      return [];
    }
  }

  async getGameById(gameId: number | string): Promise<any | null> {
    try {
      const headers = await this.getHeaders();
      const response = await axios.get(`${this.baseUrl}/games`, {
        params: { id: gameId },
        headers
      });

      if (response.data && Array.isArray(response.data.response)) {
        return response.data.response[0] || null;
      }
      return null;
    } catch (error) {
      console.error("[API-Sports MLB] Error fetching game by id:", error);
      return null;
    }
  }

  async getGameContext(filters: {
    gameId: number | string;
    season: number | string;
    homeTeamId: number | string;
    awayTeamId: number | string;
  }): Promise<MlbGameContext> {
    const season = String(filters.season);
    const cacheKey = JSON.stringify(filters);
    const cached = this.gameContextCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.GAME_CONTEXT_CACHE_TTL) {
      return cached.data;
    }

    const safe = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (error) {
        console.warn(`[API-Sports MLB] ${label} context fetch failed:`, error);
        return fallback;
      }
    };

    const [game, odds, homeStats, awayStats, homeInjuries, awayInjuries, h2h] = await Promise.all([
      safe("game", () => this.getGameById(filters.gameId), null),
      safe("odds", () => this.getOdds({ game: filters.gameId }), [] as NormalizedOddsResponse[]),
      safe("home team statistics", () => this.getTeamStatistics(Number(filters.homeTeamId), season), null),
      safe("away team statistics", () => this.getTeamStatistics(Number(filters.awayTeamId), season), null),
      safe("home injuries", () => this.getInjuries(Number(filters.homeTeamId), season), [] as any[]),
      safe("away injuries", () => this.getInjuries(Number(filters.awayTeamId), season), [] as any[]),
      safe("head-to-head", () => this.getH2H(Number(filters.homeTeamId), Number(filters.awayTeamId)), [] as any[]),
    ]);

    const homePitcher = this.extractProbablePitcher(game, "home");
    const awayPitcher = this.extractProbablePitcher(game, "away");

    const pitching = {
      probableStarters: {
        home: homePitcher,
        away: awayPitcher,
      },
      startersConfirmed: Boolean(homePitcher && awayPitcher),
      notes: [
        homePitcher ? "home probable starter available" : "home probable starter missing",
        awayPitcher ? "away probable starter available" : "away probable starter missing",
        "starting pitcher availability is treated as a major MLB confidence factor",
      ],
    };

    const present: Record<string, boolean> = {
      game: Boolean(game),
      odds: odds.length > 0,
      homeStats: Boolean(homeStats),
      awayStats: Boolean(awayStats),
      homeInjuries: Array.isArray(homeInjuries),
      awayInjuries: Array.isArray(awayInjuries),
      h2h: h2h.length > 0,
      pitcherContext: pitching.startersConfirmed,
    };

    const score = Object.values(present).filter(Boolean).length;
    const grade: MlbDataQualityGrade = score >= 7 ? "A" : score >= 5 ? "B" : score >= 3 ? "C" : "D";

    const context: MlbGameContext = {
      gameId: filters.gameId,
      season,
      homeTeamId: filters.homeTeamId,
      awayTeamId: filters.awayTeamId,
      fetchedAt: new Date().toISOString(),
      game,
      odds,
      teams: {
        home: {
          id: filters.homeTeamId,
          statistics: homeStats,
          injuries: homeInjuries,
        },
        away: {
          id: filters.awayTeamId,
          statistics: awayStats,
          injuries: awayInjuries,
        },
      },
      pitching,
      h2h,
      dataQuality: {
        grade,
        score,
        maxScore: Object.keys(present).length,
        present,
        notes: [
          present.game ? "game detail available" : "game detail missing",
          present.odds ? "market odds available" : "market odds missing",
          present.homeStats && present.awayStats ? "both team stat profiles available" : "one or both team stat profiles missing",
          present.homeInjuries && present.awayInjuries ? "injury feeds checked" : "injury feed missing",
          present.h2h ? "head-to-head context available" : "head-to-head context missing",
          present.pitcherContext ? "probable starting pitchers available" : "probable starting pitchers missing; downgrade MLB confidence",
        ],
      },
    };

    this.gameContextCache.set(cacheKey, { data: context, timestamp: Date.now() });
    return context;
  }

  private extractProbablePitcher(game: any, side: "home" | "away") {
    if (!game) return null;

    return (
      game?.pitchers?.[side] ||
      game?.pitcher?.[side] ||
      game?.teams?.[side]?.pitcher ||
      game?.lineups?.[side]?.pitcher ||
      game?.probablePitchers?.[side] ||
      null
    );
  }

  async getStandings(season: string): Promise<any[]> {
    try {
      const headers = await this.getHeaders();
      const response = await axios.get(`${this.baseUrl}/standings`, {
        params: { season },
        headers
      });

      if (response.data && response.data.response) {
        return response.data.response;
      }
      return [];
    } catch (error) {
      console.error("[API-Sports MLB] Error fetching standings:", error);
      return [];
    }
  }

  async getTeamStatistics(teamId: number, season: string): Promise<any> {
    try {
      const headers = await this.getHeaders();
      const response = await axios.get(`${this.baseUrl}/statistics/teams`, {
        params: { team: teamId, season },
        headers
      });

      if (response.data && response.data.response) {
        return response.data.response;
      }
      return null;
    } catch (error) {
      console.error("[API-Sports MLB] Error fetching team statistics:", error);
      return null;
    }
  }

  async getInjuries(teamId: number, season: string): Promise<any[]> {
    try {
      const headers = await this.getHeaders();
      const response = await axios.get(`${this.baseUrl}/injuries`, {
        params: { team: teamId, season },
        headers
      });

      if (response.data && response.data.response) {
        return response.data.response;
      }
      return [];
    } catch (error) {
      console.error("[API-Sports MLB] Error fetching injuries:", error);
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
      console.error("[API-Sports MLB] Error fetching H2H:", error);
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
      console.warn("[API-Sports MLB] Failed to fetch bookmakers for mapping, names will fallback to 'Unknown'");
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

export const apiSportsMlbService = new ApiSportsMlbService();