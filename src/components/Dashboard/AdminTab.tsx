import React, { useState } from 'react';
import { qaService, QAResult } from '../../services/qaService';
import { CheckCircle2, XCircle, AlertCircle, Play, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface AdminTabProps {
  debugLogs: string[];
}

export const AdminTab: React.FC<AdminTabProps> = ({ debugLogs }) => {
  const [qaResults, setQaResults] = useState<QAResult[]>([]);
  const [isRunningQA, setIsRunningQA] = useState(false);

  const runQA = async () => {
    setIsRunningQA(true);
    try {
      const results = await qaService.runFullAudit();
      setQaResults(results);
    } catch (error) {
      console.error("QA Audit failed:", error);
    } finally {
      setIsRunningQA(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Quality Assurance Engine</h2>
            <p className="text-slate-400">Run a comprehensive check on all system features and integrations.</p>
          </div>
          <button
            onClick={runQA}
            disabled={isRunningQA}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20"
          >
            {isRunningQA ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Running Audit...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Run Full QA Check
              </>
            )}
          </button>
        </div>

        {qaResults.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {qaResults.map((result, idx) => (
              <div 
                key={idx} 
                className={cn(
                  "p-4 rounded-2xl border flex items-start gap-4 transition-all",
                  result.status === 'pass' ? "bg-emerald-500/5 border-emerald-500/20" :
                  result.status === 'fail' ? "bg-rose-500/5 border-rose-500/20" :
                  "bg-amber-500/5 border-amber-500/20"
                )}
              >
                <div className="mt-1">
                  {result.status === 'pass' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                  {result.status === 'fail' && <XCircle className="w-5 h-5 text-rose-500" />}
                  {result.status === 'warning' && <AlertCircle className="w-5 h-5 text-amber-500" />}
                </div>
                <div>
                  <h4 className="font-bold text-slate-200 text-sm">{result.name}</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{result.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          System Diagnostics
        </h3>
        <div className="bg-black/50 rounded-2xl p-6 font-mono text-xs h-80 overflow-y-auto space-y-2 border border-slate-800/50">
          {debugLogs.map((log, i) => (
            <div key={i} className="text-slate-500 border-b border-slate-900/50 pb-2 last:border-0">
              <span className="text-indigo-500/50 mr-2">[{i.toString().padStart(3, '0')}]</span>
              {log}
            </div>
          ))}
          {debugLogs.length === 0 && <div className="text-slate-600 italic">No diagnostic logs available...</div>}
        </div>
      </div>
    </div>
  );
};
