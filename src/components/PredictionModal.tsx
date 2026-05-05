import React, { useState } from "react";
import { X, TrendingUp, AlertTriangle, ShieldCheck, BrainCircuit, Coins, Flag, Scale, Zap, Activity, ExternalLink, Info } from "lucide-react";
import { Prediction, Game } from "../types";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { getDb } from "../firebase";
import { collection, addDoc } from "firebase/firestore";
import { cn } from "../lib/utils";

interface PredictionModalProps {
  game: Game | null;
  prediction: Prediction | null;
  onClose: () => void;
}

export function PredictionModal({ game, prediction, onClose }: PredictionModalProps) {
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportText, setReportText] = useState("");

  if (!game || !prediction) return null;

  const handleReport = async () => {
    if (!reportText.trim()) return;
    try {
      const db = getDb();
      await addDoc(collection(db, "status_reports"), {
        gameId: game.id,
        report: reportText,
        timestamp: new Date().toISOString(),
      });
      setReportText("");
      setShowReportForm(false);
      alert("Report submitted successfully.");
    } catch (error) {
      console.error("Error submitting report:", error);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl"
        >
          <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-slate-800 p-6 flex justify-between items-center z-10">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center">
                <BrainCircuit className="w-6 h-6 text-indigo-400 mr-2" />
                Matchup Analysis
              </h2>
              <div className="flex items-center mt-1">
                {game.awayLogo && <img src={game.awayLogo} alt={game.awayTeam} className="w-5 h-5 mr-2 object-contain" referrerPolicy="no-referrer" />}
                <span className="text-slate-400 text-sm">{game.awayTeam}</span>
                <span className="text-slate-600 text-xs mx-2 font-mono">@</span>
                {game.homeLogo && <img src={game.homeLogo} alt={game.homeTeam} className="w-5 h-5 mr-2 object-contain" referrerPolicy="no-referrer" />}
                <span className="text-slate-400 text-sm">{game.homeTeam}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6 space-y-8">
            {/* QA Status Banner */}
            {prediction.qaNotes && (
              <div className={cn(
                "p-4 rounded-xl border flex items-start space-x-3",
                prediction.qaStatus === 'flagged' ? "bg-rose-500/10 border-rose-500/20 text-rose-400" :
                prediction.qaStatus === 'corrected' ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" :
                "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              )}>
                {prediction.qaStatus === 'flagged' ? <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" /> : <ShieldCheck className="w-5 h-5 mt-0.5 flex-shrink-0" />}
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-wider mb-1">
                    QA Verification: {prediction.qaStatus}
                  </h4>
                  <p className="text-sm opacity-90 leading-relaxed">
                    {prediction.qaNotes}
                  </p>
                </div>
              </div>
            )}

            {/* Winner & Confidence */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-sm font-mono text-slate-400 uppercase mb-2">Predicted Winner</h3>
                <div className="flex items-center">
                  {prediction.winner === game.homeTeam && game.homeLogo && (
                    <img src={game.homeLogo} alt={game.homeTeam} className="w-10 h-10 mr-3 object-contain" referrerPolicy="no-referrer" />
                  )}
                  {prediction.winner === game.awayTeam && game.awayLogo && (
                    <img src={game.awayLogo} alt={game.awayTeam} className="w-10 h-10 mr-3 object-contain" referrerPolicy="no-referrer" />
                  )}
                  <div className="text-3xl font-bold text-white">
                    {prediction.confidence < 5 ? "PASS (Too Close to Call)" : prediction.winner}
                  </div>
                </div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-sm font-mono text-slate-400 uppercase mb-2">Confidence Level</h3>
                <div className="flex items-end">
                  <span className="text-4xl font-bold text-indigo-400">{prediction.confidence}</span>
                  <span className="text-xl text-slate-500 mb-1 ml-1">/10</span>
                </div>
                <div className="w-full bg-slate-700 h-2 rounded-full mt-3 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      prediction.confidence >= 7 ? "bg-emerald-500" :
                      prediction.confidence >= 5 ? "bg-yellow-500" : "bg-red-500"
                    )}
                    style={{ width: `${prediction.confidence * 10}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Report Incorrect Status */}
            <div className="mt-6 border-t border-slate-800 pt-6">
              <button
                onClick={() => setShowReportForm(!showReportForm)}
                className="flex items-center text-slate-400 hover:text-indigo-400 text-sm transition-colors"
              >
                <Flag className="w-4 h-4 mr-2" />
                Report Incorrect Player Status
              </button>
              {showReportForm && (
                <div className="mt-4 bg-slate-800 p-4 rounded-lg">
                  <textarea
                    value={reportText}
                    onChange={(e) => setReportText(e.target.value)}
                    placeholder="Which player status is incorrect and why?"
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-sm"
                    rows={3}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      onClick={() => setShowReportForm(false)}
                      className="px-3 py-1 text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleReport().catch(console.error)}
                      className="px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700"
                    >
                      Submit Report
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Reasoning */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                <TrendingUp className="w-5 h-5 text-emerald-400 mr-2" />
                Analysis & Reasoning
              </h3>
              <p className="text-slate-300 leading-relaxed bg-slate-800/30 p-4 rounded-lg border border-slate-700/50">
                {prediction.reasoning}
              </p>
            </div>

            {/* Market & Situational Analysis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {prediction.marketSentiment && (
                <div className="bg-indigo-950/20 border border-indigo-900/30 p-4 rounded-lg">
                  <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider mb-2 flex items-center">
                    <Activity className="w-4 h-4 mr-2" />
                    Market Sentiment
                  </h3>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    {prediction.marketSentiment}
                  </p>
                </div>
              )}
              {prediction.situationalFactors && (
                <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-lg">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center">
                    <Zap className="w-4 h-4 mr-2 text-yellow-400" />
                    Situational Factors
                  </h3>
                  <p className="text-slate-300 text-sm leading-relaxed">
                    {prediction.situationalFactors}
                  </p>
                </div>
              )}
            </div>

            {/* Devil's Advocate */}
            {prediction.devilsAdvocate && (
              <div className="bg-rose-950/20 border border-rose-900/30 p-4 rounded-lg">
                <h3 className="text-sm font-bold text-rose-400 uppercase tracking-wider mb-2 flex items-center">
                  <Scale className="w-4 h-4 mr-2" />
                  Devil's Advocate (Case for Opposing Team)
                </h3>
                <p className="text-slate-300 text-sm leading-relaxed italic">
                  "{prediction.devilsAdvocate}"
                </p>
              </div>
            )}

            {/* Hedging Advice */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                <ShieldCheck className="w-5 h-5 text-amber-400 mr-2" />
                Hedging Strategy
              </h3>
              <div className="bg-amber-950/20 border border-amber-900/30 p-4 rounded-lg">
                <div className="text-amber-200/80 text-sm leading-relaxed prose prose-invert prose-amber max-w-none">
                  <ReactMarkdown>{prediction.hedgingAdvice}</ReactMarkdown>
                </div>
              </div>
            </div>

            {/* Key Factors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-mono text-slate-400 uppercase mb-3">Key Factors</h3>
                <ul className="space-y-2">
                  {prediction.keyFactors.map((factor, i) => (
                    <li key={i} className="flex items-start text-sm text-slate-300">
                      <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-1.5 mr-2 flex-shrink-0" />
                      {factor}
                    </li>
                  ))}
                </ul>
                
                {prediction.appliedLessons && prediction.appliedLessons.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-mono text-emerald-400 uppercase mb-3 flex items-center">
                      <Zap className="w-4 h-4 mr-2" />
                      AI Learning Adjustments
                    </h3>
                    <ul className="space-y-2">
                      {prediction.appliedLessons.map((lesson, i) => (
                        <li key={i} className="flex items-start text-sm text-slate-300 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 mr-2 flex-shrink-0" />
                          {lesson}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-sm font-mono text-slate-400 uppercase mb-3 flex items-center justify-between">
                  <div className="flex items-center">
                    <AlertTriangle className="w-4 h-4 text-red-400 mr-2" />
                    Key Injuries
                  </div>
                  {game.league === 'NCAA' && (
                    <span className="text-[8px] bg-red-500/10 text-red-400/70 px-1.5 py-0.5 rounded border border-red-500/20 font-black">
                      VERIFIED VIA ROTOWIRE
                    </span>
                  )}
                </h3>
                <ul className="space-y-2">
                  {prediction.injuries.map((injury, i) => (
                    <li key={i} className="flex flex-col text-sm text-slate-300 bg-slate-800/50 p-2 rounded border border-slate-700/50">
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-slate-200">{injury.player}</span>
                        <span className={cn(
                          "text-[10px] uppercase tracking-wider font-mono font-bold px-1.5 py-0.5 rounded",
                          (injury.status || '').toLowerCase() === 'out' ? "bg-rose-500/20 text-rose-400" :
                          (injury.status || '').toLowerCase() === 'doubtful' ? "bg-amber-500/20 text-amber-400" :
                          (injury.status || '').toLowerCase() === 'probable' ? "bg-indigo-500/20 text-indigo-400" :
                          (injury.status || '').toLowerCase() === 'in' ? "bg-emerald-500/20 text-emerald-400" :
                          "bg-slate-700/50 text-slate-500"
                        )}>
                          {injury.status}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-[10px] text-indigo-400/70 uppercase tracking-widest">
                          {injury.team}
                        </span>
                        {injury.impact && (
                          <span className="text-[9px] text-rose-400/80 font-bold bg-rose-500/5 px-1.5 py-0.5 rounded border border-rose-500/10">
                            Impact: {injury.impact}
                          </span>
                        )}
                      </div>
                      {(injury.source_name || injury.source_timestamp) && (
                        <div className="text-[8px] text-slate-500 mt-1 font-mono uppercase tracking-tighter text-right">
                          [Source: {injury.source_name || 'Unknown'}, {injury.source_timestamp || 'N/A'}]
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            
            {/* Previous Matchups */}
            {Array.isArray(prediction.previousMatchups) && prediction.previousMatchups.length > 0 && (
              <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-6 shadow-sm">
                <h4 className="text-sm font-mono text-indigo-400 uppercase tracking-widest mb-4 flex items-center justify-between">
                  <div className="flex items-center">
                    <Activity className="w-4 h-4 mr-2" />
                    Head-to-Head Matchups
                  </div>
                  {(game.league === 'MLB' || game.league === 'NBA') && (
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20">
                      2026 Season Only
                    </span>
                  )}
                </h4>
                <div className="space-y-4">
                  {prediction.previousMatchups.map((match, idx) => (
                    <div key={idx} className="flex flex-col border-b border-slate-700/30 last:border-0 pb-3 last:pb-0">
                      <div className="flex justify-between items-center text-sm">
                        <div className="flex flex-col">
                          <span className="text-slate-500 font-bold uppercase tracking-tighter text-xs">{match.date}</span>
                          {(game.league === 'NBA' || game.league === 'MLB') && (match.date || '').includes('2026') && (
                            <span className="text-[10px] text-indigo-400/70 font-black uppercase tracking-tighter">Current Season</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                             <span className="text-slate-400 font-mono text-xs">{match.awayTeam}</span>
                             <span className={cn(
                               "text-lg font-bold font-mono",
                               match.awayScore > match.homeScore ? "text-emerald-400" : "text-white"
                             )}>{match.awayScore}</span>
                          </div>
                          <span className="text-slate-600 font-mono">-</span>
                          <div className="flex items-center gap-2 text-right">
                             <span className={cn(
                               "text-lg font-bold font-mono",
                               match.homeScore > match.awayScore ? "text-emerald-400" : "text-white"
                             )}>{match.homeScore}</span>
                             <span className="text-slate-400 font-mono text-xs">{match.homeTeam}</span>
                          </div>
                        </div>
                        <div className="w-16 flex justify-end">
                          {match.awayScore > match.homeScore ? (
                            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-black uppercase tracking-tighter">AWAY W</span>
                          ) : match.homeScore > match.awayScore ? (
                            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-black uppercase tracking-tighter">HOME W</span>
                          ) : (
                            <span className="text-[9px] bg-slate-500/10 text-slate-500 px-2 py-0.5 rounded border border-slate-700/20 font-black uppercase tracking-tighter">PUSH</span>
                          )}
                        </div>
                      </div>
                      {match.lineupChanges && (
                        <div className="mt-2 flex items-start gap-2 bg-slate-800/40 p-2 rounded border border-slate-700/30">
                          <Info className="w-3 h-3 text-indigo-400/50 mt-0.5 flex-shrink-0" />
                          <span className="text-xs text-slate-400 italic leading-relaxed">
                            {match.lineupChanges}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Sources & Grounding */}
            {prediction.groundingUrls && prediction.groundingUrls.length > 0 && (
              <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-lg">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
                  <ShieldCheck className="w-4 h-4 mr-2 text-emerald-500" />
                  Verified Sources & Grounding
                </h3>
                <div className="flex flex-wrap gap-2">
                  {prediction.groundingUrls.map((source, i) => (
                    <a
                      key={i}
                      href={source.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white px-2 py-1 rounded border border-slate-700 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      {source.title}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-center pt-4 border-t border-slate-800 text-xs text-slate-600">
              <span>
                Analysis generated by Bettors Edge. Verify all data independently before wagering.
              </span>
              {prediction.analysisCost !== undefined && (
                <span className="flex items-center mt-2 md:mt-0 bg-slate-800 px-2 py-1 rounded-full text-slate-500">
                  <Coins className="w-3 h-3 mr-1" />
                  API Cost: ${prediction.analysisCost.toFixed(6)}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
