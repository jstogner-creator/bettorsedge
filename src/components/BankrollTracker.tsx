import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  History, 
  DollarSign, 
  Plus, 
  X, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  PieChart,
  BarChart3
} from 'lucide-react';
import { bettingService } from '../services/bettingService';
import { auth, db } from '../firebase';
import { Bet, UserProfile } from '../types';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { onSnapshot, doc, collection, query, where, orderBy } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';

const BankrollTracker: React.FC = () => {
  const [bets, setBets] = useState<Bet[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddBet, setShowAddBet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    
    const userId = auth.currentUser.uid;
    setLoading(true);

    // Listen to profile changes
    const profileUnsubscribe = onSnapshot(
      doc(db, 'users', userId),
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as UserProfile;
          setProfile(data);
          
          // Initialize bankroll if not set
          if (data.bankroll === undefined) {
            try {
              await bettingService.initializeBankroll(userId, 1000);
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, `users/${userId}`);
            }
          }
        } else {
          // Create profile if it doesn't exist
          try {
            await bettingService.initializeBankroll(userId, 1000);
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${userId}`);
          }
        }
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `users/${userId}`);
        setError('Failed to load profile data');
        setLoading(false);
      }
    );

    // Listen to bets changes
    const betsQuery = query(
      collection(db, 'bets'),
      where('userId', '==', userId),
      orderBy('date', 'desc')
    );

    const betsUnsubscribe = onSnapshot(
      betsQuery,
      (snapshot) => {
        const userBets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bet));
        setBets(userBets);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'bets');
        setError('Failed to load bets data');
      }
    );

    return () => {
      profileUnsubscribe();
      betsUnsubscribe();
    };
  }, []);

  const calculateStats = () => {
    const wonBets = bets.filter(b => b.status === 'won');
    const lostBets = bets.filter(b => b.status === 'lost');
    const pendingBets = bets.filter(b => b.status === 'pending');
    
    const totalProfit = bets.reduce((acc, bet) => {
      if (bet.status === 'won') return acc + (bet.payout || 0) - bet.amount;
      if (bet.status === 'lost') return acc - bet.amount;
      return acc;
    }, 0);

    const winRate = bets.length > 0 ? (wonBets.length / (wonBets.length + lostBets.length)) * 100 : 0;
    const roi = bets.reduce((acc, b) => acc + b.amount, 0) > 0 
      ? (totalProfit / bets.reduce((acc, b) => acc + b.amount, 0)) * 100 
      : 0;

    return { totalProfit, winRate, roi, wonCount: wonBets.length, lostCount: lostBets.length, pendingCount: pendingBets.length };
  };

  const stats = calculateStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Current Bankroll</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            ${profile?.bankroll?.toLocaleString() || '0'}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Paper Trading Balance
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Total Profit/Loss</span>
            {stats.totalProfit >= 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400" />
            )}
          </div>
          <div className={cn(
            "text-2xl font-bold",
            stats.totalProfit >= 0 ? "text-emerald-400" : "text-red-400"
          )}>
            {stats.totalProfit >= 0 ? '+' : ''}${stats.totalProfit.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Lifetime Performance
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Win Rate</span>
            <PieChart className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {stats.winRate.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {stats.wonCount}W - {stats.lostCount}L
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">ROI</span>
            <BarChart3 className="w-4 h-4 text-amber-400" />
          </div>
          <div className={cn(
            "text-2xl font-bold",
            stats.roi >= 0 ? "text-emerald-400" : "text-red-400"
          )}>
            {stats.roi.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Return on Investment
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bet History */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-400" />
              Recent Activity
            </h3>
            <div className="text-xs text-slate-500">
              {stats.pendingCount} Pending Bets
            </div>
          </div>

          {bets.length === 0 ? (
            <div className="bg-slate-900/30 border border-dashed border-slate-800 rounded-xl p-12 text-center">
              <div className="bg-slate-800/50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                <DollarSign className="w-6 h-6 text-slate-600" />
              </div>
              <h4 className="text-slate-300 font-bold mb-1">No bets logged yet</h4>
              <p className="text-slate-500 text-sm max-w-xs mx-auto">
                Start logging your simulated bets from the dashboard to track your performance.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {bets.map((bet) => (
                <div 
                  key={bet.id}
                  className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl hover:bg-slate-900/80 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase tracking-wider">
                          {bet.league}
                        </span>
                        <span className="text-xs text-slate-500">
                          {format(new Date(bet.date), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white">
                        {bet.team} <span className="text-slate-500 font-normal">vs {bet.team === bet.gameInfo.homeTeam ? bet.gameInfo.awayTeam : bet.gameInfo.homeTeam}</span>
                      </h4>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="text-xs text-slate-400">
                          Type: <span className="text-slate-200">{bet.type}</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          Amount: <span className="text-slate-200">${bet.amount}</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          Odds: <span className="text-slate-200">{bet.odds}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn(
                        "text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1",
                        bet.status === 'won' ? "bg-emerald-500/10 text-emerald-400" :
                        bet.status === 'lost' ? "bg-red-500/10 text-red-400" :
                        bet.status === 'push' ? "bg-slate-800 text-slate-400" :
                        "bg-amber-500/10 text-amber-400"
                      )}>
                        {bet.status === 'won' && <CheckCircle2 className="w-3 h-3" />}
                        {bet.status === 'lost' && <X className="w-3 h-3" />}
                        {bet.status === 'pending' && <Clock className="w-3 h-3" />}
                        {bet.status.toUpperCase()}
                      </div>
                      {bet.status === 'won' && bet.payout && (
                        <div className="text-sm font-bold text-emerald-400 mt-2">
                          +${(bet.payout - bet.amount).toFixed(2)}
                        </div>
                      )}
                      {bet.status === 'lost' && (
                        <div className="text-sm font-bold text-red-400 mt-2">
                          -${bet.amount.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Performance Insights */}
        <div className="space-y-6">
          <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              Performance Insights
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                <span className="text-xs text-slate-400">Avg. Bet Size</span>
                <span className="text-sm font-bold text-white">
                  ${bets.length > 0 ? (bets.reduce((acc, b) => acc + b.amount, 0) / bets.length).toFixed(2) : '0'}
                </span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                <span className="text-xs text-slate-400">Best Sport</span>
                <span className="text-sm font-bold text-emerald-400">NBA</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
                <span className="text-xs text-slate-400">Profit Factor</span>
                <span className="text-sm font-bold text-white">
                  {stats.lostCount > 0 ? (stats.wonCount / stats.lostCount).toFixed(2) : 'N/A'}
                </span>
              </div>
            </div>

            <div className="mt-6 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-indigo-400 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-indigo-300 mb-1">AI Tip</h4>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Based on your history, you have a 68% win rate on games where the AI confidence is 8/10 or higher. Consider focusing your bankroll on high-confidence plays.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Bankroll Management
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Maintain discipline with your paper trading. We recommend a unit size of 1-2% of your total bankroll.
            </p>
            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg">
              <span className="text-xs text-slate-400">Recommended Unit</span>
              <span className="text-sm font-bold text-emerald-400">
                ${profile?.bankroll ? (profile.bankroll * 0.01).toFixed(0) : '10'} - ${(profile?.bankroll ? profile.bankroll * 0.02 : 20).toFixed(0)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BankrollTracker;
