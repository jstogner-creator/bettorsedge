import React from 'react';

interface AdminTabProps {
  debugLogs: string[];
}

export const AdminTab: React.FC<AdminTabProps> = ({ debugLogs }) => {
  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
        <h2 className="text-2xl font-bold text-white mb-2">System Diagnostics</h2>
        <p className="text-slate-400 mb-6">Verify API connections and system health.</p>
        <div className="bg-black rounded-lg p-4 font-mono text-xs h-64 overflow-y-auto space-y-1">
          {debugLogs.map((log, i) => (
            <div key={i} className="text-slate-400 border-b border-slate-900 pb-1">
              {log}
            </div>
          ))}
          {debugLogs.length === 0 && <div className="text-slate-600 italic">No logs yet...</div>}
        </div>
      </div>
    </div>
  );
};
