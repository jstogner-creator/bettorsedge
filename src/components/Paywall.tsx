import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, Check, Zap, Trophy, Activity, Target, LogOut, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { logout } from '../firebase';

interface PaywallProps {
  onSubscribe: (sports: string[]) => Promise<void>;
  initialSports?: string[];
  existingSports?: string[];
}

const AVAILABLE_SPORTS = [
  { id: 'NBA', name: 'NBA Basketball', icon: Trophy },
  { id: 'NFL', name: 'NFL Football', icon: Activity },
  { id: 'NCAA', name: 'NCAA Basketball', icon: Trophy },
  { id: 'MLB', name: 'MLB Baseball', icon: Target },
  { id: 'NHL', name: 'NHL Hockey', icon: Zap },
];

export function Paywall({ onSubscribe, initialSports = ['NBA'], existingSports = [] }: PaywallProps) {
  const [selectedSports, setSelectedSports] = useState<string[]>(initialSports);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSport = (id: string) => {
    if (existingSports.includes(id)) return; // Cannot unselect already subscribed sports
    setError(null);
    setSelectedSports(prev => 
      prev.includes(id) 
        ? prev.filter(s => s !== id)
        : [...prev, id]
    );
  };

  const calculatePrice = () => {
    if (selectedSports.length === 0) return 0;
    return 12 + (selectedSports.length - 1) * 9;
  };

  const handleSubscribe = async () => {
    const newSports = selectedSports.filter(s => !existingSports.includes(s));
    if (newSports.length === 0 || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      await onSubscribe(selectedSports); // Pass all sports so webhook updates correctly
    } catch (err: any) {
      console.error('Subscription failed:', err);
      setError(err.message || "Failed to initiate subscription. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const newSportsCount = selectedSports.filter(s => !existingSports.includes(s)).length;

  return (
    <div className="flex-1 flex items-center justify-center p-4 py-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative"
      >
        <button 
          onClick={() => handleLogout().catch(console.error)}
          className="absolute top-6 right-6 p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-full transition-colors"
          title="Sign Out"
        >
          <LogOut className="w-5 h-5" />
        </button>
        <div className="p-8 md:p-12">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center">
              <Lock className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Unlock Premium Analysis</h2>
              <p className="text-slate-400">Choose your sports and get professional-grade analysis.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
            {AVAILABLE_SPORTS.map((sport) => {
              const Icon = sport.icon;
              const isSelected = selectedSports.includes(sport.id);
              const isExisting = existingSports.includes(sport.id);
              return (
                <button
                  key={sport.id}
                  onClick={() => toggleSport(sport.id)}
                  disabled={isExisting}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-2xl border transition-all text-left",
                    isExisting
                      ? "bg-slate-800/80 border-slate-700 text-slate-500 cursor-not-allowed"
                      : isSelected 
                        ? "bg-amber-500/10 border-amber-500 text-white shadow-[0_0_20px_-5px_rgba(245,158,11,0.3)]" 
                        : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    isExisting ? "bg-slate-700 text-slate-500" : isSelected ? "bg-amber-500 text-slate-900" : "bg-slate-700 text-slate-400"
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold">{sport.name}</p>
                    <p className="text-xs opacity-70">
                      {isExisting ? 'Already Subscribed' : isSelected ? 'Selected' : 'Click to add'}
                    </p>
                  </div>
                  {isSelected && !isExisting && <Check className="w-5 h-5 text-amber-500" />}
                  {isExisting && <Check className="w-5 h-5 text-slate-500" />}
                </button>
              );
            })}
          </div>

          <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 mb-8">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-400">
                {existingSports.length > 0 ? "New Monthly Total" : "Monthly Total"}
              </span>
              <div className="text-right">
                <span className="text-3xl font-bold text-white">${calculatePrice()}</span>
                <span className="text-slate-500 text-sm ml-1">/mo</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Check className="w-3 h-3 text-emerald-500" />
                <span>$12.00 for the first sport</span>
              </div>
              {selectedSports.length > 1 && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Check className="w-3 h-3 text-emerald-500" />
                  <span>$9.00 per additional sport (x{selectedSports.length - 1})</span>
                </div>
              )}
              {existingSports.length > 0 && newSportsCount > 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-400 mt-2 pt-2 border-t border-slate-700/50">
                  <Zap className="w-3 h-3" />
                  <span>This will replace your existing subscription.</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => handleSubscribe().catch(console.error)}
            disabled={newSportsCount === 0 || isLoading}
            className="w-full h-14 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 font-bold rounded-2xl transition-all flex items-center justify-center gap-2 text-lg"
          >
            {isLoading ? (
              <Activity className="w-6 h-6 animate-spin" />
            ) : (
              <>
                {existingSports.length > 0 ? "Upgrade Subscription" : "Subscribe Now"}
                <Zap className="w-5 h-5 fill-current" />
              </>
            )}
          </button>
          
          {error && (
            <div className="mt-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}
          
          <p className="text-center text-xs text-slate-500 mt-6">
            Secure payment via Stripe. Cancel anytime.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
