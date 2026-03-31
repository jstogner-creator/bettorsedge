import React, { useState } from "react";
import { Calendar, MapPin, Clock, ChevronDown, ChevronUp, AlertTriangle, TrendingUp, Shield, Brain, CheckCircle, Star, Info, Activity, RefreshCw, Zap, ShieldCheck, CheckCircle2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Game, Prediction, Bet } from "../types";
import { cn } from "../lib/utils";
import { BetSimulator } from "./BetSimulator";
import { DollarSign } from "lucide-react";

interface GameCardProps {
  game: Game;
  prediction?: Prediction | null;
  isAnalyzing?: boolean;
  onReanalyze?: (game: Game) => void;
  onDiscuss?: () => void;
  onLogBet?: (bet: Omit<Bet, 'id' | 'userId' | 'createdAt' | 'status'>) => void;
}

export const GameCard: React.FC<GameCardProps> = ({ 
  game, 
  prediction, 
  isAnalyzing, 
  onReanalyze, 
  onDiscuss,
  onLogBet
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  React.useEffect(() => {
    const handleExpand = () => setIsExpanded(true);
    window.addEventListener(`expand-game-${game.id}`, handleExpand);
    return () => window.removeEventListener(`expand-game-${game.id}`, handleExpand);
  }, [game.id]);

  // Determine favorite based on Kalshi odds
  // Kalshi prices are typically 0-100 (cents) or 0-1 (probability)
  // We'll normalize to 0-1 for internal logic
  const yesProb = game.kalshiOdds ? (game.kalshiOdds.yes > 1 ? game.kalshiOdds.yes / 100 : game.kalshiOdds.yes) : null;
  const noProb = game.kalshiOdds ? (game.kalshiOdds.no > 1 ? game.kalshiOdds.no / 100 : game.kalshiOdds.no) : null;

  const isHomeFav = yesProb !== null ? yesProb > 0.5 : false;
  const isAwayFav = yesProb !== null ? yesProb < 0.5 : false;
  const favPercentage = yesProb !== null && noProb !== null
    ? Math.max(yesProb, noProb) * 100 
    : yesProb !== null ? (isHomeFav ? yesProb * 100 : (1 - yesProb) * 100) : null;

  // AI Prediction Indicators
  const isAIPredictedHome = React.useMemo(() => {
    if (!prediction?.winner || prediction.winner === "PASS" || prediction.winner === "TBD") return false;
    const normalize = (name: string) => name?.toLowerCase().replace(/[^a-z0-9]/g, '').trim() || "";
    const winner = normalize(prediction.winner);
    const home = normalize(game.homeTeam);
    return winner === home || (winner.length > 3 && home.length > 3 && (winner.includes(home) || home.includes(winner)));
  }, [prediction?.winner, game.homeTeam]);

  const isAIPredictedAway = React.useMemo(() => {
    if (!prediction?.winner || prediction.winner === "PASS" || prediction.winner === "TBD") return false;
    const normalize = (name: string) => name?.toLowerCase().replace(/[^a-z0-9]/g, '').trim() || "";
    const winner = normalize(prediction.winner);
    const away = normalize(game.awayTeam);
    return winner === away || (winner.length > 3 && away.length > 3 && (winner.includes(away) || away.includes(winner)));
  }, [prediction?.winner, game.awayTeam]);

  // Format date nicely: "Wed, Mar 4, 2026"
  const formattedDate = React.useMemo(() => {
    try {
      return format(parseISO(game.date), "EEE, MMM do, yyyy");
    } catch (e) {
      return game.date;
    }
  }, [game.date]);

  // Parse Kalshi Market Title to find which team YES refers to
  const { homeOdds, awayOdds } = React.useMemo(() => {
    let home = null;
    let away = null;
    
    if (game.kalshiOdds && game.kalshiMarketTitle) {
      const title = game.kalshiMarketTitle;
      const yesProb = game.kalshiOdds.yes > 1 ? game.kalshiOdds.yes / 100 : game.kalshiOdds.yes;
      const noProb = game.kalshiOdds.no > 1 ? game.kalshiOdds.no / 100 : game.kalshiOdds.no;
      
      // Extract keywords (words > 2 chars)
      const getKeywords = (name: string) => (name && typeof name === 'string') ? name.split(" ").filter(w => w.length > 2) : [];
      const homeKeywords = getKeywords(game.homeTeam);
      const awayKeywords = getKeywords(game.awayTeam);
      
      const hasHome = homeKeywords.some(k => title.includes(k));
      const hasAway = awayKeywords.some(k => title.includes(k));
      
      if (hasHome && !hasAway) {
        home = yesProb;
        away = noProb;
      } else if (hasAway && !hasHome) {
        away = yesProb;
        home = noProb;
      } else {
        // Try regex for "Team to win?"
        const match = title.match(/^(.*?)\s+to\s+win/i) || title.match(/Will\s+(?:the\s+)?(.*?)\s+win/i);
        if (match && match[1]) {
          const matchedTeam = match[1].trim();
          const isHomeMatch = homeKeywords.some(k => matchedTeam.includes(k));
          if (isHomeMatch) {
            home = yesProb;
            away = noProb;
          } else {
            away = yesProb;
            home = noProb;
          }
        }
      }
    }
    
    return { homeOdds: home, awayOdds: away };
  }, [game.kalshiMarketTitle, game.kalshiOdds, game.homeTeam, game.awayTeam]);

  const hasInjuries = Array.isArray(prediction?.injuries) && prediction.injuries.length > 0;
  
  // Calculate Edge / EV
  const edge = React.useMemo(() => {
    if (!prediction?.winProbability || yesProb === null) return null;
    
    // Determine which side the AI is on
    const isHome = prediction.winner === game.homeTeam;
    const marketProb = isHome ? yesProb : (1 - yesProb);
    const aiProb = prediction.winProbability;
    
    return aiProb - marketProb;
  }, [prediction, yesProb, game.homeTeam]);

  console.log(`[GameCard] ${game.awayTeam} @ ${game.homeTeam} - Has injuries: ${hasInjuries}, Edge: ${edge}`);

  const getImpliedProbability = (odds: number | undefined) => {
    if (!odds) return null;
    if (odds > 0) {
      return (100 / (odds + 100)) * 100;
    } else {
      const absOdds = Math.abs(odds);
      return (absOdds / (absOdds + 100)) * 100;
    }
  };

  const awayML = prediction?.marketOdds?.awayML || game.marketOdds?.awayML;
  const homeML = prediction?.marketOdds?.homeML || game.marketOdds?.homeML;
  const awayImplied = getImpliedProbability(awayML);
  const homeImplied = getImpliedProbability(homeML);

  const awayValue = prediction && awayImplied && isAIPredictedAway && (prediction.winProbability * 100) > awayImplied;
  const homeValue = prediction && homeImplied && isAIPredictedHome && (prediction.winProbability * 100) > homeImplied;

  return (
    <div 
      id={`game-${game.id}`}
      className={cn(
      "bg-slate-900 border rounded-xl overflow-hidden transition-all duration-300 shadow-lg group relative",
      isAnalyzing 
        ? "border-indigo-500 shadow-indigo-500/20 ring-1 ring-indigo-500/50" 
        : "border-slate-800 hover:border-indigo-500/50 hover:shadow-indigo-500/10"
    )}>
      {isAnalyzing && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-shimmer" style={{ backgroundSize: "200% 100%" }} />
      )}
      
      {/* Header - Always Visible */}
      <div 
        className="cursor-pointer hover:bg-slate-800/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="p-3 sm:p-4 border-b border-slate-800/50 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-900/50 gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border border-slate-700/50">
              {game.league}
            </span>
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border",
              game.status === 'live' 
                ? "bg-red-500/10 text-red-400 border-red-500/20 animate-pulse" 
                : "bg-slate-800 text-slate-500 border-slate-700/50"
            )}>
              {game.status}
            </span>
            {hasInjuries && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border bg-amber-500/10 text-amber-500 border-amber-500/20 flex items-center">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {prediction?.injuries?.length} Injuries
              </span>
            )}
            {edge !== null && edge > 0.05 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 flex items-center animate-pulse">
                <Zap className="w-3 h-3 mr-1" />
                +{(edge * 100).toFixed(0)}% Edge
              </span>
            )}
            {prediction?.qaStatus === 'flagged' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border bg-rose-500/10 text-rose-400 border-rose-500/20 flex items-center">
                <AlertTriangle className="w-3 h-3 mr-1" />
                QA Flagged
              </span>
            )}
            {prediction?.qaStatus === 'corrected' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border bg-indigo-500/10 text-indigo-400 border-indigo-500/20 flex items-center">
                <ShieldCheck className="w-3 h-3 mr-1" />
                QA Corrected
              </span>
            )}
            {prediction?.sourceAudit?.sportradarInjuriesUsed && prediction?.sourceAudit?.sportradarSummaryUsed && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 flex items-center">
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Sportradar Verified
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2 text-slate-500 text-[10px] font-mono w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-slate-800/50 pt-2 sm:pt-0 overflow-hidden">
            <div className="flex items-center truncate">
              <Calendar className="w-3 h-3 mr-1 opacity-50 flex-shrink-0" />
              <span className="truncate">{formattedDate}</span>
            </div>
            <div className="flex items-center flex-shrink-0">
              <Clock className="w-3 h-3 mr-1 opacity-50 flex-shrink-0" />
              <span>{game.time}</span>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* Away Team Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center p-1 border border-slate-700/50">
                {game.awayLogo ? (
                  <img src={game.awayLogo} alt={game.awayTeam} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="text-slate-600 font-bold text-xs">{game.awayTeam.substring(0, 2)}</div>
                )}
              </div>
              <div>
                <div className="flex items-center overflow-hidden">
                  <h3 className={cn(
                    "text-base font-bold transition-colors truncate",
                    isAIPredictedAway ? "text-indigo-400" : "text-white"
                  )}>
                    {game.awayTeam}
                  </h3>
                  {isAIPredictedAway && (
                    <div className="flex items-center ml-2 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                      <Brain className="w-3 h-3 text-indigo-400 mr-1" />
                      <span className="text-[8px] font-black text-indigo-400 uppercase tracking-tighter">AI PICK</span>
                    </div>
                  )}
                </div>
                {game.awayTeamStats && (
                  <div className="text-[10px] text-slate-500 font-mono flex items-center mt-0.5 gap-2">
                    <span className="bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-700/30 text-slate-400 font-bold">{game.awayTeamStats.record}</span>
                    <span className="text-slate-500">Last 5: <span className="text-slate-400 font-bold">{game.awayTeamStats.last5}</span></span>
                    {game.awayTeamStats.ats && <span className="text-slate-500">ATS: <span className="text-slate-400 font-bold">{game.awayTeamStats.ats}</span></span>}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {game.status === 'finished' && (
                <span className="text-xl font-black text-white font-mono">{game.awayScore}</span>
              )}
              {awayOdds !== null && (
                <div className={cn(
                  "px-2 py-1 rounded border min-w-[50px] text-center",
                  isAwayFav ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-500" : "bg-slate-800/50 border-slate-700/50 text-slate-400"
                )}>
                  <span className="text-xs font-mono font-bold">{(awayOdds * 100).toFixed(0)}¢</span>
                </div>
              )}
            </div>
          </div>

          {/* Home Team Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center p-1 border border-slate-700/50">
                {game.homeLogo ? (
                  <img src={game.homeLogo} alt={game.homeTeam} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="text-slate-600 font-bold text-xs">{game.homeTeam.substring(0, 2)}</div>
                )}
              </div>
              <div>
                <div className="flex items-center overflow-hidden">
                  <h3 className={cn(
                    "text-base font-bold transition-colors truncate",
                    isAIPredictedHome ? "text-indigo-400" : "text-white"
                  )}>
                    {game.homeTeam}
                  </h3>
                  {isAIPredictedHome && (
                    <div className="flex items-center ml-2 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                      <Brain className="w-3 h-3 text-indigo-400 mr-1" />
                      <span className="text-[8px] font-black text-indigo-400 uppercase tracking-tighter">AI PICK</span>
                    </div>
                  )}
                </div>
                {game.homeTeamStats && (
                  <div className="text-[10px] text-slate-500 font-mono flex items-center mt-0.5 gap-2">
                    <span className="bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-700/30 text-slate-400 font-bold">{game.homeTeamStats.record}</span>
                    <span className="text-slate-500">Last 5: <span className="text-slate-400 font-bold">{game.homeTeamStats.last5}</span></span>
                    {game.homeTeamStats.ats && <span className="text-slate-500">ATS: <span className="text-slate-400 font-bold">{game.homeTeamStats.ats}</span></span>}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {game.status === 'finished' && (
                <span className="text-xl font-black text-white font-mono">{game.homeScore}</span>
              )}
              {homeOdds !== null && (
                <div className={cn(
                  "px-2 py-1 rounded border min-w-[50px] text-center",
                  isHomeFav ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-500" : "bg-slate-800/50 border-slate-700/50 text-slate-400"
                )}>
                  <span className="text-xs font-mono font-bold">{(homeOdds * 100).toFixed(0)}¢</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Injury Summary (Collapsed) */}
        {hasInjuries && !isExpanded && (
          <div className="px-4 pb-3 pt-1">
            <div className="flex flex-wrap gap-2">
              {prediction?.injuries?.slice(0, 3).map((injury, idx) => {
                const status = (injury.status || 'Unknown').toLowerCase();
                return (
                  <span key={idx} className="text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded border border-slate-700/50 flex items-center">
                    <span className="font-medium mr-1">{injury.player}</span>
                    <span className={cn(
                      "font-bold uppercase tracking-wider ml-1",
                      status === 'out' ? "text-rose-400" : 
                      status === 'doubtful' ? "text-amber-400" : 
                      status === 'probable' ? "text-indigo-400" :
                      status === 'in' ? "text-emerald-400" :
                      "text-slate-400"
                    )}>
                      {injury.status}
                    </span>
                  </span>
                );
              })}
              {(prediction?.injuries?.length || 0) > 3 && (
                <span className="text-[10px] bg-slate-800/50 text-slate-500 px-2 py-1 rounded border border-slate-800 flex items-center">
                  +{(prediction?.injuries?.length || 0) - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Expand Indicator */}
        <div className="px-4 py-2 bg-slate-900/30 flex justify-center items-center border-t border-slate-800/30 group-hover:bg-slate-800/50 transition-colors">
          <div className={cn(
            "flex items-center space-x-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors",
            isExpanded ? "text-indigo-400" : "text-slate-600 group-hover:text-slate-400"
          )}>
            <span>{isExpanded ? "View Less" : "View Analysis & Stats"}</span>
            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </div>
        </div>

        {/* Quick Action Bar (Only if not analyzed) */}
        {onReanalyze && !prediction && (
          <div className="px-4 pb-4 pt-2">
            {game.marketOdds && (
              <div className="mb-3 p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/50">
                <div className="text-[9px] uppercase text-slate-500 font-bold mb-2 flex justify-between items-center">
                  <span>Market Odds ({game.marketOdds.source || 'Sportradar'})</span>
                  <TrendingUp className="w-3 h-3" />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[8px] text-slate-500 uppercase mb-0.5">Moneyline</div>
                    <div className="text-[10px] text-slate-300 font-mono bg-slate-900/50 py-1 rounded">
                      {game.marketOdds.awayML ? (game.marketOdds.awayML > 0 ? `+${game.marketOdds.awayML}` : game.marketOdds.awayML) : '-'} / {game.marketOdds.homeML ? (game.marketOdds.homeML > 0 ? `+${game.marketOdds.homeML}` : game.marketOdds.homeML) : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-slate-500 uppercase mb-0.5">Spread</div>
                    <div className="text-[10px] text-slate-300 font-mono bg-slate-900/50 py-1 rounded">
                      {game.marketOdds.spread ? (game.marketOdds.spread > 0 ? `+${game.marketOdds.spread}` : game.marketOdds.spread) : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-slate-500 uppercase mb-0.5">Total</div>
                    <div className="text-[10px] text-slate-300 font-mono bg-slate-900/50 py-1 rounded">
                      {game.marketOdds.total || '-'}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReanalyze(game);
              }}
              disabled={isAnalyzing}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center justify-center transition-all font-bold text-sm shadow-lg shadow-indigo-500/20 disabled:opacity-50"
            >
              <Brain className={cn("w-4 h-4 mr-2", isAnalyzing && "animate-bounce")} />
              {isAnalyzing ? "Analyzing..." : "Analyze Matchup"}
            </button>
          </div>
        )}
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-4 sm:px-6 pb-6 border-t border-slate-800/50 pt-4 animate-in slide-in-from-top-2">
          
          <div className="flex items-center text-slate-500 text-sm mb-4">
            <MapPin className="w-4 h-4 mr-2" />
            {game.location}
          </div>

            {/* Analysis Section */}
            {isAnalyzing ? (
              <div className="text-center py-8 text-indigo-400 bg-indigo-500/5 rounded-lg border border-indigo-500/20 animate-pulse">
                <Brain className="w-8 h-8 mx-auto mb-2 animate-bounce" />
                <p className="font-bold">Analyzing Matchup...</p>
                <p className="text-xs mt-1 opacity-80">Processing stats, injuries, and market data.</p>
              </div>
            ) : prediction ? (
              <div className="space-y-4">
                {/* Post-Mortem Analysis (Move to top if incorrect) */}
                {prediction.outcome === 'incorrect' && prediction.postMortem && (
                  <div className="mb-6 p-5 bg-rose-500/10 border border-rose-500/30 rounded-xl shadow-lg shadow-rose-500/5 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-3 text-rose-400 text-xs font-black uppercase tracking-widest mb-3">
                      <div className="p-1.5 bg-rose-500/20 rounded-lg">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <span>AI Post-Mortem Analysis</span>
                    </div>
                    <div className="bg-slate-950/50 p-4 rounded-lg border border-rose-500/10 mb-3">
                      <p className="text-sm text-slate-200 italic leading-relaxed">
                        "{prediction.postMortem.analysis}"
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Key Missed Factor</span>
                        <p className="text-xs text-rose-300 font-medium">{prediction.postMortem.keyMissedFactor}</p>
                      </div>
                      <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Lesson Learned</span>
                        <p className="text-xs text-emerald-300 font-medium">{prediction.postMortem.lessonLearned}</p>
                      </div>
                    </div>
                  </div>
                )}

                {prediction.winner === "TBD" && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-amber-400 font-bold uppercase tracking-wider">Partial Analysis: Injuries Only</span>
                  </div>
                )}
                               {/* Winner Prediction */}
              <div className={cn(
                "border rounded-xl p-5 transition-all duration-300",
                prediction.outcome === 'correct' ? "bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/5" :
                prediction.outcome === 'incorrect' ? "bg-red-500/10 border-red-500/30 shadow-lg shadow-red-500/5" :
                "bg-indigo-500/10 border-indigo-500/20 shadow-lg shadow-indigo-500/5"
              )}>
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      prediction.outcome === 'correct' ? "bg-emerald-500/20" :
                      prediction.outcome === 'incorrect' ? "bg-red-500/20" :
                      "bg-indigo-500/20"
                    )}>
                      <Brain className={cn(
                        "w-5 h-5",
                        prediction.outcome === 'correct' ? "text-emerald-400" :
                        prediction.outcome === 'incorrect' ? "text-red-400" :
                        "text-indigo-400"
                      )} />
                    </div>
                    <div>
                      <span className={cn(
                        "text-xs font-black uppercase tracking-widest block",
                        prediction.outcome === 'correct' ? "text-emerald-400" :
                        prediction.outcome === 'incorrect' ? "text-red-400" :
                        "text-indigo-400"
                      )}>
                        {prediction.outcome === 'correct' ? "Correct Prediction" :
                         prediction.outcome === 'incorrect' ? "Incorrect Prediction" :
                         "AI Prediction Engine"}
                      </span>
                      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                        Confidence Score: {prediction.confidence}/10
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {onReanalyze && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onReanalyze(game);
                        }}
                        disabled={isAnalyzing}
                        className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg flex items-center transition-colors disabled:opacity-50 border border-slate-700/50"
                        title="Re-analyze this matchup"
                      >
                        <RefreshCw className={cn("w-3 h-3 mr-1.5", isAnalyzing && "animate-spin")} />
                        Re-analyze
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Confidence Meter */}
                <div id="confidence-score" className="w-full bg-slate-800/50 rounded-full h-2.5 mb-6 overflow-hidden border border-slate-700/30">
                  <div 
                    className={cn(
                      "h-2.5 rounded-full transition-all duration-1000 ease-out relative",
                      prediction.confidence >= 7 ? "bg-gradient-to-r from-emerald-600 to-emerald-400" :
                      prediction.confidence >= 5 ? "bg-gradient-to-r from-amber-600 to-amber-400" : 
                      "bg-gradient-to-r from-rose-600 to-rose-400"
                    )}
                    style={{ width: `${prediction.confidence * 10}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                  </div>
                </div>

                <div className="text-white font-bold text-base sm:text-lg flex flex-wrap items-center gap-x-2 mb-2">
                  <span>Projected Winner:</span>
                  <span className={cn(
                    prediction.outcome === 'correct' ? "text-emerald-300" :
                    prediction.outcome === 'incorrect' ? "text-red-300 line-through decoration-red-500/50" :
                    "text-indigo-300"
                  )}>
                    {prediction.confidence < 5 ? "PASS (Too Close to Call)" : prediction.winner}
                  </span>
                  
                  {prediction.outcome === 'incorrect' && prediction.actualWinner && (
                    <span className="text-emerald-400 text-sm">
                      (Winner: {prediction.actualWinner})
                    </span>
                  )}
                </div>

                {/* Simulation Stats & Actions */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4 overflow-hidden">
                  {prediction.winProbability !== undefined && (
                    <div id="win-prob" className="flex items-center justify-between text-xs text-slate-400 bg-slate-800/50 p-2.5 rounded border border-slate-700/30 flex-1 min-w-0">
                      <div className="flex items-center truncate mr-2">
                        <Activity className="w-3.5 h-3.5 mr-2 text-indigo-400 flex-shrink-0" />
                        <span className="truncate">{prediction.simulationCount ? (prediction.simulationCount / 1000).toFixed(0) + 'k' : '10k'} Sims</span>
                      </div>
                      <div className="font-mono text-indigo-300 font-bold flex-shrink-0">
                        {(prediction.winProbability * 100).toFixed(1)}% Win Prob
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {onDiscuss && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDiscuss();
                        }}
                        className="flex-1 sm:flex-none p-2.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded-lg transition-colors flex items-center justify-center gap-2 text-xs font-bold border border-amber-600/20"
                        title="Discuss this game with Snark"
                      >
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        Discuss
                      </button>
                    )}
                    {onLogBet && prediction && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // Default to ML bet for the predicted winner
                          const odds = prediction.winProbability ? (1 / prediction.winProbability) : 2.0;
                          onLogBet({
                            gameId: game.id,
                            league: game.league,
                            date: game.date,
                            team: prediction.winner,
                            type: 'ML',
                            amount: 100, // Default amount
                            odds: Number(odds.toFixed(2)),
                            gameInfo: {
                              homeTeam: game.homeTeam,
                              awayTeam: game.awayTeam
                            }
                          });
                        }}
                        className="flex-1 sm:flex-none p-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg transition-colors flex items-center justify-center gap-2 text-xs font-bold border border-emerald-600/20"
                        title="Log this as a simulated bet"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        Log Bet
                      </button>
                    )}
                  </div>
                </div>
              </div>

                {/* Market Odds Section */}
                {((prediction.marketOdds && Object.keys(prediction.marketOdds).length > 1) || (game.marketOdds && Object.keys(game.marketOdds).length > 1)) && (
                  <div className="bg-slate-800/40 p-5 rounded-xl border border-slate-700/50 shadow-inner">
                    <div className="text-[10px] uppercase text-slate-400 font-black mb-5 tracking-widest flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Market Consensus ({ (prediction.marketOdds?.source || game.marketOdds?.source) || 'Sportradar' })</span>
                      </div>
                      <div className="bg-slate-900 px-2.5 py-1 rounded text-[8px] border border-slate-800 font-bold text-slate-500">LIVE DATA</div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-[9px] text-slate-500 uppercase font-black mb-3 tracking-tighter">Moneyline</div>
                        <div className="flex flex-col gap-2">
                          <div className={cn(
                            "text-[11px] text-slate-200 font-mono bg-slate-950/50 py-2 rounded-lg border relative group/odds transition-all duration-300",
                            awayValue ? "border-emerald-500/40 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.1)]" : "border-slate-800/50"
                          )}>
                            <div className="flex flex-col items-center">
                              <span className="text-[7px] text-slate-600 font-black uppercase mb-0.5">AWAY</span>
                              <span className="font-bold">{awayML ? (awayML > 0 ? `+${awayML}` : awayML) : '-'}</span>
                            </div>
                            {awayImplied && (
                              <div className="absolute -top-2 -right-1 bg-slate-900 text-[7px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-500 font-black group-hover/odds:text-slate-300 transition-colors shadow-sm">
                                {awayImplied.toFixed(0)}%
                              </div>
                            )}
                            {awayValue && (
                              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-emerald-500 text-[7px] px-2 py-0.5 rounded-full font-black text-slate-950 uppercase tracking-widest shadow-lg animate-pulse">
                                VALUE
                              </div>
                            )}
                          </div>
                          <div className={cn(
                            "text-[11px] text-slate-200 font-mono bg-slate-950/50 py-2 rounded-lg border relative group/odds transition-all duration-300",
                            homeValue ? "border-emerald-500/40 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.1)]" : "border-slate-800/50"
                          )}>
                            <div className="flex flex-col items-center">
                              <span className="text-[7px] text-slate-600 font-black uppercase mb-0.5">HOME</span>
                              <span className="font-bold">{homeML ? (homeML > 0 ? `+${homeML}` : homeML) : '-'}</span>
                            </div>
                            {homeImplied && (
                              <div className="absolute -top-2 -right-1 bg-slate-900 text-[7px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-500 font-black group-hover/odds:text-slate-300 transition-colors shadow-sm">
                                {homeImplied.toFixed(0)}%
                              </div>
                            )}
                            {homeValue && (
                              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-emerald-500 text-[7px] px-2 py-0.5 rounded-full font-black text-slate-950 uppercase tracking-widest shadow-lg animate-pulse">
                                VALUE
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-[9px] text-slate-500 uppercase font-black mb-3 tracking-tighter">Spread</div>
                        <div className="flex flex-col gap-2">
                          <div className="text-[11px] text-slate-200 font-mono bg-slate-950/50 py-2 rounded-lg border border-slate-800/50 flex flex-col items-center">
                            <span className="text-[7px] text-slate-600 font-black uppercase mb-0.5">AWAY</span>
                            <span className="font-bold">
                              {(prediction.marketOdds?.spread || game.marketOdds?.spread) ? 
                                ((prediction.marketOdds?.spread || game.marketOdds?.spread)! > 0 ? `+${prediction.marketOdds?.spread || game.marketOdds?.spread}` : (prediction.marketOdds?.spread || game.marketOdds?.spread)) : '-'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-200 font-mono bg-slate-950/50 py-2 rounded-lg border border-slate-800/50 flex flex-col items-center">
                            <span className="text-[7px] text-slate-600 font-black uppercase mb-0.5">HOME</span>
                            <span className="font-bold">
                              {(prediction.marketOdds?.spread || game.marketOdds?.spread) ? 
                                ((prediction.marketOdds?.spread || game.marketOdds?.spread)! > 0 ? `-${prediction.marketOdds?.spread || game.marketOdds?.spread}` : `+${Math.abs((prediction.marketOdds?.spread || game.marketOdds?.spread)!)}`) : '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-[9px] text-slate-500 uppercase font-black mb-3 tracking-tighter">Total</div>
                        <div className="flex flex-col gap-2">
                          <div className="text-[11px] text-slate-200 font-mono bg-slate-950/50 py-2 rounded-lg border border-slate-800/50 flex flex-col items-center">
                            <span className="text-[7px] text-slate-600 font-black uppercase mb-0.5">OVER</span>
                            <span className="font-bold">{(prediction.marketOdds?.total || game.marketOdds?.total) || '-'}</span>
                          </div>
                          <div className="text-[11px] text-slate-200 font-mono bg-slate-950/50 py-2 rounded-lg border border-slate-800/50 flex flex-col items-center">
                            <span className="text-[7px] text-slate-600 font-black uppercase mb-0.5">UNDER</span>
                            <span className="font-bold">{(prediction.marketOdds?.total || game.marketOdds?.total) || '-'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Trends Section */}
                {prediction.trends && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
                      <div className="text-[10px] uppercase text-slate-500 font-bold mb-2 tracking-wider">Home Trends</div>
                      <div className="flex flex-col gap-2">
                        {prediction.trends.homeATS && (
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-400">ATS:</span>
                            <span className="text-indigo-300 font-mono font-bold">{prediction.trends.homeATS}</span>
                          </div>
                        )}
                        {prediction.trends.homeOU && (
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-400">O/U:</span>
                            <span className="text-indigo-300 font-mono font-bold">{prediction.trends.homeOU}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
                      <div className="text-[10px] uppercase text-slate-500 font-bold mb-2 tracking-wider">Away Trends</div>
                      <div className="flex flex-col gap-2">
                        {prediction.trends.awayATS && (
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-400">ATS:</span>
                            <span className="text-indigo-300 font-mono font-bold">{prediction.trends.awayATS}</span>
                          </div>
                        )}
                        {prediction.trends.awayOU && (
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-400">O/U:</span>
                            <span className="text-indigo-300 font-mono font-bold">{prediction.trends.awayOU}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Predicted Score */}
                {prediction.scorePrediction && (
                  <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50 mb-4 shadow-lg shadow-slate-950/20">
                    <div className="text-[10px] uppercase text-slate-500 font-black mb-2 tracking-widest">Score Prediction</div>
                    <div className="text-lg font-mono font-bold text-white">
                      {prediction.scorePrediction.away} - {prediction.scorePrediction.home}
                      {prediction.actualScore && (
                         <span className="ml-3 text-slate-500 text-sm font-normal">
                           (Actual: {prediction.actualScore.away} - {prediction.actualScore.home})
                         </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Previous Matchups - Moved to top under score prediction */}
                {Array.isArray(prediction.previousMatchups) && prediction.previousMatchups.length > 0 && (
                  <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-5 mb-4 shadow-lg shadow-indigo-500/5 transition-all hover:shadow-indigo-500/10">
                    <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center">
                      <Activity className="w-4 h-4 mr-2" />
                      Recent Head-to-Head
                    </h4>
                    <div className="space-y-3">
                      {prediction.previousMatchups.map((match, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs border-b border-slate-800/30 last:border-0 pb-2 last:pb-0 hover:bg-slate-800/20 px-2 -mx-2 rounded transition-colors">
                          <span className="text-slate-500 font-bold uppercase tracking-tighter">{match.date}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-300 font-mono font-bold">
                              {match.awayTeam} {match.awayScore} - {match.homeScore} {match.homeTeam}
                            </span>
                            {match.awayScore > match.homeScore ? (
                              <span className="text-[8px] bg-indigo-500/10 text-indigo-400 px-1 py-0.5 rounded border border-indigo-500/20 font-black uppercase tracking-tighter">AWAY W</span>
                            ) : match.homeScore > match.awayScore ? (
                              <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-1 py-0.5 rounded border border-emerald-500/20 font-black uppercase tracking-tighter">HOME W</span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Matchup Rankings Section */}
                {prediction.matchupRankings && (
                  <div className="bg-slate-800/40 p-5 rounded-xl border border-slate-700/50 shadow-inner mb-4">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                      <div className="p-1 bg-slate-900 rounded border border-slate-800">
                        <Activity className="w-3.5 h-3.5 text-indigo-400" />
                      </div>
                      Matchup Rankings
                    </h4>
                    <div className="space-y-5">
                      {[
                        { label: "Overall Strength", home: prediction.matchupRankings.homeRank, away: prediction.matchupRankings.awayRank },
                        { label: "Offensive Efficiency", home: prediction.matchupRankings.homeOffenseRank, away: prediction.matchupRankings.awayOffenseRank },
                        { label: "Defensive Efficiency", home: prediction.matchupRankings.homeDefenseRank, away: prediction.matchupRankings.awayDefenseRank }
                      ].map((stat, idx) => {
                        const homeVal = typeof stat.home === 'string' ? parseInt(stat.home) : stat.home;
                        const awayVal = typeof stat.away === 'string' ? parseInt(stat.away) : stat.away;
                        
                        // Lower rank is better (e.g., 1st is better than 30th)
                        // We'll invert for the progress bar: (32 - rank) / 32
                        const homePercent = isNaN(homeVal) ? 0 : Math.max(5, ((32 - homeVal) / 32) * 100);
                        const awayPercent = isNaN(awayVal) ? 0 : Math.max(5, ((32 - awayVal) / 32) * 100);

                        return (
                          <div key={idx} className="space-y-2">
                            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                              <span>{game.awayTeam} #{stat.away}</span>
                              <span className="text-slate-400">{stat.label}</span>
                              <span>#{stat.home} {game.homeTeam}</span>
                            </div>
                            <div className="flex items-center gap-2 h-2.5">
                              <div className="flex-1 bg-slate-900 rounded-full h-full overflow-hidden flex justify-end border border-slate-800/50">
                                <div 
                                  className={cn(
                                    "h-full rounded-full transition-all duration-1000",
                                    awayVal < homeVal ? "bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.3)]" : "bg-slate-700"
                                  )}
                                  style={{ width: `${awayPercent}%` }}
                                />
                              </div>
                              <div className="w-1 h-1 rounded-full bg-slate-700" />
                              <div className="flex-1 bg-slate-900 rounded-full h-full overflow-hidden border border-slate-800/50">
                                <div 
                                  className={cn(
                                    "h-full rounded-full transition-all duration-1000",
                                    homeVal < awayVal ? "bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.3)]" : "bg-slate-700"
                                  )}
                                  style={{ width: `${homePercent}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Key Factors Section */}
                {Array.isArray(prediction.keyFactors) && prediction.keyFactors.length > 0 && (
                  <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-5 shadow-sm mb-4">
                    <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <div className="p-1 bg-indigo-500/20 rounded">
                        <Zap className="w-3.5 h-3.5 fill-current" />
                      </div>
                      Key Advantages
                    </h4>
                    <div className="space-y-2.5">
                      {prediction.keyFactors.map((factor, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-3 bg-slate-950/40 rounded-lg border border-slate-800/50 hover:border-indigo-500/20 transition-colors group/factor">
                          <div className="mt-1 shrink-0">
                            <CheckCircle className="w-4 h-4 text-emerald-500/70 group-hover:text-emerald-400 transition-colors" />
                          </div>
                          <p className="text-sm text-slate-300 leading-relaxed group-hover:text-slate-200 transition-colors">{factor}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Injury Report */}
                {Array.isArray(prediction.injuries) && prediction.injuries.length > 0 && (
                  <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-5 shadow-sm mb-4">
                    <h4 className="text-xs font-black text-rose-400 uppercase tracking-widest mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1 bg-rose-500/20 rounded">
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </div>
                        Injury Report
                      </div>
                      {game.league === 'NCAA' && (
                        <span className="text-[8px] bg-rose-500/10 text-rose-400/70 px-2 py-0.5 rounded border border-rose-500/20 font-black">
                          VERIFIED VIA ROTOWIRE
                        </span>
                      )}
                    </h4>
                    <div className="grid grid-cols-1 gap-2">
                      {prediction.injuries.map((injury, idx) => {
                        const status = (injury.status || 'Unknown').toLowerCase();
                        return (
                          <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-950/40 rounded-lg border border-slate-800/50 hover:border-rose-500/20 transition-colors group/injury">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={cn(
                                "w-1.5 h-8 rounded-full shrink-0",
                                status === 'out' ? "bg-rose-500" : 
                                status === 'doubtful' ? "bg-amber-500" : 
                                status === 'probable' ? "bg-indigo-500" :
                                status === 'in' ? "bg-emerald-500" :
                                "bg-slate-700"
                              )} />
                              <div className="flex flex-col min-w-0">
                                <span className="text-slate-200 font-bold text-sm truncate group-hover/injury:text-white transition-colors">{injury.player || 'Unknown'}</span>
                                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">{injury.team || 'Unknown'}</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end shrink-0">
                              <span className={cn(
                                "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border",
                                status === 'out' ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : 
                                status === 'doubtful' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : 
                                status === 'probable' ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" :
                                status === 'in' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                "bg-slate-800 text-slate-400 border-slate-700"
                              )}>
                                {injury.status}
                              </span>
                              {injury.impact && (
                                <span className="text-[9px] text-slate-500 mt-1 italic max-w-[120px] truncate">{injury.impact}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* MLB Pitcher Matchup */}
                {game.league === 'MLB' && prediction.pitcherMatchup && typeof prediction.pitcherMatchup === 'object' && (
                  <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl overflow-hidden mb-4 shadow-sm">
                    <div className="bg-indigo-500/10 px-4 py-2 border-b border-indigo-500/20 flex items-center justify-between">
                      <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center">
                        <Activity className="w-3.5 h-3.5 mr-2" />
                        Pitcher Matchup
                      </h4>
                      <div className="flex items-center gap-3">
                        {prediction.pitcherMatchup.parkFactor && (
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                            Park: {prediction.pitcherMatchup.parkFactor}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {/* Away Pitcher */}
                      {prediction.pitcherMatchup.awayPitcher && (
                        <div className="space-y-2 pb-3 sm:pb-0 border-b sm:border-b-0 border-slate-700/30">
                          <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{game.awayTeam}</div>
                          <div className="text-sm font-bold text-white truncate">{prediction.pitcherMatchup.awayPitcher.name || 'TBD'}</div>
                          
                          <div className="grid grid-cols-3 gap-2 text-[9px] font-mono">
                            <div className="flex flex-col">
                              <span className="text-slate-500 uppercase">ERA</span>
                              <span className="text-indigo-400 font-bold">{prediction.pitcherMatchup.awayPitcher.era || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-slate-500 uppercase">WHIP</span>
                              <span className="text-indigo-400 font-bold">{prediction.pitcherMatchup.awayPitcher.whip || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-slate-500 uppercase">xERA</span>
                              <span className="text-emerald-400 font-bold">{prediction.pitcherMatchup.awayPitcher.xERA || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-slate-500 uppercase">FIP</span>
                              <span className="text-slate-300 font-bold">{prediction.pitcherMatchup.awayPitcher.fip || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-slate-500 uppercase">K/9</span>
                              <span className="text-slate-300 font-bold">{prediction.pitcherMatchup.awayPitcher.k9 || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-slate-500 uppercase">Barrel%</span>
                              <span className="text-rose-400 font-bold">{prediction.pitcherMatchup.awayPitcher.barrelRate || 'N/A'}</span>
                            </div>
                          </div>

                          <div className="text-[10px] text-slate-400 italic line-clamp-2 mt-2 bg-slate-900/30 p-2 rounded border border-slate-800/50">
                            {prediction.pitcherMatchup.awayPitcher.recentForm || 'No recent data available.'}
                          </div>
                        </div>
                      )}

                      {/* Home Pitcher */}
                      {prediction.pitcherMatchup.homePitcher && (
                        <div className="space-y-2">
                          <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest sm:text-right">{game.homeTeam}</div>
                          <div className="text-sm font-bold text-white truncate sm:text-right">{prediction.pitcherMatchup.homePitcher.name || 'TBD'}</div>
                          
                          <div className="grid grid-cols-3 gap-2 text-[9px] font-mono sm:text-right">
                            <div className="flex flex-col sm:items-end">
                              <span className="text-slate-500 uppercase">ERA</span>
                              <span className="text-indigo-400 font-bold">{prediction.pitcherMatchup.homePitcher.era || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col sm:items-end">
                              <span className="text-slate-500 uppercase">WHIP</span>
                              <span className="text-indigo-400 font-bold">{prediction.pitcherMatchup.homePitcher.whip || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col sm:items-end">
                              <span className="text-slate-500 uppercase">xERA</span>
                              <span className="text-emerald-400 font-bold">{prediction.pitcherMatchup.homePitcher.xERA || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col sm:items-end">
                              <span className="text-slate-500 uppercase">FIP</span>
                              <span className="text-slate-300 font-bold">{prediction.pitcherMatchup.homePitcher.fip || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col sm:items-end">
                              <span className="text-slate-500 uppercase">K/9</span>
                              <span className="text-slate-300 font-bold">{prediction.pitcherMatchup.homePitcher.k9 || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col sm:items-end">
                              <span className="text-slate-500 uppercase">Barrel%</span>
                              <span className="text-rose-400 font-bold">{prediction.pitcherMatchup.homePitcher.barrelRate || 'N/A'}</span>
                            </div>
                          </div>

                          <div className="text-[10px] text-slate-400 italic line-clamp-2 mt-2 bg-slate-900/30 p-2 rounded border border-slate-800/50 sm:text-right">
                            {prediction.pitcherMatchup.homePitcher.recentForm || 'No recent data available.'}
                          </div>
                        </div>
                      )}
                    </div>

                    {prediction.pitcherMatchup.summary && (
                      <div className="px-4 py-3 bg-slate-900/40 border-t border-indigo-500/10 text-[11px] text-slate-300 leading-relaxed">
                        {prediction.pitcherMatchup.summary}
                      </div>
                    )}

                    <div className="px-4 py-2 bg-slate-900/50 border-t border-indigo-500/10 flex flex-wrap items-center gap-4 text-[10px]">
                      {prediction.pitcherMatchup.weatherImpact && (
                        <div className="flex items-center text-slate-400">
                          <MapPin className="w-3 h-3 mr-1.5 text-indigo-400" />
                          <span className="font-bold uppercase tracking-tighter">Weather:</span>
                          <span className="ml-1.5 text-slate-300">{prediction.pitcherMatchup.weatherImpact}</span>
                        </div>
                      )}
                      {prediction.pitcherMatchup.umpire && (
                        <div className="flex items-center text-slate-400">
                          <Shield className="w-3 h-3 mr-1.5 text-indigo-400" />
                          <span className="font-bold uppercase tracking-tighter">Umpire:</span>
                          <span className="ml-1.5 text-slate-300">{prediction.pitcherMatchup.umpire.name} ({prediction.pitcherMatchup.umpire.runsPerGame} RPG, {prediction.pitcherMatchup.umpire.strikeZone})</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Strategic Analysis */}
                <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-5 mb-4">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center">
                    <Brain className="w-4 h-4 mr-2" />
                    Strategic Analysis
                  </h4>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {prediction.reasoning}
                  </p>
                </div>

                {/* Hedging Advice */}
                {prediction.hedgingAdvice && (
                  <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 mb-4">
                    <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-2 flex items-center">
                      <Shield className="w-4 h-4 mr-2" />
                      Hedging Strategy
                    </h4>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {prediction.hedgingAdvice}
                    </p>
                  </div>
                )}

                {/* Quality Assurance */}
                {prediction.qaStatus && prediction.qaStatus !== 'verified' && (
                  <div className={cn(
                    "border rounded-xl p-4 mb-4",
                    prediction.qaStatus === 'adjusted' ? "bg-amber-500/5 border-amber-500/20" : "bg-red-500/5 border-red-500/20"
                  )}>
                    <h4 className={cn(
                      "text-xs font-black uppercase tracking-widest mb-2 flex items-center",
                      prediction.qaStatus === 'adjusted' ? "text-amber-400" : "text-red-400"
                    )}>
                      <AlertTriangle className="w-3.5 h-3.5 mr-2" />
                      QA {prediction.qaStatus === 'adjusted' ? 'Adjusted' : 'Flagged'}
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {prediction.qaNotes}
                    </p>
                  </div>
                )}
                {prediction.qaStatus === 'verified' && (
                  <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4 flex items-center mb-4">
                    <CheckCircle className="w-4 h-4 text-emerald-500 mr-2" />
                    <span className="text-xs text-emerald-400 font-black uppercase tracking-widest">Injuries & Lineups Verified</span>
                  </div>
                )}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 bg-slate-800/20 rounded-lg border border-slate-800 border-dashed flex flex-col items-center justify-center">
              <p>Analysis pending...</p>
              <p className="text-xs mt-1 opacity-60 mb-4">Waiting for admin to run auto-analysis.</p>
              {onReanalyze && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReanalyze(game);
                  }}
                  disabled={isAnalyzing}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex items-center disabled:opacity-50"
                >
                  <Brain className={cn("w-4 h-4 mr-2", isAnalyzing && "animate-bounce")} />
                  {isAnalyzing ? "Analyzing..." : "Analyze Matchup"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
