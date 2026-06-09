import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Brain,
  Check,
  ChevronDown,
  LineChart,
  Lock,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { loginWithGoogle } from "../firebase";
import { LegalModal } from "../components/LegalModal";

interface LandingPageProps {
  onEnter?: () => void;
  onBackHome?: () => void;
  initialError?: string | null;
  appMode?: boolean;
}

const features = [
  {
    icon: TrendingUp,
    title: "True edge detection",
    description: "Compare model probability against market implied probability to identify potential pricing gaps.",
  },
  {
    icon: Shield,
    title: "No-play discipline",
    description: "Weak edges and low-quality data get flagged instead of forced into a pick.",
  },
  {
    icon: Brain,
    title: "OpenAI explanations",
    description: "Numbers are translated into clear matchup analysis, risk notes, and plain-English reasoning.",
  },
  {
    icon: Activity,
    title: "Data quality scoring",
    description: "Each matchup is graded so users know when the analysis is strong, limited, or incomplete.",
  },
];

const steps = [
  "Collect the slate and available market data",
  "Calculate model probability and fair odds",
  "Compare against market expectations",
  "Grade confidence, risk, and data quality",
  "Explain the edge before you decide",
];

const faqs = [
  {
    question: "Does Bettors Edge place bets?",
    answer: "No. Bettors Edge is an analytics tool. It does not accept wagers, place bets, or act as a sportsbook.",
  },
  {
    question: "Do users enter their bets?",
    answer: "No. The app is built to provide statistics, matchup analysis, edge detection, and decision support before a user makes their own pick elsewhere.",
  },
  {
    question: "What does the AI do?",
    answer: "The model calculates the edge first. OpenAI then explains the numbers, risks, market context, and why a matchup may be a play, lean, or no-play.",
  },
  {
    question: "Does this guarantee winning picks?",
    answer: "No. Sports outcomes are uncertain. Bettors Edge provides information and probability-based analysis only.",
  },
];

export function LandingPage({ initialError, onEnter, onBackHome, appMode = false }: LandingPageProps) {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTermsError, setShowTermsError] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(initialError || null);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [legalModal, setLegalModal] = useState<{
    isOpen: boolean;
    type: "terms" | "privacy";
  }>({
    isOpen: false,
    type: "terms",
  });
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    if (initialError) setLoginError(initialError);
  }, [initialError]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "true") setShowDebug(true);

    const err = sessionStorage.getItem("auth_error");
    if (err === "unauthorized-domain") {
      setLoginError(
        "This domain is not authorized for OAuth. Please add this URL to your Firebase Authorized Domains in the Firebase Console."
      );
      sessionStorage.removeItem("auth_error");
    } else if (err) {
      setLoginError(err);
      sessionStorage.removeItem("auth_error");
    }
  }, []);

  const debugLogs = useMemo(() => {
    try {
      const stored = localStorage.getItem("debug_logs");
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("Failed to parse debug logs:", error);
      return [];
    }
  }, []);

  const inIframe = window.self !== window.top;

  const handleLaunchApp = () => {
    if (onEnter) {
      onEnter();
      return;
    }
    window.history.pushState({}, "", "/app");
    window.dispatchEvent(new Event("bettorsedge:navigation"));
  };

  const handleLogin = async () => {
    if (!acceptedTerms) {
      setShowTermsError(true);
      return;
    }

    setIsLoggingIn(true);
    setLoginError(null);
    setLoginMessage(null);

    try {
      const result = await loginWithGoogle();

      if (!result.success) {
        console.error("Login failed:", result.error);

        if (result.code === "auth/popup-blocked-redirecting") return;

        if (
          result.code === "auth/popup-closed-by-user" ||
          result.code === "auth/cancelled-popup-request" ||
          result.code === "auth/popup-blocked" ||
          result.code === "auth/web-storage-unsupported"
        ) {
          if (inIframe) {
            window.open(window.location.href, "_blank");
            setLoginMessage(
              "To continue, use the app in the new tab that just opened. Your browser security settings prevent logging in inside this embedded view."
            );
            setIsLoggingIn(false);
            return;
          }

          if (result.code === "auth/web-storage-unsupported") {
            setLoginError("Your browser is blocking third-party cookies. Please enable them to sign in.");
          }

          setIsLoggingIn(false);
          return;
        }

        setLoginError(result.error || "Failed to sign in. Please try again.");
        setIsLoggingIn(false);
        return;
      }
    } catch (error) {
      console.error("[LandingPage] Unexpected login error:", error);
      setLoginError("An unexpected error occurred. Please try again.");
      setIsLoggingIn(false);
    }
  };

  const LoginBox = () => (
    <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl shadow-indigo-950/30 backdrop-blur">
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4 text-left">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-indigo-300" />
        <div>
          <p className="text-sm font-semibold text-white">Secure Google sign-in</p>
          <p className="text-xs leading-5 text-slate-400">
            Create or access your Bettors Edge account. Terms acceptance is required before login.
          </p>
        </div>
      </div>

      <label className="mb-3 flex cursor-pointer items-start gap-3 text-left group">
        <input
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => {
            setAcceptedTerms(e.target.checked);
            if (e.target.checked) setShowTermsError(false);
          }}
          className="mt-0.5 h-5 w-5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-950"
        />
        <span className="text-sm leading-5 text-slate-400 group-hover:text-slate-300">
          I agree to the{" "}
          <button type="button" onClick={() => setLegalModal({ isOpen: true, type: "terms" })} className="text-indigo-300 hover:underline">
            Terms of Service
          </button>{" "}
          and{" "}
          <button type="button" onClick={() => setLegalModal({ isOpen: true, type: "privacy" })} className="text-indigo-300 hover:underline">
            Privacy Policy
          </button>
          .
        </span>
      </label>

      {showTermsError && <p className="mb-3 text-left text-xs text-rose-400">Please accept the terms to continue.</p>}

      <button
        type="button"
        onClick={handleLogin}
        disabled={isLoggingIn}
        className="group flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-800"
      >
        {isLoggingIn ? "Signing In..." : inIframe ? "Continue to Secure Login" : "Sign In with Google"}
        {!isLoggingIn && <ArrowRight className="ml-2 h-5 w-5 transition group-hover:translate-x-1" />}
      </button>

      {loginError && <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-center text-sm text-rose-300">{loginError}</div>}
      {loginMessage && <div className="mt-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-center text-sm text-indigo-200">{loginMessage}</div>}
    </div>
  );

  return (
    <div className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-[-10%] top-[-10%] h-96 w-96 rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-96 w-96 rounded-full bg-cyan-600/20 blur-[120px]" />
        <div className="absolute left-[40%] top-[35%] h-72 w-72 rounded-full bg-emerald-500/10 blur-[110px]" />
      </div>

      <header className="relative z-10 border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <button type="button" onClick={onBackHome || (() => window.history.pushState({}, "", "/"))} className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-indigo-400/30 bg-indigo-500/10">
              <Trophy className="h-5 w-5 text-indigo-300" />
            </div>
            <div className="text-left">
              <p className="text-sm font-black uppercase tracking-[0.28em] text-slate-400">Bettors Edge</p>
              <p className="text-xs text-slate-500">Sports analytics, not a sportsbook</p>
            </div>
          </button>

          <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#how-it-works" className="hover:text-white">How it works</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
          </nav>

          <button
            type="button"
            onClick={handleLaunchApp}
            className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-4 py-2 text-sm font-bold text-indigo-100 transition hover:bg-indigo-500/20"
          >
            Launch App
          </button>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <div className="mb-6 inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200">
              <Sparkles className="mr-2 h-4 w-4" />
              Find the edge before you bet
            </div>

            <h1 className="max-w-4xl text-5xl font-black tracking-tight sm:text-6xl lg:text-7xl">
              Sports betting analysis without the guesswork.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              Bettors Edge compares matchup data, market expectations, injury context, probability gaps, and OpenAI-powered analysis to help users make sharper, more informed picks.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleLaunchApp}
                className="group inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-6 py-4 text-base font-bold text-white shadow-xl shadow-indigo-500/25 transition hover:bg-indigo-500"
              >
                Launch Bettors Edge
                <ArrowRight className="ml-2 h-5 w-5 transition group-hover:translate-x-1" />
              </button>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/70 px-6 py-4 text-base font-bold text-slate-200 transition hover:bg-slate-800"
              >
                See How It Works
                <ChevronDown className="ml-2 h-5 w-5" />
              </a>
            </div>

            <div className="mt-8 grid max-w-2xl grid-cols-3 gap-3 text-left">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="text-2xl font-black text-white">Edge</p>
                <p className="text-xs text-slate-400">model vs market</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="text-2xl font-black text-white">A-D</p>
                <p className="text-xs text-slate-400">data quality</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                <p className="text-2xl font-black text-white">Pass</p>
                <p className="text-xs text-slate-400">when edge is weak</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.1 }}>
            {appMode ? (
              <LoginBox />
            ) : (
              <div className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-5 shadow-2xl shadow-indigo-950/30 backdrop-blur">
                <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950 p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Example Edge Card</p>
                      <h3 className="mt-1 text-2xl font-black">BOS vs NYK</h3>
                    </div>
                    <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">PLAY</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-900 p-4">
                      <p className="text-xs text-slate-500">Model Probability</p>
                      <p className="mt-1 text-3xl font-black">58%</p>
                    </div>
                    <div className="rounded-2xl bg-slate-900 p-4">
                      <p className="text-xs text-slate-500">Market Probability</p>
                      <p className="mt-1 text-3xl font-black">52%</p>
                    </div>
                    <div className="rounded-2xl bg-emerald-500/10 p-4 ring-1 ring-emerald-500/20">
                      <p className="text-xs text-emerald-300">Estimated Edge</p>
                      <p className="mt-1 text-3xl font-black text-emerald-300">+6.0%</p>
                    </div>
                    <div className="rounded-2xl bg-indigo-500/10 p-4 ring-1 ring-indigo-500/20">
                      <p className="text-xs text-indigo-300">Data Quality</p>
                      <p className="mt-1 text-3xl font-black text-indigo-200">A</p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                    <p className="mb-2 flex items-center text-sm font-bold text-white">
                      <Target className="mr-2 h-4 w-4 text-cyan-300" />
                      Why it matters
                    </p>
                    <p className="text-sm leading-6 text-slate-400">
                      Bettors Edge found a measurable gap between projected win probability and market implied probability. OpenAI explains the setup, the risk, and why this is not just a blind pick.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </section>

        {!appMode && (
          <>
            <section id="features" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
              <div className="mb-10 max-w-3xl">
                <p className="text-sm font-bold uppercase tracking-[0.25em] text-indigo-300">Built for decision support</p>
                <h2 className="mt-3 text-3xl font-black sm:text-4xl">Not a sportsbook. Not bet tracking. Better information.</h2>
                <p className="mt-4 text-slate-400">
                  Bettors Edge is designed to help users understand probability, market gaps, and risk before making their own decision.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {features.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <div key={feature.title} className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur transition hover:border-indigo-400/40">
                      <Icon className="mb-5 h-8 w-8 text-indigo-300" />
                      <h3 className="text-lg font-black text-white">{feature.title}</h3>
                      <p className="mt-3 text-sm leading-6 text-slate-400">{feature.description}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section id="how-it-works" className="border-y border-slate-800 bg-slate-900/40">
              <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.25em] text-cyan-300">How it works</p>
                  <h2 className="mt-3 text-3xl font-black sm:text-4xl">A cleaner way to review the slate.</h2>
                  <p className="mt-4 text-slate-400">
                    The app calculates first, then explains. That keeps the product grounded in numbers instead of hype.
                  </p>
                </div>
                <div className="space-y-3">
                  {steps.map((step, index) => (
                    <div key={step} className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-sm font-black text-indigo-200">
                        {index + 1}
                      </div>
                      <p className="font-semibold text-slate-200">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section id="pricing" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
              <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.25em] text-emerald-300">Pricing</p>
                  <h2 className="mt-3 text-3xl font-black sm:text-4xl">Simple access for sharper analysis.</h2>
                  <p className="mt-4 text-slate-400">Start with the app login flow. Stripe pricing can be adjusted from the dashboard/subscription setup.</p>
                </div>
                <div className="rounded-3xl border border-indigo-400/30 bg-indigo-500/10 p-6 shadow-2xl shadow-indigo-950/20">
                  <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-2xl font-black">Bettors Edge Access</h3>
                      <p className="mt-2 text-slate-300">Daily edges, market gap analysis, data quality scores, and OpenAI-powered matchup explanations.</p>
                      <div className="mt-5 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                        {["Today’s slate", "Edge calculation", "No-play labels", "Risk explanation", "OpenAI analysis", "Secure login"].map((item) => (
                          <p key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" />{item}</p>
                        ))}
                      </div>
                    </div>
                    <button onClick={handleLaunchApp} className="shrink-0 rounded-2xl bg-white px-6 py-4 font-black text-slate-950 transition hover:bg-indigo-100">
                      Launch App
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section id="faq" className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
              <div className="mb-8 text-center">
                <p className="text-sm font-bold uppercase tracking-[0.25em] text-indigo-300">FAQ</p>
                <h2 className="mt-3 text-3xl font-black sm:text-4xl">Straight answers.</h2>
              </div>
              <div className="space-y-3">
                {faqs.map((faq) => (
                  <div key={faq.question} className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
                    <h3 className="font-black text-white">{faq.question}</h3>
                    <p className="mt-2 leading-6 text-slate-400">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6 lg:px-8">
              <div className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-8 text-center shadow-2xl shadow-indigo-950/20">
                <BarChart3 className="mx-auto mb-4 h-10 w-10 text-indigo-300" />
                <h2 className="text-3xl font-black">Stop guessing. Start comparing the numbers.</h2>
                <p className="mx-auto mt-4 max-w-2xl text-slate-400">
                  Get access to AI-powered sports analysis, market gap detection, and no-play discipline before the next slate starts.
                </p>
                <button onClick={handleLaunchApp} className="mt-6 inline-flex items-center rounded-2xl bg-indigo-600 px-6 py-4 font-black text-white transition hover:bg-indigo-500">
                  Launch Bettors Edge
                  <ArrowRight className="ml-2 h-5 w-5" />
                </button>
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="relative z-10 border-t border-slate-800 bg-slate-950 px-4 py-8 text-center text-xs text-slate-500 sm:px-6 lg:px-8">
        <p className="mx-auto mb-3 max-w-4xl leading-6">
          <strong>Disclaimer:</strong> Bettors Edge provides sports analytics and informational tools only. Bettors Edge is not a sportsbook, does not accept wagers, and does not guarantee outcomes. Users are responsible for their own betting decisions.
        </p>
        <p>© {new Date().getFullYear()} Bettors Edge. All rights reserved.</p>
        <div className="mt-3 flex items-center justify-center gap-4">
          <button type="button" onClick={() => setLegalModal({ isOpen: true, type: "terms" })} className="hover:text-indigo-300">Terms</button>
          <button type="button" onClick={() => setLegalModal({ isOpen: true, type: "privacy" })} className="hover:text-indigo-300">Privacy</button>
          <a href="mailto:support@bettorsedge.ai" className="hover:text-indigo-300">Contact</a>
        </div>
      </footer>

      <LegalModal
        isOpen={legalModal.isOpen}
        onClose={() => setLegalModal((prev) => ({ ...prev, isOpen: false }))}
        type={legalModal.type}
      />

      {showDebug && (
        <div className="fixed inset-0 z-[100] overflow-auto bg-slate-950 p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Debug Console</h2>
            <button type="button" onClick={() => setShowDebug(false)} className="rounded-lg bg-slate-800 px-4 py-2 text-sm">Close</button>
          </div>
          <div className="space-y-2 font-mono text-xs">
            {debugLogs.length === 0 ? (
              <p className="italic text-slate-500">No logs found.</p>
            ) : (
              debugLogs.map((log: any, i: number) => (
                <div key={i} className="rounded border border-slate-800 bg-slate-900 p-2">
                  {typeof log === "string" ? log : <><span className="text-indigo-400">[{log.timestamp}]</span> {log.message}</>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
