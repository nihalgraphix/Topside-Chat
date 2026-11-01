import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from './db';
import { Message } from '../src/types';

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

export class AetherSocketServer {
  public static instance: AetherSocketServer | null = null;
  private wss: WebSocketServer;
  private userSockets: Map<string, Set<AuthenticatedSocket>> = new Map();

  constructor(server: HttpServer) {
    AetherSocketServer.instance = this;
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupListeners();
    this.setupHeartbeat();
  }

  private setupListeners() {
    this.wss.on('connection', (ws: AuthenticatedSocket) => {
      ws.isAlive = true;

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (raw: string) => {
        try {
          const payload = JSON.parse(raw.toString());
          this.handleEvent(ws, payload);
        } catch (err) {
          console.error('Invalid WebSocket message format', err);
        }
      });

      ws.on('close', () => {
        if (ws.userId) {
          const set = this.userSockets.get(ws.userId);
          if (set) {
            set.delete(ws);
            if (set.size === 0) {
              this.userSockets.delete(ws.userId);
              db.setUserOnline(ws.userId, false);
              this.broadcast({
                type: 'presence:update',
                userId: ws.userId,
                isOnline: false,
                lastSeen: new Date().toISOString(),
              });
            }
          }
        }
      });
    });
  }

  private setupHeartbeat() {
    const interval = setInterval(() => {
      this.wss.clients.forEach((client: any) => {
        if (client.isAlive === false) return client.terminate();
        client.isAlive = false;
        client.ping();
      });
    }, 30000);

    this.wss.on('close', () => {
      clearInterval(interval);
    });
  }

  private handleEvent(ws: AuthenticatedSocket, data: any) {
    switch (data.type) {
      case 'auth': {
        const userId = data.userId;
        if (!userId) return;

        ws.userId = userId;
        if (!this.userSockets.has(userId)) {
          this.userSockets.set(userId, new Set());
        }
        this.userSockets.get(userId)!.add(ws);

        db.setUserOnline(userId, true);

        // Send initial auth ack
        ws.send(JSON.stringify({ type: 'auth:ack', success: true }));

        // Broadcast presence
        this.broadcast({
          type: 'presence:update',
          userId,
          isOnline: true,
          lastSeen: new Date().toISOString(),
        });
        break;
      }

      case 'message:send': {
        if (!ws.userId) return;
        const msgData = data.message;
        const saved = db.createMessage({
          ...msgData,
          senderId: ws.userId,
        });

        // Broadcast to conversation members
        this.broadcastToConversation(saved.conversationId, {
          type: 'message:new',
          message: saved,
        });
        break;
      }

      case 'typing:start': {
        if (!ws.userId) return;
        this.broadcastToConversation(
          data.conversationId,
          {
            type: 'typing:start',
            conversationId: data.conversationId,
            userId: ws.userId,
            displayName: data.displayName || 'Someone',
          },
          ws.userId
        );
        break;
      }

      case 'typing:stop': {
        if (!ws.userId) return;
        this.broadcastToConversation(
          data.conversationId,
          {
            type: 'typing:stop',
            conversationId: data.conversationId,
            userId: ws.userId,
          },
          ws.userId
        );
        break;
      }

      case 'message:read': {
        if (!ws.userId) return;
        db.markMessagesAsRead(data.conversationId, ws.userId);
        this.broadcastToConversation(data.conversationId, {
          type: 'message:read',
          conversationId: data.conversationId,
          readerId: ws.userId,
          userId: ws.userId,
        });
        break;
      }

      case 'message:react': {
        if (!ws.userId) return;
        const updated = db.toggleReaction(data.messageId, ws.userId, data.emoji);
        if (updated) {
          this.broadcastToConversation(updated.conversationId, {
            type: 'message:update',
            message: updated,
          });
        }
        break;
      }

      case 'message:edit': {
        if (!ws.userId) return;
        const updated = db.updateMessage(data.messageId, ws.userId, data.content);
        if (updated) {
          this.broadcastToConversation(updated.conversationId, {
            type: 'message:update',
            message: updated,
          });
        }
        break;
      }

      case 'message:delete': {
        if (!ws.userId) return;
        const msg = db.getMessageById(data.messageId);
        if (msg) {
          db.deleteMessage(data.messageId, ws.userId, data.forEveryone);
          this.broadcastToConversation(msg.conversationId, {
            type: 'message:delete',
            messageId: data.messageId,
            conversationId: msg.conversationId,
            forEveryone: data.forEveryone,
          });
        }
        break;
      }

      case 'poll:vote': {
        if (!ws.userId) return;
        const updated = db.votePoll(data.messageId, data.optionId, ws.userId);
        if (updated) {
          this.broadcastToConversation(updated.conversationId, {
            type: 'message:update',
            message: updated,
          });
        }
        break;
      }

      // --- WebRTC Video/Voice Calling Signaling ---
      case 'call:initiate': {
        if (!ws.userId) return;
        const { call, receiverId } = data;
        if (receiverId) {
          this.sendToUser(receiverId, {
            type: 'call:incoming',
            call,
          });
        }
        break;
      }

      case 'call:signal': {
        if (!ws.userId) return;
        const { toUserId, signal, callId } = data;
        if (toUserId && signal) {
          this.storeAndSendCallSignal(callId || signal.callId || 'default', ws.userId, toUserId, signal);
        }
        break;
      }

      case 'call:accept': {
        if (!ws.userId) return;
        const { callId, callerId } = data;
        db.updateCallStatus(callId, 'active');
        this.sendToUser(callerId, {
          type: 'call:accepted',
          callId,
          receiverId: ws.userId,
        });
        break;
      }

      case 'call:reject': {
        if (!ws.userId) return;
        const { callId, callerId } = data;
        db.updateCallStatus(callId, 'rejected');
        this.clearCallSignals(callId);
        this.sendToUser(callerId, {
          type: 'call:rejected',
          callId,
        });
        break;
      }

      case 'call:end': {
        if (!ws.userId) return;
        const { callId, toUserId } = data;
        db.updateCallStatus(callId, 'ended');
        this.clearCallSignals(callId);
        if (toUserId) {
          this.sendToUser(toUserId, {
            type: 'call:ended',
            callId,
          });
        }
        break;
      }
    }
  }

  private signalSeq = 1;
  private callSignals: Map<
    string,
    Array<{ seq: number; fromUserId: string; toUserId: string; callId: string; signal: any; createdAt: number }>
  > = new Map();

  public storeAndSendCallSignal(callId: string, fromUserId: string, toUserId: string, signal: any) {
    const seq = this.signalSeq++;
    const resolvedCallId = callId || signal?.callId || 'default';
    if (!this.callSignals.has(resolvedCallId)) {
      this.callSignals.set(resolvedCallId, []);
    }
    const list = this.callSignals.get(resolvedCallId)!;
    list.push({
      seq,
      fromUserId,
      toUserId,
      callId: resolvedCallId,
      signal,
      createdAt: Date.now(),
    });
    // Keep last 100 signals per call
    if (list.length > 100) {
      list.splice(0, list.length - 100);
    }

    this.sendToUser(toUserId, {
      type: 'call:signal',
      seq,
      callId: resolvedCallId,
      fromUserId,
      signal,
    });
    return seq;
  }

  public getCallSignalsForUser(callId: string, userId: string, afterSeq: number = 0) {
    const list = this.callSignals.get(callId) || [];
    return list.filter(item => item.toUserId === userId && item.seq > afterSeq);
  }

  public clearCallSignals(callId: string) {
    if (callId) {
      this.callSignals.delete(callId);
    }
  }

  public broadcast(payload: any) {
    const raw = JSON.stringify(payload);
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    });
  }

  public sendToUser(userId: string, payload: any) {
    const set = this.userSockets.get(userId);
    if (!set) return;
    const raw = JSON.stringify(payload);
    set.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    });
  }

  public broadcastToConversation(conversationId: string, payload: any, excludeUserId?: string) {
    const conv = db.getConversationById(conversationId);
    if (!conv) return;

    const raw = JSON.stringify(payload);
    conv.members.forEach(m => {
      if (excludeUserId && m.userId === excludeUserId) return;
      const set = this.userSockets.get(m.userId);
      if (set) {
        set.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(raw);
          }
        });
      }
    });
  }
}
