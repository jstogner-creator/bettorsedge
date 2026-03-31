import axios from "axios";
import { getIdToken } from "../firebase";

export interface SportradarInjury {
  id: string;
  full_name: string;
  status: string;
  comment: string;
  desc: string;
  start_date?: string;
  update_date?: string;
}

export interface SportradarTeamInjuries {
  id: string;
  name: string;
  market: string;
  players: SportradarInjury[];
}

export interface SportradarGameSummary {
  id: string;
  status: string;
  home: any;
  away: any;
}

class SportradarService {
  private cache: Map<string, { data: any, timestamp: number }> = new Map();
  private pendingRequests: Map<string, Promise<any>> = new Map();
  private CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
  private lastRequestTime = 0;
  private MIN_REQUEST_INTERVAL = 1100; // 1.1s to be safe with trial 1s limit

  private async pace() {
    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;
    if (timeSinceLast < this.MIN_REQUEST_INTERVAL) {
      const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLast;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();
  }

  private async apiGet(url: string, params: any = {}, cacheKey?: string, duration: number = this.CACHE_DURATION): Promise<any> {
    // Check cache first
    if (cacheKey) {
      const cached = this.cache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < duration)) {
        console.log(`[Sportradar] Cache HIT: ${cacheKey}`);
        return cached.data;
      }
    }

    // Check pending requests to avoid duplicate concurrent calls
    const pendingKey = cacheKey || url + JSON.stringify(params);
    if (this.pendingRequests.has(pendingKey)) {
      console.log(`[Sportradar] Waiting for pending request: ${pendingKey}`);
      return this.pendingRequests.get(pendingKey);
    }

    const requestPromise = (async () => {
      try {
        console.log(`[Sportradar] Cache MISS: fetching ${url}...`);
        await this.pace();
        const token = await getIdToken();
        const response = await axios.get(url, {
          params,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          timeout: 120000 // Increased timeout for Sportradar proxy scans to allow for deep discovery
        });

        const data = response.data;
        if (cacheKey) {
          this.cache.set(cacheKey, { data, timestamp: Date.now() });
        }
        return data;
      } catch (error: any) {
        console.error(`[Sportradar] ERROR fetching ${url}:`, error.response?.data || error.message);
        throw error;
      } finally {
        this.pendingRequests.delete(pendingKey);
      }
    })();

    this.pendingRequests.set(pendingKey, requestPromise);
    return requestPromise;
  }

  async getInjuries(league: string = 'nba'): Promise<SportradarTeamInjuries[]> {
    const l = league.toLowerCase();
    const cacheKey = `injuries-${l}`;
    try {
      const data = await this.apiGet('/api/sportradar/injuries', { league: l }, cacheKey, 60 * 60 * 1000); // 1 hour cache
      const teams = data.teams || [];
      console.log(`[Sportradar] SUCCESS: Received ${league} injuries for ${teams.length} teams`);
      return teams;
    } catch (error) {
      return [];
    }
  }

  async getGameSummary(gameId: string, league: string = 'nba'): Promise<SportradarGameSummary | null> {
    const l = league.toLowerCase();
    const cacheKey = `summary-${l}-${gameId}`;
    try {
      const summary = await this.apiGet('/api/sportradar/summary', { gameId, league: l }, cacheKey);
      const hasLineups = !!(summary.home?.players && summary.away?.players);
      console.log(`[Sportradar] SUCCESS: Received ${league} summary for ${gameId}. Lineups: ${hasLineups}`);
      return summary;
    } catch (error) {
      return null;
    }
  }

  async getDailyChangelog(league: string, date: Date): Promise<any> {
    const { year, month, day, dateStr } = this.formatDateET(date);
    const l = league.toLowerCase();
    const cacheKey = `daily-changelog-${l}-${dateStr}`;
    
    try {
      const data = await this.apiGet('/api/sportradar/daily-changelog', { year, month, day, league: l }, cacheKey);
      console.log(`[Sportradar] SUCCESS: Received ${league} daily changelog for ${dateStr}`);
      return data;
    } catch (error) {
      return null;
    }
  }

  async getDailyInjuries(league: string, date: Date): Promise<any> {
    const { year, month, day, dateStr } = this.formatDateET(date);
    const l = league.toLowerCase();
    const cacheKey = `daily-injuries-${l}-${dateStr}`;
    
    try {
      const data = await this.apiGet('/api/sportradar/daily-injuries', { year, month, day, league: l }, cacheKey);
      console.log(`[Sportradar] SUCCESS: Received ${league} daily injuries for ${dateStr}`);
      return data;
    } catch (error) {
      return null;
    }
  }

  async getDailySummary(league: string, date: Date): Promise<any> {
    const { year, month, day, dateStr } = this.formatDateET(date);
    const l = league.toLowerCase();
    const cacheKey = `daily-summary-${l}-${dateStr}`;
    
    try {
      const summary = await this.apiGet('/api/sportradar/daily-summary', { league: l, year, month, day }, cacheKey);
      console.log(`[Sportradar] SUCCESS: Received ${league} daily summary for ${dateStr}`);
      return summary;
    } catch (error) {
      return null;
    }
  }

  async getHeadToHead(teamId1: string, teamId2: string, league: string = 'mlb'): Promise<any> {
    const l = league.toLowerCase();
    const cacheKey = `h2h-${l}-${teamId1}-${teamId2}`;
    
    try {
      const h2h = await this.apiGet('/api/sportradar/head-to-head', { teamId1, teamId2, league: l }, cacheKey);
      console.log(`[Sportradar] SUCCESS: Received ${league} head-to-head for ${teamId1} vs ${teamId2}`);
      return h2h;
    } catch (error) {
      return null;
    }
  }

  private formatDateET(date: Date) {
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
    return { year, month, day, dateStr: `${year}-${month}-${day}` };
  }

  async getDailySchedule(date: Date, league: string = 'nba'): Promise<any[]> {
    const { year, month, day, dateStr } = this.formatDateET(date);
    const l = league.toLowerCase();
    const cacheKey = `schedule-${l}-${dateStr}`;
    
    try {
      const data = await this.apiGet('/api/sportradar/schedule', { year, month, day, league: l }, cacheKey);
      const rawGames = data.games || [];
      
      const games: any[] = rawGames.map((g: any) => {
        // Filter by date in ET to ensure it matches the requested slate
        const gameDate = new Date(g.scheduled);
        const { dateStr: gDateStr } = this.formatDateET(gameDate);

        if (gDateStr !== dateStr) {
          console.log(`[Sportradar] Skipping game ${g.away?.name} @ ${g.home?.name} (${g.scheduled}) - belongs to slate ${gDateStr}, not ${dateStr}`);
          return null;
        }

        return {
          id: g.id,
          league: league.toUpperCase(),
          homeTeam: g.home?.name || "TBD",
          awayTeam: g.away?.name || "TBD",
          homeId: g.home?.id,
          awayId: g.away?.id,
          date: g.scheduled,
          time: g.scheduled ? new Date(g.scheduled).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : "TBD",
          location: g.venue ? `${g.venue.name}, ${g.venue.city}` : "Unknown Venue",
          status: g.status === 'closed' || g.status === 'complete' ? 'finished' : 
                  g.status === 'inprogress' || g.status === 'live' || g.status === 'halftime' ? 'live' : 'scheduled',
          homeScore: g.home_points !== undefined ? g.home_points : (g.home?.points || 0),
          awayScore: g.away_points !== undefined ? g.away_points : (g.away?.points || 0),
          broadcast: g.broadcasts?.[0]?.network || g.broadcasts?.[0]?.name || "TBD",
          homeTeamStats: { record: "N/A", last5: "N/A", winPercentage: "N/A" },
          awayTeamStats: { record: "N/A", last5: "N/A", winPercentage: "N/A" }
        };
      }).filter(Boolean);

      console.log(`[Sportradar] SUCCESS: Received ${league} schedule for ${dateStr} with ${games.length} games`);
      return games;
    } catch (error) {
      return [];
    }
  }

  async getOdds(sportId: string = 'sr:sport:2', date?: string): Promise<any> {
    const cacheKey = `odds-schedule-${sportId}-${date || ''}`;
    try {
      const odds = await this.apiGet('/api/sportradar/odds', { sportId, date, type: 'schedule' }, cacheKey);
      console.log(`[Sportradar] SUCCESS: Received odds schedule for ${sportId}`);
      return odds;
    } catch (error) {
      return null;
    }
  }

  async getDailyOdds(league: string, date?: string): Promise<Record<string, any>> {
    let sportId = 'sr:sport:2'; // Default NBA
    const l = league.toUpperCase();
    if (l === 'NFL') sportId = 'sr:sport:9';
    else if (l === 'NHL') sportId = 'sr:sport:4';
    else if (l === 'MLB') sportId = 'sr:sport:3';
    else if (l === 'SOCCER') sportId = 'sr:sport:1';
    
    console.log(`[Sportradar Service] Fetching odds for ${league} (${sportId}) on ${date || 'today'}...`);
    const data = await this.getOdds(sportId, date);
    if (!data || !data.sport_events) {
      console.log(`[Sportradar Service] No sport_events found in response for ${league}`);
      return {};
    }

    console.log(`[Sportradar Service] Found ${data.sport_events.length} sport_events for ${league}`);
    const oddsMap: Record<string, any> = {};
    
    data.sport_events.forEach((se: any) => {
      const markets = se.markets || [];
      const gameOdds: any = { source: "Sportradar Consensus" };
      
      // Extract Moneyline
      const mlMarket = markets.find((m: any) => m.name === 'moneyline' || m.name === '2way' || m.name === '1x2');
      if (mlMarket && mlMarket.books && mlMarket.books.length > 0) {
        const book = mlMarket.books[0]; // Use first book as consensus
        const homeOutcome = book.outcomes.find((o: any) => o.type === 'home' || o.name === '1');
        const awayOutcome = book.outcomes.find((o: any) => o.type === 'away' || o.name === '2');
        if (homeOutcome) gameOdds.homeML = homeOutcome.odds;
        if (awayOutcome) gameOdds.awayML = awayOutcome.odds;
      }

      // Extract Spread
      const spreadMarket = markets.find((m: any) => m.name === 'spread' || m.name === 'handicap');
      if (spreadMarket && spreadMarket.books && spreadMarket.books.length > 0) {
        const book = spreadMarket.books[0];
        const homeOutcome = book.outcomes.find((o: any) => o.type === 'home');
        const awayOutcome = book.outcomes.find((o: any) => o.type === 'away');
        if (homeOutcome) {
          gameOdds.spread = homeOutcome.handicap;
          gameOdds.homeSpreadOdds = homeOutcome.odds;
        }
        if (awayOutcome) {
          gameOdds.awaySpreadOdds = awayOutcome.odds;
        }
      }

      // Extract Total
      const totalMarket = markets.find((m: any) => m.name === 'total' || m.name === 'over_under');
      if (totalMarket && totalMarket.books && totalMarket.books.length > 0) {
        const book = totalMarket.books[0];
        const overOutcome = book.outcomes.find((o: any) => o.type === 'over');
        const underOutcome = book.outcomes.find((o: any) => o.type === 'under');
        if (overOutcome) {
          gameOdds.total = overOutcome.total;
          gameOdds.overOdds = overOutcome.odds;
        }
        if (underOutcome) {
          gameOdds.underOdds = underOutcome.odds;
        }
      }

      // Use a composite key for matching (Home vs Away)
      const homeName = se.home_team?.name?.toLowerCase() || "";
      const awayName = se.away_team?.name?.toLowerCase() || "";
      
      if (homeName && awayName) {
        const key = `${homeName}_vs_${awayName}`;
        oddsMap[key] = gameOdds;
      }
    });

    console.log(`[Sportradar Service] Mapped odds for ${Object.keys(oddsMap).length} games`);
    return oddsMap;
  }

  async getEventMarkets(eventId: string): Promise<any> {
    const cacheKey = `odds-markets-${eventId}`;
    try {
      const markets = await this.apiGet('/api/sportradar/odds', { eventId, type: 'markets' }, cacheKey);
      console.log(`[Sportradar] SUCCESS: Received odds markets for ${eventId}`);
      return markets;
    } catch (error) {
      return null;
    }
  }

  async getEventOdds(eventId: string): Promise<any> {
    const cacheKey = `odds-event-${eventId}`;
    try {
      const odds = await this.apiGet('/api/sportradar/odds', { eventId, type: 'odds' }, cacheKey);
      console.log(`[Sportradar] SUCCESS: Received odds for event ${eventId}`);
      return odds;
    } catch (error) {
      return null;
    }
  }

  async getBooks(): Promise<any> {
    const cacheKey = `odds-books`;
    try {
      const books = await this.apiGet('/api/sportradar/odds', { type: 'books' }, cacheKey, 3600000); // 1 hour
      return books;
    } catch (error) {
      return null;
    }
  }

  async testConnection(): Promise<any> {
    try {
      const token = await getIdToken();
      const response = await axios.get('/api/sportradar/test-connection', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      return response.data;
    } catch (error: any) {
      console.error('[Sportradar] Test connection failed:', error.response?.data || error.message);
      throw error.response?.data || error;
    }
  }

  async findGame(homeTeam: string, awayTeam: string, date: Date, league: string = 'nba'): Promise<any | null> {
    const games = await this.getDailySchedule(date, league);
    const home = homeTeam.toLowerCase();
    const away = awayTeam.toLowerCase();

    const game = games.find(g => {
      const gHome = g.homeTeam.toLowerCase();
      const gAway = g.awayTeam.toLowerCase();
      return (gHome.includes(home) || home.includes(gHome)) && 
             (gAway.includes(away) || away.includes(gAway));
    });

    return game || null;
  }

  async findGameId(homeTeam: string, awayTeam: string, date: Date, league: string = 'nba'): Promise<string | null> {
    const game = await this.findGame(homeTeam, awayTeam, date, league);
    return game ? game.id : null;
  }

  clearCache() {
    this.cache.clear();
    this.pendingRequests.clear();
    console.log('[Sportradar] Cache cleared');
  }
}

export const sportradarService = new SportradarService();
