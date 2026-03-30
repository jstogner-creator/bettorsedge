import React from "react";
import { Zap, Loader2, FileText, RefreshCw } from "lucide-react";

interface SportControlsProps {
  league: string;
  analyzing: boolean;
  loading: boolean;
  onAnalyze: (force?: boolean) => void;
  onDailyBriefing: () => void;
  onImportSchedule?: () => void;
  onStopAnalysis?: () => void;
}

export const SportControls: React.FC<SportControlsProps> = ({
  league,
  analyzing,
  loading,
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
        className="flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-slate-700 shadow-lg"
        title="Generate Daily Report"
      >
        <FileText className="w-4 h-4 mr-2 text-indigo-400" />
        Daily Briefing
      </button>

      {onImportSchedule && (
        <button
          onClick={onImportSchedule}
          disabled={analyzing || loading}
          className="flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-amber-500/30"
          title="Import schedule via AI Search"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Import Schedule
        </button>
      )}

      <button
        onClick={() => onAnalyze(false)}
        disabled={analyzing || loading}
        className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
      >
        {analyzing ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Zap className="w-4 h-4 mr-2" />
        )}
        {analyzing ? `Analyzing ${league}...` : `Analyze ${league} Games`}
      </button>

      {!analyzing && (
        <button
          onClick={() => onAnalyze(true)}
          disabled={loading}
          className="flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-500/30 ml-2"
          title="Force re-analyze all games"
        >
          Force Re-analyze
        </button>
      )}

      {onStopAnalysis && analyzing && (
        <button
          onClick={onStopAnalysis}
          className="flex items-center px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors shadow-lg shadow-red-500/20 ml-2"
          title="Stop current analysis"
        >
          Stop Analysis
        </button>
      )}
    </div>
  );
};
