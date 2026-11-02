import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  getFirestore,
  setLogLevel,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  limit,
  onSnapshot,
  serverTimestamp,
  getDocFromServer,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { User, Conversation, Message, Story, Call, BlockedUser, Report } from '../types';

setLogLevel('silent');

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const directoryUserCache = new Map<string, User>();
const DELETED_USERS_STORAGE_KEY = 'aether_deleted_users';

function loadDeletedUserKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DELETED_USERS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.map(String));
    }
  } catch {
    // Ignore storage read error
  }
  return new Set();
}

function saveDeletedUserKeys(keys: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DELETED_USERS_STORAGE_KEY, JSON.stringify(Array.from(keys)));
  } catch {
    // Ignore storage write error
  }
}

function extractCandidateKeysForUser(userOrId: Partial<User> | string | null | undefined): string[] {
  if (!userOrId) return [];
  const keys = new Set<string>();
  if (typeof userOrId === 'string') {
    const clean = userOrId.trim();
    if (clean) {
      keys.add(clean.toLowerCase());
      keys.add(sanitizeUsername(clean));
      keys.add(sanitizeId(clean, 'u'));
      if (clean.includes('@')) {
        const prefix = clean.split('@')[0];
        if (prefix) {
          keys.add(prefix.toLowerCase());
          keys.add(sanitizeUsername(prefix));
        }
      }
    }
  } else {
    if (userOrId.id) {
      keys.add(userOrId.id);
      keys.add(userOrId.id.toLowerCase());
      keys.add(sanitizeId(userOrId.id, 'u'));
    }
    if (userOrId.username) {
      keys.add(userOrId.username.trim().toLowerCase().replace(/^@/, ''));
      keys.add(sanitizeUsername(userOrId.username));
    }
    if (userOrId.email) {
      const cleanEmail = userOrId.email.trim().toLowerCase();
      keys.add(cleanEmail);
      const prefix = cleanEmail.split('@')[0];
      if (prefix) {
        keys.add(prefix);
        keys.add(sanitizeUsername(prefix));
      }
    }
  }
  // Never mark superadmin nihal.graphix as deleted
  for (const k of Array.from(keys)) {
    if (
      k === 'nihal.graphix' ||
      k === 'nihal_graphix' ||
      k === 'u_nihal_graphix' ||
      k === 'nihal.graphix@gmail.com'
    ) {
      keys.delete(k);
    }
  }
  return Array.from(keys).filter(Boolean);
}

export function isUserDeletedInCloudCache(userOrId: Partial<User> | string | null | undefined): boolean {
  if (!userOrId) return false;
  const deletedSet = loadDeletedUserKeys();
  if (deletedSet.size === 0) return false;
  const candidates = extractCandidateKeysForUser(userOrId);
  return candidates.some(k => deletedSet.has(k));
}

export function markUserDeletedInCloudCache(userOrId: Partial<User> | string | null | undefined): void {
  const candidates = extractCandidateKeysForUser(userOrId);
  if (candidates.length === 0) return;
  const deletedSet = loadDeletedUserKeys();
  for (const k of candidates) {
    deletedSet.add(k);
    directoryUserCache.delete(k);
  }
  saveDeletedUserKeys(deletedSet);
}

export function unmarkUserDeletedInCloudCache(userOrId: Partial<User> | string | null | undefined): void {
  const candidates = extractCandidateKeysForUser(userOrId);
  if (candidates.length === 0) return;
  const deletedSet = loadDeletedUserKeys();
  let changed = false;
  for (const k of candidates) {
    if (deletedSet.delete(k)) changed = true;
    const noteId = sanitizeId(`del_${k}`, 'del');
    void deleteDoc(doc(db, 'users', 'nihal_graphix', 'notes', noteId)).catch(() => {});
  }
  if (changed) {
    saveDeletedUserKeys(deletedSet);
  }
}

export function cacheDirectoryUsers(users: User[]) {
  for (const u of users) {
    if (!u || isUserDeletedInCloudCache(u)) continue;
    if (u.id) {
      directoryUserCache.set(u.id, u);
      directoryUserCache.set(sanitizeId(u.id, 'u'), u);
    }
    if (u.username) {
      directoryUserCache.set(u.username.toLowerCase(), u);
      directoryUserCache.set(sanitizeUsername(u.username), u);
    }
  }
}

export function clearDirectoryUserCache() {
  directoryUserCache.clear();
}

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
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
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
        auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export async function signOutFirebaseSession(): Promise<void> {
  try {
    if (auth.currentUser) {
      await firebaseSignOut(auth);
    }
  } catch {
    // Ignore sign-out errors
  }
}

function sanitizeId(raw: string | undefined, fallbackPrefix = 'id'): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
  return cleaned.length >= 1 ? cleaned : `${fallbackPrefix}_${Date.now()}`;
}

function sanitizeUsername(raw: string | undefined): string {
  const cleaned = (raw || 'user')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .slice(0, 32);
  return cleaned.length >= 2 ? cleaned : `user_${cleaned || 'member'}`;
}

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string' && val.length > 0) {
    return val;
  }
  return new Date().toISOString();
}

function getStoredLocalUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('aether_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Computes a deterministic direct conversation ID for any pair of users so both
 * sides always write/read the exact same conversationId across instances.
 */
export function getCanonicalDirectConversationId(
  userA?: Partial<User> | string | null,
  userB?: Partial<User> | string | null
): string {
  const extractKey = (u?: Partial<User> | string | null): string => {
    if (!u) return 'peer';
    if (typeof u === 'string') {
      const cached = directoryUserCache.get(u) || directoryUserCache.get(u.toLowerCase());
      if (cached?.username) return sanitizeUsername(cached.username);
      if (u.startsWith('u_')) return sanitizeId(u, 'u');
      return sanitizeUsername(u);
    }
    if (u.username) return sanitizeUsername(u.username);
    if (u.email) return sanitizeUsername(u.email.split('@')[0]);
    if (u.id) {
      const cached = directoryUserCache.get(u.id);
      if (cached?.username) return sanitizeUsername(cached.username);
      return sanitizeId(u.id, 'u');
    }
    return 'peer';
  };

  const keyA = extractKey(userA);
  const keyB = extractKey(userB);
  const sorted = [keyA, keyB].sort();
  return sanitizeId(`c_dm_${sorted[0]}__${sorted[1]}`, 'c');
}

/**
 * Extracts participant directory keys if a conversation ID follows `c_dm_<userA>__<userB>`.
 */
export function parseDirectConversationParticipants(convId: string): string[] {
  if (!convId || !convId.startsWith('c_dm_')) return [];
  const rest = convId.slice('c_dm_'.length);
  const parts = rest.split('__').filter(Boolean);
  return parts.length === 2 ? parts : [];
}

/**
 * Resolves a deterministic, rule-compliant identity key (`userId`) for Firestore paths
 * whether the user authenticated via Google OAuth Popup or Email/Password/Direct Sign-In.
 */
export function resolveDirectoryUserId(user?: Partial<User> | string | null): string | null {
  if (typeof user === 'string') {
    const trimmed = user.trim();
    if (!trimmed) return null;
    const cached = directoryUserCache.get(trimmed) || directoryUserCache.get(trimmed.toLowerCase());
    if (cached?.username) return sanitizeUsername(cached.username);
    if (trimmed.startsWith('u_')) return sanitizeId(trimmed, 'u');
    return sanitizeUsername(trimmed);
  }
  const target = user || getStoredLocalUser();
  if (target?.username) {
    return sanitizeUsername(target.username);
  }
  if (target?.id) {
    const cached = directoryUserCache.get(target.id);
    if (cached?.username) return sanitizeUsername(cached.username);
    return sanitizeId(target.id, 'u');
  }
  if (auth.currentUser?.uid) {
    return sanitizeId(auth.currentUser.uid, 'u');
  }
  return null;
}

/**
 * Resolves a participant's Firestore directory document ID (`/users/{userId}`)
 * even if only their `appUserId` (`u_...`) is known locally.
 */
async function resolveParticipantDirectoryKeys(
  rawIdOrUser?: Partial<User> | string | null
): Promise<{ primaryKey: string; userObj?: Partial<User> } | null> {
  if (!rawIdOrUser) return null;

  if (typeof rawIdOrUser === 'object') {
    if (rawIdOrUser.id || rawIdOrUser.username) {
      cacheDirectoryUsers([rawIdOrUser as User]);
    }
    if (rawIdOrUser.username) {
      return {
        primaryKey: sanitizeUsername(rawIdOrUser.username),
        userObj: rawIdOrUser,
      };
    }
    if (rawIdOrUser.id) {
      const cached = directoryUserCache.get(rawIdOrUser.id);
      if (cached?.username) {
        return {
          primaryKey: sanitizeUsername(cached.username),
          userObj: { ...cached, ...rawIdOrUser },
        };
      }
    }
  }

  const rawId = typeof rawIdOrUser === 'string' ? rawIdOrUser.trim() : rawIdOrUser.id || '';
  if (!rawId) return null;

  const cached = directoryUserCache.get(rawId) || directoryUserCache.get(rawId.toLowerCase());
  if (cached?.username) {
    return {
      primaryKey: sanitizeUsername(cached.username),
      userObj: cached,
    };
  }

  // If rawId is an appUserId like u_12345, query Firestore /users where appUserId == rawId
  if (rawId.startsWith('u_')) {
    try {
      const q = query(
        collection(db, 'users'),
        where('appUserId', '==', sanitizeId(rawId, 'u')),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const d = docSnap.data();
        const foundUser: User = {
          id: String(d.appUserId || docSnap.id),
          username: String(d.username || docSnap.id),
          displayName: String(d.displayName || d.username || docSnap.id),
          email: `${String(d.username || docSnap.id)}@aether.chat`,
          avatarUrl: String(d.avatarUrl || ''),
          onlineStatus: d.isOnline ? 'online' : 'offline',
          isOnline: Boolean(d.isOnline),
          createdAt: toIsoString(d.createdAt),
          role: 'user',
        };
        cacheDirectoryUsers([foundUser]);
        return {
          primaryKey: docSnap.id,
          userObj: foundUser,
        };
      }
    } catch {
      // Fallback below
    }
    return {
      primaryKey: sanitizeId(rawId, 'u'),
      userObj: typeof rawIdOrUser === 'object' ? rawIdOrUser : undefined,
    };
  }

  return {
    primaryKey: sanitizeUsername(rawId),
    userObj: typeof rawIdOrUser === 'object' ? rawIdOrUser : undefined,
  };
}

const inFlightDocWrites = new Map<string, Promise<void>>();

function enqueueFirestoreWrite(pathKey: string, fn: () => Promise<void>): Promise<void> {
  const prev = inFlightDocWrites.get(pathKey) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(fn)
    .finally(() => {
      if (inFlightDocWrites.get(pathKey) === next) {
        inFlightDocWrites.delete(pathKey);
      }
    });
  inFlightDocWrites.set(pathKey, next);
  return next;
}

/**
 * Ensures the target user's root `/users/{userId}` document exists in Firestore
 * (required by subcollection Master Gate rules).
 */
async function ensureUserProfileExists(
  userId: string,
  user?: Partial<User> | null
): Promise<boolean> {
  if (isUserDeletedInCloudCache(userId) || (user && isUserDeletedInCloudCache(user))) {
    return false;
  }
  const cleanUserId = sanitizeId(userId, 'u');
  const userRef = doc(db, 'users', cleanUserId);
  try {
    const snap = await getDocFromServer(userRef).catch(() => getDoc(userRef));
    if (snap.exists()) return true;

    const cleanUsername = sanitizeUsername(
      user?.username ||
        user?.displayName ||
        (cleanUserId.startsWith('u_') ? `user_${cleanUserId.slice(-6)}` : cleanUserId)
    );
    const cleanDisplayName = (
      user?.displayName ||
      user?.username ||
      cleanUsername
    )
      .trim()
      .slice(0, 64);

    const payload: Record<string, unknown> = {
      uid: cleanUserId,
      username: cleanUsername,
      displayName: cleanDisplayName || 'User',
      isOnline: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (user?.id) {
      payload.appUserId = sanitizeId(user.id, 'u');
    }
    if (user?.avatarUrl && user.avatarUrl.length <= 2048) {
      payload.avatarUrl = user.avatarUrl;
    }
    if (user?.bio && user.bio.length <= 256) {
      payload.bio = user.bio;
    }

    try {
      await setDoc(userRef, payload);
      return true;
    } catch {
      const retrySnap = await getDocFromServer(userRef).catch(() => getDoc(userRef));
      return retrySnap.exists();
    }
  } catch {
    return false;
  }
}

/**
 * Syncs an authenticated AetherChat user to the shared Firestore `/users/{userId}` directory
 * and (when Firebase Auth UID matches) `/users/{uid}/private/info`.
 */
export async function syncUserToCloudDirectory(user: User | null | undefined): Promise<void> {
  if (!user || (!user.username && !user.id)) return;
  if (isUserDeletedInCloudCache(user)) return;
  cacheDirectoryUsers([user]);
  const cleanUsername = sanitizeUsername(user.username || user.displayName || user.id);
  if (cleanUsername === 'directory_reader' || cleanUsername === 'guest_viewer') {
    return;
  }

  const userId = resolveDirectoryUserId(user) || cleanUsername;
  const cleanDisplayName = (user.displayName || cleanUsername).trim().slice(0, 64) || 'User';
  const cleanAppUserId = sanitizeId(user.id || userId, 'u');
  const cleanAvatarUrl = (
    user.avatarUrl ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(cleanDisplayName)}`
  )
    .trim()
    .slice(0, 2048);
  const cleanBio = (user.bio || 'Member of the encrypted communications mesh.').trim().slice(0, 256);

  await enqueueFirestoreWrite(`users/${userId}`, async () => {
    const userDocRef = doc(db, 'users', userId);

    const createData: Record<string, unknown> = {
      uid: userId,
      appUserId: cleanAppUserId,
      username: cleanUsername,
      displayName: cleanDisplayName,
      isOnline: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cleanAvatarUrl) createData.avatarUrl = cleanAvatarUrl;
    if (cleanBio) createData.bio = cleanBio;

    const updateData: Record<string, unknown> = {
      appUserId: cleanAppUserId,
      username: cleanUsername,
      displayName: cleanDisplayName,
      isOnline: true,
      updatedAt: serverTimestamp(),
    };
    if (cleanAvatarUrl) updateData.avatarUrl = cleanAvatarUrl;
    if (cleanBio) updateData.bio = cleanBio;

    try {
      const existingSnap = await getDocFromServer(userDocRef).catch(() => getDoc(userDocRef));
      if (!existingSnap.exists()) {
        await setDoc(userDocRef, createData);
      } else {
        await updateDoc(userDocRef, updateData);
      }

      // If user also has a live Firebase Auth session with matching UID, store private info
      const firebaseUid = auth.currentUser?.uid;
      if (
        firebaseUid &&
        firebaseUid === userId &&
        user.email &&
        user.email.length >= 3 &&
        user.email.length <= 128
      ) {
        const privDocRef = doc(db, 'users', firebaseUid, 'private', 'info');
        const privSnap = await getDocFromServer(privDocRef).catch(() => getDoc(privDocRef));
        const cleanPhone = (user.phone || '').trim().slice(0, 32);

        if (!privSnap.exists()) {
          const privCreate: Record<string, unknown> = {
            uid: firebaseUid,
            email: user.email.trim().toLowerCase(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (cleanPhone) privCreate.phone = cleanPhone;
          await setDoc(privDocRef, privCreate);
        } else {
          const privUpdate: Record<string, unknown> = {
            email: user.email.trim().toLowerCase(),
            updatedAt: serverTimestamp(),
          };
          if (cleanPhone) privUpdate.phone = cleanPhone;
          await updateDoc(privDocRef, privUpdate);
        }
      }
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, `users/${userId}`);
      } catch {
        // Non-blocking
      }
    }
  });
}

/**
 * Fetches all registered users from the shared Firestore `/users` directory.
 */
export async function fetchCloudDirectoryUsers(currentUser?: User | null): Promise<User[]> {
  if (currentUser) {
    void syncUserToCloudDirectory(currentUser);
  }

  // Pull global deleted user tombstones from Firebase so deleted accounts stay deleted across all devices
  try {
    const delSnap = await getDocs(
      query(collection(db, 'users', 'nihal_graphix', 'notes'), limit(200))
    );
    delSnap.forEach(d => {
      const data = d.data();
      if (data?.tag === 'deleted_user' && typeof data.content === 'string') {
        const parts = data.content.split('|').map(s => s.trim()).filter(Boolean);
        for (const p of parts) {
          markUserDeletedInCloudCache(p);
        }
      }
    });
  } catch {
    // Ignore tombstone fetch error
  }

  try {
    const q = query(
      collection(db, 'users'),
      limit(100)
    );
    const snap = await getDocs(q);
    const list: User[] = [];

    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (!data || !data.username) return;
      const username = String(data.username);
      if (username === 'directory_reader' || username === 'guest_viewer') return;

      const resolvedId =
        typeof data.appUserId === 'string' && data.appUserId.length > 0
          ? data.appUserId
          : docSnap.id;

      if (
        isUserDeletedInCloudCache(docSnap.id) ||
        isUserDeletedInCloudCache(resolvedId) ||
        isUserDeletedInCloudCache(username)
      ) {
        return;
      }

      list.push({
        id: resolvedId,
        username,
        displayName: String(data.displayName || username),
        email: `${username.toLowerCase()}@aether.chat`,
        avatarUrl:
          typeof data.avatarUrl === 'string' && data.avatarUrl.length > 0
            ? data.avatarUrl
            : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                String(data.displayName || username)
              )}`,
        bio:
          typeof data.bio === 'string' && data.bio.length > 0
            ? data.bio
            : 'Member of the encrypted communications mesh.',
        onlineStatus: data.isOnline ? 'online' : 'offline',
        isOnline: Boolean(data.isOnline),
        createdAt: toIsoString(data.createdAt),
        role: 'user',
      });
    });

    cacheDirectoryUsers(list);
    return list;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.LIST, 'users');
    } catch {
      // Non-blocking fallback
    }
    return [];
  }
}

/**
 * Helper to write a single conversation document into a specific user's
 * `/users/{ownerKey}/conversations/{convId}` collection in Firestore.
 */
async function writeConversationDocForUser(params: {
  ownerKey: string;
  ownerUser?: Partial<User> | null;
  convId: string;
  type: 'direct' | 'group';
  name: string;
  description?: string;
  avatarUrl?: string;
  lastMessageText?: string;
  memberIds: string[];
}): Promise<void> {
  const {
    ownerKey,
    ownerUser,
    convId,
    type,
    name,
    description,
    avatarUrl,
    lastMessageText,
    memberIds,
  } = params;

  const pathKey = `users/${ownerKey}/conversations/${convId}`;
  await enqueueFirestoreWrite(pathKey, async () => {
    if (isUserDeletedInCloudCache(ownerKey) || (ownerUser && isUserDeletedInCloudCache(ownerUser))) {
      return;
    }
    const hasProfile = await ensureUserProfileExists(ownerKey, ownerUser);
    if (!hasProfile) return;

    const convRef = doc(db, 'users', ownerKey, 'conversations', convId);
    const cleanName = (name || 'Direct Chat').trim().slice(0, 128) || 'Direct Chat';
    const cleanDescription = (description || '').trim().slice(0, 512);
    const cleanAvatarUrl = (avatarUrl || '').trim().slice(0, 2048);
    const cleanLastMsg = (lastMessageText || '').trim().slice(0, 1000);
    const cleanMemberIds = Array.from(new Set(memberIds.filter(Boolean))).slice(0, 50);

    const createPayload: Record<string, unknown> = {
      ownerId: ownerKey,
      convId,
      type,
      name: cleanName,
      memberIds: cleanMemberIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cleanDescription) createPayload.description = cleanDescription;
    if (cleanAvatarUrl) createPayload.avatarUrl = cleanAvatarUrl;
    if (cleanLastMsg) createPayload.lastMessageText = cleanLastMsg;

    const updatePayload: Record<string, unknown> = {
      name: cleanName,
      memberIds: cleanMemberIds,
      updatedAt: serverTimestamp(),
    };
    if (cleanDescription) updatePayload.description = cleanDescription;
    if (cleanAvatarUrl) updatePayload.avatarUrl = cleanAvatarUrl;
    if (cleanLastMsg) updatePayload.lastMessageText = cleanLastMsg;

    try {
      const snap = await getDocFromServer(convRef).catch(() => getDoc(convRef));
      if (!snap.exists()) {
        await setDoc(convRef, createPayload);
      } else {
        await updateDoc(convRef, updatePayload);
      }
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, pathKey);
      } catch {
        // Non-blocking
      }
    }
  });
}

/**
 * Persists a conversation record to `/users/{userId}/conversations/{convId}` in Firestore
 * for BOTH the current user AND all other members of the conversation so recipients
 * discover the conversation immediately across devices and deployments.
 */
export async function syncConversationToFirestore(
  conv: Conversation,
  currentUser?: User | null
): Promise<void> {
  if (!conv || !conv.id || conv.type === 'channel') return;
  const senderUser = currentUser || getStoredLocalUser();
  if (senderUser) cacheDirectoryUsers([senderUser]);

  const senderKey = resolveDirectoryUserId(senderUser);
  if (!senderKey) return;

  const convId = sanitizeId(conv.id, 'c');
  const cleanType: 'direct' | 'group' = conv.type === 'group' ? 'group' : 'direct';
  const cleanLastMsg = (conv.lastMessage?.content || '').trim().slice(0, 1000);

  // Resolve all participants
  const participantMap = new Map<string, Partial<User> | undefined>();
  participantMap.set(senderKey, senderUser || undefined);

  for (const m of conv.members || []) {
    if (m.user) cacheDirectoryUsers([m.user]);
    const resolved = await resolveParticipantDirectoryKeys(m.user || m.userId);
    if (resolved?.primaryKey) {
      participantMap.set(resolved.primaryKey, resolved.userObj || m.user);
    }
  }

  for (const dmUser of parseDirectConversationParticipants(convId)) {
    if (!participantMap.has(dmUser)) {
      const cached = directoryUserCache.get(dmUser);
      participantMap.set(dmUser, cached);
    }
  }

  // Canonical list of member keys & IDs
  const memberIds = Array.from(
    new Set([
      ...Array.from(participantMap.keys()),
      ...(conv.members || [])
        .map(m => m.userId || m.user?.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ])
  ).slice(0, 50);

  await Promise.all(
    Array.from(participantMap.entries()).map(async ([ownerKey, ownerUser]) => {
      let targetName = conv.name || 'Direct Chat';
      let targetAvatar = conv.avatarUrl || '';

      if (cleanType === 'direct') {
        // If writing to a recipient's conversation list, display the OTHER participant's name & avatar
        if (ownerKey !== senderKey && senderUser) {
          targetName = senderUser.displayName || senderUser.username || targetName;
          targetAvatar =
            senderUser.avatarUrl ||
            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(targetName)}`;
        } else if (ownerKey === senderKey) {
          const otherEntry = Array.from(participantMap.entries()).find(([k]) => k !== senderKey);
          const otherUser = otherEntry?.[1];
          if (otherUser?.displayName) {
            targetName = otherUser.displayName;
          }
          if (otherUser?.avatarUrl) {
            targetAvatar = otherUser.avatarUrl;
          }
        }
      }

      await writeConversationDocForUser({
        ownerKey,
        ownerUser,
        convId,
        type: cleanType,
        name: targetName,
        description: conv.description,
        avatarUrl: targetAvatar,
        lastMessageText: cleanLastMsg,
        memberIds,
      });
    })
  );
}

/**
 * Helper to convert Firestore conversation document snapshot into a Conversation object.
 */
function parseFirestoreConversationDoc(
  d: Record<string, any>,
  userId: string,
  currentUser?: User | null,
  knownUsers: User[] = []
): Conversation | null {
  if (!d || !d.convId) return null;
  const convId = String(d.convId);
  const rawMemberIds: string[] = Array.isArray(d.memberIds) ? d.memberIds.map(String) : [];
  const dmParticipants = parseDirectConversationParticipants(convId);
  const combinedMemberIds = Array.from(new Set([...rawMemberIds, ...dmParticipants]));

  // If this is a direct conversation involving a deleted user, skip it so it does not resurrect the deleted user
  if (d.type !== 'group') {
    for (const mId of combinedMemberIds) {
      const isSelf =
        mId === userId ||
        sanitizeUsername(mId) === userId ||
        Boolean(currentUser && (mId === currentUser.id || sanitizeUsername(mId) === sanitizeUsername(currentUser.username)));
      if (!isSelf && isUserDeletedInCloudCache(mId)) {
        return null;
      }
    }
  }

  const createdAtIso = toIsoString(d.createdAt);
  const updatedAtIso = toIsoString(d.updatedAt);

  // Deduplicate members by resolved user identity
  const seenUserKeys = new Set<string>();
  const members: Conversation['members'] = [];

  for (let idx = 0; idx < combinedMemberIds.length; idx++) {
    const mUserId = combinedMemberIds[idx];
    const cleanMKey = sanitizeUsername(mUserId);
    const isSelf =
      mUserId === userId ||
      cleanMKey === userId ||
      Boolean(currentUser && (mUserId === currentUser.id || cleanMKey === sanitizeUsername(currentUser.username)));

    let matchedUser: User | undefined = isSelf
      ? currentUser || directoryUserCache.get(userId)
      : knownUsers.find(
          u =>
            u.id === mUserId ||
            sanitizeUsername(u.username) === cleanMKey ||
            u.username.toLowerCase() === mUserId.toLowerCase()
        ) ||
        directoryUserCache.get(mUserId) ||
        directoryUserCache.get(cleanMKey);

    const dedupeKey = matchedUser?.username
      ? sanitizeUsername(matchedUser.username)
      : isSelf
      ? userId
      : cleanMKey;

    if (seenUserKeys.has(dedupeKey)) continue;
    seenUserKeys.add(dedupeKey);

    if (!matchedUser && !isSelf && d.type !== 'group') {
      const fallbackName = String(d.name || mUserId);
      const fallbackUsername = mUserId.startsWith('u_')
        ? sanitizeUsername(fallbackName)
        : cleanMKey;
      matchedUser = {
        id: mUserId,
        username: fallbackUsername,
        displayName: fallbackName,
        email: `${fallbackUsername}@aether.chat`,
        avatarUrl:
          typeof d.avatarUrl === 'string' && d.avatarUrl.length > 0
            ? d.avatarUrl
            : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(fallbackName)}`,
        onlineStatus: 'online',
        isOnline: true,
        createdAt: createdAtIso,
        role: 'user',
      };
    }

    members.push({
      id: `cm_${convId}_${idx}`,
      conversationId: convId,
      userId: matchedUser?.id || (isSelf && currentUser ? currentUser.id : mUserId),
      user: matchedUser,
      role: (isSelf ? 'owner' : 'member') as 'owner' | 'member',
      permissions: {
        canSendMessages: true,
        canAddMembers: true,
        canPinMessages: true,
        canDeleteMessages: true,
        canManageCalls: true,
      },
      joinedAt: createdAtIso,
    });
  }

  return {
    id: convId,
    type: d.type === 'group' ? 'group' : 'direct',
    name: String(d.name || 'Chat'),
    description: typeof d.description === 'string' ? d.description : undefined,
    avatarUrl: typeof d.avatarUrl === 'string' ? d.avatarUrl : undefined,
    isPrivate: true,
    isEncrypted: true,
    createdAt: createdAtIso,
    createdBy: currentUser?.id || userId,
    members,
    lastMessage:
      typeof d.lastMessageText === 'string' && d.lastMessageText.length > 0
        ? {
            id: `m_preview_${convId}`,
            conversationId: convId,
            senderId: currentUser?.id || userId,
            content: d.lastMessageText,
            type: 'text',
            reactions: [],
            status: 'sent',
            createdAt: updatedAtIso,
          }
        : undefined,
  };
}

/**
 * Loads persisted conversations for the current user from `/users/{userId}/conversations`.
 */
export async function fetchConversationsFromFirestore(
  currentUser?: User | null,
  knownUsers: User[] = []
): Promise<Conversation[]> {
  if (knownUsers.length > 0) cacheDirectoryUsers(knownUsers);
  const userId = resolveDirectoryUserId(currentUser);
  if (!userId) return [];

  try {
    const q = query(
      collection(db, 'users', userId, 'conversations'),
      limit(100)
    );
    const snap = await getDocs(q);
    const list: Conversation[] = [];

    snap.forEach(docSnap => {
      const conv = parseFirestoreConversationDoc(
        docSnap.data(),
        userId,
        currentUser,
        knownUsers
      );
      if (conv) list.push(conv);
    });

    return list;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.LIST, `users/${userId}/conversations`);
    } catch {
      // Non-blocking
    }
    return [];
  }
}

/**
 * Real-time listener for the current user's `/users/{userId}/conversations` collection.
 */
export function subscribeToConversationsFromFirestore(
  currentUser: User | null | undefined,
  knownUsers: User[],
  onUpdate: (conversations: Conversation[]) => void
): () => void {
  if (!currentUser) return () => {};
  if (knownUsers.length > 0) cacheDirectoryUsers(knownUsers);
  const userId = resolveDirectoryUserId(currentUser);
  if (!userId) return () => {};

  const q = query(
    collection(db, 'users', userId, 'conversations'),
    limit(100)
  );

  return onSnapshot(
    q,
    snap => {
      const list: Conversation[] = [];
      snap.forEach(docSnap => {
        const conv = parseFirestoreConversationDoc(
          docSnap.data(),
          userId,
          currentUser,
          knownUsers
        );
        if (conv) list.push(conv);
      });
      onUpdate(list);
    },
    () => {
      // Ignore snapshot listener permission/offline error
    }
  );
}

/**
 * Helper to write a message document into a specific participant's
 * `/users/{ownerKey}/messages/{msgId}` collection in Firestore.
 */
async function writeMessageDocForUser(params: {
  ownerKey: string;
  ownerUser?: Partial<User> | null;
  msgId: string;
  convId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: string;
  status: 'sending' | 'sent' | 'delivered' | 'read';
  mediaUrl?: string;
  fileName?: string;
}): Promise<void> {
  const {
    ownerKey,
    ownerUser,
    msgId,
    convId,
    senderId,
    senderName,
    content,
    type,
    status,
    mediaUrl,
    fileName,
  } = params;

  const pathKey = `users/${ownerKey}/messages/${msgId}`;
  await enqueueFirestoreWrite(pathKey, async () => {
    if (isUserDeletedInCloudCache(ownerKey) || (ownerUser && isUserDeletedInCloudCache(ownerUser))) {
      return;
    }
    const hasProfile = await ensureUserProfileExists(ownerKey, ownerUser);
    if (!hasProfile) return;

    const msgRef = doc(db, 'users', ownerKey, 'messages', msgId);
    const createPayload: Record<string, unknown> = {
      ownerId: ownerKey,
      msgId,
      conversationId: convId,
      senderId,
      senderName,
      content,
      type,
      status,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (mediaUrl && mediaUrl.length <= 200000) {
      createPayload.mediaUrl = mediaUrl;
    }
    if (fileName && fileName.length <= 256) {
      createPayload.fileName = fileName;
    }

    const updatePayload: Record<string, unknown> = {
      content,
      status,
      updatedAt: serverTimestamp(),
    };

    try {
      const snap = await getDocFromServer(msgRef).catch(() => getDoc(msgRef));
      if (!snap.exists()) {
        await setDoc(msgRef, createPayload);
      } else {
        await updateDoc(msgRef, updatePayload);
      }
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, pathKey);
      } catch {
        // Non-blocking
      }
    }
  });
}

/**
 * Persists a chat message to `/users/{userId}/messages/{msgId}` in Firestore
 * for BOTH the sender AND all conversation recipients, and updates each recipient's
 * `/users/{recipientKey}/conversations/{convId}` preview so the message arrives in real time.
 */
export async function syncMessageToFirestore(
  msg: Message,
  currentUser?: User | null,
  conversation?: Conversation | null
): Promise<void> {
  if (!msg || !msg.id || !msg.conversationId) return;
  const senderUser = msg.sender || currentUser || getStoredLocalUser();
  if (senderUser) cacheDirectoryUsers([senderUser as User]);
  if (currentUser) cacheDirectoryUsers([currentUser]);

  const senderKey =
    resolveDirectoryUserId(msg.sender || msg.senderId) ||
    resolveDirectoryUserId(senderUser);
  if (!senderKey) return;

  const msgId = sanitizeId(msg.id, 'm');
  let convId = sanitizeId(msg.conversationId, 'c');
  // Always store the sender's canonical directory key so both sender & receiver identify the author accurately
  const senderId = sanitizeId(senderKey, 'u');
  const senderName = (
    msg.sender?.displayName ||
    senderUser?.displayName ||
    senderUser?.username ||
    'User'
  )
    .trim()
    .slice(0, 64) || 'User';
  const content = (msg.content || '').slice(0, 4000);
  const type = (msg.type || 'text').slice(0, 32);
  const status: 'sending' | 'sent' | 'delivered' | 'read' =
    msg.status === 'sending' || msg.status === 'delivered' || msg.status === 'read'
      ? msg.status
      : 'sent';

  const voiceDur = msg.voiceDuration || msg.duration;
  const effectiveFileName =
    msg.fileName ||
    (type === 'voice' && voiceDur ? `voice_${Math.max(1, Math.round(voiceDur))}s.webm` : undefined);

  // Discover all recipient keys for this conversation
  const participantMap = new Map<string, Partial<User> | undefined>();
  participantMap.set(senderKey, senderUser || undefined);

  if (conversation?.members) {
    for (const m of conversation.members) {
      if (m.user) cacheDirectoryUsers([m.user]);
      const resolved = await resolveParticipantDirectoryKeys(m.user || m.userId);
      if (resolved?.primaryKey) {
        participantMap.set(resolved.primaryKey, resolved.userObj || m.user);
      }
    }
  }

  for (const dmUser of parseDirectConversationParticipants(convId)) {
    const resolvedDm = await resolveParticipantDirectoryKeys(dmUser);
    const dmKey = resolvedDm?.primaryKey || dmUser;
    if (!participantMap.has(dmKey)) {
      const cached = resolvedDm?.userObj || directoryUserCache.get(dmKey) || directoryUserCache.get(dmUser);
      participantMap.set(dmKey, cached);
    }
  }

  // If we only have the sender so far, inspect sender's conversation doc in Firestore to find memberIds
  if (participantMap.size <= 1) {
    try {
      const senderConvSnap = await getDoc(doc(db, 'users', senderKey, 'conversations', convId));
      if (senderConvSnap.exists()) {
        const d = senderConvSnap.data();
        const rawMembers: string[] = Array.isArray(d?.memberIds) ? d.memberIds.map(String) : [];
        for (const rawM of rawMembers) {
          const resolved = await resolveParticipantDirectoryKeys(rawM);
          if (resolved?.primaryKey && !participantMap.has(resolved.primaryKey)) {
            participantMap.set(resolved.primaryKey, resolved.userObj);
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  // If this is a 2-participant direct chat, ensure canonical c_dm_<userA>__<userB> is used
  const convType: 'direct' | 'group' = conversation?.type === 'group' ? 'group' : 'direct';
  const participantKeys = Array.from(participantMap.keys());
  if (convType === 'direct' && participantKeys.length === 2) {
    const sorted = [...participantKeys].sort();
    convId = sanitizeId(`c_dm_${sorted[0]}__${sorted[1]}`, 'c');
  }

  const allMemberIds = Array.from(
    new Set([
      ...participantKeys,
      ...(conversation?.members || [])
        .map(m => m.userId || m.user?.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ])
  ).slice(0, 50);

  const previewText = (content || (type === 'voice' ? 'Voice message' : `Sent a ${type}`)).slice(0, 1000);

  await Promise.all(
    Array.from(participantMap.entries()).map(async ([targetKey, targetUserObj]) => {
      await writeMessageDocForUser({
        ownerKey: targetKey,
        ownerUser: targetUserObj,
        msgId,
        convId,
        senderId,
        senderName,
        content,
        type,
        status,
        mediaUrl: msg.mediaUrl,
        fileName: effectiveFileName,
      });

      // Also ensure/update the conversation preview document for every participant
      const isRecipient = targetKey !== senderKey;
      let convName = conversation?.name || senderName;
      let convAvatar = conversation?.avatarUrl || '';

      if (convType === 'direct') {
        if (isRecipient) {
          convName = senderName;
          convAvatar =
            senderUser?.avatarUrl ||
            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(senderName)}`;
        } else {
          const otherEntry = Array.from(participantMap.entries()).find(([k]) => k !== senderKey);
          const otherUser = otherEntry?.[1];
          if (otherUser?.displayName) convName = otherUser.displayName;
          if (otherUser?.avatarUrl) convAvatar = otherUser.avatarUrl;
        }
      }

      await writeConversationDocForUser({
        ownerKey: targetKey,
        ownerUser: targetUserObj,
        convId,
        type: convType,
        name: convName,
        description: conversation?.description,
        avatarUrl: convAvatar,
        lastMessageText: previewText,
        memberIds: allMemberIds,
      });
    })
  );
}

/**
 * Deletes a message from `/users/{userId}/messages/{msgId}` in Firestore.
 */
export async function deleteMessageFromFirestore(messageId: string): Promise<void> {
  const userId = resolveDirectoryUserId();
  if (!userId) return;
  const msgId = sanitizeId(messageId, 'm');
  try {
    const ref = doc(db, 'users', userId, 'messages', msgId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await deleteDoc(ref);
    }
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.DELETE, `users/${userId}/messages/${msgId}`);
    } catch {
      // Non-blocking
    }
  }
}

/**
 * Clears all messages belonging to a conversation from `/users/{userId}/messages` in Firestore.
 */
export async function clearConversationMessagesFromFirestore(conversationId: string): Promise<void> {
  const userId = resolveDirectoryUserId();
  if (!userId) return;
  const cleanConvId = sanitizeId(conversationId, 'c');
  try {
    const q = query(
      collection(db, 'users', userId, 'messages'),
      limit(200)
    );
    const snap = await getDocs(q);
    const matchingDocs = snap.docs.filter(d => d.data()?.conversationId === cleanConvId);
    await Promise.all(
      matchingDocs.map(d =>
        deleteDoc(doc(db, 'users', userId, 'messages', d.id)).catch(() => {})
      )
    );
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.DELETE, `users/${userId}/messages`);
    } catch {
      // Non-blocking
    }
  }
}

/**
 * Deletes a conversation and its messages from `/users/{userId}/conversations/{convId}` in Firestore.
 */
export async function deleteConversationFromFirestore(conversationId: string): Promise<void> {
  const userId = resolveDirectoryUserId();
  if (!userId) return;
  const cleanConvId = sanitizeId(conversationId, 'c');
  try {
    const convRef = doc(db, 'users', userId, 'conversations', cleanConvId);
    const convSnap = await getDoc(convRef);
    await Promise.all([
      convSnap.exists() ? deleteDoc(convRef).catch(() => {}) : Promise.resolve(),
      clearConversationMessagesFromFirestore(conversationId),
    ]);
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.DELETE, `users/${userId}/conversations/${cleanConvId}`);
    } catch {
      // Non-blocking
    }
  }
}

function parseFirestoreMessageDoc(
  d: Record<string, any>,
  defaultOwnerId: string,
  knownUsers: User[] = []
): Message | null {
  if (!d || !d.msgId) return null;
  const rawSenderId = String(d.senderId || defaultOwnerId);
  const senderName = String(d.senderName || 'User');
  const cleanSenderUsername = sanitizeUsername(
    rawSenderId.startsWith('u_') ? senderName : rawSenderId
  );
  if (
    isUserDeletedInCloudCache(rawSenderId) ||
    isUserDeletedInCloudCache(cleanSenderUsername)
  ) {
    return null;
  }

  const localSelf = getStoredLocalUser();
  const allCandidates = localSelf ? [localSelf, ...knownUsers] : knownUsers;

  const senderUser: User =
    allCandidates.find(
      u =>
        u.id === rawSenderId ||
        sanitizeId(u.id, 'u') === rawSenderId ||
        sanitizeUsername(u.username) === rawSenderId.toLowerCase() ||
        sanitizeUsername(u.username) === cleanSenderUsername ||
        u.displayName.toLowerCase() === senderName.toLowerCase()
    ) ||
    directoryUserCache.get(rawSenderId) ||
    directoryUserCache.get(cleanSenderUsername) || {
      id: rawSenderId,
      username: cleanSenderUsername,
      displayName: senderName,
      email: `${cleanSenderUsername}@aether.chat`,
      avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(senderName)}`,
      onlineStatus: 'online',
      isOnline: true,
      createdAt: toIsoString(d.createdAt),
      role: 'user',
    };

  let voiceDuration: number | undefined;
  const fileName = typeof d.fileName === 'string' ? d.fileName : undefined;
  if (d.type === 'voice' && fileName) {
    const match = fileName.match(/^voice_(\d+)s/);
    if (match && match[1]) {
      voiceDuration = parseInt(match[1], 10);
    }
  }

  return {
    id: String(d.msgId),
    conversationId: String(d.conversationId),
    senderId: senderUser.id || rawSenderId,
    sender: senderUser,
    content: String(d.content || ''),
    type: (d.type as Message['type']) || 'text',
    mediaUrl: typeof d.mediaUrl === 'string' ? d.mediaUrl : undefined,
    fileName,
    duration: voiceDuration,
    voiceDuration,
    reactions: [],
    status: (d.status as Message['status']) || 'sent',
    createdAt: toIsoString(d.createdAt),
  };
}

function doesFirestoreMessageMatchConversation(
  d: Record<string, any>,
  cleanConvId: string,
  ownerKeys: Set<string>,
  isDirectChat: boolean
): boolean {
  if (!d || !d.conversationId) return false;
  const msgConvId = String(d.conversationId);
  if (msgConvId === cleanConvId) return true;

  if (isDirectChat && ownerKeys.size === 2) {
    const msgDmParts = parseDirectConversationParticipants(msgConvId);
    if (msgDmParts.length === 2) {
      const resolvedParts = msgDmParts.map(
        p => resolveDirectoryUserId(p) || sanitizeUsername(p)
      );
      if (resolvedParts.every(rp => ownerKeys.has(rp))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Fetches persisted messages for a conversation from `/users/{userId}/messages`
 * AND (when peer keys are known) merges messages from `/users/{peerKey}/messages`
 * so both sides see the full conversation history.
 */
export async function fetchMessagesFromFirestore(
  conversationId: string,
  knownUsers: User[] = [],
  conversation?: Conversation | null
): Promise<Message[]> {
  if (knownUsers.length > 0) cacheDirectoryUsers(knownUsers);
  const localSelf = getStoredLocalUser();
  if (localSelf) cacheDirectoryUsers([localSelf]);
  const userId = resolveDirectoryUserId(localSelf);
  if (!userId) return [];

  const cleanConvId = sanitizeId(conversationId, 'c');
  const ownerKeys = new Set<string>([userId]);

  for (const dmUser of parseDirectConversationParticipants(cleanConvId)) {
    const resolved = resolveDirectoryUserId(dmUser) || dmUser;
    ownerKeys.add(resolved);
  }
  if (conversation?.members) {
    for (const m of conversation.members) {
      const key = resolveDirectoryUserId(m.user || m.userId);
      if (key) ownerKeys.add(key);
    }
  }

  const isDirectChat =
    conversation?.type === 'direct' || cleanConvId.startsWith('c_dm_');

  try {
    const snapshots = await Promise.all(
      Array.from(ownerKeys).map(ownerKey =>
        getDocs(
          query(
            collection(db, 'users', ownerKey, 'messages'),
            limit(200)
          )
        ).catch(() => null)
      )
    );

    const byId = new Map<string, Message>();
    for (const snap of snapshots) {
      if (!snap) continue;
      snap.forEach(docSnap => {
        const rawData = docSnap.data();
        if (!doesFirestoreMessageMatchConversation(rawData, cleanConvId, ownerKeys, isDirectChat)) {
          return;
        }
        const msg = parseFirestoreMessageDoc(rawData, userId, knownUsers);
        if (msg && msg.id) {
          msg.conversationId = conversationId;
          byId.set(msg.id, msg);
        }
      });
    }

    const list = Array.from(byId.values());
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return list;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.LIST, `users/${userId}/messages`);
    } catch {
      // Non-blocking
    }
    return [];
  }
}

/**
 * Real-time listener for messages in an active conversation across both the current user's
 * and peer participants' `/users/{ownerKey}/messages` subcollections.
 */
export function subscribeToMessagesFromFirestore(
  conversationId: string,
  currentUser: User | null | undefined,
  knownUsers: User[],
  conversation: Conversation | null | undefined,
  onUpdate: (messages: Message[]) => void
): () => void {
  if (!conversationId || !currentUser) return () => {};
  if (knownUsers.length > 0) cacheDirectoryUsers(knownUsers);
  cacheDirectoryUsers([currentUser]);
  const userId = resolveDirectoryUserId(currentUser);
  if (!userId) return () => {};

  const cleanConvId = sanitizeId(conversationId, 'c');
  const ownerKeys = new Set<string>([userId]);

  for (const dmUser of parseDirectConversationParticipants(cleanConvId)) {
    const resolved = resolveDirectoryUserId(dmUser) || dmUser;
    ownerKeys.add(resolved);
  }
  if (conversation?.members) {
    for (const m of conversation.members) {
      const key = resolveDirectoryUserId(m.user || m.userId);
      if (key) ownerKeys.add(key);
    }
  }

  const isDirectChat =
    conversation?.type === 'direct' || cleanConvId.startsWith('c_dm_');

  const messagesByOwner = new Map<string, Map<string, Message>>();

  const emitMerged = () => {
    const mergedMap = new Map<string, Message>();
    for (const ownerMap of messagesByOwner.values()) {
      for (const [mId, msg] of ownerMap.entries()) {
        mergedMap.set(mId, msg);
      }
    }
    const list = Array.from(mergedMap.values());
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    onUpdate(list);
  };

  const unsubscribers = Array.from(ownerKeys).map(ownerKey => {
    const q = query(
      collection(db, 'users', ownerKey, 'messages'),
      limit(200)
    );
    return onSnapshot(
      q,
      snap => {
        const ownerMap = new Map<string, Message>();
        snap.forEach(docSnap => {
          const rawData = docSnap.data();
          if (!doesFirestoreMessageMatchConversation(rawData, cleanConvId, ownerKeys, isDirectChat)) {
            return;
          }
          const msg = parseFirestoreMessageDoc(rawData, ownerKey, knownUsers);
          if (msg && msg.id) {
            msg.conversationId = conversationId;
            ownerMap.set(msg.id, msg);
          }
        });
        messagesByOwner.set(ownerKey, ownerMap);
        emitMerged();
      },
      () => {
        // Ignore snapshot error
      }
    );
  });

  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
}

/**
 * Stores an uploaded file in Firestore `/users/{userId}/files/{fileId}` so attachments
 * and media are backed up in cloud storage.
 */
export async function uploadFileToFirestore(
  file: File,
  dataUrl: string,
  currentUser?: User | null
): Promise<string | null> {
  if (!dataUrl || dataUrl.length > 750000) return null;
  const userId = resolveDirectoryUserId(currentUser);
  if (!userId) return null;

  const hasProfile = await ensureUserProfileExists(userId, currentUser);
  if (!hasProfile) return null;

  const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const fileRef = doc(db, 'users', userId, 'files', fileId);

  try {
    await setDoc(fileRef, {
      ownerId: userId,
      fileId,
      fileName: (file.name || 'attachment').slice(0, 256),
      mimeType: (file.type || 'application/octet-stream').slice(0, 128),
      sizeBytes: Math.min(Math.max(0, Math.floor(file.size || 0)), 5000000),
      dataUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return fileId;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.CREATE, `users/${userId}/files/${fileId}`);
    } catch {
      // Non-blocking
    }
    return null;
  }
}

/**
 * Syncs a story to the shared `/stories/{storyId}` collection in Firestore.
 */
export async function syncStoryToFirestore(
  story: Story,
  currentUser?: User | null
): Promise<void> {
  if (!story || !story.id) return;
  const userId = resolveDirectoryUserId(currentUser);
  if (!userId) return;

  const storyId = sanitizeId(story.id, 's');
  const storyRef = doc(db, 'stories', storyId);
  const authorId = sanitizeId(story.userId || currentUser?.id || userId, 'u');
  const authorName = (
    story.user?.displayName ||
    currentUser?.displayName ||
    'User'
  )
    .trim()
    .slice(0, 64) || 'User';
  const authorAvatar = (story.user?.avatarUrl || currentUser?.avatarUrl || '').trim().slice(0, 2048);
  const cleanType = story.type === 'image' ? 'image' : 'text';
  const cleanText = (story.text || '').slice(0, 1000);
  const cleanMedia = (story.mediaUrl || '').slice(0, 200000);
  const cleanBg = (story.background || '#111111').slice(0, 128);

  try {
    const snap = await getDoc(storyRef);
    if (!snap.exists()) {
      const payload: Record<string, unknown> = {
        authorUid: userId,
        storyId,
        authorId,
        authorName,
        type: cleanType,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (authorAvatar) payload.authorAvatar = authorAvatar;
      if (cleanText) payload.text = cleanText;
      if (cleanMedia) payload.mediaUrl = cleanMedia;
      if (cleanBg) payload.background = cleanBg;

      await setDoc(storyRef, payload);
    } else if (snap.data()?.authorUid === userId) {
      const updatePayload: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      if (cleanText) updatePayload.text = cleanText;
      if (cleanMedia) updatePayload.mediaUrl = cleanMedia;
      if (cleanBg) updatePayload.background = cleanBg;

      await updateDoc(storyRef, updatePayload);
    }
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, `stories/${storyId}`);
    } catch {
      // Non-blocking
    }
  }
}

/**
 * Deletes a story from `/stories/{storyId}` in Firestore.
 */
export async function deleteStoryFromFirestore(storyId: string): Promise<void> {
  const cleanId = sanitizeId(storyId, 's');
  try {
    const storyRef = doc(db, 'stories', cleanId);
    const snap = await getDoc(storyRef);
    if (snap.exists()) {
      await deleteDoc(storyRef);
    }
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.DELETE, `stories/${cleanId}`);
    } catch {
      // Non-blocking
    }
  }
}

/**
 * Fetches shared stories from `/stories` in Firestore.
 */
export async function fetchStoriesFromFirestore(): Promise<Story[]> {
  try {
    const q = query(
      collection(db, 'stories'),
      where('type', 'in', ['text', 'image']),
      limit(50)
    );
    const snap = await getDocs(q);
    const list: Story[] = [];

    snap.forEach(docSnap => {
      const d = docSnap.data();
      if (!d || !d.storyId) return;
      const createdAtIso = toIsoString(d.createdAt);
      const expiresAtIso = new Date(new Date(createdAtIso).getTime() + 86400000).toISOString();
      const authorId = String(d.authorId || d.authorUid);
      const authorName = String(d.authorName || 'User');
      if (
        isUserDeletedInCloudCache(authorId) ||
        isUserDeletedInCloudCache(String(d.authorUid || '')) ||
        isUserDeletedInCloudCache(authorName)
      ) {
        return;
      }

      list.push({
        id: String(d.storyId),
        userId: authorId,
        user: {
          id: authorId,
          username: sanitizeUsername(authorName),
          displayName: authorName,
          email: '',
          avatarUrl:
            typeof d.authorAvatar === 'string' && d.authorAvatar.length > 0
              ? d.authorAvatar
              : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(authorName)}`,
          onlineStatus: 'online',
          isOnline: true,
          createdAt: createdAtIso,
          role: 'user',
        },
        type: d.type === 'image' ? 'image' : 'text',
        text: typeof d.text === 'string' ? d.text : undefined,
        mediaUrl: typeof d.mediaUrl === 'string' ? d.mediaUrl : undefined,
        background: typeof d.background === 'string' ? d.background : '#111111',
        viewers: [],
        createdAt: createdAtIso,
        expiresAt: expiresAtIso,
      });
    });

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.LIST, 'stories');
    } catch {
      // Non-blocking
    }
    return [];
  }
}

export async function deleteUserFromFirestore(userOrId: Partial<User> | string): Promise<void> {
  if (!userOrId) return;
  markUserDeletedInCloudCache(userOrId);

  const candidateKeys = new Set<string>(extractCandidateKeysForUser(userOrId));

  if (typeof userOrId === 'string') {
    const clean = userOrId.trim();
    if (clean) {
      candidateKeys.add(sanitizeUsername(clean));
      candidateKeys.add(sanitizeId(clean, 'u'));
    }
  } else {
    const resolved = resolveDirectoryUserId(userOrId);
    if (resolved) candidateKeys.add(resolved);
    if (userOrId.username) {
      candidateKeys.add(sanitizeUsername(userOrId.username));
    }
    if (userOrId.id) {
      candidateKeys.add(sanitizeId(userOrId.id, 'u'));
    }
    if (userOrId.email) {
      const prefix = userOrId.email.split('@')[0];
      if (prefix) candidateKeys.add(sanitizeUsername(prefix));
      candidateKeys.add(sanitizeUsername(userOrId.email));
    }
  }

  for (const key of candidateKeys) {
    directoryUserCache.delete(key);
  }

  const existingDocIdsToDelete = new Set<string>();
  const otherUserDocIds = new Set<string>();

  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(100)));
    snap.forEach(d => {
      const data = d.data();
      const docAppUserId = data?.appUserId ? sanitizeId(String(data.appUserId), 'u') : '';
      const docUsername = data?.username ? sanitizeUsername(String(data.username)) : '';
      if (
        candidateKeys.has(d.id) ||
        (docAppUserId && candidateKeys.has(docAppUserId)) ||
        (docUsername && candidateKeys.has(docUsername))
      ) {
        existingDocIdsToDelete.add(d.id);
        if (docAppUserId) candidateKeys.add(docAppUserId);
        if (docUsername) candidateKeys.add(docUsername);
      } else {
        otherUserDocIds.add(d.id);
      }
    });
  } catch {
    for (const uid of candidateKeys) {
      if (!uid) continue;
      try {
        const docSnap = await getDoc(doc(db, 'users', uid));
        if (docSnap.exists()) {
          existingDocIdsToDelete.add(uid);
        }
      } catch {
        // Ignore
      }
    }
  }

  // Also include the current admin user's directory ID in otherUserDocIds so their DM with the deleted user is purged
  const selfId = resolveDirectoryUserId(getStoredLocalUser());
  if (selfId && !existingDocIdsToDelete.has(selfId)) {
    otherUserDocIds.add(selfId);
  }

  // 1. Delete all subcollections and root user documents for the target user
  for (const uid of existingDocIdsToDelete) {
    for (const sub of ['conversations', 'messages', 'files', 'notes']) {
      try {
        const subSnap = await getDocs(query(collection(db, 'users', uid, sub), limit(200)));
        for (const docSnap of subSnap.docs) {
          await deleteDoc(doc(db, 'users', uid, sub, docSnap.id)).catch(() => {});
        }
      } catch {
        // Ignore
      }
    }
    try {
      await deleteDoc(doc(db, 'users', uid)).catch(() => {});
    } catch {
      // Ignore
    }
  }

  // 2. Remove direct conversations and messages involving the deleted user from other users' subcollections
  const deletedConvIds = new Set<string>();
  for (const otherUid of otherUserDocIds) {
    try {
      const convSnap = await getDocs(query(collection(db, 'users', otherUid, 'conversations'), limit(100)));
      for (const cDoc of convSnap.docs) {
        const cData = cDoc.data();
        const convId = String(cData?.convId || cDoc.id);
        const memberIds: string[] = Array.isArray(cData?.memberIds) ? cData.memberIds.map(String) : [];
        const dmParts = parseDirectConversationParticipants(convId);
        const involvesDeleted =
          [...memberIds, ...dmParts].some(
            m => candidateKeys.has(m) || candidateKeys.has(sanitizeUsername(m))
          ) ||
          Array.from(candidateKeys).some(
            k => k.length >= 3 && convId.toLowerCase().includes(k.toLowerCase())
          );

        if (involvesDeleted && cData?.type !== 'group') {
          deletedConvIds.add(convId);
          await deleteDoc(doc(db, 'users', otherUid, 'conversations', cDoc.id)).catch(() => {});
        }
      }
    } catch {
      // Ignore
    }

    try {
      const msgSnap = await getDocs(query(collection(db, 'users', otherUid, 'messages'), limit(200)));
      for (const mDoc of msgSnap.docs) {
        const mData = mDoc.data();
        const senderId = String(mData?.senderId || '');
        const convId = String(mData?.conversationId || '');
        if (
          candidateKeys.has(senderId) ||
          candidateKeys.has(sanitizeUsername(senderId)) ||
          deletedConvIds.has(convId)
        ) {
          await deleteDoc(doc(db, 'users', otherUid, 'messages', mDoc.id)).catch(() => {});
        }
      }
    } catch {
      // Ignore
    }
  }

  // 3. Delete any stories authored by the deleted user
  try {
    const storiesSnap = await getDocs(query(collection(db, 'stories'), limit(100)));
    for (const sDoc of storiesSnap.docs) {
      const sData = sDoc.data();
      const authorUid = String(sData?.authorUid || '');
      const authorId = String(sData?.authorId || '');
      if (
        candidateKeys.has(authorUid) ||
        candidateKeys.has(authorId) ||
        candidateKeys.has(sanitizeUsername(authorUid))
      ) {
        await deleteDoc(doc(db, 'stories', sDoc.id)).catch(() => {});
      }
    }
  } catch {
    // Ignore
  }

  // 4. Persist tombstone in Firebase so all other devices/sessions also know this user was deleted
  try {
    const primaryTombstoneKey =
      Array.from(candidateKeys).find(k => !k.startsWith('u_') && !k.includes('@')) ||
      Array.from(candidateKeys)[0];
    if (primaryTombstoneKey) {
      const noteId = sanitizeId(`del_${primaryTombstoneKey}`, 'del');
      const content = Array.from(candidateKeys).join('|').slice(0, 3900);
      if (content.length >= 1) {
        await writeCloudNoteDocForUser({
          ownerKey: 'nihal_graphix',
          noteId,
          content,
          tag: 'deleted_user',
          isPinned: false,
        });
      }
    }
  } catch {
    // Ignore tombstone error
  }
}

export async function clearAllChatsFromFirestore(): Promise<void> {
  const existingUids = new Set<string>();

  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(100)));
    snap.forEach(d => {
      existingUids.add(d.id);
    });
  } catch {
    // Ignore
  }

  for (const uid of existingUids) {
    for (const sub of ['conversations', 'messages', 'files']) {
      try {
        const subSnap = await getDocs(query(collection(db, 'users', uid, sub), limit(200)));
        for (const docSnap of subSnap.docs) {
          await deleteDoc(doc(db, 'users', uid, sub, docSnap.id)).catch(() => {});
        }
      } catch {
        // Ignore
      }
    }
    // Also clear call logs and WebRTC signals stored in notes
    try {
      const notesSnap = await getDocs(query(collection(db, 'users', uid, 'notes'), limit(200)));
      for (const nDoc of notesSnap.docs) {
        const tag = nDoc.data()?.tag;
        if (tag === 'call_record' || tag === 'call_signal') {
          await deleteDoc(doc(db, 'users', uid, 'notes', nDoc.id)).catch(() => {});
        }
      }
    } catch {
      // Ignore
    }
  }

  try {
    const storiesSnap = await getDocs(query(collection(db, 'stories'), limit(100)));
    for (const sDoc of storiesSnap.docs) {
      await deleteDoc(doc(db, 'stories', sDoc.id)).catch(() => {});
    }
  } catch {
    // Ignore
  }
}

export async function purgeAllCloudDataFromFirestore(): Promise<void> {
  directoryUserCache.clear();
  const existingUids = new Set<string>();
  try {
    const snap = await getDocs(
      query(collection(db, 'users'), limit(100))
    );
    snap.forEach(d => {
      existingUids.add(d.id);
    });
  } catch {
    // Ignore
  }

  for (const uid of existingUids) {
    for (const sub of ['conversations', 'messages', 'files', 'notes']) {
      try {
        const subSnap = await getDocs(query(collection(db, 'users', uid, sub), limit(200)));
        for (const docSnap of subSnap.docs) {
          await deleteDoc(doc(db, 'users', uid, sub, docSnap.id)).catch(() => {});
        }
      } catch {
        // Ignore
      }
    }
    try {
      await deleteDoc(doc(db, 'users', uid)).catch(() => {});
    } catch {
      // Ignore
    }
  }

  try {
    const storiesSnap = await getDocs(
      query(collection(db, 'stories'), limit(100))
    );
    for (const sDoc of storiesSnap.docs) {
      await deleteDoc(doc(db, 'stories', sDoc.id)).catch(() => {});
    }
  } catch {
    // Ignore
  }
}

/**
 * Updates the current user's online presence in `/users/{userId}` in Firestore.
 */
export async function setUserOnlineStatusInFirestore(
  user: User | null | undefined,
  isOnline: boolean
): Promise<void> {
  if (!user || isUserDeletedInCloudCache(user)) return;
  const userId = resolveDirectoryUserId(user);
  if (!userId) return;
  await enqueueFirestoreWrite(`users/${userId}`, async () => {
    try {
      const ref = doc(db, 'users', userId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, {
          isOnline: Boolean(isOnline),
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Ignore presence update error
    }
  });
}

/**
 * Marks messages in a conversation as `'read'` in Firestore so read receipts persist in Firebase.
 */
export async function markConversationMessagesReadInFirestore(
  conversationId: string,
  currentUser?: User | null
): Promise<void> {
  const selfUser = currentUser || getStoredLocalUser();
  const selfKey = resolveDirectoryUserId(selfUser);
  if (!selfKey || !conversationId) return;

  const cleanConvId = sanitizeId(conversationId, 'c');
  const ownerKeys = new Set<string>([selfKey]);
  for (const dmPart of parseDirectConversationParticipants(cleanConvId)) {
    const resolved = resolveDirectoryUserId(dmPart) || dmPart;
    if (resolved) ownerKeys.add(resolved);
  }

  for (const ownerKey of ownerKeys) {
    try {
      const snap = await getDocs(query(collection(db, 'users', ownerKey, 'messages'), limit(200)));
      for (const mDoc of snap.docs) {
        const d = mDoc.data();
        if (
          d &&
          d.conversationId === cleanConvId &&
          d.senderId !== selfKey &&
          d.status !== 'read' &&
          typeof d.content === 'string'
        ) {
          const msgRef = doc(db, 'users', ownerKey, 'messages', mDoc.id);
          await updateDoc(msgRef, {
            content: d.content.slice(0, 4000),
            status: 'read',
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      }
    } catch {
      // Ignore
    }
  }
}

/**
 * Real-time listener for shared stories in `/stories` in Firestore.
 */
export function subscribeToStoriesFromFirestore(
  onUpdate: (stories: Story[]) => void
): () => void {
  const q = query(
    collection(db, 'stories'),
    where('type', 'in', ['text', 'image']),
    limit(50)
  );
  return onSnapshot(
    q,
    snap => {
      const list: Story[] = [];
      snap.forEach(docSnap => {
        const d = docSnap.data();
        if (!d || !d.storyId) return;
        const createdAtIso = toIsoString(d.createdAt);
        const expiresAtIso = new Date(new Date(createdAtIso).getTime() + 86400000).toISOString();
        const authorId = String(d.authorId || d.authorUid);
        const authorName = String(d.authorName || 'User');
        if (
          isUserDeletedInCloudCache(authorId) ||
          isUserDeletedInCloudCache(String(d.authorUid || '')) ||
          isUserDeletedInCloudCache(authorName)
        ) {
          return;
        }
        list.push({
          id: String(d.storyId),
          userId: authorId,
          user: {
            id: authorId,
            username: sanitizeUsername(authorName),
            displayName: authorName,
            email: '',
            avatarUrl:
              typeof d.authorAvatar === 'string' && d.authorAvatar.length > 0
                ? d.authorAvatar
                : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(authorName)}`,
            onlineStatus: 'online',
            isOnline: true,
            createdAt: createdAtIso,
            role: 'user',
          },
          type: d.type === 'image' ? 'image' : 'text',
          text: typeof d.text === 'string' ? d.text : undefined,
          mediaUrl: typeof d.mediaUrl === 'string' ? d.mediaUrl : undefined,
          background: typeof d.background === 'string' ? d.background : '#111111',
          viewers: [],
          createdAt: createdAtIso,
          expiresAt: expiresAtIso,
        });
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(list);
    },
    () => {
      // Ignore snapshot error
    }
  );
}

/**
 * Helper to write a rule-compliant record into `/users/{ownerKey}/notes/{noteId}` in Firestore.
 */
async function writeCloudNoteDocForUser(params: {
  ownerKey: string;
  ownerUser?: Partial<User> | null;
  noteId: string;
  content: string;
  tag: string;
  isPinned?: boolean;
}): Promise<void> {
  const { ownerKey, ownerUser, noteId, content, tag, isPinned = false } = params;
  const cleanOwnerKey = sanitizeId(ownerKey, 'u');
  const cleanNoteId = sanitizeId(noteId, 'n');
  const cleanContent = (content || '').trim().slice(0, 4000);
  const cleanTag = (tag || 'note').trim().slice(0, 32);
  if (!cleanOwnerKey || !cleanNoteId || cleanContent.length < 1) return;

  const pathKey = `users/${cleanOwnerKey}/notes/${cleanNoteId}`;
  await enqueueFirestoreWrite(pathKey, async () => {
    if (
      cleanOwnerKey !== 'nihal_graphix' &&
      (isUserDeletedInCloudCache(cleanOwnerKey) || (ownerUser && isUserDeletedInCloudCache(ownerUser)))
    ) {
      return;
    }
    const hasProfile = await ensureUserProfileExists(cleanOwnerKey, ownerUser);
    if (!hasProfile) return;

    const noteRef = doc(db, 'users', cleanOwnerKey, 'notes', cleanNoteId);
    try {
      const snap = await getDocFromServer(noteRef).catch(() => getDoc(noteRef));
      if (!snap.exists()) {
        await setDoc(noteRef, {
          ownerId: cleanOwnerKey,
          content: cleanContent,
          tag: cleanTag,
          isPinned: Boolean(isPinned),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(noteRef, {
          content: cleanContent,
          tag: cleanTag,
          isPinned: Boolean(isPinned),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, pathKey);
      } catch {
        // Non-blocking
      }
    }
  });
}

function encodeKeyValuePairs(entries: Record<string, string | number | boolean | undefined>): string {
  return Object.entries(entries)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')
    .slice(0, 3950);
}

function decodeKeyValuePairs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const part of raw.split('&')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      const k = part.slice(0, eqIdx);
      const v = part.slice(eqIdx + 1);
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

/**
 * Persists a Call record to BOTH caller and receiver in Firestore (`/users/{userId}/notes/call_{callId}`).
 */
export async function syncCallToFirestore(
  call: Call,
  currentUser?: User | null
): Promise<void> {
  if (!call || !call.id) return;
  const selfUser = currentUser || getStoredLocalUser();
  if (selfUser) cacheDirectoryUsers([selfUser]);
  if (call.caller) cacheDirectoryUsers([call.caller]);
  if (call.receiver) cacheDirectoryUsers([call.receiver]);

  const callerResolved = await resolveParticipantDirectoryKeys(call.caller || call.callerId);
  const receiverResolved = call.receiverId
    ? await resolveParticipantDirectoryKeys(call.receiver || call.receiverId)
    : null;

  const callerKey = callerResolved?.primaryKey || resolveDirectoryUserId(selfUser);
  const receiverKey = receiverResolved?.primaryKey;
  if (!callerKey) return;

  const noteId = sanitizeId(`call_${call.id}`, 'call');
  const callerUser = call.caller || callerResolved?.userObj || selfUser;
  const receiverUser = call.receiver || receiverResolved?.userObj;

  const encoded = encodeKeyValuePairs({
    id: call.id,
    callerId: call.callerId || callerKey,
    callerKey,
    callerName: callerUser?.displayName || callerUser?.username || 'Caller',
    callerAvatar: callerUser?.avatarUrl || '',
    receiverId: call.receiverId || receiverKey || '',
    receiverKey: receiverKey || '',
    receiverName: receiverUser?.displayName || receiverUser?.username || 'Recipient',
    receiverAvatar: receiverUser?.avatarUrl || '',
    conversationId: call.conversationId || 'c_direct_call',
    type: call.type || 'voice',
    status: call.status || 'ringing',
    startedAt: call.startedAt || new Date().toISOString(),
    endedAt: call.endedAt || '',
    duration: call.duration ?? 0,
  });

  const targets = new Map<string, Partial<User> | undefined>();
  targets.set(callerKey, callerUser || undefined);
  if (receiverKey && !receiverKey.startsWith('dial_')) {
    targets.set(receiverKey, receiverUser || undefined);
  }

  await Promise.all(
    Array.from(targets.entries()).map(([ownerKey, ownerUser]) =>
      writeCloudNoteDocForUser({
        ownerKey,
        ownerUser,
        noteId,
        content: encoded,
        tag: 'call_record',
        isPinned: call.status === 'ringing' || call.status === 'active',
      })
    )
  );
}

function parseCloudCallNote(content: string): Call | null {
  const kv = decodeKeyValuePairs(content);
  if (!kv.id || !kv.callerId) return null;
  if (
    isUserDeletedInCloudCache(kv.callerId) ||
    isUserDeletedInCloudCache(kv.callerKey) ||
    (kv.receiverId && isUserDeletedInCloudCache(kv.receiverId)) ||
    (kv.receiverKey && isUserDeletedInCloudCache(kv.receiverKey))
  ) {
    return null;
  }

  const callerName = kv.callerName || 'Caller';
  const receiverName = kv.receiverName || 'Recipient';
  const startedAt = kv.startedAt || new Date().toISOString();

  return {
    id: kv.id,
    callerId: kv.callerId,
    caller: {
      id: kv.callerId,
      username: sanitizeUsername(kv.callerKey || callerName),
      displayName: callerName,
      email: '',
      avatarUrl:
        kv.callerAvatar ||
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(callerName)}`,
      onlineStatus: 'online',
      isOnline: true,
      createdAt: startedAt,
      role: 'user',
    },
    receiverId: kv.receiverId || undefined,
    receiver: kv.receiverId
      ? {
          id: kv.receiverId,
          username: sanitizeUsername(kv.receiverKey || receiverName),
          displayName: receiverName,
          email: '',
          avatarUrl:
            kv.receiverAvatar ||
            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(receiverName)}`,
          onlineStatus: 'online',
          isOnline: true,
          createdAt: startedAt,
          role: 'user',
        }
      : undefined,
    conversationId: kv.conversationId || 'c_direct_call',
    type: kv.type === 'video' ? 'video' : 'voice',
    status: (kv.status as Call['status']) || 'ringing',
    startedAt,
    endedAt: kv.endedAt || undefined,
    duration: kv.duration ? Number(kv.duration) : undefined,
  };
}

/**
 * Sends a WebRTC call signal through Firestore (`/users/{toUserKey}/notes/sig_{callId}_{seq}`).
 */
export async function sendCallSignalToFirestore(
  callId: string,
  toUserId: string,
  signal: any,
  currentUser?: User | null
): Promise<number> {
  const seq = Date.now();
  if (!callId || !toUserId || !signal) return seq;
  const selfUser = currentUser || getStoredLocalUser();
  const fromUserId = selfUser?.id || resolveDirectoryUserId(selfUser) || 'peer';

  const resolvedTarget = await resolveParticipantDirectoryKeys(toUserId);
  const targetKey = resolvedTarget?.primaryKey || resolveDirectoryUserId(toUserId);
  if (!targetKey || targetKey.startsWith('dial_')) return seq;

  const sigType = String(signal.type || (signal.candidate ? 'candidate' : 'signal'));
  const sdp = typeof signal.sdp === 'string' ? signal.sdp : '';
  const candidateStr =
    signal.candidate && typeof signal.candidate === 'object'
      ? String(signal.candidate.candidate || '')
      : typeof signal.candidate === 'string'
      ? signal.candidate
      : '';
  const sdpMid =
    signal.candidate && typeof signal.candidate === 'object'
      ? String(signal.candidate.sdpMid ?? '')
      : '';
  const sdpMLineIndex =
    signal.candidate && typeof signal.candidate === 'object'
      ? String(signal.candidate.sdpMLineIndex ?? '')
      : '';

  const encoded = encodeKeyValuePairs({
    seq,
    callId,
    fromUserId,
    sigType,
    sdp,
    candidate: candidateStr,
    sdpMid,
    sdpMLineIndex,
  });

  const noteId = sanitizeId(`sig_${callId}_${seq}_${Math.random().toString(36).slice(2, 5)}`, 'sig');
  await writeCloudNoteDocForUser({
    ownerKey: targetKey,
    ownerUser: resolvedTarget?.userObj,
    noteId,
    content: encoded,
    tag: 'call_signal',
    isPinned: false,
  });
  return seq;
}

function parseCloudCallSignalNote(content: string): {
  seq: number;
  callId: string;
  fromUserId: string;
  signal: any;
} | null {
  const kv = decodeKeyValuePairs(content);
  if (!kv.callId || !kv.sigType) return null;
  const seq = Number(kv.seq) || Date.now();
  let signal: any;
  if (kv.sigType === 'offer' || kv.sigType === 'answer') {
    signal = {
      type: kv.sigType,
      sdp: kv.sdp || '',
    };
  } else if (kv.sigType === 'candidate') {
    signal = {
      type: 'candidate',
      candidate: {
        candidate: kv.candidate || '',
        sdpMid: kv.sdpMid || '0',
        sdpMLineIndex: kv.sdpMLineIndex ? Number(kv.sdpMLineIndex) : 0,
      },
    };
  } else {
    signal = { type: kv.sigType };
  }
  return {
    seq,
    callId: kv.callId,
    fromUserId: kv.fromUserId || 'peer',
    signal,
  };
}

/**
 * Fetches persisted call history for the current user from Firestore `/users/{userId}/notes`.
 */
export async function fetchCallsFromFirestore(currentUser?: User | null): Promise<Call[]> {
  const userId = resolveDirectoryUserId(currentUser);
  if (!userId) return [];
  try {
    const snap = await getDocs(query(collection(db, 'users', userId, 'notes'), limit(200)));
    const calls: Call[] = [];
    snap.forEach(d => {
      const data = d.data();
      if (data?.tag === 'call_record' && typeof data.content === 'string') {
        const parsed = parseCloudCallNote(data.content);
        if (parsed) calls.push(parsed);
      }
    });
    calls.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return calls;
  } catch {
    return [];
  }
}

/**
 * Fetches any active/ringing call and buffered WebRTC call signals from Firestore `/users/{userId}/notes`.
 */
export async function fetchActiveCallAndSignalsFromFirestore(
  currentUser?: User | null,
  afterSeq = 0
): Promise<{
  call: Call | null;
  signals: Array<{ seq: number; fromUserId: string; toUserId: string; callId: string; signal: any }>;
}> {
  const userId = resolveDirectoryUserId(currentUser);
  if (!userId) return { call: null, signals: [] };

  try {
    const snap = await getDocs(query(collection(db, 'users', userId, 'notes'), limit(200)));
    const calls: Call[] = [];
    const rawSignals: Array<{ seq: number; fromUserId: string; toUserId: string; callId: string; signal: any }> = [];

    snap.forEach(d => {
      const data = d.data();
      if (!data || typeof data.content !== 'string') return;
      if (data.tag === 'call_record') {
        const c = parseCloudCallNote(data.content);
        if (c) calls.push(c);
      } else if (data.tag === 'call_signal') {
        const sig = parseCloudCallSignalNote(data.content);
        if (sig && sig.seq > afterSeq) {
          rawSignals.push({
            seq: sig.seq,
            fromUserId: sig.fromUserId,
            toUserId: currentUser?.id || userId,
            callId: sig.callId,
            signal: sig.signal,
          });
        }
      }
    });

    calls.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    const now = Date.now();
    const activeCall =
      calls.find(c => {
        if (c.status !== 'ringing' && c.status !== 'initiating' && c.status !== 'active') return false;
        const ageMs = now - new Date(c.startedAt).getTime();
        if ((c.status === 'ringing' || c.status === 'initiating') && ageMs > 90000) return false;
        return ageMs < 4 * 3600 * 1000;
      }) || null;

    const matchingSignals = activeCall
      ? rawSignals
          .filter(s => s.callId === activeCall.id)
          .sort((a, b) => a.seq - b.seq)
      : [];

    return { call: activeCall, signals: matchingSignals };
  } catch {
    return { call: null, signals: [] };
  }
}

/**
 * Persists user settings & preferences to Firestore `/users/{userId}/notes/user_settings`.
 */
export async function syncUserSettingsToFirestore(
  settings: Record<string, any>,
  currentUser?: User | null
): Promise<void> {
  const selfUser = currentUser || getStoredLocalUser();
  const userId = resolveDirectoryUserId(selfUser);
  if (!userId || !settings) return;

  const flatEntries: Record<string, string | number | boolean | undefined> = {};
  for (const [k, v] of Object.entries(settings)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'object') {
      for (const [subK, subV] of Object.entries(v as Record<string, any>)) {
        if (typeof subV === 'string' || typeof subV === 'number' || typeof subV === 'boolean') {
          flatEntries[`${k}.${subK}`] = subV;
        }
      }
    } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      flatEntries[k] = v;
    }
  }

  const encoded = encodeKeyValuePairs(flatEntries);
  if (!encoded) return;

  await writeCloudNoteDocForUser({
    ownerKey: userId,
    ownerUser: selfUser,
    noteId: 'user_settings',
    content: encoded,
    tag: 'user_settings',
    isPinned: false,
  });
}

/**
 * Loads user settings & preferences from Firestore `/users/{userId}/notes/user_settings`.
 */
export async function fetchUserSettingsFromFirestore(
  currentUser?: User | null
): Promise<Record<string, any> | null> {
  const selfUser = currentUser || getStoredLocalUser();
  const userId = resolveDirectoryUserId(selfUser);
  if (!userId) return null;
  try {
    const snap = await getDoc(doc(db, 'users', userId, 'notes', 'user_settings'));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (data?.tag !== 'user_settings' || typeof data.content !== 'string') return null;
    const kv = decodeKeyValuePairs(data.content);
    const out: Record<string, any> = {};
    for (const [k, rawVal] of Object.entries(kv)) {
      const parsedVal =
        rawVal === 'true'
          ? true
          : rawVal === 'false'
          ? false
          : !Number.isNaN(Number(rawVal)) && rawVal.trim() !== ''
          ? Number(rawVal)
          : rawVal;
      if (k.includes('.')) {
        const [parent, child] = k.split('.');
        if (!out[parent] || typeof out[parent] !== 'object') out[parent] = {};
        out[parent][child] = parsedVal;
      } else {
        out[k] = parsedVal;
      }
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Persists or removes a blocked user record in Firestore `/users/{userId}/notes/block_{blockedUserId}`.
 */
export async function syncBlockedUserToFirestore(
  blockedUserId: string,
  blockedUser?: Partial<User> | null,
  isBlocked = true,
  currentUser?: User | null
): Promise<void> {
  const selfUser = currentUser || getStoredLocalUser();
  const userId = resolveDirectoryUserId(selfUser);
  if (!userId || !blockedUserId) return;

  const noteId = sanitizeId(`block_${blockedUserId}`, 'blk');
  if (!isBlocked) {
    try {
      await deleteDoc(doc(db, 'users', userId, 'notes', noteId));
    } catch {
      // Ignore
    }
    return;
  }

  const encoded = encodeKeyValuePairs({
    blockedUserId,
    username: blockedUser?.username || blockedUserId,
    displayName: blockedUser?.displayName || blockedUser?.username || blockedUserId,
    avatarUrl: blockedUser?.avatarUrl || '',
    createdAt: new Date().toISOString(),
  });

  await writeCloudNoteDocForUser({
    ownerKey: userId,
    ownerUser: selfUser,
    noteId,
    content: encoded,
    tag: 'blocked_user',
    isPinned: false,
  });
}

/**
 * Fetches blocked users for the current user from Firestore `/users/{userId}/notes`.
 */
export async function fetchBlockedUsersFromFirestore(
  currentUser?: User | null
): Promise<BlockedUser[]> {
  const selfUser = currentUser || getStoredLocalUser();
  const userId = resolveDirectoryUserId(selfUser);
  if (!userId) return [];
  try {
    const snap = await getDocs(query(collection(db, 'users', userId, 'notes'), limit(200)));
    const list: BlockedUser[] = [];
    snap.forEach(d => {
      const data = d.data();
      if (data?.tag === 'blocked_user' && typeof data.content === 'string') {
        const kv = decodeKeyValuePairs(data.content);
        if (kv.blockedUserId) {
          const displayName = kv.displayName || kv.username || kv.blockedUserId;
          list.push({
            id: d.id,
            userId: selfUser?.id || userId,
            blockedUserId: kv.blockedUserId,
            createdAt: kv.createdAt || toIsoString(data.createdAt),
            blockedUser: {
              id: kv.blockedUserId,
              username: sanitizeUsername(kv.username || displayName),
              displayName,
              email: '',
              avatarUrl:
                kv.avatarUrl ||
                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`,
              onlineStatus: 'offline',
              isOnline: false,
              createdAt: kv.createdAt || new Date().toISOString(),
              role: 'user',
            },
          });
        }
      }
    });
    return list;
  } catch {
    return [];
  }
}

/**
 * Persists a moderation report to Firestore `/users/nihal_graphix/notes/rep_{id}`.
 */
export async function syncReportToFirestore(
  report: {
    id?: string;
    reportedUserId: string;
    reason: string;
    details?: string;
    conversationId?: string;
    messageId?: string;
    status?: Report['status'];
  },
  currentUser?: User | null
): Promise<void> {
  const selfUser = currentUser || getStoredLocalUser();
  const reportId = report.id || `rep_${Date.now()}`;
  const noteId = sanitizeId(reportId, 'rep');
  const encoded = encodeKeyValuePairs({
    id: reportId,
    reporterId: selfUser?.id || resolveDirectoryUserId(selfUser) || 'user',
    reporterName: selfUser?.displayName || selfUser?.username || 'User',
    reportedUserId: report.reportedUserId,
    reason: report.reason || 'Reported content',
    details: report.details || '',
    conversationId: report.conversationId || '',
    messageId: report.messageId || '',
    status: report.status || 'pending',
    createdAt: new Date().toISOString(),
  });

  await writeCloudNoteDocForUser({
    ownerKey: 'nihal_graphix',
    noteId,
    content: encoded,
    tag: 'user_report',
    isPinned: false,
  });
}

/**
 * Fetches moderation reports from Firestore `/users/nihal_graphix/notes`.
 */
export async function fetchReportsFromFirestore(): Promise<Report[]> {
  try {
    const snap = await getDocs(query(collection(db, 'users', 'nihal_graphix', 'notes'), limit(200)));
    const list: Report[] = [];
    snap.forEach(d => {
      const data = d.data();
      if (data?.tag === 'user_report' && typeof data.content === 'string') {
        const kv = decodeKeyValuePairs(data.content);
        if (kv.id && kv.reportedUserId) {
          list.push({
            id: kv.id,
            reporterId: kv.reporterId || 'user',
            reporterName: kv.reporterName || 'User',
            reportedUserId: kv.reportedUserId,
            reason: kv.reason || 'Reported content',
            details: kv.details || undefined,
            conversationId: kv.conversationId || undefined,
            messageId: kv.messageId || undefined,
            status: (kv.status as Report['status']) || 'pending',
            createdAt: kv.createdAt || toIsoString(data.createdAt),
          });
        }
      }
    });
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch {
    return [];
  }
}

/**
 * Persists a system broadcast announcement to Firestore `/users/nihal_graphix/notes/system_broadcast`.
 */
export async function syncBroadcastToFirestore(
  content: string,
  category = 'system'
): Promise<void> {
  if (!content || !content.trim()) return;
  const encoded = encodeKeyValuePairs({
    content: content.trim(),
    category,
    timestamp: new Date().toISOString(),
  });
  await writeCloudNoteDocForUser({
    ownerKey: 'nihal_graphix',
    noteId: 'system_broadcast',
    content: encoded,
    tag: 'system_broadcast',
    isPinned: true,
  });
}
