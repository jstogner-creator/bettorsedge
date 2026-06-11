import React, { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CircleDot,
  DollarSign,
  Info,
  TrendingUp,
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
} from "lucide-react";
import { Game, Prediction } from "../types";
import { cn } from "../lib/utils";
import { ApiSportsWidgetEmbed } from "./ApiSportsWidgets";
import { parsePitcher, parseTeamStats } from "../services/apiSportsMlb";

const WIDGET_KEY = "b2795a8c744b26f971aaf15eb994212e";

interface MlbMatchupLabProps {
  game: Game;
  prediction?: Prediction | null;
  onReanalyze?: (game: Game) => void;
  isAnalyzing?: boolean;
}

function asPercent(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "N/A";
  const pct = value > 1 ? value : value * 100;
  return `${pct.toFixed(1)}%`;
}

function americanOddsToImplied(odds?: number | null) {
  if (odds == null || Number.isNaN(odds)) return null;
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

function formatOdds(odds?: number | null) {
  if (odds == null || Number.isNaN(odds)) return "N/A";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function MlbMatchupLab({ game, prediction, onReanalyze, isAnalyzing }: MlbMatchupLabProps) {
  const [showWidget, setShowWidget] = useState(false);

  const mlbContext = (game as any).mlbContext;
  const h2h = Array.isArray(prediction?.previousMatchups) ? prediction.previousMatchups : [];
  const pitcherMatchup = prediction?.pitcherMatchup || mlbContext?.pitching;
  
  const homeStarter = useMemo(() => parsePitcher(pitcherMatchup?.homePitcher), [pitcherMatchup]);
  const awayStarter = useMemo(() => parsePitcher(pitcherMatchup?.awayPitcher), [pitcherMatchup]);
  const startersConfirmed = Boolean(
    homeStarter?.name &&
    homeStarter.name !== "TBD" &&
    !homeStarter.name.toLowerCase().includes("not returned") &&
    awayStarter?.name &&
    awayStarter.name !== "TBD" &&
    !awayStarter.name.toLowerCase().includes("not returned")
  );

  const homeML = prediction?.marketExpectations?.homeWinProb ?? game.marketExpectations?.homeWinProb;
  const awayML = prediction?.marketExpectations?.awayWinProb ?? game.marketExpectations?.awayWinProb;

  // Implied probabilities from moneyline
  const homeImplied = homeML ? americanOddsToImplied(homeML) : null;
  const awayImplied = awayML ? americanOddsToImplied(awayML) : null;
  
  // Model probability
  const modelProb = prediction?.winProbability;
  const pickSide = prediction?.winner === game.homeTeam ? "home" : prediction?.winner === game.awayTeam ? "away" : null;

  // Market Implied Probability (Average or derived)
  const marketImplied = mlbContext?.odds?.marketImpliedProbability || (
    homeImplied && awayImplied ? { home: homeImplied / (homeImplied + awayImplied), away: awayImplied / (homeImplied + awayImplied) } : null
  );

  const selectedSideMarketProb = pickSide === "home" ? marketImplied?.home : pickSide === "away" ? marketImplied?.away : null;
  const edge = typeof modelProb === "number" && typeof selectedSideMarketProb === "number" ? modelProb - selectedSideMarketProb : prediction?.matchupDelta;

  const homeTeamStats = useMemo(() => parseTeamStats(mlbContext?.teamStatistics?.home), [mlbContext]);
  const awayTeamStats = useMemo(() => parseTeamStats(mlbContext?.teamStatistics?.away), [mlbContext]);

  const h2hSummary = useMemo(() => {
    if (!h2h.length) return null;
    const homeWins = h2h.filter((m) => {
      const hScore = Number(m.homeScore);
      const aScore = Number(m.awayScore);
      return m.homeTeam === game.homeTeam ? hScore > aScore : aScore > hScore;
    }).length;
    const awayWins = h2h.length - homeWins;
    const totals = h2h
      .map((m) => Number(m.homeScore) + Number(m.awayScore))
      .filter((n) => Number.isFinite(n));
    const avgTotal = totals.length ? totals.reduce((sum, n) => sum + n, 0) / totals.length : null;
    return {
      homeWins,
      awayWins,
      avgTotal,
      text: `${game.homeTeam} has won ${homeWins} of the last ${h2h.length} meetings, averaging ${avgTotal ? avgTotal.toFixed(1) : "N/A"} combined runs.`,
    };
  }, [h2h, game.homeTeam, game.awayTeam]);

  // Cleaned up Decision Drivers (Key Betting Factors)
  const displayDecisionDrivers = useMemo(() => {
    if (!prediction) return [];
    const bannedPhrases = [
      "api-sports",
      "game detail",
      "game id",
      "provider payload",
      "provider",
      "book entries",
      "team statistics are available",
      "multi-book odds are available",
      "openai",
      "model version",
      "prompt version",
      "qa adjusted",
      "api audit notes",
      "audit notes",
    ];

    const rawFactors = Array.isArray(prediction.keyFactors) ? prediction.keyFactors : [];
    return rawFactors
      .filter((factor) => typeof factor === "string" && factor.trim())
      .filter((factor) => {
        const lower = factor.toLowerCase();
        return !bannedPhrases.some((phrase) => lower.includes(phrase));
      })
      .map((factor) => factor.replace(/\s+/g, " ").trim());
  }, [prediction]);

  // Risks & missing data notes
  const riskNotes = useMemo(() => {
    const list: string[] = [];
    if (prediction?.devilsAdvocate) list.push(prediction.devilsAdvocate);
    if (!startersConfirmed) {
      list.push("Unconfirmed Pitching Matchup: Start is preliminary and betting edge is highly subject to change.");
    }
    const homeInj = mlbContext?.injuries?.home?.length || 0;
    const awayInj = mlbContext?.injuries?.away?.length || 0;
    if (homeInj > 0 || awayInj > 0) {
      list.push(`Injury Impact: Home side lists ${homeInj} on report; Away side lists ${awayInj}.`);
    }
    return list;
  }, [prediction, startersConfirmed, mlbContext]);

  // Widget html
  const widgetHtml = useMemo(() => {
    if (!game.apiSportsGameId) return "";
    const h2hId = game.apiSportsHomeTeamId && game.apiSportsAwayTeamId ? `${game.apiSportsHomeTeamId}-${game.apiSportsAwayTeamId}` : "";
    return `
      <div class="space-y-4">
        <api-sports-widget
          data-type="game"
          data-game-id="${game.apiSportsGameId}"
          data-refresh="30"
          data-show-toolbar="true"
          data-tab="all"
          data-game-style="2"
        ></api-sports-widget>
        ${h2hId ? `
        <api-sports-widget
          data-type="h2h"
          data-h2h="${h2hId}"
          data-refresh="30"
          data-show-toolbar="true"
          data-tab="all"
          data-h2h-style="2"
        ></api-sports-widget>` : ""}
        <api-sports-widget
          data-type="config"
          data-key="${WIDGET_KEY}"
          data-sport="baseball"
          data-lang="en"
          data-theme="grey"
          data-timezone="CST"
          data-show-errors="false"
          data-show-logos="true"
          data-favorite="true"
        ></api-sports-widget>
      </div>
    `;
  }, [game.apiSportsGameId, game.apiSportsHomeTeamId, game.apiSportsAwayTeamId]);

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-top-4 duration-300">
      
      {/* 1. Starting Pitcher Check */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 relative overflow-hidden">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-cyan-500/10 rounded border border-cyan-500/20 text-cyan-400">
              <CircleDot className="w-4 h-4 animate-pulse" />
            </div>
            <h4 className="text-xs font-black text-cyan-200 uppercase tracking-widest">Starting Pitcher Check</h4>
          </div>
          <span className={cn(
            "rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider",
            startersConfirmed ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-300"
          )}>
            {startersConfirmed ? "Pitchers Confirmed" : "Pitchers Unconfirmed / TBD"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Away Starter */}
          <div className="rounded-xl bg-slate-900/60 p-3.5 border border-slate-800/60 hover:border-slate-800 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-[9px] font-black uppercase text-slate-500 block">AWAY STARTER</span>
                <span className="text-sm font-black text-white">{awayStarter?.name || "TBD"}</span>
              </div>
              {awayStarter?.handedness && (
                <span className="bg-slate-800 border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded text-[9px] font-bold">
                  {awayStarter.handedness}
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-4 gap-1.5 text-center mt-3">
              {[
                ["ERA", awayStarter?.era],
                ["WHIP", awayStarter?.whip],
                ["SO", awayStarter?.strikeouts],
                ["BB", awayStarter?.walks],
              ].map(([lbl, val]) => (
                <div key={lbl} className="bg-slate-950/60 rounded p-1.5 border border-slate-800/30">
                  <div className="text-[8px] text-slate-500 font-bold uppercase">{lbl}</div>
                  <div className="text-xs font-mono font-black text-slate-300 mt-0.5">{val || "N/A"}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 text-[10px] text-slate-400 bg-slate-950/30 p-2 rounded border border-slate-800/40 italic">
              Recent starts: {awayStarter?.recentStarts || "No recent starts context available."}
            </div>
          </div>

          {/* Home Starter */}
          <div className="rounded-xl bg-slate-900/60 p-3.5 border border-slate-800/60 hover:border-slate-800 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-[9px] font-black uppercase text-slate-500 block">HOME STARTER</span>
                <span className="text-sm font-black text-white">{homeStarter?.name || "TBD"}</span>
              </div>
              {homeStarter?.handedness && (
                <span className="bg-slate-800 border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded text-[9px] font-bold">
                  {homeStarter.handedness}
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-4 gap-1.5 text-center mt-3">
              {[
                ["ERA", homeStarter?.era],
                ["WHIP", homeStarter?.whip],
                ["SO", homeStarter?.strikeouts],
                ["BB", homeStarter?.walks],
              ].map(([lbl, val]) => (
                <div key={lbl} className="bg-slate-950/60 rounded p-1.5 border border-slate-800/30">
                  <div className="text-[8px] text-slate-500 font-bold uppercase">{lbl}</div>
                  <div className="text-xs font-mono font-black text-slate-300 mt-0.5">{val || "N/A"}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 text-[10px] text-slate-400 bg-slate-950/30 p-2 rounded border border-slate-800/40 italic">
              Recent starts: {homeStarter?.recentStarts || "No recent starts context available."}
            </div>
          </div>
        </div>

        {!startersConfirmed && (
          <div className="mt-3 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] p-3 text-xs leading-relaxed text-amber-200/90 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p>
              Starting pitchers are unconfirmed. The deterministic model has automatically regressed its probabilities and capped the play lean threshold until starters are locked.
            </p>
          </div>
        )}
      </section>

      {/* 2. Betting Snapshot */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="p-1 bg-indigo-500/10 rounded border border-indigo-500/20 text-indigo-400">
            <Activity className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-black text-indigo-200 uppercase tracking-widest">Betting Snapshot</h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Proj Score */}
          <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-3.5 flex flex-col justify-between">
            <span className="text-[9px] font-black text-slate-500 uppercase block tracking-wider">PROJECTED SCORE</span>
            <div className="flex justify-between items-center mt-2 bg-slate-950/50 px-3 py-2 rounded-lg border border-slate-900 font-mono">
              <div className="text-center flex-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase truncate block">{game.awayTeam.substring(0, 3)}</span>
                <span className="text-xl font-black text-indigo-300 block">{prediction?.scorePrediction?.away ?? "-"}</span>
              </div>
              <div className="px-2 text-slate-700 font-black italic text-xs">VS</div>
              <div className="text-center flex-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase truncate block">{game.homeTeam.substring(0, 3)}</span>
                <span className="text-xl font-black text-indigo-300 block">{prediction?.scorePrediction?.home ?? "-"}</span>
              </div>
            </div>
          </div>

          {/* Proj Total */}
          <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-3.5 flex flex-col justify-between">
            <span className="text-[9px] font-black text-slate-500 uppercase block tracking-wider">PROJECTED RUN TOTAL</span>
            <div className="mt-2 flex flex-col items-center justify-center bg-slate-950/50 py-2.5 rounded-lg border border-slate-900">
              <span className="text-2xl font-mono font-black text-amber-400 leading-none">
                {prediction?.projectedTotal ?? "-"}
              </span>
              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider mt-1">Runs Combined</span>
            </div>
          </div>

          {/* Target Total Line */}
          <div className="rounded-xl bg-slate-900/40 border border-slate-800 p-3.5 flex flex-col justify-between">
            <span className="text-[9px] font-black text-slate-500 uppercase block tracking-wider">RECOMMENDED TOTAL LINE</span>
            <div className="mt-2 flex flex-col items-center justify-center bg-indigo-500/10 border border-indigo-500/20 py-2.5 rounded-lg">
              <span className="text-sm font-black text-white font-mono">
                {prediction?.recommendedTotalLine || "PASS"}
              </span>
              <span className="text-[8px] text-indigo-400 font-bold uppercase tracking-wider mt-1 flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" /> Safety cushion applied
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-slate-500 font-mono border-t border-slate-900 pt-3">
          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Date: {game.date}</span>
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Time: {game.time}</span>
          <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Venue: {game.location}</span>
        </div>
      </section>

      {/* 3. Market Edge */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="p-1 bg-amber-500/10 rounded border border-amber-500/20 text-amber-400">
            <DollarSign className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-black text-amber-200 uppercase tracking-widest">Market Edge</h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-3 transition-colors hover:border-slate-800/80">
            <span className="text-[8px] font-black uppercase tracking-wider text-slate-500">Model win probability</span>
            <div className="text-base font-mono font-black text-slate-100 mt-1.5">
              {modelProb ? asPercent(modelProb) : "N/A"}
            </div>
          </div>

          <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-3 transition-colors hover:border-slate-800/80">
            <span className="text-[8px] font-black uppercase tracking-wider text-slate-500">Market implied probability</span>
            <div className="text-base font-mono font-black text-slate-100 mt-1.5">
              {selectedSideMarketProb ? asPercent(selectedSideMarketProb) : (marketImplied?.home ? asPercent(marketImplied.home) : "N/A")}
            </div>
          </div>

          <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-3 transition-colors hover:border-slate-800/80">
            <span className="text-[8px] font-black uppercase tracking-wider text-slate-500">Calculated model edge</span>
            <div className={cn(
              "text-base font-mono font-black mt-1.5",
              (edge || 0) >= 0.035 ? "text-emerald-400" : "text-amber-400"
            )}>
              {edge == null ? "N/A" : `${edge >= 0 ? "+" : ""}${(edge * 100).toFixed(1)}%`}
            </div>
          </div>

          <div className="rounded-xl bg-slate-900/50 border border-slate-800 p-3 transition-colors hover:border-slate-800/80">
            <span className="text-[8px] font-black uppercase tracking-wider text-slate-500">Kalshi Market Expectations</span>
            <div className="text-xs font-mono font-black text-indigo-300 mt-2">
              {game.kalshiExpectations?.yes !== undefined ? `${(game.kalshiExpectations.yes).toFixed(0)}¢ YES` : "No Kalshi Slate"}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border-t border-slate-900 pt-4">
          <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/50 flex justify-between items-center">
            <span className="text-slate-400">{game.awayTeam} Moneyline</span>
            <span className="font-mono font-black text-white">{formatOdds(awayML)}</span>
          </div>
          <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/50 flex justify-between items-center">
            <span className="text-slate-400">{game.homeTeam} Moneyline</span>
            <span className="font-mono font-black text-white">{formatOdds(homeML)}</span>
          </div>
        </div>
      </section>

      {/* 4. Team Edge */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="p-1 bg-indigo-500/10 rounded border border-indigo-500/20 text-indigo-400">
            <BarChart3 className="w-4 h-4" />
          </div>
          <h4 className="text-xs font-black text-indigo-200 uppercase tracking-widest">Team Edge</h4>
        </div>

        <div className="space-y-3">
          {[
            { label: "Runs Per Game", home: homeTeamStats?.runsPerGame, away: awayTeamStats?.runsPerGame, lowerIsBetter: false },
            { label: "Runs Allowed / Game", home: homeTeamStats?.runsAllowed, away: awayTeamStats?.runsAllowed, lowerIsBetter: true },
            { label: "Batting Average", home: homeTeamStats?.battingAverage, away: awayTeamStats?.battingAverage, lowerIsBetter: false },
            { label: "OBP / SLG / OPS", home: homeTeamStats?.ops, away: awayTeamStats?.ops, lowerIsBetter: false, customString: true },
            { label: "Bullpen ERA", home: homeTeamStats?.bullpenEra, away: awayTeamStats?.bullpenEra, lowerIsBetter: true },
            { label: "Home/Away Splits", home: homeTeamStats?.homeSplits?.record, away: awayTeamStats?.awaySplits?.record, customString: true },
          ].map((stat, idx) => {
            const homeVal = stat.home;
            const awayVal = stat.away;
            const homeNum = parseFloat(String(homeVal));
            const awayNum = parseFloat(String(awayVal));

            let advantage: "home" | "away" | "neutral" = "neutral";
            if (!stat.customString && !isNaN(homeNum) && !isNaN(awayNum)) {
              if (homeNum !== awayNum) {
                advantage = stat.lowerIsBetter
                  ? (homeNum < awayNum ? "home" : "away")
                  : (homeNum > awayNum ? "home" : "away");
              }
            }

            const homeLabel = stat.customString && homeTeamStats 
              ? (stat.label.includes("Splits") ? `${homeVal} (runs: ${homeTeamStats.homeSplits.runs} / allowed: ${homeTeamStats.homeSplits.runsAllowed})` : `${homeVal} OPS (OBP: ${homeTeamStats.obp.toFixed(3)} / SLG: ${homeTeamStats.slg.toFixed(3)})`)
              : homeVal;
            const awayLabel = stat.customString && awayTeamStats
              ? (stat.label.includes("Splits") ? `${awayVal} (runs: ${awayTeamStats.awaySplits.runs} / allowed: ${awayTeamStats.awaySplits.runsAllowed})` : `${awayVal} OPS (OBP: ${awayTeamStats.obp.toFixed(3)} / SLG: ${awayTeamStats.slg.toFixed(3)})`)
              : awayVal;

            return (
              <div key={idx} className="flex items-center gap-3">
                <div className={cn(
                  "w-24 sm:w-32 text-right text-[11px] font-black truncate",
                  advantage === "away" ? "text-cyan-300" : "text-slate-500"
                )}>
                  {awayLabel !== undefined && awayLabel !== null ? String(awayLabel) : "N/A"}
                </div>
                
                <div className="flex-1 h-6 bg-slate-900/60 rounded-full overflow-hidden flex items-center relative border border-slate-800/40">
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{stat.label}</span>
                  </div>
                  <div className={cn(
                    "h-full w-1/2 transition-all duration-1000",
                    advantage === "away" ? "bg-cyan-500/20" : "bg-transparent"
                  )} />
                  <div className="w-px h-full bg-slate-700/50 z-10" />
                  <div className={cn(
                    "h-full w-1/2 transition-all duration-1000",
                    advantage === "home" ? "bg-cyan-500/20" : "bg-transparent"
                  )} />
                </div>

                <div className={cn(
                  "w-24 sm:w-32 text-left text-[11px] font-black truncate",
                  advantage === "home" ? "text-cyan-300" : "text-slate-500"
                )}>
                  {homeLabel !== undefined && homeLabel !== null ? String(homeLabel) : "N/A"}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Previous Matchups */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-cyan-500/10 rounded border border-cyan-500/20 text-cyan-400">
              <Activity className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-black text-cyan-200 uppercase tracking-widest">Previous Matchups</h4>
          </div>
          {h2hSummary && (
            <span className="text-[10px] text-slate-400 font-mono">
              Combined Runs: Avg {h2hSummary.avgTotal ? h2hSummary.avgTotal.toFixed(1) : "N/A"}
            </span>
          )}
        </div>

        {h2h.length > 0 ? (
          <div className="space-y-2">
            {h2h.slice(0, 6).map((match, idx) => {
              const homeWinner = Number(match.homeScore) > Number(match.awayScore);
              const isHome = match.homeTeam === game.homeTeam;
              const advantage = (isHome && homeWinner) || (!isHome && !homeWinner) ? "home" : "away";
              
              return (
                <div key={idx} className="grid grid-cols-[80px_1fr_auto] items-center gap-3 bg-slate-900/40 rounded-xl p-3 border border-slate-850 hover:border-slate-800 transition-colors">
                  <div className="text-[10px] font-mono text-slate-500 font-bold">{match.date}</div>
                  <div className="text-xs text-slate-300 truncate font-mono">
                    {match.awayTeam} <span className="font-bold text-white">{match.awayScore}</span> - <span className="font-bold text-white">{match.homeScore}</span> {match.homeTeam}
                  </div>
                  <span className={cn(
                    "text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider",
                    advantage === "home" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                  )}>
                    {advantage === "home" ? `${game.homeTeam.substring(0,3)} Win` : `${game.awayTeam.substring(0,3)} Win`}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/20 p-4 text-xs text-slate-500 italic text-center">
            No previous head-to-head matchup history is cached in Firestore for this pairing.
          </div>
        )}
      </section>

      {/* 6. Key Betting Factors */}
      {displayDecisionDrivers.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="p-1 bg-indigo-500/10 rounded border border-indigo-500/20 text-indigo-400">
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <h4 className="text-xs font-black text-indigo-200 uppercase tracking-widest">Key Betting Factors</h4>
          </div>

          <div className="space-y-2.5">
            {displayDecisionDrivers.map((driver, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-800/40 hover:border-indigo-500/10 transition-colors group">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-300 leading-relaxed">{driver}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 7. Risk Notes */}
      {riskNotes.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="p-1 bg-rose-500/10 rounded border border-rose-500/20 text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h4 className="text-xs font-black text-rose-200 uppercase tracking-widest">Risk Notes</h4>
          </div>

          <div className="space-y-2">
            {riskNotes.map((risk, idx) => (
              <div key={idx} className="flex items-start gap-2.5 p-3 bg-slate-900/30 rounded-lg border border-slate-800/50">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                <p className="text-xs text-slate-400 leading-relaxed">{risk}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 8. Final Lean / Play / Pass */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 relative overflow-hidden">
        
        {/* Play/Lean/Pass Badge */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Brain className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase block tracking-widest">FINAL SELECTION</span>
              <span className={cn(
                "text-lg font-black uppercase tracking-wider",
                prediction?.winner === "PASS" ? "text-amber-400" : (edge || 0) >= 0.07 ? "text-emerald-400 animate-pulse" : "text-indigo-400"
              )}>
                {prediction?.winner === "PASS" ? "Pass" : (edge || 0) >= 0.07 ? "Play" : "Lean"}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3 text-right">
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase block tracking-widest">CONFIDENCE LEVEL</span>
              <span className="text-sm font-black text-white font-mono">
                {prediction?.confidence ? prediction.confidence.toFixed(1) : "0.0"}/10
              </span>
            </div>
          </div>
        </div>

        {/* Confidence Meter */}
        <div className="w-full bg-slate-800/40 rounded-full h-2 mb-5 overflow-hidden border border-slate-800">
          <div 
            className={cn(
              "h-2 rounded-full transition-all duration-1000 ease-out",
              (prediction?.confidence || 0) >= 7 ? "bg-gradient-to-r from-emerald-600 to-emerald-400" :
              (prediction?.confidence || 0) >= 5 ? "bg-gradient-to-r from-amber-600 to-amber-400" : 
              "bg-gradient-to-r from-rose-600 to-rose-400"
            )}
            style={{ width: `${(prediction?.confidence || 0) * 10}%` }}
          />
        </div>

        {/* Betting Explanation */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
          <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Bettor Analysis Breakdown
          </h5>
          <p className="text-sm text-slate-200 leading-relaxed italic">
            "{prediction?.reasoning || "Bettors Edge prediction engine is analyzing this matchup. Check back shortly."}"
          </p>
        </div>

        {/* Admin Reanalyze Block */}
        {onReanalyze && (
          <div className="mt-4 flex justify-end gap-2 border-t border-slate-900 pt-4">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReanalyze(game);
              }}
              disabled={isAnalyzing}
              className={cn(
                "py-2 px-4 rounded-lg flex items-center justify-center transition-all font-black text-xs shadow-lg disabled:opacity-50",
                prediction 
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700" 
                  : "bg-indigo-600 hover:bg-indigo-500 text-white"
              )}
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isAnalyzing && "animate-spin")} />
              {isAnalyzing ? "Analyzing..." : (prediction ? "Reanalyze Matchup" : "Run Analysis")}
            </button>
          </div>
        )}
      </section>

      {/* Provider game widget */}
      {game.apiSportsGameId && (
        <section>
          <button
            type="button"
            onClick={() => setShowWidget((value) => !value)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/40 p-3 text-left transition hover:border-cyan-500/20"
          >
            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
              <Info className="w-3.5 h-3.5 text-cyan-400" /> Live Provider details widget
            </span>
            <span className="text-[10px] font-black uppercase text-cyan-400">{showWidget ? "Hide" : "Show"}</span>
          </button>
          {showWidget && (
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 p-2 animate-in fade-in duration-300">
              <ApiSportsWidgetEmbed html={widgetHtml} />
            </div>
          )}
        </section>
      )}

    </div>
  );
}
