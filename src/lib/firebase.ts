import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile as updateFirebaseProfile,
  onAuthStateChanged,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { User } from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let authInitPromise: Promise<FirebaseUser | null> | null = null;

export async function ensureFirebaseSession(user?: User | null): Promise<FirebaseUser | null> {
  if (auth.currentUser) {
    return auth.currentUser;
  }
  if (authInitPromise) {
    return authInitPromise;
  }

  authInitPromise = (async () => {
    try {
      if (auth.currentUser) return auth.currentUser;
      const rawKey = (user?.username || user?.email?.split('@')[0] || user?.id || 'directory_reader')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 24) || 'member';
      const syncEmail = `mesh_${rawKey}@aetherchat.app`;
      const syncPass = `AetherMesh#2026#${rawKey}`;

      try {
        const cred = await signInWithEmailAndPassword(auth, syncEmail, syncPass);
        return cred.user;
      } catch {
        const created = await createUserWithEmailAndPassword(auth, syncEmail, syncPass);
        return created.user;
      }
    } catch {
      return auth.currentUser;
    } finally {
      authInitPromise = null;
    }
  })();

  return authInitPromise;
}

export async function syncUserToCloudDirectory(user: User): Promise<void> {
  if (!user || !user.id) return;
  try {
    const fbUser = await ensureFirebaseSession(user);
    if (!fbUser) return;

    const uid = fbUser.uid;
    let cleanUsername = (user.username || user.displayName || 'user')
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 32);
    if (cleanUsername.length < 2) {
      cleanUsername = `user_${cleanUsername || '1'}`;
    }

    const cleanDisplayName = (user.displayName || cleanUsername).trim().slice(0, 64) || 'User';
    const cleanAppUserId = (user.id || uid).replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
    const cleanAvatarUrl = (
      user.avatarUrl ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(cleanDisplayName)}`
    ).slice(0, 1024);
    const cleanBio = (user.bio || 'Member of the encrypted communications mesh.').slice(0, 256);

    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      await setDoc(userRef, {
        uid,
        appUserId: cleanAppUserId,
        username: cleanUsername,
        displayName: cleanDisplayName,
        avatarUrl: cleanAvatarUrl,
        bio: cleanBio,
        isOnline: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        appUserId: cleanAppUserId,
        username: cleanUsername,
        displayName: cleanDisplayName,
        avatarUrl: cleanAvatarUrl,
        bio: cleanBio,
        isOnline: true,
        updatedAt: serverTimestamp(),
      });
    }

    if (user.email) {
      const privRef = doc(db, 'users', uid, 'private', 'info');
      const privSnap = await getDoc(privRef);
      const cleanEmail = user.email.trim().toLowerCase().slice(0, 128);
      if (!privSnap.exists()) {
        await setDoc(privRef, {
          uid,
          email: cleanEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(privRef, {
          email: cleanEmail,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch {
    // Non-blocking cloud directory sync
  }
}

export async function fetchCloudDirectoryUsers(currentUser?: User | null): Promise<User[]> {
  try {
    if (currentUser) {
      await syncUserToCloudDirectory(currentUser);
    } else {
      await ensureFirebaseSession(null);
    }
    if (!auth.currentUser) return [];

    const q = query(collection(db, 'users'), where('isOnline', 'in', [true, false]), limit(100));
    const snapshot = await getDocs(q);
    const results: User[] = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (!data || !data.username || !data.displayName) return;
      if (data.username === 'directory_reader' || data.username === 'guest_viewer') return;

      const resolvedId = data.appUserId || data.uid || docSnap.id;
      results.push({
        id: resolvedId,
        username: data.username,
        displayName: data.displayName,
        email: `${data.username}@aether.chat`,
        avatarUrl:
          data.avatarUrl ||
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.displayName)}`,
        bio: data.bio || 'Member of the encrypted communications mesh.',
        onlineStatus: data.isOnline ? 'online' : 'offline',
        isOnline: Boolean(data.isOnline),
        createdAt:
          data.createdAt && typeof data.createdAt.toDate === 'function'
            ? data.createdAt.toDate().toISOString()
            : new Date().toISOString(),
        role: 'user',
      });
    });

    return results;
  } catch {
    return [];
  }
}

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateFirebaseProfile,
  onAuthStateChanged,
  signOut,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
};
export type { FirebaseUser };
