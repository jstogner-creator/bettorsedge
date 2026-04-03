import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  browserLocalPersistence,
  setPersistence,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  addDoc,
  serverTimestamp,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'firebase/firestore';

import firebaseConfig from '../firebase-applet-config.json';

let app: any = null;
let dbInstance: any = null;
let authInstance: any = null;

function getFirebase() {
  if (!app) {
    console.log("[Firebase] Initializing SDK...");
    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);

    dbInstance = firebaseConfig.firestoreDatabaseId
      ? initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentSingleTabManager({}),
          }),
          databaseId: firebaseConfig.firestoreDatabaseId,
        } as any)
      : initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentSingleTabManager({}),
          }),
        });

    // Set persistence once during initialization
    setPersistence(authInstance, browserLocalPersistence)
      .then(() => console.log('[Firebase] Persistence set to local'))
      .catch((err) => {
        console.error('[Firebase] Failed to set auth persistence:', err);
      });
  }

  return { db: dbInstance, auth: authInstance };
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
    const result = await signInWithPopup(auth, googleProvider);
    console.log('[Auth] Popup sign-in successful for:', result.user.email);
    return { success: true };
  } catch (error: any) {
    console.warn('[Auth] signInWithPopup failed:', error.code, error.message);
    await logLoginError(error, 'signInWithPopup');
    
    if (error.code === 'auth/popup-blocked') {
      const inIframe = window.self !== window.top;
      if (!inIframe) {
        console.log('[Auth] Not in iframe, falling back to signInWithRedirect');
        await signInWithRedirect(auth, googleProvider);
        return { success: false, code: 'auth/popup-blocked-redirecting' };
      } else {
        console.error('[Auth] In iframe, cannot fallback to redirect.');
        return { success: false, error: 'Popup blocked. Please open in a new tab.', code: error.code };
      }
    }
    
    return { success: false, error: error.message, code: error.code };
  }
}

export async function handleGoogleRedirectResult(): Promise<User | null> {
  const auth = getAuthInstance();
  console.log('[Auth] Checking for redirect result...');
  
  try {
    const result = await getRedirectResult(auth);
    if (result) {
      console.log('[Auth] Redirect result processed for:', result.user.email);
      return result.user;
    }
    return auth.currentUser;
  } catch (error: any) {
    console.error('[Auth] getRedirectResult error:', error.code, error.message);
    await logLoginError(error, 'getRedirectResult');
    return auth.currentUser;
  }
}

export const logout = () => signOut(getAuthInstance());

export const getIdToken = async () => {
  const auth = getAuthInstance();
  if (!auth.currentUser) return null;
  return await auth.currentUser.getIdToken();
};
