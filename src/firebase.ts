import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
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
  console.log('[Auth] Starting Google sign-in flow');
  
  try {
    // Try popup first as it's better UX in iframes if allowed
    await signInWithPopup(auth, googleProvider);
    console.log('[Auth] Popup sign-in successful');
  } catch (error: any) {
    console.warn('[Auth] signInWithPopup failed:', error.code, error.message);
    await logLoginError(error, 'signInWithPopup');
    
    if (error.code === 'auth/popup-blocked') {
      alert('Sign-in popup was blocked by your browser. Please allow popups for this site or open the app in a new tab.');
    } else if (error.code === 'auth/unauthorized-domain') {
      alert('This domain is not authorized for Firebase Auth. Please add it in the Firebase Console.');
    } else {
      alert(`Google sign-in failed: ${error.message}`);
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
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration. The client is offline.');
    }
  }
}

testConnection();
