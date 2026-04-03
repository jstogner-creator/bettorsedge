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
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  addDoc,
  serverTimestamp,
  enableIndexedDbPersistence,
} from 'firebase/firestore';

import firebaseConfig from '../firebase-applet-config.json';

let app: any = null;
let dbInstance: any = null;
let authInstance: any = null;

function getFirebase() {
  if (!app) {
    console.log('[Firebase] Initializing SDK...');
    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);

    dbInstance = firebaseConfig.firestoreDatabaseId
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);

    // Enable offline persistence for Firestore
    if (typeof window !== 'undefined') {
      enableIndexedDbPersistence(dbInstance).catch((err) => {
        if (err.code === 'failed-precondition') {
          // Multiple tabs open, persistence can only be enabled in one tab at a time.
          console.warn('[Firebase] Persistence failed: Multiple tabs open');
        } else if (err.code === 'unimplemented') {
          // The current browser does not support all of the features required to enable persistence
          console.warn('[Firebase] Persistence failed: Browser not supported');
        } else {
          console.error('[Firebase] Persistence failed:', err);
        }
      });
    }

    // Set persistence once during initialization
    setPersistence(authInstance, browserLocalPersistence)
      .then(() => console.log('[Firebase] Persistence set to local'))
      .catch((err) => {
        console.error('[Firebase] Failed to set auth persistence:', err);
      });
  }

  return { db: dbInstance, auth: authInstance };
}

// Initialize immediately to ensure authInstance is ready
const { db: initialDb, auth: initialAuth } = getFirebase();

export const db = initialDb;
export const auth = initialAuth;

export const getDb = () => initialDb;
export const getAuthInstance = () => initialAuth;

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

export async function loginWithGoogle(): Promise<void> {
  const auth = getAuthInstance();
  console.log('[Auth] Starting Google sign-in flow (Popup)');
  
  try {
    const result = await signInWithPopup(auth, googleProvider);
    console.log('[Auth] Popup sign-in successful for:', result.user.email);
  } catch (error: any) {
    console.warn('[Auth] signInWithPopup failed:', error.code, error.message);
    await logLoginError(error, 'signInWithPopup');
    
    // Fallback to redirect ONLY if popup is blocked and we are NOT in an iframe
    // But in AI Studio, we are almost always in an iframe, so redirect will likely fail too.
    // The best advice is to open in a new tab.
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
      console.error('[Auth] Popup blocked or cancelled.');
      
      const inIframe = window.self !== window.top;
      if (!inIframe) {
        console.log('[Auth] Not in iframe, falling back to signInWithRedirect');
        await signInWithRedirect(auth, googleProvider);
        return;
      } else {
        console.error('[Auth] In iframe, cannot fallback to redirect. User must open in new tab.');
      }
    }
    
    throw error;
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
    console.log('[Auth] No redirect result found, current user:', auth.currentUser?.email || 'None');
    return auth.currentUser;
  } catch (error: any) {
    console.error('[Auth] getRedirectResult error:', error.code, error.message);
    await logLoginError(error, 'getRedirectResult');
    // Return current user anyway, maybe they are already signed in
    return auth.currentUser;
  }
}

export const logout = () => signOut(getAuthInstance());

export const getIdToken = async () => {
  const auth = getAuthInstance();
  if (!auth.currentUser) return null;
  return await auth.currentUser.getIdToken();
};

async function testConnection() {
  try {
    const db = getDb();
    // Use a non-blocking check
    getDocFromServer(doc(db, 'test', 'connection')).catch((error) => {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error('Please check your Firebase configuration. The client is offline.');
      }
    });
  } catch (error) {
    // Ignore initialization errors here
  }
}

// Don't run on module load to avoid blocking or causing issues in iframes
// testConnection();
