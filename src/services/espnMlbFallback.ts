/**
 * espnMlbFallback.ts
 *
 * ESPN MLB data fallback service.
 * Scrapes ESPN public MLB pages through the existing server proxy when
 * API-Sports returns incomplete or low-quality data.
 *
 * Data sources:
 *   Team stats (pitching) : https://www.espn.com/mlb/stats/team/_/view/pitching
 *   Team roster/info      : https://www.espn.com/mlb/teams
 *   Betting odds          : https://www.espn.com/mlb/odds
 *
 * All requests are made through /api/espn/mlb/* server proxy routes to avoid
 * CORS issues in the browser.
 */

import axios from "axios";
import { getIdToken } from "../firebase";
import { type TeamStatsMLB } from "./apiSportsMlb";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EspnTeamPitchingStats {
  teamName: string;
  teamAbbr: string;
  teamId: string;
  era: number;
  whip: number;
  strikeouts: number;
  walks: number;
  inningsPitched: number;
  wins: number;
  losses: number;
  saves: number;
  logo?: string;
}

export interface EspnTeamInfo {
  teamName: string;
  teamAbbr: string;
  teamId: string;
  location: string;
  displayName: string;
  logo?: string;
  color?: string;
  slug?: string;
}

export interface EspnMlbOddsLine {
  homeTeam: string;
  awayTeam: string;
  homeMoneyline?: string;
  awayMoneyline?: string;
  spread?: string;
  overUnder?: string;
  bookmaker?: string;
  gameId?: string;
}

export interface EspnMlbFallbackResult {
  homePitchingStats: EspnTeamPitchingStats | null;
  awayPitchingStats: EspnTeamPitchingStats | null;
  homeTeamInfo: EspnTeamInfo | null;
  awayTeamInfo: EspnTeamInfo | null;
  oddsLine: EspnMlbOddsLine | null;
  normalizedHome: TeamStatsMLB | null;
  normalizedAway: TeamStatsMLB | null;
  sources: string[];
  dataQualityScore: number;
}

// ── Cache ──────────────────────────────────────────────────────────────────────
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function fromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expires) { cache.delete(key); return null; }
  return entry.data as T;
}
function toCache(key: string, data: any) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

// ── Helper ─────────────────────────────────────────────────────────────────────
async function authHeaders(): Promise<Record<string, string>> {
  try {
    const token = await getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function proxyGet<T = any>(
  path: string,
  params: Record<string, string> = {}
): Promise<T | null> {
  const key = `espn-fb-${path}-${JSON.stringify(params)}`;
  const cached = fromCache<T>(key);
  if (cached) return cached;

  try {
    const headers = await authHeaders();
    const resp = await axios.get(path, { params, headers, timeout: 15000 });
    if (resp.data) {
      toCache(key, resp.data);
      return resp.data as T;
    }
    return null;
  } catch (err: any) {
    console.warn(`[ESPN MLB Fallback] Request failed for ${path}:`, err.message);
    return null;
  }
}

// ── Normalizer: ESPN pitching stats → TeamStatsMLB ────────────────────────────
function espnPitchingToTeamStats(
  pitching: EspnTeamPitchingStats | null,
  homeAway: "home" | "away"
): TeamStatsMLB | null {
  if (!pitching) return null;

  // Estimate offensive stats from pitching (very rough heuristics only used when
  // API-Sports has no batting data at all)
  const runsPerGame = pitching.era > 0 ? pitching.era * 9 / 9 : 4.2;
  const runsAllowed = pitching.era > 0 ? pitching.era * 9 / 9 : 4.2;

  const isp = pitching.inningsPitched || 1;
  const k9 = (pitching.strikeouts / isp) * 9;
  const bb9 = (pitching.walks / isp) * 9;

  // Very conservative batting estimate from league norms
  const battingAverage = 0.248;
  const obp = 0.315;
  const slg = 0.405;
  const ops = obp + slg;

  return {
    runsPerGame,
    runsAllowed,
    battingAverage,
    obp,
    slg,
    ops,
    teamEra: pitching.era,
    bullpenEra: pitching.era + 0.3, // typical bullpen premium
    homeSplits: {
      runs: homeAway === "home" ? runsPerGame + 0.1 : runsPerGame - 0.1,
      runsAllowed: homeAway === "home" ? runsAllowed - 0.1 : runsAllowed + 0.1,
      record: `${pitching.wins}-${pitching.losses}`,
    },
    awaySplits: {
      runs: homeAway === "away" ? runsPerGame + 0.05 : runsPerGame - 0.05,
      runsAllowed: homeAway === "away" ? runsAllowed + 0.1 : runsAllowed - 0.05,
      record: `${pitching.wins}-${pitching.losses}`,
    },
  };
}

// ── Team name fuzzy matching ───────────────────────────────────────────────────
function fuzzyMatchTeam(
  teamName: string,
  candidates: EspnTeamPitchingStats[]
): EspnTeamPitchingStats | null {
  if (!teamName || !candidates.length) return null;
  const needle = teamName.toLowerCase();
  return (
    candidates.find(c => c.teamName.toLowerCase() === needle) ||
    candidates.find(c =>
      needle.includes(c.teamAbbr.toLowerCase()) ||
      c.teamName.toLowerCase().includes(needle) ||
      needle.includes(c.teamName.toLowerCase().split(" ").pop() || "")
    ) ||
    null
  );
}

function fuzzyMatchTeamInfo(
  teamName: string,
  candidates: EspnTeamInfo[]
): EspnTeamInfo | null {
  if (!teamName || !candidates.length) return null;
  const needle = teamName.toLowerCase();
  return (
    candidates.find(c => c.displayName.toLowerCase() === needle) ||
    candidates.find(c =>
      needle.includes(c.teamAbbr.toLowerCase()) ||
      c.displayName.toLowerCase().includes(needle) ||
      needle.includes(c.teamName.toLowerCase().split(" ").pop() || "")
    ) ||
    null
  );
}

// ── Main service class ─────────────────────────────────────────────────────────
class EspnMlbFallbackService {
  /** Fetch all MLB team pitching stats from ESPN */
  async getAllTeamPitchingStats(): Promise<EspnTeamPitchingStats[]> {
    const data = await proxyGet<any>("/api/espn/mlb/team-stats");
    if (!data?.categories) return [];
    try {
      return this.parseTeamPitchingStats(data);
    } catch (err) {
      console.warn("[ESPN MLB Fallback] Failed to parse pitching stats:", err);
      return [];
    }
  }

  /** Fetch all MLB teams (info + logos) from ESPN */
  async getAllTeamInfo(): Promise<EspnTeamInfo[]> {
    const data = await proxyGet<any>("/api/espn/mlb/teams");
    if (!data) return [];
    try {
      return this.parseTeamInfo(data);
    } catch (err) {
      console.warn("[ESPN MLB Fallback] Failed to parse team info:", err);
      return [];
    }
  }

  /** Fetch current MLB odds from ESPN */
  async getMlbOdds(): Promise<EspnMlbOddsLine[]> {
    const data = await proxyGet<any>("/api/espn/mlb/odds");
    if (!data) return [];
    try {
      return this.parseOddsData(data);
    } catch (err) {
      console.warn("[ESPN MLB Fallback] Failed to parse odds:", err);
      return [];
    }
  }

  /**
   * Main entry point: fetch all ESPN data and resolve for the given matchup.
   * Returns partial data (whatever ESPN has) without throwing.
   */
  async getFallbackData(
    homeTeam: string,
    awayTeam: string
  ): Promise<EspnMlbFallbackResult> {
    console.log(`[ESPN MLB Fallback] Fetching data for ${awayTeam} @ ${homeTeam}`);

    const result: EspnMlbFallbackResult = {
      homePitchingStats: null,
      awayPitchingStats: null,
      homeTeamInfo: null,
      awayTeamInfo: null,
      oddsLine: null,
      normalizedHome: null,
      normalizedAway: null,
      sources: [],
      dataQualityScore: 0,
    };

    try {
      const [pitchingStats, teamInfoList, oddsLines] = await Promise.allSettled([
        this.getAllTeamPitchingStats(),
        this.getAllTeamInfo(),
        this.getMlbOdds(),
      ]);

      // Pitching stats
      if (pitchingStats.status === "fulfilled" && pitchingStats.value.length > 0) {
        const stats = pitchingStats.value;
        result.homePitchingStats = fuzzyMatchTeam(homeTeam, stats);
        result.awayPitchingStats = fuzzyMatchTeam(awayTeam, stats);
        if (result.homePitchingStats || result.awayPitchingStats) {
          result.sources.push("espn.com/mlb/stats/team pitching");
          result.dataQualityScore += result.homePitchingStats && result.awayPitchingStats ? 2 : 1;
        }
      }

      // Team info (logos, location)
      if (teamInfoList.status === "fulfilled" && teamInfoList.value.length > 0) {
        const teams = teamInfoList.value;
        result.homeTeamInfo = fuzzyMatchTeamInfo(homeTeam, teams);
        result.awayTeamInfo = fuzzyMatchTeamInfo(awayTeam, teams);
        if (result.homeTeamInfo || result.awayTeamInfo) {
          result.sources.push("espn.com/mlb/teams");
          result.dataQualityScore += 1;
        }
      }

      // Odds
      if (oddsLines.status === "fulfilled" && oddsLines.value.length > 0) {
        const odds = oddsLines.value;
        const matchedOdds = odds.find(o =>
          (o.homeTeam?.toLowerCase().includes(homeTeam.toLowerCase().split(" ").pop() || "") ||
            homeTeam.toLowerCase().includes(o.homeTeam?.toLowerCase().split(" ").pop() || "")) &&
          (o.awayTeam?.toLowerCase().includes(awayTeam.toLowerCase().split(" ").pop() || "") ||
            awayTeam.toLowerCase().includes(o.awayTeam?.toLowerCase().split(" ").pop() || ""))
        );
        if (matchedOdds) {
          result.oddsLine = matchedOdds;
          result.sources.push("espn.com/mlb/odds");
          result.dataQualityScore += 1;
        }
      }

      // Normalize pitching stats into TeamStatsMLB shape
      result.normalizedHome = espnPitchingToTeamStats(result.homePitchingStats, "home");
      result.normalizedAway = espnPitchingToTeamStats(result.awayPitchingStats, "away");

      console.log(
        `[ESPN MLB Fallback] Done. Quality score: ${result.dataQualityScore}. Sources: ${result.sources.join(", ") || "none"}`
      );
    } catch (err) {
      console.warn("[ESPN MLB Fallback] Partial failure fetching ESPN data:", err);
    }

    return result;
  }

  // ── Parsers ────────────────────────────────────────────────────────────────

  private parseTeamPitchingStats(data: any): EspnTeamPitchingStats[] {
    // ESPN team stats API returns categories array
    // Shape: { categories: [{ name, displayName, abbreviation, teams: [ { team: {...}, stats: [...] } ] }] }
    const rows: EspnTeamPitchingStats[] = [];

    const teams: any[] = data?.teams || data?.statistics?.teams || [];
    const columnHeaders: string[] = data?.columnHeaders || data?.categories?.map((c: any) => c.abbreviation) || [];

    teams.forEach((entry: any) => {
      const team = entry.team || entry;
      const stats: any[] = entry.stats || entry.statistics || [];

      const get = (abbr: string, fallback = 0): number => {
        const idx = columnHeaders.findIndex((h: string) => h?.toLowerCase() === abbr.toLowerCase());
        if (idx >= 0 && stats[idx] != null) return parseFloat(stats[idx]) || fallback;
        // Fallback: look for named property
        const named = stats.find?.((s: any) => s?.abbreviation?.toLowerCase() === abbr.toLowerCase());
        return parseFloat(named?.displayValue || named?.value || fallback) || fallback;
      };

      rows.push({
        teamName: team.displayName || team.name || "",
        teamAbbr: team.abbreviation || "",
        teamId: String(team.id || ""),
        logo: team.logos?.[0]?.href || team.logo || undefined,
        era: get("ERA") || get("era"),
        whip: get("WHIP") || get("whip"),
        strikeouts: get("SO") || get("K") || get("strikeouts"),
        walks: get("BB") || get("walks"),
        inningsPitched: get("IP") || get("inningsPitched"),
        wins: get("W") || get("wins"),
        losses: get("L") || get("losses"),
        saves: get("SV") || get("saves"),
      });
    });

    return rows.filter(r => r.teamName);
  }

  private parseTeamInfo(data: any): EspnTeamInfo[] {
    // ESPN teams API: { sports: [{ leagues: [{ teams: [{ team: {...} }] }] }] }
    const teams: any[] = [];
    (data?.sports || []).forEach((sport: any) => {
      (sport?.leagues || []).forEach((league: any) => {
        (league?.teams || []).forEach((entry: any) => {
          const t = entry.team || entry;
          teams.push({
            teamName: t.name || "",
            teamAbbr: t.abbreviation || "",
            teamId: String(t.id || ""),
            location: t.location || t.city || "",
            displayName: t.displayName || t.name || "",
            logo: t.logos?.[0]?.href || t.logo || undefined,
            color: t.color ? `#${t.color}` : undefined,
            slug: t.slug || undefined,
          });
        });
      });
    });
    return teams.filter(t => t.teamName);
  }

  private parseOddsData(data: any): EspnMlbOddsLine[] {
    // ESPN odds API returns events array with competitions
    const lines: EspnMlbOddsLine[] = [];
    const events: any[] = data?.events || [];
    events.forEach((ev: any) => {
      const comp = ev?.competitions?.[0];
      if (!comp) return;
      const competitors: any[] = comp?.competitors || [];
      const home = competitors.find((c: any) => c.homeAway === "home");
      const away = competitors.find((c: any) => c.homeAway === "away");
      if (!home || !away) return;

      const oddsInfo = comp?.odds?.[0];
      lines.push({
        homeTeam: home.team?.displayName || home.team?.name || "",
        awayTeam: away.team?.displayName || away.team?.name || "",
        homeMoneyline: oddsInfo?.homeTeamOdds?.moneyLine?.toString() || oddsInfo?.home || undefined,
        awayMoneyline: oddsInfo?.awayTeamOdds?.moneyLine?.toString() || oddsInfo?.away || undefined,
        spread: oddsInfo?.spread?.toString() || oddsInfo?.line?.toString() || undefined,
        overUnder: oddsInfo?.overUnder?.toString() || undefined,
        bookmaker: oddsInfo?.provider?.name || undefined,
        gameId: String(ev.id || ""),
      });
    });
    return lines;
  }
}

export const espnMlbFallback = new EspnMlbFallbackService();
