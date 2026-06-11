import React, { useState } from "react";
import {
  Calendar,
  MapPin,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  TrendingUp,
  Shield,
  ShieldCheck,
  Brain,
  CheckCircle,
  CheckCircle2,
  Database,
  Star,
  Info,
  Activity,
  RefreshCw,
  Zap,
  DollarSign,
  Users,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Game, Prediction } from "./types";
import { cn } from "./lib/utils";
import { ApiSportsWidgetEmbed } from "./components/ApiSportsWidgets";
import { MlbMatchupLab } from "./components/MlbMatchupLab";

const WIDGET_KEY = import.meta.env.VITE_API_SPORTS_WIDGET_KEY || "b2795a8c744b26f971aaf15eb994212e";

interface GameCardProps {
  game: Game;
  prediction?: Prediction | null;
  isAnalyzing?: boolean;
  isAdminUser?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
  onReanalyze?: (game: Game) => void;
  onCheckInjuries?: (game: Game) => void;
  onDiscuss?: () => void;
  onSelect?: (game: Game) => void;
}

export const GameCard: React.FC<GameCardProps> = ({ 
  game, 
  prediction, 
  isAnalyzing, 
  isAdminUser,
  isSelected,
  onToggleSelection,
  onReanalyze, 
  onCheckInjuries,
  onDiscuss,
  onSelect
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [checkingInjuries, setCheckingInjuries] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<"ai" | "matchup" | "h2h" | "injuries">("ai");

  const handleCardClick = () => {
    setIsExpanded(!isExpanded);
    if (onSelect) {
      onSelect(game);
    }
  };

  React.useEffect(() => {
    const handleExpand = () => setIsExpanded(true);
    window.addEventListener(`expand-game-${game.id}`, handleExpand);
    return () => window.removeEventListener(`expand-game-${game.id}`, handleExpand);
  }, [game.id]);

  // Determine favorite based on Kalshi expectations
  // Kalshi prices are typically 0-100 (cents) or 0-1 (probability)
  // We'll normalize to 0-1 for internal logic
  const yesProb = game.kalshiExpectations ? (game.kalshiExpectations.yes > 1 ? game.kalshiExpectations.yes / 100 : game.kalshiExpectations.yes) : null;
  const noProb = game.kalshiExpectations ? (game.kalshiExpectations.no > 1 ? game.kalshiExpectations.no / 100 : game.kalshiExpectations.no) : null;

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
  const { homeExpectation, awayExpectation } = React.useMemo(() => {
    let home = null;
    let away = null;
    
    if (game.kalshiExpectations && game.kalshiMarketTitle) {
      const title = game.kalshiMarketTitle;
      const yesProb = game.kalshiExpectations.yes > 1 ? game.kalshiExpectations.yes / 100 : game.kalshiExpectations.yes;
      const noProb = game.kalshiExpectations.no > 1 ? game.kalshiExpectations.no / 100 : game.kalshiExpectations.no;
      
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
    
    return { homeExpectation: home, awayExpectation: away };
  }, [game.kalshiMarketTitle, game.kalshiExpectations, game.homeTeam, game.awayTeam]);

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

  console.log(`[GameCard] ${game.awayTeam} @ ${game.homeTeam} - Prediction:`, prediction);
  console.log(`[GameCard] ${game.awayTeam} @ ${game.homeTeam} - Has injuries: ${hasInjuries}, Edge: ${edge}`);

  // Recommendation logic
  const recommendation = React.useMemo(() => {
    if (!prediction) return null;
    if (prediction.winner === "PASS" || prediction.winner === "TBD") {
      return { label: "PASS", color: "bg-slate-500/10 text-slate-400 border-slate-700/50" };
    }
    if (prediction.confidence >= 7) {
      return { label: "PLAY", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
    }
    return { label: "NO PLAY", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
  }, [prediction]);

  // Parsing reasoning paragraph into bullet points
  const parsedReasoning = React.useMemo(() => {
    if (!prediction?.reasoning) return null;
    const sentences = prediction.reasoning.split(/(?<=[.!?])\s+/);
    return {
      whyThisPick: sentences[0] || "Recommendation is based on model simulation outcome.",
      marketEdge: sentences[1] || `Calculated model edge is +${(edge ? edge * 100 : 5.0).toFixed(1)}% compared to the market.`,
      mainRisks: sentences[2] || "Primary risk factors include lineup volatility and injury reports.",
      finalRead: sentences[3] || sentences[0] || "Pass or Play decision based on calculated EV thresholds."
    };
  }, [prediction?.reasoning, edge]);

  const getImpliedProbability = (odds: number | undefined) => {
    if (!odds) return null;
    if (odds > 0) {
      return (100 / (odds + 100)) * 100;
    } else {
      const absOdds = Math.abs(odds);
      return (absOdds / (absOdds + 100)) * 100;
    }
  };

  const selectedSource = React.useMemo(() => {
    if (!game.allSources || game.allSources.length === 0) return null;
    if (selectedSourceId) {
      return game.allSources.find(b => b.id === selectedSourceId) || game.allSources[0];
    }
    // Default to the one matching marketExpectations.source or the first one
    return game.allSources.find(b => b.name === game.marketExpectations?.source) || game.allSources[0];
  }, [game.allSources, selectedSourceId, game.marketExpectations?.source]);

  const awayML = prediction?.marketExpectations?.awayWinProb || selectedSource?.awayWinProb || game.marketExpectations?.awayWinProb;
  const homeML = prediction?.marketExpectations?.homeWinProb || selectedSource?.homeWinProb || game.marketExpectations?.homeWinProb;
  const spread = prediction?.marketExpectations?.margin || selectedSource?.margin || game.marketExpectations?.margin;
  const total = prediction?.marketExpectations?.total || selectedSource?.total || game.marketExpectations?.total;
  const expectationsSource = prediction?.marketExpectations?.source || selectedSource?.name || game.marketExpectations?.source || 'Expert Consensus';

  const awayImplied = getImpliedProbability(awayML);
  const homeImplied = getImpliedProbability(homeML);

  const awayValue = prediction && awayImplied && isAIPredictedAway && (prediction.winProbability * 100) > awayImplied;
  const homeValue = prediction && homeImplied && isAIPredictedHome && (prediction.winProbability * 100) > homeImplied;

  const isTopPick = prediction && prediction.winner && prediction.winner.toUpperCase() !== "PASS" && (prediction.confidence || 0) >= 7;
  const isMlb = String(game.league || "").toUpperCase() === "MLB";

  const displayDecisionDrivers = React.useMemo(() => {
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
      "model=",
      "prompt=",
      "qa adjusted",
      "api audit notes",
      "audit notes",
    ];

    const rawFactors = Array.isArray(prediction.keyFactors) ? prediction.keyFactors : [];
    const cleanedFactors = rawFactors
      .filter((factor) => typeof factor === "string" && factor.trim())
      .filter((factor) => {
        const lower = factor.toLowerCase();
        return !bannedPhrases.some((phrase) => lower.includes(phrase));
      })
      .map((factor) => factor.replace(/\s+/g, " " ).trim());

    const generated: string[] = [];
    const pick = prediction.winner && prediction.winner !== "PASS" ? prediction.winner : null;
    const edgePct = typeof prediction.matchupDelta === "number" ? `${prediction.matchupDelta >= 0 ? "+" : ""}${(prediction.matchupDelta * 100).toFixed(1)}%` : null;
    const winPct = typeof prediction.winProbability === "number" ? `${(prediction.winProbability * 100).toFixed(1)}%` : null;

    if (pick && winPct) {
      generated.push(`${pick} is the model side at ${winPct}${edgePct ? ` with a ${edgePct} edge against market price.` : "."}`);
    } else if (prediction.winner === "PASS") {
      generated.push("No play is preferred because the current edge does not clear the betting threshold.");
    }

    if (game.homeTeamStats?.record && game.awayTeamStats?.record) {
      generated.push(`${game.awayTeam} enters ${game.awayTeamStats.record}; ${game.homeTeam} enters ${game.homeTeamStats.record}.`);
    }

    const pitcherMatchup = (prediction as any).pitcherMatchup;
    const homePitcher = pitcherMatchup?.homePitcher?.name;
    const awayPitcher = pitcherMatchup?.awayPitcher?.name;
    if (homePitcher && awayPitcher && homePitcher !== "TBD" && awayPitcher !== "TBD") {
      generated.push(`Probable pitcher matchup: ${awayPitcher} vs ${homePitcher}.`);
    } else if (isMlb) {
      generated.push("Probable starters are not confirmed yet, so MLB confidence should stay capped.");
    }

    if (Array.isArray(prediction.previousMatchups) && prediction.previousMatchups.length > 0) {
      generated.push(`Previous matchup sample includes ${prediction.previousMatchups.length} recent meeting${prediction.previousMatchups.length === 1 ? "" : "s"}.`);
    }

    if (Array.isArray(game.allSources) && game.allSources.length > 0) {
      generated.push(`Market check is based on ${game.allSources.length} sportsbook source${game.allSources.length === 1 ? "" : "s"}.`);
    }

    const seen = new Set<string>();
    return [...generated, ...cleanedFactors]
      .filter(Boolean)
      .filter((factor) => {
        const key = factor.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
  }, [prediction, game, isMlb]);

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
        onClick={handleCardClick}
      >
        <div className="p-2 sm:p-3 border-b border-slate-800/50 flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-900/50 gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {isAdminUser && onToggleSelection && (
              <div 
                className="mr-1 flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelection();
                }}
              >
                <div className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center transition-all cursor-pointer",
                  isSelected 
                    ? "bg-indigo-600 border-indigo-500 shadow-lg shadow-indigo-500/20" 
                    : "bg-slate-800 border-slate-700 hover:border-slate-600"
                )}>
                  {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                </div>
              </div>
            )}
            <span className="bg-slate-800 text-slate-400 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border border-slate-700/50">
              {game.league}
            </span>
            <span className={cn(
              "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border",
              game.status === 'live' 
                ? "bg-red-500/10 text-red-400 border-red-500/20 animate-pulse" 
                : "bg-slate-800 text-slate-500 border-slate-700/50"
            )}>
              {game.status}
            </span>
            {hasInjuries && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border bg-amber-500/10 text-amber-500 border-amber-500/20 flex items-center">
                <AlertTriangle className="w-2.5 h-2.5 mr-1" />
                {prediction?.injuries?.length}
              </span>
            )}
            {edge !== null && edge > 0.05 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 flex items-center animate-pulse">
                <Zap className="w-2.5 h-2.5 mr-1" />
                +{(edge * 100).toFixed(0)}%
              </span>
            )}
            {isTopPick && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border bg-indigo-500/10 text-indigo-400 border-indigo-500/20 flex items-center">
                <Sparkles className="w-2.5 h-2.5 mr-1" />
                TOP PICK
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2 text-slate-500 text-[9px] font-mono w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-slate-800/50 pt-1.5 sm:pt-0 overflow-hidden">
            <div className="flex items-center truncate">
              <Calendar className="w-2.5 h-2.5 mr-1 opacity-50 flex-shrink-0" />
              <span className="truncate">{formattedDate}</span>
            </div>
            <div className="flex items-center flex-shrink-0">
              <Clock className="w-2.5 h-2.5 mr-1 opacity-50 flex-shrink-0" />
              <span>{game.time}</span>
            </div>
          </div>
        </div>

        <div className="p-3 space-y-2">
          {/* Away Team Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center p-1 border border-slate-700/50">
                {game.awayLogo ? (
                  <img src={game.awayLogo} alt={game.awayTeam} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="text-slate-600 font-bold text-[10px]">{game.awayTeam.substring(0, 2)}</div>
                )}
              </div>
              <div>
                <div className="flex items-center overflow-hidden">
                  <h3 className={cn(
                    "text-sm font-bold transition-colors truncate",
                    isAIPredictedAway ? "text-indigo-400" : "text-white"
                  )}>
                    {game.awayTeam}
                  </h3>
                  {isAIPredictedAway && (
                    <div className="flex items-center ml-1.5 bg-indigo-500/10 px-1 py-0.5 rounded border border-indigo-500/20">
                      <Brain className="w-2.5 h-2.5 text-indigo-400 mr-1" />
                      <span className="text-[7px] font-black text-indigo-400 uppercase tracking-tighter">PICK</span>
                    </div>
                  )}
                </div>
                {isExpanded && game.awayTeamStats && (
                  <div className="text-[9px] text-slate-500 font-mono flex flex-wrap items-center mt-0.5 gap-x-2 gap-y-0.5">
                    <span className="text-slate-400 font-bold">{game.awayTeamStats.record}</span>
                    {game.awayTeamStats.winPercentage && <span className="text-slate-500">W%: <span className="text-slate-400">{game.awayTeamStats.winPercentage}</span></span>}
                    {game.awayTeamStats.last5 !== "N/A" && <span className="text-slate-500">L5: <span className="text-slate-400">{game.awayTeamStats.last5}</span></span>}
                  </div>
                )}
                {!isExpanded && game.awayTeamStats && (
                   <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                      <span className="text-slate-400 font-bold">{game.awayTeamStats.record}</span>
                   </div>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {game.status === 'finished' ? (
                <span className="text-lg font-black text-white font-mono">{game.awayScore}</span>
              ) : prediction?.scorePrediction ? (
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-mono font-black text-indigo-400 bg-indigo-500/5 px-2 py-0.5 rounded border border-indigo-500/10">
                    {prediction.scorePrediction.away}
                  </span>
                  <span className="text-[7px] text-slate-500 uppercase font-black tracking-tighter">PROJ</span>
                </div>
              ) : awayExpectation !== null ? (
                <div className={cn(
                  "px-2 py-0.5 rounded border text-center",
                  isAwayFav ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-500" : "bg-slate-800/50 border-slate-700/50 text-slate-400"
                )}>
                  <span className="text-[10px] font-mono font-bold">{(awayExpectation * 100).toFixed(0)}¢</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Home Team Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center p-1 border border-slate-700/50">
                {game.homeLogo ? (
                  <img src={game.homeLogo} alt={game.homeTeam} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="text-slate-600 font-bold text-[10px]">{game.homeTeam.substring(0, 2)}</div>
                )}
              </div>
              <div>
                <div className="flex items-center overflow-hidden">
                  <h3 className={cn(
                    "text-sm font-bold transition-colors truncate",
                    isAIPredictedHome ? "text-indigo-400" : "text-white"
                  )}>
                    {game.homeTeam}
                  </h3>
                  {isAIPredictedHome && (
                    <div className="flex items-center ml-1.5 bg-indigo-500/10 px-1 py-0.5 rounded border border-indigo-500/20">
                      <Brain className="w-2.5 h-2.5 text-indigo-400 mr-1" />
                      <span className="text-[7px] font-black text-indigo-400 uppercase tracking-tighter">PICK</span>
                    </div>
                  )}
                </div>
                {isExpanded && game.homeTeamStats && (
                  <div className="text-[9px] text-slate-500 font-mono flex flex-wrap items-center mt-0.5 gap-x-2 gap-y-0.5">
                    <span className="text-slate-400 font-bold">{game.homeTeamStats.record}</span>
                    {game.homeTeamStats.winPercentage && <span className="text-slate-500">W%: <span className="text-slate-400">{game.homeTeamStats.winPercentage}</span></span>}
                    {game.homeTeamStats.last5 !== "N/A" && <span className="text-slate-500">L5: <span className="text-slate-400">{game.homeTeamStats.last5}</span></span>}
                  </div>
                )}
                {!isExpanded && game.homeTeamStats && (
                   <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                      <span className="text-slate-400 font-bold">{game.homeTeamStats.record}</span>
                   </div>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {game.status === 'finished' ? (
                <span className="text-lg font-black text-white font-mono">{game.homeScore}</span>
              ) : prediction?.scorePrediction ? (
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-mono font-black text-indigo-400 bg-indigo-500/5 px-2 py-0.5 rounded border border-indigo-500/10">
                    {prediction.scorePrediction.home}
                  </span>
                  <span className="text-[7px] text-slate-500 uppercase font-black tracking-tighter">PROJ</span>
                </div>
              ) : homeExpectation !== null ? (
                <div className={cn(
                  "px-2 py-0.5 rounded border text-center",
                  isHomeFav ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-500" : "bg-slate-800/50 border-slate-700/50 text-slate-400"
                )}>
                  <span className="text-[10px] font-mono font-bold">{(homeExpectation * 100).toFixed(0)}¢</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Collapsed Recommendation Banner */}
          {prediction && (
            <div className="mt-3 p-3 bg-slate-950/40 rounded-xl border border-slate-800/80 flex flex-wrap items-center justify-between gap-3 shadow-inner">
              {/* Large recommendation badge */}
              <div className={cn(
                "px-3 py-1.5 rounded-lg border text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm",
                recommendation?.color
              )}>
                <Brain className="w-3.5 h-3.5" />
                {recommendation?.label}
              </div>

              {/* Metrics grid */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                {prediction.winProbability !== undefined && (
                  <div className="flex items-center gap-1 text-slate-400">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Win Prob:</span>
                    <span className="font-mono font-bold text-indigo-400">{(prediction.winProbability * 100).toFixed(0)}%</span>
                  </div>
                )}
                
                {prediction.confidence !== undefined && (
                  <div className="flex items-center gap-1 text-slate-400">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Confidence:</span>
                    <span className="font-mono font-bold text-indigo-400">{prediction.confidence.toFixed(1)}/10</span>
                  </div>
                )}

                {edge !== null && (
                  <div className="flex items-center gap-1 text-slate-400">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Edge:</span>
                    <span className={cn("font-mono font-bold", edge > 0.05 ? "text-emerald-400 animate-pulse" : "text-amber-400")}>
                      +{Math.round(edge * 100)}%
                    </span>
                  </div>
                )}

                {prediction.predictionDataQuality && (
                  <div className="flex items-center gap-1 text-slate-400">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Data:</span>
                    <span className={cn(
                      "font-mono font-bold uppercase",
                      prediction.predictionDataQuality.toLowerCase() === 'high' ? "text-emerald-400" :
                      prediction.predictionDataQuality.toLowerCase() === 'medium' ? "text-amber-400" :
                      "text-rose-400"
                    )}>
                      {prediction.predictionDataQuality}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Head-to-Head & Injury Summary (Collapsed) */}
        {!isExpanded && (
          <div className="px-3 pb-2 pt-0 space-y-1.5">
            {/* H2H Mini Summary */}
            {Array.isArray(prediction?.previousMatchups) && prediction.previousMatchups.length > 0 && (
              <div className="flex items-center space-x-2">
                <div className="flex items-center bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/20 text-[8px] font-black uppercase tracking-tighter">
                  <Activity className="w-2 h-2 mr-1" />
                  H2H: {prediction.previousMatchups.length} GMS
                </div>
                <div className="flex gap-1 overflow-hidden">
                  {prediction.previousMatchups.slice(0, 3).map((match, idx) => {
                    const homeWinner = match.homeScore > match.awayScore;
                    const homeTeamMatch = match.homeTeam || "";
                    const awayTeamMatch = match.awayTeam || "";
                    const isHomeTeam = game.homeTeam.toLowerCase().includes(homeTeamMatch.toLowerCase()) || homeTeamMatch.toLowerCase().includes(game.homeTeam.toLowerCase());
                    const winnerSymbol = (isHomeTeam && homeWinner) || (!isHomeTeam && !homeWinner) ? "W" : "L";
                    
                    return (
                      <span key={idx} className={cn(
                        "text-[8px] font-mono px-1 rounded border",
                        winnerSymbol === "W" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                      )}>
                        {match.awayScore}-{match.homeScore}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Injury Summary */}
            {hasInjuries && (
              <div className="flex flex-wrap gap-1.5">
                {prediction?.injuries?.slice(0, 2).map((injury, idx) => {
                  const status = (injury.status || 'Unknown').toLowerCase();
                  return (
                    <span key={idx} className="text-[9px] bg-slate-800/50 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700/30 flex items-center">
                      <span className="font-medium mr-1 truncate max-w-[60px]">{injury.player}</span>
                      <span className={cn(
                        "font-bold uppercase tracking-wider",
                        status === 'out' ? "text-rose-400" : 
                        status === 'doubtful' ? "text-amber-400" : 
                        status === 'probable' ? "text-indigo-400" :
                        status === 'in' ? "text-emerald-400" :
                        "text-slate-400"
                      )}>
                        {injury.status?.substring(0, 3)}
                      </span>
                    </span>
                  );
                })}
                {(prediction?.injuries?.length || 0) > 2 && (
                  <span className="text-[9px] text-slate-500 flex items-center ml-1">
                    +{(prediction?.injuries?.length || 0) - 2}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Expand Indicator */}
        <div className="px-3 py-1.5 bg-slate-900/30 flex justify-center items-center border-t border-slate-800/30 group-hover:bg-slate-800/50 transition-colors">
          <div className={cn(
            "flex items-center space-x-1 text-[9px] font-bold uppercase tracking-widest transition-colors",
            isExpanded ? "text-indigo-400" : "text-slate-600 group-hover:text-slate-400"
          )}>
            <span>{isExpanded ? "Less" : "Analysis"}</span>
            {isExpanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </div>
        </div>

        {/* Quick Action Bar */}
        {(onReanalyze || (isExpanded && (game.marketExpectations || game.allSources))) && (
          <div className="px-4 pb-4 pt-2">
            {isExpanded && (game.marketExpectations || game.allSources) && (
              <div className="mb-3 p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/50">
                <div className="text-[9px] uppercase text-slate-500 font-bold mb-2 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span>Market Expectations</span>
                    <span title="Current market expectations from available sources, including Win Prob, Margin, and Total.">
                      <Info className="w-3 h-3 text-slate-500 cursor-help" />
                    </span>
                    {game.allSources && game.allSources.length > 0 ? (
                      <select 
                        className="bg-slate-900 border border-slate-700 text-slate-300 rounded px-1 py-0.5 text-[9px] outline-none focus:border-indigo-500"
                        value={selectedSourceId || ''}
                        onChange={(e) => {
                          e.stopPropagation();
                          setSelectedSourceId(Number(e.target.value));
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {game.allSources.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-slate-400">({expectationsSource})</span>
                    )}
                  </div>
                  <TrendingUp className="w-3 h-3" />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[8px] text-slate-500 uppercase mb-0.5">Win Prob</div>
                    <div className="text-[10px] text-slate-300 font-mono bg-slate-900/50 py-1 rounded">
                      {awayML ? (awayML > 0 ? `+${awayML}` : awayML) : '-'} / {homeML ? (homeML > 0 ? `+${homeML}` : homeML) : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-slate-500 uppercase mb-0.5">Margin</div>
                    <div className="text-[10px] text-slate-300 font-mono bg-slate-900/50 py-1 rounded">
                      {spread ? (spread > 0 ? `+${spread}` : spread) : '-'} / {spread ? (spread > 0 ? `-${spread}` : `+${Math.abs(spread)}`) : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[8px] text-slate-500 uppercase mb-0.5">Total</div>
                    <div className="text-[10px] text-slate-300 font-mono bg-slate-900/50 py-1 rounded">
                      {total || '-'}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {isAdminUser && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                {onReanalyze && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReanalyze(game);
                    }}
                    disabled={isAnalyzing}
                    className={cn(
                      "py-2.5 rounded-lg flex items-center justify-center transition-all font-bold text-xs shadow-lg disabled:opacity-50",
                      prediction 
                        ? "bg-slate-700 hover:bg-slate-600 text-slate-200 shadow-slate-900/20" 
                        : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20"
                    )}
                    title={prediction ? "Reanalyze Matchup" : "Analyze Matchup"}
                  >
                    <Brain className={cn("w-3.5 h-3.5 mr-1.5", isAnalyzing && "animate-bounce")} />
                    {isAnalyzing ? "..." : (prediction ? "Reanalyze" : "Analyze")}
                  </button>
                )}
                {onCheckInjuries && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      setCheckingInjuries(true);
                      try {
                        await onCheckInjuries(game);
                      } catch (err) {
                        console.error("Error checking injuries:", err);
                      } finally {
                        setCheckingInjuries(false);
                      }
                    }}
                    disabled={checkingInjuries}
                    className={cn(
                      "py-2.5 rounded-lg flex items-center justify-center transition-all font-bold text-xs bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/20 disabled:opacity-50",
                      checkingInjuries && "animate-pulse"
                    )}
                    title="Check latest injury report"
                  >
                    {checkingInjuries ? (
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Activity className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {checkingInjuries ? "Checking..." : "Injuries"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expand/Collapse Indicator */}
      <div className="absolute bottom-2 right-4 text-slate-600">
        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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
            ) : isMlb ? (
              <MlbMatchupLab game={game} prediction={prediction} onReanalyze={onReanalyze} isAnalyzing={isAnalyzing} />
            ) : prediction ? (
              <div className="space-y-4">
                {/* Detail Tabs */}
                <div className="flex flex-wrap items-center bg-slate-950/40 p-1 rounded-xl border border-slate-850 mb-4 gap-1">
                  {([
                    { id: "ai", label: "AI & Live Widget" },
                    { id: "matchup", label: "Matchup" },
                    { id: "h2h", label: "H2H" },
                    { id: "injuries", label: "Injuries" }
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

                {/* Tab 1: AI & Live Widget */}
                {activeDetailTab === "ai" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {/* Live Provider Details Widget */}
                    <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-xl space-y-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <h4 className="text-xs font-black text-slate-350 uppercase tracking-widest flex items-center">
                          <Info className="w-4 h-4 mr-2 text-indigo-500" /> Live Provider details widget
                        </h4>
                        {!game.apiSportsGameId && (
                          <span className="text-[10px] font-extrabold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 uppercase tracking-wider">
                            ⚠️ Demo Mode (API Key Missing)
                          </span>
                        )}
                      </div>
                      
                      {/* Market Expectations */}
                      {(game.marketExpectations || game.allSources) && (
                        <div className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/50">
                          <div className="text-[10px] uppercase text-slate-500 font-bold mb-3 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <span>Market Expectations Summary</span>
                              {game.allSources && game.allSources.length > 0 && (
                                <select 
                                  className="bg-slate-900 border border-slate-700 text-slate-300 rounded px-1 py-0.5 text-[9px] outline-none"
                                  value={selectedSourceId || ''}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    setSelectedSourceId(Number(e.target.value));
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {game.allSources.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                            <TrendingUp className="w-3.5 h-3.5" />
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-slate-950/50 p-2.5 rounded border border-slate-900">
                              <div className="text-[8px] text-slate-500 uppercase mb-0.5">Win Prob</div>
                              <div className="text-[10px] text-slate-300 font-mono">
                                {awayML ? (awayML > 0 ? `+${awayML}` : awayML) : '-'} / {homeML ? (homeML > 0 ? `+${homeML}` : homeML) : '-'}
                              </div>
                            </div>
                            <div className="bg-slate-950/50 p-2.5 rounded border border-slate-900">
                              <div className="text-[8px] text-slate-500 uppercase mb-0.5">Margin</div>
                              <div className="text-[10px] text-slate-300 font-mono">
                                {spread ? (spread > 0 ? `+${spread}` : spread) : '-'} / {spread ? (spread > 0 ? `-${spread}` : `+${Math.abs(spread)}`) : '-'}
                              </div>
                            </div>
                            <div className="bg-slate-950/50 p-2.5 rounded border border-slate-900">
                              <div className="text-[8px] text-slate-500 uppercase mb-0.5">Total</div>
                              <div className="text-[10px] text-slate-300 font-mono">
                                {total || '-'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* API-Sports Widgets */}
                      {(() => {
                        const widgetSport = game.league === 'NBA' ? 'nba' :
                                            game.league === 'MLB' ? 'baseball' :
                                            game.league === 'NHL' ? 'hockey' :
                                            game.league === 'NFL' ? 'football' :
                                            'nba';

                        const isSupportedLeague = game.league === 'NBA' || game.league === 'NHL' || game.league === 'NFL' || game.league === 'MLB' || !game.apiSportsGameId;

                        return isSupportedLeague ? (
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 border-t border-slate-800 pt-6">
                            <div className="space-y-4">
                              <h4 className="text-xs font-black text-slate-300 uppercase tracking-widest flex items-center">
                                <Info className="w-4 h-4 mr-2 text-indigo-500" />
                                Lineups & Injuries
                              </h4>
                              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 overflow-hidden shadow-2xl">
                                <ApiSportsWidgetEmbed 
                                  html={`
                                    <api-sports-widget
                                      data-type="game"
                                      data-game-id="${game.apiSportsGameId || 286705}"
                                      data-refresh="0"
                                      data-show-toolbar="false"
                                      data-tab="all"
                                      data-game-style="2"
                                    ></api-sports-widget>
                                    <api-sports-widget
                                      data-type="config"
                                      data-key="${WIDGET_KEY}"
                                      data-sport="${widgetSport}"
                                      data-lang="en"
                                      data-theme="grey"
                                      data-timezone="CST"
                                      data-show-errors="false"
                                      data-show-logos="true"
                                      data-favorite="true"
                                    ></api-sports-widget>
                                  `}
                                />
                              </div>
                            </div>

                            <div className="space-y-4">
                              <h4 className="text-xs font-black text-slate-300 uppercase tracking-widest flex items-center">
                                <TrendingUp className="w-4 h-4 mr-2 text-indigo-500" />
                                Matchup History
                              </h4>
                              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 overflow-hidden shadow-2xl">
                                <ApiSportsWidgetEmbed 
                                  html={`
                                    <api-sports-widget
                                      data-type="h2h"
                                      data-h2h="${(game.apiSportsHomeTeamId && game.apiSportsAwayTeamId) ? `${game.apiSportsHomeTeamId}-${game.apiSportsAwayTeamId}` : '135-141'}"
                                      data-refresh="0"
                                      data-show-toolbar="false"
                                      data-tab="all"
                                      data-h2h-style="2"
                                    ></api-sports-widget>
                                    <api-sports-widget
                                      data-type="config"
                                      data-key="${WIDGET_KEY}"
                                      data-sport="${widgetSport}"
                                      data-lang="en"
                                      data-theme="grey"
                                      data-timezone="CST"
                                      data-show-errors="false"
                                      data-show-logos="true"
                                      data-favorite="true"
                                    ></api-sports-widget>
                                  `}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 bg-slate-900/50 p-4 rounded-xl border border-slate-800 text-center italic">
                            Live provider details widget is not active or unconfigured for this game/league.
                          </div>
                        );
                      })()}
                    </div>
                    {/* Post-Mortem Analysis (if incorrect) */}
                    {prediction.outcome === 'incorrect' && prediction.postMortem && (
                      <div className="p-5 bg-rose-500/10 border border-rose-500/30 rounded-xl shadow-lg shadow-rose-500/5">
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
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span className="text-xs text-amber-400 font-bold uppercase tracking-wider">Partial Analysis: Injuries Only</span>
                      </div>
                    )}

                    {/* Winner and confidence metrics */}
                    <div className="border border-indigo-500/20 bg-indigo-500/10 rounded-xl p-5 shadow-lg shadow-indigo-500/5">
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-500/20 rounded-lg">
                            <Brain className="w-5 h-5 text-indigo-400" />
                          </div>
                          <div>
                            <span className="text-xs font-black uppercase tracking-widest text-indigo-400 block">
                              Prediction Engine
                            </span>
                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                              Confidence Score: {Number(prediction.confidence || 0).toFixed(1)}/10
                            </div>
                          </div>
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

                      <div className="text-white font-bold text-base sm:text-lg flex flex-wrap items-center gap-x-2">
                        <span>Projected Winner:</span>
                        <span className="text-indigo-300">
                          {prediction.confidence < 3 ? "PASS (Too Close to Call)" : prediction.winner}
                        </span>
                      </div>
                    </div>

                    {/* Bulleted Reasoning List */}
                    {parsedReasoning && (
                      <div className="space-y-3 p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                        <h5 className="text-[10px] font-black uppercase text-indigo-400 tracking-wider mb-2 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" /> Model Core Insight
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            <div>
                              <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">Why this pick:</span>
                              <p className="text-xs text-slate-300 leading-relaxed">{parsedReasoning.whyThisPick}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                              <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">Market Edge:</span>
                              <p className="text-xs text-slate-300 leading-relaxed">{parsedReasoning.marketEdge}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                            <div>
                              <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">Main Risks:</span>
                              <p className="text-xs text-slate-300 leading-relaxed">{parsedReasoning.mainRisks}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                            <div>
                              <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">Final Read:</span>
                              <p className="text-xs text-slate-300 leading-relaxed">{parsedReasoning.finalRead}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Key Factors */}
                    {displayDecisionDrivers.length > 0 && (
                      <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-5 shadow-sm">
                        <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <div className="p-1 bg-indigo-500/20 rounded">
                            <Zap className="w-3.5 h-3.5 fill-current" />
                          </div>
                          Decision Drivers
                        </h4>
                        <div className="space-y-2.5">
                          {displayDecisionDrivers.map((factor, idx) => (
                            <div key={idx} className="flex items-start gap-3 p-3 bg-slate-950/40 rounded-lg border border-slate-800/50 hover:border-indigo-500/20 transition-colors group/factor">
                              <CheckCircle className="w-4 h-4 text-emerald-500/70 group-hover:text-emerald-400 transition-colors shrink-0 mt-0.5" />
                              <p className="text-sm text-slate-300 leading-relaxed">{factor}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Strategic Analysis */}
                    <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-5">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center">
                        <Brain className="w-4 h-4 mr-2" />
                        Strategic Analysis
                      </h4>
                      <p className="text-sm text-slate-300 leading-relaxed font-normal">
                        {prediction.reasoning}
                      </p>
                    </div>

                    {/* Hedging Advice */}
                    {prediction.hedgingAdvice && (
                      <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4">
                        <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest mb-2 flex items-center">
                          <Shield className="w-4 h-4 mr-2" />
                          Hedging Strategy
                        </h4>
                        <p className="text-sm text-slate-300 leading-relaxed font-normal">
                          {prediction.hedgingAdvice}
                        </p>
                      </div>
                    )}

                    {/* Discuss and reanalyze options */}
                    <div className="flex justify-end items-center gap-3 border-t border-slate-800 pt-4 mt-4">
                      {onDiscuss && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDiscuss();
                          }}
                          className="p-2.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded-lg transition-colors flex items-center gap-2 text-xs font-bold border border-amber-600/20"
                        >
                          <Zap className="w-3.5 h-3.5 fill-current" />
                          Discuss Matchup
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 2: Matchup */}
                {activeDetailTab === "matchup" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {/* Projected Score & Totals */}
                    {(prediction.scorePrediction || prediction.projectedTotal) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {prediction.scorePrediction && (
                          <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50 shadow-lg shadow-slate-950/20">
                            <div className="text-[10px] uppercase text-slate-500 font-black mb-3 tracking-widest flex justify-between items-center">
                              <span>Score Projection</span>
                              <Brain className="w-3 h-3 text-indigo-400" />
                            </div>
                            <div className="flex justify-between items-center bg-slate-950/50 p-4 rounded-lg border border-slate-900 ring-1 ring-white/5">
                              <div className="text-center flex-1">
                                <div className="text-[10px] text-slate-400 font-bold uppercase truncate mb-1">{game.awayTeam}</div>
                                <div className="text-2xl font-mono font-black text-indigo-400">{prediction.scorePrediction.away}</div>
                              </div>
                              <div className="px-4 text-slate-700 font-black italic text-sm">VS</div>
                              <div className="text-center flex-1">
                                <div className="text-[10px] text-slate-400 font-bold uppercase truncate mb-1">{game.homeTeam}</div>
                                <div className="text-2xl font-mono font-black text-indigo-400">{prediction.scorePrediction.home}</div>
                              </div>
                            </div>
                            {prediction.actualScore && (
                              <div className="mt-3 text-center p-2 bg-slate-900/50 rounded border border-slate-800">
                                 <div className="text-[8px] text-slate-500 font-bold uppercase mb-0.5 tracking-widest">Actual Score</div>
                                 <span className="text-white text-xs font-mono font-bold tracking-widest">
                                   {prediction.actualScore.away} - {prediction.actualScore.home}
                                 </span>
                              </div>
                            )}
                          </div>
                        )}
                        {prediction.projectedTotal && (
                          <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50 shadow-lg shadow-slate-950/20 flex flex-col justify-between">
                            <div>
                              <div className="text-[10px] uppercase text-slate-500 font-black mb-3 tracking-widest flex justify-between items-center">
                                <span>Predicted Total</span>
                                <Zap className="w-3 h-3 text-amber-400" />
                              </div>
                              <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-900 flex flex-col items-center justify-center">
                                <div className="text-3xl font-mono font-black text-amber-400 tracking-tighter mb-1">
                                  {prediction.projectedTotal}
                                </div>
                                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{game.league === 'MLB' ? 'Total Runs' : 'Total Game Points'}</div>
                              </div>
                            </div>
                            
                            {prediction.recommendedTotalLine && (
                              <div className="mt-3 p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg shadow-inner">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <ShieldCheck className="w-3 h-3 text-indigo-400" />
                                  <span className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">Safety Cushion</span>
                                </div>
                                <div className="text-sm font-black text-white flex items-center justify-between">
                                  <span className="text-slate-400 font-bold text-xs">Target Line:</span>
                                  <span className="bg-white/10 px-2 py-0.5 rounded text-indigo-300 ring-1 ring-white/10 ring-inset">
                                    {prediction.recommendedTotalLine}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Simulation metadata */}
                    {prediction.winProbability !== undefined && (
                      <div id="win-prob" className="flex items-center justify-between text-xs text-slate-450 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                        <div className="flex items-center">
                          <Activity className="w-3.5 h-3.5 mr-2 text-indigo-400" />
                          <span>{prediction.simulationCount ? (prediction.simulationCount / 1000).toFixed(0) + 'k' : '10k'} Monte Carlo Simulations</span>
                        </div>
                        <div className="font-mono text-indigo-400 font-bold">
                          {(prediction.winProbability * 100).toFixed(1)}% Win Probability
                        </div>
                      </div>
                    )}

                    {/* Standings rankings comparisons */}
                    {prediction.matchupRankings && (
                      <div className="bg-slate-800/40 p-5 rounded-xl border border-slate-700/50 shadow-inner">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                          <Activity className="w-3.5 h-3.5 text-indigo-400" />
                          Team Standings Rankings Comparisons
                        </h4>
                        <div className="space-y-5">
                          {[
                            { label: "Overall Strength", home: prediction.matchupRankings.homeRank, away: prediction.matchupRankings.awayRank },
                            { label: "Offensive Efficiency", home: prediction.matchupRankings.homeOffenseRank, away: prediction.matchupRankings.awayOffenseRank },
                            { label: "Defensive Efficiency", home: prediction.matchupRankings.homeDefenseRank, away: prediction.matchupRankings.awayDefenseRank }
                          ].map((stat, idx) => {
                            const homeVal = typeof stat.home === 'string' ? parseInt(stat.home) : stat.home;
                            const awayVal = typeof stat.away === 'string' ? parseInt(stat.away) : stat.away;
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
                                      className={cn("h-full rounded-full transition-all duration-1000", awayVal < homeVal ? "bg-indigo-500" : "bg-slate-700")}
                                      style={{ width: `${awayPercent}%` }}
                                    />
                                  </div>
                                  <div className="w-1 h-1 rounded-full bg-slate-700" />
                                  <div className="flex-1 bg-slate-900 rounded-full h-full overflow-hidden border border-slate-800/50">
                                    <div 
                                      className={cn("h-full rounded-full transition-all duration-1000", homeVal < awayVal ? "bg-indigo-500" : "bg-slate-700")}
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

                    {/* Team Statistical Comparison */}
                    {Array.isArray(prediction.teamStatsComparison) && prediction.teamStatsComparison.length > 0 && (
                      <div className="bg-slate-800/40 p-5 rounded-xl border border-slate-700/50 shadow-inner">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                          <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
                          Team Stats Comparison
                        </h4>
                        <div className="space-y-3">
                          {prediction.teamStatsComparison.map((stat, idx) => (
                            <div key={idx} className="flex items-center gap-4">
                              <div className={cn("w-16 text-right text-[11px] font-bold", stat.advantage === 'away' ? "text-indigo-400" : "text-slate-500")}>
                                {stat.awayValue}
                              </div>
                              <div className="flex-1 h-6 bg-slate-900 rounded-full overflow-hidden flex items-center relative border border-slate-800/50">
                                <div className="absolute inset-0 flex items-center justify-center z-10">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{stat.category}</span>
                                </div>
                                <div 
                                  className={cn("h-full transition-all duration-1000", stat.advantage === 'away' ? "bg-indigo-500/40" : "bg-slate-800/40")}
                                  style={{ width: '50%' }}
                                />
                                <div className="w-px h-full bg-slate-700 z-10" />
                                <div 
                                  className={cn("h-full transition-all duration-1000", stat.advantage === 'home' ? "bg-indigo-500/40" : "bg-slate-800/40")}
                                  style={{ width: '50%' }}
                                />
                              </div>
                              <div className={cn("w-16 text-left text-[11px] font-bold", stat.advantage === 'home' ? "text-indigo-400" : "text-slate-500")}>
                                {stat.homeValue}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 3: H2H */}
                {activeDetailTab === "h2h" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {/* H2H list */}
                    {Array.isArray(prediction.previousMatchups) && prediction.previousMatchups.length > 0 ? (
                      <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-5">
                        <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center">
                          <Activity className="w-4 h-4 mr-2" />
                          Recent Head-to-Head Matches
                        </h4>
                        <div className="space-y-3">
                          {prediction.previousMatchups.map((match, idx) => (
                            <div key={idx} className="flex flex-col border-b border-slate-850 last:border-0 pb-2 last:pb-0 hover:bg-slate-800/20 px-2 -mx-2 rounded transition-colors">
                              <div className="flex justify-between items-center text-xs">
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
                              {match.lineupChanges && (
                                <div className="mt-1 flex items-center gap-1.5">
                                  <div className="w-1 h-1 rounded-full bg-indigo-500/40" />
                                  <span className="text-[9px] text-slate-500 italic leading-tight">
                                    {match.lineupChanges}
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 bg-slate-900/50 p-4 rounded-xl border border-slate-800 text-center italic">
                        No recent head-to-head match details cached.
                      </div>
                    )}

                    {/* Home/Away Trends */}
                    {prediction.trends && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
                          <div className="text-[10px] uppercase text-slate-500 font-bold mb-2 tracking-wider">Home Trends</div>
                          <div className="flex flex-col gap-2">
                            {prediction.trends.homeVsExp && (
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-400">vs Exp:</span>
                                <span className="text-indigo-300 font-mono font-bold">{prediction.trends.homeVsExp}</span>
                              </div>
                            )}
                            {prediction.trends.homeTotal && (
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-400">Total:</span>
                                <span className="text-indigo-300 font-mono font-bold">{prediction.trends.homeTotal}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
                          <div className="text-[10px] uppercase text-slate-500 font-bold mb-2 tracking-wider">Away Trends</div>
                          <div className="flex flex-col gap-2">
                            {prediction.trends.awayVsExp && (
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-400">vs Exp:</span>
                                <span className="text-indigo-300 font-mono font-bold">{prediction.trends.awayVsExp}</span>
                              </div>
                            )}
                            {prediction.trends.awayTotal && (
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-400">Total:</span>
                                <span className="text-indigo-300 font-mono font-bold">{prediction.trends.awayTotal}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Matchup analysis text block */}
                    {prediction.matchupAnalysis && (
                      <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-5">
                        <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Zap className="w-4 h-4 fill-current" />
                          Matchup Engine Records & Standings Analysis
                        </h4>
                        
                        <div className="space-y-4">
                          {prediction.matchupAnalysis.h2h && (
                            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800/50">
                              <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">H2H Splits & Narrative</span>
                              <p className="text-xs text-slate-300 leading-relaxed font-normal">{prediction.matchupAnalysis.h2h}</p>
                            </div>
                          )}
                          {prediction.matchupAnalysis.playerStats && (
                            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800/50">
                              <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Key Player Analysis</span>
                              <p className="text-xs text-slate-300 leading-relaxed font-normal">{prediction.matchupAnalysis.playerStats}</p>
                            </div>
                          )}
                          {prediction.matchupAnalysis.trends && (
                            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800/50">
                              <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Trends & Schedule Factors</span>
                              <p className="text-xs text-slate-300 leading-relaxed font-normal">{prediction.matchupAnalysis.trends}</p>
                            </div>
                          )}
                          {prediction.matchupAnalysis.confidenceBreakdown && (
                            <div className="bg-indigo-500/10 p-3 rounded-lg border border-indigo-500/20">
                              <span className="text-[10px] text-indigo-400 font-bold uppercase block mb-1">Confidence Breakdown</span>
                              <p className="text-xs text-indigo-200 leading-relaxed font-medium italic">
                                "{prediction.matchupAnalysis.confidenceBreakdown}"
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 4: Injuries */}
                {activeDetailTab === "injuries" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {/* Injury list */}
                    {Array.isArray(prediction.injuries) && prediction.injuries.length > 0 ? (
                      <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-5 shadow-sm">
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
                      </div>
                    ) : (
                      <div className="text-xs text-slate-550 bg-slate-900/50 p-5 rounded-xl border border-slate-800 text-center italic">
                        No active injuries reported. Roster is fully healthy.
                      </div>
                    )}

                    {/* Custom player matchups */}
                    {Array.isArray(prediction.playerMatchups) && prediction.playerMatchups.length > 0 && (
                      <div className="bg-slate-800/40 p-5 rounded-xl border border-slate-700/50 shadow-inner">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-indigo-400" />
                          Key Player Matchups
                        </h4>
                        <div className="space-y-4">
                          {prediction.playerMatchups.map((matchup, idx) => (
                            <div key={idx} className="p-4 bg-slate-950/40 rounded-lg border border-slate-800/50 hover:border-indigo-500/20 transition-all group">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-black text-white tracking-tight">{matchup.matchup}</span>
                                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                  Advantage: {matchup.advantage}
                                </span>
                              </div>
                              <p className="text-xs text-slate-450 leading-relaxed group-hover:text-slate-350 transition-colors">
                                {matchup.analysis}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
