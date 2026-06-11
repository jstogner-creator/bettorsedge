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
  Thermometer,
  Wind,
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
  const [activeDetailTab, setActiveDetailTab] = useState<"ai" | "matchup" | "h2h" | "injuries" | "live">("ai");

  const mlbContext = (game as any).mlbContext || prediction?.mlbContext;
  const h2h = Array.isArray(prediction?.previousMatchups) ? prediction.previousMatchups : [];
  const pitcherMatchup = prediction?.pitcherMatchup || mlbContext?.pitching;
  
  const homeStarter = useMemo(() => parsePitcher(pitcherMatchup?.homePitcher || pitcherMatchup?.homeStarter), [pitcherMatchup]);
  const awayStarter = useMemo(() => parsePitcher(pitcherMatchup?.awayPitcher || pitcherMatchup?.awayStarter), [pitcherMatchup]);
  
  const favoredStarter = useMemo(() => {
    if (!homeStarter || !awayStarter || homeStarter.name === "TBD" || awayStarter.name === "TBD") return null;
    const homeEraNum = parseFloat(String(homeStarter.era));
    const awayEraNum = parseFloat(String(awayStarter.era));
    const homeWhipNum = parseFloat(String(homeStarter.whip));
    const awayWhipNum = parseFloat(String(awayStarter.whip));

    if (isNaN(homeEraNum) || isNaN(awayEraNum)) return null;

    let homeScore = 0;
    let awayScore = 0;

    if (homeEraNum < awayEraNum) homeScore++;
    else if (homeEraNum > awayEraNum) awayScore++;

    if (!isNaN(homeWhipNum) && !isNaN(awayWhipNum)) {
      if (homeWhipNum < awayWhipNum) homeScore++;
      else if (homeWhipNum > awayWhipNum) awayScore++;
    }

    if (homeScore > awayScore) return "home";
    if (awayScore > homeScore) return "away";
    return null;
  }, [homeStarter, awayStarter]);

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

  const homeTeamStats = mlbContext?.normalizedTeamStats?.home;
  const awayTeamStats = mlbContext?.normalizedTeamStats?.away;

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
      {/* Detail Tabs */}
      <div className="flex flex-wrap items-center bg-slate-950/40 p-1 rounded-xl border border-slate-850 mb-4 gap-1">
        {([
          { id: "ai", label: "AI Read" },
          { id: "matchup", label: "Matchup" },
          { id: "h2h", label: "H2H" },
          { id: "injuries", label: "Injuries" },
          { id: "live", label: "Live Widget" }
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={(e) => {
              e.stopPropagation();
              setActiveDetailTab(tab.id);
            }}
            className={cn(
              "flex-1 px-3 py-2 text-xs font-bold transition-all rounded-lg text-center whitespace-nowrap",
              activeDetailTab === tab.id
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: AI Read */}
      {activeDetailTab === "ai" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* 1. Final Selection (PASS or PREDICTION) */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 relative overflow-hidden">
            {/* Selection Details */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 rounded-lg">
                  <Brain className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase block tracking-widest">FINAL SELECTION</span>
                  <div className="flex flex-col">
                    <span className={cn(
                      "text-lg font-black uppercase tracking-wider",
                      prediction?.winner === "PASS" ? "text-amber-400" : "text-emerald-400 animate-pulse"
                    )}>
                      {prediction?.winner === "PASS" ? "PASS" : "PREDICTION"}
                    </span>
                    {prediction?.winner !== "PASS" && prediction?.winner && (
                      <span className="text-xl font-black text-white mt-1">
                        {prediction.winner} to Win
                      </span>
                    )}
                  </div>
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
              <p className="text-sm text-slate-200 leading-relaxed italic font-normal">
                "{prediction?.reasoning || "Bettors Edge prediction engine is analyzing this matchup. Check back shortly."}"
              </p>
            </div>

            {/* Key Betting Factors */}
            {displayDecisionDrivers.length > 0 && (
              <div className="mt-4 space-y-2">
                <h5 className="text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-2 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 fill-current" /> Key Betting Factors
                </h5>
                <div className="space-y-2">
                  {displayDecisionDrivers.map((driver, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-805/40 hover:border-indigo-500/10 transition-colors group">
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-slate-300 leading-relaxed font-normal">{driver}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risk Notes */}
            {riskNotes.length > 0 && (
              <div className="mt-4 space-y-2">
                <h5 className="text-[10px] font-black uppercase text-rose-400 tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Risk Notes
                </h5>
                <div className="space-y-2">
                  {riskNotes.map((risk, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 p-3 bg-slate-900/30 rounded-lg border border-slate-800/50">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                      <p className="text-xs text-slate-400 leading-relaxed font-normal">{risk}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
        </div>
      )}

      {/* Tab 2: Matchup */}
      {activeDetailTab === "matchup" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Starting Pitcher Check */}
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
                startersConfirmed ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-350"
              )}>
                {startersConfirmed ? "Pitchers Confirmed" : "Pitchers Unconfirmed / TBD"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Away Starter */}
              <div className="rounded-xl bg-slate-900/60 p-3.5 border border-slate-800/60 hover:border-slate-800 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className="text-[9px] font-black uppercase text-slate-500">AWAY STARTER</span>
                      {!startersConfirmed && (
                        <span className="text-amber-400 text-[8px] font-extrabold bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">PROJECTED</span>
                      )}
                      {favoredStarter === "away" && (
                        <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-[8px] font-black uppercase px-2 py-0.2 rounded flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5" /> FAVORED
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-black text-white">{awayStarter?.name || "TBD"}</span>
                  </div>
                  {awayStarter?.handedness && (
                    <span className="bg-slate-800 border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded text-[9px] font-bold">
                      {awayStarter.handedness}
                    </span>
                  )}
                </div>
                
                <div className="space-y-1.5 text-xs font-mono mt-3">
                  {[
                    ["ERA", awayStarter?.era],
                    ["WHIP", awayStarter?.whip],
                    ["Strikeouts (SO)", awayStarter?.strikeouts],
                    ["Walks (BB)", awayStarter?.walks],
                  ].map(([lbl, val]) => (
                    <div key={lbl} className="bg-slate-950/60 rounded p-2 border border-slate-850 flex justify-between items-center">
                      <span className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider">{lbl}</span>
                      <span className="text-xs font-black text-slate-200">{val || "N/A"}</span>
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
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className="text-[9px] font-black uppercase text-slate-500">HOME STARTER</span>
                      {!startersConfirmed && (
                        <span className="text-amber-400 text-[8px] font-extrabold bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">PROJECTED</span>
                      )}
                      {favoredStarter === "home" && (
                        <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-[8px] font-black uppercase px-2 py-0.2 rounded flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5" /> FAVORED
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-black text-white">{homeStarter?.name || "TBD"}</span>
                  </div>
                  {homeStarter?.handedness && (
                    <span className="bg-slate-800 border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded text-[9px] font-bold">
                      {homeStarter.handedness}
                    </span>
                  )}
                </div>
                
                <div className="space-y-1.5 text-xs font-mono mt-3">
                  {[
                    ["ERA", homeStarter?.era],
                    ["WHIP", homeStarter?.whip],
                    ["Strikeouts (SO)", homeStarter?.strikeouts],
                    ["Walks (BB)", homeStarter?.walks],
                  ].map(([lbl, val]) => (
                    <div key={lbl} className="bg-slate-950/60 rounded p-2 border border-slate-850 flex justify-between items-center">
                      <span className="text-[8.5px] text-slate-500 font-bold uppercase tracking-wider">{lbl}</span>
                      <span className="text-xs font-black text-slate-200">{val || "N/A"}</span>
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

          {/* Betting Snapshot */}
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
          </section>
        </div>
      )}

      {/* Tab 3: H2H */}
      {activeDetailTab === "h2h" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Previous Matchups */}
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
        </div>
      )}

      {/* Tab 4: Team Edge & Splits */}
      {activeDetailTab === "injuries" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Team Edge */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="p-1 bg-indigo-500/10 rounded border border-indigo-500/20 text-indigo-400">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-black text-indigo-200 uppercase tracking-widest">Team Edge</h4>
            </div>

            <div className="space-y-1">
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

                const isBullpen = stat.label === "Bullpen ERA";
                const homeFatigue = prediction?.bullpenFatigue?.home;
                const awayFatigue = prediction?.bullpenFatigue?.away;
                const homeFatigued = isBullpen && homeFatigue && homeFatigue > 0.70;
                const awayFatigued = isBullpen && awayFatigue && awayFatigue > 0.70;

                const homeLabel = stat.customString && homeTeamStats 
                  ? (stat.label.includes("Splits") ? `${homeVal} (runs: ${homeTeamStats.homeSplits.runs} / allowed: ${homeTeamStats.homeSplits.runsAllowed})` : `${homeVal} OPS (OBP: ${homeTeamStats.obp.toFixed(3)} / SLG: ${homeTeamStats.slg.toFixed(3)})`)
                  : (homeFatigued ? `${homeVal} (🚨 Fatigue: ${(homeFatigue * 100).toFixed(0)}%)` : homeVal);
                const awayLabel = stat.customString && awayTeamStats
                  ? (stat.label.includes("Splits") ? `${awayVal} (runs: ${awayTeamStats.awaySplits.runs} / allowed: ${awayTeamStats.awaySplits.runsAllowed})` : `${awayVal} OPS (OBP: ${awayTeamStats.obp.toFixed(3)} / SLG: ${awayTeamStats.slg.toFixed(3)})`)
                  : (awayFatigued ? `(🚨 Fatigue: ${(awayFatigue * 100).toFixed(0)}%) ${awayVal}` : awayVal);

                return (
                  <div key={idx} className="border-b border-slate-900/60 py-3 last:border-0 last:pb-0">
                    <div className="flex md:hidden items-center justify-between mb-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-900/80 px-2.5 py-0.5 rounded border border-slate-800/60">
                        {stat.label}
                      </span>
                      {advantage !== "neutral" && (
                        <span className={cn(
                          "text-[8px] font-extrabold px-1.5 py-0.2 rounded border uppercase tracking-wider",
                          advantage === "home" 
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                            : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                        )}>
                          {advantage === "home" ? `${game.homeTeam.substring(0, 3)} Edge` : `${game.awayTeam.substring(0, 3)} Edge`}
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 items-center gap-3 text-xs">
                      <div className={cn(
                        "text-left md:text-right font-mono font-bold px-2.5 py-2 rounded-lg border md:border-0 md:bg-transparent md:p-0 transition-all",
                        advantage === "away" 
                          ? "text-cyan-300 bg-cyan-500/[0.04] border-cyan-500/20 md:text-cyan-400" 
                          : "text-slate-400 bg-slate-900/25 border-slate-900/60 md:text-slate-500"
                      )}>
                        <span className="text-[8px] text-slate-500 block md:hidden uppercase font-bold mb-0.5">{game.awayTeam.substring(0, 3)}</span>
                        <span className="leading-relaxed">{awayLabel !== undefined && awayLabel !== null ? String(awayLabel) : "N/A"}</span>
                      </div>
                      
                      <div className="hidden md:flex flex-col items-center justify-center gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                          {stat.label}
                        </span>
                        {advantage !== "neutral" && (
                          <span className={cn(
                            "text-[8px] font-extrabold px-1.5 py-0.2 rounded border uppercase tracking-wider",
                            advantage === "home" 
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                              : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                          )}>
                            {advantage === "home" ? `${game.homeTeam.substring(0, 3)} Edge` : `${game.awayTeam.substring(0, 3)} Edge`}
                          </span>
                        )}
                      </div>
                      
                      <div className={cn(
                        "text-right md:text-left font-mono font-bold px-2.5 py-2 rounded-lg border md:border-0 md:bg-transparent md:p-0 transition-all",
                        advantage === "home" 
                          ? "text-emerald-300 bg-emerald-500/[0.04] border-emerald-500/20 md:text-emerald-400" 
                          : "text-slate-400 bg-slate-900/25 border-slate-900/60 md:text-slate-500"
                      )}>
                        <span className="text-[8px] text-slate-500 block md:hidden uppercase font-bold mb-0.5 text-right">{game.homeTeam.substring(0, 3)}</span>
                        <span className="leading-relaxed">{homeLabel !== undefined && homeLabel !== null ? String(homeLabel) : "N/A"}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Injury Report Section */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="p-1 bg-rose-500/10 rounded border border-rose-500/20 text-rose-400">
                <AlertTriangle className="w-4 h-4 animate-pulse" />
              </div>
              <h4 className="text-xs font-black text-rose-200 uppercase tracking-widest">Injury Report</h4>
            </div>

            {Array.isArray(prediction?.injuries) && prediction.injuries.length > 0 ? (
              <div className="grid grid-cols-1 gap-2">
                {prediction.injuries.map((injury: any, idx: number) => {
                  const status = (injury.status || 'Unknown').toLowerCase();
                  return (
                    <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-900/40 rounded-lg border border-slate-850 hover:border-rose-500/25 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          "w-1.5 h-8 rounded-full shrink-0",
                          status === 'out' ? "bg-rose-500" : 
                          status === 'doubtful' ? "bg-amber-500" : 
                          status === 'questionable' || status === 'gtd' ? "bg-orange-500" :
                          status === 'probable' ? "bg-indigo-500" :
                          status === 'in' ? "bg-emerald-500" :
                          "bg-slate-700"
                        )} />
                        <div className="flex flex-col min-w-0">
                          <span className="text-slate-200 font-bold text-sm truncate">{injury.player || 'Unknown'}</span>
                          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">{injury.team || 'Unknown'}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border",
                          status === 'out' ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : 
                          status === 'doubtful' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : 
                          status === 'questionable' || status === 'gtd' ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                          status === 'probable' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" :
                          status === 'in' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          "bg-slate-800 text-slate-400 border-slate-700"
                        )}>
                          {injury.status}
                        </span>
                        {injury.impact && (
                          <span className="text-[9px] text-slate-500 mt-1 italic max-w-[150px] truncate">{injury.impact}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : mlbContext?.injuries && (Array.isArray(mlbContext.injuries.home) || Array.isArray(mlbContext.injuries.away)) && 
               ((mlbContext.injuries.home?.length || 0) > 0 || (mlbContext.injuries.away?.length || 0) > 0) ? (
              <div className="space-y-4">
                {/* Home Team Injuries */}
                {(mlbContext.injuries.home?.length || 0) > 0 && (
                  <div>
                    <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">{game.homeTeam} Injuries</h5>
                    <div className="grid grid-cols-1 gap-2">
                      {mlbContext.injuries.home.map((injury: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center p-2 bg-slate-900/30 rounded border border-slate-850">
                          <span className="text-xs font-bold text-slate-200">{injury.player?.name || injury.player || 'Unknown'}</span>
                          <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 font-bold uppercase">{injury.type || injury.status || 'Out'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Away Team Injuries */}
                {(mlbContext.injuries.away?.length || 0) > 0 && (
                  <div>
                    <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">{game.awayTeam} Injuries</h5>
                    <div className="grid grid-cols-1 gap-2">
                      {mlbContext.injuries.away.map((injury: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center p-2 bg-slate-900/30 rounded border border-slate-850">
                          <span className="text-xs font-bold text-slate-200">{injury.player?.name || injury.player || 'Unknown'}</span>
                          <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 font-bold uppercase">{injury.type || injury.status || 'Out'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-500 bg-slate-900/50 p-5 rounded-xl border border-slate-800 text-center italic">
                No active injuries reported. Roster is fully healthy.
              </div>
            )}
          </section>

          {/* Venue & Weather Metadata */}
          <section className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 text-[10px] text-slate-400 font-mono space-y-2">
            <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Date: {game.date}</span>
            <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Time: {game.time}</span>
            <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Venue: {game.location}</span>
            {prediction?.weather && (
              <span className="flex items-center gap-1.5 text-slate-300 bg-slate-950/40 p-2 rounded border border-slate-800/35">
                <Thermometer className="w-3.5 h-3.5 text-amber-500 shrink-0" /> 
                <span>Temp: {prediction.weather.temp}°F | Wind: {prediction.weather.windSpeed} mph {prediction.weather.windDir} ({prediction.weather.condition})</span>
              </span>
            )}
            {prediction?.stadium && (
              <span className="flex items-center gap-1.5 text-slate-300 bg-slate-950/40 p-2 rounded border border-slate-800/35">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> 
                <span>Altitude: {prediction.stadium.elevation}ft (PF: {prediction.stadium.parkFactor.toFixed(2)})</span>
              </span>
            )}
          </section>
        </div>
      )}

      {/* Tab 5: Live Widget */}
      {activeDetailTab === "live" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Provider game widget */}
          {game.apiSportsGameId ? (
            <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <h4 className="text-xs font-black text-slate-350 uppercase tracking-widest flex items-center gap-2 mb-4">
                <Info className="w-4 h-4 text-cyan-400" /> Live Provider details widget
              </h4>
              <div className="min-h-[500px] overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 p-2">
                <ApiSportsWidgetEmbed html={widgetHtml} />
              </div>
            </section>
          ) : (
            <div className="text-xs text-slate-500 bg-slate-900/50 p-4 rounded-xl border border-slate-800 text-center italic">
              Live provider details widget is not active or unconfigured for this game/league.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
