import React, { useState, useEffect } from "react";
import { Calculator, TrendingUp, Shield, Info } from "lucide-react";
import { cn } from "../lib/utils";

interface BetSimulatorProps {
  yesPrice: number; // 0.01 to 0.99
  noPrice: number;  // 0.01 to 0.99
  predictionConfidence: number; // 1-10
  favoredTeam: string;
}

export const BetSimulator: React.FC<BetSimulatorProps> = ({ 
  yesPrice, 
  noPrice, 
  predictionConfidence,
  favoredTeam
}) => {
  const [betAmount, setBetAmount] = useState<number>(100);
  const [betType, setBetType] = useState<"YES" | "NO">("YES");

  const yesProfit = (betAmount / yesPrice) - betAmount;
  const noProfit = (betAmount / noPrice) - betAmount;
  
  const currentProfit = betType === "YES" ? yesProfit : noProfit;
  const roi = (currentProfit / betAmount) * 100;

  // Simple hedging logic: if confidence is low but price is high, suggest hedging
  const suggestHedge = predictionConfidence < 7 && (yesPrice > 0.7 || noPrice > 0.7);

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center">
          <Calculator className="w-4 h-4 mr-2 text-indigo-400" />
          Bet Simulator
        </h4>
        <div className="flex items-center text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
          <Info className="w-3 h-3 mr-1" />
          Based on Kalshi Prices
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-[10px] font-mono text-slate-500 uppercase mb-1">Investment ($)</label>
          <input 
            type="number" 
            value={betAmount}
            onChange={(e) => setBetAmount(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[10px] font-mono text-slate-500 uppercase mb-1">Position</label>
          <div className="flex p-1 bg-slate-800 rounded border border-slate-700">
            <button 
              onClick={() => setBetType("YES")}
              className={cn(
                "flex-1 py-1 text-xs font-bold rounded transition-all",
                betType === "YES" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-slate-400 hover:text-slate-200"
              )}
            >
              YES
            </button>
            <button 
              onClick={() => setBetType("NO")}
              className={cn(
                "flex-1 py-1 text-xs font-bold rounded transition-all",
                betType === "NO" ? "bg-red-500 text-white shadow-lg shadow-red-500/20" : "text-slate-400 hover:text-slate-200"
              )}
            >
              NO
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
          <div className="text-[10px] text-slate-500 uppercase font-mono mb-1">Potential Profit</div>
          <div className="text-lg font-mono font-bold text-emerald-400">
            +${currentProfit.toFixed(2)}
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
          <div className="text-[10px] text-slate-500 uppercase font-mono mb-1">ROI</div>
          <div className="text-lg font-mono font-bold text-indigo-400">
            {roi.toFixed(1)}%
          </div>
        </div>
      </div>

      {suggestHedge && (
        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start">
          <Shield className="w-4 h-4 text-amber-500 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-[11px] text-amber-200/80 leading-relaxed">
            <span className="font-bold text-amber-400 block mb-0.5">Hedge Alert</span>
            Confidence is moderate ({predictionConfidence}/10) but price is high. Consider a small 20% hedge on the opposite outcome to protect your capital.
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
        <div className="flex items-center text-[10px] text-slate-400">
          <TrendingUp className="w-3 h-3 mr-1 text-emerald-500" />
          Favored: <span className="text-white font-bold ml-1">{favoredTeam}</span>
        </div>
        <div className="text-[10px] text-slate-500 font-mono">
          P: {(betType === "YES" ? yesPrice : noPrice).toFixed(2)}
        </div>
      </div>
    </div>
  );
};
