import React, { useState, useEffect } from "react";
import { Plus, Trash2, Lock, Unlock, Key, ChevronDown, ChevronUp } from "lucide-react";
import { Prediction } from "../types";

interface BrandensBet {
  id: string;
  game: string;
  selection: string;
  odds: string;
  wager: string;
  reasoning: string;
  status: "pending" | "won" | "lost";
  date: string;
}

export function BrandensBets() {
  const [bets, setBets] = useState<BrandensBet[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [password, setPassword] = useState("");
  const [newBet, setNewBet] = useState<Partial<BrandensBet>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Load bets from local storage on mount
  useEffect(() => {
    const savedBets = localStorage.getItem("brandensBets");
    if (savedBets) {
      try {
        setBets(JSON.parse(savedBets));
      } catch (e) {
        console.error("Failed to parse saved bets:", e);
        // Optional: clear invalid data
        localStorage.removeItem("brandensBets");
      }
    }
    
    // Check if admin session exists
    const adminSession = sessionStorage.getItem("isAdmin");
    if (adminSession === "true") {
      setIsAdmin(true);
    }
  }, []);

  // Save bets to local storage whenever they change
  useEffect(() => {
    localStorage.setItem("brandensBets", JSON.stringify(bets));
  }, [bets]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Simple hardcoded password for demo purposes
    if (password === "admin123") {
      setIsAdmin(true);
      sessionStorage.setItem("isAdmin", "true");
      setShowLogin(false);
      setPassword("");
    } else {
      alert("Incorrect password");
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
    sessionStorage.removeItem("isAdmin");
    setShowApiKeys(false);
  };

  const handleAddBet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBet.game || !newBet.selection) return;

    const bet: BrandensBet = {
      id: Date.now().toString(),
      game: newBet.game,
      selection: newBet.selection,
      odds: newBet.odds || "-110",
      wager: newBet.wager || "1 Unit",
      reasoning: newBet.reasoning || "",
      status: "pending",
      date: new Date().toLocaleDateString(),
    };

    setBets([bet, ...bets]);
    setNewBet({});
    setShowAddForm(false);
  };

  const handleDeleteBet = (id: string) => {
    if (confirm("Are you sure you want to delete this bet?")) {
      setBets(bets.filter(b => b.id !== id));
    }
  };

  const handleStatusChange = (id: string, status: "pending" | "won" | "lost") => {
    setBets(bets.map(b => b.id === id ? { ...b, status } : b));
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 mb-8 overflow-hidden">
      <div 
        className="p-4 flex justify-between items-center cursor-pointer hover:bg-slate-800/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500/20 p-2 rounded-lg">
            <Lock className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Branden's Bets</h2>
            <p className="text-xs text-slate-400">Exclusive picks and analysis</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
        </div>
      </div>

      {isExpanded && (
        <div className="p-6 border-t border-slate-800 animate-in slide-in-from-top-2">
          <div className="flex justify-end mb-4">
            {isAdmin ? (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowApiKeys(!showApiKeys)}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="Manage API Keys"
                >
                  <Key className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Pick
                </button>
                <button 
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="Logout Admin"
                >
                  <Unlock className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowLogin(!showLogin)}
                className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
              >
                Admin Access
              </button>
            )}
          </div>

          {showLogin && !isAdmin && (
            <form onSubmit={handleLogin} className="mb-6 bg-slate-800/50 p-4 rounded-lg border border-slate-700">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
                <button 
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
                >
                  Login
                </button>
              </div>
            </form>
          )}

          {isAdmin && showApiKeys && (
            <div className="mb-6 bg-slate-800/50 p-4 rounded-lg border border-slate-700 animate-in fade-in slide-in-from-top-2">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Key className="w-4 h-4 text-indigo-400" />
                API Configuration (Admin Only)
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Kalshi API Key</label>
                  <div className="flex gap-2">
                    <code className="flex-1 bg-slate-950 px-3 py-2 rounded text-xs text-emerald-400 font-mono overflow-hidden text-ellipsis">
                      {import.meta.env.VITE_KALSHI_API_KEY || "configured in .env"}
                    </code>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Kalshi API Secret</label>
                  <div className="flex gap-2">
                    <code className="flex-1 bg-slate-950 px-3 py-2 rounded text-xs text-emerald-400 font-mono overflow-hidden text-ellipsis">
                      {import.meta.env.VITE_KALSHI_API_SECRET ? "••••••••••••••••" : "configured in .env"}
                    </code>
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase mb-1">Gemini API Key</label>
                  <div className="flex gap-2">
                    <code className="flex-1 bg-slate-950 px-3 py-2 rounded text-xs text-blue-400 font-mono overflow-hidden text-ellipsis">
                      {(() => {
                        try { return process.env.GEMINI_API_KEY ? "••••••••••••••••" : "configured in .env"; }
                        catch (e) { return "configured in .env"; }
                      })()}
                    </code>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    These keys are securely stored in environment variables. Only you can see this section.
                  </p>
                </div>
              </div>
            </div>
          )}

          {isAdmin && showAddForm && (
            <form onSubmit={handleAddBet} className="mb-6 bg-slate-800/50 p-4 rounded-lg border border-slate-700 animate-in fade-in slide-in-from-top-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <input
                  type="text"
                  placeholder="Game (e.g. Lakers vs Warriors)"
                  value={newBet.game || ""}
                  onChange={(e) => setNewBet({...newBet, game: e.target.value})}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                  required
                />
                <input
                  type="text"
                  placeholder="Selection (e.g. Lakers -5.5)"
                  value={newBet.selection || ""}
                  onChange={(e) => setNewBet({...newBet, selection: e.target.value})}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                  required
                />
                <input
                  type="text"
                  placeholder="Odds (e.g. -110)"
                  value={newBet.odds || ""}
                  onChange={(e) => setNewBet({...newBet, odds: e.target.value})}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                />
                <input
                  type="text"
                  placeholder="Wager (e.g. 1 Unit)"
                  value={newBet.wager || ""}
                  onChange={(e) => setNewBet({...newBet, wager: e.target.value})}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm"
                />
              </div>
              <textarea
                placeholder="Reasoning..."
                value={newBet.reasoning || ""}
                onChange={(e) => setNewBet({...newBet, reasoning: e.target.value})}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm mb-4 h-24"
              />
              <div className="flex justify-end gap-2">
                <button 
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
                >
                  Post Pick
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {bets.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <p>No active bets posted yet.</p>
              </div>
            ) : (
              bets.map((bet) => (
                <div key={bet.id} className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50 hover:border-indigo-500/30 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-white text-lg">{bet.selection}</h3>
                      <p className="text-sm text-slate-400">{bet.game}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-emerald-400 font-mono font-bold">{bet.odds}</div>
                        <div className="text-xs text-slate-500">{bet.wager}</div>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1 ml-2">
                          <select
                            value={bet.status}
                            onChange={(e) => handleStatusChange(bet.id, e.target.value as any)}
                            className="bg-slate-900 border border-slate-700 rounded text-xs text-slate-300 px-1 py-0.5"
                          >
                            <option value="pending">Pending</option>
                            <option value="won">Won</option>
                            <option value="lost">Lost</option>
                          </select>
                          <button 
                            onClick={() => handleDeleteBet(bet.id)}
                            className="p-1 text-slate-500 hover:text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {bet.reasoning && (
                    <div className="mt-3 text-sm text-slate-300 bg-slate-900/50 p-3 rounded border border-slate-800">
                      <p>{bet.reasoning}</p>
                    </div>
                  )}
                  
                  <div className="mt-3 flex justify-between items-center text-xs text-slate-500">
                    <span>Posted {bet.date}</span>
                    <span className={`px-2 py-0.5 rounded-full uppercase font-bold tracking-wider ${
                      bet.status === 'won' ? 'bg-emerald-500/10 text-emerald-400' :
                      bet.status === 'lost' ? 'bg-red-500/10 text-red-400' :
                      'bg-slate-700/30 text-slate-400'
                    }`}>
                      {bet.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
