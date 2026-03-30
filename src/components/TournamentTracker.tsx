import React from "react";
import { TournamentBracket } from "../types";
import { Activity, TrendingUp, Target, AlertCircle, Zap } from "lucide-react";
import { cn } from "../lib/utils";

interface TournamentTrackerProps {
  bracket: TournamentBracket;
}

export const TournamentTracker: React.FC<TournamentTrackerProps> = ({ bracket }) => {
  // Calculate some stats
  const totalGames = bracket.rounds?.reduce((acc, r) => acc + (r.games?.length || 0), 0) || 0;
  const finishedGames = bracket.rounds?.reduce((acc, r) => acc + (r.games?.filter(g => g.status === 'finished').length || 0), 0) || 0;
  const liveGames = bracket.rounds?.reduce((acc, r) => acc + (r.games?.filter(g => g.status === 'live').length || 0), 0) || 0;
  const progress = totalGames > 0 ? (finishedGames / totalGames) * 100 : 0;

  // Find upsets (lower seed beat higher seed)
  const upsets = bracket.rounds?.flatMap(r => r.games?.filter(g => {
    if (g.status !== 'finished' || !g.winner) return false;
    const homeSeed = g.homeSeed || 0;
    const awaySeed = g.awaySeed || 0;
    if (g.winner === g.homeTeam) return homeSeed > awaySeed;
    if (g.winner === g.awayTeam) return awaySeed > homeSeed;
    return false;
  }) || []) || [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Progress Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="bg-indigo-500/20 p-2 rounded-lg border border-indigo-500/30">
            <Activity className="w-5 h-5 text-indigo-400" />
          </div>
          <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">Tournament Progress</span>
        </div>
        <div className="flex items-end justify-between mb-2">
          <div className="text-2xl font-black text-white">{progress.toFixed(0)}%</div>
          <div className="text-xs text-slate-400">{finishedGames} / {totalGames} Games</div>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div 
            className="bg-indigo-500 h-1.5 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Live Games Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="bg-red-500/20 p-2 rounded-lg border border-red-500/30">
            <Zap className={cn("w-5 h-5 text-red-400", liveGames > 0 && "animate-pulse")} />
          </div>
          <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">Live Action</span>
        </div>
        <div className="text-2xl font-black text-white">{liveGames}</div>
        <div className="text-xs text-slate-400 mt-1">Games currently in progress</div>
      </div>

      {/* Upsets Card */}
      <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-5 shadow-[0_0_20px_rgba(245,158,11,0.05)]">
        <div className="flex items-center justify-between mb-4">
          <div className="bg-amber-500/20 p-2 rounded-lg border border-amber-500/30">
            <TrendingUp className="w-5 h-5 text-amber-400" />
          </div>
          <span className="text-xs font-mono text-amber-500/70 uppercase tracking-wider">Upset Tracker</span>
        </div>
        <div className="text-2xl font-black text-amber-500">{upsets.length}</div>
        <div className="text-xs text-slate-400 mt-1">Lower seeds advancing</div>
      </div>

      {/* Next Big Game Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="bg-emerald-500/20 p-2 rounded-lg border border-emerald-500/30">
            <Target className="w-5 h-5 text-emerald-400" />
          </div>
          <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">Next High Stakes</span>
        </div>
        {bracket.rounds.find(r => r.games.some(g => g.status === 'scheduled'))?.games.find(g => g.status === 'scheduled') ? (
          <div className="text-sm font-bold text-white truncate">
            {bracket.rounds.find(r => r.games.some(g => g.status === 'scheduled'))?.games.find(g => g.status === 'scheduled')?.awayTeam} @ {bracket.rounds.find(r => r.games.some(g => g.status === 'scheduled'))?.games.find(g => g.status === 'scheduled')?.homeTeam}
          </div>
        ) : (
          <div className="text-sm font-bold text-slate-500">No scheduled games</div>
        )}
        <div className="text-xs text-slate-400 mt-1">Upcoming matchup</div>
      </div>

      {/* Recent Key Results / Highlights */}
      <div className="col-span-1 md:col-span-2 lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-indigo-400" />
              <h3 className="font-bold text-white">Recent Key Results</h3>
            </div>
            
            <div className="space-y-3">
              {bracket.rounds.flatMap(r => r.games)
                .filter(g => g.status === 'finished')
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 4)
                .map(game => (
                  <div key={game.id} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-500 font-mono uppercase">{game.date}</span>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-sm font-bold", game.winner === game.awayTeam ? "text-emerald-400" : "text-slate-300")}>
                          ({game.awaySeed}) {game.awayTeam}
                        </span>
                        <span className="text-slate-600 font-bold">@</span>
                        <span className={cn("text-sm font-bold", game.winner === game.homeTeam ? "text-emerald-400" : "text-slate-300")}>
                          ({game.homeSeed}) {game.homeTeam}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm font-mono font-bold text-white">
                      {game.awayScore} - {game.homeScore}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-white">Upset Highlights</h3>
            </div>
            
            <div className="space-y-3">
              {bracket.rounds.flatMap(r => r.games)
                .filter(g => {
                  if (g.status !== 'finished' || !g.winner) return false;
                  const homeSeed = g.homeSeed || 0;
                  const awaySeed = g.awaySeed || 0;
                  if (g.winner === g.homeTeam) return homeSeed > awaySeed;
                  if (g.winner === g.awayTeam) return awaySeed > homeSeed;
                  return false;
                })
                .sort((a, b) => {
                  const aDiff = Math.abs((a.homeSeed || 0) - (a.awaySeed || 0));
                  const bDiff = Math.abs((b.homeSeed || 0) - (b.awaySeed || 0));
                  return bDiff - aDiff;
                })
                .slice(0, 4)
                .map(game => (
                  <div key={game.id} className="flex items-center justify-between p-3 bg-amber-500/5 rounded-lg border border-amber-500/20">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1 mb-1">
                        <Zap className="w-3 h-3 text-amber-500" />
                        <span className="text-[10px] text-amber-500 font-black uppercase tracking-tighter">Upset Alert</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn("text-sm font-bold", game.winner === game.awayTeam ? "text-amber-400" : "text-slate-300")}>
                          ({game.awaySeed}) {game.awayTeam}
                        </span>
                        <span className="text-slate-600 font-bold">vs</span>
                        <span className={cn("text-sm font-bold", game.winner === game.homeTeam ? "text-amber-400" : "text-slate-300")}>
                          ({game.homeSeed}) {game.homeTeam}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm font-mono font-bold text-amber-400">
                      {game.awayScore} - {game.homeScore}
                    </div>
                  </div>
                ))}
              {upsets.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 bg-slate-800/20 rounded-lg border border-dashed border-slate-700">
                  <AlertCircle className="w-8 h-8 text-slate-600 mb-2" />
                  <p className="text-slate-500 text-xs">No major upsets recorded yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
