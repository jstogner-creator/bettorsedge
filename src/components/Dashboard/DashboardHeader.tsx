import React from 'react';
import { format, addDays, isSameDay } from 'date-fns';
import { Activity, Calendar as CalendarIcon, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
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
  timeFilter: "all" | "early" | "afternoon" | "late";
  setTimeFilter: (filter: "all" | "early" | "afternoon" | "late") => void;
  apiSportsStatus?: { status: 'idle' | 'loading' | 'success' | 'error', count: number, message?: string };
  selectedCount: number;
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
  timeFilter,
  setTimeFilter,
  apiSportsStatus,
  selectedCount,
}) => {
  const isToday = isSameDay(selectedDate, new Date());

  return (
    <div className="mb-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-black text-white tracking-tight">{activeTab}</h2>
            <div className="text-xs text-white">Admin: {isAdminUser ? 'Yes' : 'No'}</div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-indigo-400 rounded-xl border border-slate-800 transition-all shadow-sm"
                title="Refresh Schedule"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              
              {isAdminUser && activeTab === "NBA" && apiSportsStatus && (
                <div className={cn(
                    "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-xl border flex items-center gap-2 shadow-sm",
                    apiSportsStatus.status === 'success' ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400" :
                    apiSportsStatus.status === 'error' ? "bg-rose-500/5 border-rose-500/10 text-rose-400" :
                    "bg-slate-900 border-slate-800 text-slate-400"
                  )}>
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      apiSportsStatus.status === 'success' ? "bg-emerald-500 animate-pulse" :
                      apiSportsStatus.status === 'error' ? "bg-rose-500" :
                      "bg-slate-500"
                    )} />
                    API: {apiSportsStatus.status === 'success' ? `${apiSportsStatus.count} Games` : 
                                  apiSportsStatus.status === 'error' ? "Error" : "Idle"}
                  </div>
                )}
              </div>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <CalendarIcon className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-medium">{format(selectedDate, "EEEE, MMMM do, yyyy")}</span>
            {isToday && (
              <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[10px] font-bold rounded-full uppercase tracking-wider">
                Today
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Date Navigation Group */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-2xl p-1 shadow-sm">
            <button
              onClick={() => setSelectedDate(addDays(selectedDate, -1))}
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors"
              title="Previous Day"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <div className="h-4 w-px bg-slate-800 mx-1" />
            
            <button
              onClick={() => setSelectedDate(new Date())}
              className={cn(
                "px-4 py-2 text-sm font-bold rounded-xl transition-all",
                isToday 
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              Today
            </button>
            
            <div className="h-4 w-px bg-slate-800 mx-1" />
            
            <button
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors"
              title="Next Day"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-2xl p-1 shadow-sm">
            <button
              onClick={() => setTimeFilter("all")}
              className={cn(
                "px-3 py-1.5 text-[10px] font-bold rounded-xl transition-all uppercase tracking-wider",
                timeFilter === "all" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
              )}
            >
              All
            </button>
            <button
              onClick={() => setTimeFilter("early")}
              className={cn(
                "px-3 py-1.5 text-[10px] font-bold rounded-xl transition-all uppercase tracking-wider",
                timeFilter === "early" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
              )}
            >
              Early
            </button>
            <button
              onClick={() => setTimeFilter("afternoon")}
              className={cn(
                "px-3 py-1.5 text-[10px] font-bold rounded-xl transition-all uppercase tracking-wider",
                timeFilter === "afternoon" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
              )}
            >
              Afternoon
            </button>
            <button
              onClick={() => setTimeFilter("late")}
              className={cn(
                "px-3 py-1.5 text-[10px] font-bold rounded-xl transition-all uppercase tracking-wider",
                timeFilter === "late" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
              )}
            >
              Evening
            </button>
          </div>

          {isAdminUser && (
            <div className="h-8 w-px bg-slate-800 hidden md:block mx-2" />
          )}

          <SportControls
            league={activeTab}
            analyzing={analyzing}
            loading={loading}
            isAdminUser={isAdminUser}
            onAnalyze={(force) => handleAutoAnalyze(force)}
            onDailyBriefing={() => setIsBriefingOpen(true)}
            onImportSchedule={handleImportSchedule}
            onStopAnalysis={handleStopAnalysis}
            selectedCount={selectedCount}
          />
        </div>
      </div>
    </div>
  );
};
