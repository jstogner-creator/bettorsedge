import { Game } from "../types";
import { apiSportsMlbService, MlbGameContext } from "./apiSportsMlb";
import { espnService } from "./espn";

export interface SportsDataProvider {
  getGames(date: Date): Promise<any[]>;
  getOdds(filters: { game: number | string; season: string | number }): Promise<any[]>;
  getTeamStatistics(teamId: number, season: string | number): Promise<any>;
  getGameContext(params: {
    gameId: number;
    season: string | number;
    homeTeamId: number;
    awayTeamId: number;
    homeTeam?: string;
    awayTeam?: string;
  }): Promise<MlbGameContext>;
}

export class ApiSportsProvider implements SportsDataProvider {
  async getGames(date: Date): Promise<any[]> {
    return apiSportsMlbService.getGames(date);
  }

  async getOdds(filters: { game: number | string; season: string | number }): Promise<any[]> {
    return apiSportsMlbService.getOdds(filters);
  }

  async getTeamStatistics(teamId: number, season: string | number): Promise<any> {
    return apiSportsMlbService.getTeamStatistics(teamId, season);
  }

  async getGameContext(params: {
    gameId: number;
    season: string | number;
    homeTeamId: number;
    awayTeamId: number;
    homeTeam?: string;
    awayTeam?: string;
  }): Promise<MlbGameContext> {
    return apiSportsMlbService.getGameContext(params);
  }
}

export class BackupSportsProvider implements SportsDataProvider {
  async getGames(date: Date): Promise<any[]> {
    try {
      const espnGames = await espnService.getSchedule("MLB", date);
      return espnGames.map((g) => ({
        id: g.id,
        teams: {
          home: { name: g.homeTeam },
          away: { name: g.awayTeam },
        },
        status: g.status,
        date: g.date,
        time: g.time,
      }));
    } catch (e) {
      console.warn("[Backup Provider] Failed to get games from ESPN:", e);
      return [];
    }
  }

  async getOdds(): Promise<any[]> {
    return [];
  }

  async getTeamStatistics(): Promise<any> {
    return null;
  }

  async getGameContext(params: {
    gameId: number;
    season: string | number;
    homeTeamId: number;
    awayTeamId: number;
    homeTeam?: string;
    awayTeam?: string;
  }): Promise<MlbGameContext> {
    // Import generateMockMlbContext dynamically or import directly
    const { generateMockMlbContext } = await import("./apiSportsMlb");
    console.warn("[Backup Provider] API-Sports down or failed. Returning high-fidelity mock context for:", params.homeTeam, "vs", params.awayTeam);
    return generateMockMlbContext(params);
  }
}

class IngestionAdapter {
  private primary: SportsDataProvider = new ApiSportsProvider();
  private backup: SportsDataProvider = new BackupSportsProvider();
  private activeProvider: "primary" | "backup" = "primary";

  async getGames(date: Date): Promise<any[]> {
    try {
      const games = await this.primary.getGames(date);
      if (!games || games.length === 0) {
        // Double-check if it was due to credential errors
        console.warn("[Ingestion Adapter] Primary provider returned empty games. Checking fallback...");
        return this.backup.getGames(date);
      }
      this.activeProvider = "primary";
      return games;
    } catch (error) {
      console.error("[Ingestion Adapter] Primary getGames failed. Failing over to backup provider:", error);
      this.activeProvider = "backup";
      return this.backup.getGames(date);
    }
  }

  async getGameContext(params: {
    gameId: number;
    season: string | number;
    homeTeamId: number;
    awayTeamId: number;
    homeTeam?: string;
    awayTeam?: string;
  }): Promise<MlbGameContext> {
    if (this.activeProvider === "backup") {
      return this.backup.getGameContext(params);
    }

    try {
      const context = await this.primary.getGameContext(params);
      // If the primary provider returned an empty or mock-indicated dataQuality notes
      if (context.dataQuality.grade === "D" || !context.game) {
        console.warn("[Ingestion Adapter] Primary provider returned degraded context. Checking failover context...");
        return this.backup.getGameContext(params);
      }
      return context;
    } catch (error) {
      console.error("[Ingestion Adapter] Primary getGameContext failed. Failing over to backup context:", error);
      return this.backup.getGameContext(params);
    }
  }
}

export const ingestionAdapter = new IngestionAdapter();
