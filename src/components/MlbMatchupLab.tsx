import React, { useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart3, CircleDot, DollarSign, Info, TrendingUp } from "lucide-react";
import { Game, Prediction } from "../types";
import { cn } from "../lib/utils";
import { ApiSportsWidgetEmbed } from "./ApiSportsWidgets";

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

function normalizeText(value?: string | null) {
  return value && value.trim() ? value.trim() : "N/A";
}

function getWinner(match: Prediction["previousMatchups"] extends Array<infer T> ? T : never) {
  if (!match) return "N/A";
  if (Number(match.homeScore) > Number(match.awayScore)) return match.homeTeam;
  if (Number(match.awayScore) > Number(match.homeScore)) return match.awayTeam;
  return "Push";
}

function StarterSummary({ label, team, pitcher }: { label: string; team: string; pitcher?: any }) {
  const isKnown = Boolean(pitcher?.name && pitcher.name !== "TBD" && !String(pitcher.name).toLowerCase().includes("not returned"));

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</div>
          <div className="mt-1 truncate text-sm font-black text-slate-100">{team}</div>
        </div>
        <span className={cn(
          "shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wider",
          isKnown ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-300"
        )}>
          {isKnown ? "Starter found" : "Unconfirmed"}
        </span>
      </div>

      <div className="rounded-xl bg-slate-900/80 p-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Projected starter</div>
        <div className="mt-1 text-base font-black leading-snug text-white">
          {isKnown ? pitcher.name : "Not returned yet"}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          ["ERA", pitcher?.era],
          ["WHIP", pitcher?.whip],
          ["K/9", pitcher?.k9],
          ["Form", pitcher?.recentForm],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-800 bg-slate-900/50 p-2 text-center">
            <div className="text-[9px] font-black uppercase text-slate-500">{label}</div>
            <div className="mt-1 truncate font-mono text-[11px] font-black text-slate-200">{normalizeText(String(value ?? ""))}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="mb-3 flex items-start gap-2">
      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-1.5 text-cyan-300">{icon}</div>
      <div>
        <h4 className="text-[11px] font-black uppercase tracking-widest text-cyan-200">{title}</h4>
        {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{subtitle}</p>}
      </div>
    </div>
  );
}

export function MlbMatchupLab({ game, prediction }: { game: Game; prediction?: Prediction | null }) {
  const [showWidget, setShowWidget] = useState(false);

  const h2h = Array.isArray(prediction?.previousMatchups) ? prediction.previousMatchups : [];
  const pitcherMatchup = (prediction as any)?.pitcherMatchup;
  const homeML = prediction?.marketExpectations?.homeWinProb ?? game.marketExpectations?.homeWinProb;
  const awayML = prediction?.marketExpectations?.awayWinProb ?? game.marketExpectations?.awayWinProb;
  const modelProb = prediction?.winProbability;
  const selectedSideMarket = prediction?.winner === game.awayTeam ? americanOddsToImplied(awayML) : americanOddsToImplied(homeML);
  const edge = typeof modelProb === "number" && typeof selectedSideMarket === "number" ? modelProb - selectedSideMarket : prediction?.matchupDelta;
  const bookCount = Array.isArray(game.allSources) ? game.allSources.length : undefined;

  const h2hSummary = useMemo(() => {
    if (!h2h.length) return null;
    const homeWins = h2h.filter((m) => getWinner(m) === game.homeTeam).length;
    const awayWins = h2h.filter((m) => getWinner(m) === game.awayTeam).length;
    const totals = h2h
      .map((m) => Number(m.homeScore) + Number(m.awayScore))
      .filter((n) => Number.isFinite(n));
    const avgTotal = totals.length ? totals.reduce((sum, n) => sum + n, 0) / totals.length : null;
    return {
      homeWins,
      awayWins,
      avgTotal,
      text: `${game.homeTeam} ${homeWins}-${awayWins} vs ${game.awayTeam}${avgTotal ? `, ${avgTotal.toFixed(1)} average total runs` : ""}.`,
    };
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

  return (
    <div className="mb-5 rounded-2xl border border-cyan-500/15 bg-gradient-to-b from-cyan-500/[0.08] to-slate-950/30 p-4 shadow-lg shadow-cyan-500/5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-cyan-200">
            <TrendingUp className="h-4 w-4" /> MLB Matchup Lab
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Read this first: pitcher status, matchup history, team edge, and market price.
          </p>
        </div>
        {game.apiSportsGameId && (
          <div className="w-fit rounded-full border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
            Game #{game.apiSportsGameId}
          </div>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[9px] font-black uppercase tracking-wider text-slate-500">Pick</div>
          <div className="mt-1 truncate text-sm font-black text-indigo-200">{prediction?.winner || "Pending"}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[9px] font-black uppercase tracking-wider text-slate-500">Model</div>
          <div className="mt-1 font-mono text-sm font-black text-slate-100">{asPercent(modelProb)}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[9px] font-black uppercase tracking-wider text-slate-500">Market</div>
          <div className="mt-1 font-mono text-sm font-black text-slate-100">{asPercent(selectedSideMarket)}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[9px] font-black uppercase tracking-wider text-slate-500">Edge</div>
          <div className={cn("mt-1 font-mono text-sm font-black", (edge || 0) >= 0.035 ? "text-emerald-300" : "text-amber-300")}>
            {edge == null ? "N/A" : `${edge >= 0 ? "+" : ""}${(edge * 100).toFixed(1)}%`}
          </div>
        </div>
      </div>

      <section className="mb-4">
        <SectionHeader
          icon={<CircleDot className="h-3.5 w-3.5" />}
          title="Probable Pitchers"
          subtitle="MLB confidence should stay capped until the starting pitchers are confirmed."
        />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <StarterSummary label="Away" team={game.awayTeam} pitcher={pitcherMatchup?.awayPitcher} />
          <StarterSummary label="Home" team={game.homeTeam} pitcher={pitcherMatchup?.homePitcher} />
        </div>
        <div className="mt-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-100/90">
          <div className="mb-1 flex items-center gap-2 font-black uppercase tracking-wider text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" /> Pitcher note
          </div>
          {pitcherMatchup?.summary || prediction?.matchupAnalysis?.playerStats || "Probable starters were not returned yet. Treat any moneyline edge as preliminary until pitcher context is confirmed."}
        </div>
      </section>

      <section className="mb-4">
        <SectionHeader
          icon={<Activity className="h-3.5 w-3.5" />}
          title="Previous Matchups"
          subtitle={h2hSummary?.text || "No previous matchup sample was returned for this pair yet."}
        />
        {h2h.length > 0 ? (
          <div className="space-y-2">
            {h2h.slice(0, 5).map((match, idx) => (
              <div key={`${match.date}-${idx}`} className="grid grid-cols-[70px_1fr_auto] items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs">
                <div className="font-mono text-[10px] font-bold text-slate-500">{match.date || "N/A"}</div>
                <div className="min-w-0 truncate font-mono font-black text-slate-200">
                  {match.awayTeam} {match.awayScore} - {match.homeScore} {match.homeTeam}
                </div>
                <div className="rounded-full bg-cyan-500/10 px-2 py-1 text-[9px] font-black uppercase text-cyan-300">
                  {getWinner(match)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs leading-relaxed text-slate-400">
            Previous matchup history is unavailable from the current feed. Do not use this as a driver unless H2H data loads.
          </div>
        )}
      </section>

      <section className="mb-4">
        <SectionHeader
          icon={<BarChart3 className="h-3.5 w-3.5" />}
          title="Team Edge"
          subtitle="Only meaningful team profile comparisons are shown here. Provider/audit notes are intentionally hidden."
        />
        {prediction?.teamStatsComparison?.length ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {prediction.teamStatsComparison.slice(0, 6).map((stat, idx) => (
              <div key={`${stat.category}-${idx}`} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="mb-2 text-center text-[10px] font-black uppercase tracking-wider text-slate-500">{stat.category}</div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                  <div className={cn("truncate text-right font-mono font-black", stat.advantage === "away" ? "text-cyan-300" : "text-slate-300")}>{stat.awayValue}</div>
                  <div className="rounded-full bg-slate-900 px-2 py-1 text-[9px] font-black uppercase text-slate-600">vs</div>
                  <div className={cn("truncate font-mono font-black", stat.advantage === "home" ? "text-cyan-300" : "text-slate-300")}>{stat.homeValue}</div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                  <span className="truncate text-right">{game.awayTeam}</span>
                  <span className="truncate">{game.homeTeam}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">Team statistical comparison is not available yet for this game.</div>
        )}
      </section>

      <section className="mb-4">
        <SectionHeader
          icon={<DollarSign className="h-3.5 w-3.5" />}
          title="Market Read"
          subtitle={bookCount ? `Consensus check is using ${bookCount} sportsbook entries.` : "Market source count unavailable."}
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <div className="text-[10px] font-black uppercase text-slate-500">Moneyline</div>
            <div className="mt-2 space-y-1 text-xs text-slate-300">
              <div className="flex justify-between gap-3"><span className="truncate">{game.awayTeam}</span><span className="font-mono font-black text-white">{formatOdds(awayML)}</span></div>
              <div className="flex justify-between gap-3"><span className="truncate">{game.homeTeam}</span><span className="font-mono font-black text-white">{formatOdds(homeML)}</span></div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <div className="text-[10px] font-black uppercase text-slate-500">Selected side</div>
            <div className="mt-2 text-sm font-black text-indigo-200">{prediction?.winner || "Pending"}</div>
            <div className="mt-1 text-xs text-slate-500">Model {asPercent(modelProb)} vs market {asPercent(selectedSideMarket)}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <div className="text-[10px] font-black uppercase text-slate-500">Decision</div>
            <div className={cn("mt-2 text-sm font-black", prediction?.winner === "PASS" ? "text-amber-300" : (edge || 0) >= 0.035 ? "text-emerald-300" : "text-indigo-200")}>
              {prediction?.winner === "PASS" ? "Pass" : (edge || 0) >= 0.035 ? "Playable edge" : "Lean only"}
            </div>
            <div className="mt-1 text-xs text-slate-500">Require confirmed starters for stronger MLB confidence.</div>
          </div>
        </div>
      </section>

      <section>
        <button
          type="button"
          onClick={() => setShowWidget((value) => !value)}
          className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-left transition hover:border-cyan-500/30"
        >
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-300">
            <Info className="h-3.5 w-3.5 text-cyan-300" /> Provider game widget
          </span>
          <span className="text-[10px] font-black uppercase text-cyan-300">{showWidget ? "Hide" : "Show"}</span>
        </button>
        {showWidget && (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70 p-2">
            {widgetHtml ? <ApiSportsWidgetEmbed html={widgetHtml} /> : <div className="p-4 text-xs text-slate-400">Widget needs a matched MLB game ID before it can render.</div>}
          </div>
        )}
      </section>
    </div>
  );
}
