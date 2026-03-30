import axios from "axios";
import { Game } from "../types";
import { getIdToken } from "../firebase";

export interface KalshiEvent {
  ticker: string;
  series_ticker: string;
  title: string;
  markets: KalshiMarketData[];
}

export interface KalshiMarketData {
  ticker: string;
  title: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  status: string;
  volume: number;
  event_ticker: string;
}

class KalshiService {
  // Map our league names to Kalshi series tickers
  private leagueMap: Record<string, string> = {
    "NBA": "KXNBAGAME",
    "NFL": "KXNFLGAME", // Assuming this follows the pattern
    "NHL": "KXNHLGAME",
    "MLB": "KXMLBGAME", // Assuming this follows the pattern
    "NCAA": "KXNCAAMBGAME", 
  };

  async getEvents(league: string): Promise<KalshiEvent[]> {
    const seriesTicker = this.leagueMap[league] || "KXNBAGAME"; // Default to NBA

    try {
      // Fetch markets for the league
      // We filter by status=open to get active games
      const token = await getIdToken();
      const response = await axios.get("/api/kalshi/markets", {
        params: {
          series_ticker: seriesTicker,
          status: "open",
          limit: 100, // Get enough markets
        },
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      const markets: KalshiMarketData[] = response.data.markets || [];
      
      // Group markets by event_ticker to simulate the old events structure
      const eventsMap = new Map<string, KalshiEvent>();
      
      for (const market of markets) {
        if (!eventsMap.has(market.event_ticker)) {
          eventsMap.set(market.event_ticker, {
            ticker: market.event_ticker,
            series_ticker: seriesTicker,
            title: market.title, // Use market title as event title
            markets: []
          });
        }
        eventsMap.get(market.event_ticker)!.markets.push(market);
      }

      return Array.from(eventsMap.values());
    } catch (error: any) {
      // Handle specific error cases
      if (error.response) {
        if (error.response.status === 401 || error.response.status === 403) {
          console.warn("Kalshi API authentication failed. Check API keys.");
          // Don't throw, just return empty so the app continues working without odds
          return [];
        }
        if (error.response.status === 429) {
          console.warn("Kalshi API rate limit exceeded.");
          return [];
        }
        if (error.response.status === 503) {
           // 503 often means the proxy is down or not configured
           console.warn("Kalshi proxy service unavailable.");
           return [];
        }
      }
      
      // Log other errors but don't crash the app
      console.warn("Failed to fetch Kalshi markets:", error.message || error);
      return [];
    }
  }

  async getMarket(ticker: string): Promise<KalshiMarketData | null> {
    try {
      const token = await getIdToken();
      const response = await axios.get(`/api/kalshi/markets/${ticker}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      return response.data.market;
    } catch (error) {
      console.error("Failed to fetch Kalshi market:", error);
      return null;
    }
  }

  // Helper to find a matching event for a game
  findMatchingEvent(game: Game, events: KalshiEvent[]): KalshiEvent | undefined {
    // Normalize strings
    const normalize = (s: string) => (s && typeof s === 'string') ? s.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    
    // Extract key identifying words (e.g. "Lakers" from "Los Angeles Lakers")
    const getKeywords = (name: string) => {
      if (!name || typeof name !== 'string') return [];
      const fillers = ["the", "and", "team", "club", "university", "state", "college"];
      return name.split(" ")
        .filter(w => w.length >= 2 && !fillers.includes(w.toLowerCase()))
        .map(normalize);
    };

    const homeKeywords = getKeywords(game.homeTeam);
    const awayKeywords = getKeywords(game.awayTeam);

    // Try multiple matching strategies
    
    // Strategy 1: Both teams keywords match
    const match = events.find(event => {
      const title = normalize(event.title);
      const homeMatch = homeKeywords.some(k => title.includes(k));
      const awayMatch = awayKeywords.some(k => title.includes(k));
      return homeMatch && awayMatch;
    });

    if (match) return match;

    // Strategy 2: Ticker matching (if available)
    // Kalshi tickers often contain team abbreviations
    const tickerMatch = events.find(event => {
      const ticker = normalize(event.ticker);
      const homeMatch = homeKeywords.some(k => ticker.includes(k));
      const awayMatch = awayKeywords.some(k => ticker.includes(k));
      return homeMatch && awayMatch;
    });

    return tickerMatch;
  }
}

export const kalshiService = new KalshiService();
