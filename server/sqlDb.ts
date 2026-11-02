import fs from 'fs';
import path from 'path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const SQLITE_FILE = path.join(DATA_DIR, 'aether.sqlite');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export class SqlStorage {
  private db: Database | null = null;
  private SQL: SqlJsStatic | null = null;
  private isInitialized = false;

  public async init(): Promise<void> {
    if (this.isInitialized && this.db) return;

    this.SQL = await initSqlJs();

    if (fs.existsSync(SQLITE_FILE)) {
      try {
        const fileBuffer = fs.readFileSync(SQLITE_FILE);
        this.db = new this.SQL.Database(fileBuffer);
        console.log('📦 Loaded existing SQLite SQL database from', SQLITE_FILE);
      } catch (err) {
        console.error('Failed to read sqlite file, creating fresh database', err);
        this.db = new this.SQL.Database();
      }
    } else {
      this.db = new this.SQL.Database();
      console.log('📦 Created fresh SQLite SQL database');
    }

    this.createTables();
    this.save();
    this.isInitialized = true;
  }

  private createTables(): void {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        display_name TEXT,
        email TEXT,
        password_hash TEXT,
        phone TEXT,
        avatar_url TEXT,
        bio TEXT,
        role TEXT,
        online_status TEXT,
        is_online INTEGER,
        last_seen TEXT,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        type TEXT,
        name TEXT,
        description TEXT,
        avatar_url TEXT,
        username TEXT,
        is_private INTEGER,
        is_encrypted INTEGER,
        created_at TEXT,
        created_by TEXT,
        is_pinned INTEGER DEFAULT 0,
        subscriber_count INTEGER
      );

      CREATE TABLE IF NOT EXISTS conversation_members (
        id TEXT PRIMARY KEY,
        conversation_id TEXT,
        user_id TEXT,
        role TEXT,
        permissions TEXT,
        is_pinned INTEGER DEFAULT 0,
        is_archived INTEGER DEFAULT 0,
        is_muted INTEGER DEFAULT 0,
        unread_count INTEGER DEFAULT 0,
        joined_at TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT,
        sender_id TEXT,
        type TEXT,
        content TEXT,
        media_url TEXT,
        media_data TEXT,
        voice_duration REAL,
        media_type TEXT,
        media_size INTEGER,
        reply_to_id TEXT,
        reply_to TEXT,
        reactions TEXT,
        is_pinned INTEGER DEFAULT 0,
        is_edited INTEGER DEFAULT 0,
        edited_at TEXT,
        is_deleted_for_everyone INTEGER DEFAULT 0,
        status TEXT,
        created_at TEXT,
        contact_card TEXT,
        location_data TEXT,
        transcription TEXT
      );

      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        media_url TEXT,
        media_type TEXT,
        caption TEXT,
        created_at TEXT,
        expires_at TEXT,
        views TEXT
      );

      CREATE TABLE IF NOT EXISTS calls (
        id TEXT PRIMARY KEY,
        caller_id TEXT,
        receiver_id TEXT,
        type TEXT,
        status TEXT,
        started_at TEXT,
        ended_at TEXT,
        duration INTEGER
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        device_name TEXT,
        browser TEXT,
        os TEXT,
        ip TEXT,
        last_active TEXT,
        is_current INTEGER,
        created_at TEXT
      );
    `);

    // Ensure columns added in updates exist for pre-existing sqlite databases
    try {
      this.db.run('ALTER TABLE messages ADD COLUMN transcription TEXT;');
    } catch (_) {}
  }

  public save(): void {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(SQLITE_FILE, buffer);
    } catch (err) {
      console.error('Error persisting SQLite file:', err);
    }
  }

  // --- SQL Operations for Messages (Text, Images, Voice, etc.) ---
  public saveMessage(msg: any): void {
    if (!this.db) return;
    const stmt = `
      INSERT OR REPLACE INTO messages (
        id, conversation_id, sender_id, type, content, media_url, media_data, voice_duration,
        media_type, media_size, reply_to_id, reply_to, reactions, is_pinned, is_edited,
        edited_at, is_deleted_for_everyone, status, created_at, contact_card, location_data, transcription
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;

    this.db.run(stmt, [
      msg.id,
      msg.conversationId,
      msg.senderId,
      msg.type,
      msg.content || '',
      msg.mediaUrl || '',
      msg.mediaData || '',
      msg.voiceDuration || 0,
      msg.mediaType || '',
      msg.mediaSize || 0,
      msg.replyToId || '',
      msg.replyTo ? JSON.stringify(msg.replyTo) : '',
      msg.reactions ? JSON.stringify(msg.reactions) : '[]',
      msg.isPinned ? 1 : 0,
      msg.isEdited ? 1 : 0,
      msg.editedAt || '',
      msg.isDeletedForEveryone ? 1 : 0,
      msg.status || 'sent',
      msg.createdAt,
      msg.contactCard ? JSON.stringify(msg.contactCard) : '',
      msg.location ? JSON.stringify(msg.location) : '',
      msg.transcription || '',
    ]);

    this.save();
  }

  public deleteMessage(id: string): void {
    if (!this.db) return;
    this.db.run('DELETE FROM messages WHERE id = ?;', [id]);
    this.save();
  }

  public clearConversationMessages(conversationId: string): void {
    if (!this.db) return;
    this.db.run('DELETE FROM messages WHERE conversation_id = ?;', [conversationId]);
    this.save();
  }

  public deleteConversation(conversationId: string): void {
    if (!this.db) return;
    this.db.run('DELETE FROM messages WHERE conversation_id = ?;', [conversationId]);
    this.db.run('DELETE FROM conversation_members WHERE conversation_id = ?;', [conversationId]);
    this.db.run('DELETE FROM conversations WHERE id = ?;', [conversationId]);
    this.save();
  }

  public markMessagesRead(conversationId: string, userId: string): void {
    if (!this.db) return;
    this.db.run(
      "UPDATE messages SET status = 'read' WHERE conversation_id = ? AND sender_id != ?;",
      [conversationId, userId]
    );
    this.save();
  }

  public getMessages(conversationId: string): any[] {
    if (!this.db) return [];
    const res = this.db.exec(
      'SELECT * FROM messages WHERE conversation_id = ? AND is_deleted_for_everyone = 0 ORDER BY created_at ASC;',
      [conversationId]
    );
    if (!res || res.length === 0) return [];
    const cols = res[0].columns;
    return res[0].values.map(row => {
      const obj: any = {};
      cols.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return {
        id: obj.id,
        conversationId: obj.conversation_id,
        senderId: obj.sender_id,
        type: obj.type,
        content: obj.content,
        mediaUrl: obj.media_url,
        mediaData: obj.media_data,
        voiceDuration: obj.voice_duration,
        mediaType: obj.media_type,
        mediaSize: obj.media_size,
        replyToId: obj.reply_to_id,
        replyTo: obj.reply_to ? JSON.parse(obj.reply_to) : undefined,
        reactions: obj.reactions ? JSON.parse(obj.reactions) : [],
        isPinned: Boolean(obj.is_pinned),
        isEdited: Boolean(obj.is_edited),
        editedAt: obj.edited_at,
        isDeletedForEveryone: Boolean(obj.is_deleted_for_everyone),
        status: obj.status,
        createdAt: obj.created_at,
        contactCard: obj.contact_card ? JSON.parse(obj.contact_card) : undefined,
        location: obj.location_data ? JSON.parse(obj.location_data) : undefined,
        transcription: obj.transcription || undefined,
      };
    });
  }

  // --- SQL Operations for Users ---
  public saveUser(user: any, passwordHash?: string): void {
    if (!this.db) return;
    const stmt = `
      INSERT OR REPLACE INTO users (
        id, username, display_name, email, password_hash, phone, avatar_url, bio,
        role, online_status, is_online, last_seen, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;

    this.db.run(stmt, [
      user.id,
      user.username,
      user.displayName,
      user.email,
      passwordHash || user.passwordHash || '',
      user.phone || '',
      user.avatarUrl || '',
      user.bio || '',
      user.role || 'user',
      user.onlineStatus || 'online',
      user.isOnline ? 1 : 0,
      user.lastSeen || new Date().toISOString(),
      user.createdAt || new Date().toISOString(),
    ]);

    this.save();
  }

  public getAllUsers(): any[] {
    if (!this.db) return [];
    const res = this.db.exec('SELECT * FROM users;');
    if (!res || res.length === 0) return [];
    const cols = res[0].columns;
    return res[0].values.map(row => {
      const obj: any = {};
      cols.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return {
        id: obj.id,
        username: obj.username,
        displayName: obj.display_name,
        email: obj.email,
        passwordHash: obj.password_hash,
        phone: obj.phone,
        avatarUrl: obj.avatar_url,
        bio: obj.bio,
        role: obj.role,
        onlineStatus: obj.online_status,
        isOnline: Boolean(obj.is_online),
        lastSeen: obj.last_seen,
        createdAt: obj.created_at,
      };
    });
  }

  // --- SQL Operations for Conversations ---
  public saveConversation(c: any): void {
    if (!this.db) return;
    const stmt = `
      INSERT OR REPLACE INTO conversations (
        id, type, name, description, avatar_url, username, is_private, is_encrypted,
        created_at, created_by, is_pinned, subscriber_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    this.db.run(stmt, [
      c.id,
      c.type,
      c.name,
      c.description || '',
      c.avatarUrl || '',
      c.username || '',
      c.isPrivate ? 1 : 0,
      c.isEncrypted ? 1 : 0,
      c.createdAt,
      c.createdBy,
      c.isPinned ? 1 : 0,
      c.subscriberCount || 0,
    ]);
    this.save();
  }

  public getAllConversations(): any[] {
    if (!this.db) return [];
    const res = this.db.exec('SELECT * FROM conversations;');
    if (!res || res.length === 0) return [];
    const cols = res[0].columns;
    return res[0].values.map(row => {
      const obj: any = {};
      cols.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return {
        id: obj.id,
        type: obj.type,
        name: obj.name,
        description: obj.description,
        avatarUrl: obj.avatar_url,
        username: obj.username,
        isPrivate: Boolean(obj.is_private),
        isEncrypted: Boolean(obj.is_encrypted),
        createdAt: obj.created_at,
        createdBy: obj.created_by,
        isPinned: Boolean(obj.is_pinned),
        subscriberCount: obj.subscriber_count,
      };
    });
  }

  // --- SQL Operations for Members ---
  public saveConversationMember(m: any): void {
    if (!this.db) return;
    const stmt = `
      INSERT OR REPLACE INTO conversation_members (
        id, conversation_id, user_id, role, permissions, is_pinned, is_archived,
        is_muted, unread_count, joined_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    this.db.run(stmt, [
      m.id,
      m.conversationId,
      m.userId,
      m.role,
      JSON.stringify(m.permissions || {}),
      m.isPinned ? 1 : 0,
      m.isArchived ? 1 : 0,
      m.isMuted ? 1 : 0,
      m.unreadCount || 0,
      m.joinedAt,
    ]);
    this.save();
  }

  public getAllConversationMembers(): any[] {
    if (!this.db) return [];
    const res = this.db.exec('SELECT * FROM conversation_members;');
    if (!res || res.length === 0) return [];
    const cols = res[0].columns;
    return res[0].values.map(row => {
      const obj: any = {};
      cols.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return {
        id: obj.id,
        conversationId: obj.conversation_id,
        userId: obj.user_id,
        role: obj.role,
        permissions: obj.permissions ? JSON.parse(obj.permissions) : {},
        isPinned: Boolean(obj.is_pinned),
        isArchived: Boolean(obj.is_archived),
        isMuted: Boolean(obj.is_muted),
        unreadCount: obj.unread_count,
        joinedAt: obj.joined_at,
      };
    });
  }

  // --- Table count statistics ---
  public getStats(): { users: number; messages: number; conversations: number; databaseFile: string } {
    const userCount = this.db?.exec('SELECT COUNT(*) as count FROM users;')[0]?.values[0][0] as number || 0;
    const messageCount = this.db?.exec('SELECT COUNT(*) as count FROM messages;')[0]?.values[0][0] as number || 0;
    const convCount = this.db?.exec('SELECT COUNT(*) as count FROM conversations;')[0]?.values[0][0] as number || 0;
    return {
      users: userCount,
      messages: messageCount,
      conversations: convCount,
      databaseFile: SQLITE_FILE,
    };
  }

  public deleteUser(userId: string, username?: string): void {
    if (!this.db) return;
    try {
      this.db.run('DELETE FROM users WHERE id = ?;', [userId]);
      if (username) {
        this.db.run('DELETE FROM users WHERE LOWER(username) = LOWER(?);', [username]);
      }
      this.db.run('DELETE FROM sessions WHERE user_id = ?;', [userId]);
      this.db.run('DELETE FROM conversation_members WHERE user_id = ?;', [userId]);
      this.db.run('DELETE FROM messages WHERE sender_id = ?;', [userId]);
      this.db.run('DELETE FROM stories WHERE user_id = ?;', [userId]);
      this.db.run('DELETE FROM calls WHERE caller_id = ? OR receiver_id = ?;', [userId, userId]);
      this.save();
    } catch (err) {
      console.error('Failed to delete user from SQLite:', err);
    }
  }

  public clearAllChats(): void {
    if (!this.db) return;
    this.db.run(`
      DELETE FROM messages;
      DELETE FROM conversation_members;
      DELETE FROM conversations;
      DELETE FROM stories;
      DELETE FROM calls;
    `);
    this.save();
  }

  public clearAll(): void {
    if (!this.db) return;
    this.db.run(`
      DELETE FROM messages;
      DELETE FROM conversation_members;
      DELETE FROM conversations;
      DELETE FROM users;
      DELETE FROM stories;
      DELETE FROM calls;
      DELETE FROM sessions;
    `);
    this.save();
  }
}

export const sqlStorage = new SqlStorage();
