import React from "react";
import { Zap, Loader2, FileText, RefreshCw, X } from "lucide-react";
import { cn } from "../lib/utils";

interface SportControlsProps {
  league: string;
  analyzing: boolean;
  loading: boolean;
  isAdminUser: boolean;
  onAnalyze: (force?: boolean) => void;
  onDailyBriefing: () => void;
  onImportSchedule?: () => void;
  onStopAnalysis?: () => void;
}

export const SportControls: React.FC<SportControlsProps> = ({
  league,
  analyzing,
  loading,
  isAdminUser,
  onAnalyze,
  onDailyBriefing,
  onImportSchedule,
  onStopAnalysis,
}) => {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <button
        id="daily-briefing-btn"
        onClick={onDailyBriefing}
        disabled={analyzing || loading}
        className="flex items-center px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-slate-800 shadow-sm"
        title="Generate Daily Report"
      >
        <FileText className="w-3.5 h-3.5 mr-2 text-indigo-400" />
        Briefing
      </button>

      {onImportSchedule && isAdminUser && (
        <button
          onClick={onImportSchedule}
          disabled={analyzing || loading}
          className="flex items-center px-4 py-2 bg-slate-900 hover:bg-slate-800 text-amber-400 rounded-xl font-bold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-amber-500/20 shadow-sm"
          title="Import schedule via AI Search"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-2" />
          Import
        </button>
      )}

      {isAdminUser && (
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
          <button
            onClick={() => onAnalyze(false)}
            disabled={analyzing || loading}
            className={cn(
              "flex items-center px-4 py-2 rounded-lg font-bold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed",
              analyzing 
                ? "bg-indigo-600 text-white animate-pulse" 
                : "bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20"
            )}
          >
            {analyzing ? (
              <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 mr-2" />
            )}
            {analyzing ? `Analyzing...` : `Analyze`}
          </button>

          {!analyzing && (
            <button
              onClick={() => onAnalyze(true)}
              disabled={loading}
              className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-all"
              title="Force re-analyze all games"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          {onStopAnalysis && analyzing && (
            <button
              onClick={onStopAnalysis}
              className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
              title="Stop current analysis"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
