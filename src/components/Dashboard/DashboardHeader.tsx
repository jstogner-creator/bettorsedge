import React from 'react';
import { format, addDays } from 'date-fns';
import { Activity, Calendar as CalendarIcon } from 'lucide-react';
import { SportControls } from '../SportControls';
import { cn } from '../../lib/utils';

interface DashboardHeaderProps {
  activeTab: string;
  isAdminUser: boolean;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  handleRefresh: () => void;
  analyzing: boolean;
  loading: boolean;
  handleAutoAnalyze: (force?: boolean) => void;
  setIsBriefingOpen: (open: boolean) => void;
  handleImportSchedule: () => void;
  handleStopAnalysis: () => void;
  apiSportsStatus?: { status: 'idle' | 'loading' | 'success' | 'error', count: number, message?: string };
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  activeTab,
  isAdminUser,
  selectedDate,
  setSelectedDate,
  handleRefresh,
  analyzing,
  loading,
  handleAutoAnalyze,
  setIsBriefingOpen,
  handleImportSchedule,
  handleStopAnalysis,
  apiSportsStatus,
}) => {
  return (
    <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-2xl font-bold text-white">{activeTab} Schedule</h2>
          {isAdminUser && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold rounded-lg border border-slate-700 transition-all flex items-center gap-2"
              >
                <Activity className="w-3 h-3" />
                Refresh
              </button>
              
              {activeTab === "NBA" && apiSportsStatus && (
                <div className={cn(
                  "px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg border flex items-center gap-2",
                  apiSportsStatus.status === 'success' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                  apiSportsStatus.status === 'error' ? "bg-rose-500/10 border-rose-500/20 text-rose-400" :
                  "bg-slate-800 border-slate-700 text-slate-400"
                )}>
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    apiSportsStatus.status === 'success' ? "bg-emerald-500 animate-pulse" :
                    apiSportsStatus.status === 'error' ? "bg-rose-500" :
                    "bg-slate-500"
                  )} />
                  API-Sports: {apiSportsStatus.status === 'success' ? `${apiSportsStatus.count} Games` : 
                                apiSportsStatus.status === 'error' ? "Error" : "Idle"}
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-slate-400 text-sm flex items-center">
          <CalendarIcon className="w-4 h-4 mr-2" />
          {format(selectedDate, "EEEE, MMMM do, yyyy")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {isAdminUser && (
          <SportControls
            league={activeTab}
            analyzing={analyzing}
            loading={loading}
            onAnalyze={(force) => handleAutoAnalyze(force)}
            onDailyBriefing={() => setIsBriefingOpen(true)}
            onImportSchedule={handleImportSchedule}
            onStopAnalysis={handleStopAnalysis}
          />
        )}
        <button
          onClick={() => setSelectedDate(addDays(new Date(), -1))}
          className="px-4 py-2 rounded-lg text-sm bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
        >
          Yesterday
        </button>
        <button
          onClick={() => setSelectedDate(new Date())}
          className="px-4 py-2 rounded-lg text-sm bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
        >
          Today
        </button>
        <button
          onClick={() => setSelectedDate(addDays(new Date(), 1))}
          className="px-4 py-2 rounded-lg text-sm bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
        >
          Tomorrow
        </button>
      </div>
    </div>
  );
};
