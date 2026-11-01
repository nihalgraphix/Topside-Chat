import fs from 'fs';
import path from 'path';
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
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'aether.db.json');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

class AetherDatabase {
  private data: DatabaseSchema;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.data = this.load();
    this.initSql();
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
    const DEMO_USER_IDS = new Set([
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

        parsed.users = (parsed.users || []).filter((u: any) => !DEMO_USER_IDS.has(u.id));
        parsed.sessions = (parsed.sessions || []).filter((s: any) => !DEMO_USER_IDS.has(s.userId));
        parsed.conversations = (parsed.conversations || []).filter(
          (c: any) => c.type !== 'channel' && !isDemoConversation(c.id)
        );
        const validConvIds = new Set(parsed.conversations.map((c: any) => c.id));
        parsed.conversationMembers = (parsed.conversationMembers || []).filter(
          (m: any) => !DEMO_USER_IDS.has(m.userId) && validConvIds.has(m.conversationId)
        );
        parsed.messages = (parsed.messages || []).filter(
          (m: any) => !DEMO_USER_IDS.has(m.senderId) && validConvIds.has(m.conversationId)
        );
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
    };
  }

  public saveSync(): void {
    try {
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

  public resetAllData(): void {
    this.clearAllData();
  }

  // --- Users API ---
  public getUsers(): User[] {
    return this.data.users.map(({ passwordHash, ...user }) => user);
  }

  public getUserById(id: string): User | undefined {
    const user = this.data.users.find(u => u.id === id);
    if (!user) return undefined;
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  public getUserByUsername(username: string): (User & { passwordHash: string }) | undefined {
    return this.data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  public getUserByEmail(email: string): (User & { passwordHash: string }) | undefined {
    return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  public createUser(user: User & { passwordHash: string }): User {
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
    return safeUser;
  }

  public setUserOnline(userId: string, isOnline: boolean): void {
    const user = this.data.users.find(u => u.id === userId);
    if (user) {
      user.isOnline = isOnline;
      user.onlineStatus = isOnline ? 'online' : 'offline';
      user.lastSeen = new Date().toISOString();
      this.queueSave();
    }
  }

  // --- Conversations API ---
  public getUserConversations(userId: string): Conversation[] {
    const memberRecords = this.data.conversationMembers.filter(cm => cm.userId === userId);
    const convIds = memberRecords.map(cm => cm.conversationId);

    const convs = this.data.conversations
      .filter(c => c.type !== 'channel' && convIds.includes(c.id))
      .map(c => {
        const mem = memberRecords.find(m => m.conversationId === c.id);
        const allMembers = this.data.conversationMembers
          .filter(m => m.conversationId === c.id)
          .map(m => ({
            ...m,
            user: this.getUserById(m.userId),
          }));

        // Fetch last message
        const messages = this.data.messages.filter(m => m.conversationId === c.id);
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;

        // Count unread
        const unreadCount = messages.filter(m => m.senderId !== userId && m.status !== 'read').length;

        // For direct chats, dynamically set name and avatar to other participant if not set
        let name = c.name;
        let avatarUrl = c.avatarUrl;
        if (c.type === 'direct') {
          const otherMember = allMembers.find(m => m.userId !== userId);
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

    const allMembers = this.data.conversationMembers
      .filter(m => m.conversationId === c.id)
      .map(m => ({
        ...m,
        user: this.getUserById(m.userId),
      }));

    const messages = this.data.messages.filter(m => m.conversationId === c.id);
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;

    let name = c.name;
    let avatarUrl = c.avatarUrl;
    if (c.type === 'direct' && currentUserId) {
      const otherMember = allMembers.find(m => m.userId !== currentUserId);
      if (otherMember && otherMember.user) {
        name = otherMember.user.displayName;
        avatarUrl = otherMember.user.avatarUrl;
      }
    }

    const mem = currentUserId ? this.data.conversationMembers.find(m => m.conversationId === c.id && m.userId === currentUserId) : undefined;

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

  public createConversation(
    creatorId: string,
    data: {
      type: 'direct' | 'group' | 'channel' | 'saved';
      name: string;
      description?: string;
      avatarUrl?: string;
      username?: string;
      isPrivate?: boolean;
      memberIds?: string[];
    }
  ): Conversation {
    const convId = `c_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
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
        if (mId !== creatorId) {
          this.data.conversationMembers.push({
            id: `cm_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            conversationId: convId,
            userId: mId,
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
    return this.getConversationById(convId, creatorId)!;
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

  // --- Messages API ---
  public getMessages(conversationId: string): Message[] {
    return this.data.messages
      .filter(m => m.conversationId === conversationId && !m.isDeletedForEveryone)
      .map(m => ({
        ...m,
        sender: this.getUserById(m.senderId),
      }));
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
    const id = msgData.id || `m_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;

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

    this.data.messages.push(newMsg);
    this.queueSave();
    try {
      sqlStorage.saveMessage(newMsg);
    } catch (err) {
      console.error('Failed to save message to SQLite', err);
    }

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

  public createCall(callerId: string, receiverId: string, conversationId: string, type: 'voice' | 'video'): Call {
    // End any stale ringing calls from the same caller
    this.data.calls.forEach(c => {
      if ((c.callerId === callerId || c.receiverId === callerId) && (c.status === 'ringing' || c.status === 'initiating')) {
        c.status = 'ended';
        c.endedAt = new Date().toISOString();
      }
    });

    const newCall: Call = {
      id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      callerId,
      receiverId,
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
      .filter(c => c.callerId === userId || c.receiverId === userId)
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

    return {
      totalUsers,
      activeUsers,
      messagesSent,
      totalGroups,
      totalChannels,
      totalCalls,
      storageUsageBytes,
      pendingReports,
      dailyActivity,
    };
  }

  public toggleBanUser(userId: string): boolean {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return false;
    user.isBanned = !user.isBanned;
    this.queueSave();
    return user.isBanned;
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
