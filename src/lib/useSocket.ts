import { useEffect, useRef, useState, useCallback } from 'react';
import { User, Message, Call } from '../types';

interface SocketEventHandlers {
  onNewMessage?: (message: Message) => void;
  onUpdateMessage?: (message: Message) => void;
  onDeleteMessage?: (data: { messageId: string; conversationId: string; forEveryone: boolean }) => void;
  onTypingStart?: (data: { conversationId: string; userId: string; displayName: string }) => void;
  onTypingStop?: (data: { conversationId: string; userId: string }) => void;
  onPresenceUpdate?: (data: { userId: string; isOnline: boolean; lastSeen?: string }) => void;
  onIncomingCall?: (call: Call) => void;
  onCallAccepted?: (data: { callId: string; receiverId: string; call?: Call }) => void;
  onCallRejected?: (data: { callId: string }) => void;
  onCallEnded?: (data: { callId: string }) => void;
  onCallSignal?: (data: { fromUserId: string; callId?: string; seq?: number; signal: any }) => void;
  onMessageRead?: (data: { conversationId: string; readerId?: string }) => void;
}

export function useSocket(currentUser: User | null, handlers: SocketEventHandlers) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const connect = useCallback(() => {
    if (!currentUser) return;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        // Authenticate socket
        ws.send(
          JSON.stringify({
            type: 'auth',
            userId: currentUser.id,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const h = handlersRef.current;

          switch (data.type) {
            case 'message:new':
              h.onNewMessage?.(data.message);
              break;
            case 'message:update':
            case 'message:updated':
              h.onUpdateMessage?.(data.message);
              break;
            case 'message:delete':
              h.onDeleteMessage?.(data);
              break;
            case 'message:read':
              h.onMessageRead?.(data);
              break;
            case 'typing:start':
              h.onTypingStart?.(data);
              break;
            case 'typing:stop':
              h.onTypingStop?.(data);
              break;
            case 'presence:update':
              h.onPresenceUpdate?.(data);
              break;
            case 'call:incoming':
              h.onIncomingCall?.(data.call);
              break;
            case 'call:accepted':
              h.onCallAccepted?.(data);
              break;
            case 'call:rejected':
              h.onCallRejected?.(data);
              break;
            case 'call:ended':
              h.onCallEnded?.(data);
              break;
            case 'call:signal':
              h.onCallSignal?.(data);
              break;
          }
        } catch (err) {
          console.error('Socket message parse error:', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        // Auto-reconnect after 3s
        if (currentUser) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      ws.onerror = (err) => {
        console.warn('WebSocket encountered error:', err);
        ws.close();
      };
    } catch (err) {
      console.error('WebSocket connection error:', err);
    }
  }, [currentUser]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const sendTyping = useCallback((conversationId: string, isTyping: boolean, displayName?: string) => {
    send({
      type: isTyping ? 'typing:start' : 'typing:stop',
      conversationId,
      displayName,
    });
  }, [send]);

  const sendReadReceipt = useCallback((conversationId: string) => {
    send({
      type: 'message:read',
      conversationId,
    });
  }, [send]);

  const sendCallSignal = useCallback((toUserId: string, signal: any, callId?: string) => {
    return send({
      type: 'call:signal',
      toUserId,
      callId: callId || signal?.callId,
      signal,
    });
  }, [send]);

  const initiateCall = useCallback((call: Call, receiverId: string) => {
    send({
      type: 'call:initiate',
      call,
      receiverId,
    });
  }, [send]);

  const acceptCall = useCallback((callId: string, callerId: string) => {
    send({
      type: 'call:accept',
      callId,
      callerId,
    });
  }, [send]);

  const rejectCall = useCallback((callId: string, callerId: string) => {
    send({
      type: 'call:reject',
      callId,
      callerId,
    });
  }, [send]);

  const endCall = useCallback((callId: string, toUserId?: string) => {
    send({
      type: 'call:end',
      callId,
      toUserId,
    });
  }, [send]);

  return {
    isConnected,
    send,
    sendTyping,
    sendReadReceipt,
    sendCallSignal,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
  };
}
