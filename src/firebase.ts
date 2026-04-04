import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  User,
  Auth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
} from 'firebase/auth';
import {
  collection,
  addDoc,
  serverTimestamp,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
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
      .catch(async (err) => {
        console.error('[Firebase] Failed to set auth persistence to local, trying session:', err);
        try {
          await setPersistence(authInstance!, browserSessionPersistence);
          console.log('[Firebase] Auth persistence set to session');
        } catch (sessionErr) {
          console.error('[Firebase] Failed to set auth persistence to session, trying memory:', sessionErr);
          try {
            await setPersistence(authInstance!, inMemoryPersistence);
            console.log('[Firebase] Auth persistence set to memory');
          } catch (memoryErr) {
            console.error('[Firebase] Failed to set auth persistence to memory:', memoryErr);
          }
        }
      });

    try {
      dbInstance = firebaseConfig.firestoreDatabaseId
        ? initializeFirestore(
            app,
            {
              localCache: persistentLocalCache({
                tabManager: persistentMultipleTabManager(),
              }),
            },
            firebaseConfig.firestoreDatabaseId
          )
        : initializeFirestore(app, {
            localCache: persistentLocalCache({
              tabManager: persistentMultipleTabManager(),
            }),
          });
    } catch (e) {
      console.warn('[Firebase] Failed to initialize persistent cache, falling back to memory cache', e);
      dbInstance = firebaseConfig.firestoreDatabaseId
        ? initializeFirestore(
            app,
            { localCache: memoryLocalCache() },
            firebaseConfig.firestoreDatabaseId
          )
        : initializeFirestore(app, { localCache: memoryLocalCache() });
    }
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
  console.log('[Auth] Starting Google sign-in flow (Redirect)');

  try {
    try {
      await setPersistence(auth, browserLocalPersistence);
    } catch {
      try {
        await setPersistence(auth, browserSessionPersistence);
      } catch {
        await setPersistence(auth, inMemoryPersistence);
      }
    }

    document.cookie = 'redirect_login_pending=true; path=/; max-age=300; SameSite=Lax';
    await signInWithRedirect(auth, googleProvider);
    return { success: true };
  } catch (error: any) {
    console.error('[Auth] signInWithRedirect failed:', error.code, error.message);
    await logLoginError(error, 'signInWithRedirect');
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
