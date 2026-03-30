import React from "react";
import { Game, Prediction } from "../types";
import { Lock, TrendingUp, ArrowRight, Calendar, CalendarDays, Globe, Ticket, ShieldCheck, Brain } from "lucide-react";
import { cn } from "../lib/utils";
import { format, subDays, isAfter, isBefore, parseISO, startOfDay } from "date-fns";

interface LocksOfTheDayProps {
  games: Game[];
  predictions: Record<string, Prediction>;
  selectedDate: Date;
  league?: string; // Optional league filter
  onSelectLeague?: (league: string) => void;
}

export const LocksOfTheDay: React.FC<LocksOfTheDayProps> = ({ games, predictions, selectedDate, league, onSelectLeague }) => {
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  
  // 1. Get all predictions for the selected league for the SELECTED date
  const allLeaguePredictions = Object.values(predictions).filter(p => {
    const pLeague = p.league?.toLowerCase();
    const matchesLeague = !league || pLeague === league.toLowerCase();
    const pDate = p.date ? p.date.split('T')[0] : undefined;
    const matchesDate = pDate === selectedDateStr;
    return matchesLeague && matchesDate;
  });

  // 2. Deduplicate predictions by matchup to prevent duplicate cards
  const uniquePredictionsMap = new Map<string, Prediction>();
  allLeaguePredictions.forEach(p => {
    const normalize = (name: string | undefined) => (name || "").toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const home = normalize(p.homeTeam);
    const away = normalize(p.awayTeam);
    
    if (!home || !away) return;
    
    // Create a stable key regardless of home/away order
    const key = [home, away].sort().join('|');
    
    // Keep the one with higher confidence if duplicates exist
    const existing = uniquePredictionsMap.get(key);
    if (!existing || (p.confidence || 0) > (existing.confidence || 0)) {
      uniquePredictionsMap.set(key, p);
    }
  });

  const uniqueLeaguePredictions = Array.from(uniquePredictionsMap.values());

  // 3. Filter for valid locks (confidence >= 7, not PASS)
  // We use 7 as the threshold for "Locks" as per user preference for high confidence
  const validLocks = uniqueLeaguePredictions.filter(p => 
    p.winner && 
    p.winner.toUpperCase() !== "PASS" && 
    p.confidence >= 7
  );

  // 4. Sort by Confidence (highest first), then by date (soonest first)
  const sortedLocks = [...validLocks].sort((a, b) => {
    if ((b.confidence || 0) !== (a.confidence || 0)) {
      return (b.confidence || 0) - (a.confidence || 0);
    }
    const dateA = a.date ? new Date(a.date).getTime() : Infinity;
    const dateB = b.date ? new Date(b.date).getTime() : Infinity;
    return dateA - dateB;
  });

  // 5. Top 3 Locks for the current league (across all analyzed games)
  const topLocks = sortedLocks.slice(0, 3);

  // 6. Check if analysis is complete for the SELECTED date
  const todaysGames = games.filter(g => {
    const gDate = g.date ? g.date.split('T')[0] : undefined;
    const matchesDate = gDate === selectedDateStr;
    const matchesLeague = !league || (g.league && g.league.toLowerCase() === league.toLowerCase());
    return matchesDate && matchesLeague;
  });

  const todaysPredictions = todaysGames.map(g => {
    if (g.id && predictions[g.id]) return predictions[g.id];
    const normalize = (name: string | undefined) => (name || "").toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const gHome = normalize(g.homeTeam);
    const gAway = normalize(g.awayTeam);
    if (!gHome || !gAway) return null;
    
    return Object.values(predictions).find(p => {
      const pDate = p.date ? p.date.split('T')[0] : undefined;
      if (pDate !== selectedDateStr) return false;
      const pHome = normalize(p.homeTeam);
      const pAway = normalize(p.awayTeam);
      return (pHome === gHome && pAway === gAway) || (pHome === gAway && pAway === gHome);
    });
  }).filter(Boolean);

  const isAnalysisComplete = todaysGames.length > 0 && todaysPredictions.length >= todaysGames.length;

  // 7. Create 3 Winning Slips (Parlays) from top 9 picks for the league
  const slips = [
    sortedLocks.slice(0, 3),
    sortedLocks.slice(3, 6),
    sortedLocks.slice(6, 9)
  ].filter(slip => slip.length === 3);

  // 8. Calculate Running Counts (Overall Lock Record)
  // Group all predictions by date to find the top 3 locks for each day
  const predictionsByDate: Record<string, Prediction[]> = {};
  
  Object.values(predictions).forEach(p => {
    if (!p.date) return;
    
    // Filter by league if provided
    const pLeague = p.league?.toLowerCase();
    const matchesLeague = !league || pLeague === league.toLowerCase();
    if (!matchesLeague) return;

    const dateKey = p.date.split('T')[0];
    if (!predictionsByDate[dateKey]) {
      predictionsByDate[dateKey] = [];
    }
    predictionsByDate[dateKey].push(p);
  });

  let overallLockCorrect = 0;
  let overallLockIncorrect = 0;
  let overallLockPushes = 0;

  Object.values(predictionsByDate).forEach(dayPreds => {
    // Sort by confidence
    const sorted = [...dayPreds].sort((a, b) => b.confidence - a.confidence);
    // Take top 3
    const dayLocks = sorted.slice(0, 3);
    
    dayLocks.forEach(lock => {
      if (lock.outcome === 'correct') overallLockCorrect++;
      else if (lock.outcome === 'incorrect') overallLockIncorrect++;
      else if (lock.outcome === 'push') overallLockPushes++;
    });
  });

  const overallRecord = { correct: overallLockCorrect, incorrect: overallLockIncorrect, pushes: overallLockPushes };

  if (todaysGames.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center flex flex-col items-center justify-center">
          <div className="bg-slate-800/50 p-4 rounded-full mb-4 border border-slate-700">
            <Calendar className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">No Games Scheduled</h3>
          <p className="text-slate-400 max-w-md mx-auto">
            There are no {league || "all leagues"} games scheduled for {format(selectedDate, "MMMM d, yyyy")}.
          </p>
        </div>
      </div>
    );
  }

  if (!isAnalysisComplete) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center flex flex-col items-center justify-center">
          <div className="bg-slate-800/50 p-4 rounded-full mb-4 border border-slate-700">
            <Lock className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Analysis Incomplete</h3>
          <p className="text-slate-400 max-w-md mx-auto mb-4">
            Please analyze all games for {league || "all leagues"} on this date to unlock the Locks of the Day.
          </p>
          <div className="bg-slate-800 px-4 py-2 rounded-lg inline-flex items-center border border-slate-700">
            <span className="text-slate-300 font-medium mr-2">Progress:</span>
            <span className="text-indigo-400 font-bold">{todaysPredictions.length}</span>
            <span className="text-slate-500 mx-1">/</span>
            <span className="text-slate-300 font-bold">{todaysGames.length}</span>
            <span className="text-slate-500 ml-2 text-sm">games analyzed</span>
          </div>
        </div>
      </div>
    );
  }

  if (topLocks.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center flex flex-col items-center justify-center">
          <div className="bg-slate-800/50 p-4 rounded-full mb-4 border border-slate-700">
            <Lock className="w-8 h-8 text-slate-500" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">No Locks Available</h3>
          <p className="text-slate-400 max-w-md mx-auto">
            The AI did not find any high-confidence picks (confidence &ge; 6) or recommended PASS for all games.
          </p>
        </div>
      </div>
    );
  }

  // Helper to get team names and logos
  const getTeams = (p: Prediction) => {
    // Try exact ID match first
    let game = games.find(g => g.id === p.gameId);
    
    // Fallback to team name matching if ID doesn't match
    if (!game) {
      const normalize = (name: string | undefined) => (name || "").toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      const pHome = normalize(p.homeTeam);
      const pAway = normalize(p.awayTeam);
      
      game = games.find(g => {
        const gHome = normalize(g.homeTeam);
        const gAway = normalize(g.awayTeam);
        return (gHome === pHome && gAway === pAway) || (gHome === pAway && gAway === pHome);
      });
    }

    const home = p.homeTeam || game?.homeTeam || "Home";
    const away = p.awayTeam || game?.awayTeam || "Away";
    const homeLogo = game?.homeLogo;
    const awayLogo = game?.awayLogo;
    const winnerLogo = p.winner === home ? homeLogo : (p.winner === away ? awayLogo : undefined);
    return { home, away, homeLogo, awayLogo, winnerLogo };
  };

  const scrollToGame = (gameId: string, gameLeague?: string) => {
    const doScroll = () => {
      const element = document.getElementById(`game-${gameId}`);
      if (element) {
        // Dispatch custom event to expand the card
        window.dispatchEvent(new Event(`expand-game-${gameId}`));
        
        // Add a slight delay to ensure rendering if needed, then scroll
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Optional: Add a brief highlight effect
          element.classList.add('ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-slate-900');
          setTimeout(() => {
            element.classList.remove('ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-slate-900');
          }, 2000);
        }, 100);
      }
    };

    if (gameLeague && league && gameLeague !== league && onSelectLeague) {
      onSelectLeague(gameLeague);
      // Wait for the tab to switch and games to render before scrolling
      setTimeout(doScroll, 500);
    } else {
      doScroll();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 space-y-6">
      
      {/* Running Counts Section */}
      <div className="flex justify-end">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between w-full md:w-1/3">
          <div className="flex items-center text-slate-400">
            <Globe className="w-5 h-5 mr-2 text-indigo-400" />
            <span className="font-medium">Overall Lock Record</span>
          </div>
          <div className="text-lg font-bold">
            <span className="text-emerald-400">{overallRecord.correct}</span>
            <span className="text-slate-600 mx-1">-</span>
            <span className="text-rose-400">{overallRecord.incorrect}</span>
          </div>
        </div>
      </div>

      {/* League Locks of the Day */}
      {topLocks.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-900/40 to-slate-900 border border-emerald-500/30 rounded-xl p-6 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 opacity-10">
            <Lock className="w-32 h-32 text-emerald-400" />
          </div>

          <div className="flex items-center mb-6 relative z-10">
            <div className="bg-emerald-500/20 p-2 rounded-lg mr-3 border border-emerald-500/30">
              <Lock className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{league} Top Locks</h2>
              <p className="text-emerald-400/80 text-sm">Highest confidence picks across all analyzed {league} games</p>
            </div>
          </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
          {topLocks.map((prediction, index) => {
            const { home, away, homeLogo, awayLogo, winnerLogo } = getTeams(prediction);
            return (
              <div 
                key={prediction.gameId} 
                onClick={() => scrollToGame(prediction.gameId, prediction.league)}
                className="bg-slate-900/60 border border-emerald-500/20 rounded-lg p-4 hover:border-emerald-500/40 transition-all group cursor-pointer"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex flex-col">
                    <div className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded w-fit">
                      {prediction.league || "GAME"}
                    </div>
                    {prediction.date && (
                      <div className="text-[10px] text-slate-500 mt-1">
                        {format(new Date(prediction.date), "MMM d")}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center text-emerald-400 font-bold text-sm">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    {prediction.confidence}/10
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {awayLogo && <img src={awayLogo} alt={away} className="w-6 h-6 object-contain" referrerPolicy="no-referrer" />}
                      <span className={cn("text-xs font-bold", prediction.winner === away ? "text-white" : "text-slate-500")}>
                        {away}
                      </span>
                    </div>
                    {prediction.winner === away && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {homeLogo && <img src={homeLogo} alt={home} className="w-6 h-6 object-contain" referrerPolicy="no-referrer" />}
                      <span className={cn("text-xs font-bold", prediction.winner === home ? "text-white" : "text-slate-500")}>
                        {home}
                      </span>
                    </div>
                    {prediction.winner === home && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />}
                  </div>
                </div>

                <div className="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-emerald-400/60 uppercase font-bold tracking-tighter mb-0.5">Recommended Pick</div>
                      <div className="text-white font-bold text-sm flex items-center">
                        {winnerLogo && <img src={winnerLogo} alt={prediction.winner} className="w-4 h-4 mr-1.5 object-contain" referrerPolicy="no-referrer" />}
                        {prediction.winner}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-emerald-500 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1" />
                  </div>
                </div>
                
                {prediction.scorePrediction && (
                   <div className="text-xs text-slate-400 font-mono text-center">
                      Proj: {prediction.scorePrediction.away} - {prediction.scorePrediction.home}
                   </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Winning Slips */}
      {slips.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-900/40 to-slate-900 border border-indigo-500/30 rounded-xl p-6 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 opacity-10">
            <Ticket className="w-32 h-32 text-indigo-400" />
          </div>

          <div className="flex items-center mb-6 relative z-10">
            <div className="bg-indigo-500/20 p-2 rounded-lg mr-3 border border-indigo-500/30">
              <Ticket className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Winning Slips</h2>
              <p className="text-indigo-400/80 text-sm">3-team parlays built from today's highest probability picks</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
            {slips.map((slip, slipIndex) => {
              const avgConfidence = (slip.reduce((acc, p) => acc + p.confidence, 0) / 3).toFixed(1);
              return (
                <div key={slipIndex} className="bg-slate-900/60 border border-indigo-500/20 rounded-lg p-4 hover:border-indigo-500/40 transition-all">
                  <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800">
                    <h3 className="font-bold text-white">Slip #{slipIndex + 1}</h3>
                    <div className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20">
                      Avg Conf: {avgConfidence}
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {slip.map((p, i) => {
                      const { home, away, winnerLogo } = getTeams(p);
                      return (
                        <div 
                          key={i} 
                          onClick={() => scrollToGame(p.gameId, p.league)}
                          className="flex items-center justify-between cursor-pointer hover:bg-slate-800/50 p-1 -mx-1 rounded transition-colors"
                        >
                          <div className="flex items-center">
                            <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400 mr-2">
                              {i + 1}
                            </div>
                            <div className="text-sm text-slate-300 flex items-center">
                              {winnerLogo && <img src={winnerLogo} alt={p.winner} className="w-4 h-4 mr-2 object-contain" referrerPolicy="no-referrer" />}
                              {p.winner} <span className="text-slate-500 text-xs ml-1">({p.league})</span>
                            </div>
                          </div>
                          <div className="text-xs text-emerald-400 font-bold">
                            {p.confidence}/10
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
