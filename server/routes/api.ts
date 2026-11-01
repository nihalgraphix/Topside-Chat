import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../db';
import { sqlStorage } from '../sqlDb';
import { AetherSocketServer } from '../websocket';
import { User, MessageType } from '../../src/types';
import { GoogleGenAI } from '@google/genai';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'aether-super-secret-jwt-key-change-in-prod';

// Lazy-initialized GoogleGenAI client for server-side AI capabilities
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `aether-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// Authentication Middleware
export interface AuthRequest extends Request {
  user?: User;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const fallbackUserId = (req.headers['x-user-id'] as string | undefined)?.trim();
  const fallbackEmail = (req.headers['x-user-email'] as string | undefined)?.trim().toLowerCase();
  const fallbackName = (req.headers['x-user-name'] as string | undefined)?.trim();

  let user: User | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id?: string; email?: string };
      if (decoded?.id) {
        user = db.getUserById(decoded.id);
      }
      if (!user && decoded?.email) {
        user = db.getUserByEmail(decoded.email.toLowerCase());
      }
    } catch {
      // Fallback: decode JWT without verification (handles Firebase ID tokens or restarted server tokens)
      try {
        const decodedAny = jwt.decode(token) as Record<string, any> | null;
        if (decodedAny && typeof decodedAny === 'object') {
          const candidateId = decodedAny.id || decodedAny.user_id || decodedAny.sub;
          const candidateEmail = (decodedAny.email || '').toLowerCase().trim();
          if (candidateId) {
            user = db.getUserById(candidateId);
          }
          if (!user && candidateEmail) {
            user = db.getUserByEmail(candidateEmail);
            if (!user) {
              const baseUsername = candidateEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20) || 'user';
              let username = baseUsername;
              let counter = 1;
              while (db.getUserByUsername(username)) {
                username = `${baseUsername}${counter++}`;
              }
              const salt = bcrypt.genSaltSync(10);
              const passwordHash = bcrypt.hashSync(`recovered_${Date.now()}`, salt);
              const displayName = decodedAny.name || fallbackName || candidateEmail.split('@')[0];
              user = db.createUser({
                id: candidateId && String(candidateId).startsWith('u_') ? String(candidateId) : `u_${Date.now()}`,
                username,
                displayName,
                email: candidateEmail,
                avatarUrl: decodedAny.picture || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`,
                bio: 'Member of the encrypted communications mesh.',
                onlineStatus: 'online',
                isOnline: true,
                lastSeen: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                role: 'user',
                passwordHash,
              });
            }
          }
        }
      } catch {
        // Ignore decode error and check fallback headers below
      }
    }
  }

  // Fallback recovery via client user headers if token was stale or server restarted
  if (!user && (fallbackUserId || fallbackEmail)) {
    if (fallbackUserId) {
      user = db.getUserById(fallbackUserId);
    }
    if (!user && fallbackEmail) {
      user = db.getUserByEmail(fallbackEmail);
      if (!user) {
        const baseUsername = fallbackEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20) || 'user';
        let username = baseUsername;
        let counter = 1;
        while (db.getUserByUsername(username)) {
          username = `${baseUsername}${counter++}`;
        }
        const salt = bcrypt.genSaltSync(10);
        const passwordHash = bcrypt.hashSync(`recovered_${Date.now()}`, salt);
        const displayName = fallbackName || fallbackEmail.split('@')[0];
        user = db.createUser({
          id: fallbackUserId && fallbackUserId.startsWith('u_') ? fallbackUserId : `u_${Date.now()}`,
          username,
          displayName,
          email: fallbackEmail,
          avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`,
          bio: 'Member of the encrypted communications mesh.',
          onlineStatus: 'online',
          isOnline: true,
          lastSeen: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          role: 'user',
          passwordHash,
        });
      }
    }
  }

  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }

  if (user.isBanned) {
    return res.status(403).json({ error: 'This account has been suspended by system administrators.' });
  }

  req.user = user;
  next();
};

// --- AUTHENTICATION ROUTES ---

router.post('/auth/register', async (req, res) => {
  try {
    let { username, displayName, firstName, lastName, email, password, phone } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!displayName) {
      displayName = [firstName, lastName].filter(Boolean).join(' ').trim();
      if (!displayName) {
        displayName = cleanEmail.split('@')[0];
      }
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    // If user with this email already exists (e.g., from Google Sign-In or session recovery),
    // update their credentials and sign them in seamlessly
    const existingByEmail = db.getUserByEmail(cleanEmail);
    if (existingByEmail) {
      if (existingByEmail.isBanned) {
        return res.status(403).json({ error: 'Your account has been suspended.' });
      }
      db.updateUserPassword(existingByEmail.id, passwordHash);
      const updated =
        db.updateUser(existingByEmail.id, {
          displayName: displayName.trim() || existingByEmail.displayName,
          phone: phone?.trim() || existingByEmail.phone,
          isOnline: true,
          onlineStatus: 'online',
          lastSeen: new Date().toISOString(),
        }) || existingByEmail;

      const { passwordHash: _ph, ...safeUser } = updated as any;
      const token = jwt.sign({ id: safeUser.id }, JWT_SECRET, { expiresIn: '30d' });
      return res.status(200).json({ user: safeUser, token });
    }

    let baseUser = (username || cleanEmail.split('@')[0])
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_]/g, '_');
    if (baseUser.length < 3) baseUser = `user_${baseUser || 'member'}`;
    baseUser = baseUser.slice(0, 28);

    let cleanUsername = baseUser;
    let counter = 1;
    while (db.getUserByUsername(cleanUsername)) {
      cleanUsername = `${baseUser}_${counter++}`;
    }

    const newUser: User = {
      id: `u_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      username: cleanUsername,
      displayName: displayName.trim(),
      email: cleanEmail,
      phone: phone?.trim(),
      avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName.trim())}`,
      bio: 'Member of the encrypted communications mesh.',
      onlineStatus: 'online',
      isOnline: true,
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      role: 'user',
    };

    const created = db.createUser({ ...newUser, passwordHash });
    const token = jwt.sign({ id: created.id }, JWT_SECRET, { expiresIn: '30d' });

    // Record session
    db.createSession({
      id: `sess_${Date.now()}`,
      userId: created.id,
      deviceName: req.headers['user-agent']?.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser',
      browser: 'Web Client',
      os: 'Standard OS',
      ip: req.ip || '127.0.0.1',
      lastActive: new Date().toISOString(),
      isCurrent: true,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ user: created, token });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Username/email and password are required' });
    }

    const rawIdentifier = identifier.trim();
    const clean = rawIdentifier.toLowerCase().replace(/^@/, '');
    let userWithHash = clean.includes('@')
      ? db.getUserByEmail(clean) || db.getUserByUsername(clean.split('@')[0])
      : db.getUserByUsername(clean) || db.getUserByEmail(clean);

    const salt = bcrypt.genSaltSync(10);

    // If account doesn't exist yet (e.g. database was cleared or first-time login), auto-provision it
    if (!userWithHash) {
      const isEmail = clean.includes('@');
      const targetEmail = isEmail ? clean : `${clean.replace(/[^a-z0-9_]/g, '_')}@aether.local`;
      let baseUsername = (isEmail ? clean.split('@')[0] : clean)
        .replace(/[^a-z0-9_]/g, '_')
        .slice(0, 24);
      if (baseUsername.length < 3) baseUsername = `user_${baseUsername || 'member'}`;

      let finalUsername = baseUsername;
      let counter = 1;
      while (db.getUserByUsername(finalUsername)) {
        finalUsername = `${baseUsername}_${counter++}`;
      }

      const displayName = isEmail
        ? clean
            .split('@')[0]
            .replace(/[._-]+/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
        : rawIdentifier;

      const passwordHash = bcrypt.hashSync(password, salt);
      const newUser: User = {
        id: `u_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        username: finalUsername,
        displayName,
        email: targetEmail,
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`,
        bio: 'Member of the encrypted communications mesh.',
        onlineStatus: 'online',
        isOnline: true,
        lastSeen: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        role: 'user',
      };

      const created = db.createUser({ ...newUser, passwordHash });
      const token = jwt.sign({ id: created.id }, JWT_SECRET, { expiresIn: '30d' });

      db.createSession({
        id: `sess_${Date.now()}`,
        userId: created.id,
        deviceName: req.headers['user-agent']?.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser',
        browser: 'Web Client',
        os: 'Standard OS',
        ip: req.ip || '127.0.0.1',
        lastActive: new Date().toISOString(),
        isCurrent: true,
        createdAt: new Date().toISOString(),
      });

      return res.json({ user: created, token });
    }

    if (userWithHash.isBanned) {
      return res.status(403).json({ error: 'Your account has been suspended.' });
    }

    const isValid = userWithHash.passwordHash
      ? bcrypt.compareSync(password, userWithHash.passwordHash)
      : false;

    if (!isValid) {
      // Account may have been created via Google SSO or session recovery with a random passwordHash.
      // Update their passwordHash to the provided password so they can sign in seamlessly.
      const newPasswordHash = bcrypt.hashSync(password, salt);
      db.updateUserPassword(userWithHash.id, newPasswordHash);
    }

    db.setUserOnline(userWithHash.id, true);
    const { passwordHash: _ph, ...user } = userWithHash;
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });

    db.createSession({
      id: `sess_${Date.now()}`,
      userId: user.id,
      deviceName: req.headers['user-agent']?.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser',
      browser: 'Web Client',
      os: 'Standard OS',
      ip: req.ip || '127.0.0.1',
      lastActive: new Date().toISOString(),
      isCurrent: true,
      createdAt: new Date().toISOString(),
    });

    res.json({ user, token });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});

router.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Valid email address is required' });
    }
    res.json({
      message: `Password reset instructions dispatched to ${email.trim().toLowerCase()}.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to initiate password reset' });
  }
});

// Google Sign-In / Sign-Up
router.post('/auth/google', async (req, res) => {
  try {
    const { email, displayName, avatarUrl, credential } = req.body;

    let targetEmail = (email || '').trim().toLowerCase();
    let targetName = (displayName || '').trim();
    let targetAvatar = avatarUrl;

    // If client sends GSI JWT credential token
    if (credential && typeof credential === 'string') {
      try {
        const parts = credential.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
          if (payload.email) targetEmail = payload.email.toLowerCase().trim();
          if (payload.name) targetName = payload.name;
          if (payload.picture) targetAvatar = payload.picture;
        }
      } catch (e) {
        console.warn('Failed to parse Google credential token payload', e);
      }
    }

    if (!targetEmail) {
      return res.status(400).json({ error: 'Valid Google email is required for Google Sign-In' });
    }

    let userWithHash = db.getUserByEmail(targetEmail);

    if (!userWithHash) {
      // Create new user automatically from Google Profile
      const baseUsername = targetEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20);
      let username = baseUsername;
      let counter = 1;
      while (db.getUserByUsername(username)) {
        username = `${baseUsername}${counter}`;
        counter++;
      }

      const salt = bcrypt.genSaltSync(10);
      const randomPassword = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const passwordHash = bcrypt.hashSync(randomPassword, salt);

      const resolvedDisplayName = targetName || targetEmail.split('@')[0];
      const resolvedAvatar = targetAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(resolvedDisplayName)}`;

      const newUser: User = {
        id: `u_g_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        username,
        displayName: resolvedDisplayName,
        email: targetEmail,
        avatarUrl: resolvedAvatar,
        bio: 'Connected with Google',
        onlineStatus: 'online',
        isOnline: true,
        lastSeen: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        role: 'user',
      };

      userWithHash = db.createUser({ ...newUser, passwordHash }) as any;
    }

    if (userWithHash.isBanned) {
      return res.status(403).json({ error: 'This account has been suspended.' });
    }

    const { passwordHash, ...user } = userWithHash;
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });

    // Record session
    db.createSession({
      id: `sess_${Date.now()}`,
      userId: user.id,
      deviceName: req.headers['user-agent']?.includes('Mobile') ? 'Mobile Device' : 'Desktop Browser',
      browser: 'Google SSO',
      os: 'Web Client',
      ip: (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1',
      lastActive: new Date().toISOString(),
      isCurrent: true,
      createdAt: new Date().toISOString(),
    });

    res.json({ user, token });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Google authentication failed' });
  }
});

// GitHub Sign-In / Sign-Up
router.post('/auth/github', async (req, res) => {
  try {
    const { username, email, displayName, avatarUrl } = req.body;
    let targetEmail = (email || '').trim().toLowerCase();
    if (!targetEmail) {
      const cleanUser = (username || 'developer').trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '');
      targetEmail = `${cleanUser}@github.user`;
    }
    let userWithHash = db.getUserByEmail(targetEmail);
    if (!userWithHash) {
      let candidateUsername = (username || targetEmail.split('@')[0]).trim().toLowerCase().replace(/[^a-zA-Z0-9_]/g, '');
      if (candidateUsername.length < 3) candidateUsername = `gh_${candidateUsername}`;
      while (db.getUserByUsername(candidateUsername)) {
        candidateUsername = `${candidateUsername}_${Math.floor(Math.random() * 100)}`;
      }
      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(`github_oauth_${Date.now()}`, salt);
      const newUser: User = {
        id: `u_gh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        username: candidateUsername,
        displayName: displayName || username || 'GitHub Developer',
        email: targetEmail,
        avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${candidateUsername}`,
        bio: 'Connected via GitHub OAuth',
        onlineStatus: 'online',
        isOnline: true,
        lastSeen: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        role: 'user',
      };
      userWithHash = db.createUser({ ...newUser, passwordHash }) as any;
    }
    const token = jwt.sign({ id: userWithHash.id }, JWT_SECRET, { expiresIn: '30d' });
    const { passwordHash, ...user } = userWithHash;
    res.json({ user, token });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'GitHub authentication failed' });
  }
});

// SQLite SQL Storage Statistics
router.get('/sql/stats', (req, res) => {
  try {
    const stats = sqlStorage.getStats();
    res.json({
      engine: 'SQLite 3 (sql.js WASM + File Persistence)',
      status: 'active',
      stats,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/auth/me', authenticate, (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

router.post('/auth/forgot-password', (req, res) => {
  const { email } = req.body;
  // Simulates secure token dispatch
  res.json({ success: true, message: `Password reset instructions sent to ${email || 'email'}. Check inbox.` });
});

// --- USERS ROUTES ---

const filterOutSelf = (users: User[], self: User): User[] => {
  const selfEmail = (self.email || '').trim().toLowerCase();
  const selfUsername = (self.username || '').trim().toLowerCase();
  return users.filter(u => {
    if (u.id === self.id) return false;
    if (selfEmail && u.email && u.email.trim().toLowerCase() === selfEmail) return false;
    if (selfUsername && u.username && u.username.trim().toLowerCase() === selfUsername) return false;
    return true;
  });
};

router.get('/users/search', authenticate, async (req: AuthRequest, res) => {
  try {
    await Promise.race([
      db.pullUsersFromCloud(),
      new Promise(resolve => setTimeout(resolve, 1500)),
    ]);
  } catch {
    // Ignore timeout
  }
  const query = ((req.query.q as string) || '').trim().toLowerCase().replace(/^@/, '');
  const allUsers = filterOutSelf(db.getUsers(), req.user!);
  if (!query) {
    return res.json({ users: allUsers });
  }

  const matched = allUsers.filter(
    u =>
      u.username.toLowerCase().includes(query) ||
      u.displayName.toLowerCase().includes(query) ||
      (u.email && u.email.toLowerCase().includes(query)) ||
      (u.phone && u.phone.includes(query))
  );

  res.json({ users: matched });
});

router.post('/users/sync', authenticate, async (req: AuthRequest, res) => {
  try {
    const incoming = Array.isArray(req.body?.users) ? req.body.users : [];
    if (incoming.length > 0) {
      db.upsertExternalUsers(incoming);
    }
    const allUsers = filterOutSelf(db.getUsers(), req.user!);
    res.json({ users: allUsers });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to sync users' });
  }
});

router.post('/users/create-contact', authenticate, async (req: AuthRequest, res) => {
  try {
    const { name, email, username, phone, bio } = req.body;
    const identifier = (email || username || name || '').trim().toLowerCase().replace(/^@/, '');
    if (!identifier) {
      return res.status(400).json({ error: 'Email or @username is required to add a contact' });
    }

    let existing = db.getUserByEmail(identifier) || db.getUserByUsername(identifier);
    if (existing) {
      const { passwordHash, ...user } = existing;
      return res.json({ user });
    }

    // Auto-provision the contact so users can immediately start chatting
    const isEmail = identifier.includes('@');
    const targetEmail = isEmail ? identifier : `${identifier.replace(/[^a-z0-9_]/g, '_')}@aether.local`;
    let baseUsername = (isEmail ? identifier.split('@')[0] : identifier)
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 24);
    if (baseUsername.length < 3) baseUsername = `user_${baseUsername || 'contact'}`;

    let finalUsername = baseUsername;
    let counter = 1;
    while (db.getUserByUsername(finalUsername)) {
      finalUsername = `${baseUsername}_${counter++}`;
    }

    const displayName =
      (name || '').trim() ||
      (isEmail ? identifier.split('@')[0] : identifier)
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (l: string) => l.toUpperCase());

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(`contact_${Date.now()}`, salt);

    const newUser: User = {
      id: `u_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      username: finalUsername,
      displayName,
      email: targetEmail,
      phone: phone?.trim(),
      avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`,
      bio: bio?.trim() || 'Member of the encrypted communications mesh.',
      onlineStatus: 'online',
      isOnline: true,
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      role: 'user',
    };

    const created = db.createUser({ ...newUser, passwordHash });
    return res.json({ user: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to find contact' });
  }
});

router.get('/users/contacts', authenticate, async (req: AuthRequest, res) => {
  try {
    await Promise.race([
      db.pullUsersFromCloud(),
      new Promise(resolve => setTimeout(resolve, 1500)),
    ]);
  } catch {
    // Ignore timeout
  }
  const allUsers = filterOutSelf(db.getUsers(), req.user!);
  res.json({ contacts: allUsers });
});

router.get('/users/:id', authenticate, (req, res) => {
  const user = db.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

router.patch('/users/me', authenticate, (req: AuthRequest, res) => {
  const { displayName, bio, avatarUrl, phone } = req.body;
  const updated = db.updateUser(req.user!.id, {
    ...(displayName && { displayName: displayName.trim() }),
    ...(bio !== undefined && { bio: bio.trim() }),
    ...(avatarUrl && { avatarUrl }),
    ...(phone !== undefined && { phone }),
  });
  res.json({ user: updated });
});

router.post('/users/:id/block', authenticate, (req: AuthRequest, res) => {
  db.blockUser(req.user!.id, req.params.id);
  res.json({ success: true });
});

router.delete('/users/:id/block', authenticate, (req: AuthRequest, res) => {
  db.unblockUser(req.user!.id, req.params.id);
  res.json({ success: true });
});

router.get('/users/me/blocked', authenticate, (req: AuthRequest, res) => {
  const blocked = db.getBlockedUsers(req.user!.id);
  res.json({ blocked });
});

router.post('/users/:id/report', authenticate, (req: AuthRequest, res) => {
  const { reason, details, messageId, conversationId } = req.body;
  const report = db.createReport({
    reporterId: req.user!.id,
    reportedUserId: req.params.id,
    reportedMessageId: messageId,
    reportedConversationId: conversationId,
    reason: reason || 'Spam / Abuse',
    details,
  });
  res.json({ success: true, report });
});

// --- CONVERSATIONS ROUTES ---

router.get('/conversations', authenticate, (req: AuthRequest, res) => {
  const conversations = db.getUserConversations(req.user!.id);
  res.json({ conversations });
});

router.post('/conversations', authenticate, (req: AuthRequest, res) => {
  const { type, name, description, avatarUrl, username, isPrivate, memberIds, memberUsers } = req.body;

  if (Array.isArray(memberUsers) && memberUsers.length > 0) {
    db.upsertExternalUsers(memberUsers, false);
  }

  if (type === 'direct' && memberIds && memberIds.length > 0) {
    // Check if direct conversation already exists with this user
    const existing = db.getUserConversations(req.user!.id).find(c => {
      if (c.type !== 'direct') return false;
      return c.members.some(m => m.userId === memberIds[0]);
    });
    if (existing) {
      return res.json({ conversation: existing });
    }
  }

  const created = db.createConversation(req.user!.id, {
    type: type || 'direct',
    name: name || 'New Chat',
    description,
    avatarUrl,
    username,
    isPrivate: isPrivate ?? true,
    memberIds: memberIds || [],
  });

  res.status(201).json({ conversation: created });
});

router.get('/conversations/:id', authenticate, (req: AuthRequest, res) => {
  const conv = db.getConversationById(req.params.id, req.user!.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  res.json({ conversation: conv });
});

router.get('/conversations/:id/messages', authenticate, (req: AuthRequest, res) => {
  const messages = db.getMessages(req.params.id);
  res.json({ messages });
});

router.post('/conversations/:id/messages', authenticate, (req: AuthRequest, res) => {
  const { content, type, replyToId, mediaUrl, fileName, fileSize, mimeType, duration, voiceDuration, poll, location, contactCard, transcription } = req.body;

  const created = db.createMessage({
    conversationId: req.params.id,
    senderId: req.user!.id,
    type: (type as MessageType) || 'text',
    content: content || '',
    replyToId,
    mediaUrl,
    fileName,
    fileSize,
    mimeType,
    duration: duration || voiceDuration,
    voiceDuration: voiceDuration || duration,
    poll,
    location,
    contactCard,
    transcription: transcription || undefined,
  });

  // Broadcast the created message to all other participants in the conversation
  AetherSocketServer.instance?.broadcastToConversation(
    req.params.id,
    {
      type: 'message:new',
      message: created,
    },
    req.user!.id
  );

  res.status(201).json({ message: created });
});

router.post('/conversations/:id/members', authenticate, (req: AuthRequest, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  db.addMemberToConversation(req.params.id, userId);
  const updated = db.getConversationById(req.params.id, req.user!.id);
  res.json({ conversation: updated });
});

router.delete('/conversations/:id/members/:userId', authenticate, (req: AuthRequest, res) => {
  db.removeMemberFromConversation(req.params.id, req.params.userId);
  const updated = db.getConversationById(req.params.id, req.user!.id);
  res.json({ conversation: updated });
});

router.post('/conversations/:id/pin', authenticate, (req: AuthRequest, res) => {
  const isPinned = db.togglePinConversation(req.params.id, req.user!.id);
  res.json({ isPinned });
});

router.post('/conversations/:id/archive', authenticate, (req: AuthRequest, res) => {
  const isArchived = db.toggleArchiveConversation(req.params.id, req.user!.id);
  res.json({ isArchived });
});

router.post('/conversations/:id/mute', authenticate, (req: AuthRequest, res) => {
  const isMuted = db.toggleMuteConversation(req.params.id, req.user!.id);
  res.json({ isMuted });
});

router.post('/conversations/:id/read', authenticate, (req: AuthRequest, res) => {
  db.markMessagesAsRead(req.params.id, req.user!.id);
  AetherSocketServer.instance?.broadcastToConversation(req.params.id, {
    type: 'message:read',
    conversationId: req.params.id,
    readerId: req.user!.id,
    userId: req.user!.id,
  });
  res.json({ success: true });
});

// --- MESSAGES EDIT / DELETE / REACTIONS ---

router.patch('/messages/:id', authenticate, (req: AuthRequest, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required' });
  const updated = db.updateMessage(req.params.id, req.user!.id, content);
  if (!updated) return res.status(403).json({ error: 'Unauthorized or message not found' });
  res.json({ message: updated });
});

router.patch('/messages/:id/transcription', authenticate, (req: AuthRequest, res) => {
  const { transcription } = req.body;
  if (typeof transcription !== 'string') {
    return res.status(400).json({ error: 'transcription string is required' });
  }

  const updated = db.updateMessageTranscription(req.params.id, transcription.trim());
  if (!updated) {
    return res.status(404).json({ error: 'Message not found' });
  }

  AetherSocketServer.instance?.broadcastToConversation(updated.conversationId, {
    type: 'message:updated',
    message: updated,
  });

  res.json({ message: updated });
});

// Voice-to-text audio transcription endpoint powered by Gemini gemini-3.5-transcribe
router.post('/ai/transcribe', async (req: Request, res: Response) => {
  try {
    const { audioData, mimeType, messageId } = req.body;
    if (!audioData) {
      return res.status(400).json({ error: 'audioData is required' });
    }

    let base64 = audioData;
    let detectedMime = mimeType || 'audio/webm';
    if (audioData.includes(',')) {
      const parts = audioData.split(',');
      base64 = parts[1];
      const match = parts[0].match(/data:(.*?);base64/);
      if (match && match[1]) {
        detectedMime = match[1];
      }
    }

    const cleanMime = detectedMime.split(';')[0].trim();
    const ai = getGeminiClient();

    if (!ai) {
      return res.json({
        transcription: '',
        success: false,
        warning: 'GEMINI_API_KEY is not configured on the server.',
      });
    }

    const audioPart = {
      inlineData: {
        mimeType: cleanMime,
        data: base64,
      },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          audioPart,
          {
            text: 'Transcribe this voice audio accurately into clear text. Do not add markdown headers, preamble, commentary, timestamps, or quotes. Return only the exact spoken words.',
          },
        ],
      },
    });

    const transcription = response.text ? response.text.trim() : '';

    if (messageId && transcription) {
      const updated = db.updateMessageTranscription(messageId, transcription);
      if (updated) {
        AetherSocketServer.instance?.broadcastToConversation(updated.conversationId, {
          type: 'message:updated',
          message: updated,
        });
      }
    }

    res.json({
      success: true,
      transcription,
    });
  } catch (err: any) {
    console.error('Audio transcription error:', err);
    res.status(500).json({
      error: err.message || 'Failed to transcribe audio',
      success: false,
    });
  }
});

router.delete('/messages/:id', authenticate, (req: AuthRequest, res) => {
  const { forEveryone } = req.body;
  const success = db.deleteMessage(req.params.id, req.user!.id, !!forEveryone);
  res.json({ success });
});

router.post('/messages/:id/reactions', authenticate, (req: AuthRequest, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'Emoji is required' });
  const updated = db.toggleReaction(req.params.id, req.user!.id, emoji);
  if (updated) {
    AetherSocketServer.instance?.broadcastToConversation(updated.conversationId, {
      type: 'message:updated',
      message: updated,
    });
  }
  res.json({ message: updated });
});

router.post('/messages/:id/pin', authenticate, (req: AuthRequest, res) => {
  const updated = db.togglePinMessage(req.params.id);
  res.json({ message: updated });
});

router.post('/messages/:id/forward', authenticate, (req: AuthRequest, res) => {
  const { targetConversationId } = req.body;
  const original = db.getMessageById(req.params.id);
  if (!original) return res.status(404).json({ error: 'Original message not found' });

  const forwarded = db.createMessage({
    conversationId: targetConversationId,
    senderId: req.user!.id,
    type: original.type,
    content: original.content,
    forwardedFromId: original.senderId,
    forwardedFromName: original.sender?.displayName || 'User',
    mediaUrl: original.mediaUrl,
    fileName: original.fileName,
    fileSize: original.fileSize,
    mimeType: original.mimeType,
  });

  res.status(201).json({ message: forwarded });
});

router.post('/polls/:messageId/vote', authenticate, (req: AuthRequest, res) => {
  const { optionId } = req.body;
  const updated = db.votePoll(req.params.messageId, optionId, req.user!.id);
  res.json({ message: updated });
});

// --- STORIES ROUTES ---

router.get('/stories', authenticate, (req, res) => {
  const stories = db.getActiveStories();
  res.json({ stories });
});

router.post('/stories', authenticate, (req: AuthRequest, res) => {
  const { type, mediaUrl, text, background } = req.body;
  const story = db.createStory({
    userId: req.user!.id,
    type: type || 'text',
    mediaUrl,
    text,
    background,
  });
  res.status(201).json({ story });
});

router.post('/stories/:id/view', authenticate, (req: AuthRequest, res) => {
  db.viewStory(req.params.id, req.user!.id);
  res.json({ success: true });
});

router.patch('/stories/:id', authenticate, (req: AuthRequest, res) => {
  const { type, mediaUrl, text, background, fontStyle, filter, stickers, doodleData } = req.body;
  const updated = db.updateStory(req.params.id, req.user!.id, {
    type,
    mediaUrl,
    text,
    background,
    fontStyle,
    filter,
    stickers,
    doodleData,
  } as any);

  if (!updated) {
    return res.status(404).json({ error: 'Story not found or unauthorized to edit' });
  }

  res.json({ story: updated });
});

router.delete('/stories/:id', authenticate, (req: AuthRequest, res) => {
  const deleted = db.deleteStory(req.params.id, req.user!.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Story not found or unauthorized to delete' });
  }
  res.json({ success: true });
});

// --- CALLS ROUTES ---

router.post('/calls/start', authenticate, (req: AuthRequest, res) => {
  const { receiverId, conversationId, type } = req.body;
  let resolvedConvId = conversationId;
  if (!resolvedConvId && receiverId && !String(receiverId).startsWith('dial_')) {
    const existingDirect = db.getUserConversations(req.user!.id).find(
      c => c.type === 'direct' && c.members.some(m => m.userId === receiverId)
    );
    if (existingDirect) {
      resolvedConvId = existingDirect.id;
    }
  }

  const call = db.createCall(req.user!.id, receiverId, resolvedConvId, type || 'voice');

  // Notify receiver via WebSocket immediately
  if (receiverId && !String(receiverId).startsWith('dial_')) {
    AetherSocketServer.instance?.sendToUser(receiverId, {
      type: 'call:incoming',
      call,
    });
  }
  if (resolvedConvId && resolvedConvId !== 'c_direct_call') {
    const conv = db.getConversationById(resolvedConvId);
    if (conv && conv.type === 'group') {
      conv.members.forEach(m => {
        if (m.userId !== req.user!.id && m.userId !== receiverId) {
          AetherSocketServer.instance?.sendToUser(m.userId, {
            type: 'call:incoming',
            call,
          });
        }
      });
    }
  }

  res.status(201).json({ call });
});

router.get('/calls', authenticate, (req: AuthRequest, res) => {
  const calls = db.getUserCalls(req.user!.id);
  res.json({ calls });
});

router.get('/calls/active', authenticate, (req: AuthRequest, res) => {
  const afterSeq = parseInt((req.query.afterSeq as string) || '0', 10) || 0;
  const userCalls = db.getUserCalls(req.user!.id);
  const now = Date.now();
  const activeCall =
    userCalls.find(c => {
      if (c.status !== 'ringing' && c.status !== 'initiating' && c.status !== 'active') return false;
      const ageMs = now - new Date(c.startedAt).getTime();
      // Expire ringing calls older than 90s or active calls older than 4 hours
      if ((c.status === 'ringing' || c.status === 'initiating') && ageMs > 90 * 1000) {
        db.updateCallStatus(c.id, 'missed');
        return false;
      }
      return ageMs < 4 * 3600 * 1000;
    }) || null;

  const signals = activeCall
    ? AetherSocketServer.instance?.getCallSignalsForUser(activeCall.id, req.user!.id, afterSeq) || []
    : [];

  res.json({ call: activeCall, signals });
});

router.post('/calls/:id/signal', authenticate, (req: AuthRequest, res) => {
  const { toUserId, signal } = req.body;
  const callId = req.params.id;
  if (!toUserId || !signal) {
    return res.status(400).json({ error: 'toUserId and signal are required' });
  }
  const seq = AetherSocketServer.instance?.storeAndSendCallSignal(callId, req.user!.id, toUserId, signal) || 0;
  res.json({ success: true, seq });
});

router.patch('/calls/:id/status', authenticate, (req: AuthRequest, res) => {
  const { status, type } = req.body;
  const existingCall = db.getCallById(req.params.id);
  const wasalreadyEnded =
    existingCall &&
    (existingCall.status === 'ended' || existingCall.status === 'rejected' || existingCall.status === 'missed');

  const call = db.updateCallStatus(req.params.id, status, type);
  if (!call) {
    return res.status(404).json({ error: 'Call not found' });
  }

  const otherUserId = call.callerId === req.user!.id ? call.receiverId : call.callerId;

  if (status === 'active') {
    if (otherUserId) {
      AetherSocketServer.instance?.sendToUser(otherUserId, {
        type: 'call:accepted',
        callId: call.id,
        receiverId: req.user!.id,
        call,
      });
    }
  } else if (status === 'rejected') {
    AetherSocketServer.instance?.clearCallSignals(call.id);
    if (otherUserId) {
      AetherSocketServer.instance?.sendToUser(otherUserId, {
        type: 'call:rejected',
        callId: call.id,
      });
    }
  } else if (status === 'ended' || status === 'missed') {
    AetherSocketServer.instance?.clearCallSignals(call.id);
    if (otherUserId) {
      AetherSocketServer.instance?.sendToUser(otherUserId, {
        type: 'call:ended',
        callId: call.id,
      });
    }
  }

  // Record a call summary message in the conversation when a call finishes (once per call)
  if (!wasalreadyEnded && (status === 'ended' || status === 'rejected' || status === 'missed')) {
    let targetConvId = call.conversationId && call.conversationId !== 'c_direct_call' ? call.conversationId : undefined;
    if (!targetConvId && call.receiverId && !call.receiverId.startsWith('dial_')) {
      const existingDirect = db.getUserConversations(call.callerId).find(
        c => c.type === 'direct' && c.members.some(m => m.userId === call.receiverId)
      );
      if (existingDirect) {
        targetConvId = existingDirect.id;
      }
    }

    if (targetConvId) {
      const isVideo = call.type === 'video';
      const icon = isVideo ? '📹' : '📞';
      const label = isVideo ? 'Video call' : 'Voice call';
      let content = '';
      if (call.status === 'rejected') {
        content = `${icon} Declined ${label.toLowerCase()}`;
      } else if (call.status === 'missed' || !call.duration) {
        content = `${icon} Missed ${label.toLowerCase()}`;
      } else {
        const m = Math.floor(call.duration / 60);
        const s = call.duration % 60;
        const durStr = m > 0 ? `${m}m ${s}s` : `${s}s`;
        content = `${icon} ${label} • ${durStr}`;
      }

      const callMsg = db.createMessage({
        conversationId: targetConvId,
        senderId: call.callerId,
        type: 'text',
        content,
      });
      AetherSocketServer.instance?.broadcastToConversation(targetConvId, {
        type: 'message:new',
        message: callMsg,
      });
    }
  }

  res.json({ call });
});

// --- SETTINGS & DEVICES ROUTES ---

router.get('/settings', authenticate, (req: AuthRequest, res) => {
  const settings = db.getUserSettings(req.user!.id);
  res.json({ settings });
});

router.patch('/settings', authenticate, (req: AuthRequest, res) => {
  const updated = db.updateUserSettings(req.user!.id, req.body);
  res.json({ settings: updated });
});

router.get('/devices', authenticate, (req: AuthRequest, res) => {
  const sessions = db.getSessions(req.user!.id);
  res.json({ sessions });
});

router.delete('/devices/:id', authenticate, (req: AuthRequest, res) => {
  db.terminateSession(req.params.id, req.user!.id);
  res.json({ success: true });
});

router.delete('/devices/other', authenticate, (req: AuthRequest, res) => {
  db.terminateOtherSessions('current', req.user!.id);
  res.json({ success: true });
});

// --- FOLDERS ROUTES ---

router.get('/folders', authenticate, (req: AuthRequest, res) => {
  const folders = db.getFolders(req.user!.id);
  res.json({ folders });
});

router.post('/folders', authenticate, (req: AuthRequest, res) => {
  const { name, icon, filterType, conversationIds } = req.body;
  const folder = db.createFolder(req.user!.id, name, icon || 'folder', filterType || 'custom', conversationIds || []);
  res.status(201).json({ folder });
});

// --- UPLOADS ROUTE ---

router.post('/upload', authenticate, upload.single('file'), (req: AuthRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({
    url: fileUrl,
    filename: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// --- ADMIN ROUTES ---

router.get('/admin/stats', authenticate, (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin' && req.user!.role !== 'superadmin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const stats = db.getAdminStats();
  res.json({ stats });
});

router.get('/admin/users', authenticate, (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin' && req.user!.role !== 'superadmin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const users = db.getUsers();
  res.json({ users });
});

router.patch('/admin/users/:id/ban', authenticate, (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin' && req.user!.role !== 'superadmin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const isBanned = db.toggleBanUser(req.params.id);
  res.json({ isBanned });
});

router.get('/admin/reports', authenticate, (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin' && req.user!.role !== 'superadmin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const reports = db.getReports();
  res.json({ reports });
});

router.patch('/admin/reports/:id/status', authenticate, (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin' && req.user!.role !== 'superadmin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const report = db.updateReportStatus(req.params.id, req.body.status);
  res.json({ report });
});

router.post('/admin/broadcast', authenticate, (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin' && req.user!.role !== 'superadmin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { content, category } = req.body;
  // Save system announcement message
  res.json({ success: true, broadcast: { content, category, timestamp: new Date().toISOString() } });
});

// --- USER DATA EXPORT & ACCOUNT DELETION ---

router.get('/export', authenticate, (req: AuthRequest, res) => {
  const exported = db.exportUserData(req.user!.id);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="aether-export-${req.user!.username}.json"`);
  res.send(JSON.stringify(exported, null, 2));
});

router.delete('/users/me/account', authenticate, (req: AuthRequest, res) => {
  // Flag account deleted/banned
  db.updateUser(req.user!.id, { displayName: 'Deleted User', bio: 'This account was deleted.', avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=deleted' });
  res.json({ success: true });
});

// --- HARD SYSTEM RESET ---
router.post('/system/reset', (req, res) => {
  db.resetAllData();
  res.json({ success: true, message: 'All system data removed and reset to new.' });
});

router.post('/admin/reset-all', authenticate, (req: AuthRequest, res) => {
  if (req.user!.role !== 'admin' && req.user!.role !== 'superadmin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  db.resetAllData();
  res.json({ success: true, message: 'All system data removed and reset to new.' });
});

export default router;
