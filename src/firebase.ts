import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  browserLocalPersistence,
  setPersistence,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
} from 'firebase/firestore';

import firebaseConfig from '../firebase-applet-config.json';

let app: any = null;
let dbInstance: any = null;
let authInstance: any = null;

function getFirebase() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);

    dbInstance = firebaseConfig.firestoreDatabaseId
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);

    setPersistence(authInstance, browserLocalPersistence).catch((err) => {
      console.error('[Firebase] Failed to set auth persistence:', err);
    });
  }

  return { db: dbInstance, auth: authInstance };
}

export const getDb = () => getFirebase().db;
export const getAuthInstance = () => getFirebase().auth;

export const db = getDb();
export const auth = getAuthInstance();

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export async function loginWithGoogle(): Promise<void> {
  console.log('[Auth] Starting Google popup sign-in');
  try {
    await signInWithPopup(getAuthInstance(), googleProvider);
  } catch (error: any) {
    console.error('[Auth] signInWithPopup failed:', error);
    throw error;
  }
}

export async function handleGoogleRedirectResult(): Promise<User | null> {
  // Redirect result is not needed for popup flow, but keeping for compatibility
  return getAuthInstance().currentUser;
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
