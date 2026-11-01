import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BackgroundAurora } from './components/common/BackgroundAurora';
import { ToastContainer, ToastMessage } from './components/common/Toast';
import { SignUpPage } from './components/auth/SignUpPage';
import { AuthModal } from './components/auth/AuthModal';
import { StoriesBar, StoryViewer } from './components/stories/StoriesBar';
import { Sidebar } from './components/chat/Sidebar';
import { ConversationArea } from './components/chat/ConversationArea';
import { MediaActionsPanel } from './components/chat/MediaActionsPanel';
import { InfoPanel } from './components/chat/InfoPanel';
import { CallOverlay, IncomingCallSignal } from './components/calls/CallOverlay';
import { NewConversationModal } from './components/chat/NewConversationModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { ImageViewer } from './components/common/ImageViewer';
import { CommandPalette } from './components/common/CommandPalette';
import { CallsHistoryModal } from './components/chat/CallsHistoryModal';
import { CallsView } from './components/calls/CallsView';
import { ProfileSettingsView } from './components/profile/ProfileSettingsView';
import { StoryEditorModal } from './components/stories/StoryEditorModal';
import { StoryViewerModal } from './components/stories/StoryViewerModal';
import { useSocket } from './lib/useSocket';
import { api } from './lib/api';
import { User, Conversation, Message, Story, Call, AccentTheme } from './types';
import { Sparkles, MessageSquare, Shield, Bell } from 'lucide-react';

export default function App() {
  // App views & states
  const [currentUser, setCurrentUser] = useState<User | null>(() => api.getStoredUser());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [isCreateStoryOpen, setIsCreateStoryOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<Story | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [systemBroadcast, setSystemBroadcast] = useState<string | null>(null);

  // Call states
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [incomingCallSignals, setIncomingCallSignals] = useState<IncomingCallSignal[]>([]);
  const signalIdCounterRef = useRef<number>(1);
  const lastSignalSeqRef = useRef<number>(0);
  const activeCallRef = useRef<Call | null>(null);
  activeCallRef.current = activeCall;

  // Navigation & Modals
  const [activeMainTab, setActiveMainTab] = useState<'chats' | 'calls' | 'settings'>('chats');
  const [contactsList, setContactsList] = useState<User[]>([]);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isNewConvOpen, setIsNewConvOpen] = useState(false);
  const [newConvType, setNewConvType] = useState<'direct' | 'group' | 'channel'>('direct');
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isCallsHistoryOpen, setIsCallsHistoryOpen] = useState(false);
  const [callsList, setCallsList] = useState<Call[]>([]);

  // Theme & Appearance
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');
  const [accent, setAccent] = useState<AccentTheme>('aurora');

  // Ref tracking current active conversation
  const activeConversationIdRef = useRef<string | null>(null);
  activeConversationIdRef.current = activeConversationId;

  const currentUserRef = useRef<User | null>(null);
  currentUserRef.current = currentUser;

  const sendReadReceiptRef = useRef<(conversationId: string) => void>(() => {});

  // Add toast helper
  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { ...toast, id }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // WebSocket Event Handlers
  const socketHandlers = {
    onNewMessage: (msg: Message) => {
      // If message is for active conversation, append
      if (activeConversationIdRef.current === msg.conversationId) {
        setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
        // If recipient has active conversation open, immediately mark as read & send receipt
        if (msg.senderId !== currentUserRef.current?.id) {
          api.markAsRead(msg.conversationId);
          sendReadReceiptRef.current?.(msg.conversationId);
        }
      }

      // Update conversations preview
      setConversations(prev =>
        prev.map(c => {
          if (c.id === msg.conversationId) {
            const isCurrentActive = activeConversationIdRef.current === c.id;
            return {
              ...c,
              lastMessage: msg,
              unreadCount: isCurrentActive ? 0 : (c.unreadCount || 0) + 1,
            };
          }
          return c;
        })
      );

      // Toast notification if sender is someone else
      if (msg.senderId !== currentUser?.id) {
        addToast({
          type: 'info',
          title: msg.sender?.displayName || 'New Message',
          message: msg.content.length > 50 ? `${msg.content.slice(0, 50)}...` : msg.content,
        });
      }
    },

    onMessageRead: ({ conversationId }: { conversationId: string; readerId?: string }) => {
      // Update all messages in active conversation sent by current user to status: 'read'
      if (activeConversationIdRef.current === conversationId) {
        setMessages(prev =>
          prev.map(m =>
            m.conversationId === conversationId && m.senderId === currentUserRef.current?.id
              ? { ...m, status: 'read' }
              : m
          )
        );
      }

      // Update conversations lastMessage status if sent by currentUser
      setConversations(prev =>
        prev.map(c => {
          if (c.id === conversationId && c.lastMessage && c.lastMessage.senderId === currentUserRef.current?.id) {
            return {
              ...c,
              lastMessage: { ...c.lastMessage, status: 'read' },
            };
          }
          return c;
        })
      );
    },

    onUpdateMessage: (msg: Message) => {
      setMessages(prev => prev.map(m => (m.id === msg.id ? msg : m)));
    },

    onDeleteMessage: ({ messageId }: { messageId: string }) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    },

    onTypingStart: ({ conversationId, displayName }: { conversationId: string; displayName: string }) => {
      setTypingUsers(prev => ({ ...prev, [conversationId]: displayName }));
    },

    onTypingStop: ({ conversationId }: { conversationId: string }) => {
      setTypingUsers(prev => {
        const next = { ...prev };
        delete next[conversationId];
        return next;
      });
    },

    onPresenceUpdate: ({ userId, isOnline }: { userId: string; isOnline: boolean }) => {
      setConversations(prev =>
        prev.map(c => ({
          ...c,
          members: c.members.map(m =>
            m.userId === userId ? { ...m, user: m.user ? { ...m.user, isOnline } : undefined } : m
          ),
        }))
      );
    },

    onIncomingCall: (call: Call) => {
      if (!call) return;
      // Ignore if we are already handling this exact call in active state
      if (activeCallRef.current?.id === call.id && activeCallRef.current?.status === 'active') {
        return;
      }
      setIncomingCallSignals([]);
      setActiveCall(call);
      setIsIncomingCall(call.callerId !== currentUserRef.current?.id);
    },

    onCallAccepted: ({ callId, call }: { callId: string; call?: Call }) => {
      setActiveCall(prev => {
        if (!prev || (callId && prev.id !== callId)) return call ? { ...call, status: 'active' } : prev;
        return { ...prev, ...(call || {}), status: 'active' };
      });
      setIsIncomingCall(false);
    },

    onCallRejected: ({ callId }: { callId?: string } = {}) => {
      if (callId && activeCallRef.current && activeCallRef.current.id !== callId) return;
      setActiveCall(null);
      setIsIncomingCall(false);
      setIncomingCallSignals([]);
      addToast({ type: 'info', message: 'Call was declined' });
    },

    onCallEnded: ({ callId }: { callId?: string } = {}) => {
      if (callId && activeCallRef.current && activeCallRef.current.id !== callId) return;
      setActiveCall(null);
      setIsIncomingCall(false);
      setIncomingCallSignals([]);
      addToast({ type: 'info', message: 'Call ended' });
    },

    onCallSignal: ({ fromUserId, callId, seq, signal }: { fromUserId: string; callId?: string; seq?: number; signal: any }) => {
      if (seq && seq <= lastSignalSeqRef.current) return;
      if (seq && seq > lastSignalSeqRef.current) {
        lastSignalSeqRef.current = seq;
      }
      const nextId = signalIdCounterRef.current++;
      setIncomingCallSignals(prev => [
        ...prev.slice(-60),
        { id: nextId, seq, fromUserId, callId, signal },
      ]);
    },
  };

  const {
    isConnected,
    sendTyping,
    sendReadReceipt,
    sendCallSignal: socketSendCallSignal,
    initiateCall: socketInitiateCall,
    acceptCall: socketAcceptCall,
    rejectCall: socketRejectCall,
    endCall: socketEndCall,
  } = useSocket(currentUser, socketHandlers);

  sendReadReceiptRef.current = sendReadReceipt;

  const handleMarkAsRead = useCallback(
    async (convId: string) => {
      try {
        await api.markAsRead(convId);
        sendReadReceipt(convId);
        setConversations(prev =>
          prev.map(c => (c.id === convId ? { ...c, unreadCount: 0 } : c))
        );
      } catch (err) {
        console.error('Failed to mark conversation as read', err);
      }
    },
    [sendReadReceipt]
  );

  // Initial user initialization: check persistent session
  useEffect(() => {
    const handleUnauthorized = () => {
      setCurrentUser(null);
      setActiveConversationId(null);
    };
    window.addEventListener('aether:unauthorized', handleUnauthorized);

    const init = async () => {
      try {
        const stored = api.getStoredUser();
        const token = api.getToken();

        if (token && stored) {
          setCurrentUser(stored);
          const fresh = await api.getCurrentUser();
          if (fresh) {
            setCurrentUser(fresh);
            api.setSession(fresh, api.getToken() || token);
          }
        } else if (token) {
          const fresh = await api.getCurrentUser();
          if (fresh) {
            setCurrentUser(fresh);
            api.setSession(fresh, api.getToken() || token);
          } else {
            api.logout();
            setCurrentUser(null);
          }
        } else if (stored?.email) {
          // Recover session token for stored user
          try {
            const res = await api.googleLogin({
              email: stored.email,
              displayName: stored.displayName,
              avatarUrl: stored.avatarUrl,
            });
            setCurrentUser(res.user);
          } catch {
            api.logout();
            setCurrentUser(null);
          }
        } else {
          setCurrentUser(null);
        }
      } catch {
        setCurrentUser(api.getStoredUser());
      }
    };
    init();

    return () => window.removeEventListener('aether:unauthorized', handleUnauthorized);
  }, []);

  // Fetch initial conversations & stories when user is authenticated
  const loadConversationsAndStories = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [convs, storyList] = await Promise.all([api.getConversations(), api.getStories()]);
      const nonChannelConvs = convs.filter(c => c.type !== 'channel');
      setConversations(nonChannelConvs);
      setStories(storyList);

      if (nonChannelConvs.length > 0 && !activeConversationIdRef.current) {
        setActiveConversationId(nonChannelConvs[0].id);
      } else if (nonChannelConvs.length === 0) {
        setActiveConversationId(null);
      }
    } catch (err) {
      console.error('Failed to load initial data', err);
    }
  }, [currentUser]);

  useEffect(() => {
    loadConversationsAndStories();
  }, [loadConversationsAndStories]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConversationId) return;

    const fetchMsgs = async () => {
      try {
        const msgs = await api.getMessages(activeConversationId);
        setMessages(msgs);
        await api.markAsRead(activeConversationId);
        sendReadReceipt(activeConversationId);

        setConversations(prev =>
          prev.map(c => (c.id === activeConversationId ? { ...c, unreadCount: 0 } : c))
        );
      } catch (err) {
        console.error('Failed to fetch messages', err);
      }
    };

    fetchMsgs();
  }, [activeConversationId, sendReadReceipt]);

  // Actions
  const handleSendMessage = async (data: any) => {
    if (!activeConversationId || !currentUser) return;
    try {
      const newMsg = await api.sendMessage({
        conversationId: activeConversationId,
        ...data,
      });
      setMessages(prev => [...prev, newMsg]);

      setConversations(prev =>
        prev.map(c => (c.id === activeConversationId ? { ...c, lastMessage: newMsg } : c))
      );
    } catch (err) {
      console.error('Failed to send message', err);
    }
  };

  const handleSendCallSignal = useCallback(
    (toUserId: string, signal: any, callId?: string) => {
      const targetCallId = callId || activeCallRef.current?.id;
      if (!toUserId || !signal) return;
      if (targetCallId && !String(toUserId).startsWith('dial_')) {
        api.sendCallSignal(targetCallId, toUserId, signal).catch(() => {
          socketSendCallSignal(toUserId, signal, targetCallId);
        });
      } else {
        socketSendCallSignal(toUserId, signal, targetCallId);
      }
    },
    [socketSendCallSignal]
  );

  // Real-time fallback sync for incoming/active calls and buffered WebRTC signals
  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;

    const syncActiveCall = async () => {
      try {
        // Don't overwrite synthetic dialpad calls
        if (activeCallRef.current?.receiverId?.startsWith('dial_')) return;

        const { call: serverCall, signals } = await api.getActiveCallState(lastSignalSeqRef.current);
        if (!isMounted) return;

        if (signals && signals.length > 0) {
          const newSignals: IncomingCallSignal[] = [];
          for (const s of signals) {
            if (s.seq > lastSignalSeqRef.current) {
              lastSignalSeqRef.current = s.seq;
              newSignals.push({
                id: signalIdCounterRef.current++,
                seq: s.seq,
                fromUserId: s.fromUserId,
                callId: s.callId,
                signal: s.signal,
              });
            }
          }
          if (newSignals.length > 0) {
            setIncomingCallSignals(prev => [...prev.slice(-60), ...newSignals]);
          }
        }

        const current = activeCallRef.current;
        if (serverCall) {
          if (!current || current.id !== serverCall.id) {
            setIncomingCallSignals([]);
            setActiveCall(serverCall);
            setIsIncomingCall(serverCall.callerId !== currentUser.id && serverCall.status !== 'active');
          } else if (current.status !== serverCall.status || current.type !== serverCall.type) {
            setActiveCall(serverCall);
            if (serverCall.status === 'active') {
              setIsIncomingCall(false);
            }
          }
        } else if (current && !current.receiverId?.startsWith('dial_')) {
          setActiveCall(null);
          setIsIncomingCall(false);
          setIncomingCallSignals([]);
        }
      } catch {
        // ignore transient network error
      }
    };

    const intervalMs = activeCall ? 1000 : 2000;
    const timer = setInterval(syncActiveCall, intervalMs);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [currentUser, activeCall?.id, activeCall?.status]);

  const handleStartCall = async (type: 'voice' | 'video') => {
    if (!activeConversationId || !currentUser) return;
    const conv = conversations.find(c => c.id === activeConversationId);
    if (!conv) return;

    const otherMember = conv.members.find(m => m.userId !== currentUser.id);
    const receiverId = otherMember?.userId || contactsList.find(u => u.id !== currentUser.id)?.id;

    if (!receiverId) {
      addToast({
        type: 'info',
        title: 'No Participant Found',
        message: 'Add another user to this chat to start a voice or video call.',
      });
      return;
    }

    try {
      setIncomingCallSignals([]);
      const call = await api.initiateCall({
        receiverId,
        conversationId: activeConversationId,
        type,
      });
      setActiveCall(call);
      setIsIncomingCall(false);
      socketInitiateCall(call, receiverId);
      loadCallsAndContacts();
    } catch (err) {
      console.error('Failed to initiate call', err);
      addToast({ type: 'error', message: 'Could not start call. Please try again.' });
    }
  };

  const handleAcceptCall = async (withVideo?: boolean) => {
    if (!activeCall) return;
    const targetType = withVideo === false ? 'voice' : activeCall.type;
    if (activeCall.receiverId?.startsWith('dial_')) {
      setActiveCall(prev => (prev ? { ...prev, status: 'active', type: targetType } : null));
      setIsIncomingCall(false);
      return;
    }
    try {
      const updated = await api.acceptCall(activeCall.id, targetType);
      setActiveCall(prev => (prev ? { ...prev, ...(updated || {}), status: 'active', type: targetType } : null));
      setIsIncomingCall(false);
      socketAcceptCall(activeCall.id, activeCall.callerId);
      loadCallsAndContacts();
    } catch (err) {
      console.error('Failed to accept call', err);
    }
  };

  const handleRejectCall = async () => {
    if (!activeCall) return;
    const callToReject = activeCall;
    setActiveCall(null);
    setIsIncomingCall(false);
    setIncomingCallSignals([]);
    if (callToReject.receiverId?.startsWith('dial_')) return;
    try {
      await api.rejectCall(callToReject.id);
      socketRejectCall(callToReject.id, callToReject.callerId);
      loadCallsAndContacts();
    } catch (err) {
      console.error('Failed to reject call', err);
    }
  };

  const handleEndCall = async () => {
    if (!activeCall) return;
    const callToEnd = activeCall;
    setActiveCall(null);
    setIsIncomingCall(false);
    setIncomingCallSignals([]);
    if (callToEnd.receiverId?.startsWith('dial_')) return;
    try {
      await api.endCall(callToEnd.id);
      const otherId = callToEnd.callerId === currentUser?.id ? callToEnd.receiverId : callToEnd.callerId;
      socketEndCall(callToEnd.id, otherId);
      loadCallsAndContacts();
    } catch (err) {
      console.error('Failed to end call', err);
    }
  };

  const handleStoryReplyMessage = async (recipientId: string, content: string) => {
    if (!currentUser) return;
    try {
      let directConv = conversations.find(
        c => c.type === 'direct' && c.members.some(m => m.userId === recipientId)
      );
      if (!directConv) {
        directConv = await api.createConversation({
          type: 'direct',
          memberIds: [recipientId],
        });
        setConversations(prev => [directConv!, ...prev]);
      }
      const newMsg = await api.sendMessage({
        conversationId: directConv.id,
        content,
        type: 'text',
      });
      if (activeConversationId === directConv.id) {
        setMessages(prev => [...prev, newMsg]);
      }
      setConversations(prev =>
        prev.map(c => (c.id === directConv!.id ? { ...c, lastMessage: newMsg } : c))
      );
      addToast({ type: 'success', message: 'Message sent to author!' });
    } catch (err) {
      console.error('Failed to send story reply:', err);
    }
  };

  const loadCallsAndContacts = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [calls, contacts] = await Promise.all([
        api.getCalls().catch(() => []),
        api.getContacts().catch(() => []),
      ]);
      setCallsList(calls || []);
      setContactsList(contacts || []);
    } catch (err) {
      console.error('Failed to load calls or contacts', err);
    }
  }, [currentUser]);

  useEffect(() => {
    loadCallsAndContacts();
  }, [loadCallsAndContacts]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleStartDirectCall = async (
    receiverId: string,
    type: 'voice' | 'video',
    name?: string,
    avatarUrl?: string
  ) => {
    if (!currentUser) return;
    try {
      if (
        receiverId.startsWith('dial_') ||
        receiverId.startsWith('fav_') ||
        receiverId.startsWith('dir_') ||
        receiverId.startsWith('num_') ||
        receiverId.startsWith('rc_') ||
        receiverId === 'link_call'
      ) {
        // Synthesize direct call object for dialed number or external contact
        const syntheticCall: Call = {
          id: `call_${Date.now()}`,
          callerId: currentUser.id,
          caller: currentUser,
          receiverId,
          receiver: {
            id: receiverId,
            username: name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') : 'caller',
            displayName: name || 'Contact',
            avatarUrl:
              avatarUrl ||
              `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || 'Contact')}`,
            email: 'call@aether.chat',
            isOnline: true,
            onlineStatus: 'online',
            createdAt: new Date().toISOString(),
            role: 'user',
          },
          conversationId: 'c_direct_call',
          type,
          status: 'ringing',
          startedAt: new Date().toISOString(),
        };
        setActiveCall(syntheticCall);
        setIsIncomingCall(false);
        return;
      }

      const call = await api.initiateCall({
        receiverId,
        type,
      });
      setActiveCall(call);
      setIsIncomingCall(false);
      socketInitiateCall(call, receiverId);
      loadCallsAndContacts();
    } catch (err) {
      console.error('Failed to initiate direct call', err);
    }
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setActiveConversationId(null);
    addToast({ type: 'info', message: 'Signed out of Aether' });
  };

  const handleResetAllData = async () => {
    try {
      await api.resetAllData();
      setConversations([]);
      setMessages([]);
      setStories([]);
      setActiveConversationId(null);
      addToast({
        type: 'success',
        title: 'Workspace Reset',
        message: 'All data has been removed and reset to new.',
      });
      await loadConversationsAndStories();
    } catch (err) {
      console.error('Failed to reset all data', err);
      addToast({
        type: 'error',
        title: 'Reset Failed',
        message: 'Could not reset data.',
      });
    }
  };

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col font-sans select-none text-slate-100">
      {/* Dynamic Aurora Ambient Background */}
      <BackgroundAurora accent={accent} theme={theme} />

      {/* Floating System Broadcast Notification */}
      {systemBroadcast && (
        <div className="bg-white text-black px-4 py-2 text-xs font-bold flex items-center justify-between z-50 shadow-lg border-b border-black/10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-black" />
            <span>{systemBroadcast}</span>
          </div>
          <button onClick={() => setSystemBroadcast(null)} className="text-black/70 hover:text-black underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* If user is NOT signed in, show SignUpPage directly (matching the image) */}
      {!currentUser ? (
        <SignUpPage
          onSuccess={user => {
            setCurrentUser(user);
            loadConversationsAndStories();
            addToast({
              type: 'success',
              title: 'Welcome',
              message: `Signed in as ${user.displayName}!`,
            });
          }}
        />
      ) : (
        /* MAIN MESSENGER INTERFACE */
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {activeMainTab === 'calls' ? (
            <CallsView
              currentUser={currentUser}
              calls={callsList}
              contacts={contactsList}
              onStartCall={handleStartDirectCall}
              onSwitchToChats={() => setActiveMainTab('chats')}
              onOpenNewConversation={type => {
                setNewConvType(type || 'direct');
                setIsNewConvOpen(true);
              }}
              onOpenSettings={() => setActiveMainTab('settings')}
              onLogout={handleLogout}
            />
          ) : activeMainTab === 'settings' ? (
            <ProfileSettingsView
              currentUser={currentUser}
              theme={theme}
              accent={accent}
              onUpdateUser={updated => setCurrentUser(updated)}
              onUpdateTheme={(newTheme, newAccent) => {
                setTheme(newTheme);
                setAccent(newAccent);
              }}
              onSwitchToChats={() => setActiveMainTab('chats')}
              onSwitchToCalls={() => setActiveMainTab('calls')}
              onOpenNewConversation={type => {
                setNewConvType(type || 'direct');
                setIsNewConvOpen(true);
              }}
              onLogout={handleLogout}
            />
          ) : (
            /* Main App Workspace */
            <div className="flex-1 flex h-full overflow-hidden relative">
              {/* Left Sidebar */}
              <div className={`h-full ${activeConversationId ? 'hidden md:flex' : 'flex w-full md:w-auto'}`}>
                <Sidebar
                  currentUser={currentUser}
                  conversations={conversations}
                  stories={stories}
                  activeConversationId={activeConversationId}
                  typingUsers={typingUsers}
                  onSelectConversation={id => setActiveConversationId(id)}
                  onOpenNewConversation={type => {
                    setNewConvType(type || 'direct');
                    setIsNewConvOpen(true);
                  }}
                  onOpenCreateStory={() => setIsCreateStoryOpen(true)}
                  onOpenSettings={() => setActiveMainTab('settings')}
                  onOpenAdmin={() => setIsAdminOpen(true)}
                  onLogout={handleLogout}
                  onSelectStory={setActiveStory}
                  onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
                  onOpenCallsHistory={() => setActiveMainTab('calls')}
                />
              </div>

              {/* Center Conversation Area */}
              {activeConversation ? (
                <ConversationArea
                  conversation={activeConversation}
                  messages={messages}
                  currentUser={currentUser}
                  conversations={conversations}
                  onSendMessage={handleSendMessage}
                  onSendTyping={isTyping =>
                    sendTyping(activeConversation.id, isTyping, currentUser.displayName)
                  }
                  onStartCall={handleStartCall}
                  onToggleInfoPanel={() => setShowInfoPanel(!showInfoPanel)}
                  onImageClick={setViewingImageUrl}
                  onOpenSettings={() => setActiveMainTab('settings')}
                  onBackMobile={() => setActiveConversationId(null)}
                  onUpdateMessages={setMessages}
                  onSelectConversation={id => setActiveConversationId(id)}
                  onMarkAsRead={handleMarkAsRead}
                />
              ) : (
                /* Empty Conversation Placeholder */
                <div className="hidden md:flex flex-1 flex-col items-center justify-center p-8 text-center bg-black">
                  <div className="w-16 h-16 rounded-3xl bg-[#141418] border border-[#222228] flex items-center justify-center text-slate-400 mb-4 shadow-xl">
                    <MessageSquare className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-1">Select a Conversation</h3>
                  <p className="text-xs text-slate-400 max-w-sm mb-4">
                    Select a contact from the left list to begin messaging.
                  </p>
                  <button
                    onClick={() => setIsNewConvOpen(true)}
                    className="px-5 py-2 rounded-xl bg-white text-black font-semibold text-xs hover:bg-slate-200 transition"
                  >
                    Start New Chat
                  </button>
                </div>
              )}

              {activeConversation && !showInfoPanel && (
                <div className="hidden lg:flex h-full">
                  <MediaActionsPanel
                    conversation={activeConversation}
                    messages={messages}
                    currentUser={currentUser}
                    onStartCall={handleStartCall}
                    onSendMessage={handleSendMessage}
                    onImageClick={setViewingImageUrl}
                  />
                </div>
              )}

              {/* Right Info Panel (when toggled via header) */}
              {showInfoPanel && activeConversation && (
                <InfoPanel
                  conversation={activeConversation}
                  messages={messages}
                  currentUser={currentUser}
                  onClose={() => setShowInfoPanel(false)}
                  onImageClick={setViewingImageUrl}
                  onBlockUser={() => {
                    addToast({ type: 'info', message: 'User blocked' });
                    setShowInfoPanel(false);
                  }}
                  onReport={() => {
                    addToast({ type: 'info', message: 'Conversation report submitted for review' });
                    setShowInfoPanel(false);
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* WebRTC Voice & Video Call Overlay */}
      <CallOverlay
        call={activeCall}
        currentUser={currentUser || ({} as User)}
        isIncoming={isIncomingCall}
        onAccept={handleAcceptCall}
        onReject={handleRejectCall}
        onEnd={handleEndCall}
        onSendSignal={handleSendCallSignal}
        incomingSignals={incomingCallSignals}
      />

      {/* Stories Viewer Modal */}
      {activeStory && (
        <StoryViewer
          story={activeStory}
          currentUser={currentUser || ({} as User)}
          onClose={() => setActiveStory(null)}
        />
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        initialMode={authMode}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={user => {
          setCurrentUser(user);
          loadConversationsAndStories();
          addToast({
            type: 'success',
            title: 'Authenticated',
            message: `Welcome to Aether, ${user.displayName}!`,
          });
        }}
      />

      {/* New Conversation Modal */}
      {currentUser && (
        <NewConversationModal
          isOpen={isNewConvOpen}
          initialType={newConvType}
          currentUser={currentUser}
          onClose={() => setIsNewConvOpen(false)}
          onCreated={convId => {
            loadConversationsAndStories();
            setActiveConversationId(convId);
          }}
        />
      )}

      {/* Settings Modal */}
      {currentUser && (
        <SettingsModal
          isOpen={isSettingsOpen}
          currentUser={currentUser}
          accent={accent}
          theme={theme}
          onClose={() => setIsSettingsOpen(false)}
          onUpdateUser={updated => setCurrentUser(updated)}
          onUpdateTheme={(newTheme, newAccent) => {
            setTheme(newTheme);
            setAccent(newAccent);
          }}
          onResetAllData={handleResetAllData}
        />
      )}

      {/* Operations Admin Dashboard */}
      {currentUser && (
        <AdminDashboard
          isOpen={isAdminOpen}
          currentUser={currentUser}
          onClose={() => setIsAdminOpen(false)}
          onResetAllData={handleResetAllData}
        />
      )}

      {/* Command Palette (⌘K) */}
      {currentUser && (
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          currentUser={currentUser}
          conversations={conversations}
          onSelectConversation={id => {
            setActiveConversationId(id);
            setIsCommandPaletteOpen(false);
          }}
          onOpenNewChat={type => {
            setNewConvType(type);
            setIsNewConvOpen(true);
            setIsCommandPaletteOpen(false);
          }}
          onOpenSettings={() => {
            setActiveMainTab('settings');
            setIsCommandPaletteOpen(false);
          }}
          onOpenCallsHistory={() => {
            setActiveMainTab('calls');
            setIsCommandPaletteOpen(false);
          }}
          onOpenDiscovery={() => {
            setIsCommandPaletteOpen(false);
          }}
          onToggleTheme={() => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))}
          onLogout={handleLogout}
        />
      )}

      {/* Calls History Modal */}
      {currentUser && (
        <CallsHistoryModal
          isOpen={isCallsHistoryOpen}
          onClose={() => setIsCallsHistoryOpen(false)}
          calls={callsList}
          currentUser={currentUser}
          onStartCall={(userId, type) => {
            setIsCallsHistoryOpen(false);
            handleStartDirectCall(userId, type);
          }}
        />
      )}

      {/* Fullscreen Image Viewer */}
      <ImageViewer url={viewingImageUrl} onClose={() => setViewingImageUrl(null)} />

      {/* Story Viewer Modal */}
      {currentUser && (
        <StoryViewerModal
          story={activeStory}
          stories={stories}
          currentUser={currentUser}
          onClose={() => setActiveStory(null)}
          onEditStory={story => {
            setActiveStory(null);
            setEditingStory(story);
          }}
          onDeleteStory={deletedId => {
            setStories(prev => prev.filter(s => s.id !== deletedId));
            if (activeStory?.id === deletedId) {
              setActiveStory(null);
            }
            addToast({ type: 'info', message: 'Story deleted' });
          }}
          onSendMessage={handleStoryReplyMessage}
        />
      )}

      {/* Integrated Story Editor Modal (Create & Edit Mode) */}
      {currentUser && (
        <StoryEditorModal
          isOpen={isCreateStoryOpen || !!editingStory}
          currentUser={currentUser}
          editingStory={editingStory}
          onClose={() => {
            setIsCreateStoryOpen(false);
            setEditingStory(null);
          }}
          onSaved={savedStory => {
            loadConversationsAndStories();
            addToast({
              type: 'success',
              message: editingStory ? 'Story updated successfully!' : 'Story shared successfully!',
            });
            setIsCreateStoryOpen(false);
            setEditingStory(null);
          }}
        />
      )}
    </div>
  );
}
