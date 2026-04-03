import React, { useState, useEffect } from "react";
import { X, Loader2, FileText, ShieldCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { bettorsEdge } from "../services/gemini";
import Markdown from "react-markdown";

interface DailyBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
  league: string;
  date: Date;
  games: any[];
}

export function DailyBriefingModal({ isOpen, onClose, league, date, games }: DailyBriefingModalProps) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [healthCheck, setHealthCheck] = useState<{ status: string, details: string, latestDate?: string } | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  useEffect(() => {
    if (isOpen) {
      generateReport().catch(console.error);
      if (league === 'NBA') {
        runHealthCheck().catch(console.error);
      }
    } else {
      // Reset state when closed
      setReport(null);
      setError(null);
      setHealthCheck(null);
    }
  }, [isOpen, league, date]);

  const runHealthCheck = async () => {
    setCheckingHealth(true);
    try {
      const result = await bettorsEdge.checkSourceHealth();
      setHealthCheck(result);
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingHealth(false);
    }
  };

  const generateReport = async () => {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const generatedReport = await bettorsEdge.generateDailyBriefing(league, dateStr, games);
      setReport(generatedReport);
    } catch (err: any) {
      setError(err.message || "Failed to generate daily briefing.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <FileText className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{league} Daily Briefing</h2>
              <p className="text-sm text-slate-400">{format(date, "EEEE, MMMM do, yyyy")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {league === 'NBA' && (
            <div className="mb-6 p-4 bg-slate-800/50 border border-slate-700 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  checkingHealth ? 'bg-slate-700 animate-pulse' : 
                  healthCheck?.status === 'healthy' ? 'bg-emerald-500/20' : 
                  healthCheck?.status === 'degraded' ? 'bg-amber-500/20' : 'bg-rose-500/20'
                }`}>
                  {checkingHealth ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" /> :
                   healthCheck?.status === 'healthy' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
                   healthCheck?.status === 'degraded' ? <AlertCircle className="w-4 h-4 text-amber-400" /> :
                   <AlertCircle className="w-4 h-4 text-rose-400" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    NBA Injury Source Health
                    {healthCheck?.latestDate && (
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/30 font-mono">
                        Latest: {healthCheck.latestDate}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {checkingHealth ? 'Verifying access to Google Drive Injury Report...' : 
                     healthCheck?.details || 'Awaiting diagnostic check...'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => runHealthCheck().catch(console.error)}
                disabled={checkingHealth}
                className="text-[10px] uppercase tracking-wider font-bold text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
              >
                Re-Verify
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Loader2 className="w-10 h-10 animate-spin mb-4 text-indigo-500" />
              <p className="text-lg font-medium text-white">Generating Briefing...</p>
              <p className="text-sm mt-2 text-center max-w-md">
                Analyzing real-time data from ESPN, cross-referencing injuries, and evaluating market trends. This may take up to 30 seconds.
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 text-red-400">
              <p className="text-lg font-medium mb-4">{error}</p>
              <button 
                onClick={() => generateReport().catch(console.error)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors border border-slate-700"
              >
                Try Again
              </button>
            </div>
          ) : report ? (
            <div className="prose prose-invert max-w-none prose-indigo">
              <Markdown>{report}</Markdown>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
