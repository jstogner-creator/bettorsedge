import React, { useMemo, useState } from "react";
import { Activity, BarChart3, CircleDot, DollarSign, Info, TrendingUp } from "lucide-react";
import { Game, Prediction } from "../types";
import { cn } from "../lib/utils";
import { ApiSportsWidgetEmbed } from "./ApiSportsWidgets";

type TabKey = "pitchers" | "history" | "teamStats" | "market" | "liveData";

const WIDGET_KEY = "b2795a8c744b26f971aaf15eb994212e";

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

function getWinner(match: Prediction["previousMatchups"] extends Array<infer T> ? T : never) {
  if (!match) return "N/A";
  if (match.homeScore > match.awayScore) return match.homeTeam;
  if (match.awayScore > match.homeScore) return match.awayTeam;
  return "Push";
}

function PitcherCard({ label, team, pitcher }: { label: string; team: string; pitcher?: any }) {
  const isKnown = pitcher?.name && pitcher.name !== "TBD";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
          <div className="text-sm font-black text-white">{team}</div>
        </div>
        <div className={cn(
          "rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wider",
          isKnown ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-amber-500/20 bg-amber-500/10 text-amber-400"
        )}>
          {isKnown ? "Confirmed Feed" : "Not Confirmed"}
        </div>
      </div>
      <div className="text-lg font-black text-indigo-300">{pitcher?.name || "Probable starter not returned"}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg bg-slate-900/80 p-2">
          <div className="text-[9px] font-bold uppercase text-slate-500">ERA</div>
          <div className="font-mono font-black text-slate-200">{pitcher?.era ?? "N/A"}</div>
        </div>
        <div className="rounded-lg bg-slate-900/80 p-2">
          <div className="text-[9px] font-bold uppercase text-slate-500">WHIP</div>
          <div className="font-mono font-black text-slate-200">{pitcher?.whip ?? "N/A"}</div>
        </div>
        <div className="rounded-lg bg-slate-900/80 p-2">
          <div className="text-[9px] font-bold uppercase text-slate-500">K/9</div>
          <div className="font-mono font-black text-slate-200">{pitcher?.k9 ?? "N/A"}</div>
        </div>
        <div className="rounded-lg bg-slate-900/80 p-2">
          <div className="text-[9px] font-bold uppercase text-slate-500">Recent</div>
          <div className="font-mono font-black text-slate-200">{pitcher?.recentForm || "N/A"}</div>
        </div>
      </div>
    </div>
  );
}

export function MlbMatchupLab({ game, prediction }: { game: Game; prediction?: Prediction | null }) {
  const [activeTab, setActiveTab] = useState<TabKey>("pitchers");

  const h2h = Array.isArray(prediction?.previousMatchups) ? prediction.previousMatchups : [];
  const pitcherMatchup = prediction?.pitcherMatchup;
  const homeML = prediction?.marketExpectations?.homeWinProb ?? game.marketExpectations?.homeWinProb;
  const awayML = prediction?.marketExpectations?.awayWinProb ?? game.marketExpectations?.awayWinProb;
  const modelProb = prediction?.winProbability;
  const marketProb = prediction?.winner === game.awayTeam ? americanOddsToImplied(awayML) : americanOddsToImplied(homeML);
  const edge = typeof modelProb === "number" && typeof marketProb === "number" ? modelProb - marketProb : prediction?.matchupDelta;

  const h2hSummary = useMemo(() => {
    if (!h2h.length) return null;
    const homeWins = h2h.filter((m) => getWinner(m) === game.homeTeam).length;
    const awayWins = h2h.filter((m) => getWinner(m) === game.awayTeam).length;
    const totals = h2h
      .map((m) => Number(m.homeScore) + Number(m.awayScore))
      .filter((n) => Number.isFinite(n));
    const avgTotal = totals.length ? totals.reduce((sum, n) => sum + n, 0) / totals.length : null;
    return `${game.homeTeam} ${homeWins}-${awayWins} vs ${game.awayTeam} in the returned sample${avgTotal ? `; average total ${avgTotal.toFixed(1)} runs` : ""}.`;
  }, [h2h, game.homeTeam, game.awayTeam]);

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

  const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: "pitchers", label: "Pitchers", icon: <CircleDot className="h-3.5 w-3.5" /> },
    { key: "history", label: "Previous Matchups", icon: <Activity className="h-3.5 w-3.5" /> },
    { key: "teamStats", label: "Team Stats", icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { key: "market", label: "Market", icon: <DollarSign className="h-3.5 w-3.5" /> },
    { key: "liveData", label: "Widget", icon: <Info className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="mb-4 rounded-xl border border-cyan-500/10 bg-cyan-500/[0.03] p-4 shadow-lg shadow-cyan-500/5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-cyan-300">
            <TrendingUp className="h-4 w-4" /> MLB Matchup Lab
          </h4>
          <p className="mt-1 text-xs text-slate-400">Pitching context, previous meetings, team profile, market edge, and provider widget view.</p>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {game.apiSportsGameId ? `Game ID ${game.apiSportsGameId}` : "No game widget ID"}
        </div>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all",
              activeTab === tab.key ? "bg-cyan-500/20 text-cyan-200" : "text-slate-500 hover:bg-slate-800 hover:text-slate-200"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "pitchers" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <PitcherCard label="Away Starter" team={game.awayTeam} pitcher={pitcherMatchup?.awayPitcher} />
            <PitcherCard label="Home Starter" team={game.homeTeam} pitcher={pitcherMatchup?.homePitcher} />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs leading-relaxed text-slate-300">
            {pitcherMatchup?.summary || prediction?.matchupAnalysis?.playerStats || "Probable starters were not returned by the provider yet. Treat the moneyline read as capped until the starter matchup is confirmed."}
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
            {h2hSummary || prediction?.matchupAnalysis?.h2h || "Previous matchup history was not returned for this pair yet."}
          </div>
          {h2h.length > 0 ? (
            <div className="space-y-2">
              {h2h.slice(0, 6).map((match, idx) => (
                <div key={`${match.date}-${idx}`} className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[10px] font-bold uppercase text-slate-500">{match.date || "Date N/A"}</div>
                  <div className="font-mono text-xs font-black text-slate-200">
                    {match.awayTeam} {match.awayScore} - {match.homeScore} {match.homeTeam}
                  </div>
                  <div className="text-[10px] font-black uppercase text-cyan-300">Winner: {getWinner(match)}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {activeTab === "teamStats" && (
        <div className="space-y-3">
          {prediction?.teamStatsComparison?.length ? (
            prediction.teamStatsComparison.slice(0, 8).map((stat, idx) => (
              <div key={`${stat.category}-${idx}`} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <span>{game.awayTeam}</span>
                  <span className="text-slate-300">{stat.category}</span>
                  <span>{game.homeTeam}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className={cn("font-mono font-black", stat.advantage === "away" ? "text-cyan-300" : "text-slate-300")}>{stat.awayValue}</span>
                  <span className="text-[9px] font-black uppercase text-slate-600">vs</span>
                  <span className={cn("font-mono font-black", stat.advantage === "home" ? "text-cyan-300" : "text-slate-300")}>{stat.homeValue}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400">Team statistical comparison is not available yet for this game.</div>
          )}
        </div>
      )}

      {activeTab === "market" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Moneyline</div>
            <div className="mt-2 text-xs text-slate-300">{game.awayTeam}: <span className="font-mono font-black text-white">{formatOdds(awayML)}</span></div>
            <div className="mt-1 text-xs text-slate-300">{game.homeTeam}: <span className="font-mono font-black text-white">{formatOdds(homeML)}</span></div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Model vs Market</div>
            <div className="mt-2 text-xs text-slate-300">Model: <span className="font-mono font-black text-white">{asPercent(modelProb)}</span></div>
            <div className="mt-1 text-xs text-slate-300">Market: <span className="font-mono font-black text-white">{asPercent(marketProb)}</span></div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Edge / Discipline</div>
            <div className={cn("mt-2 font-mono text-lg font-black", (edge || 0) >= 0.035 ? "text-emerald-400" : "text-amber-400")}>
              {edge == null ? "N/A" : `${edge >= 0 ? "+" : ""}${(edge * 100).toFixed(1)}%`}
            </div>
            <div className="mt-1 text-[10px] text-slate-500">{prediction?.winner === "PASS" ? "Pass unless the market improves or pitcher context confirms edge." : "Actionable only if price holds."}</div>
          </div>
        </div>
      )}

      {activeTab === "liveData" && (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70 p-2">
          {widgetHtml ? (
            <ApiSportsWidgetEmbed html={widgetHtml} />
          ) : (
            <div className="p-4 text-xs text-slate-400">API-Sports widget needs a matched MLB game ID before it can render.</div>
          )}
        </div>
      )}
    </div>
  );
}
