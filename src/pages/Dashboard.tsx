import React, { useState, useEffect, useRef, useMemo } from "react";
import { format, addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { Layout } from "../components/Layout";
import { GameCard } from "../components/GameCard";
import { espnService } from "../services/espn";
import { sportradarService } from "../services/sportradar";
import { sportsOracle } from "../services/gemini";
import { kalshiService } from "../services/kalshi";
import { Game, Prediction, TournamentBracket } from "../types";
import { logError } from "../services/logger";
import { Calendar as CalendarIcon, Loader2, AlertCircle, Zap, LogIn, LogOut, User as UserIcon, RefreshCw, FileText, Activity, Trophy, Brain, TrendingUp, ShieldCheck, Shield } from "lucide-react";
import { Toast } from "../components/Toast";
import { LocksOfTheDay } from "../components/LocksOfTheDay";
import { AccuracyTab } from "../components/AccuracyTab";
import { SportControls } from "../components/SportControls";
import { ChatPanel } from "../components/ChatPanel";
import { LegalModal } from "../components/LegalModal";
import { cn } from "../lib/utils";
import { getAuthInstance, getDb, loginWithGoogle, logout, getIdToken } from "../firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, onSnapshot, doc, writeBatch, getDoc, query, where, setDoc, deleteDoc, orderBy, limit } from "firebase/firestore";
import { sendNotification, requestNotificationPermission } from "../utils/notification";
import { handleFirestoreError, OperationType } from "../lib/firestoreErrors";
import { UserProfile, Bet } from "../types";
import { Paywall } from "../components/Paywall";
import BankrollTracker from '../components/BankrollTracker';
import { bettingService } from '../services/bettingService';
import { AdminUsersTab } from "../components/AdminUsersTab";
import { DailyBriefingModal } from "../components/DailyBriefingModal";
import { Bracket } from "../components/Bracket";
import { TournamentTracker } from "../components/TournamentTracker";
import { GameGridErrorBoundary } from "../components/ErrorBoundary";
import { loadStripe } from "@stripe/stripe-js";
import { Joyride, STATUS } from "react-joyride";
import type { Step } from "react-joyride";

// Robust Joyride component retrieval
const JoyrideComponent = (Joyride as any)?.default || Joyride;
const JoyrideAny = typeof JoyrideComponent === 'function' ? JoyrideComponent : null;

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

type ApiSportsWidgetEmbedProps = {
  html: string;
  className?: string;
};

let apiSportsScriptPromise: Promise<void> | null = null;

function loadApiSportsScript() {
  if (typeof window === "undefined") return Promise.resolve();

  if ((window as any).__apiSportsWidgetsLoaded) {
    return Promise.resolve();
  }

  if (!apiSportsScriptPromise) {
    apiSportsScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-api-sports-widgets="true"]'
      );

      if (existing) {
        existing.addEventListener("load", () => {
          (window as any).__apiSportsWidgetsLoaded = true;
          resolve();
        });
        existing.addEventListener("error", reject);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://widgets.api-sports.io/2.0.3/widgets.js";
      script.async = true;
      script.defer = true;
      script.dataset.apiSportsWidgets = "true";

      script.onload = () => {
        (window as any).__apiSportsWidgetsLoaded = true;
        resolve();
      };

      script.onerror = reject;

      document.body.appendChild(script);
    });
  }

  return apiSportsScriptPromise;
}

function ApiSportsWidgetEmbed({ html, className }: ApiSportsWidgetEmbedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const mount = async () => {
      await loadApiSportsScript();
      if (cancelled || !containerRef.current) return;

      containerRef.current.innerHTML = html;

      const maybeRefresh = (window as any)?.ApiSportsWidgets?.refresh;
      if (typeof maybeRefresh === "function") {
        maybeRefresh();
      }
    };

    mount().catch((err) => {
      console.error("[API-Sports Widgets] Failed to load widget script:", err);
    });

    return () => {
      cancelled = true;
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [html]);

  return <div ref={containerRef} className={className} />;
}

function NbaApiSportsPanel({
  gamesWidgetHtml,
  gameWidgetHtml,
  h2hWidgetHtml,
}: {
  gamesWidgetHtml: string;
  gameWidgetHtml: string;
  h2hWidgetHtml: string;
}) {
  const [activeWidgetTab, setActiveWidgetTab] = useState<"games" | "game" | "h2h">("games");

  const currentHtml = useMemo(() => {
    switch (activeWidgetTab) {
      case "game":
        return gameWidgetHtml;
      case "h2h":
        return h2hWidgetHtml;
      case "games":
      default:
        return gamesWidgetHtml;
    }
  }, [activeWidgetTab, gamesWidgetHtml, gameWidgetHtml, h2hWidgetHtml]);

  return (
    <section className="mb-8 rounded-3xl border border-slate-800 bg-slate-900/70 p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-xl font-bold text-white">API-Sports NBA Widgets</h3>
          <p className="text-sm text-slate-400">
            Live games, single-game detail, and matchup history.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/80 p-1">
          <button
            onClick={() => setActiveWidgetTab("games")}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              activeWidgetTab === "games"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            Games
          </button>

          <button
            onClick={() => setActiveWidgetTab("game")}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              activeWidgetTab === "game"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            Game
          </button>

          <button
            onClick={() => setActiveWidgetTab("h2h")}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              activeWidgetTab === "h2h"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            H2H
          </button>
        </div>
      </div>

      <div className="min-h-[560px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-2 md:p-4">
        <ApiSportsWidgetEmbed html={currentHtml} />
      </div>
    </section>
  );
}
type ApiSportsWidgetEmbedProps = {
  html: string;
  className?: string;
};

let apiSportsScriptPromise: Promise<void> | null = null;

function loadApiSportsScript() {
  if (typeof window === "undefined") return Promise.resolve();

  if ((window as any).__apiSportsWidgetsLoaded) {
    return Promise.resolve();
  }

  if (!apiSportsScriptPromise) {
    apiSportsScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-api-sports-widgets="true"]'
      );

      if (existing) {
        existing.addEventListener("load", () => {
          (window as any).__apiSportsWidgetsLoaded = true;
          resolve();
        });
        existing.addEventListener("error", reject);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://widgets.api-sports.io/2.0.3/widgets.js";
      script.async = true;
      script.defer = true;
      script.dataset.apiSportsWidgets = "true";

      script.onload = () => {
        (window as any).__apiSportsWidgetsLoaded = true;
        resolve();
      };

      script.onerror = reject;

      document.body.appendChild(script);
    });
  }

  return apiSportsScriptPromise;
}

function ApiSportsWidgetEmbed({ html, className }: ApiSportsWidgetEmbedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const mount = async () => {
      await loadApiSportsScript();
      if (cancelled || !containerRef.current) return;

      containerRef.current.innerHTML = html;

      const maybeRefresh = (window as any)?.ApiSportsWidgets?.refresh;
      if (typeof maybeRefresh === "function") {
        maybeRefresh();
      }
    };

    mount().catch((err) => {
      console.error("[API-Sports Widgets] Failed to load widget script:", err);
    });

    return () => {
      cancelled = true;
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [html]);

  return <div ref={containerRef} className={className} />;
}

function NbaApiSportsPanel({
  gamesWidgetHtml,
  gameWidgetHtml,
  h2hWidgetHtml,
}: {
  gamesWidgetHtml: string;
  gameWidgetHtml: string;
  h2hWidgetHtml: string;
}) {
  const [activeWidgetTab, setActiveWidgetTab] = useState<"games" | "game" | "h2h">("games");

  const currentHtml = useMemo(() => {
    switch (activeWidgetTab) {
      case "game":
        return gameWidgetHtml;
      case "h2h":
        return h2hWidgetHtml;
      case "games":
      default:
        return gamesWidgetHtml;
    }
  }, [activeWidgetTab, gamesWidgetHtml, gameWidgetHtml, h2hWidgetHtml]);

  return (
    <section className="mb-8 rounded-3xl border border-slate-800 bg-slate-900/70 p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-xl font-bold text-white">API-Sports NBA Widgets</h3>
          <p className="text-sm text-slate-400">
            Live games, single-game detail, and matchup history.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/80 p-1">
          <button
            onClick={() => setActiveWidgetTab("games")}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              activeWidgetTab === "games"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            Games
          </button>

          <button
            onClick={() => setActiveWidgetTab("game")}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              activeWidgetTab === "game"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            Game
          </button>

          <button
            onClick={() => setActiveWidgetTab("h2h")}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${
              activeWidgetTab === "h2h"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            H2H
          </button>
        </div>
      </div>

      <div className="min-h-[560px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-2 md:p-4">
        <ApiSportsWidgetEmbed html={currentHtml} />
      </div>
    </section>
  );
}

export function Dashboard({
  user: initialUser,
  onOpenFAQ,
}: {
  user: User;
  onOpenFAQ: () => void;
}) {
  const [activeTab, setActiveTab] = useState("NBA");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzingMap, setAnalyzingMap] = useState<Record<string, boolean>>({});
  const [mainTab, setMainTab] = useState<"analysis" | "bankroll">("analysis");
  const [error, setError] = useState<string | null>(null);
  const [savedPredictions, setSavedPredictions] = useState<Record<string, Prediction>>({});
  const [allPredictions, setAllPredictions] = useState<Record<string, Prediction>>({});
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  // API-Sports widget snippets
  const apiSportsGamesWidgetHtml = `
    <!-- PASTE THE EXACT API-SPORTS GAMES WIDGET SNIPPET HERE -->
  `;

  const apiSportsGameWidgetHtml = `
    <!-- PASTE THE EXACT API-SPORTS GAME WIDGET SNIPPET HERE -->
  `;

  const apiSportsH2HWidgetHtml = `
    <!-- PASTE THE EXACT API-SPORTS H2H WIDGET SNIPPET HERE -->
  `;

  // Persistent Logging Helper
  const addDebugLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const fullMsg = \`[\${timestamp}] \${msg}\`;
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
  const [authReady, setAuthReady] = useState(false);
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
  const [testingSportradar, setTestingSportradar] = useState(false);
  const [lastTestResult, setLastTestResult] = useState<any>(null);

  const handleTestSportradar = async () => {
    setTestingSportradar(true);
    try {
      const data = await sportradarService.testConnection();
      setLastTestResult(data);
      const { nba, odds, schedule, otherSports } = data.results || {};
      const { prefix, length } = data.keyInfo || {};
      
      let message = `Key: ${prefix}... (${length} chars) | `;
      if (nba?.status === 'success') message += `NBA: OK | `;
      else message += `NBA: FAIL (${nba?.code || 'ERR'}) | `;
      
      if (schedule?.status === 'success') message += `Sched: OK | `;
      else message += `Sched: FAIL (${schedule?.code || 'ERR'}) | `;
      
      if (odds?.status === 'success') message += `Odds: OK`;
      else message += `Odds: FAIL (${odds?.code || 'ERR'})`;

      // Check for other sports success to help identify key type
      const activeSports = Object.entries(otherSports || {})
        .filter(([_, status]) => status === 'success')
        .map(([name]) => name.toUpperCase());
      
      if (activeSports.length > 0) {
        message += ` | Other: ${activeSports.join(', ')}`;
      }

      setToast({ 
        message,
        type: (nba?.status === 'success' && odds?.status === 'success' && schedule?.status === 'success') ? "success" : "warning"
      });
    } catch (err: any) {
      console.error("Sportradar test failed:", err);
      setToast({ 
        message: `Sportradar FAILED: ${err.message || 'Unknown error'}`, 
        type: "error" 
      });
    } finally {
      setTestingSportradar(false);
    }
  };

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
      content: "Get a high-level summary of today's slate, including key narratives and betting trends, generated by our AI.",
    },
    {
      target: "#game-grid",
      content: "This is where you'll find all the games for the selected date. Each card contains deep analysis and predictions.",
    },
    {
      target: "#confidence-score",
      content: "Our AI assigns a confidence score from 1 to 10. Scores above 7 indicate high-conviction plays.",
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
  useEffect(() => {
    console.log("[Dashboard] Mounted. User:", user?.email, "Active Tab:", activeTab);
    console.log("[Dashboard] Environment:", {
      hostname: window.location.hostname,
      isIframe: window.self !== window.top,
      userAgent: navigator.userAgent
    });

    // Check for Stripe session_id in URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    if (sessionId) {
      console.log("[Dashboard] Stripe session_id detected:", sessionId);
      setToast({ message: "Subscription successful! Welcome to Premium.", type: "success" });
      // Clean up URL to prevent reload loops
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    console.log("[Dashboard] Initializing Profile Listener...");
    const db = getDb();
    setProfileError(null);
    let profileUnsubscribe: (() => void) | null = null;

    if (user) {
      const userEmail = (user.email || "").toLowerCase().trim();
      const isBypass = BYPASS_EMAILS.includes(userEmail);
      if (isBypass) {
        console.log("[Dashboard] Immediate Bypass Detected for:", userEmail);
        setIsAdminUser(true);
      }

      const setupProfile = async () => {
        // 1. Ensure user document exists (one-time check/creation)
        const userRef = doc(db, "users", user.uid);
        try {
          const userDoc = await getDoc(userRef);
          if (!userDoc.exists()) {
            console.log("[Dashboard] Creating new user profile for:", user.email);
            await setDoc(userRef, {
              uid: user.uid,
              email: user.email || "",
              displayName: user.displayName || "",
              createdAt: new Date().toISOString(),
              subscriptionStatus: 'inactive',
              subscribedSports: [],
              acceptedTerms: true, // They must have accepted on LandingPage
              termsAcceptedAt: new Date().toISOString(),
              bankroll: 1000, // Default starting bankroll
              hasSeenWalkthrough: false
            });
          }
        } catch (err) {
          console.error("[Dashboard] Error ensuring user doc exists:", err);
          setProfileError("Failed to initialize your profile. Please check your connection.");
        }

        // 2. Set up real-time profile listener
        profileUnsubscribe = onSnapshot(userRef, (docSnap) => {
          console.log("[Dashboard] Profile snapshot received:", docSnap.exists() ? "Exists" : "Not Found");
          
          const userEmail = (user.email || "").toLowerCase().trim();
          const isBypassEmail = BYPASS_EMAILS.includes(userEmail);

          if (docSnap.exists()) {
            const profile = docSnap.data() as UserProfile;
            setUserProfile(profile);
            
            const isAdmin = profile.role === 'admin' || isBypassEmail;
            console.log("[Dashboard] Admin Check:", { email: userEmail, isAdmin, role: profile.role, isBypass: isBypassEmail });
            setIsAdminUser(isAdmin);

            // Auto-switch to first subscribed sport ONLY ONCE on initial load if current tab is not subscribed and user is not admin
            const hasAutoSwitched = sessionStorage.getItem('hasAutoSwitched');
            if (!isAdmin && profile.subscribedSports && profile.subscribedSports.length > 0 && !hasAutoSwitched) {
              if (!profile.subscribedSports.includes(activeTab) && activeTab !== "Accuracy" && activeTab !== "Users" && activeTab !== "Add Sport") {
                console.log("[Dashboard] Initial auto-switch to first subscribed sport:", profile.subscribedSports[0]);
                setActiveTab(profile.subscribedSports[0]);
                sessionStorage.setItem('hasAutoSwitched', 'true');
              }
            }

            // Trigger walkthrough if not seen
            const hasSeenLocal = localStorage.getItem('hasSeenWalkthrough') === 'true';
            const hasSeenRemote = profile.hasSeenWalkthrough === true;
            
            console.log("[Dashboard] Walkthrough Check:", { hasSeenLocal, hasSeenRemote });

            if (!hasSeenLocal && !hasSeenRemote && !walkthroughTriggeredRef.current) {
              console.log("[Dashboard] Conditions met for walkthrough. Triggering...");
              walkthroughTriggeredRef.current = true;
              setRunWalkthrough(true);
              // Set local storage immediately to prevent re-triggering on refresh during walkthrough
              localStorage.setItem('hasSeenWalkthrough', 'true');
            }
          } else {
            // Fallback if doc was somehow deleted or not yet created
            setUserProfile({
              uid: user.uid,
              email: user.email || '',
              subscriptionStatus: 'inactive',
              subscribedSports: [],
            });
            setIsAdminUser(isBypassEmail);
          }
          setAuthReady(true);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          setProfileError("Lost connection to your profile. Retrying...");
          setAuthReady(true);
        });
      };

      setupProfile();
    } else {
      setUserProfile(null);
      setIsAdminUser(false);
      setAuthReady(true);
    }

    return () => {
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, [user, activeTab]);

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
        // The onSnapshot listener will handle the profile update, 
        // but we can show a optimistic message or refresh
        setToast({ message: "Subscription successful! Welcome to Premium.", type: "success" });
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
    // 4. The sport is explicitly in their subscribedSports list
    const isSubscribed = 
      isAdminUser || 
      isBypassEmail || 
      isPaywallBypassOnly || 
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
                
                await sportsOracle.savePrediction(predictionId, {
                  ...prediction,
                  teams: [game.homeTeam, game.awayTeam],
                  outcome: isCorrect ? 'correct' : 'incorrect',
                  actualWinner,
                  actualScore: { home: game.homeScore, away: game.awayScore }
                });
                
                if (!isCorrect) {
                  await sportsOracle.analyzeLoss(game, prediction, { home: game.homeScore, away: game.awayScore });
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

  // Firestore Sync - All Predictions for History/Accuracy
  useEffect(() => {
    if (!authReady || !user) {
      setAllPredictions({});
      return;
    }

    console.log(`[Dashboard] Subscribing to all predictions for history`);

    const db = getDb();
    const q = query(
      collection(db, "predictions"), 
      orderBy("date", "desc"),
      limit(300)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const preds: Record<string, Prediction> = {};
      snapshot.forEach((doc) => {
        preds[doc.id] = doc.data() as Prediction;
      });
      setAllPredictions(preds);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "predictions");
    });

    return () => unsubscribe();
  }, [authReady]);

  // Derive current date predictions from all predictions
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

  const fetchBracket = async () => {
    console.log(`[Dashboard] fetchBracket called for NCAA 2026`);
    setLoadingBracket(true);
    try {
      const data = await sportsOracle.getTournamentBracket("NCAA", 2026);
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
      fetchBracket();
    }
  }, [activeTab]);

  useEffect(() => {
    fetchGames();
    // We no longer cancel analysis on tab change to allow background processing
  }, [activeTab, selectedDate]);

  const [alertedGames, setAlertedGames] = useState<Set<string>>(new Set());

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Polling for 30-min alerts
  useEffect(() => {
    const checkGames = async () => {
      const now = new Date();
      const thirtyMinsFromNow = new Date(now.getTime() + 30 * 60 * 1000);
      
      for (const game of games) {
        const gameTime = new Date(game.date);
        
        if (gameTime > now && gameTime <= thirtyMinsFromNow && !alertedGames.has(game.id)) {
          console.log(`[Alert] Game ${game.id} is starting in 30 mins. Checking for changes...`);
          
          // Re-analyze to check for changes
          const oldPrediction = savedPredictions[game.id];
          let newPrediction = await sportsOracle.analyzeMatchup(game, game.date, oldPrediction);
          
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
    };

    const interval = setInterval(checkGames, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [games, savedPredictions, alertedGames]);

  // Polling for Kalshi Odds
  useEffect(() => {
    // Only poll if we have games loaded
    if (games.length === 0) return;

    // Initial fetch if needed (though fetchGames calls it too)
    // fetchKalshiOdds(activeTab);

    const intervalId = setInterval(() => {
      console.log(`[Dashboard] Polling Kalshi odds for ${activeTab}...`);
      fetchKalshiOdds(activeTab);
    }, 30000); // 30 seconds

    return () => clearInterval(intervalId);
  }, [activeTab, games.length]); // Re-run if tab changes or games array length changes

  // Resolve finished games
  useEffect(() => {
    if (!games.length || !Object.keys(savedPredictions).length) return;

    const resolveGames = async () => {
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
                await sportsOracle.savePrediction(game.id, {
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
                 await sportsOracle.savePrediction(game.id, {
                  ...prediction,
                  teams: [game.homeTeam, game.awayTeam],
                  outcome: 'incorrect',
                  actualWinner,
                  actualScore: { home: game.homeScore, away: game.awayScore }
                });
                
                // Trigger AI analysis
                console.log(`[Resolution] Prediction Incorrect for ${game.id}. Analyzing...`);
                await sportsOracle.analyzeLoss(game, prediction, { home: game.homeScore, away: game.awayScore });
              } catch (e) {
                console.error("Failed to resolve incorrect prediction:", e);
              }
            }
          }
        }
      }
    };

    resolveGames();
  }, [games, savedPredictions]);

  const fetchGames = async (force: boolean = false) => {
    if (activeTab === "Accuracy") {
      setGames([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    if (force) setGames([]); // Clear previous games to avoid showing stale data
    
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    console.log(`[Dashboard] fetchGames: Fetching schedule for ${activeTab} on ${dateStr} (force=${force})`);

    try {
      let fetchedGames: Game[] = [];
      const dateStrIso = format(selectedDate, "yyyy-MM-dd");
      
      console.log(`[Dashboard] fetchGames: Parallel fetch starting for ${activeTab}...`);
      
      // Fetch both in parallel to be as fast as possible
      const [espnGames, aiGames, srGames] = await Promise.all([
        Promise.race([
          espnService.getSchedule(activeTab, selectedDate),
          new Promise<Game[]>((_, reject) => setTimeout(() => reject(new Error("ESPN fetch timed out")), 30000))
        ]).then(res => {
          console.log(`[Dashboard] fetchGames: ESPN fetch SUCCESS: ${res.length} games for ${activeTab}`);
          return res;
        }).catch(e => {
          console.warn(`[Dashboard] fetchGames: ESPN fetch failed or timed out for ${activeTab}`, e);
          return [];
        }),
        sportsOracle.getDailySchedule(activeTab, dateStrIso, force).then(res => {
          console.log(`[Dashboard] fetchGames: AI/Firestore fetch SUCCESS: ${res.length} games for ${activeTab}`);
          return res;
        }).catch(e => {
          console.error(`[Dashboard] fetchGames: AI/Firestore fetch failed for ${activeTab}:`, e);
          return [];
        }),
        (activeTab === "NBA" || activeTab === "MLB") ? 
          sportradarService.getDailySchedule(selectedDate, activeTab.toLowerCase()).then(res => {
            console.log(`[Dashboard] fetchGames: Sportradar fetch SUCCESS: ${res.length} games for ${activeTab}`);
            return res;
          }).catch(e => {
            console.warn(`[Dashboard] fetchGames: Sportradar fetch failed for ${activeTab}`, e);
            return [];
          }) : Promise.resolve([])
      ]);

      if (Array.isArray(espnGames)) {
        fetchedGames = [...espnGames];
      }

      if (Array.isArray(srGames) && srGames.length > 0) {
        // Merge Sportradar games
        srGames.forEach(srGame => {
          const exists = fetchedGames.some(g => 
            (g.homeTeam === srGame.homeTeam && g.awayTeam === srGame.awayTeam) ||
            (g.id === srGame.id)
          );
          if (!exists) {
            fetchedGames.push(srGame);
          }
        });
      }
      
      if (aiGames && Array.isArray(aiGames) && aiGames.length > 0) {
        // Filter AI games to ensure they match the active league
        // This prevents NBA games from showing up in NFL tab if the AI or cache is confused
        const filteredAiGames = aiGames.filter(g => {
          if (!g.league) return true; // If no league specified, assume it's the one we asked for
          
          const gLeague = g.league.toUpperCase();
          const currentTab = activeTab.toUpperCase();
          
          // Match exactly or check if one contains the other (e.g. "NCAA" vs "NCAA Men's Basketball")
          const isMatch = gLeague === currentTab || gLeague.includes(currentTab) || currentTab.includes(gLeague);
          if (!isMatch) {
            console.log(`[Dashboard] fetchGames: AI game league mismatch. Game: ${g.awayTeam}@${g.homeTeam}, League: ${gLeague}, Tab: ${currentTab}`);
          }
          return isMatch;
        });

        // Ensure AI games have unique IDs if they are generic
        filteredAiGames.forEach(g => {
          if (g.id === 'unique-id' || g.id === 'unique_string_id' || !g.id) {
            const dateStr = g.date ? g.date.split('T')[0] : 'unknown';
            g.id = `${g.league || activeTab}-${g.awayTeam}-${g.homeTeam}-${dateStr}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
          }
        });

        if (fetchedGames.length === 0) {
          fetchedGames = filteredAiGames;
        } else {
          // Merge by ID and team names to avoid duplicates and ensure we have all games
          filteredAiGames.forEach(g => {
            const isDuplicate = fetchedGames.some(eg => {
              // 1. Exact ID match
              if (eg.id === g.id) return true;

              // 2. Team name normalization and comparison
              const normalize = (name: string) => name?.toLowerCase().replace(/[^a-z0-9]/g, '').trim() || "";
              const egHome = normalize(eg.homeTeam);
              const egAway = normalize(eg.awayTeam);
              const gHome = normalize(g.homeTeam);
              const gAway = normalize(g.awayTeam);

              // Check for containment or exact match (handles "Clippers" vs "LA Clippers")
              // We check if the mascot/name is present in both
              const homeMatch = egHome === gHome || (egHome.length > 3 && gHome.length > 3 && (egHome.includes(gHome) || gHome.includes(egHome)));
              const awayMatch = egAway === gAway || (egAway.length > 3 && gAway.length > 3 && (egAway.includes(gAway) || gAway.includes(egAway)));
              
              // Only match if both teams match
              return homeMatch && awayMatch;
            });
            
            if (!isDuplicate) {
              console.log(`[Dashboard] fetchGames: Adding missing game from AI: ${g.awayTeam} @ ${g.homeTeam}`);
              fetchedGames.push(g);
            } else {
              // If it is a duplicate, ensure the fetched game has the AI game's ID
              // This is CRITICAL because predictions are keyed by the AI game's ID
              const existingGame = fetchedGames.find(eg => {
                const normalize = (name: string) => name?.toLowerCase().replace(/[^a-z0-9]/g, '').trim() || "";
                const egHome = normalize(eg.homeTeam);
                const egAway = normalize(eg.awayTeam);
                const gHome = normalize(g.homeTeam);
                const gAway = normalize(g.awayTeam);
                
                return (egHome === gHome || egHome.includes(gHome) || gHome.includes(egHome)) && 
                       (egAway === gAway || egAway.includes(gAway) || gAway.includes(egAway));
              });
              
              if (existingGame && g.id) {
                console.log(`[Dashboard] fetchGames: Syncing ID for ${existingGame.awayTeam} @ ${existingGame.homeTeam}: ${existingGame.id} -> ${g.id}`);
                existingGame.id = g.id;
              }
            }
          });
        }
      }

      // Final deduplication pass to ensure no internal duplicates from either source
      const finalUniqueGames: Game[] = [];
      console.log(`[Dashboard] fetchGames: Starting final deduplication pass on ${fetchedGames.length} games.`);
      
      fetchedGames.forEach(g => {
        const normalize = (name: string) => {
          if (!name) return "";
          // Extract the last word (mascot) for more robust matching
          const parts = name.toLowerCase().trim().split(/\s+/);
          return parts[parts.length - 1].replace(/[^a-z0-9]/g, '').trim();
        };
        const gHome = normalize(g.homeTeam);
        const gAway = normalize(g.awayTeam);
        
        const isAlreadyAdded = finalUniqueGames.some(ug => {
          if (g.id && ug.id === g.id) {
            console.log(`[Dashboard] fetchGames: Duplicate ID found: ${g.id} (${g.awayTeam}@${g.homeTeam})`);
            return true;
          }
          const ugHome = normalize(ug.homeTeam);
          const ugAway = normalize(ug.awayTeam);
          
          // Match if mascots match OR if one name is contained in the other
          const homeMatch = ugHome === gHome || 
                           (g.homeTeam.toLowerCase().includes(ug.homeTeam.toLowerCase()) || 
                            ug.homeTeam.toLowerCase().includes(g.homeTeam.toLowerCase()));
          const awayMatch = ugAway === gAway || 
                           (g.awayTeam.toLowerCase().includes(ug.awayTeam.toLowerCase()) || 
                            ug.awayTeam.toLowerCase().includes(g.awayTeam.toLowerCase()));
          
          if (homeMatch && awayMatch) {
            console.log(`[Dashboard] fetchGames: Duplicate team names found: ${g.awayTeam}@${g.homeTeam} matches ${ug.awayTeam}@${ug.homeTeam}`);
          }
          return homeMatch && awayMatch;
        });
        
        if (!isAlreadyAdded) {
          finalUniqueGames.push(g);
        }
      });

      fetchedGames = finalUniqueGames;

      // Final safety filter: Ensure every game belongs to the selected date (ET)
      // This prevents "yesterday's" games from leaking in from any source
      const targetDateStr = format(selectedDate, "yyyy-MM-dd");
      fetchedGames = fetchedGames.filter(g => {
        if (!g.date) return true; // Keep if no date info, but usually there is
        
        // Convert game date to ET yyyy-MM-dd
        const gameDate = new Date(g.date);
        const gameEtStr = formatInTimeZone(gameDate, 'America/New_York', 'yyyy-MM-dd');
        
        const isMatch = gameEtStr === targetDateStr;
        if (!isMatch) {
          console.log(`[Dashboard] fetchGames: Filtering out game from different date. Game: ${g.awayTeam}@${g.homeTeam}, Date: ${gameEtStr}, Target: ${targetDateStr}`);
        }
        return isMatch;
      });

      console.log(`[Dashboard] fetchGames: Final unique games count after date filtering: ${fetchedGames?.length || 0} for ${activeTab}`);

      if (!fetchedGames || !Array.isArray(fetchedGames) || fetchedGames.length === 0) {
        console.warn(`[Dashboard] fetchGames: NO GAMES FOUND for ${activeTab} on ${dateStrIso} from any source.`);
        setGames([]);
      } else {
        console.log(`[Dashboard] fetchGames: Setting ${fetchedGames.length} games for ${activeTab}. Sample: ${fetchedGames[0].awayTeam}@${fetchedGames[0].homeTeam}`);
        // 2. Show games immediately (Optimistic UI)
        setGames(fetchedGames);
        
        // 3. Fetch Kalshi Odds in background
        fetchKalshiOdds(activeTab);
        
        // 4. Fetch Sportradar Odds in background
        fetchSportradarOdds(activeTab, dateStrIso);
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
      
      await sportsOracle.importSchedule(activeTab, new Date(), 7, (msg) => {
        setToast({ message: msg, type: "info" });
      });
      
      setToast({ message: "Schedule import complete!", type: "success" });
      fetchGames(); // Refresh current view
      
    } catch (err: any) {
      console.error("Import failed:", err);
      setToast({ message: "Failed to import schedule.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const fetchKalshiOdds = async (league: string) => {
    try {
      // We add a timeout to Kalshi so it doesn't block forever if the API is slow
      let timeoutId: NodeJS.Timeout;
      const kalshiTimeout = new Promise<any[]>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Kalshi timeout")), 8000);
      });

      const events = await Promise.race([
        kalshiService.getEvents(league),
        kalshiTimeout
      ]);
      
      clearTimeout(timeoutId!);
      
      if (events.length > 0) {
        setKalshiStatus("connected");
        
        // Update games with odds
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
                  kalshiOdds: {
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
      console.warn("Background Kalshi fetch failed:", err);
      setKalshiStatus("error");
    }
  };

  const fetchSportradarOdds = async (league: string, dateStr?: string) => {
    if (league !== 'NBA' && league !== 'MLB') return;
    
    try {
      console.log(`[Dashboard] Fetching Sportradar odds for ${league} on ${dateStr || 'today'}...`);
      const oddsMap = await sportradarService.getDailyOdds(league, dateStr);
      
      if (Object.keys(oddsMap).length > 0) {
        console.log(`[Dashboard] Received ${Object.keys(oddsMap).length} odds from Sportradar`);
        setGames(prevGames => {
          return prevGames.map(game => {
            const home = game.homeTeam.toLowerCase();
            const away = game.awayTeam.toLowerCase();
            
            // Try to find a match in the odds map
            // We'll try a few variations of the key
            const keysToTry = [
              `${home}_vs_${away}`,
              `${away}_vs_${home}`,
            ];
            
            let match = null;
            for (const key of keysToTry) {
              if (oddsMap[key]) {
                match = oddsMap[key];
                break;
              }
            }
            
            // If no exact match, try fuzzy matching
            if (!match) {
              const homeKeywords = home.split(' ').filter(w => w.length > 2); // Reduced length for better matching
              const awayKeywords = away.split(' ').filter(w => w.length > 2);
              
              const fuzzyKey = Object.keys(oddsMap).find(k => {
                const [seHome, seAway] = k.split('_vs_');
                if (!seHome || !seAway) return false;
                
                const matchHome = homeKeywords.some(kw => seHome.includes(kw));
                const matchAway = awayKeywords.some(kw => seAway.includes(kw));
                return matchHome && matchAway;
              });
              
              if (fuzzyKey) {
                console.log(`[Dashboard] Fuzzy matched ${away} @ ${home} to Sportradar key: ${fuzzyKey}`);
                match = oddsMap[fuzzyKey];
              }
            }
            
            if (match) {
              return {
                ...game,
                marketOdds: match
              };
            }
            return game;
          });
        });
      } else {
        console.log(`[Dashboard] No odds found in Sportradar map for ${league}`);
      }
    } catch (err) {
      console.warn("Background Sportradar odds fetch failed:", err);
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
          if (!pred?.winProbability || !g.kalshiOdds) return -1;
          const yesProb = g.kalshiOdds.yes > 1 ? g.kalshiOdds.yes / 100 : g.kalshiOdds.yes;
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

  const handleLogBet = async (bet: Omit<Bet, 'id' | 'userId' | 'createdAt' | 'status'>) => {
    if (!user) {
      setToast({ message: "Please login to track your bankroll", type: "warning" });
      return;
    }

    try {
      await bettingService.placeBet(bet);
      setToast({ message: `Bet on ${bet.team} logged successfully!`, type: "success" });
    } catch (err) {
      console.error('Error logging bet:', err);
      setToast({ message: "Failed to log bet", type: "error" });
    }
  };

  const handleAutoAnalyze = async (force: boolean = false) => {
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
      
      const injuryUpdates = await sportsOracle.checkInjuryUpdates(
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

      // Save injury updates to Firestore
      const db = getDb();
      const batch = writeBatch(db);
      for (const [gameId, injuries] of Object.entries(injuryUpdates)) {
        const docRef = doc(db, "predictions", gameId);
        batch.set(docRef, { injuries }, { merge: true });
      }
      await batch.commit();

      setToast({ message: `Starting analysis for ${targetLeague} on ${dateStr}...`, type: "info" });

      const gamesToAnalyze = filteredGames.filter(game => {
        // Strict league check
        if (game.league !== targetLeague) return false;

        const existingPrediction = savedPredictions[game.id];
        
        // Check if injuries changed
        const newInjuries = injuryUpdates[game.id];
        const oldInjuries = existingPrediction?.injuries;
        const injuriesChanged = newInjuries && JSON.stringify(newInjuries) !== JSON.stringify(oldInjuries || []);

        return force || !existingPrediction || injuriesChanged || sportsOracle.needsReanalysis(game, existingPrediction);
      });

      let completedCount = filteredGames.length - gamesToAnalyze.length;

      // Process in batches of 3 to improve performance while respecting rate limits
      const CONCURRENCY = 3;
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
            
            const prediction = await sportsOracle.analyzeMatchup(game, dateStr, existingPrediction, [], () => cancelAnalysisRef.current[targetLeague]);
            
            if (prediction && game.id && !cancelAnalysisRef.current[targetLeague]) {
              // Save immediately to Firestore
              await sportsOracle.savePrediction(game.id, prediction);
              
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
      const updates = await sportsOracle.checkInjuryUpdates(targetLeague, dateStr, [game], () => cancelAnalysisRef.current[targetLeague]);
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

      let prediction = await sportsOracle.analyzeMatchup(game, dateStr, existingPrediction, [], () => cancelAnalysisRef.current[targetLeague]);
      
      if (prediction && game.id && !cancelAnalysisRef.current[targetLeague]) {
        // Save immediately to Firestore
        await sportsOracle.savePrediction(game.id, prediction);
        
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

      const updates = await sportsOracle.checkInjuryUpdates(targetLeague, dateStr, last3Games, () => cancelAnalysisRef.current[targetLeague]);
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

          let prediction = await sportsOracle.analyzeMatchup(game, dateStr, existingPrediction, [], () => cancelAnalysisRef.current[targetLeague]);
          
          if (prediction && game.id && !cancelAnalysisRef.current[targetLeague]) {
            // Save immediately to Firestore
            await sportsOracle.savePrediction(game.id, prediction);
            
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
    sportradarService.clearCache();
    fetchGames(true);
    setToast({ message: "Schedule refreshed.", type: "success" });
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
        onCancelSubscription={handleCancelSubscription}
        onManageSports={handleManageSports}
      >
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
          <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-8 shadow-[0_0_40px_-10px_rgba(245,158,11,0.3)]">
            <Zap className="w-10 h-10 text-amber-500 fill-current" />
          </div>
          <h1 className="text-4xl font-black text-white mb-4 tracking-tight">Welcome to Bettors Edge</h1>
          <p className="text-slate-400 max-w-md mb-12 text-lg">
            The most advanced AI-driven sports analysis engine. Login to access professional-grade betting insights.
          </p>
          <button 
            onClick={loginWithGoogle}
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
        onCancelSubscription={handleCancelSubscription}
        onManageSports={handleManageSports}
      >
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          {profileError ? (
            <>
              <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Profile Sync Error</h3>
              <p className="text-slate-400 max-w-md mb-6">{profileError}</p>
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Connection
              </button>
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
      onCancelSubscription={handleCancelSubscription}
      onManageSports={handleManageSports}
      onOpenFAQ={onOpenFAQ}
    >
      {JoyrideAny && !showPaywall && !isMobile && (
        <JoyrideAny
          steps={walkthroughSteps}
          run={runWalkthrough && activeTab === "NBA" && filteredGames.length > 0 && !showPaywall}
          continuous
          disableBeacon
          callback={handleJoyrideCallback}
          showProgress
          showSkipButton
          styles={{
            options: {
              primaryColor: '#6366f1',
              backgroundColor: '#0f172a',
              textColor: '#f8fafc',
              arrowColor: '#0f172a',
              overlayColor: 'rgba(0, 0, 0, 0.75)',
            },
            tooltipContainer: {
              textAlign: 'left',
            },
            buttonNext: {
              backgroundColor: '#6366f1',
              fontSize: '14px',
              fontWeight: 'bold',
              borderRadius: '8px',
              padding: '10px 20px',
            },
            buttonBack: {
              color: '#94a3b8',
              marginRight: '10px',
            },
            buttonSkip: {
              color: '#94a3b8',
            },
          }}
        />
      )}
      {showPaywall ? (
        <Paywall 
          onSubscribe={handleSubscribe} 
          initialSports={[...(userProfile?.subscribedSports || []), activeTab].filter(s => s !== "Add Sport")}
          existingSports={userProfile?.subscribedSports || []}
        />
      ) : activeTab === "Accuracy" ? (
        <AccuracyTab 
          predictions={allPredictions} 
          onSyncPending={handleSyncPending}
          isSyncing={loading}
        />
      ) : activeTab === "Users" ? (
        <AdminUsersTab />
      ) : activeTab === "Admin" ? (
        <div className="space-y-8">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
                <Shield className="w-6 h-6 text-indigo-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">System Diagnostics</h2>
                <p className="text-slate-400">Verify API connections and system health.</p>
              </div>
            </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Debug Console (Last 50 Events)</h3>
            <div className="bg-black rounded-lg p-4 font-mono text-xs h-64 overflow-y-auto space-y-1">
              {debugLogs.map((log, i) => (
                <div key={i} className="text-slate-400 border-b border-slate-900 pb-1">
                  {log}
                </div>
              ))}
              {debugLogs.length === 0 && <div className="text-slate-600 italic">No logs yet...</div>}
            </div>
            <button 
              onClick={() => {
                localStorage.removeItem('debug_logs');
                setDebugLogs([]);
              }}
              className="mt-4 px-4 py-2 bg-rose-600/20 text-rose-400 rounded-lg text-xs font-bold hover:bg-rose-600/30 transition-colors"
            >
              Clear Logs
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-400" />
                  Sportradar API Status
                </h3>
                <div className="space-y-4">
                  <button
                    onClick={handleTestSportradar}
                    disabled={testingSportradar}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {testingSportradar ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                    Run Connection Test
                  </button>
                  <p className="text-xs text-slate-500 text-center">
                    This tests NBA Injuries and Odds Comparison endpoints.
                  </p>
                  <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[10px] text-amber-200/70 space-y-1">
                    <p className="font-bold text-amber-400">If you see 403 Forbidden:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Check if your key is for <strong>NBA</strong> specifically.</li>
                      <li>Check if you have <strong>Odds Comparison</strong> entitlement.</li>
                      <li>Ensure your key is not <strong>Expired</strong> or <strong>Inactive</strong>.</li>
                      <li>Try switching between <strong>Trial</strong> and <strong>Production</strong> keys.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-indigo-400" />
                  Paywall Testing
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
                    <div>
                      <h3 className="text-sm font-medium text-white">Force Paywall</h3>
                      <p className="text-xs text-slate-400">Show paywall even for admins/bypassed users.</p>
                    </div>
                    <button
                      onClick={() => setForcePaywall(!forcePaywall)}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${forcePaywall ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                      {forcePaywall ? 'Paywall Forced' : 'Force Paywall'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-amber-400" />
                  Schedule & Cache
                </h3>
                <div className="space-y-4">
                  <button
                    onClick={() => {
                      espnService.clearCache();
                      sportradarService.clearCache();
                      fetchGames();
                      setToast({ message: "Cache cleared. Refreshing schedule...", type: "info" });
                    }}
                    className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <Activity className="w-5 h-5" />
                    Force Refresh Schedule
                  </button>
                  <p className="text-xs text-slate-500 text-center">
                    Clears local cache and re-fetches from all providers.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
            <h3 className="text-xl font-bold text-white mb-6">Recent System Logs</h3>
            <div className="bg-black/40 rounded-xl p-4 font-mono text-xs text-slate-400 h-64 overflow-y-auto space-y-1">
              <p className="text-indigo-400">[System] Diagnostics panel active.</p>
              <p>[Auth] User: {user?.email}</p>
              <p>[Profile] Role: {userProfile?.role}</p>
              <p>[Status] Active Tab: {activeTab}</p>
              <p>[Status] Games Loaded: {games.length}</p>
              {lastTestResult && (
                <>
                  <p className="text-amber-400 mt-2">--- Last Sportradar Test ---</p>
                  <p>Key: {lastTestResult.keyInfo?.prefix}... ({lastTestResult.keyInfo?.length} chars)</p>
                  <p>NBA: <span className={lastTestResult.results?.nba?.status === 'success' ? 'text-green-400' : 'text-red-400'}>{lastTestResult.results?.nba?.status?.toUpperCase()}</span> (Code: {lastTestResult.results?.nba?.code})</p>
                  <p>MLB: <span className={lastTestResult.results?.mlb?.status === 'success' ? 'text-green-400' : 'text-red-400'}>{lastTestResult.results?.mlb?.status?.toUpperCase()}</span> (Code: {lastTestResult.results?.mlb?.code})</p>
                  <p>Odds: <span className={lastTestResult.results?.odds?.status === 'success' ? 'text-green-400' : 'text-red-400'}>{lastTestResult.results?.odds?.status?.toUpperCase()}</span> (Code: {lastTestResult.results?.odds?.code})</p>
                  
                  <div className="mt-1 flex flex-wrap gap-2">
                    <span className="text-[10px] text-slate-500">Active Sports:</span>
                    {Object.entries(lastTestResult.results?.otherSports || {}).map(([sport, status]) => (
                      <span key={sport} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400">
                        {sport.toUpperCase()}
                      </span>
                    ))}
                  </div>
                  
                  {lastTestResult.results?.nba?.message && lastTestResult.results?.nba?.status !== 'success' && (
                    <p className="text-red-400 mt-1">Error: {lastTestResult.results.nba.message}</p>
                  )}
                </>
              )}
              {error && <p className="text-red-400">[Error] {error}</p>}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start sm:items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 sm:mt-0" />
            <p className="text-sm text-amber-200/80 leading-relaxed">
              <strong className="text-amber-400 font-semibold mr-1">Betting Disclaimer:</strong> 
              These AI-generated insights are <span className="underline decoration-amber-500/50 underline-offset-2">predictions, not guarantees</span>. 
              Sports betting involves significant financial risk. Please bet responsibly and only wager what you can afford to lose.
            </p>
          </div>

          <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold text-white">
              {activeTab} Schedule
            </h2>
            {isAdminUser && (
              <button
                onClick={handleTestSportradar}
                disabled={testingSportradar}
                className="px-3 py-1 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 text-xs font-bold rounded-lg border border-indigo-500/30 transition-all flex items-center gap-2"
                title="Test Sportradar API Key"
              >
                {testingSportradar ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                Test API Key
              </button>
            )}
            {isAdminUser && (
              <button
                onClick={() => {
                  espnService.clearCache();
                  sportradarService.clearCache();
                  fetchGames();
                  setToast({ message: "Cache cleared. Refreshing schedule...", type: "info" });
                }}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-bold rounded-lg border border-slate-700 transition-all flex items-center gap-2"
                title="Clear Cache & Refresh"
              >
                <Activity className="w-3 h-3" />
                Refresh
              </button>
            )}
          </div>
          <p className="text-slate-400 text-sm flex items-center">
            <CalendarIcon className="w-4 h-4 mr-2" />
            {format(selectedDate, "EEEE, MMMM do, yyyy")}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
            <div className="flex items-center text-[10px] uppercase tracking-wider font-mono">
              <span className="text-slate-500 mr-2">Kalshi:</span>
              <span className={cn(
                "flex items-center",
                kalshiStatus === "connected" ? "text-emerald-400" : 
                kalshiStatus === "error" ? "text-red-400" : "text-slate-600"
              )}>
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full mr-1.5",
                  kalshiStatus === "connected" ? "bg-emerald-400 animate-pulse" : 
                  kalshiStatus === "error" ? "bg-red-400" : "bg-slate-600"
                )} />
                {kalshiStatus}
              </span>
            </div>
            <div className="flex items-center text-[10px] uppercase tracking-wider font-mono">
              <span className="text-slate-500 mr-2">Sportradar:</span>
              <button 
                onClick={async () => {
                  try {
                    const response = await fetch(`/api/sportradar/odds?sportId=${activeTab === 'NBA' ? 'sr:sport:2' : 'sr:sport:3'}&date=${format(selectedDate, "yyyy-MM-dd")}`, {
                      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                    });
                    const data = await response.json();
                    if (response.ok) {
                      alert(`Sportradar Success: Received ${data.sport_events?.length || 0} events for ${activeTab}`);
                      console.log("Sportradar Data:", data);
                    } else {
                      alert(`Sportradar Error: ${data.error} - ${data.details}`);
                    }
                  } catch (e: any) {
                    alert(`Sportradar Fetch Failed: ${e.message}`);
                  }
                }}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
              >
                Test Odds
              </button>
              <button 
                onClick={handleTestSportradar}
                disabled={testingSportradar}
                className="ml-2 text-indigo-400 hover:text-indigo-300 disabled:opacity-50 flex items-center gap-1"
              >
                {testingSportradar ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Activity className="w-2.5 h-2.5" />}
                [Test API Key]
              </button>
            </div>
            <div className="flex items-center text-[10px] uppercase tracking-wider font-mono">
              <span className="text-slate-500 mr-2">Cache:</span>
              <button 
                onClick={() => {
                  espnService.clearCache();
                  sportradarService.clearCache();
                  fetchGames();
                  setToast({ message: "Cache cleared. Refreshing schedule...", type: "info" });
                }}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
              >
                Force Refresh
              </button>
            </div>
            <div className="flex items-center text-[10px] uppercase tracking-wider font-mono">
              <span className="text-slate-500 mr-2">Predictions:</span>
              <span className={cn(
                "flex items-center",
                Object.keys(savedPredictions).length > 0 ? "text-indigo-400" : "text-slate-600"
              )}>
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full mr-1.5",
                  Object.keys(savedPredictions).length > 0 ? "bg-indigo-400" : "bg-slate-600"
                )} />
                {Object.keys(savedPredictions).length > 0 ? `${Object.keys(savedPredictions).length} Active` : "None"}
              </span>
            </div>
          </div>
        </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center space-x-1 bg-slate-900/50 p-1 rounded-xl border border-slate-800 mr-4">
              <button
                onClick={() => setMainTab("analysis")}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                  mainTab === "analysis" 
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
              >
                <Brain className="w-4 h-4" />
                Analysis
              </button>
              <button
                onClick={() => setMainTab("bankroll")}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                  mainTab === "bankroll" 
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" 
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
              >
                <TrendingUp className="w-4 h-4" />
                Bankroll
              </button>
            </div>

            {user ? (
              <div className="flex items-center gap-3 mr-2">
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-full border border-slate-700">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName || ""} className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <UserIcon className="w-4 h-4 text-slate-400" />
                    )}
                    <span className="text-xs text-slate-300 font-medium">{user.displayName || user.email}</span>
                  </div>
                  {userProfile?.subscriptionStatus === 'active' && (
                    <div className="flex gap-1 mt-1">
                      {userProfile.subscribedSports?.map(s => (
                        <span key={s} className="text-[8px] bg-amber-500/20 text-amber-500 px-1.5 rounded uppercase font-bold border border-amber-500/30">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button 
                  onClick={logout}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button 
                onClick={loginWithGoogle}
                className="flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors border border-slate-700 mr-2"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Login
              </button>
            )}

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

            <div className="flex items-center gap-2">
              <button 
                onClick={() => setSelectedDate(addDays(new Date(), -1))}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  format(selectedDate, 'yyyy-MM-dd') === format(addDays(new Date(), -1), 'yyyy-MM-dd') 
                  ? 'bg-slate-700 text-white border border-slate-600' 
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                Yesterday
              </button>
              <button 
                onClick={() => setSelectedDate(new Date())}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') 
                  ? 'bg-slate-700 text-white border border-slate-600' 
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                Today
              </button>
              <button 
                onClick={() => setSelectedDate(addDays(new Date(), 1))}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  format(selectedDate, 'yyyy-MM-dd') === format(addDays(new Date(), 1), 'yyyy-MM-dd')
                  ? 'bg-slate-700 text-white border border-slate-600'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                Tomorrow
              </button>

              <button 
                onClick={handleRefresh}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors border border-slate-700"
                title="Refresh Schedule"
              >
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              </button>
            </div>
          </div>
      </div>

      <div className="flex flex-wrap justify-end items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="time">Game Time</option>
            <option value="edge">Highest Edge (Value)</option>
            <option value="confidence">AI Confidence</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Filter:</span>
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as any)}
            className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors"
          >
            <option value="all">All Games</option>
            <option value="early">Early Games (Before 4 PM)</option>
            <option value="afternoon">Afternoon Games (4 PM - 7 PM)</option>
            <option value="late">Late Games (After 7 PM)</option>
          </select>
        </div>
      </div>

      {Object.entries(analyzingMap).map(([league, isAnalyzing]) => {
        const progress = analysisProgressMap[league];
        if (!isAnalyzing || !progress) return null;
        
        return (
          <div key={league} className="mb-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg animate-in slide-in-from-top-2">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                  <span className="font-bold text-white">AI Analysis in Progress ({league})</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-400 font-mono">
                    {progress.current} / {progress.total} Games
                  </span>
                  {league === activeTab && (
                    <button 
                      onClick={handleStopAnalysis}
                      className="text-xs text-rose-500 hover:text-rose-400 font-bold uppercase tracking-wider"
                    >
                      Stop
                    </button>
                  )}
                </div>
              </div>
              
              <div className="w-full bg-slate-800 rounded-full h-2 mb-2 overflow-hidden">
                <div 
                  className="bg-indigo-500 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                />
              </div>
              
              <p className="text-xs text-slate-400 text-center animate-pulse">
                {progress.message}
              </p>
            </div>
          </div>
        );
      })}

      {/* Sub-tabs for NCAA */}
      {activeTab === "NCAA" && (
        <div className="mb-6">
          <div className="flex items-center gap-1 p-1 bg-slate-900/50 border border-slate-800 rounded-xl w-fit">
            <button
              onClick={() => setNcaaSubTab("schedule")}
              className={cn(
                "px-6 py-2 rounded-lg text-sm font-bold transition-all",
                ncaaSubTab === "schedule" 
                  ? "bg-indigo-600 text-white shadow-lg" 
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              )}
            >
              Daily Schedule
            </button>
            <button
              onClick={() => setNcaaSubTab("bracket")}
              className={cn(
                "px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                ncaaSubTab === "bracket" 
                  ? "bg-amber-500 text-slate-900 shadow-lg" 
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              )}
            >
              <Trophy className="w-4 h-4" />
              Tournament Bracket
            </button>
          </div>
        </div>
      )}

      {/* Locks of the Day Section - Admin Only */}
      {isAdminUser && (
        <LocksOfTheDay games={filteredGames} predictions={allPredictions} selectedDate={selectedDate} league={activeTab} onSelectLeague={setActiveTab} />
      )}

{activeTab === "NBA" && (
  <NbaApiSportsPanel
    gamesWidgetHtml={apiSportsGamesWidgetHtml}
    gameWidgetHtml={apiSportsGameWidgetHtml}
    h2hWidgetHtml={apiSportsH2HWidgetHtml}
  />
)}

      <div className="py-8">
        {mainTab === "bankroll" ? (
          <BankrollTracker />
        ) : (
          <>
            {activeTab === "NCAA" && ncaaSubTab === "bracket" ? (
          loadingBracket ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-12 h-12 text-amber-500 animate-spin mb-4" />
              <p className="text-slate-400">Fetching the latest March Madness bracket...</p>
            </div>
          ) : bracket ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <TournamentTracker bracket={bracket} />
              <Bracket bracket={bracket} />
            </div>
          ) : (
            <div className="text-center py-20 bg-slate-900/50 border border-slate-800 rounded-2xl">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Bracket Unavailable</h3>
              <p className="text-slate-400 max-w-md mx-auto mb-6">
                We couldn't retrieve the bracket data at this time. Please try again later.
              </p>
              <button
                onClick={fetchBracket}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex items-center gap-2 mx-auto"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Fetching Bracket
              </button>
            </div>
          )
        ) : loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl h-[280px] animate-pulse">
                <div className="p-6 space-y-4">
                  <div className="flex justify-between">
                    <div className="h-4 w-20 bg-slate-800 rounded"></div>
                    <div className="h-4 w-24 bg-slate-800 rounded"></div>
                  </div>
                  <div className="flex justify-between items-center pt-4">
                    <div className="h-8 w-24 bg-slate-800 rounded"></div>
                    <div className="h-4 w-8 bg-slate-800 rounded"></div>
                    <div className="h-8 w-24 bg-slate-800 rounded"></div>
                  </div>
                  <div className="h-4 w-full bg-slate-800 rounded mt-8"></div>
                  <div className="h-12 w-full bg-slate-800 rounded mt-4"></div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20 bg-slate-900/50 border border-slate-800 rounded-2xl">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Something went wrong</h3>
            <p className="text-slate-400 max-w-md mx-auto mb-6">
              {error}
            </p>
            <button 
              onClick={() => fetchGames()}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors border border-slate-700"
            >
              Try Again
            </button>
          </div>
        ) : filteredGames.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/50 border border-slate-800 rounded-2xl">
            <CalendarIcon className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">No games found</h3>
            <p className="text-slate-400 max-w-md mx-auto mb-6">
              We couldn't find any {activeTab} games for {format(selectedDate, "MMMM do, yyyy")}. 
              The season may not have started yet, or it could be out of season. 
              Try another date or league.
            </p>
            <button 
              onClick={() => fetchGames()}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors border border-slate-700"
            >
              Refresh Schedule
            </button>
          </div>
        ) : (
          <GameGridErrorBoundary>
            <div id="game-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {filteredGames.map((game, index) => (
                <GameCard 
                  key={game.id || `game-${index}`} 
                  game={game} 
                  prediction={game.id ? savedPredictions[game.id] : null}
                  isAnalyzing={analyzing && analysisProgress?.analyzingGameIds?.includes(game.id)}
                  onReanalyze={isAdminUser ? handleReanalyzeSingleGame : undefined}
                  onDiscuss={() => handleDiscussWithSnark(game)}
                  onLogBet={handleLogBet}
                />
              ))}
            </div>
          </GameGridErrorBoundary>
        )}
          </>
        )}
      </div>
    </>
  )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      
      {!showPaywall && <ChatPanel games={games} predictions={allPredictions} />}
      
      <DailyBriefingModal 
        isOpen={isBriefingOpen} 
        onClose={() => setIsBriefingOpen(false)} 
        league={activeTab} 
        date={selectedDate} 
        games={games}
      />
    </Layout>
  );
}
