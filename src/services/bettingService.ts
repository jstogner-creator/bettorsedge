import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  orderBy, 
  Timestamp,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Bet, UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';

export const bettingService = {
  async placeBet(bet: Omit<Bet, 'id' | 'userId' | 'createdAt' | 'status'>): Promise<string> {
    if (!auth.currentUser) throw new Error('User not authenticated');

    const betData = {
      ...bet,
      userId: auth.currentUser.uid,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    try {
      const docRef = await addDoc(collection(db, 'bets'), betData);
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'bets');
      throw error;
    }
  },

  async getBets(userId: string): Promise<Bet[]> {
    const q = query(
      collection(db, 'bets'), 
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    
    try {
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bet));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'bets');
      throw error;
    }
  },

  async updateBetStatus(betId: string, status: 'won' | 'lost' | 'push', payout?: number): Promise<void> {
    const betRef = doc(db, 'bets', betId);
    try {
      await updateDoc(betRef, {
        status,
        payout,
        resolvedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bets/${betId}`);
    }
  },

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const docRef = doc(db, 'users', userId);
    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as UserProfile;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${userId}`);
      throw error;
    }
  },

  async updateBankroll(userId: string, newAmount: number): Promise<void> {
    const userRef = doc(db, 'users', userId);
    try {
      await updateDoc(userRef, {
        bankroll: newAmount
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
    }
  },

  async initializeBankroll(userId: string, initialAmount: number = 1000): Promise<void> {
    const userRef = doc(db, 'users', userId);
    try {
      const docSnap = await getDoc(userRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.bankroll === undefined) {
          await updateDoc(userRef, { bankroll: initialAmount });
        }
      } else {
        // If user doc doesn't exist for some reason, create it
        await setDoc(userRef, { 
          uid: userId,
          email: auth.currentUser?.email || '',
          bankroll: initialAmount,
          createdAt: new Date().toISOString()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
    }
  }
};
