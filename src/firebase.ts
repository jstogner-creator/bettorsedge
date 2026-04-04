import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  User,
  Auth,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import {
  collection,
  addDoc,
  serverTimestamp,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  Firestore,
} from 'firebase/firestore';

import rawFirebaseConfig from '../firebase-applet-config.json';

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

function buildFirebaseConfig() {
  const config = { ...rawFirebaseConfig } as any;

  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocalhost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.local');

  const isGoogleRunDomain = host.endsWith('.run.app');
  const isFirebaseDomain = host.endsWith('.firebaseapp.com') || host.endsWith('.web.app');

  // Use same-site auth domain on custom production domains.
  // For non-Firebase hosting, the server must proxy /__/auth/* and /__/firebase/init.json.
  if (host && !isLocalhost && !isGoogleRunDomain && !isFirebaseDomain) {
    config.authDomain = host;
  }

  return config;
}

function getFirebase() {
  if (!app) {
    console.log('[Firebase] Initializing SDK...');
    const firebaseConfig = buildFirebaseConfig();

    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);

    setPersistence(authInstance, browserLocalPersistence)
      .then(() => console.log('[Firebase] Auth persistence set to local'))
      .catch((err) => {
        console.error('[Firebase] Failed to set auth persistence:', err);
      });

    dbInstance = firebaseConfig.firestoreDatabaseId
      ? initializeFirestore(
          app,
          {
            localCache: persistentLocalCache({
              tabManager: persistentSingleTabManager({}),
            }),
          },
          firebaseConfig.firestoreDatabaseId
        )
      : initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentSingleTabManager({}),
          }),
        });
  }

  return { db: dbInstance!, auth: authInstance! };
}

export const getDb = () => getFirebase().db;
export const getAuthInstance = () => getFirebase().auth;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export async function logLoginError(error: any, context: string) {
  try {
    const db = getDb();
    await addDoc(collection(db, 'login_errors'), {
      error: error instanceof Error ? error.message : String(error),
      code: error.code || 'unknown',
      context,
      timestamp: serverTimestamp(),
      userAgent: navigator.userAgent,
    });
    console.log('[Auth] Logged error to Firestore');
  } catch (logErr) {
    console.error('[Auth] Failed to log error to Firestore', logErr);
  }
}

export interface LoginResult {
  success: boolean;
  error?: string;
  code?: string;
}

export async function loginWithGoogle(): Promise<LoginResult> {
  const auth = getAuthInstance();
  console.log('[Auth] Starting Google sign-in flow (Popup)');

  try {
    await setPersistence(auth, browserLocalPersistence);

    const result = await signInWithPopup(auth, googleProvider);
    console.log('[Auth] Popup sign-in successful for:', result.user.email);
    return { success: true };
  } catch (error: any) {
    console.warn('[Auth] signInWithPopup failed:', error.code, error.message);
    await logLoginError(error, 'signInWithPopup');

    const popupErrorCodes = [
      'auth/popup-blocked',
      'auth/cancelled-popup-request',
      'auth/popup-closed-by-user',
      'auth/web-storage-unsupported',
    ];

    if (popupErrorCodes.includes(error.code) || error.message.includes('third-party cookies')) {
      const inIframe = window.self !== window.top;

      if (!inIframe) {
        console.log('[Auth] Not in iframe, falling back to signInWithRedirect for code:', error.code);
        document.cookie = 'redirect_login_pending=true; path=/; max-age=300; SameSite=Lax';
        await setPersistence(auth, browserLocalPersistence);
        await signInWithRedirect(auth, googleProvider);
        return { success: false, code: 'auth/popup-blocked-redirecting' };
      } else {
        console.error('[Auth] In iframe, cannot fallback to redirect.');
        return {
          success: false,
          error: 'Browser security settings prevent login here. Please open in a new tab.',
          code: error.code,
        };
      }
    }

    return { success: false, error: error.message, code: error.code };
  }
}

export async function handleGoogleRedirectResult(): Promise<User | null> {
  const auth = getAuthInstance();
  console.log('[Auth] Checking for redirect result...');
  
  const wasRedirectPending = document.cookie.includes('redirect_login_pending=true');
  if (wasRedirectPending) {
    console.log('[Auth] Found redirect_login_pending flag in cookie');
  }
  
  try {
    const result = await getRedirectResult(auth);
    if (result) {
      console.log('[Auth] Redirect result processed for:', result.user.email);
      document.cookie = "redirect_login_pending=; path=/; max-age=0; SameSite=Lax";
      return result.user;
    }
    
    if (wasRedirectPending && !auth.currentUser) {
      console.warn('[Auth] Redirect was pending but getRedirectResult returned null!');
      document.cookie = "redirect_login_pending=; path=/; max-age=0; SameSite=Lax";
      throw new Error("Login session lost during redirect. Your browser's tracking prevention (like Safari ITP) blocked the login. Please ALLOW POPUPS for this site and try signing in again, or use Chrome/Firefox.");
    }
    
    return auth.currentUser;
  } catch (error: any) {
    console.error('[Auth] getRedirectResult error:', error.code, error.message);
    document.cookie = "redirect_login_pending=; path=/; max-age=0; SameSite=Lax";
    await logLoginError(error, 'getRedirectResult');
    throw error; // Throw to let the caller handle the UI
  }
}

export const logout = () => signOut(getAuthInstance());

export const getIdToken = async () => {
  const auth = getAuthInstance();
  if (!auth.currentUser) return null;
  return await auth.currentUser.getIdToken();
};
