Use this:

import { FirebaseApp, initializeApp } from 'firebase/app';
import {
  Auth,
  GoogleAuthProvider,
  User,
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  setPersistence,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import {
  Firestore,
  doc,
  getDocFromServer,
  getFirestore,
} from 'firebase/firestore';

import firebaseConfig from '../firebase-applet-config.json';

type FirebaseConfigWithOptionalDbId = typeof firebaseConfig & {
  firestoreDatabaseId?: string;
};

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let persistenceInitialized = false;

function getTypedConfig(): FirebaseConfigWithOptionalDbId {
  return firebaseConfig as FirebaseConfigWithOptionalDbId;
}

function getFirebase() {
  if (!app) {
    const config = getTypedConfig();

    app = initializeApp(config);
    authInstance = getAuth(app);

    dbInstance = config.firestoreDatabaseId
      ? getFirestore(app, config.firestoreDatabaseId)
      : getFirestore(app);

    if (!persistenceInitialized) {
      persistenceInitialized = true;
      setPersistence(authInstance, browserLocalPersistence).catch((err) => {
        console.error('[Firebase] Failed to set auth persistence:', {
          code: err?.code,
          message: err?.message,
          stack: err?.stack,
        });
      });
    }
  }

  return {
    db: dbInstance as Firestore,
    auth: authInstance as Auth,
  };
}

export const getDb = (): Firestore => getFirebase().db;
export const getAuthInstance = (): Auth => getFirebase().auth;

export const db = getDb();
export const auth = getAuthInstance();

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export async function loginWithGoogle(): Promise<void> {
  await signInWithRedirect(getAuthInstance(), googleProvider);
}

export async function handleGoogleRedirectResult(): Promise<User | null> {
  try {
    const result = await getRedirectResult(getAuthInstance());
    return result?.user ?? null;
  } catch (error: any) {
    console.error('[Auth] getRedirectResult failed:', {
      code: error?.code,
      message: error?.message,
      stack: error?.stack,
      customData: error?.customData,
    });
    throw error;
  }
}

export async function logout(): Promise<void> {
  await signOut(getAuthInstance());
}

export const getIdToken = async (): Promise<string | null> => {
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
      console.error('[Firestore] Please check your Firebase configuration. The client is offline.');
    }
  }
}
testConnection();