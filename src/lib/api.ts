import { User, Conversation, Message, Story, Call, UserSettings, DeviceSession, ChatFolder, AdminStats, Report, BlockedUser } from '../types';
import {
  syncUserToCloudDirectory,
  fetchCloudDirectoryUsers,
  signOutFirebaseSession,
  syncConversationToFirestore,
  fetchConversationsFromFirestore,
  deleteConversationFromFirestore,
  clearConversationMessagesFromFirestore,
  syncMessageToFirestore,
  deleteMessageFromFirestore,
  fetchMessagesFromFirestore,
  uploadFileToFirestore,
  syncStoryToFirestore,
  deleteStoryFromFirestore,
  fetchStoriesFromFirestore,
  getCanonicalDirectConversationId,
  cacheDirectoryUsers,
  clearDirectoryUserCache,
  purgeAllCloudDataFromFirestore,
} from './firebase';

const REMOTE_API_ORIGIN = 'https://ais-pre-jpz57iqlur4hyo5s2f2gkp-455372508405.asia-southeast1.run.app';
const STORAGE_EPOCH = 'aether_purge_20261102_v3';

class ApiClient {
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        if (localStorage.getItem('aether_storage_epoch') !== STORAGE_EPOCH) {
          localStorage.removeItem('aether_client_db');
          localStorage.removeItem('aether_deleted_convs');
          localStorage.removeItem('aether_user');
          localStorage.removeItem('aether_token');
          localStorage.removeItem('aether_cached_directory_users');
          localStorage.setItem('aether_storage_epoch', STORAGE_EPOCH);
          clearDirectoryUserCache();
          void signOutFirebaseSession();
          void purgeAllCloudDataFromFirestore();
        }
      } catch {
        // Ignore storage errors
      }
    }
    this.token = typeof window !== 'undefined' ? localStorage.getItem('aether_token') : null;
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('aether_token', token);
    } else {
      localStorage.removeItem('aether_token');
    }
  }

  public setSession(user: User | null, token: string | null) {
    this.token = token;
    if (token && user) {
      localStorage.setItem('aether_token', token);
      localStorage.setItem('aether_user', JSON.stringify(user));
      this.upsertLocalUsers([user]);
      void syncUserToCloudDirectory(user);
      void this.pushUserToRemoteDirectory(user);
    } else {
      localStorage.removeItem('aether_token');
      localStorage.removeItem('aether_user');
    }
  }

  private async pushUserToRemoteDirectory(user: User): Promise<void> {
    if (!user || typeof window === 'undefined') return;
    try {
      await fetch('/api/users/directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user }),
      }).catch(() => {});

      if (!window.location.origin.includes('ais-pre-jpz57iqlur4hyo5s2f2gkp')) {
        await fetch(`${REMOTE_API_ORIGIN}/api/users/directory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user }),
        }).catch(() => {});
      }
    } catch {
      // Non-blocking
    }
  }

  private async fetchRemoteDirectoryUsers(): Promise<User[]> {
    if (typeof window === 'undefined') return [];
    const results: User[] = [];
    try {
      const localRes = await fetch('/api/users/directory').catch(() => null);
      if (localRes && localRes.ok) {
        const data = await localRes.json();
        if (Array.isArray(data?.users)) results.push(...data.users);
      }
    } catch {
      // Ignore
    }
    if (!window.location.origin.includes('ais-pre-jpz57iqlur4hyo5s2f2gkp')) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        const remoteRes = await fetch(`${REMOTE_API_ORIGIN}/api/users/directory`, {
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (remoteRes.ok) {
          const data = await remoteRes.json();
          if (Array.isArray(data?.users)) results.push(...data.users);
        }
      } catch {
        // Ignore
      }
    }
    return results;
  }

  public getStoredUser(): User | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('aether_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  public logout() {
    this.setSession(null, null);
    void signOutFirebaseSession();
  }

  private isRefreshing = false;

  private getClientDb(): {
    users: User[];
    conversations: Conversation[];
    messages: Record<string, Message[]>;
    stories: Story[];
    calls: Call[];
  } {
    if (typeof window === 'undefined') {
      return { users: [], conversations: [], messages: {}, stories: [], calls: [] };
    }
    try {
      const raw = localStorage.getItem('aether_client_db');
      if (raw) {
        const parsed = JSON.parse(raw);
        const rawMessages: Record<string, Message[]> = parsed.messages || {};
        const dedupedMessages: Record<string, Message[]> = {};
        for (const [convId, list] of Object.entries(rawMessages)) {
          if (Array.isArray(list)) {
            const byId = new Map<string, Message>();
            for (const m of list) {
              if (m && m.id) byId.set(m.id, m);
            }
            dedupedMessages[convId] = Array.from(byId.values());
          }
        }
        const convById = new Map<string, Conversation>();
        for (const c of Array.isArray(parsed.conversations) ? parsed.conversations : []) {
          if (c && c.id) convById.set(c.id, c);
        }
        return {
          users: parsed.users || [],
          conversations: Array.from(convById.values()),
          messages: dedupedMessages,
          stories: parsed.stories || [],
          calls: parsed.calls || [],
        };
      }
    } catch {
      // Ignore parse error
    }
    return { users: [], conversations: [], messages: {}, stories: [], calls: [] };
  }

  private saveClientDb(data: {
    users: User[];
    conversations: Conversation[];
    messages: Record<string, Message[]>;
    stories: Story[];
    calls: Call[];
  }) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('aether_client_db', JSON.stringify(data));
    } catch {
      // Ignore storage quota error
    }
  }

  private findOrCreateClientUser(params: {
    identifier?: string;
    email?: string;
    username?: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
    phone?: string;
  }): User {
    const db = this.getClientDb();
    const rawId = (params.email || params.identifier || params.username || 'user').trim();
    const clean = rawId.toLowerCase().replace(/^@/, '');
    const isEmail = clean.includes('@');
    const targetEmail = isEmail ? clean : `${clean.replace(/[^a-z0-9_]/g, '_')}@aether.local`;

    let existing = db.users.find(
      u =>
        u.email.toLowerCase() === targetEmail ||
        u.username.toLowerCase() === clean ||
        u.username.toLowerCase() === clean.replace(/[^a-z0-9_]/g, '_')
    );

    if (existing) {
      existing.isOnline = true;
      existing.onlineStatus = 'online';
      existing.lastSeen = new Date().toISOString();
      if (params.displayName) existing.displayName = params.displayName.trim();
      if (params.avatarUrl) existing.avatarUrl = params.avatarUrl;
      this.saveClientDb(db);
      return existing;
    }

    let baseUsername = (params.username || (isEmail ? clean.split('@')[0] : clean))
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 24);
    if (baseUsername.length < 3) baseUsername = `user_${baseUsername || 'member'}`;

    const fullName = [params.firstName, params.lastName].filter(Boolean).join(' ').trim();
    const resolvedDisplayName =
      (params.displayName || fullName || '').trim() ||
      (isEmail ? clean.split('@')[0] : rawId)
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());

    const newUser: User = {
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      username: baseUsername,
      displayName: resolvedDisplayName,
      email: targetEmail,
      phone: params.phone?.trim(),
      avatarUrl:
        params.avatarUrl ||
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(resolvedDisplayName)}`,
      bio: 'Member of the encrypted communications mesh.',
      onlineStatus: 'online',
      isOnline: true,
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      role: 'user',
    };

    db.users.push(newUser);
    this.saveClientDb(db);
    return newUser;
  }

  private handleFallbackRequest<T>(endpoint: string, options: RequestInit = {}): T {
    const method = (options.method || 'GET').toUpperCase();
    let body: any = {};
    if (typeof options.body === 'string') {
      try {
        body = JSON.parse(options.body);
      } catch {
        body = {};
      }
    }

    const db = this.getClientDb();
    const currentUser = this.getStoredUser();

    // Auth endpoints
    if (endpoint === '/auth/login' && method === 'POST') {
      const user = this.findOrCreateClientUser({ identifier: body.identifier });
      const token = `local_jwt_${user.id}_${Date.now()}`;
      this.setSession(user, token);
      return { user, token } as unknown as T;
    }

    if (endpoint === '/auth/register' && method === 'POST') {
      const user = this.findOrCreateClientUser({
        email: body.email,
        username: body.username,
        displayName: body.displayName,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
      });
      const token = `local_jwt_${user.id}_${Date.now()}`;
      this.setSession(user, token);
      return { user, token } as unknown as T;
    }

    if ((endpoint === '/auth/google' || endpoint === '/auth/github') && method === 'POST') {
      const user = this.findOrCreateClientUser({
        email: body.email,
        username: body.username,
        displayName: body.displayName,
        avatarUrl: body.avatarUrl,
      });
      const token = `local_jwt_${user.id}_${Date.now()}`;
      this.setSession(user, token);
      return { user, token } as unknown as T;
    }

    if (endpoint === '/auth/forgot-password' && method === 'POST') {
      return {
        message: `Password reset instructions dispatched to ${body.email || 'your email'}.`,
      } as unknown as T;
    }

    if (endpoint === '/auth/me') {
      return { user: currentUser } as unknown as T;
    }

    // Users endpoints
    if (endpoint.startsWith('/users/search')) {
      const q = (endpoint.split('q=')[1] ? decodeURIComponent(endpoint.split('q=')[1]) : '')
        .trim()
        .toLowerCase();
      const list = db.users.filter(u => {
        if (currentUser && u.id === currentUser.id) return false;
        if (!q) return true;
        return (
          u.username.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          (u.email && u.email.toLowerCase().includes(q))
        );
      });
      return { users: list } as unknown as T;
    }

    if (endpoint === '/users/contacts') {
      const contacts = db.users.filter(u => !currentUser || u.id !== currentUser.id);
      return { contacts } as unknown as T;
    }

    if (endpoint === '/users/create-contact' && method === 'POST') {
      const user = this.findOrCreateClientUser({
        email: body.email,
        username: body.username,
        displayName: body.name,
        phone: body.phone,
      });
      return { user } as unknown as T;
    }

    if (endpoint === '/users/me' && method === 'PATCH') {
      if (currentUser) {
        const updated: User = { ...currentUser, ...body };
        this.setSession(updated, this.token || `local_jwt_${updated.id}`);
        const idx = db.users.findIndex(u => u.id === updated.id);
        if (idx >= 0) db.users[idx] = updated;
        else db.users.push(updated);
        this.saveClientDb(db);
        return { user: updated } as unknown as T;
      }
      return { user: currentUser } as unknown as T;
    }

    if (endpoint === '/users/me/blocked') {
      return { blocked: [] } as unknown as T;
    }

    // Conversations endpoints
    if (endpoint === '/conversations' && method === 'GET') {
      return { conversations: db.conversations } as unknown as T;
    }

    if (endpoint === '/conversations' && method === 'POST') {
      const now = new Date().toISOString();
      const otherId = body.memberIds?.[0];
      const otherUser =
        (Array.isArray(body.memberUsers) ? body.memberUsers[0] : undefined) ||
        db.users.find(u => u.id === otherId || u.username === otherId);
      const convType = body.type || 'direct';
      const convName =
        convType === 'direct' && otherUser ? otherUser.displayName : body.name || 'Chat';
      const convAvatar =
        convType === 'direct' && otherUser
          ? otherUser.avatarUrl
          : `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(convName)}`;

      const targetConvId =
        body.id ||
        (convType === 'direct'
          ? getCanonicalDirectConversationId(currentUser, otherUser || otherId)
          : `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);

      const existingConv = db.conversations.find(c => c.id === targetConvId);
      if (existingConv) {
        return { conversation: existingConv } as unknown as T;
      }

      const newConv: Conversation = {
        id: targetConvId,
        type: convType,
        name: convName,
        description: body.description,
        avatarUrl: convAvatar,
        isPrivate: true,
        isEncrypted: true,
        createdAt: now,
        createdBy: currentUser?.id || 'local',
        members: [
          ...(currentUser
            ? [
                {
                  id: `cm_1_${Date.now()}`,
                  conversationId: targetConvId,
                  userId: currentUser.id,
                  user: currentUser,
                  role: 'owner' as const,
                  permissions: {
                    canSendMessages: true,
                    canAddMembers: true,
                    canPinMessages: true,
                    canDeleteMessages: true,
                    canManageCalls: true,
                  },
                  joinedAt: now,
                },
              ]
            : []),
          ...(otherUser
            ? [
                {
                  id: `cm_2_${Date.now()}`,
                  conversationId: targetConvId,
                  userId: otherUser.id,
                  user: otherUser,
                  role: 'member' as const,
                  permissions: {
                    canSendMessages: true,
                    canAddMembers: true,
                    canPinMessages: true,
                    canDeleteMessages: true,
                    canManageCalls: true,
                  },
                  joinedAt: now,
                },
              ]
            : []),
        ],
      };
      db.conversations.unshift(newConv);
      this.saveClientDb(db);
      return { conversation: newConv } as unknown as T;
    }

    const msgMatch = endpoint.match(/^\/conversations\/([^/]+)\/messages$/);
    if (msgMatch) {
      const convId = msgMatch[1];
      if (method === 'GET') {
        return { messages: db.messages[convId] || [] } as unknown as T;
      }
      if (method === 'POST') {
        const newMsg: Message = {
          id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          conversationId: convId,
          senderId: currentUser?.id || 'local',
          sender: currentUser || undefined,
          content: body.content || '',
          type: body.type || 'text',
          mediaUrl: body.mediaUrl,
          fileName: body.fileName,
          fileSize: body.fileSize,
          duration: body.duration,
          replyToId: body.replyToId,
          reactions: [],
          status: 'sent',
          createdAt: new Date().toISOString(),
        };
        if (!db.messages[convId]) db.messages[convId] = [];
        db.messages[convId].push(newMsg);
        const convIdx = db.conversations.findIndex(c => c.id === convId);
        if (convIdx >= 0) {
          db.conversations[convIdx].lastMessage = newMsg;
        }
        this.saveClientDb(db);
        return { message: newMsg } as unknown as T;
      }
      if (method === 'DELETE') {
        db.messages[convId] = [];
        const convIdx = db.conversations.findIndex(c => c.id === convId);
        if (convIdx >= 0) {
          db.conversations[convIdx].lastMessage = undefined;
        }
        this.saveClientDb(db);
        return { success: true, conversationId: convId } as unknown as T;
      }
    }

    const delConvMatch = endpoint.match(/^\/conversations\/([^/]+)$/);
    if (delConvMatch && method === 'DELETE') {
      const convId = delConvMatch[1];
      db.conversations = db.conversations.filter(c => c.id !== convId);
      delete db.messages[convId];
      this.saveClientDb(db);
      return { success: true, conversationId: convId } as unknown as T;
    }

    if (endpoint.endsWith('/read') && method === 'POST') {
      return { success: true } as unknown as T;
    }

    const reactMatch = endpoint.match(/^\/messages\/([^/]+)\/reactions$/);
    if (reactMatch && method === 'POST') {
      const messageId = reactMatch[1];
      const userId = currentUser?.id || 'local';
      for (const convId of Object.keys(db.messages)) {
        const msg = db.messages[convId].find(m => m.id === messageId);
        if (msg) {
          const existingIdx = msg.reactions.findIndex(
            r => r.emoji === body.emoji && r.userId === userId
          );
          if (existingIdx >= 0) {
            msg.reactions.splice(existingIdx, 1);
          } else {
            msg.reactions.push({
              id: `r_${Date.now()}`,
              messageId,
              userId,
              emoji: body.emoji,
              userDisplayName: currentUser?.displayName || 'User',
            });
          }
          this.saveClientDb(db);
          return { message: msg } as unknown as T;
        }
      }
    }

    if (endpoint === '/stories' && method === 'GET') {
      return { stories: db.stories } as unknown as T;
    }

    if (endpoint === '/stories' && method === 'POST') {
      const newStory: Story = {
        id: `s_${Date.now()}`,
        userId: currentUser?.id || 'local',
        user: currentUser || undefined,
        type: body.type || 'text',
        mediaUrl: body.mediaUrl,
        text: body.text,
        background: body.background || '#111111',
        viewers: [],
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
      db.stories.unshift(newStory);
      this.saveClientDb(db);
      return { story: newStory } as unknown as T;
    }

    if (endpoint === '/calls' && method === 'GET') {
      return { calls: db.calls } as unknown as T;
    }

    if (endpoint.startsWith('/calls/active')) {
      return { call: null, signals: [] } as unknown as T;
    }

    if (endpoint === '/calls/start' && method === 'POST') {
      const otherUser = db.users.find(u => u.id === body.receiverId);
      const newCall: Call = {
        id: `call_${Date.now()}`,
        callerId: currentUser?.id || 'local',
        caller: currentUser || undefined,
        receiverId: body.receiverId,
        receiver: otherUser,
        conversationId: body.conversationId || 'c_direct',
        type: body.type || 'voice',
        status: 'ringing',
        startedAt: new Date().toISOString(),
      };
      db.calls.unshift(newCall);
      this.saveClientDb(db);
      return { call: newCall } as unknown as T;
    }

    if (endpoint.endsWith('/signal') && method === 'POST') {
      return { success: true, seq: Date.now() } as unknown as T;
    }

    if (endpoint.endsWith('/status') && method === 'PATCH') {
      return { call: db.calls[0] || null } as unknown as T;
    }

    if (endpoint === '/settings') {
      return {
        settings: {
          theme: 'dark',
          accent: 'aurora',
          fontSize: 'md',
          glassIntensity: 'high',
          notifications: { messages: true, calls: true, mentionsOnly: false, preview: true, sound: true },
          privacy: { lastSeen: 'everyone', readReceipts: true, profilePhoto: 'everyone', stories: 'everyone', disappearingDefault: 0 },
          mediaAutoDownload: { photos: true, videos: false, documents: true, audio: true },
        },
      } as unknown as T;
    }

    if (endpoint === '/devices') {
      return { sessions: [] } as unknown as T;
    }

    if (endpoint === '/system/reset' && method === 'POST') {
      this.saveClientDb({ users: [], conversations: [], messages: {}, stories: [], calls: [] });
      return { success: true, message: 'All data reset.' } as unknown as T;
    }

    return { success: true } as unknown as T;
  }

  private upsertLocalUsers(users: User[]) {
    if (!users || users.length === 0) return;
    const db = this.getClientDb();
    let changed = false;
    for (const u of users) {
      if (!u || !u.id) continue;
      const cleanUsername = (u.username || '').trim().toLowerCase();
      const cleanEmail = (u.email || '').trim().toLowerCase();
      const idx = db.users.findIndex(
        existing =>
          existing.id === u.id ||
          (cleanUsername && existing.username.toLowerCase() === cleanUsername) ||
          (cleanEmail && existing.email && existing.email.toLowerCase() === cleanEmail)
      );
      if (idx >= 0) {
        db.users[idx] = { ...db.users[idx], ...u };
        changed = true;
      } else {
        db.users.push(u);
        changed = true;
      }
    }
    if (changed) {
      this.saveClientDb(db);
    }
    cacheDirectoryUsers(db.users);
  }

  private mergeDirectoryUsers(lists: User[][], queryStr = ''): User[] {
    const currentUser = this.getStoredUser();
    const selfId = currentUser?.id;
    const selfEmail = (currentUser?.email || '').trim().toLowerCase();
    const selfUsername = (currentUser?.username || '').trim().toLowerCase();

    const db = this.getClientDb();
    const convUsers: User[] = [];
    for (const c of db.conversations) {
      for (const m of c.members || []) {
        if (m.user) convUsers.push(m.user);
      }
    }

    const combined = [...lists.flat(), ...db.users, ...convUsers];
    const byKey = new Map<string, User>();

    for (const u of combined) {
      if (!u || (!u.id && !u.username)) continue;
      const uEmail = (u.email || '').trim().toLowerCase();
      const uUsername = (u.username || '').trim().toLowerCase();
      if (
        uUsername === 'directory_reader' ||
        uUsername === 'guest_viewer' ||
        u.id === 'u_1789118066028_c7hyx' ||
        /john\s*fran/i.test(u.displayName || '')
      ) {
        continue;
      }
      if (selfId && u.id === selfId) continue;
      if (selfEmail && uEmail && uEmail === selfEmail) continue;
      if (selfUsername && uUsername && uUsername === selfUsername) continue;

      const dedupeKey = uUsername || uEmail || u.id;
      const existing = byKey.get(dedupeKey);
      if (!existing) {
        byKey.set(dedupeKey, u);
      } else {
        // Prefer real email over synthetic @aether.chat email
        const betterEmail =
          existing.email && !existing.email.endsWith('@aether.chat') && !existing.email.endsWith('@aether.local')
            ? existing.email
            : u.email || existing.email;
        const betterId = existing.id.startsWith('u_') ? existing.id : u.id || existing.id;
        byKey.set(dedupeKey, {
          ...existing,
          ...u,
          id: betterId,
          email: betterEmail,
        });
      }
    }

    const allMerged = Array.from(byKey.values());
    this.upsertLocalUsers(allMerged);

    const q = queryStr.trim().toLowerCase().replace(/^@/, '');
    if (!q) return allMerged;

    return allMerged.filter(
      u =>
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.phone && u.phone.toLowerCase().includes(q))
    );
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, isRetry = false): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('aether_token');
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const storedUser = this.getStoredUser();
    if (storedUser) {
      if (storedUser.id) headers['X-User-Id'] = storedUser.id;
      if (storedUser.email) headers['X-User-Email'] = storedUser.email;
      if (storedUser.displayName) headers['X-User-Name'] = storedUser.displayName;
    }

    let response: Response;
    try {
      response = await fetch(`/api${endpoint}`, {
        ...options,
        headers,
      });
    } catch {
      return this.tryRemoteOrFallback<T>(endpoint, options, headers);
    }

    if (
      response.status === 404 ||
      response.status === 405 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504
    ) {
      return this.tryRemoteOrFallback<T>(endpoint, options, headers);
    }

    if (response.status === 401 && !isRetry && !endpoint.startsWith('/auth/')) {
      const recovered = await this.tryRecoverSession();
      if (recovered) {
        return this.request<T>(endpoint, options, true);
      }
      return this.handleFallbackRequest<T>(endpoint, options);
    }

    if (!response.ok) {
      let errorMsg = `Error ${response.status}: ${response.statusText}`;
      try {
        const errorJson = await response.json();
        if (errorJson.error) errorMsg = errorJson.error;
      } catch (_) {}
      throw new Error(errorMsg);
    }

    try {
      return (await response.json()) as T;
    } catch {
      return this.handleFallbackRequest<T>(endpoint, options);
    }
  }

  private async tryRemoteOrFallback<T>(
    endpoint: string,
    options: RequestInit,
    headers: Record<string, string>
  ): Promise<T> {
    if (typeof window !== 'undefined' && !window.location.origin.includes('ais-pre-jpz57iqlur4hyo5s2f2gkp')) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const remoteRes = await fetch(`${REMOTE_API_ORIGIN}/api${endpoint}`, {
          ...options,
          headers,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (remoteRes.ok) {
          return (await remoteRes.json()) as T;
        }
      } catch {
        // Ignore remote fetch failure and use local fallback
      }
    }
    return this.handleFallbackRequest<T>(endpoint, options);
  }

  private async tryRecoverSession(): Promise<boolean> {
    if (this.isRefreshing) return false;
    this.isRefreshing = true;
    try {
      const storedUser = this.getStoredUser();
      if (storedUser?.email) {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: storedUser.email,
            displayName: storedUser.displayName,
            avatarUrl: storedUser.avatarUrl,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.user && data.token) {
            this.setSession(data.user, data.token);
            return true;
          }
        }
      }
      this.logout();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aether:unauthorized'));
      }
      return false;
    } catch {
      return false;
    } finally {
      this.isRefreshing = false;
    }
  }

  // Auth
  public async login(identifier: string, password: string): Promise<{ user: User; token: string }> {
    const res = await this.request<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    this.setSession(res.user, res.token);
    return res;
  }

  public async googleLogin(data: {
    email: string;
    displayName?: string;
    avatarUrl?: string;
    credential?: string;
  }): Promise<{ user: User; token: string }> {
    const res = await this.request<{ user: User; token: string }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setSession(res.user, res.token);
    return res;
  }

  public async githubLogin(data?: {
    username?: string;
    email?: string;
    displayName?: string;
    avatarUrl?: string;
  }): Promise<{ user: User; token: string }> {
    const res = await this.request<{ user: User; token: string }>('/auth/github', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
    this.setSession(res.user, res.token);
    return res;
  }

  public async register(data: {
    username?: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    email: string;
    password: string;
    phone?: string;
  }): Promise<{ user: User; token: string }> {
    const res = await this.request<{ user: User; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setSession(res.user, res.token);
    return res;
  }

  public async forgotPassword(email: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  public async getSqlStats(): Promise<{ engine: string; status: string; stats: any }> {
    return this.request<{ engine: string; status: string; stats: any }>('/sql/stats');
  }

  public async createContact(data: { name?: string; email?: string; username?: string; phone?: string; bio?: string }): Promise<User> {
    const res = await this.request<{ user: User }>('/users/create-contact', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.user) {
      this.upsertLocalUsers([res.user]);
      void syncUserToCloudDirectory(res.user);
      void this.pushUserToRemoteDirectory(res.user);
    }
    return res.user;
  }

  public async getMe(): Promise<{ user: User }> {
    return this.request<{ user: User }>('/auth/me');
  }

  public async getCurrentUser(): Promise<User | null> {
    if (!this.token) return null;
    try {
      const res = await this.getMe();
      if (res.user) {
        void syncUserToCloudDirectory(res.user);
        void this.pushUserToRemoteDirectory(res.user);
      }
      return res.user;
    } catch {
      return null;
    }
  }

  public async updateProfile(data: Partial<User>): Promise<User> {
    const res = await this.request<{ user: User }>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    if (res.user) {
      void syncUserToCloudDirectory(res.user);
      void this.pushUserToRemoteDirectory(res.user);
    }
    return res.user;
  }

  // Users & Search
  public async searchUsers(query: string): Promise<User[]> {
    const currentUser = this.getStoredUser();
    if (currentUser) {
      void syncUserToCloudDirectory(currentUser);
      void this.pushUserToRemoteDirectory(currentUser);
    }
    const [apiRes, cloudUsers, remoteUsers] = await Promise.all([
      this.request<{ users: User[] }>(`/users/search?q=${encodeURIComponent(query)}`).catch(() => ({
        users: [] as User[],
      })),
      fetchCloudDirectoryUsers(currentUser).catch(() => [] as User[]),
      this.fetchRemoteDirectoryUsers().catch(() => [] as User[]),
    ]);

    const merged = this.mergeDirectoryUsers(
      [apiRes.users || [], cloudUsers, remoteUsers],
      query
    );
    if (cloudUsers.length > 0 || remoteUsers.length > 0) {
      void this.request('/users/sync', {
        method: 'POST',
        body: JSON.stringify({ users: merged }),
      }).catch(() => {});
    }
    return merged;
  }

  public async getContacts(): Promise<User[]> {
    const currentUser = this.getStoredUser();
    if (currentUser) {
      void syncUserToCloudDirectory(currentUser);
      void this.pushUserToRemoteDirectory(currentUser);
    }
    const [apiRes, cloudUsers, remoteUsers] = await Promise.all([
      this.request<{ contacts: User[] }>('/users/contacts').catch(() => ({
        contacts: [] as User[],
      })),
      fetchCloudDirectoryUsers(currentUser).catch(() => [] as User[]),
      this.fetchRemoteDirectoryUsers().catch(() => [] as User[]),
    ]);

    const merged = this.mergeDirectoryUsers(
      [apiRes.contacts || [], cloudUsers, remoteUsers],
      ''
    );
    if (cloudUsers.length > 0 || remoteUsers.length > 0) {
      void this.request('/users/sync', {
        method: 'POST',
        body: JSON.stringify({ users: merged }),
      }).catch(() => {});
    }
    return merged;
  }

  public async blockUser(userId: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/users/${userId}/block`, { method: 'POST' });
    return res.success;
  }

  public async unblockUser(userId: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/users/${userId}/block`, { method: 'DELETE' });
    return res.success;
  }

  public async getBlockedUsers(): Promise<BlockedUser[]> {
    const res = await this.request<{ blocked: BlockedUser[] }>('/users/me/blocked');
    return res.blocked || [];
  }

  public async reportUser(userId: string, reason: string, details?: string, conversationId?: string, messageId?: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/users/${userId}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason, details, conversationId, messageId }),
    });
    return res.success;
  }

  private getDeletedConvMap(): Record<string, number> {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem('aether_deleted_convs');
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const map: Record<string, number> = {};
        for (const id of parsed) {
          if (typeof id === 'string') map[id] = Date.now();
        }
        return map;
      }
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, number>;
      }
      return {};
    } catch {
      return {};
    }
  }

  private markConvDeleted(convId: string, isDeleted: boolean) {
    if (typeof window === 'undefined' || !convId) return;
    try {
      const map = this.getDeletedConvMap();
      if (isDeleted) {
        map[convId] = Date.now();
      } else {
        delete map[convId];
      }
      localStorage.setItem('aether_deleted_convs', JSON.stringify(map));
    } catch {
      // Ignore
    }
  }

  public unmarkConvDeleted(convId: string) {
    this.markConvDeleted(convId, false);
  }

  private mirrorToRemoteOrigin(endpoint: string, options: RequestInit) {
    if (typeof window === 'undefined') return;
    if (window.location.origin.includes('ais-pre-jpz57iqlur4hyo5s2f2gkp')) return;
    const storedUser = this.getStoredUser();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    if (storedUser?.id) headers['X-User-Id'] = storedUser.id;
    if (storedUser?.email) headers['X-User-Email'] = storedUser.email;
    if (storedUser?.displayName) headers['X-User-Name'] = storedUser.displayName;

    fetch(`${REMOTE_API_ORIGIN}/api${endpoint}`, {
      ...options,
      headers,
    }).catch(() => {});
  }

  // Conversations
  public async getConversations(): Promise<Conversation[]> {
    const currentUser = this.getStoredUser();
    const localDb = this.getClientDb();
    if (localDb.users.length > 0) cacheDirectoryUsers(localDb.users);
    if (currentUser) cacheDirectoryUsers([currentUser]);

    const deletedMap = this.getDeletedConvMap();
    const [res, cloudConvs] = await Promise.all([
      this.request<{ conversations: Conversation[] }>('/conversations').catch(() => ({
        conversations: [] as Conversation[],
      })),
      fetchConversationsFromFirestore(currentUser, localDb.users).catch(() => [] as Conversation[]),
    ]);

    const rawConvs = [...(res.conversations || []), ...cloudConvs];
    const convById = new Map<string, Conversation>();
    const memberUsers: User[] = [];

    for (const c of rawConvs) {
      if (!c || !c.id) continue;
      const deletedAt = deletedMap[c.id];
      if (deletedAt) {
        const lastMsgTime = c.lastMessage?.createdAt
          ? new Date(c.lastMessage.createdAt).getTime()
          : 0;
        // If a brand-new message arrived AFTER the user deleted the conversation, un-delete it so it reaches them
        if (lastMsgTime > deletedAt + 1000) {
          this.markConvDeleted(c.id, false);
          delete deletedMap[c.id];
        } else {
          continue;
        }
      }

      const existing = convById.get(c.id);
      const memById = new Map<string, (typeof c.members)[number]>();
      for (const m of [...(existing?.members || []), ...(c.members || [])]) {
        if (!m) continue;
        const memKey = m.user?.username
          ? m.user.username.toLowerCase()
          : m.userId || m.id;
        if (memKey) {
          const prevMem = memById.get(memKey);
          memById.set(memKey, {
            ...(prevMem || {}),
            ...m,
            user: m.user || prevMem?.user,
          });
        }
        if (m.user) memberUsers.push(m.user);
      }

      // Prefer the newer or real message over synthetic preview
      let bestLastMsg = c.lastMessage || existing?.lastMessage;
      if (c.lastMessage && existing?.lastMessage) {
        const isCPreview = c.lastMessage.id.startsWith('m_preview_');
        const isExistingPreview = existing.lastMessage.id.startsWith('m_preview_');
        if (isCPreview && !isExistingPreview) {
          bestLastMsg = existing.lastMessage;
        } else if (!isCPreview && isExistingPreview) {
          bestLastMsg = c.lastMessage;
        } else {
          const timeC = new Date(c.lastMessage.createdAt).getTime();
          const timeEx = new Date(existing.lastMessage.createdAt).getTime();
          bestLastMsg = timeC >= timeEx ? c.lastMessage : existing.lastMessage;
        }
      }

      convById.set(c.id, {
        ...(existing || {}),
        ...c,
        name:
          existing?.name && existing.name !== 'Chat' && existing.name !== 'Direct Chat'
            ? existing.name
            : c.name,
        avatarUrl: existing?.avatarUrl || c.avatarUrl,
        members: Array.from(memById.values()),
        lastMessage: bestLastMsg,
      });
    }

    if (memberUsers.length > 0) {
      this.upsertLocalUsers(memberUsers);
    }

    const mergedList = Array.from(convById.values()).sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const timeA = a.lastMessage?.createdAt || a.createdAt;
      const timeB = b.lastMessage?.createdAt || b.createdAt;
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    });

    // Save merged conversations into local client DB so sendMessage/getMessages always have member metadata
    const freshDb = this.getClientDb();
    freshDb.conversations = mergedList;
    this.saveClientDb(freshDb);

    for (const conv of res.conversations || []) {
      if (!deletedMap[conv.id]) {
        void syncConversationToFirestore(conv, currentUser);
      }
    }
    return mergedList;
  }

  public async getConversation(id: string): Promise<Conversation> {
    const res = await this.request<{ conversation: Conversation }>(`/conversations/${id}`);
    return res.conversation;
  }

  public async deleteConversation(conversationId: string): Promise<boolean> {
    this.markConvDeleted(conversationId, true);
    const db = this.getClientDb();
    db.conversations = db.conversations.filter(c => c.id !== conversationId);
    delete db.messages[conversationId];
    this.saveClientDb(db);
    void deleteConversationFromFirestore(conversationId);
    try {
      const res = await this.request<{ success: boolean }>(`/conversations/${conversationId}`, {
        method: 'DELETE',
      });
      return res.success ?? true;
    } catch {
      return true;
    }
  }

  public async clearConversationMessages(conversationId: string): Promise<boolean> {
    const db = this.getClientDb();
    db.messages[conversationId] = [];
    const convIdx = db.conversations.findIndex(c => c.id === conversationId);
    if (convIdx >= 0) {
      db.conversations[convIdx].lastMessage = undefined;
    }
    this.saveClientDb(db);
    void clearConversationMessagesFromFirestore(conversationId);
    try {
      const res = await this.request<{ success: boolean }>(`/conversations/${conversationId}/messages`, {
        method: 'DELETE',
      });
      return res.success ?? true;
    } catch {
      return true;
    }
  }

  public async createConversation(data: {
    type: 'direct' | 'group' | 'channel';
    name?: string;
    description?: string;
    avatarUrl?: string;
    username?: string;
    isPrivate?: boolean;
    memberIds?: string[];
  }): Promise<Conversation> {
    const db = this.getClientDb();
    const currentUser = this.getStoredUser();
    if (db.users.length > 0) cacheDirectoryUsers(db.users);
    if (currentUser) cacheDirectoryUsers([currentUser]);

    const memberUsers = (data.memberIds || [])
      .map(id => db.users.find(u => u.id === id || u.username === id))
      .filter((u): u is User => Boolean(u));

    const canonicalId =
      data.type === 'direct'
        ? getCanonicalDirectConversationId(currentUser, memberUsers[0] || data.memberIds?.[0])
        : undefined;

    const payload = {
      ...data,
      id: canonicalId,
      memberUsers,
      name:
        data.name ||
        (data.type === 'direct' && memberUsers[0]
          ? memberUsers[0].displayName
          : data.type === 'direct'
          ? 'Direct Chat'
          : 'New Group'),
    };

    const res = await this.request<{ conversation: Conversation }>('/conversations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    this.mirrorToRemoteOrigin('/conversations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (res.conversation) {
      this.markConvDeleted(res.conversation.id, false);
      const freshDb = this.getClientDb();
      const existingIdx = freshDb.conversations.findIndex(c => c.id === res.conversation.id);
      if (existingIdx >= 0) {
        freshDb.conversations[existingIdx] = res.conversation;
      } else {
        freshDb.conversations.unshift(res.conversation);
      }
      this.saveClientDb(freshDb);
      void syncConversationToFirestore(res.conversation, currentUser);
    }
    return res.conversation;
  }

  public async markAsRead(conversationId: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/conversations/${conversationId}/read`, {
      method: 'POST',
    });
    return res.success;
  }

  public async getMessages(conversationId: string): Promise<Message[]> {
    const localDb = this.getClientDb();
    const currentUser = this.getStoredUser();
    const conv = localDb.conversations.find(c => c.id === conversationId);

    const [res, cloudMsgs] = await Promise.all([
      this.request<{ messages: Message[] }>(`/conversations/${conversationId}/messages`).catch(() => ({
        messages: [] as Message[],
      })),
      fetchMessagesFromFirestore(conversationId, localDb.users, conv).catch(() => [] as Message[]),
    ]);

    const list = [...cloudMsgs, ...(res.messages || [])];
    const byId = new Map<string, Message>();
    for (const msg of list) {
      if (msg && msg.id) {
        const prev = byId.get(msg.id);
        byId.set(msg.id, prev ? { ...prev, ...msg } : msg);
      }
    }
    for (const msg of res.messages || []) {
      void syncMessageToFirestore(msg, currentUser, conv);
    }
    const merged = Array.from(byId.values());
    merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const freshDb = this.getClientDb();
    freshDb.messages[conversationId] = merged;
    this.saveClientDb(freshDb);

    return merged;
  }

  public async sendMessage(data: { conversationId: string; [key: string]: any }): Promise<Message> {
    const currentUser = this.getStoredUser();
    const { conversationId, ...body } = data;
    this.markConvDeleted(conversationId, false);

    const localDb = this.getClientDb();
    const conv = localDb.conversations.find(c => c.id === conversationId);
    const memberUsers = [
      ...(currentUser ? [currentUser] : []),
      ...(conv?.members
        ?.map(m => m.user || localDb.users.find(u => u.id === m.userId))
        .filter((u): u is User => Boolean(u)) || []),
    ];
    const memberIds = Array.from(
      new Set([
        ...(conv?.members?.map(m => m.userId).filter(Boolean) || []),
        ...memberUsers.map(u => u.id).filter(Boolean),
      ])
    );

    const postBody = {
      ...body,
      conversationMeta: {
        id: conversationId,
        type: conv?.type || 'direct',
        name: conv?.name || 'Direct Chat',
        avatarUrl: conv?.avatarUrl,
        memberIds,
        memberUsers,
      },
    };

    const res = await this.request<{ message: Message }>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(postBody),
    });

    if (res.message) {
      this.mirrorToRemoteOrigin(`/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          ...postBody,
          id: res.message.id,
        }),
      });
      void syncMessageToFirestore(res.message, currentUser, conv);
    }
    return res.message;
  }

  public async togglePinConversation(conversationId: string): Promise<{ isPinned: boolean }> {
    return this.request<{ isPinned: boolean }>(`/conversations/${conversationId}/pin`, { method: 'POST' });
  }

  public async toggleArchiveConversation(conversationId: string): Promise<{ isArchived: boolean }> {
    return this.request<{ isArchived: boolean }>(`/conversations/${conversationId}/archive`, { method: 'POST' });
  }

  public async toggleMuteConversation(conversationId: string): Promise<{ isMuted: boolean }> {
    return this.request<{ isMuted: boolean }>(`/conversations/${conversationId}/mute`, { method: 'POST' });
  }

  public async addMember(conversationId: string, userId: string): Promise<Conversation> {
    const res = await this.request<{ conversation: Conversation }>(`/conversations/${conversationId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    if (res.conversation) {
      void syncConversationToFirestore(res.conversation, this.getStoredUser());
    }
    return res.conversation;
  }

  // Messages
  public async editMessage(messageId: string, content: string): Promise<Message> {
    const res = await this.request<{ message: Message }>(`/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
    if (res.message) {
      void syncMessageToFirestore(res.message, this.getStoredUser());
    }
    return res.message;
  }

  public async deleteMessage(messageId: string, forEveryone: boolean): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/messages/${messageId}`, {
      method: 'DELETE',
      body: JSON.stringify({ forEveryone }),
    });
    void deleteMessageFromFirestore(messageId);
    return res.success;
  }

  public async reactToMessage(messageId: string, emoji: string): Promise<Message> {
    const res = await this.request<{ message: Message }>(`/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
    return res.message;
  }

  public async togglePinMessage(messageId: string): Promise<Message> {
    const res = await this.request<{ message: Message }>(`/messages/${messageId}/pin`, { method: 'POST' });
    return res.message;
  }

  public async forwardMessage(messageId: string, targetConversationId: string): Promise<Message> {
    const res = await this.request<{ message: Message }>(`/messages/${messageId}/forward`, {
      method: 'POST',
      body: JSON.stringify({ targetConversationId }),
    });
    return res.message;
  }

  public async votePoll(messageId: string, optionId: string): Promise<Message> {
    const res = await this.request<{ message: Message }>(`/polls/${messageId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ optionId }),
    });
    return res.message;
  }

  // Voice-to-Text & Audio Transcription
  public async transcribeAudio(data: {
    audioData: string;
    mimeType?: string;
    messageId?: string;
  }): Promise<{ transcription: string; success: boolean; warning?: string }> {
    return this.request<{ transcription: string; success: boolean; warning?: string }>('/ai/transcribe', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async updateTranscription(messageId: string, transcription: string): Promise<Message> {
    const res = await this.request<{ message: Message }>(`/messages/${messageId}/transcription`, {
      method: 'PATCH',
      body: JSON.stringify({ transcription }),
    });
    return res.message;
  }

  // Stories
  public async getStories(): Promise<Story[]> {
    const [res, cloudStories] = await Promise.all([
      this.request<{ stories: Story[] }>('/stories').catch(() => ({ stories: [] as Story[] })),
      fetchStoriesFromFirestore().catch(() => [] as Story[]),
    ]);
    const byId = new Map<string, Story>();
    for (const s of [...cloudStories, ...(res.stories || [])]) {
      if (s && s.id) byId.set(s.id, s);
    }
    return Array.from(byId.values());
  }

  public async createStory(data: Partial<Story>): Promise<Story> {
    const res = await this.request<{ story: Story }>('/stories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.story) {
      void syncStoryToFirestore(res.story, this.getStoredUser());
    }
    return res.story;
  }

  public async updateStory(storyId: string, data: Partial<Story>): Promise<Story> {
    const res = await this.request<{ story: Story }>(`/stories/${storyId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    if (res.story) {
      void syncStoryToFirestore(res.story, this.getStoredUser());
    }
    return res.story;
  }

  public async deleteStory(storyId: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/stories/${storyId}`, {
      method: 'DELETE',
    });
    void deleteStoryFromFirestore(storyId);
    return res.success;
  }

  public async viewStory(storyId: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/stories/${storyId}/view`, { method: 'POST' });
    return res.success;
  }

  // Calls
  public async getCalls(): Promise<Call[]> {
    const res = await this.request<{ calls: Call[] }>('/calls');
    return res.calls || [];
  }

  public async getActiveCallState(afterSeq: number = 0): Promise<{
    call: Call | null;
    signals: Array<{ seq: number; fromUserId: string; toUserId: string; callId: string; signal: any }>;
  }> {
    return this.request<{
      call: Call | null;
      signals: Array<{ seq: number; fromUserId: string; toUserId: string; callId: string; signal: any }>;
    }>(`/calls/active?afterSeq=${afterSeq}`);
  }

  public async sendCallSignal(callId: string, toUserId: string, signal: any): Promise<{ success: boolean; seq: number }> {
    return this.request<{ success: boolean; seq: number }>(`/calls/${callId}/signal`, {
      method: 'POST',
      body: JSON.stringify({ toUserId, signal }),
    });
  }

  public async initiateCall(data: { receiverId: string; type: 'voice' | 'video'; conversationId?: string }): Promise<Call> {
    const res = await this.request<{ call: Call }>('/calls/start', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.call;
  }

  public async acceptCall(callId: string, type?: 'voice' | 'video'): Promise<Call> {
    const res = await this.request<{ call: Call }>(`/calls/${callId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active', ...(type ? { type } : {}) }),
    });
    return res.call;
  }

  public async rejectCall(callId: string): Promise<Call> {
    const res = await this.request<{ call: Call }>(`/calls/${callId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' }),
    });
    return res.call;
  }

  public async endCall(callId: string): Promise<Call> {
    const res = await this.request<{ call: Call }>(`/calls/${callId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ended' }),
    });
    return res.call;
  }

  // Settings & Devices
  public async getSettings(): Promise<UserSettings> {
    const res = await this.request<{ settings: UserSettings }>('/settings');
    return res.settings;
  }

  public async updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    const res = await this.request<{ settings: UserSettings }>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
    return res.settings;
  }

  public async getDevices(): Promise<DeviceSession[]> {
    const res = await this.request<{ sessions: DeviceSession[] }>('/devices');
    return res.sessions || [];
  }

  public async terminateDevice(id: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/devices/${id}`, { method: 'DELETE' });
    return res.success;
  }

  public async terminateOtherDevices(): Promise<boolean> {
    const res = await this.request<{ success: boolean }>('/devices/other', { method: 'DELETE' });
    return res.success;
  }

  // Uploads
  public async uploadFile(file: File): Promise<{ url: string; filename: string; size: number; mimetype: string }> {
    const fileToDataUrl = (f: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });

    let dataUrl = '';
    try {
      if (file.size <= 550000) {
        dataUrl = await fileToDataUrl(file);
        void uploadFileToFirestore(file, dataUrl, this.getStoredUser());
      }
    } catch {
      // Ignore data URL conversion error
    }

    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Fall back to Firestore / Data URL below
    }

    if (!dataUrl) {
      dataUrl = await fileToDataUrl(file);
      void uploadFileToFirestore(file, dataUrl, this.getStoredUser());
    }

    return {
      url: dataUrl,
      filename: file.name,
      size: file.size,
      mimetype: file.type || 'application/octet-stream',
    };
  }

  // Admin
  public async getAdminStats(): Promise<AdminStats> {
    const res = await this.request<{ stats: AdminStats }>('/admin/stats');
    return res.stats;
  }

  public async getAdminUsers(): Promise<User[]> {
    const res = await this.request<{ users: User[] }>('/admin/users');
    return res.users || [];
  }

  public async updateUserStatus(userId: string, status: string): Promise<{ isBanned: boolean }> {
    return this.request<{ isBanned: boolean }>(`/admin/users/${userId}/ban`, { method: 'PATCH' });
  }

  public async toggleBanUser(userId: string): Promise<{ isBanned: boolean }> {
    return this.request<{ isBanned: boolean }>(`/admin/users/${userId}/ban`, { method: 'PATCH' });
  }

  public async sendBroadcast(content: string, category: string = 'system'): Promise<any> {
    return this.request<any>('/admin/broadcast', {
      method: 'POST',
      body: JSON.stringify({ content, category }),
    });
  }

  public async getAdminReports(): Promise<Report[]> {
    const res = await this.request<{ reports: Report[] }>('/admin/reports');
    return res.reports || [];
  }

  public async updateReportStatus(reportId: string, status: Report['status']): Promise<Report> {
    const res = await this.request<{ report: Report }>(`/admin/reports/${reportId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return res.report;
  }

  public async exportUserData(): Promise<void> {
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch('/api/export', { headers });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aether-data-export.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  public async resetAllData(): Promise<{ success: boolean; message: string }> {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('aether_client_db');
        localStorage.removeItem('aether_deleted_convs');
        localStorage.removeItem('aether_user');
        localStorage.removeItem('aether_token');
        localStorage.removeItem('aether_cached_directory_users');
      } catch {
        // Ignore storage error
      }
    }
    this.token = null;
    clearDirectoryUserCache();
    await purgeAllCloudDataFromFirestore().catch(() => {});
    void signOutFirebaseSession();
    return this.request<{ success: boolean; message: string }>('/system/reset', {
      method: 'POST',
    });
  }
}

export const api = new ApiClient();
