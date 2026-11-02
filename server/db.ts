import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  setLogLevel,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { sqlStorage } from './sqlDb';
import {
  User,
  Conversation,
  ConversationMember,
  Message,
  Story,
  Call,
  ChatFolder,
  DeviceSession,
  Report,
  BlockedUser,
  UserSettings,
} from '../src/types';

setLogLevel('silent');

const serverFirebaseApp =
  getApps().find(a => a.name === 'aether-server-sync') ||
  initializeApp(firebaseConfig, 'aether-server-sync');
const serverFirestore = getFirestore(serverFirebaseApp, firebaseConfig.firestoreDatabaseId);
const serverAuth = getAuth(serverFirebaseApp);

interface DatabaseSchema {
  users: (User & { passwordHash: string })[];
  sessions: DeviceSession[];
  conversations: Conversation[];
  conversationMembers: ConversationMember[];
  messages: Message[];
  stories: Story[];
  calls: Call[];
  folders: ChatFolder[];
  reports: Report[];
  blockedUsers: BlockedUser[];
  userSettings: Record<string, UserSettings>;
  purgedUserIds?: string[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'aether.db.json');
const PURGE_MARKER_FILE = path.join(DATA_DIR, 'purge_20261102_v3.done');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export const PURGED_USER_IDS = new Set([
  'u_alex',
  'u_jerima',
  'u_lu',
  'u_muzi',
  'u_jia',
  'u_amy',
  'u_surf',
  'u_dalonzo',
  'u_frank',
  'u_alice',
  'u_admin',
  'u_bot',
  'u_1789118066028_c7hyx',
]);

export function isSuperAdminIdentity(userOrStr?: Partial<User> | string | null): boolean {
  if (!userOrStr) return false;
  if (typeof userOrStr === 'string') {
    const clean = userOrStr.trim().toLowerCase().replace(/^@/, '');
    const norm = clean.replace(/[^a-z0-9_]/g, '_');
    return (
      clean === 'nihal.graphix' ||
      clean === 'nihal_graphix' ||
      clean === 'nihalgraphix' ||
      norm === 'nihal_graphix' ||
      clean === 'nihal.graphix@gmail.com' ||
      clean.startsWith('nihal.graphix@') ||
      clean.startsWith('nihal_graphix@') ||
      clean.startsWith('nihalgraphix@')
    );
  }
  return (
    userOrStr.role === 'superadmin' ||
    isSuperAdminIdentity(userOrStr.username) ||
    isSuperAdminIdentity(userOrStr.email)
  );
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

class AetherDatabase {
  private data: DatabaseSchema;
  private saveTimeout: NodeJS.Timeout | null = null;
  private isCloudSyncing = false;
  private lastCloudPullAt = 0;

  constructor() {
    this.data = this.load();
    if (!fs.existsSync(PURGE_MARKER_FILE)) {
      this.clearAllData();
    }
    this.initSql();
    void this.initCloudSync();
  }

  private async initCloudSync(): Promise<void> {
    try {
      if (!fs.existsSync(PURGE_MARKER_FILE)) {
        await this.purgeAllData();
        fs.writeFileSync(PURGE_MARKER_FILE, new Date().toISOString(), 'utf-8');
        return;
      }
      for (const u of this.data.users) {
        await this.publishUserToCloud(u);
      }
      await this.pullUsersFromCloud(true);
      for (const c of this.data.conversations) {
        await this.publishConversationToCloud(c);
      }
      for (const m of this.data.messages) {
        await this.publishMessageToCloud(m);
      }
      for (const s of this.data.stories) {
        await this.publishStoryToCloud(s);
      }
    } catch {
      // Non-blocking startup cloud sync
    }
  }

  private toCloudUsernameKey(raw?: string): string {
    if (!raw) return '';
    return raw
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 32);
  }

  public async publishConversationToCloud(conv: Conversation): Promise<void> {
    if (!conv || !conv.id) return;
    try {
      const members = this.data.conversationMembers.filter(m => m.conversationId === conv.id);
      const memberKeys = Array.from(
        new Set(
          members
            .map(m => {
              const u = this.getUserById(m.userId);
              return this.toCloudUsernameKey(u?.username || m.userId);
            })
            .filter(k => k.length >= 2 && !this.isUserPurged(k))
        )
      ).slice(0, 20);
      if (memberKeys.length === 0) return;

      const cleanConvId = conv.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
      const convType = conv.type === 'group' ? 'group' : 'direct';
      const convName = (conv.name || 'Chat').trim().slice(0, 80) || 'Chat';
      const convAvatar = (
        conv.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(convName)}`
      ).slice(0, 2048);
      const lastMsg = (conv.lastMessage?.content || '').slice(0, 500);
      const lastSender = (conv.lastMessage?.senderId || conv.createdBy || memberKeys[0]).slice(0, 128);

      for (const ownerKey of memberKeys) {
        const ownerUser = this.getUserByUsername(ownerKey);
        if (ownerUser) {
          await this.publishUserToCloud(ownerUser);
        }
        const convRef = doc(serverFirestore, 'users', ownerKey, 'conversations', cleanConvId);
        const snap = await getDoc(convRef);
        if (!snap.exists()) {
          await setDoc(convRef, {
            convId: cleanConvId,
            ownerId: ownerKey,
            type: convType,
            name: convName,
            avatarUrl: convAvatar,
            lastMessageText: lastMsg,
            lastSenderId: lastSender,
            memberIds: memberKeys,
            isPinned: false,
            isMuted: false,
            unreadCount: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(convRef, {
            name: convName,
            avatarUrl: convAvatar,
            lastMessageText: lastMsg,
            lastSenderId: lastSender,
            memberIds: memberKeys,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch {
      // Ignore transient Firestore error
    }
  }

  public async publishMessageToCloud(msg: Message): Promise<void> {
    if (!msg || !msg.id || !msg.conversationId) return;
    try {
      const members = this.data.conversationMembers.filter(m => m.conversationId === msg.conversationId);
      const senderUser = this.getUserById(msg.senderId);
      const senderKey = this.toCloudUsernameKey(senderUser?.username || msg.senderId) || 'user';
      if (this.isUserPurged(senderKey)) return;

      const ownerKeys = new Set<string>([senderKey]);
      for (const m of members) {
        const u = this.getUserById(m.userId);
        const k = this.toCloudUsernameKey(u?.username || m.userId);
        if (k && !this.isUserPurged(k)) ownerKeys.add(k);
      }

      const cleanMsgId = msg.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
      const cleanConvId = msg.conversationId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
      const allowedTypes = new Set(['text', 'image', 'file', 'voice', 'video', 'system']);
      const msgType = allowedTypes.has(msg.type) ? msg.type : 'text';
      const content = (msg.content || (msg.fileName ? `[Attachment: ${msg.fileName}]` : 'Attachment')).slice(0, 4000);
      const senderName = (senderUser?.displayName || senderKey || 'User').slice(0, 64);
      const senderAvatar = (
        senderUser?.avatarUrl ||
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(senderName)}`
      ).slice(0, 2048);

      for (const ownerKey of ownerKeys) {
        const ownerUser = this.getUserByUsername(ownerKey);
        if (ownerUser) {
          await this.publishUserToCloud(ownerUser);
        }
        const msgRef = doc(serverFirestore, 'users', ownerKey, 'messages', cleanMsgId);
        const snap = await getDoc(msgRef);
        if (!snap.exists()) {
          await setDoc(msgRef, {
            msgId: cleanMsgId,
            ownerId: ownerKey,
            conversationId: cleanConvId,
            senderId: senderKey,
            senderName,
            senderAvatar,
            content,
            type: msgType,
            mediaUrl: typeof msg.mediaUrl === 'string' && msg.mediaUrl.length <= 700000 ? msg.mediaUrl : '',
            fileName: (msg.fileName || '').slice(0, 256),
            fileSize: typeof msg.fileSize === 'number' && msg.fileSize >= 0 ? Math.min(msg.fileSize, 50000000) : 0,
            duration: typeof msg.duration === 'number' && msg.duration >= 0 ? Math.min(msg.duration, 86400) : 0,
            replyToId: (msg.replyToId || '').slice(0, 128),
            status: msg.status === 'read' ? 'read' : msg.status === 'delivered' ? 'delivered' : 'sent',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(msgRef, {
            content,
            status: msg.status === 'read' ? 'read' : msg.status === 'delivered' ? 'delivered' : 'sent',
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch {
      // Ignore transient Firestore error
    }
  }

  public async publishStoryToCloud(story: Story): Promise<void> {
    if (!story || !story.id) return;
    try {
      const author = this.getUserById(story.userId);
      const authorUid = this.toCloudUsernameKey(author?.username || story.userId) || 'user';
      if (this.isUserPurged(authorUid)) return;
      if (author) {
        await this.publishUserToCloud(author);
      }
      const cleanStoryId = story.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
      const authorName = (author?.displayName || authorUid || 'User').slice(0, 64);
      const authorAvatar = (
        author?.avatarUrl ||
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(authorName)}`
      ).slice(0, 2048);
      const storyRef = doc(serverFirestore, 'stories', cleanStoryId);
      const snap = await getDoc(storyRef);
      if (!snap.exists()) {
        await setDoc(storyRef, {
          storyId: cleanStoryId,
          authorUid,
          authorId: (story.userId || authorUid).slice(0, 128),
          authorName,
          authorAvatar,
          type: story.type === 'image' ? 'image' : 'text',
          text: (story.text || '').slice(0, 1000),
          mediaUrl: typeof story.mediaUrl === 'string' && story.mediaUrl.length <= 700000 ? story.mediaUrl : '',
          background: (story.background || '#111111').slice(0, 128),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Ignore transient Firestore error
    }
  }

  public isUserPurged(userOrStr?: Partial<User> | string | null): boolean {
    if (!userOrStr) return false;
    if (isSuperAdminIdentity(userOrStr)) return false;
    if (typeof userOrStr === 'string') {
      const raw = userOrStr.trim();
      if (!raw) return false;
      const clean = raw.toLowerCase().replace(/^@/, '');
      const norm = clean.replace(/[^a-z0-9_]/g, '_');
      if (PURGED_USER_IDS.has(raw) || PURGED_USER_IDS.has(clean) || PURGED_USER_IDS.has(norm)) {
        return true;
      }
      if (clean.includes('@')) {
        const prefix = clean.split('@')[0];
        const prefixNorm = prefix.replace(/[^a-z0-9_]/g, '_');
        if (PURGED_USER_IDS.has(prefix) || PURGED_USER_IDS.has(prefixNorm)) {
          return true;
        }
      }
      return false;
    }
    return (
      this.isUserPurged(userOrStr.id) ||
      this.isUserPurged(userOrStr.username) ||
      this.isUserPurged(userOrStr.email)
    );
  }

  public unpurgeUser(userOrStr?: Partial<User> | string | null): void {
    if (!userOrStr) return;
    const removeKey = (str?: string) => {
      if (!str) return;
      const raw = str.trim();
      const clean = raw.toLowerCase().replace(/^@/, '');
      const norm = clean.replace(/[^a-z0-9_]/g, '_');
      PURGED_USER_IDS.delete(raw);
      PURGED_USER_IDS.delete(clean);
      PURGED_USER_IDS.delete(norm);
      if (clean.includes('@')) {
        const prefix = clean.split('@')[0];
        PURGED_USER_IDS.delete(prefix);
        PURGED_USER_IDS.delete(prefix.replace(/[^a-z0-9_]/g, '_'));
      }
    };
    if (typeof userOrStr === 'string') {
      removeKey(userOrStr);
    } else {
      removeKey(userOrStr.id);
      removeKey(userOrStr.username);
      removeKey(userOrStr.email);
    }
    this.data.purgedUserIds = Array.from(PURGED_USER_IDS);
  }

  public async publishUserToCloud(user: User): Promise<void> {
    if (!user || (!user.id && !user.username)) return;
    if (this.isUserPurged(user)) return;
    try {
      let cleanUsername = (user.username || user.displayName || 'user')
        .trim()
        .toLowerCase()
        .replace(/^@/, '')
        .replace(/[^a-z0-9_]/g, '_')
        .slice(0, 32);
      if (cleanUsername.length < 2) cleanUsername = `user_${cleanUsername || '1'}`;
      if (cleanUsername === 'directory_reader' || cleanUsername === 'guest_viewer') return;

      const docId = cleanUsername;
      const cleanDisplayName = (user.displayName || cleanUsername).trim().slice(0, 64) || 'User';
      const cleanAppUserId = (user.id || docId).replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
      if (this.isUserPurged(cleanAppUserId) || this.isUserPurged(cleanUsername)) return;
      const cleanAvatarUrl = (
        user.avatarUrl ||
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(cleanDisplayName)}`
      ).slice(0, 2048);
      const cleanBio = (user.bio || 'Member of the encrypted communications mesh.').slice(0, 256);

      const userRef = doc(serverFirestore, 'users', docId);
      const createPayload = {
        uid: docId,
        appUserId: cleanAppUserId,
        username: cleanUsername,
        displayName: cleanDisplayName,
        avatarUrl: cleanAvatarUrl,
        bio: cleanBio,
        isOnline: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        await setDoc(userRef, createPayload);
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
    } catch {
      // Ignore transient cloud sync errors
    }
  }

  public async pullUsersFromCloud(force = false): Promise<User[]> {
    const now = Date.now();
    if (this.isCloudSyncing || (!force && now - this.lastCloudPullAt < 3000)) {
      return this.getUsers();
    }
    this.isCloudSyncing = true;
    this.lastCloudPullAt = now;
    try {
      const q = query(
        collection(serverFirestore, 'users'),
        limit(100)
      );
      const snapshot = await getDocs(q);
      const cloudUsers: Partial<User>[] = [];

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (!data || !data.username || !data.displayName) return;
        if (data.username === 'directory_reader' || data.username === 'guest_viewer') return;
        const resolvedId = data.appUserId || data.uid || docSnap.id;
        if (
          this.isUserPurged(resolvedId) ||
          this.isUserPurged(docSnap.id) ||
          this.isUserPurged(String(data.username))
        ) {
          return;
        }

        cloudUsers.push({
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

      if (cloudUsers.length > 0) {
        this.upsertExternalUsers(cloudUsers, false);
      }
    } catch {
      // Ignore cloud read error
    } finally {
      this.isCloudSyncing = false;
    }
    return this.getUsers();
  }

  private async initSql(): Promise<void> {
    try {
      await sqlStorage.init();
      sqlStorage.clearAll();
      for (const u of this.data.users) {
        sqlStorage.saveUser(u, u.passwordHash);
      }
      for (const c of this.data.conversations) {
        sqlStorage.saveConversation(c);
      }
      for (const m of this.data.conversationMembers) {
        sqlStorage.saveConversationMember(m);
      }
      for (const msg of this.data.messages) {
        sqlStorage.saveMessage(msg);
      }
      console.log('✅ SQLite SQL Storage initialized & synchronized with', this.data.messages.length, 'messages');
    } catch (err) {
      console.error('Failed to initialize SQLite storage', err);
    }
  }

  public clearAllData(): void {
    this.data = {
      users: [],
      sessions: [],
      conversations: [],
      conversationMembers: [],
      messages: [],
      stories: [],
      calls: [],
      folders: [],
      reports: [],
      blockedUsers: [],
      userSettings: {},
    };
    try {
      sqlStorage.clearAll();
    } catch (err) {
      console.warn('Failed to clear SQLite storage:', err);
    }
    this.saveSync();
  }

  private load(): DatabaseSchema {
    const DEMO_USER_IDS = PURGED_USER_IDS;

    const isDemoConversation = (id: string) =>
      id === 'c_jerima' ||
      id === 'c_lu' ||
      id === 'c_muzi' ||
      id === 'c_jia' ||
      id === 'c_amy' ||
      id === 'c_surf' ||
      id === 'c_dalonzo' ||
      id === 'c_frank' ||
      id === 'c_alice' ||
      id === 'c_bot' ||
      id === 'c_saved' ||
      id.startsWith('c_bot_') ||
      id.startsWith('c_jerima_') ||
      id.startsWith('c_saved_');

    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed: DatabaseSchema = JSON.parse(raw);

        if (Array.isArray(parsed.purgedUserIds)) {
          for (const pid of parsed.purgedUserIds) {
            if (pid && !isSuperAdminIdentity(pid)) {
              PURGED_USER_IDS.add(String(pid));
            }
          }
        }

        parsed.users = (parsed.users || []).filter(
          (u: any) => !DEMO_USER_IDS.has(u.id) && !DEMO_USER_IDS.has((u.username || '').toLowerCase())
        );
        parsed.sessions = (parsed.sessions || []).filter((s: any) => !DEMO_USER_IDS.has(s.userId));
        const convById = new Map<string, Conversation>();
        for (const c of parsed.conversations || []) {
          if (c && c.id && c.type !== 'channel' && !isDemoConversation(c.id)) {
            convById.set(c.id, c);
          }
        }
        parsed.conversations = Array.from(convById.values());
        const validConvIds = new Set(parsed.conversations.map((c: any) => c.id));

        const memByKey = new Map<string, ConversationMember>();
        for (const m of parsed.conversationMembers || []) {
          if (m && !DEMO_USER_IDS.has(m.userId) && validConvIds.has(m.conversationId)) {
            memByKey.set(`${m.conversationId}_${m.userId}`, m);
          }
        }
        parsed.conversationMembers = Array.from(memByKey.values());

        const msgById = new Map<string, Message>();
        for (const m of parsed.messages || []) {
          if (m && m.id && !DEMO_USER_IDS.has(m.senderId) && validConvIds.has(m.conversationId)) {
            msgById.set(m.id, m);
          }
        }
        parsed.messages = Array.from(msgById.values());
        parsed.stories = (parsed.stories || []).filter(
          (s: any) => !DEMO_USER_IDS.has(s.userId) && !String(s.id).startsWith('st_seed_') && s.id !== 'st_1' && s.id !== 'st_2'
        );
        parsed.calls = (parsed.calls || []).filter(
          (c: any) =>
            !DEMO_USER_IDS.has(c.callerId) &&
            !DEMO_USER_IDS.has(c.receiverId || '') &&
            !String(c.id).startsWith('call_seed_')
        );
        if (parsed.userSettings) {
          for (const id of DEMO_USER_IDS) {
            delete parsed.userSettings[id];
          }
        }
        parsed.purgedUserIds = Array.from(PURGED_USER_IDS);
        return parsed;
      }
    } catch (err) {
      console.error('Failed to load database, creating new state', err);
    }

    return {
      users: [],
      sessions: [],
      conversations: [],
      conversationMembers: [],
      messages: [],
      stories: [],
      calls: [],
      folders: [],
      reports: [],
      blockedUsers: [],
      userSettings: {},
      purgedUserIds: Array.from(PURGED_USER_IDS),
    };
  }

  public saveSync(): void {
    try {
      this.data.purgedUserIds = Array.from(PURGED_USER_IDS);
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write database file', err);
    }
  }

  private queueSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveSync();
      this.saveTimeout = null;
    }, 100);
  }

  public async purgeAllData(): Promise<void> {
    this.clearAllData();

    const existingUserDocIds = new Set<string>();
    try {
      const usersSnap = await getDocs(
        query(collection(serverFirestore, 'users'), limit(100))
      );
      usersSnap.forEach(d => {
        existingUserDocIds.add(d.id);
      });
    } catch {
      // Ignore query error
    }

    for (const uid of existingUserDocIds) {
      const subcollections = ['conversations', 'messages', 'files', 'notes'];
      for (const sub of subcollections) {
        try {
          const subSnap = await getDocs(query(collection(serverFirestore, 'users', uid, sub), limit(200)));
          for (const subDoc of subSnap.docs) {
            await deleteDoc(doc(serverFirestore, 'users', uid, sub, subDoc.id)).catch(() => {});
          }
        } catch {
          // Ignore subcollection error
        }
      }
      try {
        await deleteDoc(doc(serverFirestore, 'users', uid)).catch(() => {});
      } catch {
        // Ignore user delete error
      }
    }

    try {
      const storiesSnap = await getDocs(
        query(collection(serverFirestore, 'stories'), limit(100))
      );
      for (const sDoc of storiesSnap.docs) {
        await deleteDoc(doc(serverFirestore, 'stories', sDoc.id)).catch(() => {});
      }
    } catch {
      // Ignore stories delete error
    }

    this.clearAllData();
  }

  public resetAllData(): void {
    this.clearAllData();
    void this.purgeAllData();
  }

  public async clearAllChatsOnly(): Promise<void> {
    this.data.conversations = [];
    this.data.conversationMembers = [];
    this.data.messages = [];
    this.data.stories = [];
    this.data.calls = [];
    try {
      sqlStorage.clearAllChats();
    } catch {
      // Ignore SQLite error
    }
    this.saveSync();

    const existingUserDocIds = new Set<string>();
    try {
      const usersSnap = await getDocs(query(collection(serverFirestore, 'users'), limit(100)));
      usersSnap.forEach(d => {
        existingUserDocIds.add(d.id);
      });
    } catch {
      // Ignore
    }

    for (const uid of existingUserDocIds) {
      for (const sub of ['conversations', 'messages', 'files']) {
        try {
          const subSnap = await getDocs(query(collection(serverFirestore, 'users', uid, sub), limit(200)));
          for (const subDoc of subSnap.docs) {
            await deleteDoc(doc(serverFirestore, 'users', uid, sub, subDoc.id)).catch(() => {});
          }
        } catch {
          // Ignore
        }
      }
    }

    try {
      const storiesSnap = await getDocs(query(collection(serverFirestore, 'stories'), limit(100)));
      for (const sDoc of storiesSnap.docs) {
        await deleteDoc(doc(serverFirestore, 'stories', sDoc.id)).catch(() => {});
      }
    } catch {
      // Ignore
    }
  }

  public async deleteUserAccount(targetIdOrUsername: string, extraUser?: Partial<User>): Promise<string[]> {
    if (!targetIdOrUsername && !extraUser) return [];
    const raw = (targetIdOrUsername || extraUser?.id || extraUser?.username || '').trim();
    if (!raw || isSuperAdminIdentity(raw) || isSuperAdminIdentity(extraUser)) return [];
    const clean = raw.toLowerCase().replace(/^@/, '');
    const norm = clean.replace(/[^a-z0-9_]/g, '_');

    const matchedUsers = this.data.users.filter(
      u =>
        !isSuperAdminIdentity(u) &&
        (u.id === raw ||
          u.username.toLowerCase() === clean ||
          u.username.toLowerCase() === norm ||
          (u.email && u.email.toLowerCase() === clean) ||
          (extraUser?.id && u.id === extraUser.id) ||
          (extraUser?.username && u.username.toLowerCase() === extraUser.username.trim().toLowerCase()) ||
          (extraUser?.email && u.email && u.email.toLowerCase() === extraUser.email.trim().toLowerCase()))
    );

    const candidateDocIds = new Set<string>();
    const purgedKeys = new Set<string>();
    const addPurgeKey = (val?: string) => {
      if (!val || isSuperAdminIdentity(val)) return;
      const t = val.trim();
      if (!t) return;
      const c = t.toLowerCase().replace(/^@/, '');
      const n = c.replace(/[^a-z0-9_]/g, '_');
      PURGED_USER_IDS.add(t);
      PURGED_USER_IDS.add(c);
      if (n) {
        PURGED_USER_IDS.add(n);
        candidateDocIds.add(n.slice(0, 32));
      }
      candidateDocIds.add(t.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120));
      purgedKeys.add(t);
      purgedKeys.add(c);
      if (n) purgedKeys.add(n);
      if (c.includes('@')) {
        const prefix = c.split('@')[0];
        const prefixNorm = prefix.replace(/[^a-z0-9_]/g, '_');
        if (prefix) {
          PURGED_USER_IDS.add(prefix);
          purgedKeys.add(prefix);
        }
        if (prefixNorm) {
          PURGED_USER_IDS.add(prefixNorm);
          candidateDocIds.add(prefixNorm.slice(0, 32));
          purgedKeys.add(prefixNorm);
        }
      }
    };

    addPurgeKey(raw);
    if (extraUser) {
      addPurgeKey(extraUser.id);
      addPurgeKey(extraUser.username);
      addPurgeKey(extraUser.email);
    }

    for (const u of matchedUsers) {
      addPurgeKey(u.id);
      addPurgeKey(u.username);
      addPurgeKey(u.email);
      try {
        sqlStorage.deleteUser(u.id, u.username);
      } catch {
        // Ignore
      }
      delete this.data.userSettings[u.id];
    }

    try {
      sqlStorage.deleteUser(raw, norm);
    } catch {
      // Ignore
    }

    const removedUserIds = new Set<string>([
      raw,
      clean,
      norm,
      ...(extraUser?.id ? [extraUser.id] : []),
      ...matchedUsers.map(u => u.id),
    ]);

    this.data.users = this.data.users.filter(
      u =>
        isSuperAdminIdentity(u) ||
        (!removedUserIds.has(u.id) &&
          u.username.toLowerCase() !== clean &&
          u.username.toLowerCase() !== norm &&
          !this.isUserPurged(u))
    );
    this.data.sessions = this.data.sessions.filter(s => !removedUserIds.has(s.userId));
    this.data.blockedUsers = this.data.blockedUsers.filter(
      b => !removedUserIds.has(b.userId) && !removedUserIds.has(b.blockedUserId)
    );
    this.data.reports = this.data.reports.filter(
      r => !removedUserIds.has(r.reporterId) && !removedUserIds.has(r.reportedUserId || '')
    );

    // Find direct conversations involving the deleted user
    const directConvIdsToDelete = new Set<string>();
    for (const m of this.data.conversationMembers) {
      if (removedUserIds.has(m.userId) || purgedKeys.has(m.userId.toLowerCase())) {
        const conv = this.data.conversations.find(c => c.id === m.conversationId);
        if (conv && conv.type === 'direct') {
          directConvIdsToDelete.add(conv.id);
        }
      }
    }
    for (const c of this.data.conversations) {
      if (c.type === 'direct') {
        const lowerId = c.id.toLowerCase();
        if (
          (norm && lowerId.includes(norm)) ||
          Array.from(candidateDocIds).some(k => k.length >= 3 && lowerId.includes(k.toLowerCase()))
        ) {
          directConvIdsToDelete.add(c.id);
        }
      }
    }

    this.data.conversationMembers = this.data.conversationMembers.filter(
      m =>
        !removedUserIds.has(m.userId) &&
        !purgedKeys.has(m.userId.toLowerCase()) &&
        !directConvIdsToDelete.has(m.conversationId)
    );
    this.data.conversations = this.data.conversations.filter(c => !directConvIdsToDelete.has(c.id));
    this.data.messages = this.data.messages.filter(
      m =>
        !removedUserIds.has(m.senderId) &&
        !purgedKeys.has(m.senderId.toLowerCase()) &&
        !directConvIdsToDelete.has(m.conversationId)
    );
    this.data.stories = this.data.stories.filter(
      s => !removedUserIds.has(s.userId) && !purgedKeys.has(s.userId.toLowerCase())
    );
    this.data.calls = this.data.calls.filter(
      c =>
        !removedUserIds.has(c.callerId) &&
        !removedUserIds.has(c.receiverId || '') &&
        !purgedKeys.has(c.callerId.toLowerCase()) &&
        !purgedKeys.has((c.receiverId || '').toLowerCase())
    );

    this.saveSync();

    // Delete from Firestore (both the target user's docs AND direct conversations in other users' subcollections)
    const existingDocIdsToDelete = new Set<string>();
    const otherDocIds = new Set<string>();
    try {
      const snap = await getDocs(query(collection(serverFirestore, 'users'), limit(100)));
      snap.forEach(d => {
        const data = d.data();
        const docAppUserId = data?.appUserId
          ? String(data.appUserId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
          : '';
        const docUsername = data?.username
          ? String(data.username).trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '_').slice(0, 32)
          : '';
        if (
          candidateDocIds.has(d.id) ||
          (docAppUserId && candidateDocIds.has(docAppUserId)) ||
          (docUsername && candidateDocIds.has(docUsername))
        ) {
          existingDocIdsToDelete.add(d.id);
          if (docAppUserId) candidateDocIds.add(docAppUserId);
          if (docUsername) candidateDocIds.add(docUsername);
        } else {
          otherDocIds.add(d.id);
        }
      });
    } catch {
      for (const docId of candidateDocIds) {
        if (!docId) continue;
        try {
          const docSnap = await getDoc(doc(serverFirestore, 'users', docId));
          if (docSnap.exists()) {
            existingDocIdsToDelete.add(docId);
          }
        } catch {
          // Ignore
        }
      }
    }

    for (const docId of existingDocIdsToDelete) {
      for (const sub of ['conversations', 'messages', 'files', 'notes']) {
        try {
          const subSnap = await getDocs(query(collection(serverFirestore, 'users', docId, sub), limit(200)));
          for (const subDoc of subSnap.docs) {
            await deleteDoc(doc(serverFirestore, 'users', docId, sub, subDoc.id)).catch(() => {});
          }
        } catch {
          // Ignore
        }
      }
      try {
        await deleteDoc(doc(serverFirestore, 'users', docId)).catch(() => {});
      } catch {
        // Ignore
      }
    }

    // Also remove direct conversations and messages involving the deleted user from other users' Firestore collections
    for (const otherUid of otherDocIds) {
      try {
        const convSnap = await getDocs(
          query(collection(serverFirestore, 'users', otherUid, 'conversations'), limit(100))
        );
        for (const cDoc of convSnap.docs) {
          const cData = cDoc.data();
          const convId = String(cData?.convId || cDoc.id);
          const memberIds: string[] = Array.isArray(cData?.memberIds) ? cData.memberIds.map(String) : [];
          const involvesDeleted =
            memberIds.some(m => candidateDocIds.has(m) || purgedKeys.has(m.toLowerCase())) ||
            Array.from(candidateDocIds).some(
              k => k.length >= 3 && convId.toLowerCase().includes(k.toLowerCase())
            );
          if (involvesDeleted && cData?.type !== 'group') {
            directConvIdsToDelete.add(convId);
            await deleteDoc(doc(serverFirestore, 'users', otherUid, 'conversations', cDoc.id)).catch(() => {});
          }
        }
      } catch {
        // Ignore
      }

      try {
        const msgSnap = await getDocs(
          query(collection(serverFirestore, 'users', otherUid, 'messages'), limit(200))
        );
        for (const mDoc of msgSnap.docs) {
          const mData = mDoc.data();
          const senderId = String(mData?.senderId || '');
          const convId = String(mData?.conversationId || '');
          if (
            candidateDocIds.has(senderId) ||
            purgedKeys.has(senderId.toLowerCase()) ||
            directConvIdsToDelete.has(convId)
          ) {
            await deleteDoc(doc(serverFirestore, 'users', otherUid, 'messages', mDoc.id)).catch(() => {});
          }
        }
      } catch {
        // Ignore
      }
    }

    try {
      const storiesSnap = await getDocs(query(collection(serverFirestore, 'stories'), limit(100)));
      for (const sDoc of storiesSnap.docs) {
        const sData = sDoc.data();
        const authorUid = String(sData?.authorUid || '');
        const authorId = String(sData?.authorId || '');
        if (
          candidateDocIds.has(authorUid) ||
          candidateDocIds.has(authorId) ||
          purgedKeys.has(authorUid.toLowerCase())
        ) {
          await deleteDoc(doc(serverFirestore, 'stories', sDoc.id)).catch(() => {});
        }
      }
    } catch {
      // Ignore
    }

    return Array.from(purgedKeys);
  }

  // --- Users API ---
  public getUsers(): User[] {
    return this.data.users
      .filter(u => isSuperAdminIdentity(u) || !this.isUserPurged(u))
      .map(({ passwordHash, ...user }) => ({
        ...user,
        role: isSuperAdminIdentity(user) ? 'superadmin' : user.role,
      }));
  }

  public upsertExternalUsers(incomingUsers: Partial<User>[], publishToCloud = true): User[] {
    let changed = false;

    for (const raw of incomingUsers) {
      if (!raw || (!raw.id && !raw.username && !raw.email)) continue;
      if (this.isUserPurged(raw)) continue;
      const cleanEmail = (raw.email || '').trim().toLowerCase();
      const cleanUsername = (raw.username || cleanEmail.split('@')[0] || raw.displayName || '')
        .trim()
        .toLowerCase()
        .replace(/^@/, '')
        .replace(/[^a-z0-9_]/g, '_');

      if (
        !cleanUsername ||
        cleanUsername === 'directory_reader' ||
        cleanUsername === 'guest_viewer' ||
        this.isUserPurged(cleanUsername) ||
        this.isUserPurged(cleanEmail)
      ) {
        continue;
      }

      const existingIdx = this.data.users.findIndex(
        u =>
          (raw.id && u.id === raw.id) ||
          (cleanUsername && u.username.toLowerCase() === cleanUsername) ||
          (cleanEmail && u.email && u.email.toLowerCase() === cleanEmail)
      );

      if (existingIdx >= 0) {
        const curr = this.data.users[existingIdx];
        let updated = false;
        if (raw.displayName && raw.displayName !== curr.displayName) {
          curr.displayName = raw.displayName;
          updated = true;
        }
        if (raw.avatarUrl && !curr.avatarUrl) {
          curr.avatarUrl = raw.avatarUrl;
          updated = true;
        }
        if (updated) changed = true;
      } else {
        const displayName =
          (raw.displayName || cleanUsername)
            .trim() || 'User';
        const newUser: User & { passwordHash: string } = {
          id: raw.id || `u_ext_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          username: cleanUsername.slice(0, 28),
          displayName,
          email: cleanEmail || `${cleanUsername}@aether.chat`,
          phone: raw.phone,
          avatarUrl:
            raw.avatarUrl ||
            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`,
          bio: raw.bio || 'Member of the encrypted communications mesh.',
          onlineStatus: raw.isOnline ? 'online' : 'online',
          isOnline: true,
          lastSeen: new Date().toISOString(),
          createdAt: raw.createdAt || new Date().toISOString(),
          role: isSuperAdminIdentity(raw) || isSuperAdminIdentity(cleanUsername) ? 'superadmin' : 'user',
          passwordHash: '',
        };
        this.data.users.push(newUser);
        changed = true;
        try {
          sqlStorage.saveUser(newUser, '');
        } catch {
          // Ignore SQLite error
        }
        if (publishToCloud) {
          void this.publishUserToCloud(newUser);
        }
      }
    }

    if (changed) {
      this.queueSave();
    }
    return this.getUsers();
  }

  public getUserById(id: string): User | undefined {
    if (!id) return undefined;
    const user = this.data.users.find(u => u.id === id) || this.getUserByUsername(id);
    if (!user) return undefined;
    const { passwordHash, ...safeUser } = user;
    if (isSuperAdminIdentity(safeUser)) {
      safeUser.role = 'superadmin';
    }
    return safeUser;
  }

  public isSameUser(idOrNameA?: string, idOrNameB?: string): boolean {
    if (!idOrNameA || !idOrNameB) return false;
    if (idOrNameA === idOrNameB) return true;
    const cleanA = idOrNameA.trim().toLowerCase().replace(/^@/, '');
    const cleanB = idOrNameB.trim().toLowerCase().replace(/^@/, '');
    if (cleanA === cleanB) return true;

    const uA = this.getUserById(idOrNameA);
    const uB = this.getUserById(idOrNameB);
    if (uA && uB) {
      if (uA.id === uB.id) return true;
      if (uA.username.toLowerCase() === uB.username.toLowerCase()) return true;
    }
    if (uA && (uA.id === idOrNameB || uA.username.toLowerCase() === cleanB)) return true;
    if (uB && (uB.id === idOrNameA || uB.username.toLowerCase() === cleanA)) return true;
    return false;
  }

  public getUserByUsername(username: string): (User & { passwordHash: string }) | undefined {
    const clean = username.trim().toLowerCase().replace(/^@/, '');
    const normalized = clean.replace(/[^a-z0-9_]/g, '_');
    return this.data.users.find(
      u =>
        u.username.toLowerCase() === clean ||
        u.username.toLowerCase() === normalized ||
        u.displayName.toLowerCase() === clean
    );
  }

  public getUserByEmail(email: string): (User & { passwordHash: string }) | undefined {
    const clean = email.trim().toLowerCase();
    return this.data.users.find(u => u.email.toLowerCase() === clean);
  }

  public updateUserPassword(id: string, passwordHash: string): void {
    const idx = this.data.users.findIndex(u => u.id === id);
    if (idx === -1) return;
    this.data.users[idx].passwordHash = passwordHash;
    this.queueSave();
    try {
      sqlStorage.saveUser(this.data.users[idx], passwordHash);
    } catch (err) {
      console.error('Failed to update user password in SQLite', err);
    }
  }

  public createUser(user: User & { passwordHash: string }): User {
    if (isSuperAdminIdentity(user)) {
      user.role = 'superadmin';
    }
    PURGED_USER_IDS.delete(user.id);
    if (user.username) {
      PURGED_USER_IDS.delete(user.username.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
    }
    this.data.users.push(user);
    this.data.userSettings[user.id] = {
      theme: 'dark',
      accent: 'aurora',
      fontSize: 'md',
      glassIntensity: 'high',
      notifications: { messages: true, calls: true, mentionsOnly: false, preview: true, sound: true },
      privacy: { lastSeen: 'everyone', readReceipts: true, profilePhoto: 'everyone', stories: 'everyone', disappearingDefault: 0 },
      mediaAutoDownload: { photos: true, videos: false, documents: true, audio: true },
    };

    this.queueSave();
    try {
      sqlStorage.saveUser(user, user.passwordHash);
    } catch (err) {
      console.error('Failed to save user to SQLite', err);
    }
    const { passwordHash, ...safeUser } = user;
    void this.publishUserToCloud(safeUser);
    return safeUser;
  }

  public updateUser(id: string, updates: Partial<User>): User | undefined {
    const idx = this.data.users.findIndex(u => u.id === id);
    if (idx === -1) return undefined;

    this.data.users[idx] = { ...this.data.users[idx], ...updates };
    this.queueSave();
    try {
      sqlStorage.saveUser(this.data.users[idx], this.data.users[idx].passwordHash);
    } catch (err) {
      console.error('Failed to update user in SQLite', err);
    }
    const { passwordHash, ...safeUser } = this.data.users[idx];
    void this.publishUserToCloud(safeUser);
    return safeUser;
  }

  public setUserOnline(userId: string, isOnline: boolean): void {
    const user = this.data.users.find(u => this.isSameUser(u.id, userId));
    if (user) {
      user.isOnline = isOnline;
      user.onlineStatus = isOnline ? 'online' : 'offline';
      user.lastSeen = new Date().toISOString();
      this.queueSave();
    }
  }

  // --- Conversations API ---
  public getUserConversations(userId: string): Conversation[] {
    const selfUser = this.getUserById(userId);
    const selfUsername = selfUser?.username?.toLowerCase();

    // Also auto-link any c_dm_<u1>__<u2> conversation where this user is one of the participants
    if (selfUsername) {
      for (const c of this.data.conversations) {
        if (c.id.startsWith('c_dm_')) {
          const parts = c.id.slice('c_dm_'.length).split('__');
          if (parts.includes(selfUsername)) {
            const hasMem = this.data.conversationMembers.some(
              cm => cm.conversationId === c.id && this.isSameUser(cm.userId, userId)
            );
            if (!hasMem) {
              this.data.conversationMembers.push({
                id: `cm_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                conversationId: c.id,
                userId,
                role: 'member',
                permissions: {
                  canSendMessages: true,
                  canAddMembers: true,
                  canPinMessages: true,
                  canDeleteMessages: true,
                  canManageCalls: true,
                },
                joinedAt: c.createdAt,
              });
            }
          }
        }
      }
    }

    const memberRecords = this.data.conversationMembers.filter(cm =>
      this.isSameUser(cm.userId, userId)
    );
    const convIds = Array.from(new Set(memberRecords.map(cm => cm.conversationId)));

    const convs = this.data.conversations
      .filter(c => c.type !== 'channel' && convIds.includes(c.id))
      .map(c => {
        const mem = memberRecords.find(m => m.conversationId === c.id);
        const rawMembers = this.data.conversationMembers.filter(m => m.conversationId === c.id);
        const seenUserKeys = new Set<string>();
        const allMembers: ConversationMember[] = [];

        for (const m of rawMembers) {
          const resolvedUser = this.getUserById(m.userId);
          const key = resolvedUser?.username?.toLowerCase() || resolvedUser?.id || m.userId;
          if (seenUserKeys.has(key)) continue;
          seenUserKeys.add(key);
          allMembers.push({
            ...m,
            userId: resolvedUser?.id || m.userId,
            user: resolvedUser,
          });
        }

        // Fetch last message
        const messages = this.data.messages.filter(m => m.conversationId === c.id);
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;

        // Count unread
        const unreadCount = messages.filter(
          m => !this.isSameUser(m.senderId, userId) && m.status !== 'read'
        ).length;

        // For direct chats, dynamically set name and avatar to other participant
        let name = c.name;
        let avatarUrl = c.avatarUrl;
        if (c.type === 'direct') {
          const otherMember = allMembers.find(m => !this.isSameUser(m.userId, userId));
          if (otherMember && otherMember.user) {
            name = otherMember.user.displayName;
            avatarUrl = otherMember.user.avatarUrl;
          }
        }

        return {
          ...c,
          name,
          avatarUrl,
          members: allMembers,
          lastMessage,
          unreadCount,
          isPinned: mem?.isPinned || false,
          isArchived: mem?.isArchived || false,
          isMuted: mem?.isMuted || false,
        };
      });

    return convs.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const timeA = a.lastMessage?.createdAt || a.createdAt;
      const timeB = b.lastMessage?.createdAt || b.createdAt;
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    });
  }

  public getConversationById(convId: string, currentUserId?: string): Conversation | undefined {
    const c = this.data.conversations.find(conv => conv.id === convId);
    if (!c) return undefined;

    const rawMembers = this.data.conversationMembers.filter(m => m.conversationId === c.id);
    const seenUserKeys = new Set<string>();
    const allMembers: ConversationMember[] = [];

    for (const m of rawMembers) {
      const resolvedUser = this.getUserById(m.userId);
      const key = resolvedUser?.username?.toLowerCase() || resolvedUser?.id || m.userId;
      if (seenUserKeys.has(key)) continue;
      seenUserKeys.add(key);
      allMembers.push({
        ...m,
        userId: resolvedUser?.id || m.userId,
        user: resolvedUser,
      });
    }

    const messages = this.data.messages.filter(m => m.conversationId === c.id);
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;

    let name = c.name;
    let avatarUrl = c.avatarUrl;
    if (c.type === 'direct' && currentUserId) {
      const otherMember = allMembers.find(m => !this.isSameUser(m.userId, currentUserId));
      if (otherMember && otherMember.user) {
        name = otherMember.user.displayName;
        avatarUrl = otherMember.user.avatarUrl;
      }
    }

    const mem = currentUserId
      ? this.data.conversationMembers.find(
          m => m.conversationId === c.id && this.isSameUser(m.userId, currentUserId)
        )
      : undefined;

    return {
      ...c,
      name,
      avatarUrl,
      members: allMembers,
      lastMessage,
      isPinned: mem?.isPinned || false,
      isArchived: mem?.isArchived || false,
      isMuted: mem?.isMuted || false,
    };
  }

  public ensureConversationExists(
    convId: string,
    senderId: string,
    meta?: {
      type?: 'direct' | 'group' | 'channel' | 'saved';
      name?: string;
      description?: string;
      avatarUrl?: string;
      memberIds?: string[];
      memberUsers?: Partial<User>[];
    }
  ): Conversation {
    if (Array.isArray(meta?.memberUsers) && meta!.memberUsers.length > 0) {
      this.upsertExternalUsers(meta!.memberUsers, false);
    }

    const dmParts = convId.startsWith('c_dm_')
      ? convId.slice('c_dm_'.length).split('__').filter(Boolean)
      : [];

    const allCandidateIds = Array.from(
      new Set([
        senderId,
        ...(meta?.memberIds || []),
        ...dmParts,
      ])
    ).filter(Boolean);

    let conv = this.data.conversations.find(c => c.id === convId);
    const now = new Date().toISOString();

    if (!conv) {
      const convType = meta?.type || 'direct';
      const convName = meta?.name || 'Direct Chat';
      conv = {
        id: convId,
        type: convType,
        name: convName,
        description: meta?.description,
        avatarUrl:
          meta?.avatarUrl ||
          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(convName)}`,
        isPrivate: true,
        isEncrypted: convType !== 'channel',
        createdAt: now,
        createdBy: senderId,
        members: [],
      };
      this.data.conversations.push(conv);
      try {
        sqlStorage.saveConversation(conv);
      } catch {
        // Ignore
      }
    }

    let membersChanged = false;
    for (const candidate of allCandidateIds) {
      const resolvedUser = this.getUserById(candidate);
      const canonicalUserId = resolvedUser?.id || candidate;
      const alreadyMember = this.data.conversationMembers.some(
        m => m.conversationId === convId && this.isSameUser(m.userId, canonicalUserId)
      );
      if (!alreadyMember) {
        const mem: ConversationMember = {
          id: `cm_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          conversationId: convId,
          userId: canonicalUserId,
          role: this.isSameUser(canonicalUserId, senderId) ? 'owner' : 'member',
          permissions: {
            canSendMessages: true,
            canAddMembers: true,
            canPinMessages: true,
            canDeleteMessages: true,
            canManageCalls: true,
          },
          joinedAt: now,
        };
        this.data.conversationMembers.push(mem);
        membersChanged = true;
      }
    }

    if (membersChanged) {
      this.queueSave();
    }

    return this.getConversationById(convId, senderId)!;
  }

  public createConversation(
    creatorId: string,
    data: {
      id?: string;
      type: 'direct' | 'group' | 'channel' | 'saved';
      name: string;
      description?: string;
      avatarUrl?: string;
      username?: string;
      isPrivate?: boolean;
      memberIds?: string[];
    }
  ): Conversation {
    const creatorUser = this.getUserById(creatorId);
    const otherRawId = data.memberIds?.[0];
    const otherUser = otherRawId ? this.getUserById(otherRawId) : undefined;

    let convId = data.id;
    if (!convId) {
      if (data.type === 'direct' && (otherUser || otherRawId)) {
        const keyA = (creatorUser?.username || creatorId)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_');
        const keyB = (otherUser?.username || otherRawId || 'peer')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_');
        const sorted = [keyA, keyB].sort();
        convId = `c_dm_${sorted[0]}__${sorted[1]}`;
      } else {
        convId = `c_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      }
    }

    const existingById = this.data.conversations.find(c => c.id === convId);
    if (existingById) {
      return this.ensureConversationExists(convId, creatorId, {
        type: data.type,
        name: data.name,
        description: data.description,
        avatarUrl: data.avatarUrl,
        memberIds: data.memberIds,
      });
    }

    const now = new Date().toISOString();

    const newConv: Conversation = {
      id: convId,
      type: data.type,
      name: data.name,
      description: data.description,
      avatarUrl: data.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.name)}`,
      username: data.username,
      isPrivate: data.isPrivate ?? true,
      isEncrypted: data.type !== 'channel',
      createdAt: now,
      createdBy: creatorId,
      members: [],
      subscriberCount: data.type === 'channel' ? 1 : undefined,
    };

    this.data.conversations.push(newConv);

    this.data.conversationMembers.push({
      id: `cm_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      conversationId: convId,
      userId: creatorId,
      role: 'owner',
      permissions: { canSendMessages: true, canAddMembers: true, canPinMessages: true, canDeleteMessages: true, canManageCalls: true },
      joinedAt: now,
    });

    if (data.memberIds) {
      data.memberIds.forEach(mId => {
        const resolvedMember = this.getUserById(mId);
        const targetMemberId = resolvedMember?.id || mId;
        if (!this.isSameUser(targetMemberId, creatorId)) {
          this.data.conversationMembers.push({
            id: `cm_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            conversationId: convId,
            userId: targetMemberId,
            role: 'member',
            permissions: {
              canSendMessages: data.type !== 'channel',
              canAddMembers: false,
              canPinMessages: false,
              canDeleteMessages: false,
              canManageCalls: true,
            },
            joinedAt: now,
          });
        }
      });
    }

    this.queueSave();
    try {
      sqlStorage.saveConversation(newConv);
    } catch (err) {
      console.error('Failed to save conversation to SQLite', err);
    }
    const hydrated = this.getConversationById(convId, creatorId)!;
    void this.publishConversationToCloud(hydrated);
    return hydrated;
  }

  public togglePinConversation(conversationId: string, userId: string): boolean {
    const mem = this.data.conversationMembers.find(m => m.conversationId === conversationId && m.userId === userId);
    if (!mem) return false;
    mem.isPinned = !mem.isPinned;
    this.queueSave();
    return mem.isPinned;
  }

  public toggleArchiveConversation(conversationId: string, userId: string): boolean {
    const mem = this.data.conversationMembers.find(m => m.conversationId === conversationId && m.userId === userId);
    if (!mem) return false;
    mem.isArchived = !mem.isArchived;
    this.queueSave();
    return mem.isArchived;
  }

  public toggleMuteConversation(conversationId: string, userId: string): boolean {
    const mem = this.data.conversationMembers.find(m => m.conversationId === conversationId && m.userId === userId);
    if (!mem) return false;
    mem.isMuted = !mem.isMuted;
    this.queueSave();
    return mem.isMuted;
  }

  public addMemberToConversation(conversationId: string, userId: string): boolean {
    const existing = this.data.conversationMembers.find(m => m.conversationId === conversationId && m.userId === userId);
    if (existing) return true;

    this.data.conversationMembers.push({
      id: `cm_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      conversationId,
      userId,
      role: 'member',
      permissions: { canSendMessages: true, canAddMembers: false, canPinMessages: false, canDeleteMessages: false, canManageCalls: true },
      joinedAt: new Date().toISOString(),
    });

    const conv = this.data.conversations.find(c => c.id === conversationId);
    if (conv && conv.subscriberCount !== undefined) {
      conv.subscriberCount += 1;
    }

    this.queueSave();
    return true;
  }

  public removeMemberFromConversation(conversationId: string, userId: string): boolean {
    this.data.conversationMembers = this.data.conversationMembers.filter(
      m => !(m.conversationId === conversationId && m.userId === userId)
    );

    const conv = this.data.conversations.find(c => c.id === conversationId);
    if (conv && conv.subscriberCount && conv.subscriberCount > 0) {
      conv.subscriberCount -= 1;
    }

    this.queueSave();
    return true;
  }

  public clearConversationMessages(conversationId: string): boolean {
    this.data.messages = this.data.messages.filter(m => m.conversationId !== conversationId);
    this.queueSave();
    try {
      sqlStorage.clearConversationMessages(conversationId);
    } catch (err) {
      console.error('Failed to clear conversation messages in SQLite', err);
    }
    return true;
  }

  public deleteConversation(conversationId: string): boolean {
    const existed = this.data.conversations.some(c => c.id === conversationId);
    this.data.conversations = this.data.conversations.filter(c => c.id !== conversationId);
    this.data.conversationMembers = this.data.conversationMembers.filter(
      m => m.conversationId !== conversationId
    );
    this.data.messages = this.data.messages.filter(m => m.conversationId !== conversationId);
    this.queueSave();
    try {
      sqlStorage.deleteConversation(conversationId);
    } catch (err) {
      console.error('Failed to delete conversation in SQLite', err);
    }
    return existed || true;
  }

  // --- Messages API ---
  public getMessages(conversationId: string): Message[] {
    const matchingConvIds = new Set<string>([conversationId]);
    const targetConv = this.data.conversations.find(c => c.id === conversationId);
    const targetMembers = this.data.conversationMembers
      .filter(m => m.conversationId === conversationId)
      .map(m => m.userId);

    const dmParts = conversationId.startsWith('c_dm_')
      ? conversationId.slice('c_dm_'.length).split('__').filter(Boolean)
      : [];
    const peerIdentities = Array.from(new Set([...targetMembers, ...dmParts]));

    if ((targetConv?.type === 'direct' || conversationId.startsWith('c_dm_')) && peerIdentities.length === 2) {
      const [userA, userB] = peerIdentities;
      for (const c of this.data.conversations) {
        if (c.type !== 'direct' && !c.id.startsWith('c_dm_')) continue;
        const cMembers = this.data.conversationMembers
          .filter(m => m.conversationId === c.id)
          .map(m => m.userId);
        const cDmParts = c.id.startsWith('c_dm_')
          ? c.id.slice('c_dm_'.length).split('__').filter(Boolean)
          : [];
        const allC = [...cMembers, ...cDmParts];
        if (
          allC.some(id => this.isSameUser(id, userA)) &&
          allC.some(id => this.isSameUser(id, userB))
        ) {
          matchingConvIds.add(c.id);
        }
      }
    }

    const byId = new Map<string, Message>();
    for (const m of this.data.messages) {
      if (m && m.id && matchingConvIds.has(m.conversationId) && !m.isDeletedForEveryone) {
        byId.set(m.id, {
          ...m,
          conversationId,
          sender: this.getUserById(m.senderId),
        });
      }
    }
    return Array.from(byId.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  public getMessageById(messageId: string): Message | undefined {
    const m = this.data.messages.find(msg => msg.id === messageId);
    if (!m) return undefined;
    return {
      ...m,
      sender: this.getUserById(m.senderId),
    };
  }

  public createMessage(msgData: Omit<Message, 'id' | 'createdAt' | 'reactions' | 'status'> & { id?: string }): Message {
    const now = new Date().toISOString();
    let id = msgData.id || `m_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
    if (!msgData.id) {
      while (this.data.messages.some(m => m.id === id)) {
        id = `m_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
      }
    }

    let replyTo: Message['replyTo'] | undefined;
    if (msgData.replyToId) {
      const orig = this.data.messages.find(m => m.id === msgData.replyToId);
      if (orig) {
        const sender = this.getUserById(orig.senderId);
        replyTo = {
          id: orig.id,
          senderName: sender?.displayName || 'User',
          content: orig.content,
          type: orig.type,
        };
      }
    }

    const newMsg: Message = {
      ...msgData,
      id,
      createdAt: now,
      status: 'sent',
      reactions: [],
      replyTo,
    };

    const existingIdx = this.data.messages.findIndex(m => m.id === id);
    if (existingIdx >= 0) {
      this.data.messages[existingIdx] = newMsg;
    } else {
      this.data.messages.push(newMsg);
    }
    this.queueSave();
    try {
      sqlStorage.saveMessage(newMsg);
    } catch (err) {
      console.error('Failed to save message to SQLite', err);
    }
    void this.publishMessageToCloud(newMsg);

    return {
      ...newMsg,
      sender: this.getUserById(newMsg.senderId),
    };
  }

  public updateMessage(messageId: string, senderId: string, content: string): Message | null {
    const msg = this.data.messages.find(m => m.id === messageId);
    if (!msg || msg.senderId !== senderId) return null;

    msg.content = content;
    msg.isEdited = true;
    msg.editedAt = new Date().toISOString();
    this.queueSave();
    try {
      sqlStorage.saveMessage(msg);
    } catch (err) {
      console.error('Failed to update message in SQLite', err);
    }

    return {
      ...msg,
      sender: this.getUserById(msg.senderId),
    };
  }

  public updateMessageTranscription(messageId: string, transcription: string): Message | null {
    const msg = this.data.messages.find(m => m.id === messageId);
    if (!msg) return null;

    msg.transcription = transcription;
    this.queueSave();
    try {
      sqlStorage.saveMessage(msg);
    } catch (err) {
      console.error('Failed to update message transcription in SQLite', err);
    }

    return {
      ...msg,
      sender: this.getUserById(msg.senderId),
    };
  }

  public deleteMessage(messageId: string, userId: string, forEveryone: boolean): boolean {
    const msg = this.data.messages.find(m => m.id === messageId);
    if (!msg) return false;

    if (forEveryone) {
      msg.isDeletedForEveryone = true;
      msg.content = 'This message was deleted.';
      try {
        sqlStorage.saveMessage(msg);
      } catch (err) {
        console.error('Failed to update deleted message in SQLite', err);
      }
    } else {
      this.data.messages = this.data.messages.filter(m => m.id !== messageId);
      try {
        sqlStorage.deleteMessage(messageId);
      } catch (err) {
        console.error('Failed to delete message in SQLite', err);
      }
    }
    this.queueSave();
    return true;
  }

  public markMessagesAsRead(conversationId: string, userId: string): void {
    const mem = this.data.conversationMembers.find(m => m.conversationId === conversationId && m.userId === userId);
    if (mem) {
      mem.unreadCount = 0;
    }
    this.data.messages.forEach(m => {
      if (m.conversationId === conversationId && m.senderId !== userId) {
        m.status = 'read';
      }
    });
    this.queueSave();
    try {
      sqlStorage.markMessagesRead(conversationId, userId);
    } catch (err) {
      console.error('Failed to mark messages as read in SQLite', err);
    }
  }

  public toggleReaction(messageId: string, userId: string, emoji: string): Message | null {
    const msg = this.data.messages.find(m => m.id === messageId);
    if (!msg) return null;

    if (!msg.reactions) msg.reactions = [];
    const existingIdx = msg.reactions.findIndex(r => r.userId === userId && r.emoji === emoji);

    if (existingIdx !== -1) {
      msg.reactions.splice(existingIdx, 1);
    } else {
      const user = this.getUserById(userId);
      msg.reactions.push({
        id: `r_${Date.now()}`,
        messageId,
        userId,
        emoji,
        userDisplayName: user?.displayName || 'User',
      });
    }

    this.queueSave();
    try {
      sqlStorage.saveMessage(msg);
    } catch (err) {
      console.error('Failed to update message reaction in SQLite', err);
    }
    return {
      ...msg,
      sender: this.getUserById(msg.senderId),
    };
  }

  public togglePinMessage(messageId: string): Message | null {
    const msg = this.data.messages.find(m => m.id === messageId);
    if (!msg) return null;
    msg.isPinned = !msg.isPinned;
    this.queueSave();
    return {
      ...msg,
      sender: this.getUserById(msg.senderId),
    };
  }

  public votePoll(messageId: string, optionId: string, userId: string): Message | null {
    const msg = this.data.messages.find(m => m.id === messageId);
    if (!msg || !msg.poll) return null;

    const opt = msg.poll.options.find(o => o.id === optionId);
    if (!opt) return null;

    if (!msg.poll.isMultiple) {
      msg.poll.options.forEach(o => {
        o.voterIds = o.voterIds.filter(v => v !== userId);
      });
      opt.voterIds.push(userId);
    } else {
      if (opt.voterIds.includes(userId)) {
        opt.voterIds = opt.voterIds.filter(v => v !== userId);
      } else {
        opt.voterIds.push(userId);
      }
    }

    this.queueSave();
    return {
      ...msg,
      sender: this.getUserById(msg.senderId),
    };
  }

  // --- Stories API ---
  public getActiveStories(): Story[] {
    const now = new Date().toISOString();
    return this.data.stories
      .filter(s => s.expiresAt > now)
      .map(s => ({
        ...s,
        user: this.getUserById(s.userId),
      }));
  }

  public createStory(storyData: Omit<Story, 'id' | 'createdAt' | 'expiresAt' | 'viewers'>): Story {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 3600000).toISOString();
    const newStory: Story = {
      ...storyData,
      id: `st_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      createdAt: now.toISOString(),
      expiresAt,
      viewers: [],
    };
    this.data.stories.push(newStory);
    this.queueSave();
    void this.publishStoryToCloud(newStory);
    return {
      ...newStory,
      user: this.getUserById(newStory.userId),
    };
  }

  public viewStory(storyId: string, userId: string): void {
    const story = this.data.stories.find(s => s.id === storyId);
    if (story && !story.viewers.includes(userId)) {
      story.viewers.push(userId);
      this.queueSave();
    }
  }

  public updateStory(storyId: string, userId: string, updateData: Partial<Story>): Story | null {
    const story = this.data.stories.find(s => s.id === storyId);
    if (!story) return null;
    if (story.userId !== userId) return null;

    Object.assign(story, {
      ...updateData,
      isEdited: true,
      editedAt: new Date().toISOString(),
    });
    this.queueSave();
    return {
      ...story,
      user: this.getUserById(story.userId),
    };
  }

  public deleteStory(storyId: string, userId: string): boolean {
    const idx = this.data.stories.findIndex(s => s.id === storyId);
    if (idx === -1) return false;
    if (this.data.stories[idx].userId !== userId) return false;

    this.data.stories.splice(idx, 1);
    this.queueSave();
    return true;
  }

  // --- Calls API ---
  public getCallById(callId: string): Call | null {
    const call = this.data.calls.find(c => c.id === callId);
    if (!call) return null;

    const receiver =
      (call.receiverId ? this.getUserById(call.receiverId) : undefined) ||
      (call.receiverId?.startsWith('dial_')
        ? {
            id: call.receiverId,
            displayName: call.receiverId.replace('dial_', ''),
            username: call.receiverId.replace('dial_', ''),
            avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(call.receiverId.replace('dial_', ''))}`,
            email: `${call.receiverId.replace('dial_', '')}@phone.call`,
            isOnline: true,
            onlineStatus: 'online' as const,
            createdAt: new Date().toISOString(),
            role: 'user' as const,
          }
        : undefined);

    return {
      ...call,
      caller: this.getUserById(call.callerId),
      receiver,
    };
  }

  public createCall(
    callerId: string,
    receiverId: string,
    conversationId: string,
    type: 'voice' | 'video',
    customCallId?: string
  ): Call {
    const resolvedCaller = this.getUserById(callerId);
    const resolvedReceiver =
      receiverId && !receiverId.startsWith('dial_') ? this.getUserById(receiverId) : undefined;
    const effectiveCallerId = resolvedCaller?.id || callerId;
    const effectiveReceiverId = resolvedReceiver?.id || receiverId;

    if (customCallId) {
      const existing = this.getCallById(customCallId);
      if (existing) return existing;
    }

    // End any stale ringing calls from the same caller
    this.data.calls.forEach(c => {
      if (
        (this.isSameUser(c.callerId, effectiveCallerId) ||
          this.isSameUser(c.receiverId, effectiveCallerId)) &&
        (c.status === 'ringing' || c.status === 'initiating')
      ) {
        c.status = 'ended';
        c.endedAt = new Date().toISOString();
      }
    });

    const newCall: Call = {
      id: customCallId || `call_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      callerId: effectiveCallerId,
      receiverId: effectiveReceiverId,
      conversationId: conversationId || 'c_direct_call',
      type,
      status: 'ringing',
      startedAt: new Date().toISOString(),
    };
    this.data.calls.push(newCall);
    this.queueSave();

    return this.getCallById(newCall.id)!;
  }

  public updateCallStatus(callId: string, status: Call['status'], type?: 'voice' | 'video'): Call | null {
    const call = this.data.calls.find(c => c.id === callId);
    if (!call) return null;

    const prevStatus = call.status;
    call.status = status;
    if (type) {
      call.type = type;
    }

    if (status === 'active' && prevStatus !== 'active') {
      // Reset startedAt to when the call was actually answered for accurate talk-time duration
      call.startedAt = new Date().toISOString();
    } else if (status === 'ended' || status === 'rejected' || status === 'missed') {
      call.endedAt = new Date().toISOString();
      if (status === 'rejected' || status === 'missed' || prevStatus === 'ringing' || prevStatus === 'initiating') {
        call.duration = 0;
        if (prevStatus === 'ringing' && status === 'ended') {
          call.status = 'missed';
        }
      } else {
        const start = new Date(call.startedAt).getTime();
        const end = new Date(call.endedAt).getTime();
        call.duration = Math.max(1, Math.floor((end - start) / 1000));
      }
    }

    this.queueSave();
    return this.getCallById(callId);
  }

  public getUserCalls(userId: string): Call[] {
    return (this.data.calls || [])
      .filter(c => this.isSameUser(c.callerId, userId) || this.isSameUser(c.receiverId, userId))
      .map(c => this.getCallById(c.id)!)
      .filter(Boolean)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  // --- User Settings API ---
  public getUserSettings(userId: string): UserSettings {
    if (!this.data.userSettings[userId]) {
      this.data.userSettings[userId] = {
        theme: 'dark',
        accent: 'aurora',
        fontSize: 'md',
        glassIntensity: 'high',
        notifications: { messages: true, calls: true, mentionsOnly: false, preview: true, sound: true },
        privacy: { lastSeen: 'everyone', readReceipts: true, profilePhoto: 'everyone', stories: 'everyone', disappearingDefault: 0 },
        mediaAutoDownload: { photos: true, videos: false, documents: true, audio: true },
      };
      this.queueSave();
    }
    return this.data.userSettings[userId];
  }

  public updateUserSettings(userId: string, updates: Partial<UserSettings>): UserSettings {
    const current = this.getUserSettings(userId);
    this.data.userSettings[userId] = {
      ...current,
      ...updates,
      notifications: { ...current.notifications, ...(updates.notifications || {}) },
      privacy: { ...current.privacy, ...(updates.privacy || {}) },
      mediaAutoDownload: { ...current.mediaAutoDownload, ...(updates.mediaAutoDownload || {}) },
    };
    this.queueSave();
    return this.data.userSettings[userId];
  }

  // --- Sessions & Devices ---
  public getSessions(userId: string): DeviceSession[] {
    return this.data.sessions.filter(s => s.userId === userId);
  }

  public createSession(session: DeviceSession): void {
    this.data.sessions.push(session);
    this.queueSave();
  }

  public terminateSession(sessionId: string, userId: string): boolean {
    this.data.sessions = this.data.sessions.filter(s => !(s.id === sessionId && s.userId === userId));
    this.queueSave();
    return true;
  }

  public terminateOtherSessions(currentSessionId: string, userId: string): boolean {
    this.data.sessions = this.data.sessions.filter(s => s.id === currentSessionId || s.userId !== userId);
    this.queueSave();
    return true;
  }

  // --- Folders ---
  public getFolders(userId: string): ChatFolder[] {
    return this.data.folders.filter(f => f.userId === userId);
  }

  public createFolder(userId: string, name: string, icon: string, filterType: ChatFolder['filterType'], conversationIds: string[]): ChatFolder {
    const folder: ChatFolder = {
      id: `f_${Date.now()}`,
      userId,
      name,
      icon,
      filterType,
      conversationIds,
    };
    this.data.folders.push(folder);
    this.queueSave();
    return folder;
  }

  // --- Blocked & Reports ---
  public getBlockedUsers(userId: string): BlockedUser[] {
    return this.data.blockedUsers
      .filter(b => b.userId === userId)
      .map(b => ({
        ...b,
        blockedUser: this.getUserById(b.blockedUserId),
      }));
  }

  public blockUser(userId: string, blockedUserId: string): boolean {
    const exists = this.data.blockedUsers.some(b => b.userId === userId && b.blockedUserId === blockedUserId);
    if (exists) return true;
    this.data.blockedUsers.push({
      id: `blk_${Date.now()}`,
      userId,
      blockedUserId,
      createdAt: new Date().toISOString(),
    });
    this.queueSave();
    return true;
  }

  public unblockUser(userId: string, blockedUserId: string): boolean {
    this.data.blockedUsers = this.data.blockedUsers.filter(
      b => !(b.userId === userId && b.blockedUserId === blockedUserId)
    );
    this.queueSave();
    return true;
  }

  public createReport(report: Omit<Report, 'id' | 'createdAt' | 'status'>): Report {
    const newReport: Report = {
      ...report,
      id: `rep_${Date.now()}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.data.reports.push(newReport);
    this.queueSave();
    return newReport;
  }

  public getReports(): Report[] {
    return this.data.reports.map(r => {
      const rep = this.getUserById(r.reporterId);
      const reportedUser = r.reportedUserId ? this.getUserById(r.reportedUserId) : undefined;
      return {
        ...r,
        reporterName: rep?.displayName,
        reportedUserName: reportedUser?.displayName,
      };
    });
  }

  public updateReportStatus(reportId: string, status: Report['status']): Report | null {
    const report = this.data.reports.find(r => r.id === reportId);
    if (!report) return null;
    report.status = status;
    this.queueSave();
    return report;
  }

  // --- Admin API ---
  public getAdminStats(): any {
    const totalUsers = this.data.users.length;
    const activeUsers = this.data.users.filter(u => u.isOnline).length;
    const messagesSent = this.data.messages.length;
    const totalGroups = this.data.conversations.filter(c => c.type === 'group').length;
    const totalChannels = 0;
    const totalCalls = this.data.calls.length;
    const pendingReports = this.data.reports.filter(r => r.status === 'pending').length;

    let storageUsageBytes = 0;
    this.data.messages.forEach(m => {
      if (m.fileSize) storageUsageBytes += m.fileSize;
    });

    const dailyActivity: { date: string; messages: number; activeUsers: number }[] = [];

    const totalConversations = this.data.conversations.length;
    return {
      totalUsers,
      activeUsers,
      activeConnections: activeUsers,
      messagesSent,
      totalMessages: messagesSent,
      totalGroups,
      totalConversations,
      totalChannels,
      totalCalls,
      storageUsageBytes,
      pendingReports,
      dailyActivity,
    };
  }

  public toggleBanUser(userId: string): boolean {
    const user = this.data.users.find(u => this.isSameUser(u.id, userId));
    if (!user) return false;
    if (isSuperAdminIdentity(user)) return false;
    user.isBanned = !user.isBanned;
    this.queueSave();
    return Boolean(user.isBanned);
  }

  public setUserRole(userId: string, role: 'user' | 'admin' | 'superadmin'): User | null {
    const user = this.data.users.find(u => this.isSameUser(u.id, userId));
    if (!user) return null;
    if (isSuperAdminIdentity(user)) {
      user.role = 'superadmin';
    } else {
      user.role = role;
    }
    this.queueSave();
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  public async clearUserChatsAdmin(targetIdOrUsername: string): Promise<boolean> {
    if (!targetIdOrUsername) return false;
    const raw = targetIdOrUsername.trim();
    const clean = raw.toLowerCase().replace(/^@/, '');
    const norm = clean.replace(/[^a-z0-9_]/g, '_');

    const matchedUsers = this.data.users.filter(
      u =>
        this.isSameUser(u.id, raw) ||
        u.username.toLowerCase() === clean ||
        u.username.toLowerCase() === norm
    );

    const targetIds = new Set<string>([raw, clean, norm, ...matchedUsers.map(u => u.id)]);
    const directConvIds = new Set<string>();

    for (const m of this.data.conversationMembers) {
      if (targetIds.has(m.userId)) {
        const conv = this.data.conversations.find(c => c.id === m.conversationId);
        if (conv && conv.type === 'direct') {
          directConvIds.add(conv.id);
        }
      }
    }
    for (const c of this.data.conversations) {
      if (c.type === 'direct' && norm && c.id.toLowerCase().includes(norm)) {
        directConvIds.add(c.id);
      }
    }

    this.data.messages = this.data.messages.filter(
      m => !targetIds.has(m.senderId) && !directConvIds.has(m.conversationId)
    );
    this.data.conversationMembers = this.data.conversationMembers.filter(
      m => !directConvIds.has(m.conversationId)
    );
    this.data.conversations = this.data.conversations.filter(c => !directConvIds.has(c.id));
    this.data.stories = this.data.stories.filter(s => !targetIds.has(s.userId));
    this.data.calls = this.data.calls.filter(
      c => !targetIds.has(c.callerId) && !targetIds.has(c.receiverId || '')
    );

    this.saveSync();
    return true;
  }

  public getAllConversationsAdmin(): Conversation[] {
    return this.data.conversations
      .filter(c => c && c.id && c.type !== 'channel')
      .map(conv => {
        const members = this.data.conversationMembers
          .filter(m => m.conversationId === conv.id)
          .map(m => ({
            ...m,
            user: this.getUserById(m.userId),
          }));
        const convMsgs = this.data.messages
          .filter(m => m.conversationId === conv.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return {
          ...conv,
          members,
          lastMessage: convMsgs[0] || conv.lastMessage,
        };
      })
      .sort((a, b) => {
        const timeA = a.lastMessage?.createdAt || a.createdAt;
        const timeB = b.lastMessage?.createdAt || b.createdAt;
        return new Date(timeB).getTime() - new Date(timeA).getTime();
      });
  }

  public exportUserData(userId: string): any {
    const user = this.getUserById(userId);
    const settings = this.getUserSettings(userId);
    const convs = this.getUserConversations(userId);
    const messages = this.data.messages.filter(m => m.senderId === userId);
    const sessions = this.getSessions(userId);

    return {
      exportDate: new Date().toISOString(),
      user,
      settings,
      conversations: convs,
      messages,
      sessions,
    };
  }
}

export const db = new AetherDatabase();
