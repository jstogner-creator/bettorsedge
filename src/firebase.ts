import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
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

  if (host && !isLocalhost) {
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
      code: error?.code || 'unknown',
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
    try {
      await setPersistence(auth, browserLocalPersistence);
    } catch {
      try {
        await setPersistence(auth, browserSessionPersistence);
      } catch {
        await setPersistence(auth, inMemoryPersistence);
      }
    }

    await signInWithPopup(auth, googleProvider);
    return { success: true };
  } catch (error: any) {
    console.error('[Auth] signInWithPopup failed:', error?.code, error?.message);
    await logLoginError(error, 'signInWithPopup');
    return { success: false, error: error?.message, code: error?.code };
  }
}

export async function handleGoogleRedirectResult(): Promise<User | null> {
  return getAuthInstance().currentUser;
}

export const logout = () => signOut(getAuthInstance());

export const getIdToken = async () => {
  const auth = getAuthInstance();
  if (!auth.currentUser) return null;
  return await auth.currentUser.getIdToken();
};