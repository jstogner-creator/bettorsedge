import { useState, useEffect } from "react";
import { Dashboard } from "./pages/Dashboard";
import { LandingPage } from "./pages/LandingPage";
import { FAQ } from "./pages/FAQ";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { getAuthInstance, handleGoogleRedirectResult } from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentView, setCurrentView] = useState<"main" | "faq">("main");
  const isOnline = useOnlineStatus();

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let isMounted = true;

    const init = async () => {
      try {
        await handleGoogleRedirectResult();
      } catch (err) {
        console.error("[App] Redirect result error:", err);
      }

      if (!isMounted) return;

      unsubscribe = onAuthStateChanged(getAuthInstance(), (currentUser) => {
        console.log(
          "[App] Auth State Changed:",
          currentUser ? `Logged In (${currentUser.email})` : "Logged Out"
        );
        if (!isMounted) return;
        setUser(currentUser);
        setIsAuthReady(true);
      });
    };

    init();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-6"></div>
        <h2 className="text-xl font-bold text-white mb-2">Initializing Bettors Edge</h2>
        <p className="text-slate-400 text-sm animate-pulse mb-8">
          Syncing your edge with the latest data...
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs rounded-lg border border-slate-800 transition-all"
        >
          Taking too long? Tap to reload
        </button>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-rose-600 text-white text-center py-2 z-50">
          You are currently offline. Please check your connection.
        </div>
      )}
      {user ? (
        currentView === "faq" ? (
          <FAQ onBack={() => setCurrentView("main")} />
        ) : (
          <Dashboard user={user} onOpenFAQ={() => setCurrentView("faq")} />
        )
      ) : (
        <LandingPage />
      )}
    </ErrorBoundary>
  );
}