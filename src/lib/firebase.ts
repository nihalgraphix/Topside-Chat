import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  getFirestore,
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
import type { User, Conversation, Message, Story } from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const directoryUserCache = new Map<string, User>();

export function cacheDirectoryUsers(users: User[]) {
  for (const u of users) {
    if (!u) continue;
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
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

/**
 * Ensures the target user's root `/users/{userId}` document exists in Firestore
 * (required by subcollection Master Gate rules).
 */
async function ensureUserProfileExists(
  userId: string,
  user?: Partial<User> | null
): Promise<boolean> {
  const cleanUserId = sanitizeId(userId, 'u');
  const userRef = doc(db, 'users', cleanUserId);
  try {
    const snap = await getDoc(userRef);
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

    await setDoc(userRef, payload);
    return true;
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

  const userDocRef = doc(db, 'users', userId);

  try {
    const existingSnap = await getDoc(userDocRef);
    if (!existingSnap.exists()) {
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

      await setDoc(userDocRef, createData);
    } else {
      const updateData: Record<string, unknown> = {
        appUserId: cleanAppUserId,
        username: cleanUsername,
        displayName: cleanDisplayName,
        isOnline: true,
        updatedAt: serverTimestamp(),
      };
      if (cleanAvatarUrl) updateData.avatarUrl = cleanAvatarUrl;
      if (cleanBio) updateData.bio = cleanBio;

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
      const privSnap = await getDoc(privDocRef);
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
}

const PURGED_APP_USER_IDS = new Set([
  'u_1793542551003_u6d1q',
  'u_1793542529768_2hell',
  'u_g_1789118321867_ri6j',
  'u_1793542689808_tgcbq',
  'u_1793542584643_kbekr',
]);

/**
 * Fetches all registered users from the shared Firestore `/users` directory.
 */
export async function fetchCloudDirectoryUsers(currentUser?: User | null): Promise<User[]> {
  if (currentUser && (!currentUser.id || !PURGED_APP_USER_IDS.has(currentUser.id))) {
    void syncUserToCloudDirectory(currentUser);
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
      if (PURGED_APP_USER_IDS.has(resolvedId)) return;

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

  const hasProfile = await ensureUserProfileExists(ownerKey, ownerUser);
  if (!hasProfile) return;

  const convRef = doc(db, 'users', ownerKey, 'conversations', convId);
  const cleanName = (name || 'Direct Chat').trim().slice(0, 128) || 'Direct Chat';
  const cleanDescription = (description || '').trim().slice(0, 512);
  const cleanAvatarUrl = (avatarUrl || '').trim().slice(0, 2048);
  const cleanLastMsg = (lastMessageText || '').trim().slice(0, 1000);
  const cleanMemberIds = Array.from(new Set(memberIds.filter(Boolean))).slice(0, 50);

  try {
    const snap = await getDoc(convRef);
    if (!snap.exists()) {
      const payload: Record<string, unknown> = {
        ownerId: ownerKey,
        convId,
        type,
        name: cleanName,
        memberIds: cleanMemberIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (cleanDescription) payload.description = cleanDescription;
      if (cleanAvatarUrl) payload.avatarUrl = cleanAvatarUrl;
      if (cleanLastMsg) payload.lastMessageText = cleanLastMsg;

      await setDoc(convRef, payload);
    } else {
      const updatePayload: Record<string, unknown> = {
        name: cleanName,
        memberIds: cleanMemberIds,
        updatedAt: serverTimestamp(),
      };
      if (cleanDescription) updatePayload.description = cleanDescription;
      if (cleanAvatarUrl) updatePayload.avatarUrl = cleanAvatarUrl;
      if (cleanLastMsg) updatePayload.lastMessageText = cleanLastMsg;

      await updateDoc(convRef, updatePayload);
    }
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, `users/${ownerKey}/conversations/${convId}`);
    } catch {
      // Non-blocking
    }
  }
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
      where('ownerId', '==', userId),
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
    where('ownerId', '==', userId),
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

  const hasProfile = await ensureUserProfileExists(ownerKey, ownerUser);
  if (!hasProfile) return;

  const msgRef = doc(db, 'users', ownerKey, 'messages', msgId);
  try {
    const snap = await getDoc(msgRef);
    if (!snap.exists()) {
      const payload: Record<string, unknown> = {
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
        payload.mediaUrl = mediaUrl;
      }
      if (fileName && fileName.length <= 256) {
        payload.fileName = fileName;
      }
      await setDoc(msgRef, payload);
    } else {
      await updateDoc(msgRef, {
        content,
        status,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, `users/${ownerKey}/messages/${msgId}`);
    } catch {
      // Non-blocking
    }
  }
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
  const senderUser = currentUser || msg.sender || getStoredLocalUser();
  if (senderUser) cacheDirectoryUsers([senderUser as User]);

  const senderKey = resolveDirectoryUserId(senderUser);
  if (!senderKey) return;

  const msgId = sanitizeId(msg.id, 'm');
  const convId = sanitizeId(msg.conversationId, 'c');
  const senderId = sanitizeId(msg.senderId || senderUser?.id || senderKey, 'u');
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
    if (!participantMap.has(dmUser)) {
      const cached = directoryUserCache.get(dmUser);
      participantMap.set(dmUser, cached);
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

  const allMemberIds = Array.from(
    new Set([
      ...Array.from(participantMap.keys()),
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
        fileName: msg.fileName,
      });

      // Also ensure/update the conversation preview document for every participant
      const isRecipient = targetKey !== senderKey;
      const convType: 'direct' | 'group' = conversation?.type === 'group' ? 'group' : 'direct';
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
    await deleteDoc(doc(db, 'users', userId, 'messages', msgId));
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
      where('ownerId', '==', userId),
      where('conversationId', '==', cleanConvId),
      limit(200)
    );
    const snap = await getDocs(q);
    await Promise.all(
      snap.docs.map(d =>
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
    await Promise.all([
      deleteDoc(doc(db, 'users', userId, 'conversations', cleanConvId)).catch(() => {}),
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
  const senderId = String(d.senderId || defaultOwnerId);
  const senderName = String(d.senderName || 'User');
  const cleanSenderUsername = sanitizeUsername(senderName);

  const senderUser: User =
    knownUsers.find(
      u =>
        u.id === senderId ||
        sanitizeId(u.id, 'u') === senderId ||
        sanitizeUsername(u.username) === senderId ||
        u.displayName.toLowerCase() === senderName.toLowerCase()
    ) ||
    directoryUserCache.get(senderId) ||
    directoryUserCache.get(cleanSenderUsername) || {
      id: senderId,
      username: cleanSenderUsername,
      displayName: senderName,
      email: '',
      avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(senderName)}`,
      onlineStatus: 'online',
      isOnline: true,
      createdAt: toIsoString(d.createdAt),
      role: 'user',
    };

  return {
    id: String(d.msgId),
    conversationId: String(d.conversationId),
    senderId: senderUser.id || senderId,
    sender: senderUser,
    content: String(d.content || ''),
    type: (d.type as Message['type']) || 'text',
    mediaUrl: typeof d.mediaUrl === 'string' ? d.mediaUrl : undefined,
    fileName: typeof d.fileName === 'string' ? d.fileName : undefined,
    reactions: [],
    status: (d.status as Message['status']) || 'sent',
    createdAt: toIsoString(d.createdAt),
  };
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
  const userId = resolveDirectoryUserId();
  if (!userId) return [];

  const cleanConvId = sanitizeId(conversationId, 'c');
  const ownerKeys = new Set<string>([userId]);

  for (const dmUser of parseDirectConversationParticipants(cleanConvId)) {
    ownerKeys.add(dmUser);
  }
  if (conversation?.members) {
    for (const m of conversation.members) {
      const key = resolveDirectoryUserId(m.user || m.userId);
      if (key) ownerKeys.add(key);
    }
  }

  try {
    const snapshots = await Promise.all(
      Array.from(ownerKeys).map(ownerKey =>
        getDocs(
          query(
            collection(db, 'users', ownerKey, 'messages'),
            where('ownerId', '==', ownerKey),
            where('conversationId', '==', cleanConvId),
            limit(200)
          )
        ).catch(() => null)
      )
    );

    const byId = new Map<string, Message>();
    for (const snap of snapshots) {
      if (!snap) continue;
      snap.forEach(docSnap => {
        const msg = parseFirestoreMessageDoc(docSnap.data(), userId, knownUsers);
        if (msg && msg.id) {
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
  const userId = resolveDirectoryUserId(currentUser);
  if (!userId) return () => {};

  const cleanConvId = sanitizeId(conversationId, 'c');
  const ownerKeys = new Set<string>([userId]);

  for (const dmUser of parseDirectConversationParticipants(cleanConvId)) {
    ownerKeys.add(dmUser);
  }
  if (conversation?.members) {
    for (const m of conversation.members) {
      const key = resolveDirectoryUserId(m.user || m.userId);
      if (key) ownerKeys.add(key);
    }
  }

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
      where('ownerId', '==', ownerKey),
      where('conversationId', '==', cleanConvId),
      limit(200)
    );
    return onSnapshot(
      q,
      snap => {
        const ownerMap = new Map<string, Message>();
        snap.forEach(docSnap => {
          const msg = parseFirestoreMessageDoc(docSnap.data(), ownerKey, knownUsers);
          if (msg && msg.id) {
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
    await deleteDoc(doc(db, 'stories', cleanId));
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

export async function purgeAllCloudDataFromFirestore(): Promise<void> {
  directoryUserCache.clear();
  const knownUids = new Set<string>([
    'muhammed_nihal_on',
    'nihal1382010',
    'nihal_graphix',
    'nihal_graphix_gmail_com',
    'nihal_on',
    'u_1793542551003_u6d1q',
    'u_1793542529768_2hell',
    'u_g_1789118321867_ri6j',
    'u_1793542689808_tgcbq',
    'u_1793542584643_kbekr',
  ]);
  try {
    const snap = await getDocs(
      query(collection(db, 'users'), limit(100))
    );
    snap.forEach(d => {
      knownUids.add(d.id);
      const data = d.data();
      if (data?.appUserId) knownUids.add(sanitizeId(String(data.appUserId), 'u'));
      if (data?.uid) knownUids.add(sanitizeId(String(data.uid), 'u'));
    });
  } catch {
    // Ignore
  }

  for (const uid of knownUids) {
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

