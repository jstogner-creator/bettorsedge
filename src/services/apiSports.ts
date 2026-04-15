import axios from "axios";
import { getIdToken } from "../firebase";
import { format } from "date-fns";

export interface ApiSportsGame {
  id: number;
  date: string;
  time: string;
  timestamp: number;
  timezone: string;
  stage: string | null;
  week: string | null;
  venue: string | null;
  status: {
    long: string;
    short: string;
    timer: number | null;
  };
  league: {
    id: number;
    name: string;
    type: string;
    season: string;
    logo: string;
  };
  teams: {
    home: {
      id: number;
      name: string;
      logo: string;
    };
    away: {
      id: number;
      name: string;
      logo: string;
    };
  };
  scores: {
    home: {
      quarter_1: number;
      quarter_2: number;
      quarter_3: number;
      quarter_4: number;
      over_time: number | null;
      total: number;
    };
    away: {
      quarter_1: number;
      quarter_2: number;
      quarter_3: number;
      quarter_4: number;
      over_time: number | null;
      total: number;
    };
  };
}

class ApiSportsService {
  private baseUrl = "/api/nba";

  private async getAuthHeaders() {
    const token = await getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async getGames(date: Date): Promise<ApiSportsGame[]> {
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const headers = await this.getAuthHeaders();

      const response = await axios.get(`${this.baseUrl}/games`, {
        params: { date: dateStr, _ts: Date.now() },
        headers
      });

      return response.data?.response || [];
    } catch (error) {
      console.error("[API-Sports Service] Error fetching games:", error);
      return [];
    }
  }

  async getTeamStats(teamId: number, season: string): Promise<any> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await axios.get(`${this.baseUrl}/teams/statistics`, {
        params: { id: teamId, season },
        headers
      });

      return response.data?.response || null;
    } catch (error) {
      console.error(`[API-Sports Service] Error fetching stats for team ${teamId}:`, error);
      return null;
    }
  }

  async getInjuries(teamId: number, season: string): Promise<any[]> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await axios.get(`${this.baseUrl}/injuries`, {
        params: { team: teamId, season },
        headers
      });

      return response.data?.response || [];
    } catch (error) {
      console.error(`[API-Sports Service] Error fetching injuries for team ${teamId}:`, error);
      return [];
    }
  }

  async getPlayers(teamId: number, season: string): Promise<any[]> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await axios.get(`${this.baseUrl}/players`, {
        params: { team: teamId, season },
        headers
      });

      return response.data?.response || [];
    } catch (error) {
      console.error(`[API-Sports Service] Error fetching players for team ${teamId}:`, error);
      return [];
    }
  }

  async getPlayerStats(teamId: number, season: string): Promise<any[]> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await axios.get(`${this.baseUrl}/players/statistics`, {
        params: { team: teamId, season },
        headers
      });

      return response.data?.response || [];
    } catch (error) {
      console.error(`[API-Sports Service] Error fetching player stats for team ${teamId}:`, error);
      return [];
    }
  }

  async getH2H(homeTeamId: number, awayTeamId: number, season: string): Promise<any[]> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await axios.get(`${this.baseUrl}/games`, {
        params: {
          h2h: `${homeTeamId}-${awayTeamId}`,
          season
        },
        headers
      });

      return response.data?.response || [];
    } catch (error) {
      console.error(`[API-Sports Service] Error fetching H2H for ${homeTeamId}-${awayTeamId}:`, error);
      return [];
    }
  }
}

export const apiSportsService = new ApiSportsService();
