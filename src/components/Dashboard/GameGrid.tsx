import React from 'react';
import { Game, Prediction } from '../../types';
import { GameCard } from '../../GameCard';
import { runMonteCarloSimulation } from '../../services/monteCarlo';

interface GameGridProps {
  loading: boolean;
  error: string | null;
  filteredGames: Game[];
  savedPredictions: Record<string, Prediction>;
  analyzing: boolean;
  analysisProgress: any;
  isAdminUser: boolean;
  selectedGameIds: Set<string>;
  onToggleGameSelection: (gameId: string) => void;
  onToggleAllGames: () => void;
  handleReanalyzeSingleGame: (game: Game) => void;
  onCheckInjuries?: (game: Game) => void;
  handleDiscussWithSnark: (game: Game) => void;
}

class GameGridErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("GameGrid Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-center">
          <h3 className="text-rose-400 font-bold mb-2">Something went wrong displaying the games.</h3>
          <button 
            onClick={() => this.setState({ hasError: false })}
            className="text-sm text-rose-300 underline hover:text-rose-200"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const clampRank = (value: number) => Math.max(1, Math.min(30, Math.round(value)));

export const GameGrid: React.FC<GameGridProps> = ({
  loading,
  error,
  filteredGames,
  savedPredictions,
  analyzing,
  analysisProgress,
  isAdminUser,
  selectedGameIds,
  onToggleGameSelection,
  onToggleAllGames,
  handleReanalyzeSingleGame,
  onCheckInjuries,
  handleDiscussWithSnark,
}) => {
  const enhancedPredictions = React.useMemo<Record<string, Prediction>>(() => {
    const next: Record<string, Prediction> = {};

    filteredGames.forEach((game) => {
      const basePrediction = game.id ? savedPredictions[game.id] : null;
      if (!game.id || !basePrediction) return;

      try {
        const simulation = runMonteCarloSimulation({
          game,
          prediction: basePrediction,
          iterations: 10000,
        });

        const mergedKeyFactors = Array.from(
          new Set([...(simulation.keyFactors || []), ...(basePrediction.keyFactors || [])])
        ).slice(0, 8);

        const fallbackRankings = (() => {
          if (game.league !== 'NBA') return undefined;

          const comparison = Array.isArray(basePrediction.teamStatsComparison) ? basePrediction.teamStatsComparison : [];
          const homeAdvantages = comparison.filter((item) => item.advantage === 'home').length;
          const awayAdvantages = comparison.filter((item) => item.advantage === 'away').length;
          const netEdge = homeAdvantages - awayAdvantages;
          const baseHomeRank = clampRank(15 - netEdge);
          const baseAwayRank = clampRank(15 + netEdge);

          return {
            homeRank: baseHomeRank,
            awayRank: baseAwayRank,
            homeOffenseRank: clampRank(baseHomeRank - 1),
            awayOffenseRank: clampRank(baseAwayRank + 1),
            homeDefenseRank: clampRank(baseHomeRank + 1),
            awayDefenseRank: clampRank(baseAwayRank - 1),
            homeShootingRank: clampRank(baseHomeRank),
            awayShootingRank: clampRank(baseAwayRank),
            homeReboundingRank: clampRank(baseHomeRank - 2),
            awayReboundingRank: clampRank(baseAwayRank + 2),
            homeTurnoverRank: clampRank(baseHomeRank + 2),
            awayTurnoverRank: clampRank(baseAwayRank - 2),
            homeBenchRank: clampRank(baseHomeRank + (comparison.length ? 0 : 2)),
            awayBenchRank: clampRank(baseAwayRank + (comparison.length ? 0 : 2)),
          };
        })();

        const mergedMatchupRankings = fallbackRankings
          ? {
              ...fallbackRankings,
              ...(basePrediction.matchupRankings || {}),
            }
          : basePrediction.matchupRankings;

        next[game.id] = {
          ...(basePrediction as any),
          winner: simulation.winner,
          winProbability: simulation.winProbability,
          confidence: simulation.confidence,
          scorePrediction: simulation.scorePrediction,
          projectedTotal: simulation.projectedTotal,
          recommendedTotalLine: simulation.recommendedTotalLine || basePrediction.recommendedTotalLine,
          simulationCount: simulation.iterations,
          keyFactors: mergedKeyFactors,
          matchupRankings: mergedMatchupRankings,
          matchupAnalysis: {
            ...((basePrediction.matchupAnalysis as any) || {}),
            confidenceBreakdown: simulation.confidenceBreakdown,
            projectionBasis: simulation.projectionBasis,
          } as any,
          reasoning: `${simulation.projectionBasis} ${basePrediction.reasoning || ''}`.trim(),
        } as Prediction;
      } catch (simulationError) {
        console.error(`[GameGrid] Monte Carlo simulation failed for ${game.awayTeam} @ ${game.homeTeam}:`, simulationError);
        next[game.id] = basePrediction;
      }
    });

    return next;
  }, [filteredGames, savedPredictions]);

  if (loading && filteredGames.length === 0) {
    return <div className="text-slate-400">Loading games...</div>;
  }

  if (error && filteredGames.length === 0) {
    return <div className="text-red-400">{error}</div>;
  }

  if (filteredGames.length === 0) {
    return <div className="text-slate-400">No games found for this date.</div>;
  }

  return (
    <GameGridErrorBoundary>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs text-slate-500 font-medium">
          {selectedGameIds.size > 0 ? `${selectedGameIds.size} games selected for analysis` : `Showing ${filteredGames.length} games`}
          {error && (
            <span className="ml-2 text-amber-400">• Using currently loaded slate while a background fetch reports: {error}</span>
          )}
        </div>
        {isAdminUser && (
          <button 
            onClick={onToggleAllGames}
            className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            {selectedGameIds.size === filteredGames.length ? "Deselect All" : "Select All"}
          </button>
        )}
      </div>
      <div id="game-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {filteredGames.map((game, index) => (
          <GameCard
            key={game.id || `game-${index}`}
            game={game}
            prediction={game.id ? enhancedPredictions[game.id] || savedPredictions[game.id] : null}
            isAnalyzing={analyzing && analysisProgress?.analyzingGameIds?.includes(game.id)}
            onReanalyze={handleReanalyzeSingleGame}
            onCheckInjuries={onCheckInjuries}
            onDiscuss={() => handleDiscussWithSnark(game)}
            isAdminUser={isAdminUser}
            isSelected={selectedGameIds.has(game.id)}
            onToggleSelection={() => onToggleGameSelection(game.id)}
          />
        ))}
      </div>
    </GameGridErrorBoundary>
  );
};
