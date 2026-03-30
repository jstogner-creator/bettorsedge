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

  async getInjuries(league: string = 'nba'): Promise<SportradarTeamInjuries[]> {
    const cacheKey = `injuries-${league.toLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION)) {
      console.log(`[Sportradar] Cache HIT: ${league} injuries`);
      return cached.data;
    }

    console.log(`[Sportradar] Cache MISS: fetching ${league} injuries...`);
    await this.pace();
    try {
      const token = await getIdToken();
      const response = await axios.get(`/api/sportradar/injuries?league=${league.toLowerCase()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 15000
      });
      
      const teams = response.data.teams || [];
      console.log(`[Sportradar] SUCCESS: Received ${league} injuries for ${teams.length} teams`);
      this.cache.set(cacheKey, { data: teams, timestamp: Date.now() });
      return teams;
    } catch (error) {
      console.error(`[Sportradar] ERROR fetching ${league} injuries:`, error);
      return [];
    }
  }

  async getGameSummary(gameId: string, league: string = 'nba'): Promise<SportradarGameSummary | null> {
    const cacheKey = `summary-${league.toLowerCase()}-${gameId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION)) {
      console.log(`[Sportradar] Cache HIT: ${league} summary for ${gameId}`);
      return cached.data;
    }

    console.log(`[Sportradar] Cache MISS: fetching ${league} summary for ${gameId}...`);
    await this.pace();
    try {
      const token = await getIdToken();
      const response = await axios.get(`/api/sportradar/summary?gameId=${gameId}&league=${league.toLowerCase()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 15000
      });
      
      const summary = response.data;
      const hasLineups = !!(summary.home?.players && summary.away?.players);
      console.log(`[Sportradar] SUCCESS: Received ${league} summary for ${gameId}. Lineups: ${hasLineups}`);
      
      this.cache.set(cacheKey, { data: summary, timestamp: Date.now() });
      return summary;
    } catch (error) {
      console.error(`[Sportradar] ERROR fetching ${league} summary for ${gameId}:`, error);
      return null;
    }
  }

  async getDailyChangelog(league: string, date: Date): Promise<any> {
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
    const dateStr = `${year}-${month}-${day}`;
    const cacheKey = `daily-changelog-${league.toLowerCase()}-${dateStr}`;

    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION)) {
      console.log(`[Sportradar] Cache HIT: ${league} daily changelog for ${dateStr}`);
      return cached.data;
    }

    console.log(`[Sportradar] Cache MISS: fetching ${league} daily changelog for ${dateStr}...`);
    await this.pace();
    try {
      const token = await getIdToken();
      const response = await axios.get(`/api/sportradar/daily-changelog?year=${year}&month=${month}&day=${day}&league=${league.toLowerCase()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      
      const data = response.data;
      console.log(`[Sportradar] SUCCESS: Received ${league} daily changelog for ${dateStr}`);
      
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.error(`[Sportradar] ERROR fetching ${league} daily changelog for ${dateStr}:`, error);
      return null;
    }
  }

  async getDailyInjuries(league: string, date: Date): Promise<any> {
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
    const dateStr = `${year}-${month}-${day}`;
    const cacheKey = `daily-injuries-${league.toLowerCase()}-${dateStr}`;

    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION)) {
      console.log(`[Sportradar] Cache HIT: ${league} daily injuries for ${dateStr}`);
      return cached.data;
    }

    console.log(`[Sportradar] Cache MISS: fetching ${league} daily injuries for ${dateStr}...`);
    await this.pace();
    try {
      const token = await getIdToken();
      const response = await axios.get(`/api/sportradar/daily-injuries?year=${year}&month=${month}&day=${day}&league=${league.toLowerCase()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      
      const data = response.data;
      console.log(`[Sportradar] SUCCESS: Received ${league} daily injuries for ${dateStr}`);
      
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    } catch (error) {
      console.error(`[Sportradar] ERROR fetching ${league} daily injuries for ${dateStr}:`, error);
      return null;
    }
  }

  async getDailySummary(league: string, date: Date): Promise<any> {
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
    const dateStr = `${year}/${month}/${day}`;
    
    const cacheKey = `daily-summary-${league.toLowerCase()}-${dateStr}`;
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION)) {
      console.log(`[Sportradar] Cache HIT: ${league} daily summary for ${dateStr}`);
      return cached.data;
    }

    console.log(`[Sportradar] Cache MISS: fetching ${league} daily summary for ${dateStr}...`);
    await this.pace();
    try {
      const token = await getIdToken();
      const response = await axios.get(`/api/sportradar/daily-summary?league=${league.toLowerCase()}&year=${year}&month=${month}&day=${day}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      
      const summary = response.data;
      console.log(`[Sportradar] SUCCESS: Received ${league} daily summary for ${dateStr}`);
      this.cache.set(cacheKey, { data: summary, timestamp: Date.now() });
      return summary;
    } catch (error) {
      console.error(`[Sportradar] ERROR fetching ${league} daily summary for ${dateStr}:`, error);
      return null;
    }
  }

  async getHeadToHead(teamId1: string, teamId2: string, league: string = 'mlb'): Promise<any> {
    const cacheKey = `h2h-${league.toLowerCase()}-${teamId1}-${teamId2}`;
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION)) {
      console.log(`[Sportradar] Cache HIT: ${league} head-to-head for ${teamId1} vs ${teamId2}`);
      return cached.data;
    }

    console.log(`[Sportradar] Cache MISS: fetching ${league} head-to-head for ${teamId1} vs ${teamId2}...`);
    await this.pace();
    try {
      const token = await getIdToken();
      const response = await axios.get(`/api/sportradar/head-to-head?teamId1=${teamId1}&teamId2=${teamId2}&league=${league.toLowerCase()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      
      const h2h = response.data;
      console.log(`[Sportradar] SUCCESS: Received ${league} head-to-head for ${teamId1} vs ${teamId2}`);
      
      this.cache.set(cacheKey, { data: h2h, timestamp: Date.now() });
      return h2h;
    } catch (error) {
      console.error(`[Sportradar] ERROR fetching ${league} head-to-head for ${teamId1} vs ${teamId2}:`, error);
      return null;
    }
  }

  async getDailySchedule(date: Date, league: string = 'nba'): Promise<any[]> {
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
    const dateStr = `${year}-${month}-${day}`;
    const cacheKey = `schedule-${league.toLowerCase()}-${dateStr}`;
    
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION)) {
      console.log(`[Sportradar] Cache HIT: ${league} schedule for ${dateStr}`);
      return cached.data;
    }

    console.log(`[Sportradar] Cache MISS: fetching ${league} schedule for ${dateStr}...`);
    await this.pace();
    
    const fetchWithRetry = async (retries = 2, delay = 2000): Promise<any[]> => {
      try {
        const token = await getIdToken();
        const response = await axios.get(`/api/sportradar/schedule?year=${year}&month=${month}&day=${day}&league=${league.toLowerCase()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        
        const rawGames = response.data.games || [];
        const games: any[] = rawGames.map((g: any) => {
          // Filter by date in ET to ensure it matches the requested slate
          const gameDate = new Date(g.scheduled);
          const gameEtParts = etFormatter.formatToParts(gameDate);
          const gYear = gameEtParts.find(p => p.type === 'year')?.value;
          const gMonth = gameEtParts.find(p => p.type === 'month')?.value;
          const gDay = gameEtParts.find(p => p.type === 'day')?.value;
          const gDateStr = `${gYear}-${gMonth}-${gDay}`;

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
        this.cache.set(cacheKey, { data: games, timestamp: Date.now() });
        return games;
      } catch (error: any) {
        if (error.response?.status === 429 && retries > 0) {
          console.warn(`[Sportradar] Rate limited (429). Retrying in ${delay}ms... (${retries} left)`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchWithRetry(retries - 1, delay * 2);
        }
        throw error;
      }
    };

    try {
      return await fetchWithRetry();
    } catch (error) {
      console.error(`[Sportradar] ERROR fetching ${league} schedule for ${dateStr}:`, error);
      return [];
    }
  }

  async getOdds(sportId: string = 'sr:sport:2', date?: string): Promise<any> {
    const cacheKey = `odds-schedule-${sportId}-${date || ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION)) {
      console.log(`[Sportradar] Cache HIT: odds schedule for ${sportId} ${date || ''}`);
      return cached.data;
    }

    console.log(`[Sportradar] Cache MISS: fetching odds schedule for ${sportId} ${date || ''}...`);
    await this.pace();
    try {
      const token = await getIdToken();
      let url = `/api/sportradar/odds?sportId=${sportId}&type=schedule`;
      if (date) url += `&date=${date}`;

      const response = await axios.get(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      
      const odds = response.data;
      console.log(`[Sportradar] SUCCESS: Received odds schedule for ${sportId}`);
      this.cache.set(cacheKey, { data: odds, timestamp: Date.now() });
      return odds;
    } catch (error) {
      console.error(`[Sportradar] ERROR fetching odds schedule for ${sportId}:`, error);
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
      
      if (markets.length > 0) {
        const marketNames = markets.map((m: any) => m.name).join(', ');
        // console.log(`[Sportradar Service] Markets for ${se.home_team?.name} vs ${se.away_team?.name}: ${marketNames}`);
      }
      
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
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION)) {
      console.log(`[Sportradar] Cache HIT: odds markets for ${eventId}`);
      return cached.data;
    }

    console.log(`[Sportradar] Cache MISS: fetching odds markets for ${eventId}...`);
    await this.pace();
    try {
      const token = await getIdToken();
      const url = `/api/sportradar/odds?eventId=${eventId}&type=markets`;

      const response = await axios.get(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 15000
      });
      
      const markets = response.data;
      console.log(`[Sportradar] SUCCESS: Received odds markets for ${eventId}`);
      this.cache.set(cacheKey, { data: markets, timestamp: Date.now() });
      return markets;
    } catch (error) {
      console.error(`[Sportradar] ERROR fetching odds markets for ${eventId}:`, error);
      return null;
    }
  }

  async getEventOdds(eventId: string): Promise<any> {
    const cacheKey = `odds-event-${eventId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_DURATION)) {
      console.log(`[Sportradar] Cache HIT: odds for event ${eventId}`);
      return cached.data;
    }

    console.log(`[Sportradar] Cache MISS: fetching odds for event ${eventId}...`);
    await this.pace();
    try {
      const token = await getIdToken();
      const url = `/api/sportradar/odds?eventId=${eventId}&type=odds`;

      const response = await axios.get(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      
      const odds = response.data;
      console.log(`[Sportradar] SUCCESS: Received odds for event ${eventId}`);
      this.cache.set(cacheKey, { data: odds, timestamp: Date.now() });
      return odds;
    } catch (error) {
      console.error(`[Sportradar] ERROR fetching odds for event ${eventId}:`, error);
      return null;
    }
  }

  async getBooks(): Promise<any> {
    const cacheKey = `odds-books`;
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < 3600000)) { // 1 hour cache for books
      return cached.data;
    }

    await this.pace();
    try {
      const token = await getIdToken();
      const url = `/api/sportradar/odds?type=books`;

      const response = await axios.get(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 15000
      });
      
      const books = response.data;
      this.cache.set(cacheKey, { data: books, timestamp: Date.now() });
      return books;
    } catch (error) {
      console.error(`[Sportradar] ERROR fetching books:`, error);
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
    console.log('[Sportradar] Cache cleared');
  }
}

export const sportradarService = new SportradarService();
