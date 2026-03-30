import React, { useMemo, useState, useEffect } from 'react';
import { Prediction } from '../types';
import { format, parseISO } from 'date-fns';
import { CheckCircle, XCircle, MinusCircle, Activity, TrendingUp, Filter, RefreshCw, AlertTriangle, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import { sportsOracle } from '../services/gemini';
import Markdown from 'react-markdown';

interface AccuracyTabProps {
  predictions: Record<string, Prediction>;
  onSyncPending?: () => void;
  isSyncing?: boolean;
}

export const AccuracyTab: React.FC<AccuracyTabProps> = ({ predictions, onSyncPending, isSyncing }) => {
  const [filterLeague, setFilterLeague] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'LOCKS'>('ALL');
  const [filterTime, setFilterTime] = useState<'ALL' | '2WEEKS'>('2WEEKS');
  const [performanceAnalysis, setPerformanceAnalysis] = useState<string | null>(null);
  const [isAnalyzingPerformance, setIsAnalyzingPerformance] = useState(false);

  const handleAnalyzePerformance = async () => {
    setIsAnalyzingPerformance(true);
    try {
      const analysis = await sportsOracle.analyzeRecentPerformance(Object.values(predictions));
      setPerformanceAnalysis(analysis);
    } catch (error) {
      console.error("Failed to analyze performance:", error);
    } finally {
      setIsAnalyzingPerformance(false);
    }
  };

  const resolvedPredictions = useMemo(() => {
    if (!predictions) {
      console.warn("[AccuracyTab] Predictions prop is null or undefined");
      return [];
    }
    
    try {
      return Object.values(predictions)
        .filter(p => p && p.winner)
        .sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA;
        });
    } catch (e) {
      console.error("[AccuracyTab] Error calculating resolvedPredictions:", e);
      return [];
    }
  }, [predictions]);

  const filteredPredictions = useMemo(() => {
    let filtered = resolvedPredictions;
    
    console.log("[AccuracyTab] Filtering predictions. Total resolved:", resolvedPredictions.length);
    console.log("[AccuracyTab] Current Filters:", { filterTime, filterLeague, filterType });

    if (filterTime === '2WEEKS') {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      filtered = filtered.filter(p => {
        if (!p.date) return false;
        try {
          return new Date(p.date) >= twoWeeksAgo;
        } catch (e) {
          return false;
        }
      });
      console.log("[AccuracyTab] After time filter (2 weeks):", filtered.length);
    }
    
    if (filterLeague !== 'ALL') {
      filtered = filtered.filter(p => p.league === filterLeague);
      console.log("[AccuracyTab] After league filter:", filtered.length);
    }
    
    if (filterType === 'LOCKS') {
      filtered = filtered.filter(p => {
        const confidence = typeof p.confidence === 'string' ? parseFloat(p.confidence) : p.confidence;
        const isLock = (confidence !== undefined && !isNaN(confidence) && confidence >= 7);
        return isLock;
      });
      console.log("[AccuracyTab] After type filter (LOCKS):", filtered.length);
    }
    
    return filtered;
  }, [resolvedPredictions, filterLeague, filterType, filterTime]);

  useEffect(() => {
    console.log("[AccuracyTab] Mounted with predictions:", predictions.length);
  }, []);

  useEffect(() => {
    console.log("[AccuracyTab] Filtered Predictions Updated:", filteredPredictions.length);
  }, [filteredPredictions]);

  const stats = useMemo(() => {
    let correct = 0;
    let incorrect = 0;
    let push = 0;
    let pending = 0;
    let passed = 0;

    filteredPredictions.forEach(p => {
      const confidence = typeof p.confidence === 'string' ? parseFloat(p.confidence) : p.confidence;
      const isPass = (confidence !== undefined && !isNaN(confidence) && confidence < 7) || p.winner?.toUpperCase() === 'PASS';
      
      if (isPass) {
        passed++;
      } else if (p.outcome === 'correct') {
        correct++;
      } else if (p.outcome === 'incorrect') {
        incorrect++;
      } else if (p.outcome === 'push') {
        push++;
      } else {
        pending++;
      }
    });

    const resolvedPicks = correct + incorrect;
    // For Locks Only, we don't want to include "passed" in the total resolved count if they were filtered out
    const totalResolved = correct + incorrect + push + (filterType === 'LOCKS' ? 0 : passed);
    const winPercentage = resolvedPicks > 0 ? ((correct / resolvedPicks) * 100).toFixed(1) : '0.0';

    return { correct, incorrect, push, pending, passed, totalResolved, winPercentage };
  }, [filteredPredictions, filterType]);

  const leagues = ['ALL', ...Array.from(new Set(resolvedPredictions.map(p => p.league).filter(Boolean)))];

  return (
    <div className="py-8 space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center">
            <Activity className="w-6 h-6 mr-2 text-indigo-400" />
            Prediction Accuracy
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Track the performance of AI predictions across all resolved games.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg p-1">
            <button
              onClick={() => setFilterTime('2WEEKS')}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                filterTime === '2WEEKS'
                  ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              Last 2 Weeks
            </button>
            <button
              onClick={() => setFilterTime('ALL')}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                filterTime === 'ALL'
                  ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              All Time
            </button>
          </div>

          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg p-1">
            <button
              onClick={() => setFilterType('ALL')}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                filterType === 'ALL'
                  ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              All Matchups
            </button>
            <button
              onClick={() => setFilterType('LOCKS')}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                filterType === 'LOCKS'
                  ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              Locks Only
            </button>
          </div>

          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg p-1">
            {leagues.map(league => (
              <button
                key={league}
                onClick={() => setFilterLeague(league as string)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  filterLeague === league
                    ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
              >
                {league}
              </button>
            ))}
          </div>
          
          {onSyncPending && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={handleAnalyzePerformance}
                disabled={isAnalyzingPerformance || stats.incorrect === 0}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Analyze recent losses for patterns"
              >
                {isAnalyzingPerformance ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
                <span className="text-sm font-medium">Weekend Review</span>
              </button>
              
              <button
                onClick={onSyncPending}
                disabled={isSyncing || stats.pending === 0}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Check for completed games and update pending predictions"
              >
                <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
                <span className="text-sm font-medium">Sync Pending</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {performanceAnalysis && (
        <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-6 shadow-lg animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 rounded-lg">
                <FileText className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Performance Post-Mortem</h3>
                <p className="text-xs text-slate-400">Systemic analysis of recent failed predictions</p>
              </div>
            </div>
            <button 
              onClick={() => setPerformanceAnalysis(null)}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <MinusCircle className="w-5 h-5" />
            </button>
          </div>
          <div className="prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed markdown-body">
            {performanceAnalysis ? (
              <Markdown>{performanceAnalysis}</Markdown>
            ) : (
              <p className="italic text-slate-500">No analysis available.</p>
            )}
          </div>
          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
              Strategy Adjustment: Active
            </p>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest">
                Learning Mode Enabled
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-cyan-500 opacity-50" />
          <span className="text-slate-400 text-sm font-medium mb-2">
            {filterType === 'LOCKS' ? 'Lock Win Rate' : 'Overall Win Rate'}
          </span>
          <div className="text-4xl font-bold text-white flex items-center">
            {stats.winPercentage}%
            <TrendingUp className="w-6 h-6 ml-2 text-indigo-400 group-hover:translate-y-[-2px] transition-transform" />
          </div>
          {filterType === 'LOCKS' && (
            <div className="mt-2 text-[10px] text-amber-500 font-bold uppercase tracking-widest">
              High Confidence Only
            </div>
          )}
        </div>
        <div className="bg-slate-900 border border-emerald-500/20 rounded-xl p-6 flex flex-col items-center justify-center">
          <span className="text-emerald-400/80 text-sm font-medium mb-2">Correct</span>
          <div className="text-4xl font-bold text-emerald-400 flex items-center">
            {stats.correct}
            <CheckCircle className="w-6 h-6 ml-2 opacity-50" />
          </div>
        </div>
        <div className="bg-slate-900 border border-rose-500/20 rounded-xl p-6 flex flex-col items-center justify-center">
          <span className="text-rose-400/80 text-sm font-medium mb-2">Incorrect</span>
          <div className="text-4xl font-bold text-rose-400 flex items-center">
            {stats.incorrect}
            <XCircle className="w-6 h-6 ml-2 opacity-50" />
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6 flex flex-col items-center justify-center">
          <span className="text-slate-400 text-sm font-medium mb-2">Total Resolved</span>
          <div className="text-4xl font-bold text-white flex items-center">
            {stats.totalResolved}
          </div>
        </div>
        <div className="bg-slate-900 border border-amber-500/20 rounded-xl p-6 flex flex-col items-center justify-center">
          <span className="text-amber-400/80 text-sm font-medium mb-2">Pending</span>
          <div className="text-4xl font-bold text-amber-400 flex items-center">
            {stats.pending}
            <MinusCircle className="w-6 h-6 ml-2 opacity-50" />
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 bg-slate-800/50">
          <h3 className="font-bold text-white">Resolved Games History</h3>
        </div>
        
        {filteredPredictions.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            No resolved predictions found for the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500 bg-slate-900/50">
                  <th className="p-4 font-medium">Date</th>
                  <th className="p-4 font-medium">League</th>
                  <th className="p-4 font-medium">Matchup</th>
                  <th className="p-4 font-medium">Prediction</th>
                  <th className="p-4 font-medium">Confidence</th>
                  <th className="p-4 font-medium">Result</th>
                  <th className="p-4 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredPredictions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-500 italic">
                      No resolved matchups found for the selected filters.
                    </td>
                  </tr>
                ) : filteredPredictions.map((p) => {
                  const confidence = typeof p.confidence === 'string' ? parseFloat(p.confidence) : p.confidence;
                  const isCorrect = p.outcome === 'correct';
                  const isPush = p.outcome === 'push';
                  const isPass = (confidence !== undefined && !isNaN(confidence) && confidence < 7) || p.winner?.toUpperCase() === 'PASS';
                  const isPending = !p.outcome && !isPass;
                  
                  return (
                    <tr key={p.gameId || (p as any).id || Math.random().toString()} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-4 text-sm text-slate-400 whitespace-nowrap">
                        {p.date ? (() => {
                          try {
                            return format(parseISO(p.date), 'MMM d, yyyy');
                          } catch (e) {
                            console.error("[AccuracyTab] Date parse error:", e, p.date);
                            return p.date;
                          }
                        })() : 'Unknown'}
                      </td>
                      <td className="p-4">
                        <span className="text-xs font-mono bg-slate-800 text-slate-300 px-2 py-1 rounded">
                          {p.league || 'N/A'}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-medium text-white">
                          {p.awayTeam || 'Away'} @ {p.homeTeam || 'Home'}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-bold text-indigo-400">
                          {isPass ? "PASS (Too Close to Call)" : p.winner}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm text-slate-300">
                          {p.confidence}/10
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm text-slate-300 whitespace-nowrap">
                          {p.actualWinner ? (
                            <span>{p.actualWinner} Won</span>
                          ) : p.actualScore ? (
                            <span>{p.actualScore.away} - {p.actualScore.home}</span>
                          ) : (
                            <span className="text-slate-500">N/A</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className={cn(
                          "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                          isPass ? "bg-slate-500/10 text-slate-400 border border-slate-500/20" :
                          isPending ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                          isCorrect ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                          isPush ? "bg-slate-500/10 text-slate-400 border border-slate-500/20" :
                          "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        )}>
                          {isPass ? <MinusCircle className="w-3 h-3 mr-1.5" /> :
                           isPending ? <MinusCircle className="w-3 h-3 mr-1.5" /> :
                           isCorrect ? <CheckCircle className="w-3 h-3 mr-1.5" /> : 
                           isPush ? <MinusCircle className="w-3 h-3 mr-1.5" /> : 
                           <XCircle className="w-3 h-3 mr-1.5" />}
                          {isPass ? 'PASS' : isPending ? 'Pending' : p.outcome}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
