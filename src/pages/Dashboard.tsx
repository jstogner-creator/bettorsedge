import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { format, addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { Layout } from "../components/Layout";
import { GameCard } from "../GameCard";
import { espnService } from "../services/espn";
import { bettorsEdge } from "../services/gemini";
import { kalshiService } from "../services/kalshi";
import { Game, Prediction, TournamentBracket } from "../types";
import { logError } from "../services/logger";
import {
  Calendar as CalendarIcon,
  Loader2,
  AlertCircle,
  Zap,
  LogIn,
  LogOut,
  User as UserIcon,
  RefreshCw,
  FileText,
  Activity,
  Trophy,
  Brain,
  TrendingUp,
  ShieldCheck,
  Shield,
} from "lucide-react";
import { Toast } from "../components/Toast";
import { SportControls } from "../components/SportControls";
import { LegalModal } from "../components/LegalModal";
import { cn } from "../lib/utils";
import { getAuthInstance, getDb, loginWithGoogle, logout, getIdToken } from "../firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  doc,
  writeBatch,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  query,
  where,
  setDoc,
  deleteDoc,
  orderBy,
  limit,
} from "firebase/firestore";
import { sendNotification, requestNotificationPermission } from "../utils/notification";
import { handleFirestoreError, OperationType } from "../lib/firestoreErrors";
import { UserProfile } from "../types";
import { loadStripe } from "@stripe/stripe-js";
import { GameGrid } from "../components/Dashboard/GameGrid";
import { DashboardHeader } from "../components/Dashboard/DashboardHeader";
import { apiSportsService } from "../services/apiSports";
import { apiSportsBasketballService } from "../services/apiSportsBasketball";
import { Joyride, STATUS } from "react-joyride";
import type { Step } from "react-joyride";

// Lazy loaded components
const TopPicksOfTheDay = lazy(() => import("../components/TopPicksOfTheDay").then(m => ({ default: m.TopPicksOfTheDay })));
const AccuracyTab = lazy(() => import("../components/AccuracyTab").then(m => ({ default: m.AccuracyTab })));
const ChatPanel = lazy(() => import("../components/ChatPanel").then(m => ({ default: m.ChatPanel })));
const Paywall = lazy(() => import("../components/Paywall").then(m => ({ default: m.Paywall })));
const AdminUsersTab = lazy(() => import("../components/AdminUsersTab").then(m => ({ default: m.AdminUsersTab })));
const DailyBriefingModal = lazy(() => import("../components/DailyBriefingModal").then(m => ({ default: m.DailyBriefingModal })));
const AdminTab = lazy(() => import("../components/Dashboard/AdminTab").then(m => ({ default: m.AdminTab })));

// Robust Joyride component retrieval
const JoyrideComponent = Joyride;
const JoyrideAny = typeof JoyrideComponent === 'function' ? JoyrideComponent : (Joyride as any)?.default;

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
console.log("[Stripe Debug] Publishable Key Loaded:", stripePublishableKey ? `YES (starts with ${stripePublishableKey.substring(0, 7)}...)` : "NO (undefined)");

if (!stripePublishableKey) {
  console.warn("VITE_STRIPE_PUBLISHABLE_KEY is missing. Stripe integration will be disabled until a key is provided in the environment variables.");
}

const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : Promise.resolve(null);



// Constants for bypass logic
const BYPASS_EMAILS = [
  'jstogner@risenetworkcabling.com',
  'jesslandry35@gmail.com',
  'nousiharatl82@gmail.com'
];

const PAYWALL_ONLY_BYPASS_EMAILS = [
  'davidstogner4@gmail.com',
  'nousiharatl82@gmail.com' // Also add here for redundancy
];




// Constants for bypass logic



const QuotaBanner = ({ message }: { message: string }) => (
  <div className="mb-6 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-500">
    <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
    <div className="space-y-1">
      <p className="text-sm font-bold text-rose-400">Firestore Quota Exceeded</p>
      <p className="text-xs text-rose-200/70 leading-relaxed">
        {message} The app is now using offline cache. Some data might be stale.
      </p>
    </div>
  </div>
);

export function Dashboard({
  user: initialUser,
  onOpenFAQ,
}: {
  user: User;
  onOpenFAQ: () => void;
}) {
  const [activeTab, setActiveTab] = useState("NBA");
  const [apiSportsStatus, setApiSportsStatus] = useState<{ status: 'idle' | 'loading' | 'success' | 'error', count: number, message?: string }>({ status: 'idle', count: 0 });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzingMap, setAnalyzingMap] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedPredictions, setSavedPredictions] = useState<Record<string, Prediction>>({});
  const [allPredictions, setAllPredictions] = useState<Record<string, Prediction>>({});
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  // Persistent Logging Helper
  const addDebugLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const fullMsg = `[${timestamp}] ${msg}`;
    console.log(fullMsg);
    setDebugLogs((prev) => [fullMsg, ...prev].slice(0, 50));

    try {
      const stored = JSON.parse(localStorage.getItem("debug_logs") || "[]") as string[];
      const updated = [fullMsg, ...stored].slice(0, 100);
      localStorage.setItem("debug_logs", JSON.stringify(updated));
    } catch (e) {
      console.error("[Dashboard] Failed to persist debug log:", e);
    }
  };

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('debug_logs') || '[]');
      setDebugLogs(stored);
    } catch (e) {}
    
    addDebugLog("App Mounted / Reloaded");
    
    const handleUnload = () => {
      addDebugLog("App Unloading / Navigating Away");
    };
    
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  const [toast, setToast] = useState<{ message: string; type: "error" | "success" | "warning" | "info" } | null>(null);
  const [kalshiStatus, setKalshiStatus] = useState<"connected" | "disconnected" | "error">("disconnected");
  const [user, setUser] = useState<User | null>(initialUser);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [authReady, setAuthReady] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  useEffect(() => {
    addDebugLog("Dashboard Mounted");
    addDebugLog(`Auth Ready: ${authReady}, User: ${user?.email || 'None'}`);
    
    if (authReady && user) {
      addDebugLog("Fetching User Profile...");
    }
  }, [authReady, user]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [profileError, setProfileError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<"all" | "early" | "afternoon" | "late">("all");
  const [sortBy, setSortBy] = useState<"time" | "edge" | "confidence">("time");
  const [isBriefingOpen, setIsBriefingOpen] = useState(false);
  const [forcePaywall, setForcePaywall] = useState(false);
  const [bracket, setBracket] = useState<TournamentBracket | null>(null);
  const [loadingBracket, setLoadingBracket] = useState(false);
  const [ncaaSubTab, setNcaaSubTab] = useState<"schedule" | "bracket">("schedule");
  const [runWalkthrough, setRunWalkthrough] = useState(false);
  const walkthroughTriggeredRef = useRef(false);
  const [legalModal, setLegalModal] = useState<{ isOpen: boolean; type: "terms" | "privacy" }>({
    isOpen: false,
    type: "terms",
  });

  const walkthroughSteps: Step[] = [
    {
      target: "body",
      placement: "center",
      content: (
        <div className="text-left">
          <h3 className="text-lg font-bold mb-2">Welcome to Bettors Edge!</h3>
          <p className="text-sm text-slate-300">Let's take a quick tour to show you how to use our AI-driven sports analysis engine.</p>
        </div>
      ),
    },
    {
      target: "#league-nav",
      content: "Switch between different sports leagues here. We currently support NBA, NFL, NCAA, NHL, and MLB.",
    },
    {
      target: "#daily-briefing-btn",
      content: "Get a high-level summary of today's slate, including key narratives and market trends, generated by our AI.",
    },
    {
      target: "#game-grid",
      content: "This is where you'll find all the games for the selected date. Each card contains deep analysis and predictions.",
    },
    {
      target: "#confidence-score",
      content: "Our AI assigns a confidence score from 1 to 10. Scores above 7 indicate high-conviction analysis.",
    },
    {
      target: "#win-prob",
      content: "We run 10,000 simulations for every game to calculate the precise win probability for each team.",
    },
    {
      target: "#injury-report",
      content: "Real-time injury tracking with impact analysis. We monitor who's IN, OUT, Doubtful, or Probable.",
    },
    {
      target: "#key-factors",
      content: "The specific matchup advantages and situational factors our AI identified as critical for this game.",
    },
    {
      target: "#chat-panel",
      content: "Have a specific question? Ask Snark, our snarky but brilliant AI analyst, for custom insights on any game.",
    },
  ];

  const handleJoyrideCallback = async (data: any) => {
    const { status, type } = data;
    console.log("[Dashboard] Joyride Callback:", { status, type });
    
    if (([STATUS.FINISHED, STATUS.SKIPPED] as string[]).includes(status)) {
      console.log("[Dashboard] Walkthrough finished or skipped. Updating persistence...");
      setRunWalkthrough(false);
      localStorage.setItem('hasSeenWalkthrough', 'true');
      
      // Mark walkthrough as seen in Firestore
      const auth = getAuthInstance();
      const currentUser = auth.currentUser;
      
      if (currentUser) {
        const db = getDb();
        const userRef = doc(db, "users", currentUser.uid);
        try {
          await setDoc(userRef, { hasSeenWalkthrough: true }, { merge: true });
          console.log("[Dashboard] Walkthrough status updated in Firestore.");
        } catch (err) {
          console.error("[Dashboard] Error updating walkthrough status:", err);
        }
      }
    } else if (status === STATUS.PAUSED || type === 'step:after') {
      // Also set local storage on progress to be safe
      localStorage.setItem('hasSeenWalkthrough', 'true');
    }
  };

  // Consolidated Auth & Profile Listener
  const lastProfileFetchRef = useRef<number>(0);
  useEffect(() => {
    console.log("[Dashboard] Mounted. User:", user?.email, "Active Tab:", activeTab);
    console.log("[Dashboard] Environment:", {
      hostname: window.location.hostname,
      isIframe: window.self !== window.top,
      userAgent: navigator.userAgent,
    });

    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("session_id");
    if (sessionId) {
      console.log("[Dashboard] Stripe session_id detected:", sessionId);
      setToast({ message: "Subscription successful! Welcome to Premium.", type: "success" });
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    console.log("[Dashboard] Initializing Profile Listener...");
    const db = getDb();
    setProfileError(null);
    let profileUnsubscribe: (() => void) | null = null;

    if (user) {
      const userEmail = (user.email || "").toLowerCase().trim();
      const isBypass = BYPASS_EMAILS.includes(userEmail);
      console.log("[Dashboard] User Email:", userEmail, "Is Bypass:", isBypass);
      if (isBypass) {
        console.log("[Dashboard] Immediate Bypass Detected for:", userEmail);
        setIsAdminUser(true);
      }

      const fetchProfile = async () => {
        // Throttle profile fetch to once every 10 minutes
        const now = Date.now();
        if (now - lastProfileFetchRef.current < 10 * 60 * 1000) {
          console.log("[Dashboard] Skipping profile fetch (throttled)");
          setAuthReady(true);
          return;
        }

        const userRef = doc(db, "users", user.uid);
        let setupTimeout: NodeJS.Timeout;

        setupTimeout = setTimeout(() => {
          if (!authReady) {
            console.warn("[Dashboard] Profile setup timed out");
            setProfileError("Profile sync is taking longer than expected. Please check your connection or try opening in a new tab.");
            setAuthReady(true);
          }
        }, 15000);

        try {
          console.log("[Dashboard] Fetching profile...");
          const userDoc = await getDocFromServer(userRef).catch(() => getDoc(userRef));
          
          if (typeof setupTimeout !== 'undefined') clearTimeout(setupTimeout);
          setProfileError(null);

          if (!userDoc.exists()) {
            console.log("[Dashboard] Creating new user profile for:", user.email);
            const newProfile = {
              uid: user.uid,
              email: user.email || "",
              displayName: user.displayName || "",
              createdAt: new Date().toISOString(),
              subscriptionStatus: "inactive",
              subscribedSports: [],
              acceptedTerms: true,
              termsAcceptedAt: new Date().toISOString(),
              hasSeenWalkthrough: false,
            };
            await setDoc(userRef, newProfile);
            setUserProfile(newProfile as UserProfile);
            setIsAdminUser(isBypass);
          } else {
            const profile = userDoc.data() as UserProfile;
            console.log("[Dashboard] User Profile:", profile);
            setUserProfile(profile);
            const isAdmin = profile.role === "admin" || isBypass;
            setIsAdminUser(isAdmin);

            // Walkthrough logic
            const hasSeenLocal = localStorage.getItem("hasSeenWalkthrough") === "true";
            const hasSeenRemote = profile.hasSeenWalkthrough === true;
            if (!hasSeenLocal && !hasSeenRemote && !walkthroughTriggeredRef.current) {
              walkthroughTriggeredRef.current = true;
              setRunWalkthrough(true);
              localStorage.setItem("hasSeenWalkthrough", "true");
            }
          }
          setAuthReady(true);
          lastProfileFetchRef.current = Date.now();
        } catch (error: any) {
          if (typeof setupTimeout !== 'undefined') clearTimeout(setupTimeout);
          console.error("[Dashboard] Profile fetch error:", error);
          
          try {
            if (error.message?.includes("Quota exceeded")) {
              setProfileError("Firestore quota exceeded. Some features may be limited until tomorrow.");
            } else {
              handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
              setProfileError("Failed to load your profile.");
            }
          } catch (innerError) {
            console.error("[Dashboard] Error in error handler:", innerError);
            setProfileError("Failed to load your profile due to a permissions issue.");
          } finally {
            setAuthReady(true);
          }
        }
      };

      fetchProfile().catch(err => {
        console.error("[Dashboard] fetchProfile error:", err);
      });
    } else {
      setUserProfile(null);
      setIsAdminUser(false);
      setAuthReady(true);
    }

    return () => {
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, [user]); // Removed activeTab dependency to prevent redundant profile fetches

  // Stop walkthrough if switching to a tab that doesn't support it
  useEffect(() => {
    if (runWalkthrough) {
      const isAccuracyTab = activeTab === "Accuracy";
      const isUsersTab = activeTab === "Users";
      const isAdminTab = activeTab === "Admin";
      if (isAccuracyTab || isUsersTab || isAdminTab) {
        console.log("[Dashboard] Stopping walkthrough - switched to unsupported tab:", activeTab);
        setRunWalkthrough(false);
      }
    }
  }, [activeTab, runWalkthrough]);

  // Listen for postMessage from Stripe success page
  useEffect(() => {
    const handleStripeMessage = (event: MessageEvent) => {
      if (event.data?.type === 'STRIPE_SUCCESS') {
        console.log("[Dashboard] Received STRIPE_SUCCESS message");
        setToast({ message: "Subscription successful! Welcome to Premium.", type: "success" });
      } else if (event.data?.type === 'STRIPE_CANCELLED') {
        console.log("[Dashboard] Received STRIPE_CANCELLED message");
        setToast({ message: "Checkout cancelled. No charges were made.", type: "info" });
      }
    };
    window.addEventListener('message', handleStripeMessage);
    return () => window.removeEventListener('message', handleStripeMessage);
  }, []);

  const handleSubscribe = async (sports: string[]) => {
    if (!user) {
      console.warn("[Dashboard] handleSubscribe called but no user is logged in.");
      return;
    }
    
    console.log("[Dashboard] Initiating subscription for sports:", sports);
    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error("Failed to get authentication token. Please try logging in again.");
      }

      console.log("[Dashboard] Creating checkout session...");
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sports
        })
      });

      const data = await response.json();
      console.log("[Dashboard] Checkout session response:", data);
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      if (data.url) {
        console.log("[Dashboard] Redirecting to Stripe Checkout:", data.url);
        // Try top-level redirect first for iframe compatibility
        try {
          // Handle redirect based on environment
          const isDev = window.location.hostname.includes('ais-dev-') || window.location.hostname.includes('localhost');
          const isPre = window.location.hostname.includes('ais-pre-');
          
          if (isDev || isPre || (window.top && window.top !== window)) {
            // In AI Studio environments or any iframe, redirecting the top window often causes a redirect back to the chat.
            // Open in a new tab instead to ensure the user can complete the checkout.
            console.log("[Stripe] Iframe or AI Studio environment detected, opening checkout in new tab");
            window.open(data.url, '_blank');
          } else {
            // Standard redirect for non-iframe, non-dev environments
            window.location.href = data.url;
          }
        } catch (e) {
          console.warn("[Dashboard] Top-level redirect failed (cross-origin?), falling back to standard redirect:", e);
          window.location.href = data.url;
        }
      } else {
        throw new Error("No checkout URL received from server.");
      }
    } catch (error: any) {
      console.error('[Dashboard] Subscription error:', error);
      setToast({ message: error.message || "Failed to initiate checkout.", type: "error" });
    }
  };

  const isSubscribedToSport = (sport: string) => {
    const userEmail = (user?.email || userProfile?.email || "").toLowerCase().trim();
    const isBypassEmail = BYPASS_EMAILS.includes(userEmail);
    const isPaywallBypassOnly = PAYWALL_ONLY_BYPASS_EMAILS.includes(userEmail);
    
    // A user is subscribed if:
    // 1. They are an admin
    // 2. Their email is in the bypass list
    // 3. Their email is in the paywall-only bypass list
    // 4. Their subscription status is active
    // 5. The sport is explicitly in their subscribedSports list
    const isSubscribed = 
      isAdminUser || 
      isBypassEmail || 
      isPaywallBypassOnly || 
      userProfile?.subscriptionStatus === 'active' ||
      (userProfile?.subscribedSports?.includes(sport));
    
    if (isBypassEmail || isPaywallBypassOnly) {
      console.log(`[Dashboard] BYPASS ACTIVE for ${userEmail} on ${sport}`);
    }

    console.log(`[Dashboard] Subscription Check for ${sport}:`, { 
      email: userEmail, 
      isAdminUser, 
      isBypassEmail, 
      isPaywallBypassOnly,
      isSubscribed,
      status: userProfile?.subscriptionStatus,
      sports: userProfile?.subscribedSports,
      activeTab: sport
    });

    return isSubscribed;
  };

  const [analysisProgressMap, setAnalysisProgressMap] = useState<Record<string, {
    current: number;
    total: number;
    analyzingGameIds: string[];
    message: string;
  } | null>>({});

  const cancelAnalysisRef = useRef<Record<string, boolean>>({});

  const analyzing = analyzingMap[activeTab] || false;
  const analysisProgress = analysisProgressMap[activeTab] || null;

  const handleSyncPending = async () => {
    setLoading(true);
    try {
      // Use allPredictions instead of savedPredictions which is filtered by date
      const pendingPast = Object.values(allPredictions).filter(p => {
        if (p.outcome) return false;
        if (!p.date) return false;
        
        // Include all pending games that are not "PASS"
        if (p.winner?.toUpperCase() === 'PASS' || (p.confidence !== undefined && p.confidence < 7)) return false;
        
        const pDate = new Date(p.date + 'T12:00:00'); // Use noon to avoid timezone shifts
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // If the game was today or earlier
        return pDate <= today;
      });

      console.log(`[Sync] Found ${pendingPast.length} pending past predictions to check.`);

      if (pendingPast.length === 0) {
        setToast({ message: "No past pending predictions to sync.", type: "info" });
        setLoading(false);
        return;
      }

      const requests = new Set<string>();
      pendingPast.forEach(p => {
        if (p.date && p.league) {
          const dateStr = p.date.split('T')[0];
          requests.add(`${p.league}|${dateStr}`);
        }
      });

      let resolvedCount = 0;

      for (const req of requests) {
        const [league, dateStr] = req.split('|');
        try {
          console.log(`[Sync] Fetching schedule for ${league} on ${dateStr}`);
          const [year, month, day] = dateStr.split('-').map(Number);
          const fetchDate = new Date(year, month - 1, day);
          
          const pastGames = await espnService.getSchedule(league, fetchDate);
          console.log(`[Sync] Found ${pastGames.length} games for ${league} on ${dateStr}`);
          
          for (const game of pastGames) {
            if (game.status === 'finished' && game.homeScore !== undefined && game.awayScore !== undefined) {
              // Try to find a matching prediction
              // 1. Try exact ID match
              let prediction = allPredictions[game.id];
              let predictionId = game.id;

              // 2. Try fuzzy match if ID match fails
              if (!prediction) {
                const found = Object.entries(allPredictions).find(([id, p]) => {
                  if (p.outcome) return false;
                  if (p.league !== league) return false;
                  if (p.date !== dateStr) return false;
                  
                  const normalize = (name: string) => name?.toLowerCase().replace(/[^a-z0-9]/g, '').trim() || "";
                  const pHome = normalize(p.homeTeam || "");
                  const pAway = normalize(p.awayTeam || "");
                  const gHome = normalize(game.homeTeam);
                  const gAway = normalize(game.awayTeam);
                  
                  // Match if mascots match OR if one name is contained in the other
                  const homeMatch = pHome === gHome || 
                                   (pHome.length > 3 && gHome.length > 3 && (pHome.includes(gHome) || gHome.includes(pHome))) ||
                                   (pHome.length > 3 && gHome.length > 3 && (pHome.endsWith(gHome) || gHome.endsWith(pHome)));
                  const awayMatch = pAway === gAway || 
                                   (pAway.length > 3 && gAway.length > 3 && (pAway.includes(gAway) || gAway.includes(pAway))) ||
                                   (pAway.length > 3 && gAway.length > 3 && (pAway.endsWith(gAway) || gAway.endsWith(pAway)));
                  
                  return homeMatch && awayMatch;
                });
                
                if (found) {
                  predictionId = found[0];
                  prediction = found[1];
                  console.log(`[Sync] Fuzzy matched game ${game.id} to prediction ${predictionId}`);
                }
              }

              if (prediction && !prediction.outcome) {
                const actualWinner = game.homeScore > game.awayScore ? game.homeTeam : game.awayTeam;
                const isCorrect = prediction.winner === actualWinner;
                
                console.log(`[Sync] Resolving ${predictionId}: ${isCorrect ? 'CORRECT' : 'INCORRECT'}`);
                
                await bettorsEdge.savePrediction(predictionId, {
                  ...prediction,
                  teams: [game.homeTeam, game.awayTeam],
                  outcome: isCorrect ? 'correct' : 'incorrect',
                  actualWinner,
                  actualScore: { home: game.homeScore, away: game.awayScore }
                });
                
                if (!isCorrect) {
                  await bettorsEdge.analyzeLoss(game, prediction, { home: game.homeScore, away: game.awayScore });
                }
                resolvedCount++;
              }
            }
          }
        } catch (e) {
          console.error(`Failed to fetch past games for ${req}`, e);
        }
      }
      
      setToast({ message: `Successfully synced ${resolvedCount} predictions.`, type: "success" });
    } catch (error) {
      console.error("Failed to sync pending predictions:", error);
      setToast({ message: "Failed to sync pending predictions.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log("[Dashboard] Environment Check:", {
      hostname: window.location.hostname,
      href: window.location.href,
      isIframe: window.top !== window,
      isDev: window.location.hostname.includes('ais-dev-') || window.location.hostname.includes('localhost'),
      isPre: window.location.hostname.includes('ais-pre-'),
      userAgent: navigator.userAgent
    });
  }, []);

  // Removed redundant auth listener

  // Firestore Sync - All Predictions for History/Accuracy (Limited to 100 for quota)
  const lastHistoryFetchRef = useRef<number>(0);
  useEffect(() => {
    /* TEMPORARILY DISABLED FOR DEBUGGING
    if (!authReady || !user) {
      setAllPredictions({});
      return;
    }

    const fetchHistory = async () => {
      // Throttle history fetch to once every 5 minutes
      const now = Date.now();
      if (now - lastHistoryFetchRef.current < 5 * 60 * 1000) {
        console.log("[Dashboard] Skipping history fetch (throttled)");
        return;
      }

      console.log(`[Dashboard] Fetching last 100 predictions for history`);
      const db = getDb();
      const q = query(
        collection(db, "predictions"), 
        orderBy("date", "desc"),
        limit(100)
      );

      try {
        const snapshot = await getDocs(q);
        const preds: Record<string, Prediction> = {};
        snapshot.forEach((doc) => {
          preds[doc.id] = doc.data() as Prediction;
        });
        setAllPredictions(prev => ({ ...prev, ...preds }));
        lastHistoryFetchRef.current = now;
      } catch (error: any) {
        console.error("[Dashboard] History fetch error:", error);
        if (error.message?.includes("Quota exceeded")) {
          setError("Firestore quota exceeded. History may be incomplete.");
        } else {
          handleFirestoreError(error, OperationType.LIST, "predictions");
        }
      }
    };

    fetchHistory().catch(console.error);
    */
  }, [authReady, user]);

  // Dedicated fetch for selected date to ensure current view is always populated
  const lastPredictionsFetchRef = useRef<Record<string, number>>({});
  useEffect(() => {
    // Dedicated fetch for selected date to ensure current view is always populated
    if (!authReady || !user) {
      setSavedPredictions({});
      return;
    }

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const fetchPredictions = async () => {
      // Throttle predictions fetch for a specific date to once every 2 minutes
      const now = Date.now();
      const lastFetch = lastPredictionsFetchRef.current[dateStr] || 0;
      if (now - lastFetch < 2 * 60 * 1000) {
        console.log(`[Dashboard] Skipping predictions fetch for ${dateStr} (throttled)`);
        
        // Still update savedPredictions from allPredictions if available
        const filtered: Record<string, Prediction> = {};
        Object.entries(allPredictions).forEach(([id, p]) => {
          if (p.date === dateStr) {
            filtered[id] = p;
          }
        });
        if (Object.keys(filtered).length > 0) {
          setSavedPredictions(filtered);
        }
        return;
      }

      console.log(`[Dashboard] Fetching predictions for ${dateStr}`);
      const db = getDb();
      const q = query(
        collection(db, "predictions"),
        where("date", "==", dateStr)
      );

      try {
        const snapshot = await getDocs(q);
        const filtered: Record<string, Prediction> = {};
        snapshot.forEach((doc) => {
          filtered[doc.id] = doc.data() as Prediction;
        });
        
        setSavedPredictions(filtered);
        setAllPredictions(prev => ({ ...prev, ...filtered }));
        lastPredictionsFetchRef.current[dateStr] = now;
      } catch (error: any) {
        console.error("[Dashboard] Predictions fetch error:", error);
        if (error.message?.includes("Quota exceeded")) {
          setError("Firestore quota exceeded. Predictions for today may not be available.");
        } else {
          handleFirestoreError(error, OperationType.LIST, `predictions (date: ${dateStr})`);
        }
      }
    };

    fetchPredictions().catch(console.error);
  }, [authReady, user, selectedDate]);

  // Derive current date predictions from all predictions (REMOVED: replaced by dedicated subscription above)
  /*
  useEffect(() => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const filtered: Record<string, Prediction> = {};
    
    Object.entries(allPredictions).forEach(([id, p]) => {
      if (p.date === dateStr) {
        filtered[id] = p;
      }
    });
    
    setSavedPredictions(filtered);
  }, [allPredictions, selectedDate]);
  */

  const fetchBracket = async () => {
    console.log(`[Dashboard] fetchBracket called for NCAA 2026`);
    setLoadingBracket(true);
    try {
      const data = await bettorsEdge.getTournamentBracket("NCAA", 2026);
      console.log(`[Dashboard] fetchBracket result:`, data);
      if (data) setBracket(data);
    } catch (e) {
      console.error("[Dashboard] Failed to fetch bracket:", e);
    } finally {
      setLoadingBracket(false);
    }
  };

  useEffect(() => {
    if (activeTab === "NCAA" && !bracket) {
      fetchBracket().catch(console.error);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchGames().catch(console.error);
    // We no longer cancel analysis on tab change to allow background processing
  }, [activeTab, selectedDate]);

  const [alertedGames, setAlertedGames] = useState<Set<string>>(new Set());

  useEffect(() => {
    requestNotificationPermission().catch(console.error);
  }, []);

  // Polling for 30-min alerts
  useEffect(() => {
    if (!isAdminUser) return; // Only admins should trigger re-analysis

    const checkGames = async () => {
      try {
        const now = new Date();
        const thirtyMinsFromNow = new Date(now.getTime() + 30 * 60 * 1000);
        
        for (const game of games) {
          const gameTime = new Date(game.date);
          
          if (gameTime > now && gameTime <= thirtyMinsFromNow && !alertedGames.has(game.id)) {
            console.log(`[Alert] Game ${game.id} is starting in 30 mins. Checking for changes...`);
            
            // Re-analyze to check for changes
            const oldPrediction = savedPredictions[game.id];
            let newPrediction = await bettorsEdge.analyzeMatchup(game, game.date, oldPrediction);
            
            // Check for significant changes
            let significantChange = false;
            if (oldPrediction) {
              // Check for injury changes
              const oldInjuries = JSON.stringify(oldPrediction.injuries);
              const newInjuries = JSON.stringify(newPrediction.injuries);
              if (oldInjuries !== newInjuries) {
                significantChange = true;
              }
            }
            
            if (significantChange) {
              sendNotification(
                "Game Alert: Significant Changes",
                `${game.awayTeam} @ ${game.homeTeam} starts in 30 mins. Player status has changed.`
              );
            }
            
            setAlertedGames(prev => new Set(prev).add(game.id));
          }
        }
      } catch (err) {
        console.error("[Dashboard] checkGames failed:", err);
      }
    };

    const interval = setInterval(() => checkGames().catch(console.error), 60000); // Check every minute
    return () => clearInterval(interval);
  }, [games, savedPredictions, alertedGames, isAdminUser]);

  // Scheduler for daily analysis
  useEffect(() => {
    if (!isAdminUser) return; // Only admins should trigger scheduled analysis

    const runScheduledAnalysis = async () => {
      const lastRunDate = localStorage.getItem("lastScheduledAnalysisDate");
      const today = format(new Date(), "yyyy-MM-dd");
      
      if (lastRunDate === today) {
        console.log("[Scheduler] Analysis already run today.");
        return;
      }

      const now = new Date();
      const scheduledTime = new Date();
      scheduledTime.setHours(8, 0, 0, 0); // 8:00 AM

      if (now >= scheduledTime) {
        console.log("[Scheduler] It's time for daily analysis. Running...");
        localStorage.setItem("lastScheduledAnalysisDate", today);
        
        // Run analysis in the background without blocking the scheduler
        analyzeAllSports().catch(err => {
          console.error("[Scheduler] Error during scheduled analysis:", err);
        });
      }
    };

    // Check every minute
    const interval = setInterval(() => runScheduledAnalysis().catch(console.error), 60000);
    runScheduledAnalysis().catch(console.error); // Run on mount
    return () => clearInterval(interval);
  }, [user, allPredictions, isAdminUser]); // Re-run if user or predictions change

  const analyzeAllSports = async () => {
    const leagues = ["NBA", "NFL", "MLB", "NHL", "NCAA"];
    console.log("[Scheduler] Starting analysis for all sports:", leagues);
    
    for (const league of leagues) {
      console.log(`[Scheduler] Analyzing ${league}...`);
      // We need to trigger the analysis for each league.
      // Since handleAutoAnalyze is tied to activeTab, we can temporarily set activeTab.
      setActiveTab(league);
      
      // Wait for activeTab to update and games to be fetched
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Trigger analysis
      await handleAutoAnalyze(true); // Force analyze
      
      // Wait for analysis to finish (basic check)
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    console.log("[Scheduler] All sports analyzed.");
  };


  // Polling for Kalshi Expectations
  useEffect(() => {
    // Only poll if we have games loaded
    if (games.length === 0) return;

    // Initial fetch if needed (though fetchGames calls it too)
    // fetchKalshiExpectations(activeTab);

    const intervalId = setInterval(() => {
      console.log(`[Dashboard] Polling Kalshi expectations for ${activeTab}...`);
      fetchKalshiExpectations(activeTab).catch(console.error);
    }, 30000); // 30 seconds

    return () => clearInterval(intervalId);
  }, [activeTab, games.length]); // Re-run if tab changes or games array length changes

  // Resolve finished games
  useEffect(() => {
    if (!isAdminUser || !games.length || !Object.keys(savedPredictions).length) return;

    const resolveGames = async () => {
      try {
        for (const game of games) {
          if (game.status === 'finished' && game.homeScore !== undefined && game.awayScore !== undefined) {
            const prediction = savedPredictions[game.id];
            
            // Only process if we have a prediction and it hasn't been resolved yet
            if (prediction && !prediction.outcome) {
              // Skip "PASS" games or low confidence games from resolution
              if (prediction.winner?.toUpperCase() === 'PASS' || (prediction.confidence !== undefined && prediction.confidence < 7)) {
                continue;
              }
              
              console.log(`[Resolution] Resolving game ${game.id}: ${game.awayTeam} vs ${game.homeTeam}`);
              
              const actualWinner = game.homeScore > game.awayScore ? game.homeTeam : game.awayTeam;
              const isCorrect = prediction.winner === actualWinner;
              
              if (isCorrect) {
                // Mark as correct
                try {
                  await bettorsEdge.savePrediction(game.id, {
                    ...prediction,
                    teams: [game.homeTeam, game.awayTeam],
                    outcome: 'correct',
                    actualWinner,
                    actualScore: { home: game.homeScore, away: game.awayScore }
                  });
                  console.log(`[Resolution] Prediction Correct for ${game.id}`);
                } catch (e) {
                  console.error("Failed to save correct outcome:", e);
                }
              } else {
                // Mark as incorrect and analyze
                // We update the doc first to avoid loops if analysis fails
                try {
                   await bettorsEdge.savePrediction(game.id, {
                    ...prediction,
                    teams: [game.homeTeam, game.awayTeam],
                    outcome: 'incorrect',
                    actualWinner,
                    actualScore: { home: game.homeScore, away: game.awayScore }
                  });
                  
                  // Trigger AI analysis
                  console.log(`[Resolution] Prediction Incorrect for ${game.id}. Analyzing...`);
                  await bettorsEdge.analyzeLoss(game, prediction, { home: game.homeScore, away: game.awayScore });
                } catch (e) {
                  console.error("Failed to resolve incorrect prediction:", e);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("[Dashboard] resolveGames failed:", err);
      }
    };

    resolveGames().catch(console.error);
  }, [games, savedPredictions, isAdminUser]);

const fetchGames = async (force: boolean = false) => {
  if (activeTab === "Accuracy") {
    setGames([]);
    setLoading(false);
    return;
  }

  setLoading(true);
  setError(null);
  if (force) setGames([]);

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  console.log(`[Dashboard] fetchGames: Fetching schedule for ${activeTab} on ${dateStr} (force=${force})`);

  try {
    let fetchedGames: Game[] = [];
    const dateStrIso = format(selectedDate, "yyyy-MM-dd");

    console.log(`[Dashboard] fetchGames: Parallel fetch starting for ${activeTab}...`);

    const [espnGames, aiGames, apiSportsGames] = await Promise.all([
      (async () => {
        let timeoutId: NodeJS.Timeout;
        const timeoutPromise = new Promise<Game[]>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("ESPN fetch timed out")), 8000);
        });
        try {
          const res = await Promise.race([
            espnService.getSchedule(activeTab, selectedDate),
            timeoutPromise
          ]);
          console.log(`[Dashboard] fetchGames: ESPN fetch SUCCESS: ${res.length} games for ${activeTab}`);
          return res;
        } catch (e) {
          console.warn(`[Dashboard] fetchGames: ESPN fetch failed or timed out for ${activeTab}`, e);
          return [];
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      })(),

      bettorsEdge
        .getDailySchedule(activeTab, dateStrIso, force)
        .then((res) => {
          console.log(`[Dashboard] fetchGames: AI/Firestore fetch SUCCESS: ${res.length} games for ${activeTab}`);
          return res;
        })
        .catch((e) => {
          console.error(`[Dashboard] fetchGames: AI/Firestore fetch failed for ${activeTab}:`, e);
          return [];
        }),

      activeTab === "NBA"
        ? apiSportsService.getGames(selectedDate).then((res) => {
            console.log(`[Dashboard] fetchGames: API-Sports fetch SUCCESS: ${res.length} games`);
            return res;
          })
        : Promise.resolve([]),
    ]);

    if (Array.isArray(espnGames)) {
      fetchedGames = [...espnGames];
    }

    // Map API-Sports IDs to games
    if (activeTab === "NBA" && Array.isArray(apiSportsGames)) {
      if (apiSportsGames.length > 0) {
        setApiSportsStatus({ status: 'success', count: apiSportsGames.length });
        
        if (fetchedGames.length === 0) {
          console.log(`[Dashboard] fetchGames: ESPN returned 0 games. Using API-Sports games instead.`);
          fetchedGames = apiSportsGames.map(ag => {
            const statusStr = ag.status?.short || 'NS';
            let status: 'scheduled' | 'live' | 'finished' = 'scheduled';
            if (['1Q', '2Q', '3Q', '4Q', 'OT', 'HT'].includes(statusStr)) status = 'live';
            if (['FT', 'AOT'].includes(statusStr)) status = 'finished';

            const safeDateStr = ag.date ? ag.date.split("T")[0] : dateStrIso;
            const timeStr = ag.time || (ag.date ? ag.date.split("T")[1]?.substring(0, 5) : "00:00");

            return {
              id: `nba-${ag.teams.away.name}-${ag.teams.home.name}-${safeDateStr}`.toLowerCase().replace(/[^a-z0-9]/g, "-"),
              league: 'NBA',
              homeTeam: ag.teams.home.name,
              awayTeam: ag.teams.away.name,
              homeLogo: ag.teams.home.logo,
              awayLogo: ag.teams.away.logo,
              date: safeDateStr,
              time: timeStr,
              location: ag.venue || "Unknown",
              status: status,
              homeScore: ag.scores?.home?.total,
              awayScore: ag.scores?.away?.total,
              apiSportsGameId: ag.id,
              apiSportsHomeTeamId: ag.teams.home.id,
              apiSportsAwayTeamId: ag.teams.away.id,
            };
          });
        } else {
          console.log(`[Dashboard] fetchGames: Mapping API-Sports IDs to ${fetchedGames.length} games...`);
          fetchedGames.forEach((g) => {
            const apiGame = apiSportsGames.find((ag) => {
              if (!ag?.teams?.home?.name || !ag?.teams?.away?.name) return false;

              const normalize = (name: string) =>
                name?.toLowerCase().replace(/[^a-z0-9]/g, "").trim() || "";
              const agHome = normalize(ag.teams.home.name);
              const agAway = normalize(ag.teams.away.name);
              const gHome = normalize(g.homeTeam);
              const gAway = normalize(g.awayTeam);

              // Fuzzy match team names
              return (
                (agHome === gHome && agAway === gAway) ||
                (agHome.includes(gHome) && agAway.includes(gAway)) ||
                (gHome.includes(agHome) && gAway.includes(agAway))
              );
            });

            if (apiGame?.teams?.home && apiGame?.teams?.away) {
              g.apiSportsGameId = apiGame.id;
              g.apiSportsHomeTeamId = apiGame.teams.home.id;
              g.apiSportsAwayTeamId = apiGame.teams.away.id;
            }
          });
        }
        
        // Fetch expectations for all NBA games
        console.log(`[Dashboard] fetchGames: Fetching expectations for ${fetchedGames.length} NBA games...`);
        const gamesWithExpectations = await Promise.all(fetchedGames.map(async (g) => {
          if (g.apiSportsGameId) {
            try {
              const oddsData = await apiSportsBasketballService.getOddsForGame(g.apiSportsGameId);
              if (oddsData && oddsData.length > 0) {
                const gameOdds = oddsData[0];
                
                // Populate all sources
                g.allSources = gameOdds.bookmakers.map(b => {
                  const homeAwayBet = b.bets.find(bet => bet.betName === 'Home/Away');
                  const homeOddStr = homeAwayBet?.values.find(v => v.value === 'Home')?.odd;
                  const awayOddStr = homeAwayBet?.values.find(v => v.value === 'Away')?.odd;
                  
                  // Convert decimal odds to American odds
                  const toAmerican = (decimal: string | undefined) => {
                    if (!decimal) return undefined;
                    const dec = parseFloat(decimal);
                    if (isNaN(dec)) return undefined;
                    if (dec >= 2.0) {
                      return Math.round((dec - 1) * 100);
                    } else {
                      return Math.round(-100 / (dec - 1));
                    }
                  };

                  const homeOdd = toAmerican(homeOddStr);
                  const awayOdd = toAmerican(awayOddStr);
                  
                  // Try to find spread (Handicap)
                  const handicapBet = b.bets.find(bet => bet.betName === 'Handicap Result' || bet.betName === 'Asian Handicap');
                  let spreadVal: number | undefined;
                  if (handicapBet && handicapBet.values.length > 0) {
                    // Extract spread from value like "Home -5.5" or "-5.5"
                    const val = handicapBet.values[0].value;
                    const match = val.match(/[-+]?[0-9]*\.?[0-9]+/);
                    if (match) spreadVal = parseFloat(match[0]);
                  }

                  // Try to find total (Over/Under)
                  const totalBet = b.bets.find(bet => bet.betName === 'Over/Under');
                  let totalVal: number | undefined;
                  if (totalBet && totalBet.values.length > 0) {
                    const val = totalBet.values[0].value;
                    const match = val.match(/[-+]?[0-9]*\.?[0-9]+/);
                    if (match) totalVal = parseFloat(match[0]);
                  }
                  
                  return {
                    id: b.bookmakerId,
                    name: b.bookmakerName,
                    homeWinProb: homeOdd,
                    awayWinProb: awayOdd,
                    margin: spreadVal,
                    total: totalVal,
                  };
                }).filter(b => b.homeWinProb !== undefined && b.awayWinProb !== undefined);

                // Try to find a reputable source, e.g., Betcris, bet365, Bovada, Pinnacle
                const source = gameOdds.bookmakers.find(b => 
                  ['bet365', 'Bovada', 'Pinnacle', 'Betcris'].includes(b.bookmakerName)
                ) || gameOdds.bookmakers[0];
                
                if (source) {
                  const homeAwayBet = source.bets.find(bet => bet.betName === 'Home/Away');
                  if (homeAwayBet && homeAwayBet.values.length >= 2) {
                    const homeOddStr = homeAwayBet.values.find(v => v.value === 'Home')?.odd;
                    const awayOddStr = homeAwayBet.values.find(v => v.value === 'Away')?.odd;
                    
                    const toAmerican = (decimal: string | undefined) => {
                      if (!decimal) return undefined;
                      const dec = parseFloat(decimal);
                      if (isNaN(dec)) return undefined;
                      if (dec >= 2.0) {
                        return Math.round((dec - 1) * 100);
                      } else {
                        return Math.round(-100 / (dec - 1));
                      }
                    };

                    const homeOdd = toAmerican(homeOddStr);
                    const awayOdd = toAmerican(awayOddStr);
                    
                    if (homeOdd && awayOdd) {
                      g.marketExpectations = {
                        ...g.marketExpectations,
                        homeWinProb: homeOdd,
                        awayWinProb: awayOdd,
                        source: source.bookmakerName
                      };
                    }
                  }
                }
              }
            } catch (err) {
              console.warn(`[Dashboard] fetchGames: Failed to fetch expectations for game ${g.id}`, err);
            }
          }
          return g;
        }));
        
        fetchedGames = gamesWithExpectations;

      } else {
        setApiSportsStatus({ status: 'idle', count: 0, message: "No games found for this date in API-Sports" });
      }
    } else if (activeTab === "NBA") {
      setApiSportsStatus({ status: 'error', count: 0, message: "Failed to fetch from API-Sports" });
    }

    if (aiGames && Array.isArray(aiGames) && aiGames.length > 0) {
      const filteredAiGames = aiGames.filter((g) => {
        if (!g.league) return true;

        const gLeague = g.league.toUpperCase();
        const currentTab = activeTab.toUpperCase();

        const isMatch =
          gLeague === currentTab ||
          gLeague.includes(currentTab) ||
          currentTab.includes(gLeague);

        if (!isMatch) {
          console.log(
            `[Dashboard] fetchGames: AI game league mismatch. Game: ${g.awayTeam}@${g.homeTeam}, League: ${gLeague}, Tab: ${currentTab}`
          );
        }

        return isMatch;
      });

      filteredAiGames.forEach((g) => {
        if (g.id === "unique-id" || g.id === "unique_string_id" || !g.id) {
          const safeDateStr = g.date ? g.date.split("T")[0] : "unknown";
          g.id = `${g.league || activeTab}-${g.awayTeam}-${g.homeTeam}-${safeDateStr}`
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "-");
        }
      });

      if (fetchedGames.length === 0) {
        fetchedGames = filteredAiGames;
      } else {
        filteredAiGames.forEach((g) => {
          const isDuplicate = fetchedGames.some((eg) => {
            if (eg.id === g.id) return true;

            const normalize = (name: string) =>
              name?.toLowerCase().replace(/[^a-z0-9]/g, "").trim() || "";

            const egHome = normalize(eg.homeTeam);
            const egAway = normalize(eg.awayTeam);
            const gHome = normalize(g.homeTeam);
            const gAway = normalize(g.awayTeam);

            const homeMatch =
              egHome === gHome ||
              (egHome.length > 3 &&
                gHome.length > 3 &&
                (egHome.includes(gHome) || gHome.includes(egHome)));

            const awayMatch =
              egAway === gAway ||
              (egAway.length > 3 &&
                gAway.length > 3 &&
                (egAway.includes(gAway) || gAway.includes(egAway)));

            return homeMatch && awayMatch;
          });

          if (!isDuplicate) {
            console.log(`[Dashboard] fetchGames: Adding missing game from AI: ${g.awayTeam} @ ${g.homeTeam}`);
            fetchedGames.push(g);
          } else {
            const existingGame = fetchedGames.find((eg) => {
              const normalize = (name: string) =>
                name?.toLowerCase().replace(/[^a-z0-9]/g, "").trim() || "";

              const egHome = normalize(eg.homeTeam);
              const egAway = normalize(eg.awayTeam);
              const gHome = normalize(g.homeTeam);
              const gAway = normalize(g.awayTeam);

              return (
                (egHome === gHome || egHome.includes(gHome) || gHome.includes(egHome)) &&
                (egAway === gAway || egAway.includes(gAway) || gAway.includes(egAway))
              );
            });

            if (existingGame && g.id) {
              console.log(
                `[Dashboard] fetchGames: Syncing ID for ${existingGame.awayTeam} @ ${existingGame.homeTeam}: ${existingGame.id} -> ${g.id}`
              );
              existingGame.id = g.id;
            }
          }
        });
      }
    }

    const finalUniqueGames: Game[] = [];
    console.log(`[Dashboard] fetchGames: Starting final deduplication pass on ${fetchedGames.length} games.`);

    fetchedGames.forEach((g) => {
      const normalize = (name: string) => {
        if (!name) return "";
        const parts = name.toLowerCase().trim().split(/\s+/);
        return parts[parts.length - 1].replace(/[^a-z0-9]/g, "").trim();
      };

      const gHome = normalize(g.homeTeam);
      const gAway = normalize(g.awayTeam);

      const isAlreadyAdded = finalUniqueGames.some((ug) => {
        if (g.id && ug.id === g.id) {
          console.log(`[Dashboard] fetchGames: Duplicate ID found: ${g.id} (${g.awayTeam}@${g.homeTeam})`);
          return true;
        }

        const ugHome = normalize(ug.homeTeam);
        const ugAway = normalize(ug.awayTeam);

        const homeMatch =
          ugHome === gHome ||
          g.homeTeam.toLowerCase().includes(ug.homeTeam.toLowerCase()) ||
          ug.homeTeam.toLowerCase().includes(g.homeTeam.toLowerCase());

        const awayMatch =
          ugAway === gAway ||
          g.awayTeam.toLowerCase().includes(ug.awayTeam.toLowerCase()) ||
          ug.awayTeam.toLowerCase().includes(g.awayTeam.toLowerCase());

        if (homeMatch && awayMatch) {
          console.log(
            `[Dashboard] fetchGames: Duplicate team names found: ${g.awayTeam}@${g.homeTeam} matches ${ug.awayTeam}@${ug.homeTeam}`
          );
        }

        return homeMatch && awayMatch;
      });

      if (!isAlreadyAdded) {
        finalUniqueGames.push(g);
      }
    });

    fetchedGames = finalUniqueGames;

    const targetDateStr = format(selectedDate, "yyyy-MM-dd");
    fetchedGames = fetchedGames.filter((g) => {
      if (!g.date) return true;

      const gameDate = new Date(g.date);
      const gameEtStr = formatInTimeZone(gameDate, "America/New_York", "yyyy-MM-dd");

      const isMatch = gameEtStr === targetDateStr;
      if (!isMatch) {
        console.log(
          `[Dashboard] fetchGames: Filtering out game from different date. Game: ${g.awayTeam}@${g.homeTeam}, Date: ${gameEtStr}, Target: ${targetDateStr}`
        );
      }

      return isMatch;
    });

    console.log(
      `[Dashboard] fetchGames: Final unique games count after date filtering: ${fetchedGames?.length || 0} for ${activeTab}`
    );

    if (!fetchedGames || !Array.isArray(fetchedGames) || fetchedGames.length === 0) {
      console.warn(`[Dashboard] fetchGames: NO GAMES FOUND for ${activeTab} on ${dateStrIso} from any source.`);
      setGames([]);
    } else {
      console.log(
        `[Dashboard] fetchGames: Setting ${fetchedGames.length} games for ${activeTab}. Sample: ${fetchedGames[0].awayTeam}@${fetchedGames[0].homeTeam}`
      );
      setGames(fetchedGames);
      fetchKalshiExpectations(activeTab);
    }
  } catch (err: any) {
    const msg = err?.message || "Failed to fetch schedule. Please try again.";
    setError(msg);
    console.error("[Dashboard] Error fetching games:", err);
    setGames([]);
  } finally {
    setLoading(false);
  }
};

  const handleImportSchedule = async () => {
    if (!user) {
      setToast({ message: "Please login to import schedules.", type: "warning" });
      return;
    }
    
    if (loading) return;
    setLoading(true);
    
    try {
      setToast({ message: `Importing ${activeTab} schedule for next 7 days...`, type: "info" });
      
      await bettorsEdge.importSchedule(activeTab, new Date(), 7, (msg) => {
        setToast({ message: msg, type: "info" });
      });
      
      setToast({ message: "Schedule import complete!", type: "success" });
      fetchGames().catch(console.error); // Refresh current view
      
    } catch (err: any) {
      console.error("Import failed:", err);
      setToast({ message: "Failed to import schedule.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const fetchKalshiExpectations = async (league: string) => {
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      // We add a timeout to Kalshi so it doesn't block forever if the API is slow
      const kalshiTimeout = new Promise<any[]>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Kalshi timeout")), 8000);
      });

      const events = await Promise.race([
        kalshiService.getEvents(league),
        kalshiTimeout
      ]);
      
      if (timeoutId) clearTimeout(timeoutId);
      
      if (events.length > 0) {
        setKalshiStatus("connected");
        
        // Update games with expectations
        setGames(prevGames => {
          return prevGames.map(game => {
            const match = kalshiService.findMatchingEvent(game, events);
            if (match && match.markets && match.markets.length > 0) {
              const market = match.markets[0];
              if (market) {
                const normalize = (p: number | undefined | null) => {
                  if (p == null) return null;
                  return p > 1 ? p / 100 : p;
                };

                let yesPrice = normalize(market.yes_ask);
                let noPrice = normalize(market.no_ask);
                const yesBid = normalize(market.yes_bid);
                const noBid = normalize(market.no_bid);
                const lastPrice = normalize(market.last_price);

                // Intelligent Fallbacks for Accuracy
                // If Ask is missing, implies low liquidity. Try to infer from Bid or Last Price.
                
                // 1. Infer Yes Price
                if (yesPrice === null) {
                    if (noBid !== null) {
                        // If you can sell No at X, fair value for Yes is roughly 1 - X
                        yesPrice = 1 - noBid; 
                    } else if (lastPrice !== null) {
                        yesPrice = lastPrice;
                    }
                }

                // 2. Infer No Price
                if (noPrice === null) {
                    if (yesBid !== null) {
                        // If you can sell Yes at X, fair value for No is roughly 1 - X
                        noPrice = 1 - yesBid;
                    } else if (yesPrice !== null) {
                        // If we have Yes price, No is 1 - Yes
                        noPrice = 1 - yesPrice;
                    }
                }

                // 3. Final Safety Defaults (should be rare for active markets)
                if (yesPrice === null) yesPrice = 0.5;
                if (noPrice === null) noPrice = 1 - (yesPrice || 0.5);

                return {
                  ...game,
                  kalshiTicker: market.ticker,
                  kalshiMarketTitle: market.title,
                  kalshiExpectations: {
                    yes: yesPrice || 0,
                    no: noPrice || 0,
                    volume: market.volume
                  }
                };
              }
            }
            return game;
          });
        });
      } else {
        setKalshiStatus("disconnected");
      }
    } catch (err) {
      console.warn("Background Kalshi expectations fetch failed:", err);
      setKalshiStatus("error");
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

              
        
            
   
  const getFilteredGames = () => {
    console.log(`[Dashboard] getFilteredGames: Filtering ${games.length} games for ${activeTab}`);
    let filtered = games.filter(game => {
      if (!game.league) return true;
      const gLeague = game.league.toUpperCase();
      const currentTab = activeTab.toUpperCase();
      const isMatch = gLeague === currentTab || gLeague.includes(currentTab) || currentTab.includes(gLeague);
      
      if (!isMatch && Math.random() < 0.05) {
        console.log(`[Dashboard] getFilteredGames: League mismatch. Game: ${game.awayTeam}@${game.homeTeam}, League: ${gLeague}, Tab: ${currentTab}`);
      }
      
      return isMatch;
    });
    
    console.log(`[Dashboard] getFilteredGames: After league filter: ${filtered.length} games`);

    // Time filtering
    if (timeFilter !== "all") {
      filtered = filtered.filter(game => {
        const timeStr = game.time;
        if (!timeStr || timeStr === "TBD") return false;
        
        const isPM = timeStr.includes("PM");
        const [hourStr] = timeStr.replace(/ AM| PM/g, "").split(":");
        let hour = parseInt(hourStr, 10);
        
        if (isPM && hour !== 12) hour += 12;
        if (!isPM && hour === 12) hour = 0;
        
        if (timeFilter === "early") return hour < 16;
        if (timeFilter === "afternoon") return hour >= 16 && hour < 19;
        if (timeFilter === "late") return hour >= 19;
        
        return true;
      });
      console.log(`[Dashboard] getFilteredGames: After time filter (${timeFilter}): ${filtered.length} games`);
    }

    // Sorting
    filtered.sort((a, b) => {
      if (sortBy === "edge") {
        const getEdge = (g: Game) => {
          const pred = savedPredictions[g.id];
          if (!pred?.winProbability || !g.kalshiExpectations) return -1;
          const yesProb = g.kalshiExpectations.yes > 1 ? g.kalshiExpectations.yes / 100 : g.kalshiExpectations.yes;
          // Edge is the absolute difference between AI and Market
          return Math.abs(pred.winProbability - yesProb);
        };
        return getEdge(b) - getEdge(a);
      }
      
      if (sortBy === "confidence") {
        const getConf = (g: Game) => savedPredictions[g.id]?.confidence || -1;
        return getConf(b) - getConf(a);
      }
      
      // Default: Time
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    return filtered;
  };

  const filteredGames = getFilteredGames();

  const handleDiscussWithSnark = (game: Game) => {
    const prediction = savedPredictions[game.id];
    const prompt = `Tell me more about the ${game.awayTeam} vs ${game.homeTeam} game. ${prediction ? `The AI predicts ${prediction.winner} with ${prediction.confidence}/10 confidence.` : ""} What are the key factors I should watch for?`;
    
    // Dispatch custom event that ChatPanel listens for
    window.dispatchEvent(new CustomEvent("snark-chat-prompt", { 
      detail: { 
        message: prompt,
        gameId: game.id 
      } 
    }));
  };

  const handleAutoAnalyze = async (force: boolean = false) => {
    if (!isAdminUser) {
      setToast({ message: "Only administrators can trigger analysis.", type: "error" });
      return;
    }
    console.log("Analyze button clicked", { user, analyzing, loading, force, activeTab });
    
    if (!user) {
      setToast({ message: "Please login to analyze games.", type: "warning" });
      return;
    }
    
    // Safety check to prevent double submission
    if (analyzing) return;

    const targetLeague = activeTab;
    cancelAnalysisRef.current[targetLeague] = false;
    
    if (filteredGames.length === 0) {
      setToast({ message: "No games available to analyze.", type: "info" });
      return;
    }

    setAnalyzingMap(prev => ({ ...prev, [targetLeague]: true }));
    setAnalysisProgressMap(prev => ({
      ...prev,
      [targetLeague]: {
        current: 0,
        total: filteredGames.length,
        analyzingGameIds: [],
        message: `Initializing analysis for ${targetLeague}...`
      }
    }));

    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      setToast({ message: `Checking for injury updates for ${targetLeague}...`, type: "info" });
      
      const injuryUpdates = await bettorsEdge.checkInjuryUpdates(
        targetLeague, 
        dateStr, 
        filteredGames.filter(g => g.league === targetLeague), 
        () => cancelAnalysisRef.current[targetLeague],
        (current, total) => {
          setAnalysisProgressMap(prev => {
            const leagueProgress = prev[targetLeague];
            return {
              ...prev,
              [targetLeague]: leagueProgress ? {
                ...leagueProgress,
                message: `Checking ${targetLeague} injuries: ${current} of ${total} games...`
              } : null
            };
          });
        }
      );
      
      // Update local state with injury updates
      setSavedPredictions(prev => {
        const next = { ...prev };
        for (const [gameId, injuries] of Object.entries(injuryUpdates)) {
          if (next[gameId]) {
            next[gameId] = { ...next[gameId], injuries: injuries as any };
          }
        }
        return next;
      });

      // Save injury updates to Firestore if user is admin
      if (isAdminUser) {
        const db = getDb();
        const batch = writeBatch(db);
        for (const [gameId, injuries] of Object.entries(injuryUpdates)) {
          const docRef = doc(db, "predictions", gameId);
          batch.set(docRef, { injuries }, { merge: true });
        }
        await batch.commit();
      }

      setToast({ message: `Starting analysis for ${targetLeague} on ${dateStr}...`, type: "info" });

      const gamesToAnalyze = filteredGames.filter(game => {
        // Strict league check
        if (game.league !== targetLeague) return false;

        const existingPrediction = savedPredictions[game.id];
        
        // Check if injuries changed
        const newInjuries = injuryUpdates[game.id];
        const oldInjuries = existingPrediction?.injuries;
        const injuriesChanged = newInjuries && JSON.stringify(newInjuries) !== JSON.stringify(oldInjuries || []);

        return force || !existingPrediction || injuriesChanged || bettorsEdge.needsReanalysis(game, existingPrediction);
      });

      let completedCount = filteredGames.length - gamesToAnalyze.length;

      // Process in batches of 1 to improve performance while respecting rate limits
      const CONCURRENCY = 1;
      for (let i = 0; i < gamesToAnalyze.length; i += CONCURRENCY) {
        if (cancelAnalysisRef.current[targetLeague]) {
          setToast({ message: "Analysis stopped by user.", type: "info" });
          break;
        }

        const batch = gamesToAnalyze.slice(i, i + CONCURRENCY);
        
        await Promise.all(batch.map(async (game) => {
          if (cancelAnalysisRef.current[targetLeague]) return;

          try {
            // Optimistic UI: Mark this game as being analyzed
            setAnalysisProgressMap(prev => {
              const leagueProgress = prev[targetLeague];
              return {
                ...prev,
                [targetLeague]: leagueProgress ? {
                  ...leagueProgress,
                  current: completedCount + 1,
                  analyzingGameIds: [...leagueProgress.analyzingGameIds, game.id],
                  message: `Analyzing ${game.awayTeam} vs ${game.homeTeam}...`
                } : null
              };
            });

            // Fetch the absolute latest from Firestore to ensure we have injuries just saved
            const docRef = doc(getDb(), "predictions", game.id);
            const docSnap = await getDoc(docRef);
            const existingPrediction = docSnap.exists() ? docSnap.data() : savedPredictions[game.id];
            
            const prediction = await bettorsEdge.analyzeMatchup(game, dateStr, existingPrediction, [], () => cancelAnalysisRef.current[targetLeague]);
            
            if (prediction && game.id && !cancelAnalysisRef.current[targetLeague]) {
              // Save immediately to Firestore if user is admin
              if (isAdminUser) {
                await bettorsEdge.savePrediction(game.id, prediction);
              }
              
              // Update local state immediately so UI reflects completion
              setSavedPredictions(prev => ({
                ...prev,
                [game.id]: prediction
              }));
            }
          } catch (err) {
            console.error(`Failed to analyze game ${game.id}:`, err);
            await logError(err, `Failed to analyze game ${game.id}`, user?.uid);
            setToast({ message: `Failed to analyze ${game.awayTeam} vs ${game.homeTeam}.`, type: "error" });
          } finally {
            completedCount++;
            setAnalysisProgressMap(prev => {
              const leagueProgress = prev[targetLeague];
              return {
                ...prev,
                [targetLeague]: leagueProgress ? {
                  ...leagueProgress,
                  current: completedCount,
                  total: filteredGames.length,
                  analyzingGameIds: leagueProgress.analyzingGameIds.filter(id => id !== game.id),
                  message: `Completed ${completedCount} of ${filteredGames.length}...`
                } : null
              };
            });
          }
        }));
        
        // Increased delay between batches to respect rate limits and ensure completion (5s for full analysis)
        if (i + CONCURRENCY < gamesToAnalyze.length) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      if (cancelAnalysisRef.current[targetLeague]) {
        setToast({ 
          message: `Analysis stopped. Processed ${completedCount - (filteredGames.length - gamesToAnalyze.length)} games.`, 
          type: "info" 
        });
      } else {
        setToast({ 
          message: `Analysis complete. Processed ${gamesToAnalyze.length} games.`, 
          type: "success" 
        });
      }

    } catch (err: any) {
      console.error("Auto-analyze failed:", err);
      setToast({ message: `Auto-analysis failed: ${err.message}`, type: "error" });
    } finally {
      setAnalyzingMap(prev => ({ ...prev, [targetLeague]: false }));
      setAnalysisProgressMap(prev => ({ ...prev, [targetLeague]: null }));
    }
  };

  const handleReanalyzeSingleGame = async (game: Game) => {
    if (!user) {
      setToast({ message: "Please login to analyze games.", type: "warning" });
      return;
    }

    if (analyzing) {
      setToast({ message: "Analysis already in progress.", type: "warning" });
      return;
    }

    const targetLeague = activeTab;
    cancelAnalysisRef.current[targetLeague] = false;
    setAnalyzingMap(prev => ({ ...prev, [targetLeague]: true }));
    const dateStr = format(selectedDate, "yyyy-MM-dd");

    try {
      setAnalysisProgressMap(prev => ({
        ...prev,
        [targetLeague]: {
          current: 1,
          total: 1,
          analyzingGameIds: [game.id],
          message: `Checking injuries for ${game.awayTeam} vs ${game.homeTeam}...`
        }
      }));

      // 1. Check for injury updates first
      const updates = await bettorsEdge.checkInjuryUpdates(targetLeague, dateStr, [game], () => cancelAnalysisRef.current[targetLeague]);
      const db = getDb();
      
      if (!cancelAnalysisRef.current[targetLeague] && updates[game.id] && Array.isArray(updates[game.id])) {
        const docRef = doc(db, "predictions", game.id);
        const newPredictionData = { 
          gameId: game.id,
          league: targetLeague,
          date: dateStr,
          injuries: updates[game.id],
          lastUpdated: new Date().toISOString(),
          winner: savedPredictions[game.id]?.winner || "TBD",
          confidence: savedPredictions[game.id]?.confidence || 5,
          reasoning: savedPredictions[game.id]?.reasoning || "Injury report updated. Full analysis pending.",
          scenarioAnalysis: savedPredictions[game.id]?.scenarioAnalysis || "Pending analysis.",
          hedgingAdvice: savedPredictions[game.id]?.hedgingAdvice || "Pending analysis.",
          keyFactors: savedPredictions[game.id]?.keyFactors || [],
          kalshiPrice: savedPredictions[game.id]?.kalshiPrice || 0.5,
          qaStatus: savedPredictions[game.id]?.qaStatus || "verified"
        };
        await setDoc(docRef, newPredictionData, { merge: true });
        
        // Update local state
        setSavedPredictions(prev => ({
          ...prev,
          [game.id]: {
            ...(prev[game.id] || {}),
            ...newPredictionData
          }
        }));
      }

      if (cancelAnalysisRef.current[targetLeague]) {
        setToast({ message: "Analysis stopped by user.", type: "info" });
        return;
      }

      setAnalysisProgressMap(prev => ({
        ...prev,
        [targetLeague]: {
          current: 1,
          total: 1,
          analyzingGameIds: [game.id],
          message: `Re-analyzing ${game.awayTeam} vs ${game.homeTeam}...`
        }
      }));

      const docRef = doc(db, "predictions", game.id);
      const docSnap = await getDoc(docRef);
      const existingPrediction = docSnap.exists() ? docSnap.data() : savedPredictions[game.id];

      let prediction = await bettorsEdge.analyzeMatchup(game, dateStr, existingPrediction, [], () => cancelAnalysisRef.current[targetLeague]);
      
      if (prediction && game.id && !cancelAnalysisRef.current[targetLeague]) {
        // Save immediately to Firestore
        await bettorsEdge.savePrediction(game.id, prediction);
        
        // Update local state immediately so UI reflects completion
        setSavedPredictions(prev => ({
          ...prev,
          [game.id]: prediction
        }));
        setToast({ message: `Successfully re-analyzed ${game.awayTeam} vs ${game.homeTeam}.`, type: "success" });
      } else if (cancelAnalysisRef.current[targetLeague]) {
        setToast({ message: "Analysis stopped by user.", type: "info" });
      } else {
        setToast({ message: `Failed to generate prediction for ${game.awayTeam} vs ${game.homeTeam}.`, type: "error" });
      }
    } catch (err) {
      console.error(`Failed to re-analyze game ${game.id}:`, err);
      setToast({ message: `Failed to re-analyze ${game.awayTeam} vs ${game.homeTeam}.`, type: "error" });
    } finally {
      setAnalyzingMap(prev => ({ ...prev, [targetLeague]: false }));
      setAnalysisProgressMap(prev => ({ ...prev, [targetLeague]: null }));
    }
  };

  const handleReanalyzeLast3 = async () => {
    if (!user) {
      setToast({ message: "Please login to analyze games.", type: "warning" });
      return;
    }
    
    if (analyzing) return;

    const targetLeague = activeTab;
    cancelAnalysisRef.current[targetLeague] = false;
    setAnalyzingMap(prev => ({ ...prev, [targetLeague]: true }));
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      
      // Get the last 3 games
      const last3Games = games.slice(-3);
      
      if (last3Games.length === 0) {
        setToast({ message: "No games found to analyze.", type: "warning" });
        setAnalyzingMap(prev => ({ ...prev, [targetLeague]: false }));
        return;
      }

      setToast({ message: `Re-analyzing last ${last3Games.length} games...`, type: "info" });

      // 1. Check for injury updates first
      setAnalysisProgressMap(prev => ({
        ...prev,
        [targetLeague]: {
          current: 0,
          total: last3Games.length,
          analyzingGameIds: [],
          message: `Checking injuries for last ${last3Games.length} games...`
        }
      }));

      const updates = await bettorsEdge.checkInjuryUpdates(targetLeague, dateStr, last3Games, () => cancelAnalysisRef.current[targetLeague]);
      const db = getDb();
      const batch = writeBatch(db);
      let updateCount = 0;

      for (const [gameId, injuryUpdates] of Object.entries(updates)) {
        if (cancelAnalysisRef.current[targetLeague]) break;
        if (injuryUpdates && Array.isArray(injuryUpdates)) {
          const docRef = doc(db, "predictions", gameId);
          const newPredictionData = { 
            gameId: gameId,
            league: targetLeague,
            date: dateStr,
            injuries: injuryUpdates,
            lastUpdated: new Date().toISOString(),
            winner: savedPredictions[gameId]?.winner || "TBD",
            confidence: savedPredictions[gameId]?.confidence || 5,
            reasoning: savedPredictions[gameId]?.reasoning || "Injury report updated. Full analysis pending.",
            scenarioAnalysis: savedPredictions[gameId]?.scenarioAnalysis || "Pending analysis.",
            hedgingAdvice: savedPredictions[gameId]?.hedgingAdvice || "Pending analysis.",
            keyFactors: savedPredictions[gameId]?.keyFactors || [],
            kalshiPrice: savedPredictions[gameId]?.kalshiPrice || 0.5,
            qaStatus: savedPredictions[gameId]?.qaStatus || "verified"
          };
          batch.set(docRef, newPredictionData, { merge: true });
          
          setSavedPredictions(prev => ({
            ...prev,
            [gameId]: {
              ...(prev[gameId] || {}),
              ...newPredictionData
            }
          }));
          updateCount++;
        }
      }

      if (updateCount > 0 && !cancelAnalysisRef.current[targetLeague]) {
        await batch.commit();
      }

      let completedCount = 0;

      await Promise.all(last3Games.map(async (game) => {
        if (cancelAnalysisRef.current[targetLeague]) return;
        try {
          setAnalysisProgressMap(prev => {
            const leagueProgress = prev[targetLeague];
            return {
              ...prev,
              [targetLeague]: leagueProgress ? {
                ...leagueProgress,
                current: completedCount + 1,
                analyzingGameIds: [...leagueProgress.analyzingGameIds, game.id],
                message: `Re-analyzing ${game.awayTeam} vs ${game.homeTeam}...`
              } : null
            };
          });

          const docRef = doc(db, "predictions", game.id);
          const docSnap = await getDoc(docRef);
          const existingPrediction = docSnap.exists() ? docSnap.data() : savedPredictions[game.id];

          let prediction = await bettorsEdge.analyzeMatchup(game, dateStr, existingPrediction, [], () => cancelAnalysisRef.current[targetLeague]);
          
          if (prediction && game.id && !cancelAnalysisRef.current[targetLeague]) {
            // Save immediately to Firestore
            await bettorsEdge.savePrediction(game.id, prediction);
            
            // Update local state immediately so UI reflects completion
            setSavedPredictions(prev => ({
              ...prev,
              [game.id]: prediction
            }));
          }
        } catch (err) {
          console.error(`Failed to re-analyze game ${game.id}:`, err);
        } finally {
          completedCount++;
          setAnalysisProgressMap(prev => {
            const leagueProgress = prev[targetLeague];
            return {
              ...prev,
              [targetLeague]: leagueProgress ? {
                ...leagueProgress,
                current: completedCount,
                total: last3Games.length,
                analyzingGameIds: leagueProgress.analyzingGameIds.filter(id => id !== game.id),
                message: `Completed ${completedCount} of ${last3Games.length}...`
              } : null
            };
          });
        }
      }));

      if (cancelAnalysisRef.current[targetLeague]) {
        setToast({ message: "Re-analysis stopped by user.", type: "info" });
      } else {
        setToast({ 
          message: `Re-analysis complete. Processed ${last3Games.length} games.`, 
          type: "success" 
        });
      }

    } catch (err: any) {
      console.error("Re-analyze failed:", err);
      setToast({ message: `Re-analysis failed: ${err.message}`, type: "error" });
    } finally {
      setAnalyzingMap(prev => ({ ...prev, [targetLeague]: false }));
      setAnalysisProgressMap(prev => ({ ...prev, [targetLeague]: null }));
    }
  };

  const handleStopAnalysis = () => {
    console.log("[Dashboard] Stopping analysis/injury check...");
    cancelAnalysisRef.current[activeTab] = true;
    setAnalyzingMap(prev => ({ ...prev, [activeTab]: false }));
    setAnalysisProgressMap(prev => ({ ...prev, [activeTab]: null }));
    setToast({ message: "Stopping process...", type: "info" });
  };

  const handleRefresh = () => {
    espnService.clearCache();
    // Clear throttles to allow immediate re-fetch
    lastHistoryFetchRef.current = 0;
    lastPredictionsFetchRef.current = {};
    
    fetchGames(true).catch(console.error);
    
    // Manually trigger predictions/history fetch by clearing throttles and re-running effects
    // (The effects will re-run because we are calling fetchGames which might change state, 
    // but to be sure we can manually call them if needed, or just wait for the next render)
    
    setToast({ message: "Schedule and predictions refreshed.", type: "success" });
  };

  // DEBUG: Minimal render to isolate failure
  console.log("[DBG] Dashboard render cycle", { loading, gamesCount: games.length, error });

  const handleCancelSubscription = async () => {
    if (!user) return;
    
    try {
      const token = await getIdToken();
      const response = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel subscription');
      }

      setToast({ message: data.message, type: "success" });
    } catch (error: any) {
      console.error('Cancellation error:', error);
      setToast({ message: error.message || "Failed to cancel subscription.", type: "error" });
    }
  };

  const handleManageSports = () => {
    setActiveTab("Add Sport");
  };
 
 console.log("[Render Check]", {
  authReady,
  hasUser: !!user,
  hasUserProfile: !!userProfile,
  profileError,
  activeTab,
  gamesCount: games.length,
});

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-6 max-w-xs text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div>
            <Trophy className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-indigo-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Initializing Profile</h2>
            <p className="text-slate-400 text-sm animate-pulse">
              Syncing your edge with the latest data...
            </p>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 text-xs text-slate-500 hover:text-slate-300 underline underline-offset-4"
          >
            Taking too long? Tap to reload
          </button>
        </div>
      </div>
    );
  }

  if (authReady && !user) {
    return (
      <Layout 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        isAdmin={isAdminUser} 
        subscribedSports={userProfile?.subscribedSports || []}
        userProfile={userProfile}
        onCancelSubscription={() => handleCancelSubscription().catch(console.error)}
        onManageSports={handleManageSports}
      >
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
          <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-8 shadow-[0_0_40px_-10px_rgba(245,158,11,0.3)]">
            <Zap className="w-10 h-10 text-amber-500 fill-current" />
          </div>
          <h1 className="text-4xl font-black text-white mb-4 tracking-tight">Welcome to Bettors Edge</h1>
          <p className="text-slate-400 max-w-md mb-12 text-lg">
            The most advanced AI-driven sports analysis engine. Login to access professional-grade analytical insights.
          </p>
          <button 
            onClick={() => loginWithGoogle().catch(console.error)}
            className="flex items-center px-8 py-4 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-2xl font-bold transition-all shadow-xl hover:shadow-amber-500/20 text-lg gap-3"
          >
            <LogIn className="w-6 h-6" />
            Login with Google
          </button>
          
          <div className="mt-12 flex items-center gap-6 text-xs text-slate-500">
            <button 
              onClick={() => setLegalModal({ isOpen: true, type: "terms" })}
              className="hover:text-indigo-400 transition-colors"
            >
              Terms of Service
            </button>
            <div className="w-1 h-1 rounded-full bg-slate-800" />
            <button 
              onClick={() => setLegalModal({ isOpen: true, type: "privacy" })}
              className="hover:text-indigo-400 transition-colors"
            >
              Privacy Policy
            </button>
          </div>
        </div>
        <LegalModal 
          isOpen={legalModal.isOpen} 
          onClose={() => setLegalModal({ ...legalModal, isOpen: false })} 
          type={legalModal.type} 
        />
      </Layout>
    );
  }

  if (authReady && user && (!userProfile || profileError)) {
    return (
      <Layout 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        isAdmin={isAdminUser} 
        subscribedSports={userProfile?.subscribedSports || []}
        userProfile={userProfile}
        onCancelSubscription={() => handleCancelSubscription().catch(console.error)}
        onManageSports={handleManageSports}
      >
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          {profileError ? (
            <>
              <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Profile Sync Error</h3>
              <p className="text-slate-400 max-w-md mb-6">{profileError}</p>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Open in New Tab (Recommended)
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded-xl border border-slate-800 transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry Connection
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500 mb-4"></div>
              <p className="text-slate-400">Optimizing your experience...</p>
            </>
          )}
        </div>
      </Layout>
    );
  }

  const isSportTab = activeTab !== "Accuracy" && activeTab !== "Users" && activeTab !== "Admin" && activeTab !== "Add Sport";
  const showPaywall = !!(authReady && user && userProfile && isSportTab && (forcePaywall || !isSubscribedToSport(activeTab)));

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={(tab) => {
        addDebugLog(`Tab Changed to: ${tab}`);
        setActiveTab(tab);
      }}
      isAdmin={isAdminUser}
      subscribedSports={userProfile?.subscribedSports || []}
      userProfile={userProfile}
      onCancelSubscription={() => handleCancelSubscription().catch(console.error)}
      onManageSports={handleManageSports}
      onOpenFAQ={onOpenFAQ}
    >
      {JoyrideAny && !showPaywall && !isMobile && (
        <JoyrideAny
          steps={walkthroughSteps}
          run={runWalkthrough && activeTab === "NBA" && filteredGames.length > 0 && !showPaywall}
          continuous
          disableBeacon
          callback={(data) => handleJoyrideCallback(data).catch(console.error)}
          showProgress
          showSkipButton
        />
      )}

      <Suspense fallback={<div className="min-h-[200px] flex items-center justify-center text-slate-500 animate-pulse">Loading component...</div>}>
        {showPaywall ? (
          <Paywall
            onSubscribe={(sports) => handleSubscribe(sports).catch(console.error)}
            initialSports={[...(userProfile?.subscribedSports || []), activeTab].filter((s) => s !== "Add Sport")}
            existingSports={userProfile?.subscribedSports || []}
          />
        ) : activeTab === "Accuracy" ? (
          <AccuracyTab predictions={allPredictions} onSyncPending={() => handleSyncPending().catch(console.error)} isSyncing={loading} />
        ) : activeTab === "Users" ? (
          <AdminUsersTab />
        ) : activeTab === "Admin" ? (
          <AdminTab debugLogs={debugLogs} />
        ) : (
          <>
            {error?.includes("Quota exceeded") && (
              <QuotaBanner message="You've reached the daily limit for database reads." />
            )}
            
            <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start sm:items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 sm:mt-0" />
              <p className="text-sm text-amber-200/80 leading-relaxed">
                <strong className="text-amber-400 font-semibold mr-1">Disclaimer:</strong>
                These AI-generated insights are predictions, not guarantees.
              </p>
            </div>

            <DashboardHeader
              activeTab={activeTab}
              isAdminUser={isAdminUser}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              handleRefresh={handleRefresh}
              analyzing={analyzing}
              loading={loading}
              handleAutoAnalyze={(force) => handleAutoAnalyze(force).catch(console.error)}
              setIsBriefingOpen={setIsBriefingOpen}
              handleImportSchedule={() => handleImportSchedule().catch(console.error)}
              handleStopAnalysis={handleStopAnalysis}
              apiSportsStatus={apiSportsStatus}
            />

            {isAdminUser && (
              <TopPicksOfTheDay
                games={filteredGames}
                predictions={allPredictions}
                selectedDate={selectedDate}
                league={activeTab}
                onSelectLeague={setActiveTab}
              />
            )}

            <div className="py-8">
              <GameGrid
                loading={loading}
                error={error}
                filteredGames={filteredGames}
                savedPredictions={savedPredictions}
                analyzing={analyzing}
                analysisProgress={analysisProgress}
                isAdminUser={isAdminUser}
                handleReanalyzeSingleGame={(game) => handleReanalyzeSingleGame(game).catch(console.error)}
                handleDiscussWithSnark={handleDiscussWithSnark}
              />
            </div>
          </>
        )}
      </Suspense>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {!showPaywall && (
        <Suspense fallback={null}>
          <ChatPanel games={games} predictions={allPredictions} />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <DailyBriefingModal
          isOpen={isBriefingOpen}
          onClose={() => setIsBriefingOpen(false)}
          league={activeTab}
          date={selectedDate}
          games={games}
        />
      </Suspense>
    </Layout>
  );
}
