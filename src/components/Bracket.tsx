import React, { useState } from "react";
import { TournamentBracket, BracketRound } from "../types";
import { Trophy, ChevronLeft, ChevronRight, Calendar, Info } from "lucide-react";
import { cn } from "../lib/utils";

interface BracketProps {
  bracket: TournamentBracket;
}

export const Bracket: React.FC<BracketProps> = ({ bracket }) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      <div className="bg-slate-800/50 p-6 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500/20 p-2 rounded-lg border border-amber-500/30">
            <Trophy className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">March Madness Bracket</h2>
            <p className="text-slate-400 text-sm">{bracket.year} NCAA Men's Basketball Tournament Progression</p>
          </div>
        </div>
      </div>

      <div className="p-6 overflow-x-auto no-scrollbar">
        <div className="flex gap-8 min-w-max pb-4">
          {bracket.rounds?.map((round, roundIdx) => (
            <div key={round.name} className="flex flex-col gap-6 w-[280px]">
              <div className="text-center py-2 bg-slate-800/50 rounded-lg border border-slate-700 mb-2">
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">{round.name}</span>
              </div>
              
              <div className={cn(
                "flex flex-col justify-around h-full gap-4",
                roundIdx > 0 && "pt-4"
              )}>
                {round.games?.map((game) => {
                  const isUpset = (game.winner === game.awayTeam && (game.awaySeed || 0) > (game.homeSeed || 0)) ||
                                 (game.winner === game.homeTeam && (game.homeSeed || 0) > (game.awaySeed || 0));

                  return (
                    <div 
                      key={game.id} 
                      className={cn(
                        "bg-slate-800/30 border rounded-lg p-3 transition-all group relative",
                        isUpset ? "border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.1)]" : "border-slate-700 hover:border-indigo-500/30"
                      )}
                    >
                      {isUpset && (
                        <div className="absolute -top-2 -right-2 bg-amber-500 text-slate-900 text-[8px] font-black px-1.5 py-0.5 rounded shadow-lg z-10 flex items-center gap-1">
                          <Trophy className="w-2 h-2" />
                          UPSET
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mb-2 text-[9px] text-slate-500 font-mono uppercase tracking-wider">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-2.5 h-2.5" />
                        {game.date}
                      </div>
                      <div className={cn(
                        "px-1 py-0.5 rounded",
                        game.status === 'live' ? "bg-red-500/20 text-red-400 animate-pulse" :
                        game.status === 'finished' ? "bg-slate-700 text-slate-400" : "bg-indigo-500/10 text-indigo-400"
                      )}>
                        {game.status}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {/* Away Team */}
                      <div className={cn(
                        "flex items-center justify-between p-1.5 rounded transition-colors",
                        game.winner === game.awayTeam ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-slate-900/50"
                      )}>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-slate-500 w-3">{game.awaySeed}</span>
                          <span className={cn(
                            "text-xs font-bold truncate max-w-[100px]",
                            game.winner === game.awayTeam ? "text-white" : "text-slate-400"
                          )}>
                            {game.awayTeam}
                          </span>
                        </div>
                        <span className={cn(
                          "text-xs font-mono font-bold",
                          game.winner === game.awayTeam ? "text-emerald-400" : "text-slate-500"
                        )}>
                          {game.awayScore ?? '-'}
                        </span>
                      </div>

                      {/* Home Team */}
                      <div className={cn(
                        "flex items-center justify-between p-1.5 rounded transition-colors",
                        game.winner === game.homeTeam ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-slate-900/50"
                      )}>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-slate-500 w-3">{game.homeSeed}</span>
                          <span className={cn(
                            "text-xs font-bold truncate max-w-[100px]",
                            game.winner === game.homeTeam ? "text-white" : "text-slate-400"
                          )}>
                            {game.homeTeam}
                          </span>
                        </div>
                        <span className={cn(
                          "text-xs font-mono font-bold",
                          game.winner === game.homeTeam ? "text-emerald-400" : "text-slate-500"
                        )}>
                          {game.homeScore ?? '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="bg-slate-800/30 p-4 border-t border-slate-700 flex items-center gap-2 text-xs text-slate-500">
        <Info className="w-4 h-4 text-indigo-400" />
        Bracket data is updated every 4 hours. Last updated: {new Date(bracket.lastUpdated).toLocaleString()}
      </div>
    </div>
  );
};
