import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInAnonymously,
  onAuthStateChanged,
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

let authReadyPromise: Promise<string | null> | null = null;

/**
 * Ensures the browser has a valid Firebase Auth session (`request.auth != null`)
 * so that Firestore security rules allow directory reads and user writes.
 */
export async function ensureFirebaseSession(): Promise<string | null> {
  if (auth.currentUser?.uid) {
    return auth.currentUser.uid;
  }
  if (authReadyPromise) {
    return authReadyPromise;
  }
  authReadyPromise = (async () => {
    try {
      await new Promise<void>(resolve => {
        const unsub = onAuthStateChanged(auth, () => {
          unsub();
          resolve();
        });
        setTimeout(() => {
          unsub();
          resolve();
        }, 1200);
      });
      if (auth.currentUser?.uid) {
        return auth.currentUser.uid;
      }
      const cred = await signInAnonymously(auth);
      return cred.user?.uid || null;
    } catch {
      return auth.currentUser?.uid || null;
    } finally {
      authReadyPromise = null;
    }
  })();
  return authReadyPromise;
}

export async function signOutFirebaseSession(): Promise<void> {
  try {
    if (auth.currentUser && !auth.currentUser.isAnonymous) {
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

/**
 * Ensures the current user's root `/users/{uid}` document exists in Firestore
 * (required by subcollection Master Gate rules).
 */
async function ensureUserProfileExists(uid: string, user?: User | null): Promise<boolean> {
  const userRef = doc(db, 'users', uid);
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) return true;

    const cleanUsername = sanitizeUsername(
      user?.username || auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'member'
    );
    const cleanDisplayName = (
      user?.displayName ||
      auth.currentUser?.displayName ||
      cleanUsername
    )
      .trim()
      .slice(0, 64);

    const payload: Record<string, unknown> = {
      uid,
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
 * Syncs an authenticated AetherChat user to the shared Firestore `/users/{uid}` directory
 * and `/users/{uid}/private/info` adhering strictly to `firestore.rules`.
 */
export async function syncUserToCloudDirectory(user: User | null | undefined): Promise<void> {
  if (!user || !user.username) return;
  const uid = await ensureFirebaseSession();
  if (!uid) return;

  const cleanUsername = sanitizeUsername(user.username);
  if (cleanUsername === 'directory_reader' || cleanUsername === 'guest_viewer') {
    return;
  }

  const cleanDisplayName = (user.displayName || cleanUsername).trim().slice(0, 64);
  const cleanAppUserId = sanitizeId(user.id, 'u');
  const cleanAvatarUrl = (user.avatarUrl || '').trim().slice(0, 2048);
  const cleanBio = (user.bio || 'Member of the encrypted communications mesh.').trim().slice(0, 256);

  const userDocRef = doc(db, 'users', uid);

  try {
    const existingSnap = await getDoc(userDocRef);
    if (!existingSnap.exists()) {
      const createData: Record<string, unknown> = {
        uid,
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

    if (user.email && user.email.length >= 3 && user.email.length <= 128) {
      const privDocRef = doc(db, 'users', uid, 'private', 'info');
      const privSnap = await getDoc(privDocRef);
      const cleanPhone = (user.phone || '').trim().slice(0, 32);

      if (!privSnap.exists()) {
        const privCreate: Record<string, unknown> = {
          uid,
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
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
    } catch {
      // Non-blocking
    }
  }
}

/**
 * Fetches all registered users from the shared Firestore `/users` directory.
 */
export async function fetchCloudDirectoryUsers(currentUser?: User | null): Promise<User[]> {
  const uid = await ensureFirebaseSession();
  if (!uid) return [];

  if (currentUser) {
    void syncUserToCloudDirectory(currentUser);
  }

  try {
    const q = query(collection(db, 'users'), limit(100));
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
 * Persists a conversation record to `/users/{uid}/conversations/{convId}` in Firestore.
 */
export async function syncConversationToFirestore(
  conv: Conversation,
  currentUser?: User | null
): Promise<void> {
  if (!conv || !conv.id || conv.type === 'channel') return;
  const uid = await ensureFirebaseSession();
  if (!uid) return;

  const hasProfile = await ensureUserProfileExists(uid, currentUser);
  if (!hasProfile) return;

  const convId = sanitizeId(conv.id, 'c');
  const convRef = doc(db, 'users', uid, 'conversations', convId);

  const cleanType = conv.type === 'group' ? 'group' : 'direct';
  const cleanName = (conv.name || 'Direct Chat').trim().slice(0, 128) || 'Direct Chat';
  const cleanDescription = (conv.description || '').trim().slice(0, 512);
  const cleanAvatarUrl = (conv.avatarUrl || '').trim().slice(0, 2048);
  const cleanLastMsg = (conv.lastMessage?.content || '').trim().slice(0, 1000);
  const memberIds = Array.from(
    new Set(
      (conv.members || [])
        .map(m => m.userId || m.user?.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  ).slice(0, 50);

  try {
    const snap = await getDoc(convRef);
    if (!snap.exists()) {
      const payload: Record<string, unknown> = {
        ownerId: uid,
        convId,
        type: cleanType,
        name: cleanName,
        memberIds,
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
        memberIds,
        updatedAt: serverTimestamp(),
      };
      if (cleanDescription) updatePayload.description = cleanDescription;
      if (cleanAvatarUrl) updatePayload.avatarUrl = cleanAvatarUrl;
      if (cleanLastMsg) updatePayload.lastMessageText = cleanLastMsg;

      await updateDoc(convRef, updatePayload);
    }
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}/conversations/${convId}`);
    } catch {
      // Non-blocking
    }
  }
}

/**
 * Loads persisted conversations for the current user from `/users/{uid}/conversations`.
 */
export async function fetchConversationsFromFirestore(
  currentUser?: User | null,
  knownUsers: User[] = []
): Promise<Conversation[]> {
  const uid = await ensureFirebaseSession();
  if (!uid) return [];

  try {
    const q = query(collection(db, 'users', uid, 'conversations'), limit(100));
    const snap = await getDocs(q);
    const list: Conversation[] = [];

    snap.forEach(docSnap => {
      const d = docSnap.data();
      if (!d || !d.convId) return;
      const convId = String(d.convId);
      const memberIds: string[] = Array.isArray(d.memberIds) ? d.memberIds.map(String) : [];
      const createdAtIso = toIsoString(d.createdAt);

      const members = memberIds.map((mUserId, idx) => {
        const matchedUser =
          (currentUser && currentUser.id === mUserId ? currentUser : undefined) ||
          knownUsers.find(u => u.id === mUserId);
        return {
          id: `cm_${convId}_${idx}`,
          conversationId: convId,
          userId: mUserId,
          user: matchedUser,
          role: (currentUser && mUserId === currentUser.id ? 'owner' : 'member') as 'owner' | 'member',
          permissions: {
            canSendMessages: true,
            canAddMembers: true,
            canPinMessages: true,
            canDeleteMessages: true,
            canManageCalls: true,
          },
          joinedAt: createdAtIso,
        };
      });

      list.push({
        id: convId,
        type: d.type === 'group' ? 'group' : 'direct',
        name: String(d.name || 'Chat'),
        description: typeof d.description === 'string' ? d.description : undefined,
        avatarUrl: typeof d.avatarUrl === 'string' ? d.avatarUrl : undefined,
        isPrivate: true,
        isEncrypted: true,
        createdAt: createdAtIso,
        createdBy: currentUser?.id || uid,
        members,
        lastMessage:
          typeof d.lastMessageText === 'string' && d.lastMessageText.length > 0
            ? {
                id: `m_preview_${convId}`,
                conversationId: convId,
                senderId: currentUser?.id || uid,
                content: d.lastMessageText,
                type: 'text',
                reactions: [],
                status: 'sent',
                createdAt: toIsoString(d.updatedAt),
              }
            : undefined,
      });
    });

    return list;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.LIST, `users/${uid}/conversations`);
    } catch {
      // Non-blocking
    }
    return [];
  }
}

/**
 * Persists a chat message to `/users/{uid}/messages/{msgId}` in Firestore.
 */
export async function syncMessageToFirestore(
  msg: Message,
  currentUser?: User | null
): Promise<void> {
  if (!msg || !msg.id || !msg.conversationId) return;
  const uid = await ensureFirebaseSession();
  if (!uid) return;

  const hasProfile = await ensureUserProfileExists(uid, currentUser);
  if (!hasProfile) return;

  const msgId = sanitizeId(msg.id, 'm');
  const convId = sanitizeId(msg.conversationId, 'c');
  const senderId = sanitizeId(msg.senderId || currentUser?.id || uid, 'u');
  const senderName = (
    msg.sender?.displayName ||
    currentUser?.displayName ||
    'User'
  )
    .trim()
    .slice(0, 64) || 'User';
  const content = (msg.content || '').slice(0, 4000);
  const type = (msg.type || 'text').slice(0, 32);
  const status =
    msg.status === 'sending' || msg.status === 'delivered' || msg.status === 'read'
      ? msg.status
      : 'sent';

  const msgRef = doc(db, 'users', uid, 'messages', msgId);

  try {
    const snap = await getDoc(msgRef);
    if (!snap.exists()) {
      const payload: Record<string, unknown> = {
        ownerId: uid,
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
      if (msg.mediaUrl && msg.mediaUrl.length <= 200000) {
        payload.mediaUrl = msg.mediaUrl;
      }
      if (msg.fileName && msg.fileName.length <= 256) {
        payload.fileName = msg.fileName;
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
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}/messages/${msgId}`);
    } catch {
      // Non-blocking
    }
  }
}

/**
 * Deletes a message from `/users/{uid}/messages/{msgId}` in Firestore.
 */
export async function deleteMessageFromFirestore(messageId: string): Promise<void> {
  const uid = await ensureFirebaseSession();
  if (!uid) return;
  const msgId = sanitizeId(messageId, 'm');
  try {
    await deleteDoc(doc(db, 'users', uid, 'messages', msgId));
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.DELETE, `users/${uid}/messages/${msgId}`);
    } catch {
      // Non-blocking
    }
  }
}

/**
 * Fetches persisted messages for a conversation from `/users/{uid}/messages`.
 */
export async function fetchMessagesFromFirestore(
  conversationId: string,
  knownUsers: User[] = []
): Promise<Message[]> {
  const uid = await ensureFirebaseSession();
  if (!uid) return [];

  const cleanConvId = sanitizeId(conversationId, 'c');

  try {
    const q = query(
      collection(db, 'users', uid, 'messages'),
      where('conversationId', '==', cleanConvId),
      limit(200)
    );
    const snap = await getDocs(q);
    const list: Message[] = [];

    snap.forEach(docSnap => {
      const d = docSnap.data();
      if (!d || !d.msgId) return;
      const senderId = String(d.senderId || uid);
      const senderUser: User = knownUsers.find(u => u.id === senderId) || {
        id: senderId,
        username: sanitizeUsername(String(d.senderName || 'user')),
        displayName: String(d.senderName || 'User'),
        email: '',
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
          String(d.senderName || 'User')
        )}`,
        onlineStatus: 'online',
        isOnline: true,
        createdAt: toIsoString(d.createdAt),
        role: 'user',
      };

      list.push({
        id: String(d.msgId),
        conversationId: String(d.conversationId),
        senderId,
        sender: senderUser,
        content: String(d.content || ''),
        type: (d.type as Message['type']) || 'text',
        mediaUrl: typeof d.mediaUrl === 'string' ? d.mediaUrl : undefined,
        fileName: typeof d.fileName === 'string' ? d.fileName : undefined,
        reactions: [],
        status: (d.status as Message['status']) || 'sent',
        createdAt: toIsoString(d.createdAt),
      });
    });

    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return list;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.LIST, `users/${uid}/messages`);
    } catch {
      // Non-blocking
    }
    return [];
  }
}

/**
 * Stores an uploaded file in Firestore `/users/{uid}/files/{fileId}` so attachments
 * and media are backed up in cloud storage.
 */
export async function uploadFileToFirestore(
  file: File,
  dataUrl: string,
  currentUser?: User | null
): Promise<string | null> {
  if (!dataUrl || dataUrl.length > 750000) return null;
  const uid = await ensureFirebaseSession();
  if (!uid) return null;

  const hasProfile = await ensureUserProfileExists(uid, currentUser);
  if (!hasProfile) return null;

  const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const fileRef = doc(db, 'users', uid, 'files', fileId);

  try {
    await setDoc(fileRef, {
      ownerId: uid,
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
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}/files/${fileId}`);
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
  const uid = await ensureFirebaseSession();
  if (!uid) return;

  const storyId = sanitizeId(story.id, 's');
  const storyRef = doc(db, 'stories', storyId);
  const authorId = sanitizeId(story.userId || currentUser?.id || uid, 'u');
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
        authorUid: uid,
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
    } else if (snap.data()?.authorUid === uid) {
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
  const uid = await ensureFirebaseSession();
  if (!uid) return;
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
  const uid = await ensureFirebaseSession();
  if (!uid) return [];

  try {
    const q = query(collection(db, 'stories'), limit(50));
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
