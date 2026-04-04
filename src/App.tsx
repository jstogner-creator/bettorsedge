import { useState, useEffect, useRef, lazy, Suspense } from "react";
const Dashboard = lazy(() => import("./pages/Dashboard").then(m => ({ default: m.Dashboard })));
const LandingPage = lazy(() => import("./pages/LandingPage").then(m => ({ default: m.LandingPage })));
import { FAQ } from "./pages/FAQ";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { getAuthInstance, handleGoogleRedirectResult } from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { ErrorBoundary } from "./components/ErrorBoundary";

const LoadingScreen = ({ message = "Initializing Bettors Edge" }) => (
  <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-6"></div>
    <h2 className="text-xl font-bold text-white mb-2">{message}</h2>
    <p className="text-slate-400 text-sm animate-pulse mb-8">
      Syncing your edge with the latest data...
    </p>
    <div className="flex flex-col gap-3">
      <button
        onClick={() => window.open(window.location.href, '_blank')}
        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-lg transition-all font-bold"
      >
        Open in New Tab (Recommended)
      </button>
      <button
        onClick={() => window.location.reload()}
        className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs rounded-lg border border-slate-800 transition-all"
      >
        Still stuck? Tap to reload
      </button>
    </div>
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [redirectError, setRedirectError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<"main" | "faq">("main");
  const isOnline = useOnlineStatus();
  const authReadyRef = useRef(false);

  useEffect(() => {
    authReadyRef.current = isAuthReady;
  }, [isAuthReady]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let isMounted = true;
    let authTimeout: NodeJS.Timeout;
    let redirectUserSet = false;

    const init = () => {
      console.log("[App] Initialization started");
      
      // Safety timeout: if auth doesn't ready in 10 seconds, force it
      // This ensures the app renders even if Firebase is slow or hangs
      authTimeout = setTimeout(() => {
        if (isMounted && !authReadyRef.current) {
          console.warn("[App] Auth initialization timed out. Forcing ready state.");
          setIsAuthReady(true);
        }
      }, 10000);

      console.log("[App] Attaching onAuthStateChanged listener");
      const auth = getAuthInstance();
      
      // 1. Attach listener synchronously
      unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        console.log(
          "[App] Auth State Changed:",
          currentUser ? `Logged In (${currentUser.email})` : "Logged Out"
        );

        if (!isMounted) return;
        clearTimeout(authTimeout);
        
        // Only update if it's a real change to avoid overwriting redirect result
        setUser((prevUser) => {
          console.log(`[App] setUser callback: prevUser=${prevUser?.email}, currentUser=${currentUser?.email}, redirectUserSet=${redirectUserSet}`);
          if (prevUser && !currentUser) {
            console.warn("[App] User transitioned from logged in to logged out!");
            if (redirectUserSet) {
              console.warn("[App] Ignoring null user because redirect user was just set");
              return prevUser;
            }
            const wasRedirectPending = document.cookie.includes('redirect_login_pending=true');
            if (wasRedirectPending) {
              console.warn("[App] Ignoring null user because redirect was pending");
              return prevUser;
            }
          }
          return currentUser;
        });
        setIsAuthReady(true);
      });

      // 2. Process redirect asynchronously without blocking the listener
      handleGoogleRedirectResult().then((redirectUser) => {
        if (isMounted && redirectUser) {
          console.log("[App] Redirect result returned user, setting state explicitly");
          redirectUserSet = true;
          setUser(redirectUser);
          setIsAuthReady(true);
          
          setTimeout(() => {
            redirectUserSet = false;
          }, 5000);
        }
      }).catch((e: any) => {
        console.error("[App] Error handling redirect result:", e);
        if (isMounted && e.code !== 'auth/redirect-cancelled-by-user') {
          setRedirectError(e.message || "Failed to complete sign in. Please try again.");
        }
        // Ensure auth is marked ready even on error to prevent infinite loading
        if (isMounted) setIsAuthReady(true);
      });
    };

    init();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
      if (authTimeout) clearTimeout(authTimeout);
    };
  }, []);

  if (!isAuthReady) {
    return <LoadingScreen />;
  }

  return (
    <ErrorBoundary>
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-rose-600 text-white text-center py-2 z-50">
          You are currently offline. Please check your connection.
        </div>
      )}
      <Suspense fallback={<LoadingScreen message="Loading View..." />}>
        {user ? (
          currentView === "faq" ? (
            <FAQ onBack={() => setCurrentView("main")} />
          ) : (
            <Dashboard user={user} onOpenFAQ={() => setCurrentView("faq")} />
          )
        ) : (
          <LandingPage initialError={redirectError} />
        )}
      </Suspense>
    </ErrorBoundary>
  );
}
