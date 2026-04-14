import axios from "axios";
import { Game } from "../types";
import { format } from "date-fns";
import { getIdToken } from "../firebase";

class ESPNService {
  private baseUrl = "https://site.api.espn.com/apis/site/v2/sports";

  private leagueMap: Record<string, { sport: string; league: string }> = {
    "NBA": { sport: "basketball", league: "nba" },
    "NCAA": { sport: "basketball", league: "mens-college-basketball" },
    "NHL": { sport: "hockey", league: "nhl" },
    "NFL": { sport: "football", league: "nfl" },
    "MLB": { sport: "baseball", league: "mlb" },
  };

  private cache: Map<string, { data: Game[], timestamp: number }> = new Map();
  private CACHE_DURATION = 60 * 1000; // 60 seconds

  async getSchedule(league: string, date: Date): Promise<Game[]> {
    const config = this.leagueMap[league];
    if (!config) {
      console.warn(`ESPN API not supported for league: ${league}`);
      return [];
    }

    // Use US Eastern Time for the date string to align with NBA slates
    const etFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = etFormatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const dateStr = `${year}${month}${day}`;
    
    const cacheKey = `${league}-${dateStr}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION)) {
      console.log(`[ESPN] Returning cached schedule for ${cacheKey}`);
      return cached.data;
    }

    // We fetch a slightly wider range if it's "today" to catch games that might be 
// technically on a different date in UTC but are part of the same slate.
// However, ESPN's scoreboard API is usually slate-based for a single date.
const url = `/api/espn/schedule?sport=${config.sport}&league=${config.league}&dateStr=${dateStr}&_ts=${Date.now()}`;

const fetchWithRetry = async (retries = 3, delay = 2000): Promise<Game[]> => {
  try {
    const token = await getIdToken();
    console.log(`[ESPN] getSchedule: token present: ${!!token}`);
    console.log(`[ESPN] Fetching schedule via proxy: ${url}`);
    
    const response = await axios.get(url, { 
      timeout: 30000,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const data = response.data;
        
        if (!data.events) {
          console.log(`[ESPN] No events found in response for ${cacheKey}`);
          return [];
        }

        console.log(`[ESPN] Received ${data.events.length} events for ${cacheKey}`);

        const games = data.events.map((event: any) => {
          const competition = event.competitions?.[0];
          if (!competition) return null;

          const competitors = competition.competitors || [];
          const home = competitors.find((c: any) => c.homeAway === "home");
          const away = competitors.find((c: any) => c.homeAway === "away");

          if (!home || !away) {
            console.warn(`[ESPN] Incomplete competitors for event ${event.id}`);
            return null;
          }

          // Status mapping
          let status: 'scheduled' | 'live' | 'finished' = 'scheduled';
          const statusState = event.status?.type?.state;
          if (statusState === "in") status = 'live';
          if (statusState === "post") status = 'finished';

          return {
            id: event.id,
            league: league as any,
            homeTeam: home.team?.displayName || "TBD",
            awayTeam: away.team?.displayName || "TBD",
            homeLogo: home.team?.logo,
            awayLogo: away.team?.logo,
            homeScore: parseInt(home.score) || 0,
            awayScore: parseInt(away.score) || 0,
            date: event.date, // ISO string
            time: event.date ? format(new Date(event.date), "h:mm a") : "TBD",
            location: competition.venue?.fullName || "Unknown Venue",
            status: status,
            homeTeamStats: {
              record: home.records?.[0]?.summary || "N/A",
              last5: "N/A",
              winPercentage: "N/A"
            },
            awayTeamStats: {
              record: away.records?.[0]?.summary || "N/A",
              last5: "N/A",
              winPercentage: "N/A"
            }
          };
        }).filter(Boolean) as Game[];

        // Update cache
        this.cache.set(cacheKey, { data: games, timestamp: Date.now() });
        return games;
      } catch (error: any) {
        const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
        const isRateLimit = error.response?.status === 429;
        const isNetworkError = !error.response;

        if ((isRateLimit || isTimeout || isNetworkError) && retries > 0) {
          console.warn(`[ESPN] Fetch failed (${isTimeout ? 'Timeout' : isRateLimit ? 'Rate Limit' : 'Network Error'}). Retrying in ${delay}ms... (${retries} left)`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchWithRetry(retries - 1, delay * 2);
        }
        throw error;
      }
    };

    try {
      return await fetchWithRetry();
    } catch (error) {
      console.error("[ESPN] Failed to fetch schedule:", error);
      return [];
    }
  }

  clearCache() {
    this.cache.clear();
    console.log("[ESPN] Cache cleared");
  }
}

export const espnService = new ESPNService();
