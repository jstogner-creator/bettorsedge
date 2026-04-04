import React, { useEffect, useMemo, useState } from "react";
import { Trophy, ArrowRight, TrendingUp, Shield, Zap } from "lucide-react";
import { motion } from "motion/react";
import { loginWithGoogle } from "../firebase";
import { LegalModal } from "../components/LegalModal";

interface LandingPageProps {
  onEnter?: () => void;
  initialError?: string | null;
}

export function LandingPage({ initialError, ..._props }: LandingPageProps) {
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
    if (initialError) {
      setLoginError(initialError);
    }
  }, [initialError]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("debug") === "true") {
      setShowDebug(true);
    }

    const err = sessionStorage.getItem("auth_error");
    if (err === "unauthorized-domain") {
      setLoginError(
        "This domain is not authorized for OAuth. Please add this URL to your Firebase Authorized Domains in the Firebase Console."
      );
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

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("auth_error");
      if (stored) {
        setLoginError(stored);
        sessionStorage.removeItem("auth_error");
      }
    } catch (e) {
      // Ignore
    }
  }, []);

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

        const inIframe = window.self !== window.top;
        
        if (result.code === "auth/popup-blocked-redirecting") {
          return;
        }

        if (result.code === 'auth/popup-closed-by-user' || result.code === 'auth/cancelled-popup-request' || result.code === 'auth/popup-blocked' || result.code === 'auth/web-storage-unsupported') {
          console.warn("User cancelled login, popup failed, or storage unsupported.");
          
          if (inIframe) {
            console.log("[LandingPage] Popup/storage failed in iframe, opening new tab as fallback");
            window.open(window.location.href, "_blank");
            setLoginMessage("To continue, please use the app in the new tab that just opened. Your browser's security settings prevent logging in directly within this embedded view.");
            setIsLoggingIn(false);
            return;
          }
          
          if (result.code === 'auth/web-storage-unsupported') {
            setLoginError("Your browser is blocking third-party cookies. Please enable them to sign in.");
          }
          
          setIsLoggingIn(false);
          return;
        }

        setLoginError(result.error || "Failed to sign in. Please try again.");
        setIsLoggingIn(false);
        return;
      }

      console.log("[LandingPage] Login successful");
    } catch (error) {
      console.error("[LandingPage] Unexpected login error:", error);
      setLoginError("An unexpected error occurred. Please try again.");
      setIsLoggingIn(false);
    }
  };

  const inIframe = window.self !== window.top;

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-600/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-8"
        >
          <div className="inline-flex items-center justify-center p-4 bg-indigo-600/10 border border-indigo-500/30 rounded-2xl mb-8 backdrop-blur-sm">
            <Trophy className="w-12 h-12 text-indigo-400" />
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight mb-12">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400">
              Bettors Edge
            </span>
            <span className="block text-white mt-2 text-2xl sm:text-4xl font-semibold">
              Advanced AI Sports Analysis.
            </span>
          </h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="flex flex-col gap-6 justify-center items-center w-full max-w-md mx-auto"
        >
          <div className="flex flex-col items-center gap-3">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => {
                  setAcceptedTerms(e.target.checked);
                  if (e.target.checked) setShowTermsError(false);
                }}
                className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-950"
              />
              <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                I agree to the{" "}
                <button
                  type="button"
                  onClick={() =>
                    setLegalModal({ isOpen: true, type: "terms" })
                  }
                  className="text-indigo-400 hover:underline"
                >
                  Terms of Service
                </button>{" "}
                and{" "}
                <button
                  type="button"
                  onClick={() =>
                    setLegalModal({ isOpen: true, type: "privacy" })
                  }
                  className="text-indigo-400 hover:underline"
                >
                  Privacy Policy
                </button>
              </span>
            </label>

            {showTermsError && (
              <p className="text-xs text-rose-500 animate-pulse">
                Please accept the terms to continue
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="group w-full px-8 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg transition-all duration-200 shadow-lg shadow-indigo-500/25 flex items-center justify-center flex-col"
          >
            <div className="flex items-center">
              {isLoggingIn ? "Signing In..." : inIframe ? "Continue to Secure Login" : "Sign In with Google"}
              {!isLoggingIn && (
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              )}
            </div>
            {inIframe && !isLoggingIn && (
              <span className="text-xs text-indigo-200 mt-1 font-normal opacity-80">Opens in a new tab</span>
            )}
          </button>

          {loginError && (
            <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-sm text-center">
              {loginError}
            </div>
          )}

          {loginMessage && (
            <div className="mt-4 p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-300 text-sm text-center flex flex-col items-center">
              <p className="mb-3">{loginMessage}</p>
              <button 
                onClick={() => window.open(window.location.href, "_blank")}
                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors font-bold"
              >
                Open in New Tab
              </button>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl mx-auto text-left"
        >
          <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-xl backdrop-blur-sm">
            <TrendingUp className="w-8 h-8 text-emerald-400 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">
              AI-Powered Alpha
            </h3>
            <p className="text-slate-400 text-sm">
              Deep analysis of rosters, injuries, and historical data to find
              the value others missed.
            </p>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-xl backdrop-blur-sm">
            <Shield className="w-8 h-8 text-indigo-400 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">
              Scenario Analysis
            </h3>
            <p className="text-slate-400 text-sm">
              Analyze multiple outcomes. Our algorithms suggest potential
              scenarios for every matchup.
            </p>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-xl backdrop-blur-sm">
            <Zap className="w-8 h-8 text-amber-400 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">
              Real-Time Data
            </h3>
            <p className="text-slate-400 text-sm">
              Live updates on injuries and market trends ensure you're never
              analyzing stale info.
            </p>
          </div>
        </motion.div>
      </div>

      <LegalModal
        isOpen={legalModal.isOpen}
        onClose={() =>
          setLegalModal((prev) => ({ ...prev, isOpen: false }))
        }
        type={legalModal.type}
      />

      {showDebug && (
        <div className="fixed inset-0 z-[100] bg-slate-950 p-6 overflow-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Debug Console</h2>
            <button
              type="button"
              onClick={() => setShowDebug(false)}
              className="px-4 py-2 bg-slate-800 rounded-lg text-sm"
            >
              Close
            </button>
          </div>

          <div className="space-y-2 font-mono text-xs">
            {debugLogs.length === 0 ? (
              <p className="text-slate-500 italic">No logs found.</p>
            ) : (
              debugLogs.map((log: any, i: number) => (
                <div
                  key={i}
                  className="p-2 bg-slate-900 border border-slate-800 rounded"
                >
                  {typeof log === "string" ? (
                    log
                  ) : (
                    <>
                      <span className="text-indigo-400">
                        [{log.timestamp}]
                      </span>{" "}
                      {log.message}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="absolute bottom-4 w-full text-center text-slate-600 text-xs px-4">
        <p className="mb-1 max-w-3xl mx-auto">
          <strong>Disclaimer:</strong> Bettors Edge provides predictions and
          analysis for informational and entertainment purposes only. These are
          only predictions and not guarantees of future outcomes. We are not
          responsible for any decisions made based on our analysis.
        </p>

        <p>© {new Date().getFullYear()} Bettors Edge. All rights reserved.</p>

        <div className="mt-2 flex items-center justify-center space-x-4">
          <a
            href="mailto:support@bettorsedge.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-indigo-400 transition-colors"
          >
            Contact Us
          </a>
          <a
            href="mailto:support@bettorsedge.ai?subject=Bug%20Report%20/%20Feedback"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-indigo-400 transition-colors"
          >
            Report a Bug / Feedback
          </a>
        </div>
      </div>
    </div>
  );
}