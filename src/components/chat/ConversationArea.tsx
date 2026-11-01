import React, { useState, useRef, useEffect } from 'react';
import {
  Phone,
  Video,
  ChevronLeft,
  Smile,
  Send,
  Mic,
  Camera,
  Image as ImageIcon,
  Play,
  Pause,
  FileText,
  Download,
  MapPin,
  Check,
  CheckCheck,
  Trash2,
  Settings as SettingsIcon,
  Sparkles,
  Pin,
  Reply,
  Forward,
  Edit2,
  Plus,
  BarChart2,
  User as UserIcon,
  X,
  ExternalLink,
  Volume2,
  Clock,
  AlertCircle,
  Search,
  Copy,
  Loader2,
  Type,
} from 'lucide-react';
import { Conversation, Message, User } from '../../types';
import { Message as MessageComponent } from './Message';
import { PhotoCaptureModal } from './PhotoCaptureModal';
import { ForwardModal } from './ForwardModal';
import { PollModal } from './PollModal';
import { LocationModal } from './LocationModal';
import { ContactModal } from './ContactModal';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { audioEffects } from '../../lib/audioEffects';
import { api } from '../../lib/api';

interface ConversationAreaProps {
  conversation: Conversation;
  messages: Message[];
  currentUser: User;
  conversations?: Conversation[];
  typingUsers?: Record<string, string>;
  onSendMessage: (data: any) => void;
  onSendTyping: (isTyping: boolean) => void;
  onStartCall: (type: 'voice' | 'video') => void;
  onToggleInfoPanel: () => void;
  onImageClick: (url: string) => void;
  onOpenSettings?: () => void;
  onBackMobile?: () => void;
  onUpdateMessages?: (messages: Message[]) => void;
  onSelectConversation?: (id: string) => void;
  onMarkAsRead?: (conversationId: string) => void;
}

export const ConversationArea: React.FC<ConversationAreaProps> = ({
  conversation,
  messages,
  currentUser,
  conversations = [],
  typingUsers = {},
  onSendMessage,
  onSendTyping,
  onStartCall,
  onToggleInfoPanel,
  onImageClick,
  onOpenSettings,
  onBackMobile,
  onUpdateMessages,
  onSelectConversation,
  onMarkAsRead,
}) => {
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [voicePlaybackRate, setVoicePlaybackRate] = useState<number>(1);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [transcribingMessageId, setTranscribingMessageId] = useState<string | null>(null);
  const [copiedTranscriptId, setCopiedTranscriptId] = useState<string | null>(null);
  const [isTranscribingInput, setIsTranscribingInput] = useState<boolean>(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const slashCommands = [
    { cmd: '/help', desc: 'Display interactive bot commands & shortcuts' },
    { cmd: '/poll', desc: 'Launch an instant live community poll' },
    { cmd: '/quote', desc: 'Generate a cryptography & privacy quote' },
    { cmd: '/dice', desc: 'Roll a 6-sided random die in chat' },
    { cmd: '/time', desc: 'Broadcast synchronized UTC mesh timestamp' },
    { cmd: '/stats', desc: 'Inspect SQLite database & message metrics' },
  ];

  const handleExportTranscript = () => {
    const lines = messages.map(m => {
      const sender = m.senderId === currentUser.id ? currentUser.displayName : (m.sender?.displayName || conversation.name);
      const time = new Date(m.createdAt).toLocaleString();
      return `[${time}] ${sender}: ${m.content || m.type}`;
    });
    const content = `AETHER MONOCHROME — CHAT TRANSCRIPT\nConversation: ${conversation.name}\nExported: ${new Date().toLocaleString()}\n----------------------------------------\n\n${lines.join('\n')}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conversation.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyFormat = (wrapper: string) => {
    setInputText(prev => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${wrapper}text${wrapper}`);
    inputRef.current?.focus();
  };

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    message: Message;
  } | null>(null);
  const [showCopyFeedback, setShowCopyFeedback] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  // Message reaction picker popover state
  const [activeReactionPickerMsgId, setActiveReactionPickerMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);

  const voiceRecorder = useVoiceRecorder();

  // Reset search, reaction popover, and context menu when switching conversation
  useEffect(() => {
    setIsMobileSearchOpen(false);
    setSearchQuery('');
    setContextMenu(null);
    setActiveReactionPickerMsgId(null);
  }, [conversation?.id]);

  // Close context menu and reaction popover on click outside, window scroll, or Escape key
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
      const pickerEl = document.getElementById('message-reaction-picker-popover');
      if (pickerEl && !pickerEl.contains(e.target as Node)) {
        setActiveReactionPickerMsgId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setActiveReactionPickerMsgId(null);
      }
    };
    const handleGlobalScroll = () => {
      setContextMenu(null);
      setActiveReactionPickerMsgId(null);
    };

    window.addEventListener('mousedown', handleGlobalClick);
    window.addEventListener('scroll', handleGlobalScroll, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('scroll', handleGlobalScroll, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (isMobileSearchOpen) {
      setTimeout(() => mobileSearchInputRef.current?.focus(), 60);
    }
  }, [isMobileSearchOpen]);

  // Global Ctrl+F / Cmd+F shortcut to trigger search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        setIsMobileSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto scroll to bottom on new messages (when not searching)
  useEffect(() => {
    if (!searchQuery.trim()) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, searchQuery]);

  // Mark messages as read when viewing conversation
  useEffect(() => {
    if (conversation?.id) {
      onMarkAsRead?.(conversation.id);
    }
  }, [conversation?.id, messages.length, onMarkAsRead]);

  // Deduplicate incoming messages by id so React never encounters duplicate keys
  const uniqueMessages: Message[] = Array.from(
    new Map<string, Message>(
      messages.filter((m): m is Message => Boolean(m && m.id)).map(m => [m.id, m])
    ).values()
  );

  // Determine the effective read status of an individual message based on the current state of messages in the conversation
  const getMessageEffectiveStatus = (
    msg: Message,
    conversationMessages: Message[],
    conv: Conversation,
    currentUserId: string
  ): 'sending' | 'sent' | 'delivered' | 'read' | 'failed' => {
    // 1. Pending sending state
    if (msg.status === 'sending') return 'sending';

    // 2. Failed state
    if (msg.status === 'failed') return 'failed';

    // 3. Saved Messages (notes to self are inherently read by the user)
    if (conv.type === 'saved' || conv.id === 'c_saved') {
      return 'read';
    }

    // 4. Explicit read state on message
    if (msg.status === 'read') return 'read';

    // 5. If another participant reacted to this message, they have seen & read it
    if (msg.reactions && msg.reactions.some(r => r.userId !== currentUserId)) {
      return 'read';
    }

    // 6. In a direct 1-on-1 conversation:
    // If the recipient sent ANY message after this message was sent,
    // all previous messages sent by the current user have naturally been seen and read.
    if (conv.type === 'direct') {
      const msgTime = new Date(msg.createdAt).getTime();
      const hasSubsequentReply = conversationMessages.some(m => {
        if (m.senderId === currentUserId) return false;
        return new Date(m.createdAt).getTime() > msgTime;
      });

      if (hasSubsequentReply) {
        return 'read';
      }
    }

    // 7. Bot conversation: if bot responded after this message
    if (conv.id === 'c_bot' || conv.members?.some(m => m.userId === 'u_bot')) {
      const msgTime = new Date(msg.createdAt).getTime();
      const hasBotReplyAfter = conversationMessages.some(m => {
        return m.senderId === 'u_bot' && new Date(m.createdAt).getTime() >= msgTime;
      });
      if (hasBotReplyAfter) {
        return 'read';
      }
    }

    // 8. Explicit delivered state
    if (msg.status === 'delivered') return 'delivered';

    // 9. Default to sent
    return msg.status || 'sent';
  };

  // Hover badge showing status label with single/double checkmark
  const renderStatusBadge = (msg: Message) => {
    const status = getMessageEffectiveStatus(msg, messages, conversation, currentUser.id);
    switch (status) {
      case 'read':
        return (
          <>
            <CheckCheck className="w-3 h-3 text-white stroke-[2.2]" />
            <span className="text-white font-semibold">Read</span>
          </>
        );
      case 'delivered':
        return (
          <>
            <CheckCheck className="w-3 h-3 text-neutral-400 stroke-[1.8]" />
            <span className="text-neutral-300">Delivered</span>
          </>
        );
      case 'sending':
        return (
          <>
            <Clock className="w-3 h-3 text-neutral-400 animate-pulse" />
            <span className="text-neutral-400">Sending</span>
          </>
        );
      case 'failed':
        return (
          <>
            <AlertCircle className="w-3 h-3 text-white" />
            <span className="text-white">Failed</span>
          </>
        );
      case 'sent':
      default:
        return (
          <>
            <Check className="w-3 h-3 text-neutral-400 stroke-[1.8]" />
            <span className="text-neutral-400">Sent</span>
          </>
        );
    }
  };

  // Individual message read status indicator (single checkmark for sent, double checkmark for delivered/read)
  const renderSeenIndicator = (msg: Message, isMe: boolean) => {
    if (!isMe) return null;

    const effectiveStatus = getMessageEffectiveStatus(
      msg,
      messages,
      conversation,
      currentUser.id
    );

    switch (effectiveStatus) {
      case 'read':
        return (
          <span
            title="Seen · Read by recipient"
            aria-label="Seen by recipient"
            className="inline-flex items-center text-current opacity-95 shrink-0 ml-1 transition-colors duration-200"
          >
            <CheckCheck className="w-3.5 h-3.5 stroke-[2.4]" />
          </span>
        );

      case 'delivered':
        return (
          <span
            title="Delivered · Delivered to device"
            aria-label="Delivered to device"
            className="inline-flex items-center text-current opacity-65 shrink-0 ml-1 transition-colors duration-200"
          >
            <CheckCheck className="w-3.5 h-3.5 stroke-[1.8]" />
          </span>
        );

      case 'sending':
        return (
          <span
            title="Sending..."
            aria-label="Sending"
            className="inline-flex items-center text-current opacity-50 shrink-0 ml-1"
          >
            <Clock className="w-3 h-3 animate-pulse" />
          </span>
        );

      case 'failed':
        return (
          <span
            title="Failed to send"
            aria-label="Failed to send"
            className="inline-flex items-center text-current shrink-0 ml-1"
          >
            <AlertCircle className="w-3.5 h-3.5 stroke-[2]" />
          </span>
        );

      case 'sent':
      default:
        return (
          <span
            title="Sent · Dispatched to server"
            aria-label="Dispatched to server"
            className="inline-flex items-center text-current opacity-60 shrink-0 ml-1 transition-colors duration-200"
          >
            <Check className="w-3.5 h-3.5 stroke-[1.8]" />
          </span>
        );
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    onSendTyping(e.target.value.length > 0);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    if (editingMessage) {
      // Handle message update
      api.editMessage(editingMessage.id, inputText.trim()).then(updated => {
        if (onUpdateMessages) {
          onUpdateMessages(uniqueMessages.map(m => (m.id === updated.id ? updated : m)));
        }
      });
      setEditingMessage(null);
      setInputText('');
      return;
    }

    audioEffects.playMessageSent();
    onSendMessage({
      type: 'text',
      content: inputText.trim(),
      replyToId: replyingTo?.id,
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            senderName: replyingTo.sender?.displayName || 'User',
            content: replyingTo.content,
            type: replyingTo.type,
          }
        : undefined,
    });

    setInputText('');
    setReplyingTo(null);
    onSendTyping(false);
    setShowEmojiPicker(false);
    setShowAttachMenu(false);
  };

  // Start Voice Recording
  const handleStartVoice = async () => {
    setVoiceError(null);
    const success = await voiceRecorder.startRecording();
    if (!success && voiceRecorder.error) {
      setVoiceError(voiceRecorder.error);
      setTimeout(() => setVoiceError(null), 4000);
    }
  };

  // Stop and Send Voice Note (with transcription attached)
  const handleSendVoice = async () => {
    setIsTranscribingInput(true);
    const recorded = await voiceRecorder.stopRecording();
    if (recorded && recorded.audioDataUrl) {
      audioEffects.playMessageSent();
      let transcriptText = recorded.liveTranscript ? recorded.liveTranscript.trim() : '';

      // If live transcription is empty, run server AI transcription
      if (!transcriptText) {
        try {
          const aiRes = await api.transcribeAudio({
            audioData: recorded.audioDataUrl,
          });
          if (aiRes.transcription) {
            transcriptText = aiRes.transcription.trim();
          }
        } catch (e) {
          console.warn('Voice note transcription note:', e);
        }
      }

      onSendMessage({
        type: 'voice',
        content: transcriptText ? `Voice note: "${transcriptText}"` : 'Voice note',
        mediaUrl: recorded.audioDataUrl,
        voiceDuration: recorded.duration,
        transcription: transcriptText || undefined,
        replyToId: replyingTo?.id,
      });
      setReplyingTo(null);
    }
    setIsTranscribingInput(false);
  };

  // Convert Voice Recording to Text and insert directly into input field
  const handleInsertVoiceAsText = async () => {
    setIsTranscribingInput(true);
    const recorded = await voiceRecorder.stopRecording();
    if (recorded) {
      let text = recorded.liveTranscript ? recorded.liveTranscript.trim() : '';
      if (!text && recorded.audioDataUrl) {
        try {
          const aiRes = await api.transcribeAudio({
            audioData: recorded.audioDataUrl,
          });
          if (aiRes.transcription) {
            text = aiRes.transcription.trim();
          }
        } catch (e) {
          console.warn('Voice-to-text dictation note:', e);
        }
      }
      if (text) {
        setInputText(prev => (prev.trim() ? `${prev.trim()} ${text}` : text));
        setTimeout(() => inputRef.current?.focus(), 60);
      }
    }
    setIsTranscribingInput(false);
  };

  // Transcribe an existing voice note with AI on demand
  const handleTranscribeMessage = async (msg: Message) => {
    if (!msg.mediaUrl || msg.transcription) return;
    setTranscribingMessageId(msg.id);
    try {
      const res = await api.transcribeAudio({
        audioData: msg.mediaUrl,
        messageId: msg.id,
      });
      if (res.transcription && onUpdateMessages) {
        onUpdateMessages(
          uniqueMessages.map(m =>
            m.id === msg.id ? { ...m, transcription: res.transcription } : m
          )
        );
      }
    } catch (err) {
      console.error('Failed to transcribe voice message:', err);
    } finally {
      setTranscribingMessageId(null);
    }
  };

  // Copy transcript to clipboard
  const handleCopyTranscript = (msgId: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedTranscriptId(msgId);
    setTimeout(() => {
      setCopiedTranscriptId(null);
    }, 2000);
  };

  // Handle Image File Selection from device
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        audioEffects.playMessageSent();
        onSendMessage({
          type: 'image',
          content: file.name,
          mediaUrl: dataUrl,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          replyToId: replyingTo?.id,
        });
        setReplyingTo(null);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
    setShowAttachMenu(false);
  };

  // Handle Photo Taken from Camera
  const handlePhotoCaptured = (dataUrl: string, caption?: string) => {
    audioEffects.playMessageSent();
    onSendMessage({
      type: 'image',
      content: caption || '',
      mediaUrl: dataUrl,
      replyToId: replyingTo?.id,
    });
    setReplyingTo(null);
  };

  // Toggle Voice Note Playback Speed
  const handleCycleSpeed = () => {
    const speeds = [1, 1.5, 2];
    const nextIdx = (speeds.indexOf(voicePlaybackRate) + 1) % speeds.length;
    const nextRate = speeds[nextIdx];
    setVoicePlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  // Toggle Voice Note Playback
  const handleToggleVoicePlay = (msgId: string, audioUrl?: string) => {
    if (!audioUrl) return;
    if (playingVoiceId === msgId) {
      audioRef.current?.pause();
      setPlayingVoiceId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.playbackRate = voicePlaybackRate;
        audioRef.current.play().catch(err => {
          console.warn('Audio play error', err);
        });
        setPlayingVoiceId(msgId);
      }
    }
  };

  // Reactions with optimistic update
  const handleReact = async (msgId: string, emoji: string) => {
    // Optimistic toggle
    if (onUpdateMessages) {
      onUpdateMessages(
        uniqueMessages.map(m => {
          if (m.id !== msgId) return m;
          const currentReactions = m.reactions ? [...m.reactions] : [];
          const existingIdx = currentReactions.findIndex(
            r => r.userId === currentUser.id && r.emoji === emoji
          );

          if (existingIdx !== -1) {
            currentReactions.splice(existingIdx, 1);
          } else {
            currentReactions.push({
              id: `r_opt_${Date.now()}`,
              messageId: msgId,
              userId: currentUser.id,
              emoji,
              userDisplayName: currentUser.displayName,
            });
          }
          return { ...m, reactions: currentReactions };
        })
      );
    }

    try {
      const updated = await api.reactToMessage(msgId, emoji);
      if (onUpdateMessages && updated) {
        onUpdateMessages(uniqueMessages.map(m => (m.id === updated.id ? updated : m)));
      }
    } catch (err) {
      console.error('Failed to react', err);
      try {
        const fetched = await api.getMessages(conversation.id);
        if (onUpdateMessages) onUpdateMessages(fetched);
      } catch (e) {
        // ignore
      }
    }
  };

  // Pin Message
  const handlePin = async (msgId: string) => {
    try {
      const updated = await api.togglePinMessage(msgId);
      if (onUpdateMessages) {
        onUpdateMessages(uniqueMessages.map(m => (m.id === updated.id ? updated : m)));
      }
    } catch (err) {
      console.error('Failed to pin message', err);
    }
  };

  // Delete Message
  const handleDelete = async (msgId: string, forEveryone = false) => {
    try {
      await api.deleteMessage(msgId, forEveryone);
      if (onUpdateMessages) {
        onUpdateMessages(uniqueMessages.filter(m => m.id !== msgId));
      }
    } catch (err) {
      console.error('Failed to delete message', err);
    }
  };

  // Open Custom Right-Click Context Menu
  const handleContextMenu = (e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    e.stopPropagation();

    const menuWidth = 190;
    const menuHeight = 185;
    const padding = 12;

    const x = Math.min(e.clientX, window.innerWidth - menuWidth - padding);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - padding);

    setContextMenu({
      x: Math.max(padding, x),
      y: Math.max(padding, y),
      message: msg,
    });
  };

  // Reply from Context Menu
  const handleContextMenuReply = () => {
    if (!contextMenu) return;
    setReplyingTo(contextMenu.message);
    setContextMenu(null);
    inputRef.current?.focus();
  };

  // Forward from Context Menu
  const handleContextMenuForward = () => {
    if (!contextMenu) return;
    setForwardingMessage(contextMenu.message);
    setContextMenu(null);
  };

  // Delete from Context Menu
  const handleContextMenuDelete = () => {
    if (!contextMenu) return;
    const msg = contextMenu.message;
    handleDelete(msg.id, msg.senderId === currentUser.id);
    setContextMenu(null);
  };

  // Extract clean text representation from Message
  const getMessageTextToCopy = (msg: Message): string => {
    if (msg.transcription) return msg.transcription;
    if (msg.content) return msg.content;
    if (msg.poll) {
      const optionsText = msg.poll.options?.map(o => `• ${o.text}`).join('\n') || '';
      return `${msg.poll.question}\n${optionsText}`.trim();
    }
    if (msg.contactCard) {
      return `${msg.contactCard.name}\n${msg.contactCard.phone || ''}\n${msg.contactCard.email || ''}`.trim();
    }
    if (msg.location) {
      return `${msg.location.title || 'Location Pin'}: ${msg.location.latitude}, ${msg.location.longitude}`;
    }
    if (msg.fileName) return msg.fileName;
    if (msg.mediaUrl) return msg.mediaUrl;
    return '';
  };

  // Copy Text from Context Menu
  const handleContextMenuCopyText = async () => {
    if (!contextMenu) return;
    const text = getMessageTextToCopy(contextMenu.message);
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        setShowCopyFeedback(true);
        setTimeout(() => setShowCopyFeedback(false), 2000);
      } catch (err) {
        console.error('Failed to copy text', err);
      }
    }
    setContextMenu(null);
  };

  // Poll Vote
  const handleVotePoll = async (messageId: string, optionId: string) => {
    try {
      const updated = await api.votePoll(messageId, optionId);
      if (onUpdateMessages) {
        onUpdateMessages(uniqueMessages.map(m => (m.id === updated.id ? updated : m)));
      }
    } catch (err) {
      console.error('Failed to vote', err);
    }
  };

  // Scroll to a referenced message
  const scrollToMessage = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-cyan-400');
      setTimeout(() => el.classList.remove('ring-2', 'ring-cyan-400'), 1500);
    }
  };

  const formatRecordingSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const emojis = ['😊', '🙌', '👍', '☕', '🔥', '✨', '💼', '🚀', '💯', '❤️', '👏', '🎉'];
  const quickReactions = ['❤️', '👍', '🔥', '😂', '😮', '😢', '🎉'];
  const extendedReactions = [
    '❤️', '👍', '🔥', '😂', '😮', '😢', '🎉', '👏',
    '🙌', '💯', '✨', '🚀', '😍', '👀', '💡', '⚡',
    '🙏', '🤝', '💪', '🥳', '🤔', '😎', '🫡', '☕',
  ];

  // Other member in direct chat
  const otherMember = conversation.members.find(m => m.userId !== currentUser.id)?.user;
  const isTyping = typingUsers[conversation.id];

  // Check for pinned message
  const pinnedMessage = uniqueMessages.find(m => m.isPinned);

  // Search filter and highlight helpers
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredMessages = normalizedQuery
    ? uniqueMessages.filter(msg => {
        if (msg.content && msg.content.toLowerCase().includes(normalizedQuery)) return true;
        if (msg.poll) {
          if (msg.poll.question?.toLowerCase().includes(normalizedQuery)) return true;
          if (msg.poll.options?.some(opt => opt.text?.toLowerCase().includes(normalizedQuery))) return true;
        }
        if (msg.location?.title?.toLowerCase().includes(normalizedQuery)) return true;
        if (msg.contactCard) {
          if (msg.contactCard.name?.toLowerCase().includes(normalizedQuery)) return true;
          if (msg.contactCard.phone?.toLowerCase().includes(normalizedQuery)) return true;
          if (msg.contactCard.email?.toLowerCase().includes(normalizedQuery)) return true;
        }
        if (msg.fileName && msg.fileName.toLowerCase().includes(normalizedQuery)) return true;
        if (msg.transcription && msg.transcription.toLowerCase().includes(normalizedQuery)) return true;
        return false;
      })
    : uniqueMessages;

  const highlightMatches = (text: string, query: string) => {
    if (!text) return text;
    if (query.trim()) {
      const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');
      const parts = text.split(regex);
      return parts.map((part, i) =>
        part.toLowerCase() === query.trim().toLowerCase() ? (
          <mark key={i} className="bg-black text-white px-1 rounded font-bold underline">
            {part}
          </mark>
        ) : (
          part
        )
      );
    }
    // Render simple inline markdown (**bold**, `code`)
    const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return tokens.map((tok, idx) => {
      if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
        return <strong key={idx} className="font-extrabold">{tok.slice(2, -2)}</strong>;
      }
      if (tok.startsWith('`') && tok.endsWith('`') && tok.length > 2) {
        return (
          <code key={idx} className="px-1.5 py-0.5 rounded bg-black/20 border border-current/20 font-mono text-[11px]">
            {tok.slice(1, -1)}
          </code>
        );
      }
      return tok;
    });
  };

  const formatDateHeader = (isoDate: string) => {
    const d = new Date(isoDate);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatMessageTime = (isoDate: string) => {
    try {
      const d = new Date(isoDate);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <main className="flex-1 flex flex-col h-full bg-black text-white relative select-none overflow-hidden">
      {/* Audio Playback Element */}
      <audio
        ref={audioRef}
        onEnded={() => setPlayingVoiceId(null)}
        onError={() => setPlayingVoiceId(null)}
        className="hidden"
      />

      {/* Hidden File Input for Image Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFileChange}
      />

      {/* Photo Capture Viewfinder Modal */}
      <PhotoCaptureModal
        isOpen={isPhotoModalOpen}
        onClose={() => setIsPhotoModalOpen(false)}
        onSendPhoto={handlePhotoCaptured}
      />

      {/* Forward Modal */}
      <ForwardModal
        isOpen={!!forwardingMessage}
        message={forwardingMessage}
        conversations={conversations}
        onClose={() => setForwardingMessage(null)}
        onForward={async (targetId, msg) => {
          try {
            await api.forwardMessage(msg.id, targetId);
            if (onSelectConversation && targetId !== conversation.id) {
              onSelectConversation(targetId);
            }
          } catch (err) {
            console.error('Failed to forward message', err);
          }
        }}
      />

      {/* Poll Modal */}
      <PollModal
        isOpen={isPollModalOpen}
        onClose={() => setIsPollModalOpen(false)}
        onSubmit={pollData => {
          onSendMessage({
            type: 'poll',
            content: pollData.question,
            poll: {
              id: `poll_${Date.now()}`,
              messageId: '',
              question: pollData.question,
              options: pollData.options.map((opt, i) => ({
                id: `opt_${Date.now()}_${i}`,
                text: opt,
                voterIds: [],
              })),
              isMultiple: pollData.isMultiple,
              isAnonymous: pollData.isAnonymous,
            },
          });
        }}
      />

      {/* Location Modal */}
      <LocationModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        onSendLocation={loc => {
          onSendMessage({
            type: 'location',
            content: loc.title,
            location: loc,
          });
        }}
      />

      {/* Contact Modal */}
      <ContactModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        onSendContact={contact => {
          onSendMessage({
            type: 'contact',
            content: contact.name,
            contactCard: contact,
          });
        }}
      />

      {/* Top Header */}
      <header className="h-16 px-4 sm:px-6 flex items-center justify-between border-b border-white/15 shrink-0 bg-[#050505] z-10 gap-3">
        {isMobileSearchOpen ? (
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 relative flex items-center">
              <Search className="w-4 h-4 text-white absolute left-3 pointer-events-none" />
              <input
                ref={mobileSearchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    if (searchQuery) setSearchQuery('');
                    else setIsMobileSearchOpen(false);
                  }
                }}
                placeholder="Search messages by text..."
                className="w-full bg-[#111111] border border-white/30 rounded-xl pl-9 pr-24 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white"
              />
              <div className="absolute right-2.5 flex items-center gap-1.5 text-[11px]">
                {searchQuery.trim() && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-black font-bold">
                    {filteredMessages.length} {filteredMessages.length === 1 ? 'match' : 'matches'}
                  </span>
                )}
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    title="Clear query"
                    className="p-1 text-neutral-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                setIsMobileSearchOpen(false);
                setSearchQuery('');
              }}
              className="px-3 py-1.5 text-xs text-neutral-300 hover:text-white font-medium cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 min-w-0">
              {onBackMobile && (
                <button
                  onClick={onBackMobile}
                  className="md:hidden p-1.5 -ml-2 rounded-xl text-neutral-400 hover:text-white cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              <div
                onClick={onToggleInfoPanel}
                className="flex items-center gap-3 cursor-pointer group min-w-0"
              >
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-white/25 bg-[#141414]">
                  <img
                    src={
                      conversation.avatarUrl ||
                      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(conversation.name)}`
                    }
                    alt={conversation.name}
                    className="w-full h-full object-cover grayscale contrast-125"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-white group-hover:text-neutral-200 transition flex items-center gap-1.5 truncate">
                    <span className="truncate">{conversation.name}</span>
                    {conversation.type === 'saved' && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-white text-black font-bold shrink-0">
                        Saved
                      </span>
                    )}
                  </h2>
                  <div className="text-[11px] text-neutral-400 truncate">
                    {isTyping ? (
                      <span className="text-white font-semibold animate-pulse">{isTyping} is typing...</span>
                    ) : (
                      conversation.description || (otherMember?.isOnline ? 'Online • Encrypted' : 'End-to-End Encrypted')
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Conversation Header Search Input Field (Desktop / Tablet) */}
            <div className="hidden sm:flex items-center flex-1 max-w-xs relative mx-2">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') setSearchQuery('');
                }}
                placeholder="Search messages..."
                className="w-full bg-[#111111] border border-white/15 focus:border-white rounded-xl pl-8.5 pr-20 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none transition"
              />
              <div className="absolute right-2 flex items-center gap-1">
                {searchQuery.trim() && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-black font-bold">
                    {filteredMessages.length}
                  </span>
                )}
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                    className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Quick Header Actions */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={() => setIsMobileSearchOpen(true)}
                title="Search Messages"
                className="sm:hidden w-9 h-9 rounded-xl bg-[#111111] border border-white/15 hover:border-white text-neutral-300 hover:text-white flex items-center justify-center transition cursor-pointer active:scale-95"
              >
                <Search className="w-4 h-4" />
              </button>

              <button
                onClick={handleExportTranscript}
                title="Export Chat Transcript (.txt)"
                className="w-9 h-9 rounded-xl bg-[#111111] border border-white/15 hover:border-white text-neutral-300 hover:text-white flex items-center justify-center transition cursor-pointer active:scale-95"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                onClick={() => onStartCall('voice')}
                title="Start Voice Call"
                className="w-9 h-9 rounded-xl bg-[#111111] border border-white/15 hover:border-white text-neutral-300 hover:text-white flex items-center justify-center transition cursor-pointer active:scale-95"
              >
                <Phone className="w-4 h-4" />
              </button>
              <button
                onClick={() => onStartCall('video')}
                title="Start Video Call"
                className="w-9 h-9 rounded-xl bg-white text-black hover:bg-neutral-200 flex items-center justify-center transition cursor-pointer active:scale-95"
              >
                <Video className="w-4 h-4" />
              </button>

              {onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  title="Open Settings Panel"
                  className="w-9 h-9 rounded-xl bg-[#111111] border border-white/15 hover:border-white text-neutral-300 hover:text-white flex items-center justify-center transition cursor-pointer active:scale-95 ml-0.5"
                >
                  <SettingsIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </>
        )}
      </header>

      {/* Voice Recorder Error Banner */}
      {voiceError && (
        <div className="px-6 py-2 bg-white text-black text-xs font-medium flex items-center justify-between">
          <span>Microphone Notice: {voiceError}</span>
          <button onClick={() => setVoiceError(null)} className="font-bold underline cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Active Search Filter Banner */}
      {searchQuery.trim() && (
        <div className="px-6 py-2 bg-[#111111] border-b border-white/15 flex items-center justify-between text-xs text-neutral-300 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Search className="w-3.5 h-3.5 text-white shrink-0" />
            <span className="truncate">
              Showing <span className="font-bold text-white">{filteredMessages.length}</span> of {messages.length} messages matching &ldquo;<span className="text-white font-bold underline">{searchQuery.trim()}</span>&rdquo;
            </span>
          </div>
          <button
            onClick={() => setSearchQuery('')}
            className="text-[11px] text-white hover:underline cursor-pointer shrink-0 ml-2"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Pinned Message Banner */}
      {pinnedMessage && (
        <div
          onClick={() => scrollToMessage(pinnedMessage.id)}
          className="px-6 py-2 bg-[#111111] border-b border-white/15 flex items-center justify-between cursor-pointer text-xs transition hover:bg-[#181818]"
        >
          <div className="flex items-center gap-2 text-white min-w-0">
            <Pin className="w-3.5 h-3.5 text-white shrink-0" />
            <span className="font-bold text-white shrink-0">Pinned:</span>
            <span className="text-neutral-300 truncate">
              {pinnedMessage.content || 'Media message'}
            </span>
          </div>
          <button
            onClick={e => {
              e.stopPropagation();
              handlePin(pinnedMessage.id);
            }}
            className="p-1 text-neutral-400 hover:text-white rounded transition"
            title="Unpin message"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Scrollable Chat Canvas */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 scrollbar-none">
        {/* Contact Intro Card (hidden during active search) */}
        {!searchQuery.trim() && (
          <div className="flex flex-col items-center justify-center text-center pt-3 pb-6 border-b border-white/5">
            <div className="relative mb-3">
              <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-[#222228] shadow-2xl">
                <img
                  src={
                    conversation.avatarUrl ||
                    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(conversation.name)}`
                  }
                  alt={conversation.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              {otherMember?.isOnline && (
                <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-black" />
              )}
            </div>
            <h3 className="text-base font-bold text-white mb-0.5">{conversation.name}</h3>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              {conversation.description ||
                (otherMember?.bio ? otherMember.bio : 'Messages are end-to-end encrypted and saved in SQL.')}
            </p>
          </div>
        )}

        {/* Empty state for search with no matches */}
        {searchQuery.trim() && filteredMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 mb-3 shadow-inner">
              <Search className="w-6 h-6 text-slate-400" />
            </div>
            <h4 className="text-sm font-bold text-white mb-1">No messages found</h4>
            <p className="text-xs text-slate-400 max-w-xs mb-4">
              We couldn&apos;t find any messages containing &ldquo;{searchQuery}&rdquo; in this chat.
            </p>
            <button
              onClick={() => setSearchQuery('')}
              className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-cyan-300 font-semibold transition cursor-pointer"
            >
              Clear search
            </button>
          </div>
        )}

        {/* Message stream */}
        {filteredMessages.map((msg, index) => {
          const isMe = msg.senderId === currentUser.id;
          const showDateHeader =
            index === 0 ||
            new Date(msg.createdAt).toDateString() !==
              new Date(filteredMessages[index - 1].createdAt).toDateString();

          const isHovered = hoveredMessageId === msg.id;

          return (
            <React.Fragment key={`${msg.id}-${index}`}>
              {showDateHeader && (
                <div className="flex justify-center my-4">
                  <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-neutral-400 font-medium">
                    {formatDateHeader(msg.createdAt)}
                  </span>
                </div>
              )}

              <MessageComponent
                message={msg}
                isMe={isMe}
                currentUser={currentUser}
                searchQuery={searchQuery}
                isHovered={isHovered}
                isActiveContextMenu={contextMenu?.message.id === msg.id}
                activeReactionPickerMsgId={activeReactionPickerMsgId}
                playingVoiceId={playingVoiceId}
                voicePlaybackRate={voicePlaybackRate}
                transcribingMessageId={transcribingMessageId}
                copiedTranscriptId={copiedTranscriptId}
                quickReactions={quickReactions}
                extendedReactions={extendedReactions}
                onMouseEnter={id => setHoveredMessageId(id)}
                onMouseLeave={() => setHoveredMessageId(null)}
                onContextMenu={handleContextMenu}
                onReact={handleReact}
                onToggleReactionPicker={id => setActiveReactionPickerMsgId(id)}
                onReply={m => {
                  setReplyingTo(m);
                  inputRef.current?.focus();
                }}
                onForward={m => setForwardingMessage(m)}
                onPin={handlePin}
                onEdit={m => {
                  setEditingMessage(m);
                  setInputText(m.content);
                  inputRef.current?.focus();
                }}
                onDelete={handleDelete}
                onScrollToMessage={scrollToMessage}
                onToggleVoicePlay={handleToggleVoicePlay}
                onCycleSpeed={handleCycleSpeed}
                onTranscribeMessage={handleTranscribeMessage}
                onCopyTranscript={handleCopyTranscript}
                onImageClick={onImageClick}
                onVotePoll={handleVotePoll}
                onQuickMessageContact={name => {
                  setInputText(`Hello ${name}!`);
                  inputRef.current?.focus();
                }}
                onStartVoiceCall={() => onStartCall('voice')}
                renderStatusBadge={renderStatusBadge}
                renderSeenIndicator={renderSeenIndicator}
                highlightMatches={highlightMatches}
                formatMessageTime={formatMessageTime}
              />
            </React.Fragment>
          );
        })}

        {/* Real-time Typing indicator */}
        {isTyping && (
          <div className="flex items-start my-2">
            <div className="px-4 py-2.5 rounded-2xl bg-[#121212] border border-white/15 text-neutral-300 flex items-center gap-1.5 shadow-sm">
              <span className="text-[11px] text-white font-bold mr-1">{isTyping}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="absolute bottom-20 left-6 z-40 p-2.5 rounded-2xl bg-[#18181c] border border-[#2b2b34] shadow-2xl flex items-center gap-2">
          {emojis.map(e => (
            <button
              key={e}
              onClick={() => {
                setInputText(prev => prev + e);
                setShowEmojiPicker(false);
              }}
              className="p-2 hover:bg-white/10 rounded-xl text-base transition cursor-pointer"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* Attach Media (+) Popover Menu */}
      {showAttachMenu && (
        <div className="absolute bottom-20 left-10 z-40 p-2 rounded-2xl bg-[#141418] border border-white/10 shadow-2xl flex flex-col gap-1 w-48 animate-in fade-in">
          <button
            onClick={() => {
              setIsPhotoModalOpen(true);
              setShowAttachMenu(false);
            }}
            className="w-full px-3 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/5 flex items-center gap-2.5 transition cursor-pointer"
          >
            <Camera className="w-4 h-4 text-cyan-400" />
            <span>Take Photo (Camera)</span>
          </button>

          <button
            onClick={() => {
              fileInputRef.current?.click();
              setShowAttachMenu(false);
            }}
            className="w-full px-3 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/5 flex items-center gap-2.5 transition cursor-pointer"
          >
            <ImageIcon className="w-4 h-4 text-emerald-400" />
            <span>Photo / Video Gallery</span>
          </button>

          <button
            onClick={() => {
              setIsPollModalOpen(true);
              setShowAttachMenu(false);
            }}
            className="w-full px-3 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/5 flex items-center gap-2.5 transition cursor-pointer"
          >
            <BarChart2 className="w-4 h-4 text-amber-400" />
            <span>Create Poll</span>
          </button>

          <button
            onClick={() => {
              setIsLocationModalOpen(true);
              setShowAttachMenu(false);
            }}
            className="w-full px-3 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/5 flex items-center gap-2.5 transition cursor-pointer"
          >
            <MapPin className="w-4 h-4 text-rose-400" />
            <span>Share Location</span>
          </button>

          <button
            onClick={() => {
              setIsContactModalOpen(true);
              setShowAttachMenu(false);
            }}
            className="w-full px-3 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/5 flex items-center gap-2.5 transition cursor-pointer"
          >
            <UserIcon className="w-4 h-4 text-purple-400" />
            <span>Share Contact Card</span>
          </button>
        </div>
      )}

      {/* Reply Preview Banner above Input Bar */}
      {replyingTo && (
        <div className="px-6 py-2 bg-[#141418] border-t border-white/5 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2 truncate">
            <Reply className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="font-semibold text-white shrink-0">
              Replying to {replyingTo.sender?.displayName || 'Message'}:
            </span>
            <span className="text-slate-400 truncate">{replyingTo.content || 'Media'}</span>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="p-1 rounded text-slate-400 hover:text-white transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Editing Message Banner */}
      {editingMessage && (
        <div className="px-6 py-2 bg-amber-950/40 border-t border-amber-500/20 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2 truncate">
            <Edit2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="font-semibold text-white">Editing Message</span>
          </div>
          <button
            onClick={() => {
              setEditingMessage(null);
              setInputText('');
            }}
            className="p-1 rounded text-amber-400 hover:text-white transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Slash Command Autocomplete Popover */}
      {inputText.startsWith('/') && (
        <div className="px-4 sm:px-6 pb-2 bg-[#050505]">
          <div className="max-w-4xl mx-auto rounded-2xl bg-[#111111] border border-white/20 p-2 shadow-2xl space-y-1">
            <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-neutral-400 flex items-center justify-between">
              <span>Quick Slash Commands</span>
              <span>Click to run</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {slashCommands
                .filter(c => c.cmd.startsWith(inputText.trim().toLowerCase()))
                .map(item => (
                  <button
                    key={item.cmd}
                    type="button"
                    onClick={() => {
                      onSendMessage({ type: 'text', content: item.cmd });
                      setInputText('');
                    }}
                    className="px-3 py-2 rounded-xl bg-black/50 hover:bg-white hover:text-black text-left transition flex items-center justify-between cursor-pointer group"
                  >
                    <span className="text-xs font-mono font-bold">{item.cmd}</span>
                    <span className="text-[11px] text-neutral-400 group-hover:text-black/80 truncate ml-2">
                      {item.desc}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Formatting & Smart Action Bar */}
      <div className="px-4 sm:px-6 pt-2 pb-1 bg-[#050505] border-t border-white/10 flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => applyFormat('**')}
            title="Insert Bold (**text**)"
            className="px-2 py-0.5 rounded bg-[#141414] hover:bg-white hover:text-black border border-white/15 text-[11px] font-bold text-neutral-300 transition cursor-pointer"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => applyFormat('`')}
            title="Insert Inline Code (`code`)"
            className="px-2 py-0.5 rounded bg-[#141414] hover:bg-white hover:text-black border border-white/15 text-[11px] font-mono text-neutral-300 transition cursor-pointer"
          >
            {'</>'}
          </button>
          <button
            type="button"
            onClick={() => setInputText('/')}
            title="Open Slash Commands (/)"
            className="px-2 py-0.5 rounded bg-[#141414] hover:bg-white hover:text-black border border-white/15 text-[11px] font-mono text-neutral-300 transition cursor-pointer"
          >
            /cmd
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {['Sounds great! ⚡', 'On it right now.', 'Let’s sync on a call 📞', '/poll'].map(quick => (
            <button
              key={quick}
              type="button"
              onClick={() => {
                if (quick === '/poll') {
                  setIsPollModalOpen(true);
                } else {
                  onSendMessage({ type: 'text', content: quick });
                }
              }}
              className="px-2.5 py-0.5 rounded-lg bg-[#111111] hover:bg-white hover:text-black border border-white/10 text-[11px] text-neutral-400 transition cursor-pointer whitespace-nowrap"
            >
              {quick}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Input & Media Bar */}
      <div className="p-3 sm:p-4 bg-[#050505] shrink-0">
        {voiceRecorder.isRecording ? (
          /* Live Voice Recording Bar with Real-Time Transcription */
          <div className="flex flex-col gap-2 max-w-4xl mx-auto px-4 py-2.5 rounded-2xl bg-[#121212] border border-white/30 shadow-xl animate-in fade-in">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping shrink-0" />
                <span className="text-xs font-mono font-bold text-white shrink-0">
                  Recording {formatRecordingSeconds(voiceRecorder.recordingTime)}
                </span>

                <div className="flex items-center gap-1 h-4 ml-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(i => {
                    const barHeight = Math.max(20, Math.min(100, voiceRecorder.volumeLevel * 100 * (1 + (i % 3) * 0.3)));
                    return (
                      <div
                        key={i}
                        className="w-1 rounded-full bg-white transition-all duration-75"
                        style={{ height: `${barHeight}%` }}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={voiceRecorder.cancelRecording}
                  disabled={isTranscribingInput}
                  className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition cursor-pointer disabled:opacity-50"
                  title="Cancel and discard recording"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleInsertVoiceAsText}
                  disabled={isTranscribingInput}
                  className="px-3 py-1.5 rounded-xl bg-[#1a1a1a] hover:bg-white hover:text-black text-white border border-white/20 font-medium text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95 disabled:opacity-50"
                  title="Convert speech into text in the message input box"
                >
                  {isTranscribingInput ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Type className="w-3.5 h-3.5" />
                  )}
                  <span>Dictate to text</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendVoice}
                  disabled={isTranscribingInput}
                  className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs flex items-center gap-1.5 shadow transition cursor-pointer active:scale-95 disabled:opacity-50"
                  title="Send voice note with transcription"
                >
                  {isTranscribingInput ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Send</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black border border-white/10 text-xs text-neutral-300">
              <Sparkles className="w-3.5 h-3.5 text-white shrink-0 animate-pulse" />
              <div className="flex-1 truncate">
                {voiceRecorder.liveTranscript ? (
                  <span className="text-white">
                    &ldquo;{voiceRecorder.liveTranscript}&rdquo;
                  </span>
                ) : (
                  <span className="text-neutral-500 italic">
                    Listening to speech... speak clearly to transcribe
                  </span>
                )}
              </div>
              {voiceRecorder.liveTranscript && (
                <span className="text-[10px] text-white font-mono shrink-0">Live</span>
              )}
            </div>
          </div>
        ) : (
          /* Standard Input Bar with Attach Menu (+) & Emoji triggers */
          <form onSubmit={handleSend} className="flex items-center gap-2 max-w-4xl mx-auto">
            <button
              type="button"
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              title="Attach media or poll"
              className="w-9 h-9 rounded-xl bg-[#141414] border border-white/15 hover:border-white text-neutral-300 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0 active:scale-95"
            >
              <Plus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setIsPhotoModalOpen(true)}
              title="Take Photo with Camera"
              className="w-9 h-9 rounded-xl bg-[#141414] border border-white/15 hover:border-white text-neutral-300 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0 active:scale-95"
            >
              <Camera className="w-4 h-4" />
            </button>

            <div className="flex-1 flex items-center px-4 py-2 rounded-xl bg-[#111111] border border-white/15 focus-within:border-white transition gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={handleInputChange}
                placeholder={editingMessage ? 'Edit message...' : 'Type a message, /command, or tap mic...'}
                className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none"
              />

              <button
                type="button"
                onClick={handleStartVoice}
                title="Voice-to-Text Dictation (speak to type)"
                className="p-1 text-neutral-400 hover:text-white transition cursor-pointer shrink-0"
              >
                <Mic className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-1 text-neutral-400 hover:text-white transition cursor-pointer shrink-0"
              >
                <Smile className="w-4 h-4" />
              </button>
            </div>

            {inputText.trim() ? (
              <button
                type="submit"
                className="w-10 h-10 rounded-xl bg-white hover:bg-neutral-200 text-black flex items-center justify-center transition shadow-lg cursor-pointer shrink-0 active:scale-95"
                title="Send message"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartVoice}
                title="Record voice note"
                className="w-10 h-10 rounded-xl bg-[#141414] border border-white/15 hover:border-white text-neutral-300 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0 active:scale-95"
              >
                <Mic className="w-4 h-4" />
              </button>
            )}
          </form>
        )}
      </div>

      {/* Custom Right-Click Context Menu */}
      {contextMenu && (
        <div
          id="message-context-menu"
          ref={contextMenuRef}
          style={{
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
          }}
          className="fixed z-50 w-48 p-1.5 rounded-2xl bg-[#16161c]/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/80 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-100 select-none"
          onClick={e => e.stopPropagation()}
        >
          {/* Header sender / timestamp */}
          <div className="px-2.5 py-1.5 border-b border-white/5 mb-1 text-[11px] text-slate-400 truncate flex items-center justify-between">
            <span className="font-semibold text-slate-300 truncate max-w-[120px]">
              {contextMenu.message.sender?.displayName ||
                (contextMenu.message.senderId === currentUser.id ? 'You' : 'Message')}
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {formatMessageTime(contextMenu.message.createdAt)}
            </span>
          </div>

          {/* Quick Reaction Row in Context Menu */}
          <div className="flex items-center justify-between px-1.5 py-1 mb-1.5 bg-white/[0.04] rounded-xl border border-white/5">
            {quickReactions.map(em => {
              const hasReacted = contextMenu.message.reactions?.some(
                r => r.userId === currentUser.id && r.emoji === em
              );
              return (
                <button
                  key={em}
                  type="button"
                  onClick={() => {
                    handleReact(contextMenu.message.id, em);
                    setContextMenu(null);
                  }}
                  title={`React ${em}`}
                  className={`p-1 text-sm rounded-lg hover:scale-125 active:scale-95 transition cursor-pointer ${
                    hasReacted ? 'bg-cyan-500/25 ring-1 ring-cyan-500/40' : 'hover:bg-white/10'
                  }`}
                >
                  {em}
                </button>
              );
            })}
          </div>

          {/* Option: Reply */}
          <button
            id="context-menu-reply-btn"
            type="button"
            onClick={handleContextMenuReply}
            className="w-full px-2.5 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition cursor-pointer group"
          >
            <Reply className="w-4 h-4 text-cyan-400 shrink-0 group-hover:scale-110 transition-transform" />
            <span className="font-medium">Reply</span>
          </button>

          {/* Option: Forward */}
          <button
            id="context-menu-forward-btn"
            type="button"
            onClick={handleContextMenuForward}
            className="w-full px-2.5 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition cursor-pointer group"
          >
            <Forward className="w-4 h-4 text-cyan-400 shrink-0 group-hover:scale-110 transition-transform" />
            <span className="font-medium">Forward</span>
          </button>

          {/* Option: Copy Text */}
          <button
            id="context-menu-copy-btn"
            type="button"
            onClick={handleContextMenuCopyText}
            className="w-full px-2.5 py-2 rounded-xl text-xs text-left text-slate-200 hover:text-white hover:bg-white/10 flex items-center gap-2.5 transition cursor-pointer group"
          >
            <Copy className="w-4 h-4 text-slate-300 shrink-0 group-hover:scale-110 transition-transform" />
            <span className="font-medium">Copy Text</span>
          </button>

          <div className="h-[1px] bg-white/5 my-0.5" />

          {/* Option: Delete */}
          <button
            id="context-menu-delete-btn"
            type="button"
            onClick={handleContextMenuDelete}
            className="w-full px-2.5 py-2 rounded-xl text-xs text-left text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center gap-2.5 transition cursor-pointer group"
          >
            <Trash2 className="w-4 h-4 text-rose-400 shrink-0 group-hover:scale-110 transition-transform" />
            <span className="font-medium">Delete</span>
          </button>
        </div>
      )}

      {/* Copy Notification Toast */}
      {showCopyFeedback && (
        <div
          id="copy-toast-notification"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-cyan-950/90 border border-cyan-500/40 text-cyan-200 text-xs font-medium shadow-xl shadow-cyan-950/50 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150 pointer-events-none"
        >
          <Check className="w-3.5 h-3.5 text-cyan-400" />
          <span>Message text copied to clipboard</span>
        </div>
      )}
    </main>
  );
};
