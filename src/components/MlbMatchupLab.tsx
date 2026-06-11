import React, { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle,
  Calendar,
  MapPin,
  Clock,
  Sparkles,
  Zap,
  Shield,
  ShieldCheck,
  RefreshCw,
  Thermometer,
  Wind,
  TrendingUp,
  CircleDot,
  DollarSign,
} from "lucide-react";
import { Game, Prediction } from "../types";
import { cn } from "../lib/utils";
import {
  parsePitcher,
  parseTeamStats,
  generateMockMlbContext,
  type TeamStatsMLB,
} from "../services/apiSportsMlb";
import { format, parseISO } from "date-fns";

type TabId = "overview" | "teamstats" | "pitching" | "batting" | "trends" | "odds" | "aiedge";

interface MlbMatchupLabProps {
  game: Game;
  prediction?: Prediction | null;
  onReanalyze?: (game: Game) => void;
  isAnalyzing?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Format a number or null to a fixed-decimal string, or "—" if unavailable */
function na(v: any, decimals = 2): string {
  if (v == null || v === "" || v === "N/A") return "—";
  const n = parseFloat(String(v));
  if (isNaN(n)) return String(v); // return as-is for string stats
  return n.toFixed(decimals);
}

/** Format a ratio (0–1) as percent string */
function pct(v: any): string {
  if (v == null) return "—";
  const n = parseFloat(String(v));
  if (isNaN(n)) return "—";
  const val = n > 1 ? n : n * 100;
  return `${val.toFixed(1)}%`;
}

/** Convert decimal odds (1.85) to American (+120 / -150) */
function decToAmerican(dec: number | null | undefined): string {
  if (!dec || dec <= 1) return "—";
  if (dec >= 2) return `+${Math.round((dec - 1) * 100)}`;
  return `${Math.round(-100 / (dec - 1))}`;
}

/** American odds input already stored as American? Return formatted. */
function fmtOdds(v: any): string {
  if (v == null) return "—";
  const n = parseFloat(String(v));
  if (isNaN(n)) return "—";
  return n > 0 ? `+${n}` : `${n}`;
}

/** Implied probability from American odds */
function impliedFromAmerican(odds: number | null | undefined): number | null {
  if (!odds) return null;
  return odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);
}

/** Implied probability from decimal odds */
function impliedFromDecimal(dec: number | null | undefined): number | null {
  if (!dec || dec <= 0) return null;
  return 1 / dec;
}

function fmtDate(dateStr: string): string {
  try { return format(parseISO(dateStr), "M/d/yyyy"); } catch { return dateStr; }
}

// ── Team Logo component ────────────────────────────────────────────────────────
function TeamLogo({
  logoUrl,
  teamName,
  size = 56,
  colorClass = "bg-slate-800 border-slate-700",
}: {
  logoUrl?: string;
  teamName: string;
  size?: number;
  colorClass?: string;
}) {
  const abbr = teamName?.substring(0, 3).toUpperCase() || "???";
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={teamName}
        width={size}
        height={size}
        className="object-contain drop-shadow-lg"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
          const next = e.currentTarget.nextSibling as HTMLElement;
          if (next) next.style.display = "flex";
        }}
      />
    );
  }
  return (
    <div
      className={cn("rounded-xl border flex items-center justify-center font-black text-sm", colorClass)}
      style={{ width: size, height: size }}
    >
      {abbr}
    </div>
  );
}

// ── StatBar ────────────────────────────────────────────────────────────────────
function StatBar({
  label,
  away,
  home,
  lowerIsBetter = false,
  isString = false,
  decimals = 2,
}: {
  label: string;
  away: any;
  home: any;
  lowerIsBetter?: boolean;
  isString?: boolean;
  decimals?: number;
}) {
  const awayNum = parseFloat(String(away));
  const homeNum = parseFloat(String(home));
  const hasNums = !isString && !isNaN(awayNum) && !isNaN(homeNum) && (awayNum !== 0 || homeNum !== 0);

  let awayBarPct = 50;
  let homeBarPct = 50;
  let adv: "away" | "home" | "even" = "even";

  if (hasNums && awayNum !== homeNum) {
    if (lowerIsBetter) {
      const ai = awayNum > 0 ? 1 / awayNum : 1;
      const hi = homeNum > 0 ? 1 / homeNum : 1;
      const tot = ai + hi;
      awayBarPct = (ai / tot) * 100;
      homeBarPct = (hi / tot) * 100;
      adv = awayNum < homeNum ? "away" : "home";
    } else {
      const tot = awayNum + homeNum;
      awayBarPct = tot > 0 ? (awayNum / tot) * 100 : 50;
      homeBarPct = tot > 0 ? (homeNum / tot) * 100 : 50;
      adv = awayNum > homeNum ? "away" : "home";
    }
  }

  const awayDisplay = isString ? (away ?? "—") : (hasNums ? na(awayNum, decimals) : na(away));
  const homeDisplay = isString ? (home ?? "—") : (hasNums ? na(homeNum, decimals) : na(home));

  return (
    <div className="py-2 border-b border-slate-800/40 last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <span className={cn("text-xs font-bold font-mono min-w-[52px] text-right tabular-nums", adv === "away" ? "text-teal-300" : "text-slate-300")}>
          {awayDisplay}
        </span>
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex-1 text-center px-1 leading-tight">{label}</span>
        <span className={cn("text-xs font-bold font-mono min-w-[52px] text-left tabular-nums", adv === "home" ? "text-yellow-300" : "text-slate-300")}>
          {homeDisplay}
        </span>
      </div>
      {hasNums && (
        <div className="flex items-center gap-1 h-1.5">
          <div className="flex-1 flex justify-end">
            <div className="h-full rounded-full bg-teal-500/70 transition-all duration-500" style={{ width: `${awayBarPct}%` }} />
          </div>
          <div className="w-px h-2 bg-slate-700 shrink-0" />
          <div className="flex-1">
            <div className="h-full rounded-full bg-yellow-500/70 transition-all duration-500" style={{ width: `${homeBarPct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── PitcherCard ────────────────────────────────────────────────────────────────
function PitcherCard({ pitcher, side, teamName, confirmed, favored }: {
  pitcher: any; side: "away" | "home"; teamName: string; confirmed: boolean; favored: boolean;
}) {
  const isAway = side === "away";
  return (
    <div className={cn("rounded-xl p-3 border", isAway ? "border-teal-500/20 bg-teal-500/[0.04]" : "border-yellow-500/20 bg-yellow-500/[0.04]")}>
      <div className="flex items-start justify-between mb-2.5">
        <div>
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className={cn("text-[8px] font-black uppercase tracking-widest", isAway ? "text-teal-400" : "text-yellow-400")}>{isAway ? "Away" : "Home"} SP</span>
            {!confirmed && <span className="text-amber-400 text-[8px] font-extrabold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Projected</span>}
            {favored && <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-[8px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" /> Edge</span>}
          </div>
          <div className="text-sm font-black text-white">{pitcher?.name || "TBD"}</div>
          <div className="text-[9px] text-slate-400 font-mono">{teamName}</div>
        </div>
        {pitcher?.handedness && pitcher.handedness !== "Unknown" && (
          <span className={cn("px-2 py-1 rounded text-[9px] font-black border", isAway ? "bg-teal-500/10 text-teal-300 border-teal-500/20" : "bg-yellow-500/10 text-yellow-300 border-yellow-500/20")}>
            {pitcher.handedness}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {([["ERA", pitcher?.era, 2], ["WHIP", pitcher?.whip, 3], ["K", pitcher?.strikeouts, 0], ["BB", pitcher?.walks, 0], ["IP", pitcher?.inningsPitched, 1], ["K/9", pitcher?.k9, 1]] as [string, any, number][]).map(([lbl, val, dec]) => (
          <div key={lbl} className="bg-slate-900/60 rounded-lg p-2 flex justify-between items-center">
            <span className="text-[8px] text-slate-500 font-black uppercase tracking-wider">{lbl}</span>
            <span className="text-xs font-black text-slate-200 font-mono">{val != null && val !== "" && val !== "N/A" ? (typeof val === "number" ? (val as number).toFixed(dec) : String(val)) : "—"}</span>
          </div>
        ))}
      </div>
      {pitcher?.recentStarts && pitcher.recentStarts !== "No recent starts data available." && (
        <div className="mt-2 text-[9px] text-slate-400 bg-slate-900/30 p-2 rounded border border-slate-800/30 italic leading-relaxed">{pitcher.recentStarts}</div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function MlbMatchupLab({ game, prediction, onReanalyze, isAnalyzing }: MlbMatchupLabProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // ── Resolve mlbContext: prefer game.mlbContext, then prediction.mlbContext, then generate mock ──
  const mlbContext = useMemo(() => {
    const ctx = (game as any).mlbContext || prediction?.mlbContext;
    if (ctx) return ctx;
    // Generate mock context so data always shows
    return generateMockMlbContext({
      gameId: game.apiSportsGameId || 0,
      season: new Date(game.date || Date.now()).getFullYear(),
      homeTeamId: game.apiSportsHomeTeamId || 0,
      awayTeamId: game.apiSportsAwayTeamId || 0,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
    });
  }, [game, prediction]);

  // ── Pitchers ──
  const pitcherMatchup = prediction?.pitcherMatchup || mlbContext?.pitching;
  const homeStarter = useMemo(() => parsePitcher(pitcherMatchup?.homePitcher || pitcherMatchup?.homeStarter), [pitcherMatchup]);
  const awayStarter = useMemo(() => parsePitcher(pitcherMatchup?.awayPitcher || pitcherMatchup?.awayStarter), [pitcherMatchup]);
  const startersConfirmed = Boolean(
    homeStarter?.name && homeStarter.name !== "TBD" && !homeStarter.name.toLowerCase().includes("not returned") &&
    awayStarter?.name && awayStarter.name !== "TBD" && !awayStarter.name.toLowerCase().includes("not returned")
  );
  const favoredStarter = useMemo(() => {
    if (!homeStarter || !awayStarter) return null;
    const he = parseFloat(String(homeStarter.era)), ae = parseFloat(String(awayStarter.era));
    const hw = parseFloat(String(homeStarter.whip)), aw = parseFloat(String(awayStarter.whip));
    if (isNaN(he) || isNaN(ae)) return null;
    let hs = 0, as2 = 0;
    if (he < ae) hs++; else if (he > ae) as2++;
    if (!isNaN(hw) && !isNaN(aw)) { if (hw < aw) hs++; else if (hw > aw) as2++; }
    return hs > as2 ? "home" : as2 > hs ? "away" : null;
  }, [homeStarter, awayStarter]);

  // ── Team Stats: prefer normalizedTeamStats, fallback to parsing raw teamStatistics ──
  const homeTeamStats: TeamStatsMLB | null = useMemo(() =>
    mlbContext?.normalizedTeamStats?.home || parseTeamStats(mlbContext?.teamStatistics?.home),
    [mlbContext]);
  const awayTeamStats: TeamStatsMLB | null = useMemo(() =>
    mlbContext?.normalizedTeamStats?.away || parseTeamStats(mlbContext?.teamStatistics?.away),
    [mlbContext]);

  // ── Odds ──
  // Try American odds from marketExpectations first, then derive from mlbContext.odds
  const homeMLAmerican = prediction?.marketExpectations?.homeWinProb ?? game.marketExpectations?.homeWinProb;
  const awayMLAmerican = prediction?.marketExpectations?.awayWinProb ?? game.marketExpectations?.awayWinProb;
  const homeMLDecimal = mlbContext?.odds?.currentOdds?.home || mlbContext?.odds?.openingOdds?.home;
  const awayMLDecimal = mlbContext?.odds?.currentOdds?.away || mlbContext?.odds?.openingOdds?.away;

  // Display strings
  const homeMLDisplay = homeMLAmerican != null ? fmtOdds(homeMLAmerican) : decToAmerican(homeMLDecimal);
  const awayMLDisplay = awayMLAmerican != null ? fmtOdds(awayMLAmerican) : decToAmerican(awayMLDecimal);

  // Implied probabilities
  const homeImplied = homeMLAmerican != null ? impliedFromAmerican(homeMLAmerican) : impliedFromDecimal(homeMLDecimal);
  const awayImplied = awayMLAmerican != null ? impliedFromAmerican(awayMLAmerican) : impliedFromDecimal(awayMLDecimal);
  const marketImplied = mlbContext?.odds?.marketImpliedProbability || (
    homeImplied && awayImplied
      ? { home: homeImplied / (homeImplied + awayImplied), away: awayImplied / (homeImplied + awayImplied) }
      : null
  );

  // Run line & total from mlbContext books
  const firstBook = mlbContext?.odds?.books?.[0]?.bookmakers?.[0]?.bets;
  const runLineBet = firstBook?.find((b: any) => b.betName?.toLowerCase().includes("run line") || b.betName?.toLowerCase().includes("spread"));
  const totalBet = firstBook?.find((b: any) => b.betName?.toLowerCase().includes("total") || b.betName?.toLowerCase().includes("over"));
  const runLineAway = runLineBet?.values?.find((v: any) => v.value?.toLowerCase() === "away")?.odd || game.marketExpectations?.awayMarginOdds;
  const runLineHome = runLineBet?.values?.find((v: any) => v.value?.toLowerCase() === "home")?.odd || game.marketExpectations?.homeMarginOdds;
  const totalOver = totalBet?.values?.find((v: any) => v.value?.toLowerCase() === "over")?.odd || game.marketExpectations?.overOdds;
  const totalUnder = totalBet?.values?.find((v: any) => v.value?.toLowerCase() === "under")?.odd || game.marketExpectations?.underOdds;
  const totalLine = game.marketExpectations?.total;

  // ── AI edge ──
  const pickSide = prediction?.winner === game.homeTeam ? "home" : prediction?.winner === game.awayTeam ? "away" : null;
  const selectedSideMarketProb = pickSide === "home" ? marketImplied?.home : pickSide === "away" ? marketImplied?.away : null;
  const edge = typeof prediction?.winProbability === "number" && typeof selectedSideMarketProb === "number"
    ? prediction.winProbability - selectedSideMarketProb
    : prediction?.matchupDelta;

  // ── H2H ──
  const h2h = useMemo(() => {
    const fromPred = Array.isArray(prediction?.previousMatchups) ? prediction.previousMatchups : [];
    const fromCtx = Array.isArray(mlbContext?.h2h) ? mlbContext.h2h : [];
    return fromPred.length > 0 ? fromPred : fromCtx;
  }, [prediction, mlbContext]);

  const h2hSummary = useMemo(() => {
    if (!h2h.length) return null;
    const homeWins = h2h.filter((m: any) => {
      const hs = Number(m.homeScore), as2 = Number(m.awayScore);
      return m.homeTeam === game.homeTeam ? hs > as2 : as2 > hs;
    }).length;
    const totals = h2h.map((m: any) => Number(m.homeScore) + Number(m.awayScore)).filter(Number.isFinite);
    const avgTotal = totals.length ? totals.reduce((s: number, n: number) => s + n, 0) / totals.length : null;
    return { homeWins, awayWins: h2h.length - homeWins, avgTotal, total: h2h.length };
  }, [h2h, game.homeTeam]);

  // ── AI Factors ──
  const displayDecisionDrivers = useMemo(() => {
    const banned = ["api-sports", "game detail", "game id", "provider", "book entries", "openai", "model version", "prompt version", "qa adjusted", "audit notes"];
    return (Array.isArray(prediction?.keyFactors) ? prediction.keyFactors : [])
      .filter((f: string) => typeof f === "string" && f.trim())
      .filter((f: string) => !banned.some(b => f.toLowerCase().includes(b)))
      .map((f: string) => f.replace(/\s+/g, " ").trim());
  }, [prediction]);

  const riskNotes = useMemo(() => {
    const list: string[] = [];
    if (prediction?.devilsAdvocate) list.push(prediction.devilsAdvocate);
    if (!startersConfirmed) list.push("Pitching matchup is projected, not yet confirmed.");
    const hi = mlbContext?.injuries?.home?.length || 0, ai = mlbContext?.injuries?.away?.length || 0;
    if (hi > 0 || ai > 0) list.push(`Injury Impact: Home lists ${hi} on report; Away lists ${ai}.`);
    return list;
  }, [prediction, startersConfirmed, mlbContext]);

  // ── Stadium / Weather (from mlbContext or prediction) ──
  const stadium = mlbContext?.stadium || prediction?.stadium;
  const weather = mlbContext?.weather || prediction?.weather;
  const bullpenFatigue = mlbContext?.bullpenFatigue || prediction?.bullpenFatigue;

  // ── Helpers ──
  const confColor = (c: number) => c >= 7 ? "text-emerald-400" : c >= 4 ? "text-amber-400" : "text-rose-400";
  const confBg = (c: number) => c >= 7 ? "from-emerald-600 to-emerald-400" : c >= 4 ? "from-amber-600 to-amber-400" : "from-rose-600 to-rose-400";

  const fmtGameDate = useMemo(() => { try { return format(parseISO(game.date), "EEEE, M/d/yyyy"); } catch { return game.date; } }, [game.date]);
  const formattedDateShort = useMemo(() => fmtDate(game.date), [game.date]);

  const TABS: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "teamstats", label: "Team Stats" },
    { id: "pitching", label: "Pitching" },
    { id: "batting", label: "Batting" },
    { id: "trends", label: "Trends" },
    { id: "odds", label: "Odds" },
    { id: "aiedge", label: "AI Edge" },
  ];

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-700/50 bg-[#0f1623] shadow-2xl shadow-black/60 animate-in fade-in duration-300">

      {/* ── Top header ── */}
      <div className="bg-slate-900/70 border-b border-slate-700/40 px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-teal-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded shrink-0">MLB</span>
          <span className="text-[10px] text-slate-400 truncate">Regular Season</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono shrink-0">
          <Calendar className="w-3 h-3" />{fmtGameDate}
          {game.time && <><span className="text-slate-600 mx-0.5">·</span><Clock className="w-3 h-3" />{game.time}</>}
        </div>
      </div>

      {/* ── Matchup hero ── */}
      <div className="px-4 pt-5 pb-4 border-b border-slate-700/30 bg-gradient-to-b from-slate-900/40 to-transparent">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {/* Away */}
          <div className="flex flex-col items-center gap-1.5 w-full">
            <div className={cn(
              "w-16 h-16 flex items-center justify-center rounded-2xl transition-all duration-500 relative shrink-0",
              pickSide === "away" ? "ring-2 ring-teal-400 ring-offset-2 ring-offset-slate-900 shadow-lg shadow-teal-500/40" : pickSide === "home" ? "opacity-50" : ""
            )}>
              {pickSide === "away" && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 bg-teal-500 text-black text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full shadow whitespace-nowrap">
                  PICK
                </div>
              )}
              {game.awayLogo ? (
                <img src={game.awayLogo} alt={game.awayTeam} className="w-14 h-14 object-contain drop-shadow-lg" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center font-black text-lg text-teal-300">
                  {game.awayTeam?.substring(0, 3).toUpperCase()}
                </div>
              )}
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-teal-400">{game.awayTeam?.substring(0, 3).toUpperCase()}</span>
            <span className={cn("text-xs font-semibold text-center leading-tight break-words w-full px-1", pickSide === "away" ? "text-teal-200" : "text-slate-200")}>{game.awayTeam}</span>
            {awayTeamStats && (
              <span className="text-[9px] text-slate-500 font-mono text-center leading-tight">
                {awayTeamStats.awaySplits.record} Road &middot; {na(awayTeamStats.runsPerGame)} RPG
              </span>
            )}
          </div>

          {/* Center */}
          <div className="flex flex-col items-center gap-1 px-3">
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">PREGAME</span>
            <span className="text-2xl font-black text-slate-600">@</span>
            {game.time && <span className="text-[10px] text-slate-400 font-mono">{game.time}</span>}
            <span className="text-[9px] text-slate-600 font-mono">{formattedDateShort}</span>
            {/* Projected score pill */}
            {prediction?.scorePrediction && (
              <div className="mt-1.5 flex flex-col items-center gap-0.5">
                <div className="flex items-center gap-1 bg-slate-950/60 border border-slate-700/60 rounded-lg px-2.5 py-1">
                  <span className="text-sm font-black text-teal-300 font-mono">{prediction.scorePrediction.away}</span>
                  <span className="text-[10px] text-slate-600 font-black">–</span>
                  <span className="text-sm font-black text-yellow-300 font-mono">{prediction.scorePrediction.home}</span>
                </div>
                {prediction.projectedTotal != null && (
                  <span className="text-[9px] font-black text-amber-400 font-mono bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                    O/U {prediction.projectedTotal}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Home */}
          <div className="flex flex-col items-center gap-1.5 w-full">
            <div className={cn(
              "w-16 h-16 flex items-center justify-center rounded-2xl transition-all duration-500 relative shrink-0",
              pickSide === "home" ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-slate-900 shadow-lg shadow-yellow-500/40" : pickSide === "away" ? "opacity-50" : ""
            )}>
              {pickSide === "home" && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 bg-yellow-400 text-black text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full shadow whitespace-nowrap">
                  PICK
                </div>
              )}
              {game.homeLogo ? (
                <img src={game.homeLogo} alt={game.homeTeam} className="w-14 h-14 object-contain drop-shadow-lg" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center font-black text-lg text-yellow-300">
                  {game.homeTeam?.substring(0, 3).toUpperCase()}
                </div>
              )}
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-yellow-400">{game.homeTeam?.substring(0, 3).toUpperCase()}</span>
            <span className={cn("text-xs font-semibold text-center leading-tight break-words w-full px-1", pickSide === "home" ? "text-yellow-200" : "text-slate-200")}>{game.homeTeam}</span>
            {homeTeamStats && (
              <span className="text-[9px] text-slate-500 font-mono text-center leading-tight">
                {homeTeamStats.homeSplits.record} Home &middot; {na(homeTeamStats.runsPerGame)} RPG
              </span>
            )}
          </div>
        </div>

        {/* Venue + weather */}
        {game.location && (
          <div className="mt-3 flex items-center justify-center gap-1.5 text-[9px] text-slate-500 font-mono px-2 text-center">
            <MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{game.location}</span>
          </div>
        )}
        {weather && (
          <div className="mt-1 flex items-center justify-center gap-2 text-[9px] text-slate-400 font-mono flex-wrap">
            <Thermometer className="w-3 h-3 text-amber-400 shrink-0" />{weather.temp}°F
            <Wind className="w-3 h-3 text-sky-400 shrink-0" />{weather.windSpeed}mph {weather.windDir}
            <span className="text-slate-600">·</span><span className="truncate">{weather.condition}</span>
          </div>
        )}

        {/* ── AI pick / PASS strip ── */}
        {prediction && (
          prediction.winner === "PASS" ? (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3 overflow-hidden">
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className="text-[9px] font-black uppercase tracking-widest text-amber-400 shrink-0">No Play — Pass</span>
                    <span className="text-[8px] text-amber-600 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 shrink-0">Confidence {prediction.confidence?.toFixed(1)}/10</span>
                  </div>
                  <p className="text-[10px] text-amber-200/80 leading-relaxed line-clamp-3 break-words">
                    {prediction.devilsAdvocate || prediction.reasoning || "Insufficient edge to recommend a play on this game. Check AI Edge tab for full analysis."}
                  </p>
                </div>
              </div>
            </div>
          ) : pickSide && prediction.winner ? (
            <div className={cn(
              "mt-3 rounded-xl border p-2.5 flex items-start justify-between gap-2 overflow-hidden",
              pickSide === "away" ? "border-teal-500/30 bg-teal-500/[0.07]" : "border-yellow-500/30 bg-yellow-500/[0.07]"
            )}>
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className={cn("w-3.5 h-3.5 shrink-0", pickSide === "away" ? "text-teal-400" : "text-yellow-400")} />
                <div className="min-w-0">
                  <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">AI Pick</div>
                  <div className={cn("text-sm font-black leading-tight break-words", pickSide === "away" ? "text-teal-300" : "text-yellow-300")}>{prediction.winner}</div>
                </div>
              </div>
              <div className="flex gap-1.5 text-center flex-wrap justify-end">
                <div className="bg-slate-950/50 rounded-lg px-2 py-1.5 border border-slate-800/60 min-w-[44px]">
                  <div className="text-[8px] text-slate-500 uppercase font-black">Win%</div>
                  <div className="text-xs font-black text-slate-200 font-mono">{pct(prediction.winProbability)}</div>
                </div>
                <div className="bg-slate-950/50 rounded-lg px-2 py-1.5 border border-slate-800/60 min-w-[44px]">
                  <div className="text-[8px] text-slate-500 uppercase font-black">Conf</div>
                  <div className={cn("text-xs font-black font-mono", confColor(prediction.confidence || 0))}>{prediction.confidence?.toFixed(1)}/10</div>
                </div>
                <div className="bg-slate-950/50 rounded-lg px-2 py-1.5 border border-slate-800/60 min-w-[44px]">
                  <div className="text-[8px] text-slate-500 uppercase font-black">Edge</div>
                  <div className={cn("text-xs font-black font-mono", edge && edge > 0 ? "text-emerald-400" : "text-rose-400")}>
                    {edge != null ? `${edge > 0 ? "+" : ""}${(edge * 100).toFixed(1)}%` : "—"}
                  </div>
                </div>
                {prediction.scorePrediction && (
                  <div className="bg-slate-950/50 rounded-lg px-2 py-1.5 border border-slate-800/60 min-w-[52px]">
                    <div className="text-[8px] text-slate-500 uppercase font-black">Score</div>
                    <div className="text-xs font-black font-mono text-white">
                      <span className="text-teal-300">{prediction.scorePrediction.away}</span>
                      <span className="text-slate-600 mx-0.5">–</span>
                      <span className="text-yellow-300">{prediction.scorePrediction.home}</span>
                    </div>
                  </div>
                )}
                {prediction.projectedTotal != null && (
                  <div className="bg-amber-500/10 rounded-lg px-2 py-1.5 border border-amber-500/20 min-w-[44px]">
                    <div className="text-[8px] text-amber-500 uppercase font-black">O/U</div>
                    <div className="text-xs font-black font-mono text-amber-300">{prediction.projectedTotal}</div>
                  </div>
                )}
              </div>
            </div>
          ) : null
        )}
      </div>


      {/* ── Tabs ── */}
      <div className="border-b border-slate-700/40 bg-slate-900/30 overflow-x-auto">
        <div className="flex gap-0 min-w-max px-3 pt-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={e => { e.stopPropagation(); setActiveTab(tab.id); }}
              className={cn(
                "px-3 py-2 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap",
                activeTab === tab.id
                  ? "border-teal-400 text-teal-300 bg-teal-500/5"
                  : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
              )}
            >{tab.label}</button>
          ))}
        </div>
      </div>

      {/* ── Tab panels ── */}
      <div className="p-4 space-y-3">

        {/* ═══════════════ OVERVIEW ═══════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-3 animate-in fade-in duration-200">

            {/* Starters */}
            <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 mb-3">
                <CircleDot className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-[9px] font-black uppercase tracking-widest text-teal-300">Probable Starters</span>
                <span className={cn("ml-auto text-[8px] font-black uppercase px-1.5 py-0.5 rounded border",
                  startersConfirmed ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-300"
                )}>{startersConfirmed ? "Confirmed" : "Projected"}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[{ pitcher: awayStarter, side: "away" as const, team: game.awayTeam, favored: favoredStarter === "away" },
                  { pitcher: homeStarter, side: "home" as const, team: game.homeTeam, favored: favoredStarter === "home" }].map(({ pitcher, side, team, favored }) => (
                  <div key={side} className={cn("rounded-lg p-2.5 border overflow-hidden", side === "away" ? "border-teal-500/20 bg-teal-500/[0.03]" : "border-yellow-500/20 bg-yellow-500/[0.03]")}>
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <div className={cn("text-[8px] font-black uppercase tracking-widest mb-0.5", side === "away" ? "text-teal-500" : "text-yellow-500")}>{side === "away" ? "Away SP" : "Home SP"}</div>
                        <div className="text-xs font-black text-white truncate">{pitcher?.name || "TBD"}</div>
                        <div className={cn("text-[9px] font-mono mt-0.5", side === "away" ? "text-teal-400" : "text-yellow-400")}>
                          ERA {pitcher?.era && pitcher.era !== "N/A" ? pitcher.era : "—"} · WHIP {pitcher?.whip && pitcher.whip !== "N/A" ? pitcher.whip : "—"}
                        </div>
                      </div>
                      {pitcher?.handedness && pitcher.handedness !== "Unknown" && (
                        <span className="text-[8px] font-black bg-slate-800 border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded shrink-0">{pitcher.handedness}</span>
                      )}
                    </div>
                    {favored && <div className="mt-1.5 text-[8px] font-black text-emerald-400 flex items-center gap-1"><Sparkles className="w-2.5 h-2.5" />Pitching Edge</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Market lines */}
            <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 mb-3">
                <DollarSign className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-[9px] font-black uppercase tracking-widest text-yellow-300">Market Lines</span>
              </div>
              {/* Team header labels */}
              <div className="grid grid-cols-3 mb-1.5">
                <span className="text-[9px] font-black text-teal-400 uppercase text-center">{game.awayTeam?.substring(0, 6)}</span>
                <span className="text-[9px] font-black text-slate-600 uppercase text-center">Line</span>
                <span className="text-[9px] font-black text-yellow-400 uppercase text-center">{game.homeTeam?.substring(0, 6)}</span>
              </div>
              {[
                { label: "Moneyline", away: awayMLDisplay, home: homeMLDisplay },
                { label: "Run Line", away: runLineAway ? fmtOdds(runLineAway) : "—", home: runLineHome ? fmtOdds(runLineHome) : "—" },
                { label: `Total (${totalLine ? totalLine : "O/U"})`, away: totalOver ? `O ${totalOver}` : "—", home: totalUnder ? `U ${totalUnder}` : "—" },
                { label: "Implied Prob", away: pct(awayImplied), home: pct(homeImplied) },
              ].map(({ label, away, home }) => (
                <div key={label} className="grid grid-cols-3 gap-1 py-1.5 border-b border-slate-800/40 last:border-0 items-center">
                  <span className="text-xs font-black font-mono text-teal-300 text-center">{away}</span>
                  <span className="text-[9px] font-black uppercase text-slate-500 text-center">{label}</span>
                  <span className="text-xs font-black font-mono text-yellow-300 text-center">{home}</span>
                </div>
              ))}
            </div>

            {/* AI summary */}
            {prediction && (
              <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3 overflow-hidden">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Brain className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-indigo-300">AI Recommendation</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  {[
                    { label: "Pick", value: prediction.winner || "—", color: prediction.winner === "PASS" ? "text-amber-400" : "text-emerald-400" },
                    { label: "Confidence", value: `${prediction.confidence?.toFixed(1) || "—"}/10`, color: confColor(prediction.confidence || 0) },
                    { label: "Win Prob", value: pct(prediction.winProbability), color: "text-slate-200" },
                    { label: "AI Edge", value: edge != null ? `${edge > 0 ? "+" : ""}${(edge * 100).toFixed(1)}%` : "—", color: edge && edge > 0 ? "text-emerald-400" : "text-rose-400" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/60 text-center overflow-hidden">
                      <div className="text-[8px] font-black uppercase text-slate-500 tracking-wider mb-0.5 truncate">{label}</div>
                      <div className={cn("text-sm font-black font-mono truncate", color)}>{value}</div>
                    </div>
                  ))}
                </div>
                <div className="w-full bg-slate-800/60 rounded-full h-1.5 overflow-hidden mb-3">
                  <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-1000", confBg(prediction.confidence || 0))} style={{ width: `${(prediction.confidence || 0) * 10}%` }} />
                </div>
                {displayDecisionDrivers.slice(0, 3).map((d, i) => (
                  <div key={i} className="flex items-start gap-2 py-1.5 border-t border-slate-800/30 first:border-0">
                    <CheckCircle className="w-3 h-3 text-teal-500 shrink-0 mt-0.5" />
                    <span className="text-[10px] text-slate-300 leading-relaxed break-words min-w-0">{d}</span>
                  </div>
                ))}
              </div>
            )}

            {/* H2H quick */}
            {h2hSummary && (
              <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Activity className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">Head-to-Head</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><div className={cn("text-xl font-black", pickSide === "away" ? "text-teal-400" : "text-slate-300")}>{h2hSummary.awayWins}</div><div className="text-[8px] text-slate-500 uppercase font-bold">{game.awayTeam?.substring(0, 3)}</div></div>
                  <div><div className="text-sm font-black text-slate-500">{h2hSummary.total} Games</div><div className="text-[8px] text-slate-600">Avg {h2hSummary.avgTotal?.toFixed(1) || "—"} Runs</div></div>
                  <div><div className={cn("text-xl font-black", pickSide === "home" ? "text-yellow-400" : "text-slate-300")}>{h2hSummary.homeWins}</div><div className="text-[8px] text-slate-500 uppercase font-bold">{game.homeTeam?.substring(0, 3)}</div></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ TEAM STATS ═══════════════ */}
        {activeTab === "teamstats" && (
          <div className="animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-3 gap-2 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0"><div className="w-3 h-1.5 rounded-full bg-teal-500/70 shrink-0" /><span className="text-[9px] text-teal-400 font-bold uppercase truncate">{game.awayTeam} (Away)</span></div>
              <div className="flex items-center gap-1.5 min-w-0"><span className="text-[9px] text-yellow-400 font-bold uppercase truncate">{game.homeTeam} (Home)</span><div className="w-3 h-1.5 rounded-full bg-yellow-500/70 shrink-0" /></div>
            </div>
            <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3">
              {([
                { label: "Home/Away Record", away: awayTeamStats?.awaySplits?.record, home: homeTeamStats?.homeSplits?.record, isString: true },
                { label: "Runs / Game", away: awayTeamStats?.runsPerGame, home: homeTeamStats?.runsPerGame },
                { label: "Runs Allowed / G", away: awayTeamStats?.runsAllowed, home: homeTeamStats?.runsAllowed, lowerIsBetter: true },
                { label: "Run Diff", away: awayTeamStats ? awayTeamStats.runsPerGame - awayTeamStats.runsAllowed : null, home: homeTeamStats ? homeTeamStats.runsPerGame - homeTeamStats.runsAllowed : null },
                { label: "Batting AVG", away: awayTeamStats?.battingAverage, home: homeTeamStats?.battingAverage, decimals: 3 },
                { label: "OBP", away: awayTeamStats?.obp, home: homeTeamStats?.obp, decimals: 3 },
                { label: "Slugging %", away: awayTeamStats?.slg, home: homeTeamStats?.slg, decimals: 3 },
                { label: "OPS", away: awayTeamStats?.ops, home: homeTeamStats?.ops, decimals: 3 },
                { label: "Team ERA", away: awayTeamStats?.teamEra, home: homeTeamStats?.teamEra, lowerIsBetter: true },
                { label: "Bullpen ERA", away: awayTeamStats?.bullpenEra, home: homeTeamStats?.bullpenEra, lowerIsBetter: true },
                { label: "Home Runs / G", away: awayTeamStats ? (awayTeamStats.awaySplits.runs / 9).toFixed(2) : null, home: homeTeamStats ? (homeTeamStats.homeSplits.runs / 9).toFixed(2) : null },
                { label: "Home Runs Allowed / G", away: awayTeamStats ? (awayTeamStats.awaySplits.runsAllowed / 9).toFixed(2) : null, home: homeTeamStats ? (homeTeamStats.homeSplits.runsAllowed / 9).toFixed(2) : null, lowerIsBetter: true },
              ] as any[]).map((s, i) => (
                <StatBar key={i} label={s.label} away={s.away} home={s.home} lowerIsBetter={s.lowerIsBetter} isString={s.isString} decimals={s.decimals} />
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════ PITCHING ═══════════════ */}
        {activeTab === "pitching" && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PitcherCard pitcher={awayStarter} side="away" teamName={game.awayTeam} confirmed={startersConfirmed} favored={favoredStarter === "away"} />
              <PitcherCard pitcher={homeStarter} side="home" teamName={game.homeTeam} confirmed={startersConfirmed} favored={favoredStarter === "home"} />
            </div>
            {(homeTeamStats?.bullpenEra || awayTeamStats?.bullpenEra) && (
              <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5"><Shield className="w-3 h-3" />Bullpen Comparison</div>
                <StatBar label="Bullpen ERA" away={awayTeamStats?.bullpenEra} home={homeTeamStats?.bullpenEra} lowerIsBetter />
                <StatBar label="Team ERA" away={awayTeamStats?.teamEra} home={homeTeamStats?.teamEra} lowerIsBetter />
                {bullpenFatigue && (bullpenFatigue.home > 0.7 || bullpenFatigue.away > 0.7) && (
                  <div className="mt-2.5 flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg overflow-hidden">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-[10px] text-amber-200 break-words min-w-0">Bullpen fatigue:{bullpenFatigue.away > 0.7 ? ` ${game.awayTeam} (${(bullpenFatigue.away * 100).toFixed(0)}%)` : ""}{bullpenFatigue.home > 0.7 ? ` ${game.homeTeam} (${(bullpenFatigue.home * 100).toFixed(0)}%)` : ""}</span>
                  </div>
                )}
              </div>
            )}
            {!startersConfirmed && (
              <div className="flex items-start gap-2 p-3 bg-amber-500/[0.06] border border-amber-500/20 rounded-xl text-xs text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                Starters are projected, not confirmed. Edge analysis may shift before first pitch.
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ BATTING ═══════════════ */}
        {activeTab === "batting" && (
          <div className="animate-in fade-in duration-200">
            <div className="flex items-center justify-between mb-3 gap-2 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0"><div className="w-3 h-1.5 rounded-full bg-teal-500/70 shrink-0" /><span className="text-[9px] text-teal-400 font-bold uppercase truncate">{game.awayTeam}</span></div>
              <div className="flex items-center gap-1.5 min-w-0"><span className="text-[9px] text-yellow-400 font-bold uppercase truncate">{game.homeTeam}</span><div className="w-3 h-1.5 rounded-full bg-yellow-500/70 shrink-0" /></div>
            </div>
            <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3">
              {([
                { label: "AVG", away: awayTeamStats?.battingAverage, home: homeTeamStats?.battingAverage, decimals: 3 },
                { label: "OBP", away: awayTeamStats?.obp, home: homeTeamStats?.obp, decimals: 3 },
                { label: "SLG", away: awayTeamStats?.slg, home: homeTeamStats?.slg, decimals: 3 },
                { label: "OPS", away: awayTeamStats?.ops, home: homeTeamStats?.ops, decimals: 3 },
                { label: "Runs / Game", away: awayTeamStats?.runsPerGame, home: homeTeamStats?.runsPerGame },
                { label: "Away Runs / G (Road)", away: awayTeamStats?.awaySplits?.runs, home: null },
                { label: "Home Runs / G (Home)", away: null, home: homeTeamStats?.homeSplits?.runs },
                { label: "Proj Score (AI)", away: prediction?.scorePrediction?.away, home: prediction?.scorePrediction?.home, decimals: 0 },
              ] as any[]).map((s, i) => (
                <StatBar key={i} label={s.label} away={s.away} home={s.home} lowerIsBetter={s.lowerIsBetter} isString={s.isString} decimals={s.decimals} />
              ))}
            </div>
            {/* Pitcher handedness advantage */}
            {(awayStarter || homeStarter) && (
              <div className="mt-3 rounded-xl border border-slate-700/40 bg-slate-900/40 p-3 overflow-hidden">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Pitching Handedness Matchup</div>
                <div className="flex justify-between gap-2 text-xs">
                  <span className="text-teal-300 truncate">{game.awayTeam?.substring(0, 3)} faces <span className="font-black">{homeStarter?.handedness || "?"}</span></span>
                  <span className="text-yellow-300 truncate text-right">{game.homeTeam?.substring(0, 3)} faces <span className="font-black">{awayStarter?.handedness || "?"}</span></span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ TRENDS ═══════════════ */}
        {activeTab === "trends" && (
          <div className="space-y-3 animate-in fade-in duration-200">
            {/* H2H */}
            <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 mb-3"><TrendingUp className="w-3.5 h-3.5 text-teal-400" /><span className="text-[9px] font-black uppercase tracking-widest text-teal-300">Head-to-Head Results</span></div>
              {h2h.length > 0 ? (
                <>
                  {h2hSummary && (
                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div className="bg-slate-950/40 rounded-lg p-2 border border-teal-500/20"><div className="text-xl font-black text-teal-300">{h2hSummary.awayWins}</div><div className="text-[8px] text-slate-500 uppercase font-bold">{game.awayTeam?.substring(0, 3)}</div></div>
                      <div className="bg-slate-950/40 rounded-lg p-2 border border-slate-700/40"><div className="text-sm font-black text-slate-400">{h2hSummary.total} games</div><div className="text-[8px] text-slate-600">Avg {h2hSummary.avgTotal?.toFixed(1) || "—"} R</div></div>
                      <div className="bg-slate-950/40 rounded-lg p-2 border border-yellow-500/20"><div className="text-xl font-black text-yellow-300">{h2hSummary.homeWins}</div><div className="text-[8px] text-slate-500 uppercase font-bold">{game.homeTeam?.substring(0, 3)}</div></div>
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {h2h.slice(0, 6).map((m: any, i: number) => {
                      const hs = Number(m.homeScore), as2 = Number(m.awayScore);
                      const homeWon = hs > as2;
                      return (
                        <div key={i} className="flex items-center gap-2 py-1.5 border-b border-slate-800/30 last:border-0 overflow-hidden">
                          <span className="text-[9px] text-slate-500 font-mono w-20 shrink-0">{fmtDate(m.date)}</span>
                          <span className="text-[10px] text-slate-400 flex-1 font-mono min-w-0 truncate">
                            {m.awayTeam?.substring(0, 3)} <span className="font-black text-slate-200">{m.awayScore}</span>
                            {" – "}
                            <span className="font-black text-slate-200">{m.homeScore}</span> {m.homeTeam?.substring(0, 3)}
                          </span>
                          <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0 whitespace-nowrap",
                            homeWon ? "text-yellow-300 bg-yellow-500/10 border-yellow-500/20" : "text-teal-300 bg-teal-500/10 border-teal-500/20"
                          )}>{homeWon ? `${m.homeTeam?.substring(0, 3)} W` : `${m.awayTeam?.substring(0, 3)} W`}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-500 italic text-center py-4">No H2H data cached for this matchup.</div>
              )}
            </div>

            {/* Splits */}
            {(homeTeamStats || awayTeamStats) && (
              <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3">
                <div className="flex items-center gap-1.5 mb-3"><Activity className="w-3.5 h-3.5 text-slate-400" /><span className="text-[9px] font-black uppercase tracking-widest text-slate-300">Home / Road Splits</span></div>
                <StatBar label="Away Record (Road)" away={awayTeamStats?.awaySplits?.record} home={homeTeamStats?.homeSplits?.record} isString />
                <StatBar label="Runs / G (Split)" away={awayTeamStats?.awaySplits?.runs} home={homeTeamStats?.homeSplits?.runs} />
                <StatBar label="RA / G (Split)" away={awayTeamStats?.awaySplits?.runsAllowed} home={homeTeamStats?.homeSplits?.runsAllowed} lowerIsBetter />
                <StatBar label="Run Differential" away={awayTeamStats ? awayTeamStats.runsPerGame - awayTeamStats.runsAllowed : null} home={homeTeamStats ? homeTeamStats.runsPerGame - homeTeamStats.runsAllowed : null} />
              </div>
            )}

            {/* Park factor */}
            {stadium && (
              <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Stadium / Park Factor</div>
                {[["Park Factor", stadium.parkFactor?.toFixed(2)], ["Elevation", stadium.elevation ? `${stadium.elevation}ft` : null], ["Name", stadium.name]].map(([lbl, val]) => val && (
                  <div key={lbl as string} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-800/30 last:border-0">
                    <span className="text-slate-400">{lbl}</span>
                    <span className="font-black text-white font-mono">{val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ ODDS ═══════════════ */}
        {activeTab === "odds" && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 mb-3"><DollarSign className="w-3.5 h-3.5 text-yellow-400" /><span className="text-[9px] font-black uppercase tracking-widest text-yellow-300">Betting Lines</span></div>
              <div className="grid grid-cols-3 gap-1 mb-2">
                <div className="text-[9px] font-black text-teal-400 uppercase text-center">{game.awayTeam?.substring(0, 8)}</div>
                <div className="text-[9px] font-black text-slate-600 uppercase text-center">Line</div>
                <div className="text-[9px] font-black text-yellow-400 uppercase text-center">{game.homeTeam?.substring(0, 8)}</div>
              </div>
              {[
                { label: "Moneyline", away: awayMLDisplay, home: homeMLDisplay },
                { label: "Run Line", away: runLineAway ? fmtOdds(runLineAway) : "—", home: runLineHome ? fmtOdds(runLineHome) : "—" },
                { label: `Total (${totalLine || "O/U"})`, away: totalOver ? `O ${totalOver}` : "—", home: totalUnder ? `U ${totalUnder}` : "—" },
                { label: "Implied %", away: pct(awayImplied), home: pct(homeImplied) },
                { label: "Mkt Implied %", away: pct(marketImplied?.away), home: pct(marketImplied?.home) },
              ].map(({ label, away, home }) => (
                <div key={label} className="grid grid-cols-3 gap-1 py-2 border-b border-slate-800/40 last:border-0 items-center">
                  <span className="text-xs font-black font-mono text-teal-300 text-center">{away}</span>
                  <span className="text-[9px] font-black uppercase text-slate-500 text-center">{label}</span>
                  <span className="text-xs font-black font-mono text-yellow-300 text-center">{home}</span>
                </div>
              ))}
            </div>

            {/* Opening vs current */}
            {mlbContext?.odds?.openingOdds && mlbContext?.odds?.currentOdds && (
              <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Line Movement</div>
                {[
                  { label: "Opening", away: decToAmerican(mlbContext.odds.openingOdds.away), home: decToAmerican(mlbContext.odds.openingOdds.home) },
                  { label: "Current", away: decToAmerican(mlbContext.odds.currentOdds.away), home: decToAmerican(mlbContext.odds.currentOdds.home) },
                ].map(({ label, away, home }) => (
                  <div key={label} className="grid grid-cols-3 gap-1 py-1.5 border-b border-slate-800/30 last:border-0 items-center">
                    <span className="text-xs font-black font-mono text-teal-300 text-center">{away}</span>
                    <span className="text-[9px] font-black text-slate-500 text-center">{label}</span>
                    <span className="text-xs font-black font-mono text-yellow-300 text-center">{home}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Projected score */}
            {prediction?.scorePrediction && (
              <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">AI Projected Score</div>
                <div className="grid grid-cols-3 gap-2 items-center text-center">
                  <div><div className="text-3xl font-black text-teal-300 font-mono">{prediction.scorePrediction.away ?? "—"}</div><div className="text-[8px] text-slate-500 uppercase font-bold">{game.awayTeam?.substring(0, 3)}</div></div>
                  <div className="text-slate-600 font-black text-lg">vs</div>
                  <div><div className="text-3xl font-black text-yellow-300 font-mono">{prediction.scorePrediction.home ?? "—"}</div><div className="text-[8px] text-slate-500 uppercase font-bold">{game.homeTeam?.substring(0, 3)}</div></div>
                </div>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <span className="text-[9px] text-slate-500">Proj Total:</span>
                  <span className="text-sm font-black text-amber-400 font-mono">{prediction.projectedTotal || "—"}</span>
                  {prediction.recommendedTotalLine && (
                    <span className="text-[9px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded font-black">Rec: {prediction.recommendedTotalLine}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ AI EDGE ═══════════════ */}
        {activeTab === "aiedge" && (
          <div className="space-y-3 animate-in fade-in duration-200">
            {prediction ? (
              <>
                {/* ── Section 1: Decision Header ── */}
                {(() => {
                  const rec = prediction.recommendation ?? (prediction.winner === "PASS" ? "PASS" : "PLAY");
                  const isPass = rec === "PASS" || rec === "NO_PLAY";
                  const isNoPlay = rec === "NO_PLAY";
                  const recColors = isNoPlay
                    ? "border-rose-500/30 bg-rose-500/[0.06]"
                    : isPass
                    ? "border-amber-500/30 bg-amber-500/[0.06]"
                    : "border-emerald-500/30 bg-emerald-500/[0.06]";
                  const recBadgeColor = isNoPlay
                    ? "text-rose-400"
                    : isPass
                    ? "text-amber-400"
                    : "text-emerald-400";
                  return (
                    <div className={cn("rounded-xl border p-4 overflow-hidden", recColors)}>
                      <div className="flex items-center justify-between mb-3 gap-2 min-w-0">
                        <div className="min-w-0">
                          <div className="text-[8px] font-black uppercase text-slate-400 tracking-widest mb-0.5">Recommendation</div>
                          <div className={cn("text-2xl font-black uppercase tracking-wider", recBadgeColor)}>
                            {rec}
                          </div>
                        </div>
                        {!isPass && (prediction.recommendedSide || prediction.winner) && (
                          <div className="text-right min-w-0">
                            <div className="text-[8px] font-black uppercase text-slate-400 tracking-widest mb-0.5">Pick</div>
                            <div className="text-lg font-black text-white truncate">{prediction.recommendedSide || prediction.winner}</div>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { label: "Win Prob", value: pct(prediction.winProbability) },
                          { label: "Confidence", value: `${prediction.confidence?.toFixed(1) || "—"}/10` },
                          { label: "AI Edge", value: prediction.aiEdge != null ? `${prediction.aiEdge > 0 ? "+" : ""}${(prediction.aiEdge * 100).toFixed(1)}%` : (edge != null ? `${edge > 0 ? "+" : ""}${(edge * 100).toFixed(1)}%` : "—") },
                          { label: "Data Grade", value: prediction.predictionDataQuality || mlbContext?.dataQuality?.grade || "N/A" },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-slate-900/60 rounded-lg p-2 border border-slate-700/40 text-center overflow-hidden">
                            <div className="text-[8px] font-black uppercase text-slate-500 tracking-wider mb-0.5 truncate">{label}</div>
                            <div className="text-sm font-black text-white font-mono truncate">{value}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 w-full bg-slate-800/60 rounded-full h-1.5 overflow-hidden">
                        <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-1000", confBg(prediction.confidence || 0))} style={{ width: `${(prediction.confidence || 0) * 10}%` }} />
                      </div>
                    </div>
                  );
                })()}

                {/* ── Section 2: Final Read ── */}
                {(prediction.summary || prediction.bettingAngle || prediction.reasoning) && (
                  <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3 overflow-hidden">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-indigo-300">Final Read</span>
                    </div>
                    {prediction.summary && (
                      <p className="text-sm font-bold text-white leading-snug mb-2 break-words">{prediction.summary}</p>
                    )}
                    {prediction.bettingAngle && (
                      <p className="text-xs text-slate-300 leading-relaxed break-words">{prediction.bettingAngle}</p>
                    )}
                    {!prediction.summary && !prediction.bettingAngle && prediction.reasoning && (
                      <p className="text-xs text-slate-300 leading-relaxed italic break-words">&ldquo;{prediction.reasoning}&rdquo;</p>
                    )}
                  </div>
                )}

                {/* ── Section 3: Why This Pick (topReasons) ── */}
                {(() => {
                  const reasons = prediction.topReasons?.length
                    ? prediction.topReasons
                    : displayDecisionDrivers;
                  return reasons.length > 0 ? (
                    <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3 overflow-hidden">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Zap className="w-3.5 h-3.5 text-teal-400 fill-current shrink-0" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-teal-300">Why This Pick</span>
                      </div>
                      <div className="space-y-1.5">
                        {reasons.slice(0, 5).map((d, i) => (
                          <div key={i} className="flex items-start gap-2.5 p-2 bg-slate-900/50 rounded-lg border border-teal-500/10 overflow-hidden">
                            <CheckCircle className="w-3.5 h-3.5 text-teal-500 shrink-0 mt-0.5" />
                            <span className="text-xs text-slate-300 leading-relaxed break-words min-w-0">{d}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* ── Section 4: Main Risks ── */}
                {(() => {
                  const risks = prediction.riskFactors?.length ? prediction.riskFactors : riskNotes;
                  return risks.length > 0 ? (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-amber-300">Main Risks</span>
                      </div>
                      <div className="space-y-1">
                        {risks.slice(0, 3).map((r, i) => (
                          <div key={i} className="flex items-start gap-2 py-1.5 border-t border-amber-500/10 first:border-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                            <span className="text-xs text-slate-300 leading-relaxed">{r}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* ── Section 5: Matchup Advantages ── */}
                {prediction.matchupAdvantages && (
                  <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3">
                    <div className="flex items-center gap-1.5 mb-3">
                      <BarChart3 className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">Matchup Advantages</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 mb-2">
                      <div className="text-[9px] font-black text-teal-400 uppercase text-left pl-1">{game.awayTeam?.substring(0, 8)}</div>
                      <div className="text-[9px] font-black text-slate-500 uppercase text-center">Category</div>
                      <div className="text-[9px] font-black text-yellow-400 uppercase text-right pr-1">{game.homeTeam?.substring(0, 8)}</div>
                    </div>
                    {([
                      ["startingPitching", "Starting Pitching"],
                      ["bullpen", "Bullpen"],
                      ["offense", "Offense"],
                      ["recentForm", "Recent Form"],
                      ["marketValue", "Market Value"],
                    ] as [keyof NonNullable<Prediction["matchupAdvantages"]>, string][]).map(([key, label]) => {
                      const val = prediction.matchupAdvantages![key];
                      const awayWin = val === "away";
                      const homeWin = val === "home";
                      const isEven = val === "even";
                      const isNone = val === "none" || val === "unknown";
                      return (
                        <div key={key} className="grid grid-cols-3 gap-1 py-2 border-t border-slate-800/40 items-center">
                          <div className="flex justify-start">
                            {awayWin ? (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-teal-500/20 border border-teal-500/30 text-teal-300">EDGE</span>
                            ) : (
                              <span className="w-6" />
                            )}
                          </div>
                          <div className="text-[9px] text-slate-500 text-center font-bold uppercase">{label}</div>
                          <div className="flex justify-end">
                            {homeWin ? (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-yellow-500/20 border border-yellow-500/30 text-yellow-300">EDGE</span>
                            ) : isEven ? (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-700/60 border border-slate-600/30 text-slate-400">EVEN</span>
                            ) : isNone ? (
                              <span className="text-[9px] text-slate-600">—</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Section 6: Market Edge / Confidence / Data Quality ── */}
                {(prediction.confidenceExplanation || prediction.dataQualityExplanation || prediction.lastAnalyzedAt) && (
                  <div className="rounded-xl border border-slate-700/40 bg-slate-900/40 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Shield className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">Model Context</span>
                    </div>
                    {prediction.confidenceExplanation && (
                      <div>
                        <div className="text-[8px] font-black uppercase text-slate-500 mb-0.5">Confidence</div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">{prediction.confidenceExplanation}</p>
                      </div>
                    )}
                    {prediction.dataQualityExplanation && (
                      <div className="border-t border-slate-800/40 pt-2">
                        <div className="text-[8px] font-black uppercase text-slate-500 mb-0.5">Data Quality</div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">{prediction.dataQualityExplanation}</p>
                      </div>
                    )}
                    {prediction.lastAnalyzedAt && (
                      <div className="border-t border-slate-800/40 pt-2">
                        <div className="text-[8px] font-black uppercase text-slate-500 mb-0.5">Last Analyzed</div>
                        <p className="text-[11px] text-slate-400 font-mono">
                          {(() => {
                            try {
                              const diff = Date.now() - new Date(prediction.lastAnalyzedAt!).getTime();
                              const mins = Math.floor(diff / 60000);
                              if (mins < 1) return "Just now";
                              if (mins < 60) return `${mins}m ago`;
                              const hrs = Math.floor(mins / 60);
                              if (hrs < 24) return `${hrs}h ago`;
                              return `${Math.floor(hrs / 24)}d ago`;
                            } catch { return prediction.lastAnalyzedAt; }
                          })()}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Section 7: Missing Data ── */}
                {prediction.missingDataFields && prediction.missingDataFields.length > 0 && (
                  <div className="rounded-xl border border-amber-500/10 bg-amber-500/[0.03] p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertTriangle className="w-3 h-3 text-amber-500" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">Missing Data</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {prediction.missingDataFields.map((f, i) => (
                        <span key={i} className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 font-bold">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Reanalyze Button ── */}
                {onReanalyze && (
                  <div className="flex justify-end pt-1">
                    <button onClick={e => { e.stopPropagation(); onReanalyze(game); }} disabled={isAnalyzing}
                      className={cn("py-2 px-4 rounded-lg flex items-center gap-1.5 transition-all font-black text-xs shadow-lg disabled:opacity-50",
                        "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                      )}>
                      <RefreshCw className={cn("w-3.5 h-3.5", isAnalyzing && "animate-spin")} />
                      {isAnalyzing ? "Analyzing..." : "Reanalyze"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center p-8 rounded-xl border border-slate-800 bg-slate-900/40">
                <Brain className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-500 text-sm mb-3">No AI analysis available.</p>
                {onReanalyze && (
                  <button onClick={e => { e.stopPropagation(); onReanalyze(game); }} disabled={isAnalyzing}
                    className="py-2 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs flex items-center gap-1.5 mx-auto disabled:opacity-50">
                    <RefreshCw className={cn("w-3.5 h-3.5", isAnalyzing && "animate-spin")} />
                    {isAnalyzing ? "Analyzing..." : "Run Analysis"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}


      </div>
    </div>
  );
}
