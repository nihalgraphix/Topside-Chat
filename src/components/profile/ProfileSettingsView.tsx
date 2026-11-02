import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Search,
  X,
  User as UserIcon,
  Shield,
  Lock,
  MessageSquare,
  Bell,
  Keyboard,
  HelpCircle,
  LogOut,
  Camera,
  Pencil,
  Copy,
  Check,
  ChevronRight,
  Phone,
  FileText,
  UserPlus,
  PhoneCall,
  RotateCcw,
  Key,
  Info,
  ExternalLink,
  Trash2,
  Database,
  Palette,
  Volume2,
  Mic,
  Video,
  Smartphone,
  RefreshCw,
  Download,
  Sliders,
  Eye,
  Clock,
  Sparkles,
} from 'lucide-react';
import { User as UserType, AccentTheme, Conversation, DeviceSession, BlockedUser } from '../../types';
import { api } from '../../lib/api';
import { audioEffects } from '../../lib/audioEffects';

export interface ProfileSettingsViewProps {
  currentUser: UserType;
  theme: 'dark' | 'light' | 'system';
  accent: AccentTheme;
  conversations?: Conversation[];
  onUpdateUser: (updated: UserType) => void;
  onUpdateTheme: (theme: 'dark' | 'light' | 'system', accent: AccentTheme) => void;
  onSwitchToChats: () => void;
  onSwitchToCalls: () => void;
  onOpenChannelsDiscovery?: () => void;
  onOpenNewConversation?: (type?: 'direct' | 'group' | 'channel') => void;
  onDeleteConversation?: (conversationId: string) => void;
  onClearConversation?: (conversationId: string) => void;
  onDeleteAllConversations?: () => void;
  onClearAllConversations?: () => void;
  onLogout: () => void;
}

type SubView =
  | 'main'
  | 'profile'
  | 'account'
  | 'privacy'
  | 'chats'
  | 'appearance'
  | 'audio_video'
  | 'storage'
  | 'wallpaper'
  | 'media_quality'
  | 'media_download'
  | 'notifications'
  | 'help';

interface WallpaperOption {
  id: string;
  name: string;
  color: string;
}

const WALLPAPER_COLORS: WallpaperOption[] = [
  { id: 'default', name: 'Default dark', color: '#0b141a' },
  { id: 'black_pearl', name: 'Black pearl', color: '#111b21' },
  { id: 'deep_emerald', name: 'Deep emerald', color: '#054740' },
  { id: 'forest_green', name: 'Forest green', color: '#0e382c' },
  { id: 'dark_burgundy', name: 'Dark burgundy', color: '#361726' },
  { id: 'midnight_slate', name: 'Midnight slate', color: '#1f2c34' },
  { id: 'navy_blue', name: 'Navy blue', color: '#122e49' },
  { id: 'royal_indigo', name: 'Royal indigo', color: '#1c2042' },
  { id: 'plum', name: 'Plum purple', color: '#2a1b3d' },
  { id: 'dark_chocolate', name: 'Dark chocolate', color: '#2c1e19' },
  { id: 'teal', name: 'Teal mist', color: '#0d3c40' },
  { id: 'olive', name: 'Olive green', color: '#2c331a' },
  { id: 'charcoal', name: 'Charcoal', color: '#1a1d20' },
  { id: 'obsidian', name: 'Obsidian', color: '#0c0f12' },
  { id: 'wine', name: 'Wine red', color: '#3b1720' },
  { id: 'steel_blue', name: 'Steel blue', color: '#172b38' },
  { id: 'espresso', name: 'Espresso', color: '#221b18' },
  { id: 'gunmetal', name: 'Gunmetal', color: '#192226' },
];

const ACCENT_OPTIONS: { id: AccentTheme; label: string; color: string }[] = [
  { id: 'aurora', label: 'Aurora Cyan', color: '#ffffff' },
  { id: 'ocean', label: 'Ocean Blue', color: '#38bdf8' },
  { id: 'midnight', label: 'Midnight Slate', color: '#94a3b8' },
  { id: 'purple', label: 'Nebula Purple', color: '#a855f7' },
  { id: 'emerald', label: 'Emerald Mint', color: '#10b981' },
  { id: 'sunset', label: 'Amber Gold', color: '#f59e0b' },
];

const SETTINGS_STORAGE_KEY = 'aether_extended_settings';

export const ProfileSettingsView: React.FC<ProfileSettingsViewProps> = ({
  currentUser,
  theme,
  accent,
  conversations = [],
  onUpdateUser,
  onUpdateTheme,
  onSwitchToChats,
  onSwitchToCalls,
  onOpenNewConversation,
  onDeleteConversation,
  onClearConversation,
  onDeleteAllConversations,
  onClearAllConversations,
  onLogout,
}) => {
  const [subView, setSubView] = useState<SubView>('main');
  const [searchQuery, setSearchQuery] = useState('');

  // Editable Profile States
  const [isEditingName, setIsEditingName] = useState(false);
  const [displayName, setDisplayName] = useState(currentUser.displayName || '');
  const [isEditingAbout, setIsEditingAbout] = useState(false);
  const [aboutText, setAboutText] = useState(currentUser.bio || '');
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneText, setPhoneText] = useState(currentUser.phone || '+1 (555) 019-2834');
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(
    currentUser.avatarUrl ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(currentUser.displayName || 'User')}`
  );

  // Load saved extended preferences from localStorage
  const loadSavedPref = <T,>(key: string, fallback: T): T => {
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed[key] !== undefined ? parsed[key] : fallback;
    } catch {
      return fallback;
    }
  };

  // Privacy Settings States
  const [lastSeenVisibility, setLastSeenVisibility] = useState<'Everyone' | 'My contacts' | 'Nobody'>(() =>
    loadSavedPref('lastSeenVisibility', 'Everyone')
  );
  const [profilePhotoVisibility, setProfilePhotoVisibility] = useState<'Everyone' | 'My contacts' | 'Nobody'>(() =>
    loadSavedPref('profilePhotoVisibility', 'Everyone')
  );
  const [aboutVisibility, setAboutVisibility] = useState<'Everyone' | 'My contacts' | 'Nobody'>(() =>
    loadSavedPref('aboutVisibility', 'Everyone')
  );
  const [groupsVisibility, setGroupsVisibility] = useState<'Everyone' | 'My contacts'>(() =>
    loadSavedPref('groupsVisibility', 'Everyone')
  );
  const [readReceipts, setReadReceipts] = useState<boolean>(() => loadSavedPref('readReceipts', true));
  const [typingIndicators, setTypingIndicators] = useState<boolean>(() => loadSavedPref('typingIndicators', true));
  const [disappearingTimer, setDisappearingTimer] = useState<'Off' | '24 Hours' | '7 Days' | '30 Days'>(() =>
    loadSavedPref('disappearingTimer', 'Off')
  );
  const [blockUnknown, setBlockUnknown] = useState<boolean>(() => loadSavedPref('blockUnknown', false));
  const [protectIpCalls, setProtectIpCalls] = useState<boolean>(() => loadSavedPref('protectIpCalls', false));
  const [appLockEnabled, setAppLockEnabled] = useState<boolean>(() => loadSavedPref('appLockEnabled', false));
  const [appLockPin, setAppLockPin] = useState<string>(() => loadSavedPref('appLockPin', ''));
  const [isSettingPin, setIsSettingPin] = useState(false);

  // Chat & Display Settings States
  const [selectedThemeModalOpen, setSelectedThemeModalOpen] = useState(false);
  const [pendingTheme, setPendingTheme] = useState<'dark' | 'light' | 'system'>(theme);
  const [selectedWallpaper, setSelectedWallpaper] = useState<WallpaperOption>(() =>
    loadSavedPref('selectedWallpaper', WALLPAPER_COLORS[0])
  );
  const [addDoodles, setAddDoodles] = useState<boolean>(() => loadSavedPref('addDoodles', true));
  const [mediaQuality, setMediaQuality] = useState<'standard' | 'hd'>(() =>
    loadSavedPref('mediaQuality', 'hd')
  );
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>(() =>
    loadSavedPref('fontSize', 'medium')
  );
  const [bubbleDensity, setBubbleDensity] = useState<'comfortable' | 'compact'>(() =>
    loadSavedPref('bubbleDensity', 'comfortable')
  );
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>(() => loadSavedPref('timeFormat', '12h'));
  const [defaultVoiceSpeed, setDefaultVoiceSpeed] = useState<'1x' | '1.25x' | '1.5x' | '2x'>(() =>
    loadSavedPref('defaultVoiceSpeed', '1x')
  );
  const [autoTranscribeVoice, setAutoTranscribeVoice] = useState<boolean>(() =>
    loadSavedPref('autoTranscribeVoice', true)
  );
  const [highContrast, setHighContrast] = useState<boolean>(() => loadSavedPref('highContrast', false));
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => loadSavedPref('reducedMotion', false));

  // Media Download States
  const [downloadPhotos, setDownloadPhotos] = useState<boolean>(() => loadSavedPref('downloadPhotos', true));
  const [downloadAudio, setDownloadAudio] = useState<boolean>(() => loadSavedPref('downloadAudio', true));
  const [downloadVideos, setDownloadVideos] = useState<boolean>(() => loadSavedPref('downloadVideos', false));
  const [downloadDocuments, setDownloadDocuments] = useState<boolean>(() =>
    loadSavedPref('downloadDocuments', true)
  );

  // Chat toggles
  const [spellCheck, setSpellCheck] = useState<boolean>(() => loadSavedPref('spellCheck', true));
  const [replaceWithEmoji, setReplaceWithEmoji] = useState<boolean>(() =>
    loadSavedPref('replaceWithEmoji', true)
  );
  const [enterIsSend, setEnterIsSend] = useState<boolean>(() => loadSavedPref('enterIsSend', true));

  // Notifications toggles
  const [notifyMessages, setNotifyMessages] = useState<boolean>(() => loadSavedPref('notifyMessages', true));
  const [notifyGroups, setNotifyGroups] = useState<boolean>(() => loadSavedPref('notifyGroups', true));
  const [notifyCalls, setNotifyCalls] = useState<boolean>(() => loadSavedPref('notifyCalls', true));
  const [showPreviews, setShowPreviews] = useState<boolean>(() => loadSavedPref('showPreviews', true));
  const [soundOutgoing, setSoundOutgoing] = useState<boolean>(() => loadSavedPref('soundOutgoing', true));
  const [backgroundSync, setBackgroundSync] = useState<boolean>(() => loadSavedPref('backgroundSync', true));

  // Voice & Video Hardware Settings
  const [noiseSuppression, setNoiseSuppression] = useState<boolean>(() =>
    loadSavedPref('noiseSuppression', true)
  );
  const [echoCancellation, setEchoCancellation] = useState<boolean>(() =>
    loadSavedPref('echoCancellation', true)
  );
  const [autoGainControl, setAutoGainControl] = useState<boolean>(() =>
    loadSavedPref('autoGainControl', true)
  );
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [isTestingCam, setIsTestingCam] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Storage, Devices & Blocked Contacts
  const [sqlStats, setSqlStats] = useState<{
    engine: string;
    status: string;
    stats: { users: number; messages: number; conversations: number; databaseFile: string };
  } | null>(null);
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    null | 'clear_all_chats' | 'delete_all_chats' | 'reset_workspace'
  >(null);
  const [confirmDeleteConvId, setConfirmDeleteConvId] = useState<string | null>(null);

  // Help beta toggle
  const [joinBeta, setJoinBeta] = useState<boolean>(() => loadSavedPref('joinBeta', false));

  // Modals
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const showNotice = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => {
      setStatusBanner(prev => (prev === msg ? null : prev));
    }, 3000);
  };

  // Persist all preferences whenever they change
  useEffect(() => {
    const payload = {
      lastSeenVisibility,
      profilePhotoVisibility,
      aboutVisibility,
      groupsVisibility,
      readReceipts,
      typingIndicators,
      disappearingTimer,
      blockUnknown,
      protectIpCalls,
      appLockEnabled,
      appLockPin,
      selectedWallpaper,
      addDoodles,
      mediaQuality,
      fontSize,
      bubbleDensity,
      timeFormat,
      defaultVoiceSpeed,
      autoTranscribeVoice,
      highContrast,
      reducedMotion,
      downloadPhotos,
      downloadAudio,
      downloadVideos,
      downloadDocuments,
      spellCheck,
      replaceWithEmoji,
      enterIsSend,
      notifyMessages,
      notifyGroups,
      notifyCalls,
      showPreviews,
      soundOutgoing,
      backgroundSync,
      noiseSuppression,
      echoCancellation,
      autoGainControl,
      joinBeta,
    };
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
    api
      .updateSettings({
        theme,
        accent,
        fontSize: fontSize === 'small' ? 'sm' : fontSize === 'large' ? 'lg' : 'md',
        notifications: {
          messages: notifyMessages,
          calls: notifyCalls,
          mentionsOnly: !notifyGroups,
          preview: showPreviews,
          sound: soundOutgoing,
        },
        privacy: {
          lastSeen:
            lastSeenVisibility === 'Everyone'
              ? 'everyone'
              : lastSeenVisibility === 'My contacts'
              ? 'contacts'
              : 'nobody',
          readReceipts,
          profilePhoto:
            profilePhotoVisibility === 'Everyone'
              ? 'everyone'
              : profilePhotoVisibility === 'My contacts'
              ? 'contacts'
              : 'nobody',
          stories: 'everyone',
          disappearingDefault:
            disappearingTimer === '24 Hours'
              ? 86400
              : disappearingTimer === '7 Days'
              ? 604800
              : disappearingTimer === '30 Days'
              ? 2592000
              : 0,
        },
        mediaAutoDownload: {
          photos: downloadPhotos,
          audio: downloadAudio,
          videos: downloadVideos,
          documents: downloadDocuments,
        },
      })
      .catch(() => {});
  }, [
    lastSeenVisibility,
    profilePhotoVisibility,
    aboutVisibility,
    groupsVisibility,
    readReceipts,
    typingIndicators,
    disappearingTimer,
    blockUnknown,
    protectIpCalls,
    appLockEnabled,
    appLockPin,
    selectedWallpaper,
    addDoodles,
    mediaQuality,
    fontSize,
    bubbleDensity,
    timeFormat,
    defaultVoiceSpeed,
    autoTranscribeVoice,
    highContrast,
    reducedMotion,
    downloadPhotos,
    downloadAudio,
    downloadVideos,
    downloadDocuments,
    spellCheck,
    replaceWithEmoji,
    enterIsSend,
    notifyMessages,
    notifyGroups,
    notifyCalls,
    showPreviews,
    soundOutgoing,
    backgroundSync,
    noiseSuppression,
    echoCancellation,
    autoGainControl,
    joinBeta,
    theme,
    accent,
  ]);

  // Fetch storage stats, active devices, and blocked users
  const refreshSystemMetadata = async () => {
    try {
      const [statsRes, devRes, blockedRes] = await Promise.all([
        api.getSqlStats().catch(() => null),
        api.getDevices().catch(() => []),
        api.getBlockedUsers().catch(() => []),
      ]);
      if (statsRes) setSqlStats(statsRes);
      setDevices(devRes || []);
      setBlockedUsers(blockedRes || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    refreshSystemMetadata();
  }, [subView, conversations.length]);

  // Cleanup hardware test streams on unmount
  useEffect(() => {
    return () => {
      stopHardwareTests();
    };
  }, []);

  const stopHardwareTests = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsTestingMic(false);
    setIsTestingCam(false);
    setMicLevel(0);
  };

  const handleToggleMicTest = async () => {
    if (isTestingMic) {
      stopHardwareTests();
      return;
    }
    stopHardwareTests();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression, echoCancellation, autoGainControl },
      });
      mediaStreamRef.current = stream;
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      setIsTestingMic(true);

      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      showNotice('Microphone permission was denied or no audio input found.');
    }
  };

  const handleToggleCamTest = async () => {
    if (isTestingCam) {
      stopHardwareTests();
      return;
    }
    stopHardwareTests();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      mediaStreamRef.current = stream;
      setIsTestingCam(true);
      setTimeout(() => {
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
        }
      }, 60);
    } catch {
      showNotice('Camera permission was denied or no webcam found.');
    }
  };

  const handleSyncCloudNow = async () => {
    setIsSyncingCloud(true);
    try {
      await Promise.all([api.getContacts(), api.getConversations(), refreshSystemMetadata()]);
      showNotice('Synced contacts, conversations, and messages with Firebase Cloud!');
    } catch {
      showNotice('Sync completed with local cache.');
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleCopyPhone = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(phoneText);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  };

  const handleSaveProfile = async (field: 'name' | 'about' | 'phone') => {
    try {
      const updated = await api.updateProfile({
        displayName: displayName.trim(),
        bio: aboutText.trim(),
        avatarUrl,
        phone: phoneText.trim(),
      });
      onUpdateUser(updated);
      showNotice('Profile saved and synced to directory.');
    } catch {
      onUpdateUser({
        ...currentUser,
        displayName: displayName.trim(),
        bio: aboutText.trim(),
        avatarUrl,
        phone: phoneText.trim(),
      });
      showNotice('Profile updated.');
    }
    if (field === 'name') setIsEditingName(false);
    if (field === 'about') setIsEditingAbout(false);
    if (field === 'phone') setIsEditingPhone(false);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => {
        const result = ev.target?.result as string;
        setAvatarUrl(result);
        api.updateProfile({ avatarUrl: result }).catch(() => {});
        onUpdateUser({ ...currentUser, avatarUrl: result });
        showNotice('Profile photo updated!');
      };
      reader.readAsDataURL(file);
    }
  };

  const cycleVisibility = (
    current: 'Everyone' | 'My contacts' | 'Nobody',
    setter: (v: 'Everyone' | 'My contacts' | 'Nobody') => void
  ) => {
    const order: ('Everyone' | 'My contacts' | 'Nobody')[] = ['Everyone', 'My contacts', 'Nobody'];
    const next = order[(order.indexOf(current) + 1) % order.length];
    setter(next);
  };

  const cycleDisappearing = () => {
    const order: ('Off' | '24 Hours' | '7 Days' | '30 Days')[] = ['Off', '24 Hours', '7 Days', '30 Days'];
    const next = order[(order.indexOf(disappearingTimer) + 1) % order.length];
    setDisappearingTimer(next);
  };

  const menuItems = [
    {
      id: 'profile' as SubView,
      icon: UserIcon,
      title: 'Profile',
      subtitle: 'Display name, bio, phone, avatar',
    },
    {
      id: 'chats' as SubView,
      icon: MessageSquare,
      title: 'Chats & Messaging',
      subtitle: 'Delete chats, font size, voice notes, enter key',
    },
    {
      id: 'appearance' as SubView,
      icon: Palette,
      title: 'Appearance & Themes',
      subtitle: 'Dark/light mode, accent color, chat wallpaper',
    },
    {
      id: 'privacy' as SubView,
      icon: Lock,
      title: 'Privacy & Security',
      subtitle: 'Read receipts, disappearing timer, app PIN lock',
    },
    {
      id: 'audio_video' as SubView,
      icon: Volume2,
      title: 'Voice, Video & Audio',
      subtitle: 'Mic & webcam test, ringtone, noise suppression',
    },
    {
      id: 'notifications' as SubView,
      icon: Bell,
      title: 'Notifications & Sounds',
      subtitle: 'Message alerts, call ringtones, background sync',
    },
    {
      id: 'storage' as SubView,
      icon: Database,
      title: 'Cloud & Storage',
      subtitle: 'Firebase sync, SQLite stats, export backup, reset',
    },
    {
      id: 'account' as SubView,
      icon: Key,
      title: 'Account & Linked Devices',
      subtitle: 'Active sessions, security alerts, export account',
    },
    {
      id: 'help' as SubView,
      icon: HelpCircle,
      title: 'Help & Shortcuts',
      subtitle: 'Keyboard shortcuts, support, version info',
    },
  ];

  const filteredMenuItems = menuItems.filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q);
  });

  return (
    <div className="flex-1 flex h-full overflow-hidden select-none bg-[#050505] text-white">
      {/* LEFT COLUMN: Settings Navigation & SubViews */}
      <aside className="w-full md:w-[380px] lg:w-[420px] flex flex-col h-full bg-[#050505] border-r border-white/15 relative shrink-0">
        {statusBanner && (
          <div className="px-4 py-2 bg-white text-black text-xs font-bold flex items-center justify-between shrink-0">
            <span className="truncate">{statusBanner}</span>
            <button onClick={() => setStatusBanner(null)} className="ml-2 underline cursor-pointer">
              OK
            </button>
          </div>
        )}

        {/* VIEW 1: MAIN SETTINGS MENU */}
        {subView === 'main' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar pb-24">
            {/* Top Bar with Name & Back to Chats */}
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={onSwitchToChats}
                  title="Back to Chats"
                  className="p-1.5 -ml-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h1 className="text-base font-bold text-white tracking-wide truncate">
                  Settings & Preferences
                </h1>
              </div>
              <button
                onClick={onSwitchToChats}
                className="px-3 py-1 rounded-lg bg-white text-black text-xs font-bold hover:bg-neutral-200 transition cursor-pointer"
              >
                Done
              </button>
            </div>

            {/* Search Bar */}
            <div className="px-4 py-2">
              <div className="w-full flex items-center px-3.5 py-2 rounded-xl bg-[#121212] border border-white/10 focus-within:border-white transition">
                <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search settings (e.g. delete, theme, privacy, audio)..."
                  className="w-full bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="p-0.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Profile Summary Card */}
            <div className="px-4 py-3">
              <div
                onClick={() => setSubView('profile')}
                className="p-3.5 rounded-2xl bg-[#111111] border border-white/10 hover:border-white/30 transition flex items-center gap-3.5 cursor-pointer group"
              >
                <div className="relative w-14 h-14 rounded-full overflow-hidden ring-2 ring-white/20 shrink-0">
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{displayName}</div>
                  <div className="text-xs text-neutral-400 font-mono truncate">@{currentUser.username}</div>
                  <div className="text-[11px] text-neutral-300 truncate mt-0.5">
                    {aboutText || 'Member of the encrypted communications mesh.'}
                  </div>
                </div>
                <Pencil className="w-4 h-4 text-neutral-400 group-hover:text-white shrink-0" />
              </div>
            </div>

            {/* Settings Menu List */}
            <div className="px-2 space-y-0.5">
              {filteredMenuItems.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSubView(item.id)}
                    className="w-full p-3 rounded-xl hover:bg-[#121212] transition flex items-center gap-4 text-left cursor-pointer group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-[#111111] border border-white/10 flex items-center justify-center text-slate-300 group-hover:text-white group-hover:border-white/30 transition">
                      <Icon className="w-4 h-4 stroke-[1.75]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white">{item.title}</div>
                      <div className="text-xs text-slate-400 truncate">{item.subtitle}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-neutral-500 group-hover:text-white shrink-0" />
                  </button>
                );
              })}

              {/* Keyboard shortcuts modal trigger */}
              <button
                onClick={() => setIsShortcutsModalOpen(true)}
                className="w-full p-3 rounded-xl hover:bg-[#121212] transition flex items-center gap-4 text-left cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-xl bg-[#111111] border border-white/10 flex items-center justify-center text-slate-300 group-hover:text-white">
                  <Keyboard className="w-4 h-4 stroke-[1.75]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Keyboard shortcuts</div>
                  <div className="text-xs text-slate-400 truncate">38 hotkeys for power users</div>
                </div>
                <ChevronRight className="w-4 h-4 text-neutral-500 group-hover:text-white shrink-0" />
              </button>

              {/* Log out */}
              <div className="pt-2">
                <button
                  onClick={() => setIsLogoutModalOpen(true)}
                  className="w-full p-3 rounded-xl hover:bg-white/10 text-white transition flex items-center gap-4 text-left cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white">
                    <LogOut className="w-4 h-4 stroke-[1.75]" />
                  </div>
                  <div className="text-sm font-bold">Log out</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: EDIT PROFILE */}
        {subView === 'profile' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('main')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Edit Profile</h2>
            </div>

            <div className="p-6 space-y-6">
              {/* Profile Avatar with Camera Overlay */}
              <div className="flex flex-col items-center justify-center">
                <label className="relative w-32 h-32 rounded-full overflow-hidden cursor-pointer group shadow-2xl ring-2 ring-white/30 hover:ring-white transition">
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-full h-full object-cover group-hover:scale-105 transition"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition">
                    <Camera className="w-7 h-7 mb-1" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                      Change Photo
                    </span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Section: Display Name */}
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2">Display Name</div>
                <div className="p-3.5 rounded-xl bg-[#121212] border border-white/10 flex items-center justify-between">
                  <div className="flex-1 mr-2">
                    {isEditingName ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={displayName}
                          onChange={e => setDisplayName(e.target.value)}
                          autoFocus
                          className="w-full bg-transparent text-sm text-white focus:outline-none border-b border-white pb-1"
                        />
                        <button
                          onClick={() => handleSaveProfile('name')}
                          className="p-1.5 rounded-lg bg-white text-black font-bold text-xs cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="text-sm font-medium text-white">{displayName}</div>
                    )}
                  </div>
                  {!isEditingName && (
                    <button
                      onClick={() => setIsEditingName(true)}
                      className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Section: About / Bio */}
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2">About & Status Bio</div>
                <div className="p-3.5 rounded-xl bg-[#121212] border border-white/10 flex items-center justify-between">
                  <div className="flex-1 mr-2">
                    {isEditingAbout ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={aboutText}
                          onChange={e => setAboutText(e.target.value)}
                          autoFocus
                          className="w-full bg-transparent text-sm text-white focus:outline-none border-b border-white pb-1"
                        />
                        <button
                          onClick={() => handleSaveProfile('about')}
                          className="p-1.5 rounded-lg bg-white text-black font-bold text-xs cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="text-sm font-medium text-white">
                        {aboutText || 'Available on Aether Encrypted Mesh'}
                      </div>
                    )}
                  </div>
                  {!isEditingAbout && (
                    <button
                      onClick={() => setIsEditingAbout(true)}
                      className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Section: Phone */}
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2">Phone Number</div>
                <div className="p-3.5 rounded-xl bg-[#121212] border border-white/10 flex items-center justify-between">
                  <div className="flex-1 mr-2">
                    {isEditingPhone ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={phoneText}
                          onChange={e => setPhoneText(e.target.value)}
                          autoFocus
                          className="w-full bg-transparent text-sm text-white focus:outline-none border-b border-white pb-1"
                        />
                        <button
                          onClick={() => handleSaveProfile('phone')}
                          className="p-1.5 rounded-lg bg-white text-black font-bold text-xs cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="text-sm font-medium text-white tracking-wide">{phoneText}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!isEditingPhone && (
                      <button
                        onClick={() => setIsEditingPhone(true)}
                        className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={handleCopyPhone}
                      title="Copy phone number"
                      className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                    >
                      {copiedPhone ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: CHATS & MESSAGING (INCLUDES DELETABLE CHATS MANAGER) */}
        {subView === 'chats' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar pb-16">
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('main')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Chats & Messaging</h2>
            </div>

            <div className="p-4 space-y-6">
              {/* Font Size & Bubble Density */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-neutral-400 px-1">
                  Typography & Layout
                </div>

                <div className="p-3 rounded-xl bg-[#111111] border border-white/10">
                  <div className="text-xs font-semibold text-white mb-2">Message Font Size</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['small', 'medium', 'large'] as const).map(sz => (
                      <button
                        key={sz}
                        onClick={() => setFontSize(sz)}
                        className={`py-1.5 rounded-lg text-xs font-bold capitalize transition cursor-pointer ${
                          fontSize === sz
                            ? 'bg-white text-black'
                            : 'bg-black text-neutral-400 border border-white/10 hover:text-white'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#111111] border border-white/10">
                  <div className="text-xs font-semibold text-white mb-2">Chat Bubble Density</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['comfortable', 'compact'] as const).map(d => (
                      <button
                        key={d}
                        onClick={() => setBubbleDensity(d)}
                        className={`py-1.5 rounded-lg text-xs font-bold capitalize transition cursor-pointer ${
                          bubbleDensity === d
                            ? 'bg-white text-black'
                            : 'bg-black text-neutral-400 border border-white/10 hover:text-white'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#111111] border border-white/10">
                  <div className="text-xs font-semibold text-white mb-2">Timestamp Format</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: '12h' as const, label: '12-Hour (2:30 PM)' },
                      { id: '24h' as const, label: '24-Hour (14:30)' },
                    ].map(tf => (
                      <button
                        key={tf.id}
                        onClick={() => setTimeFormat(tf.id)}
                        className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          timeFormat === tf.id
                            ? 'bg-white text-black'
                            : 'bg-black text-neutral-400 border border-white/10 hover:text-white'
                        }`}
                      >
                        {tf.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Voice Notes & Composer Behavior */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-neutral-400 px-1">
                  Composer & Voice Notes
                </div>

                <div className="p-3 rounded-xl bg-[#111111] border border-white/10">
                  <div className="text-xs font-semibold text-white mb-2">
                    Default Voice Note Playback Speed
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['1x', '1.25x', '1.5x', '2x'] as const).map(spd => (
                      <button
                        key={spd}
                        onClick={() => setDefaultVoiceSpeed(spd)}
                        className={`py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          defaultVoiceSpeed === spd
                            ? 'bg-white text-black'
                            : 'bg-black text-neutral-400 border border-white/10 hover:text-white'
                        }`}
                      >
                        {spd}
                      </button>
                    ))}
                  </div>
                </div>

                {[
                  {
                    label: 'Auto-transcribe voice messages',
                    desc: 'Automatically convert voice notes into readable text',
                    state: autoTranscribeVoice,
                    set: setAutoTranscribeVoice,
                  },
                  {
                    label: 'Enter key sends message',
                    desc: 'Press Enter to send (Shift+Enter for new line)',
                    state: enterIsSend,
                    set: setEnterIsSend,
                  },
                  {
                    label: 'Spell check while typing',
                    desc: 'Highlight typos in the message composer',
                    state: spellCheck,
                    set: setSpellCheck,
                  },
                  {
                    label: 'Auto-replace text emoticons with emoji',
                    desc: 'Convert :) and <3 into emojis automatically',
                    state: replaceWithEmoji,
                    set: setReplaceWithEmoji,
                  },
                ].map(item => (
                  <div
                    key={item.label}
                    className="p-3 rounded-xl bg-[#111111] border border-white/10 flex items-center justify-between"
                  >
                    <div className="pr-3">
                      <div className="text-xs font-bold text-white">{item.label}</div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">{item.desc}</div>
                    </div>
                    <button
                      onClick={() => item.set(!item.state)}
                      className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 cursor-pointer ${
                        item.state ? 'bg-white' : 'bg-neutral-800'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full transition transform ${
                          item.state ? 'translate-x-5 bg-black' : 'translate-x-0 bg-neutral-400'
                        }`}
                      />
                    </button>
                  </div>
                ))}

                <div
                  onClick={() => setSubView('media_quality')}
                  className="p-3 rounded-xl bg-[#111111] border border-white/10 hover:border-white/30 flex items-center justify-between cursor-pointer transition"
                >
                  <div>
                    <div className="text-xs font-bold text-white">Media upload quality</div>
                    <div className="text-[11px] text-neutral-400 uppercase">{mediaQuality} quality</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-400" />
                </div>

                <div
                  onClick={() => setSubView('media_download')}
                  className="p-3 rounded-xl bg-[#111111] border border-white/10 hover:border-white/30 flex items-center justify-between cursor-pointer transition"
                >
                  <div>
                    <div className="text-xs font-bold text-white">Media auto-download</div>
                    <div className="text-[11px] text-neutral-400">Configure photos, audio, videos</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-400" />
                </div>
              </div>

              {/* Manage & Delete Individual or All Conversations */}
              <div className="space-y-2.5 pt-2 border-t border-white/10">
                <div className="text-xs font-bold uppercase tracking-wider text-neutral-400 px-1">
                  Manage & Delete Conversations ({conversations.length})
                </div>

                {conversations.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[#111111] border border-white/10 text-xs text-neutral-400 text-center">
                    No active conversations to delete.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {conversations.map(c => (
                      <div
                        key={c.id}
                        className="p-2.5 rounded-xl bg-[#111111] border border-white/10 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{c.name}</div>
                          <div className="text-[10px] text-neutral-400 capitalize">{c.type} chat</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {onClearConversation && (
                            <button
                              onClick={() => {
                                onClearConversation(c.id);
                                showNotice(`Cleared messages in "${c.name}"`);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-semibold text-white transition cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                          {onDeleteConversation &&
                            (confirmDeleteConvId === c.id ? (
                              <button
                                onClick={() => {
                                  setConfirmDeleteConvId(null);
                                  onDeleteConversation(c.id);
                                  showNotice(`Deleted chat "${c.name}"`);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-white text-black text-[10px] font-bold hover:bg-neutral-200 transition cursor-pointer"
                              >
                                Confirm
                              </button>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteConvId(c.id)}
                                className="p-1.5 rounded-lg bg-white/10 hover:bg-white hover:text-black text-neutral-300 transition cursor-pointer"
                                title="Delete Conversation"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Bulk Clear / Bulk Delete */}
                <div className="grid grid-cols-1 gap-2 pt-2">
                  {confirmAction === 'clear_all_chats' ? (
                    <div className="p-3 rounded-xl bg-white/10 border border-white/30 flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Clear all messages?</span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            setConfirmAction(null);
                            onClearAllConversations?.();
                            showNotice('All chat histories cleared.');
                          }}
                          className="px-3 py-1 rounded-lg bg-white text-black text-xs font-bold cursor-pointer"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmAction(null)}
                          className="px-2.5 py-1 rounded-lg bg-white/10 text-xs text-white cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmAction('clear_all_chats')}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#111111] border border-white/15 hover:border-white text-xs font-semibold text-white flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Clear All Messages Across Chats</span>
                    </button>
                  )}

                  {confirmAction === 'delete_all_chats' ? (
                    <div className="p-3 rounded-xl bg-white/15 border border-white/40 flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Delete every chat?</span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            setConfirmAction(null);
                            onDeleteAllConversations?.();
                            showNotice('All conversations deleted.');
                          }}
                          className="px-3 py-1 rounded-lg bg-white text-black text-xs font-bold cursor-pointer"
                        >
                          Delete All
                        </button>
                        <button
                          onClick={() => setConfirmAction(null)}
                          className="px-2.5 py-1 rounded-lg bg-white/10 text-xs text-white cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmAction('delete_all_chats')}
                      className="w-full py-2.5 px-4 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete All Conversations</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: APPEARANCE & THEMES */}
        {subView === 'appearance' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar pb-16">
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('main')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Appearance & Themes</h2>
            </div>

            <div className="p-4 space-y-5">
              {/* Theme Mode */}
              <div className="p-3.5 rounded-xl bg-[#111111] border border-white/10">
                <div className="text-xs font-bold text-white mb-2.5">Interface Theme Mode</div>
                <div className="grid grid-cols-3 gap-2">
                  {(['dark', 'light', 'system'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => onUpdateTheme(t, accent)}
                      className={`py-2 rounded-lg text-xs font-bold capitalize transition cursor-pointer ${
                        theme === t
                          ? 'bg-white text-black'
                          : 'bg-black text-neutral-400 border border-white/10 hover:text-white'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Accent Theme */}
              <div className="p-3.5 rounded-xl bg-[#111111] border border-white/10">
                <div className="text-xs font-bold text-white mb-2.5">Accent Theme Palette</div>
                <div className="grid grid-cols-2 gap-2">
                  {ACCENT_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => onUpdateTheme(theme, opt.id)}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition cursor-pointer ${
                        accent === opt.id
                          ? 'bg-white/15 border-white text-white'
                          : 'bg-black border-white/10 text-neutral-300 hover:border-white/30'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full shrink-0 border border-white/30"
                        style={{ backgroundColor: opt.color }}
                      />
                      <span className="text-xs font-semibold truncate">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat Wallpaper Picker Link */}
              <div
                onClick={() => setSubView('wallpaper')}
                className="p-3.5 rounded-xl bg-[#111111] border border-white/10 hover:border-white/30 flex items-center justify-between cursor-pointer transition"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg border border-white/20"
                    style={{ backgroundColor: selectedWallpaper.color }}
                  />
                  <div>
                    <div className="text-xs font-bold text-white">Chat Background Wallpaper</div>
                    <div className="text-[11px] text-neutral-400">{selectedWallpaper.name}</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-neutral-400" />
              </div>

              {/* Accessibility Toggles */}
              {[
                {
                  label: 'High-Contrast Monochrome Mode',
                  desc: 'Increase border and text contrast across all panels',
                  state: highContrast,
                  set: setHighContrast,
                },
                {
                  label: 'Reduced Motion & Animations',
                  desc: 'Minimize transitions and subtle movement effects',
                  state: reducedMotion,
                  set: setReducedMotion,
                },
              ].map(item => (
                <div
                  key={item.label}
                  className="p-3.5 rounded-xl bg-[#111111] border border-white/10 flex items-center justify-between"
                >
                  <div className="pr-3">
                    <div className="text-xs font-bold text-white">{item.label}</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">{item.desc}</div>
                  </div>
                  <button
                    onClick={() => item.set(!item.state)}
                    className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 cursor-pointer ${
                      item.state ? 'bg-white' : 'bg-neutral-800'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full transition transform ${
                        item.state ? 'translate-x-5 bg-black' : 'translate-x-0 bg-neutral-400'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 5: PRIVACY & SECURITY */}
        {subView === 'privacy' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar pb-16">
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('main')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Privacy & Security</h2>
            </div>

            <div className="p-4 space-y-5">
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-neutral-400 px-1">
                  Visibility Controls (Click to Change)
                </div>

                {[
                  {
                    title: 'Last seen and online status',
                    val: lastSeenVisibility,
                    onClick: () => cycleVisibility(lastSeenVisibility, setLastSeenVisibility),
                  },
                  {
                    title: 'Profile picture visibility',
                    val: profilePhotoVisibility,
                    onClick: () => cycleVisibility(profilePhotoVisibility, setProfilePhotoVisibility),
                  },
                  {
                    title: 'About & bio visibility',
                    val: aboutVisibility,
                    onClick: () => cycleVisibility(aboutVisibility, setAboutVisibility),
                  },
                  {
                    title: 'Who can add me to groups',
                    val: groupsVisibility,
                    onClick: () =>
                      setGroupsVisibility(groupsVisibility === 'Everyone' ? 'My contacts' : 'Everyone'),
                  },
                  {
                    title: 'Default disappearing messages timer',
                    val: disappearingTimer,
                    onClick: cycleDisappearing,
                  },
                ].map(item => (
                  <button
                    key={item.title}
                    onClick={item.onClick}
                    className="w-full p-3 rounded-xl bg-[#111111] border border-white/10 hover:border-white/30 flex items-center justify-between cursor-pointer transition text-left"
                  >
                    <span className="text-xs font-bold text-white">{item.title}</span>
                    <span className="px-2.5 py-1 rounded-lg bg-white/10 text-[11px] font-semibold text-white">
                      {item.val}
                    </span>
                  </button>
                ))}
              </div>

              {/* Privacy Toggles */}
              <div className="space-y-2">
                {[
                  {
                    label: 'Read receipts',
                    desc: 'Send and receive double-check read indicators',
                    state: readReceipts,
                    set: setReadReceipts,
                  },
                  {
                    label: 'Typing indicator broadcast',
                    desc: 'Show contacts when you are actively typing a reply',
                    state: typingIndicators,
                    set: setTypingIndicators,
                  },
                  {
                    label: 'Block high-volume unknown messages',
                    desc: 'Automatically filter spam from non-contacts',
                    state: blockUnknown,
                    set: setBlockUnknown,
                  },
                  {
                    label: 'Relay & protect IP address in calls',
                    desc: 'Mask peer-to-peer IP address during WebRTC calls',
                    state: protectIpCalls,
                    set: setProtectIpCalls,
                  },
                ].map(item => (
                  <div
                    key={item.label}
                    className="p-3 rounded-xl bg-[#111111] border border-white/10 flex items-center justify-between"
                  >
                    <div className="pr-3">
                      <div className="text-xs font-bold text-white">{item.label}</div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">{item.desc}</div>
                    </div>
                    <button
                      onClick={() => item.set(!item.state)}
                      className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 cursor-pointer ${
                        item.state ? 'bg-white' : 'bg-neutral-800'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full transition transform ${
                          item.state ? 'translate-x-5 bg-black' : 'translate-x-0 bg-neutral-400'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>

              {/* App Passcode Lock */}
              <div className="p-3.5 rounded-xl bg-[#111111] border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">App Screen Lock Passcode</div>
                    <div className="text-[11px] text-neutral-400">
                      {appLockEnabled && appLockPin
                        ? 'Passcode PIN is active'
                        : 'Require a 4-digit PIN to unlock'}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!appLockEnabled) {
                        setIsSettingPin(true);
                      } else {
                        setAppLockEnabled(false);
                        showNotice('Screen lock disabled.');
                      }
                    }}
                    className="px-3 py-1 rounded-lg bg-white text-black text-xs font-bold cursor-pointer"
                  >
                    {appLockEnabled ? 'Disable' : 'Configure PIN'}
                  </button>
                </div>

                {isSettingPin && (
                  <div className="pt-2 flex items-center gap-2">
                    <input
                      type="password"
                      maxLength={4}
                      value={appLockPin}
                      onChange={e => setAppLockPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="4-digit PIN"
                      className="flex-1 bg-black border border-white/20 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                    />
                    <button
                      onClick={() => {
                        if (appLockPin.length === 4) {
                          setAppLockEnabled(true);
                          setIsSettingPin(false);
                          showNotice('4-digit App Lock PIN activated!');
                        } else {
                          showNotice('Please enter 4 digits.');
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-bold cursor-pointer"
                    >
                      Save PIN
                    </button>
                  </div>
                )}
              </div>

              {/* Blocked Contacts */}
              <div className="p-3.5 rounded-xl bg-[#111111] border border-white/10 space-y-2">
                <div className="text-xs font-bold text-white">
                  Blocked Contacts ({blockedUsers.length})
                </div>
                {blockedUsers.length === 0 ? (
                  <div className="text-[11px] text-neutral-400">No blocked users.</div>
                ) : (
                  <div className="space-y-1.5">
                    {blockedUsers.map(b => (
                      <div key={b.id} className="flex items-center justify-between text-xs py-1">
                        <span className="text-white">{b.blockedUser?.displayName || b.blockedUserId}</span>
                        <button
                          onClick={async () => {
                            await api.unblockUser(b.blockedUserId);
                            refreshSystemMetadata();
                            showNotice('Contact unblocked.');
                          }}
                          className="px-2 py-0.5 rounded bg-white text-black text-[10px] font-bold cursor-pointer"
                        >
                          Unblock
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 6: VOICE, VIDEO & AUDIO HARDWARE */}
        {subView === 'audio_video' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar pb-16">
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => {
                  stopHardwareTests();
                  setSubView('main');
                }}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Voice, Video & Audio</h2>
            </div>

            <div className="p-4 space-y-4">
              {/* Live Microphone Tester */}
              <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Mic className="w-4 h-4 text-white" />
                    <div>
                      <div className="text-xs font-bold text-white">Microphone Input Level</div>
                      <div className="text-[11px] text-neutral-400">
                        {isTestingMic ? 'Speak now to test input gain' : 'Test your microphone'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleToggleMicTest}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      isTestingMic ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {isTestingMic ? 'Stop Mic Test' : 'Test Mic'}
                  </button>
                </div>
                <div className="w-full h-2.5 rounded-full bg-black border border-white/10 overflow-hidden">
                  <div
                    className="h-full bg-white transition-all duration-75"
                    style={{ width: `${micLevel}%` }}
                  />
                </div>
              </div>

              {/* Live Webcam Preview */}
              <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Video className="w-4 h-4 text-white" />
                    <div>
                      <div className="text-xs font-bold text-white">Camera Video Preview</div>
                      <div className="text-[11px] text-neutral-400">Verify webcam before video calls</div>
                    </div>
                  </div>
                  <button
                    onClick={handleToggleCamTest}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      isTestingCam ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {isTestingCam ? 'Stop Camera' : 'Test Camera'}
                  </button>
                </div>
                {isTestingCam && (
                  <div className="w-full aspect-video rounded-xl overflow-hidden bg-black border border-white/15">
                    <video
                      ref={videoPreviewRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>

              {/* Sound Effects & Ringtone Tester */}
              <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-2.5">
                <div className="text-xs font-bold text-white">Sound & Ringtone Synthesizer</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      audioEffects.playCallConnected();
                      showNotice('Played call connected chime.');
                    }}
                    className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white hover:text-black text-xs font-semibold text-white transition cursor-pointer"
                  >
                    Test Call Chime
                  </button>
                  <button
                    onClick={() => {
                      audioEffects.playMessageSent();
                      showNotice('Played outgoing message tone.');
                    }}
                    className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white hover:text-black text-xs font-semibold text-white transition cursor-pointer"
                  >
                    Test Send Pop
                  </button>
                </div>
              </div>

              {/* Audio Processing Toggles */}
              {[
                {
                  label: 'AI Noise Suppression',
                  desc: 'Filter background keyboard and room noise on calls',
                  state: noiseSuppression,
                  set: setNoiseSuppression,
                },
                {
                  label: 'Acoustic Echo Cancellation',
                  desc: 'Prevent speaker feedback during voice & video calls',
                  state: echoCancellation,
                  set: setEchoCancellation,
                },
                {
                  label: 'Automatic Gain Control (AGC)',
                  desc: 'Normalize microphone volume automatically',
                  state: autoGainControl,
                  set: setAutoGainControl,
                },
              ].map(item => (
                <div
                  key={item.label}
                  className="p-3 rounded-xl bg-[#111111] border border-white/10 flex items-center justify-between"
                >
                  <div className="pr-3">
                    <div className="text-xs font-bold text-white">{item.label}</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">{item.desc}</div>
                  </div>
                  <button
                    onClick={() => item.set(!item.state)}
                    className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 cursor-pointer ${
                      item.state ? 'bg-white' : 'bg-neutral-800'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full transition transform ${
                        item.state ? 'translate-x-5 bg-black' : 'translate-x-0 bg-neutral-400'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 7: CLOUD & STORAGE */}
        {subView === 'storage' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar pb-16">
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('main')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Cloud & Storage</h2>
            </div>

            <div className="p-4 space-y-4">
              <div className="p-4 rounded-2xl bg-[#111111] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">Firebase Firestore + SQLite Engine</div>
                    <div className="text-[11px] text-neutral-400">
                      Dual-layer persistence for directory, chats & messages
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-white text-black text-[10px] font-bold">
                    ACTIVE
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="p-2.5 rounded-xl bg-black border border-white/10 text-center">
                    <div className="text-sm font-bold text-white">
                      {sqlStats?.stats?.users ?? '—'}
                    </div>
                    <div className="text-[10px] text-neutral-400">Users</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black border border-white/10 text-center">
                    <div className="text-sm font-bold text-white">
                      {conversations.length || sqlStats?.stats?.conversations || 0}
                    </div>
                    <div className="text-[10px] text-neutral-400">Chats</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black border border-white/10 text-center">
                    <div className="text-sm font-bold text-white">
                      {sqlStats?.stats?.messages ?? '—'}
                    </div>
                    <div className="text-[10px] text-neutral-400">Messages</div>
                  </div>
                </div>

                <button
                  onClick={handleSyncCloudNow}
                  disabled={isSyncingCloud}
                  className="w-full py-2.5 px-4 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
                  <span>{isSyncingCloud ? 'Syncing with Firebase Cloud...' : 'Sync Now with Firebase Cloud'}</span>
                </button>
              </div>

              <button
                onClick={() => {
                  api.exportUserData().catch(() => {});
                  showNotice('Exporting JSON archive...');
                }}
                className="w-full p-3.5 rounded-xl bg-[#111111] border border-white/10 hover:border-white/30 flex items-center justify-between text-left transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Download className="w-4 h-4 text-white" />
                  <div>
                    <div className="text-xs font-bold text-white">Export Chat Archive (.JSON)</div>
                    <div className="text-[11px] text-neutral-400">Download your profile, chats & messages</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-neutral-400" />
              </button>

              {confirmAction === 'reset_workspace' ? (
                <div className="p-3.5 rounded-xl bg-white/10 border border-white/30 space-y-2">
                  <div className="text-xs font-bold text-white">
                    Reset all local & server workspace data?
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        setConfirmAction(null);
                        await api.resetAllData().catch(() => {});
                        localStorage.removeItem('aether_client_db');
                        localStorage.removeItem('aether_deleted_convs');
                        onDeleteAllConversations?.();
                        showNotice('Workspace data reset.');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-bold cursor-pointer"
                    >
                      Confirm Reset
                    </button>
                    <button
                      onClick={() => setConfirmAction(null)}
                      className="px-3 py-1.5 rounded-lg bg-white/10 text-xs text-white cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmAction('reset_workspace')}
                  className="w-full p-3.5 rounded-xl bg-[#111111] border border-white/10 hover:border-white/30 flex items-center justify-between text-left transition cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Trash2 className="w-4 h-4 text-white" />
                    <div>
                      <div className="text-xs font-bold text-white">Factory Reset Workspace</div>
                      <div className="text-[11px] text-neutral-400">Wipe local cache and reset database</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-400" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* VIEW 8: ACCOUNT & LINKED DEVICES */}
        {subView === 'account' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar pb-16">
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('main')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Account & Linked Devices</h2>
            </div>

            <div className="p-4 space-y-4">
              <div className="p-3.5 rounded-xl bg-[#111111] border border-white/10 space-y-1">
                <div className="text-xs font-bold text-white">Account Identity</div>
                <div className="text-xs text-neutral-300 font-mono">@{currentUser.username}</div>
                <div className="text-[11px] text-neutral-400">{currentUser.email}</div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#111111] border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white">
                    Active Device Sessions ({devices.length || 1})
                  </div>
                  {devices.length > 1 && (
                    <button
                      onClick={async () => {
                        await api.terminateOtherDevices();
                        refreshSystemMetadata();
                        showNotice('Terminated all other sessions.');
                      }}
                      className="text-[11px] font-bold text-white underline cursor-pointer"
                    >
                      Terminate Others
                    </button>
                  )}
                </div>

                {(devices.length > 0
                  ? devices
                  : [
                      {
                        id: 'current',
                        userId: currentUser.id,
                        deviceName: 'Current Web Client',
                        browser: 'Browser Session',
                        os: 'Encrypted Mesh',
                        ip: '127.0.0.1',
                        lastActive: new Date().toISOString(),
                        isCurrent: true,
                      },
                    ]
                ).map(sess => (
                  <div
                    key={sess.id}
                    className="p-2.5 rounded-lg bg-black border border-white/10 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <Smartphone className="w-4 h-4 text-white" />
                      <div>
                        <div className="text-xs font-semibold text-white">{sess.deviceName}</div>
                        <div className="text-[10px] text-neutral-400">
                          {sess.browser} • {sess.isCurrent ? 'Active now' : 'Linked'}
                        </div>
                      </div>
                    </div>
                    {!sess.isCurrent && (
                      <button
                        onClick={async () => {
                          await api.terminateDevice(sess.id);
                          refreshSystemMetadata();
                        }}
                        className="px-2 py-1 rounded bg-white/10 text-[10px] text-white hover:bg-white hover:text-black cursor-pointer"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  api.exportUserData().catch(() => {});
                  showNotice('Account data report requested.');
                }}
                className="w-full p-3.5 rounded-xl bg-[#111111] border border-white/10 hover:border-white/30 transition flex items-center justify-between text-left cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <FileText className="w-4 h-4 text-white" />
                  <span className="text-xs font-bold text-white">Download Account Data Report</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>
        )}

        {/* VIEW 9: WALLPAPER PICKER */}
        {subView === 'wallpaper' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('appearance')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Set Chat Wallpaper</h2>
            </div>

            <div className="p-4 space-y-5">
              <label className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#121212] cursor-pointer">
                <input
                  type="checkbox"
                  checked={addDoodles}
                  onChange={e => setAddDoodles(e.target.checked)}
                  className="w-4 h-4 rounded text-white accent-white"
                />
                <span className="text-xs text-slate-200 font-medium">Add subtle background pattern</span>
              </label>

              <div className="grid grid-cols-4 gap-3.5">
                {WALLPAPER_COLORS.map(item => {
                  const isSelected = selectedWallpaper.id === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSelectedWallpaper(item);
                        showNotice(`Wallpaper set to ${item.name}`);
                      }}
                      title={item.name}
                      style={{ backgroundColor: item.color }}
                      className={`h-16 rounded-xl relative transition transform active:scale-95 cursor-pointer ${
                        isSelected
                          ? 'ring-2 ring-white scale-105 shadow-xl'
                          : 'ring-1 ring-white/10 hover:ring-white/40'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-5 h-5 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 10: MEDIA UPLOAD QUALITY */}
        {subView === 'media_quality' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('chats')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Media upload quality</h2>
            </div>

            <div className="p-4 space-y-3">
              <label
                onClick={() => setMediaQuality('standard')}
                className="flex items-start gap-3 p-3.5 rounded-xl bg-[#111111] border border-white/10 cursor-pointer transition"
              >
                <input
                  type="radio"
                  name="media_quality"
                  checked={mediaQuality === 'standard'}
                  onChange={() => setMediaQuality('standard')}
                  className="mt-1 accent-white"
                />
                <div>
                  <div className="text-sm font-medium text-white">Standard quality</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Uses less storage and is faster to send
                  </div>
                </div>
              </label>

              <label
                onClick={() => setMediaQuality('hd')}
                className="flex items-start gap-3 p-3.5 rounded-xl bg-[#111111] border border-white/10 cursor-pointer transition"
              >
                <input
                  type="radio"
                  name="media_quality"
                  checked={mediaQuality === 'hd'}
                  onChange={() => setMediaQuality('hd')}
                  className="mt-1 accent-white"
                />
                <div>
                  <div className="text-sm font-medium text-white">HD High-Definition quality</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Preserves full image resolution and clarity
                  </div>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* VIEW 11: MEDIA AUTO DOWNLOAD */}
        {subView === 'media_download' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('chats')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Media auto-download</h2>
            </div>

            <div className="p-4 space-y-2">
              {[
                { label: 'Photos', state: downloadPhotos, set: setDownloadPhotos },
                { label: 'Audio & Voice Notes', state: downloadAudio, set: setDownloadAudio },
                { label: 'Videos', state: downloadVideos, set: setDownloadVideos },
                { label: 'Documents', state: downloadDocuments, set: setDownloadDocuments },
              ].map(item => (
                <div
                  key={item.label}
                  className="p-3 rounded-xl bg-[#111111] border border-white/10 flex items-center justify-between cursor-pointer transition"
                >
                  <span className="text-xs font-bold text-white">{item.label}</span>
                  <button
                    onClick={() => item.set(!item.state)}
                    className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 cursor-pointer ${
                      item.state ? 'bg-white' : 'bg-neutral-800'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full transition transform ${
                        item.state ? 'translate-x-5 bg-black' : 'translate-x-0 bg-neutral-400'
                      }`}
                    />
                  </button>
                </div>
              ))}

              <button
                onClick={() => {
                  setDownloadPhotos(true);
                  setDownloadAudio(true);
                  setDownloadVideos(false);
                  setDownloadDocuments(true);
                  showNotice('Reset media auto-download defaults.');
                }}
                className="flex items-center gap-2 text-xs font-semibold text-white hover:underline transition py-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset auto-download settings</span>
              </button>
            </div>
          </div>
        )}

        {/* VIEW 12: NOTIFICATIONS */}
        {subView === 'notifications' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('main')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Notifications & Sounds</h2>
            </div>

            <div className="p-4 space-y-2.5">
              {[
                {
                  label: 'Direct Message Notifications',
                  desc: 'Show desktop & in-app alerts for new direct messages',
                  state: notifyMessages,
                  set: setNotifyMessages,
                },
                {
                  label: 'Group Chat Notifications',
                  desc: 'Alert when new messages arrive in group conversations',
                  state: notifyGroups,
                  set: setNotifyGroups,
                },
                {
                  label: 'Incoming Call Ringtone',
                  desc: 'Play acoustic ringtone for incoming voice and video calls',
                  state: notifyCalls,
                  set: setNotifyCalls,
                },
                {
                  label: 'Show Message Previews',
                  desc: 'Preview message text inside notification banners',
                  state: showPreviews,
                  set: setShowPreviews,
                },
                {
                  label: 'Outgoing & Incoming Sound Effects',
                  desc: 'Play subtle audio cues when sending or receiving messages',
                  state: soundOutgoing,
                  set: setSoundOutgoing,
                },
                {
                  label: 'Real-Time Background Sync',
                  desc: 'Keep WebSocket & Cloud Directory synced in the background',
                  state: backgroundSync,
                  set: setBackgroundSync,
                },
              ].map(item => (
                <div
                  key={item.label}
                  className="p-3 rounded-xl bg-[#111111] border border-white/10 flex items-center justify-between"
                >
                  <div className="pr-3">
                    <div className="text-xs font-bold text-white">{item.label}</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">{item.desc}</div>
                  </div>
                  <button
                    onClick={() => item.set(!item.state)}
                    className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 cursor-pointer ${
                      item.state ? 'bg-white' : 'bg-neutral-800'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full transition transform ${
                        item.state ? 'translate-x-5 bg-black' : 'translate-x-0 bg-neutral-400'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 13: HELP AND FEEDBACK */}
        {subView === 'help' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('main')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Help & Shortcuts</h2>
            </div>

            <div className="p-4 space-y-3">
              <button
                onClick={() => setIsShortcutsModalOpen(true)}
                className="w-full p-3.5 rounded-xl bg-[#111111] border border-white/10 hover:border-white/30 text-left transition flex items-center justify-between cursor-pointer"
              >
                <div>
                  <div className="text-xs font-bold text-white">Keyboard Shortcuts Reference</div>
                  <div className="text-[11px] text-slate-400">View all 38 keyboard shortcuts</div>
                </div>
                <Keyboard className="w-4 h-4 text-slate-400" />
              </button>

              <div className="p-3.5 rounded-xl bg-[#111111] border border-white/10 flex items-center justify-between">
                <div className="pr-3">
                  <div className="text-xs font-bold text-white">Join Experimental Beta</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Test upcoming encrypted mesh & calling features early
                  </div>
                </div>
                <button
                  onClick={() => setJoinBeta(!joinBeta)}
                  className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 cursor-pointer ${
                    joinBeta ? 'bg-white' : 'bg-neutral-800'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full transition transform ${
                      joinBeta ? 'translate-x-5 bg-black' : 'translate-x-0 bg-neutral-400'
                    }`}
                  />
                </button>
              </div>

              <div className="text-[11px] text-slate-500 text-center pt-6 font-mono">
                Aether Monochrome Mesh • v2.4.0
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* RIGHT COLUMN: Interactive Settings Control Center (Desktop) */}
      <main className="hidden md:flex flex-1 flex-col h-full overflow-y-auto p-8 bg-[#050505]">
        {subView === 'wallpaper' ? (
          <div
            className="w-full h-full rounded-2xl relative overflow-hidden flex flex-col items-center justify-center border border-white/10 shadow-2xl transition-colors duration-300"
            style={{ backgroundColor: selectedWallpaper.color }}
          >
            {addDoodles && (
              <div
                className="absolute inset-0 opacity-15 pointer-events-none"
                style={{
                  backgroundImage: `radial-gradient(circle at 25px 25px, rgba(255,255,255,0.4) 2%, transparent 0%), radial-gradient(circle at 75px 75px, rgba(255,255,255,0.4) 2%, transparent 0%)`,
                  backgroundSize: '100px 100px',
                }}
              />
            )}
            <div className="relative z-10 text-center">
              <span className="text-sm font-semibold text-slate-200 bg-black/50 px-4 py-2 rounded-full backdrop-blur-md border border-white/15">
                Live Wallpaper Preview: {selectedWallpaper.name}
              </span>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl w-full mx-auto space-y-6">
            {/* Header Banner */}
            <div className="flex items-center justify-between border-b border-white/15 pb-5">
              <div>
                <h2 className="text-xl font-bold text-white">Aether Control Center</h2>
                <p className="text-xs text-neutral-400 mt-1">
                  Customize your chat experience, manage conversations, test audio/video hardware, and control Firebase sync.
                </p>
              </div>
              <button
                onClick={onSwitchToChats}
                className="px-4 py-2 rounded-xl bg-white text-black text-xs font-bold hover:bg-neutral-200 transition cursor-pointer"
              >
                Back to Chats
              </button>
            </div>

            {/* Quick Category Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Card 1: Chat & Conversation Deletion Manager */}
              <div className="p-5 rounded-2xl bg-[#0f0f0f] border border-white/15 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Trash2 className="w-4 h-4 text-white" />
                    <h3 className="text-sm font-bold text-white">Manage & Delete Chats</h3>
                  </div>
                  <span className="text-[11px] font-mono text-neutral-400">
                    {conversations.length} active
                  </span>
                </div>

                {conversations.length === 0 ? (
                  <p className="text-xs text-neutral-400 py-3">
                    No active conversations. Start a chat from the sidebar or directory.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {conversations.map(conv => (
                      <div
                        key={conv.id}
                        className="p-2.5 rounded-xl bg-black border border-white/10 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{conv.name}</div>
                          <div className="text-[10px] text-neutral-400 capitalize">{conv.type}</div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {onClearConversation && (
                            <button
                              onClick={() => {
                                onClearConversation(conv.id);
                                showNotice(`Cleared messages in "${conv.name}"`);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-semibold text-white transition cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                          {onDeleteConversation && (
                            <button
                              onClick={() => {
                                onDeleteConversation(conv.id);
                                showNotice(`Deleted conversation "${conv.name}"`);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-white text-black hover:bg-neutral-200 text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setSubView('chats')}
                    className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition cursor-pointer"
                  >
                    More Chat Options
                  </button>
                  {conversations.length > 0 && onDeleteAllConversations && (
                    <button
                      onClick={() => {
                        onDeleteAllConversations();
                        showNotice('Deleted all conversations.');
                      }}
                      className="py-2 px-3 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-bold transition cursor-pointer"
                    >
                      Delete All
                    </button>
                  )}
                </div>
              </div>

              {/* Card 2: Appearance, Font Size & Theme Quick Controls */}
              <div className="p-5 rounded-2xl bg-[#0f0f0f] border border-white/15 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Sliders className="w-4 h-4 text-white" />
                    <h3 className="text-sm font-bold text-white">Display & Chat Preferences</h3>
                  </div>
                  <button
                    onClick={() => setSubView('appearance')}
                    className="text-[11px] text-neutral-400 hover:text-white underline cursor-pointer"
                  >
                    Wallpapers
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="text-[11px] text-neutral-400 mb-1.5">Theme Mode</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['dark', 'light', 'system'] as const).map(m => (
                        <button
                          key={m}
                          onClick={() => onUpdateTheme(m, accent)}
                          className={`py-1.5 rounded-lg text-xs font-bold capitalize transition cursor-pointer ${
                            theme === m
                              ? 'bg-white text-black'
                              : 'bg-black text-neutral-400 border border-white/10 hover:text-white'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-neutral-400 mb-1.5">Chat Text Size</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['small', 'medium', 'large'] as const).map(sz => (
                        <button
                          key={sz}
                          onClick={() => setFontSize(sz)}
                          className={`py-1.5 rounded-lg text-xs font-bold capitalize transition cursor-pointer ${
                            fontSize === sz
                              ? 'bg-white text-black'
                              : 'bg-black text-neutral-400 border border-white/10 hover:text-white'
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-white font-medium">Send message with Enter</span>
                    <button
                      onClick={() => setEnterIsSend(!enterIsSend)}
                      className={`w-10 h-5 rounded-full transition flex items-center px-0.5 cursor-pointer ${
                        enterIsSend ? 'bg-white' : 'bg-neutral-800'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full transition transform ${
                          enterIsSend ? 'translate-x-5 bg-black' : 'translate-x-0 bg-neutral-400'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Card 3: Privacy & Read Receipts Quick Controls */}
              <div className="p-5 rounded-2xl bg-[#0f0f0f] border border-white/15 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Eye className="w-4 h-4 text-white" />
                    <h3 className="text-sm font-bold text-white">Privacy & Security</h3>
                  </div>
                  <button
                    onClick={() => setSubView('privacy')}
                    className="text-[11px] text-neutral-400 hover:text-white underline cursor-pointer"
                  >
                    All Privacy
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-neutral-200">Read Receipts</span>
                    <button
                      onClick={() => setReadReceipts(!readReceipts)}
                      className={`w-10 h-5 rounded-full transition flex items-center px-0.5 cursor-pointer ${
                        readReceipts ? 'bg-white' : 'bg-neutral-800'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full transition transform ${
                          readReceipts ? 'translate-x-5 bg-black' : 'translate-x-0 bg-neutral-400'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-neutral-200">Typing Indicators</span>
                    <button
                      onClick={() => setTypingIndicators(!typingIndicators)}
                      className={`w-10 h-5 rounded-full transition flex items-center px-0.5 cursor-pointer ${
                        typingIndicators ? 'bg-white' : 'bg-neutral-800'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full transition transform ${
                          typingIndicators ? 'translate-x-5 bg-black' : 'translate-x-0 bg-neutral-400'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-neutral-200">Default Disappearing Timer</span>
                    <button
                      onClick={cycleDisappearing}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white cursor-pointer"
                    >
                      {disappearingTimer}
                    </button>
                  </div>
                </div>
              </div>

              {/* Card 4: Cloud Directory, Calls & Hardware */}
              <div className="p-5 rounded-2xl bg-[#0f0f0f] border border-white/15 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Database className="w-4 h-4 text-white" />
                    <h3 className="text-sm font-bold text-white">Cloud Sync & Calling</h3>
                  </div>
                  <button
                    onClick={() => setSubView('audio_video')}
                    className="text-[11px] text-neutral-400 hover:text-white underline cursor-pointer"
                  >
                    Test Mic/Cam
                  </button>
                </div>

                <p className="text-xs text-neutral-400 leading-relaxed">
                  Users, contacts, conversations, and messages are backed up to Firebase Firestore and local SQLite.
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={handleSyncCloudNow}
                    disabled={isSyncingCloud}
                    className="py-2 px-3 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
                    <span>{isSyncingCloud ? 'Syncing...' : 'Sync Cloud'}</span>
                  </button>
                  <button
                    onClick={onSwitchToCalls}
                    className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>Open Calls</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* THEME PICKER MODAL */}
      {selectedThemeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none">
          <div className="w-full max-w-xs rounded-2xl bg-[#0a0a0a] border border-white/10 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4">Theme</h3>
            <div className="space-y-3 mb-6">
              {[
                { id: 'light', label: 'Light' },
                { id: 'dark', label: 'Dark' },
                { id: 'system', label: 'System default' },
              ].map(opt => (
                <label
                  key={opt.id}
                  onClick={() => setPendingTheme(opt.id as any)}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="theme"
                    checked={pendingTheme === opt.id}
                    onChange={() => setPendingTheme(opt.id as any)}
                    className="accent-white w-4 h-4"
                  />
                  <span className="text-sm text-slate-200">{opt.label}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setSelectedThemeModalOpen(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white hover:bg-white/5 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onUpdateTheme(pendingTheme, accent);
                  setSelectedThemeModalOpen(false);
                }}
                className="px-4 py-1.5 rounded-lg bg-white text-black text-xs font-bold transition cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KEYBOARD SHORTCUTS MODAL */}
      {isShortcutsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none">
          <div className="w-full max-w-2xl rounded-2xl bg-[#0a0a0a] border border-white/10 p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-white">Keyboard shortcuts</h3>
              <button
                onClick={() => setIsShortcutsModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-6 custom-scrollbar text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                {[
                  { name: 'Command Palette', keys: ['Ctrl', 'K'] },
                  { name: 'Mark as unread', keys: ['Ctrl', 'Alt', 'Shift', 'U'] },
                  { name: 'Mute', keys: ['Ctrl', 'Alt', 'Shift', 'M'] },
                  { name: 'Archive chat', keys: ['Ctrl', 'Alt', 'E'] },
                  { name: 'Pin chat', keys: ['Ctrl', 'Alt', 'Shift', 'P'] },
                  { name: 'Search', keys: ['Ctrl', 'Alt', '/'] },
                  { name: 'Search chat', keys: ['Ctrl', 'Shift', 'F'] },
                  { name: 'New chat', keys: ['Ctrl', 'Alt', 'N'] },
                  { name: 'Next chat', keys: ['Ctrl', 'Alt', 'Tab'] },
                  { name: 'Previous chat', keys: ['Ctrl', 'Alt', 'Shift', 'Tab'] },
                  { name: 'Close chat', keys: ['Escape'] },
                  { name: 'New group', keys: ['Ctrl', 'Alt', 'Shift', 'N'] },
                  { name: 'Profile and About', keys: ['Ctrl', 'Alt', 'P'] },
                  { name: 'Settings', keys: ['Ctrl', 'Alt', ','] },
                  { name: 'Toggle camera in call', keys: ['Ctrl', 'Alt', 'V'] },
                  { name: 'Toggle mute in call', keys: ['Ctrl', 'Alt', 'M'] },
                ].map(item => (
                  <div key={item.name} className="flex items-center justify-between py-1">
                    <span className="text-slate-300 truncate mr-2">{item.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded bg-[#050505] border border-white/10 text-[10px] font-mono text-slate-300"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setIsShortcutsModalOpen(false)}
                className="px-6 py-2 rounded-xl bg-white text-black font-bold text-xs transition cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOGOUT CONFIRMATION MODAL */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
          <div className="w-full max-w-sm rounded-2xl bg-[#0a0a0a] border border-white/10 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Log out?</h3>
            <p className="text-xs text-slate-300 mb-6">
              Are you sure you want to log out of Aether Chat?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setIsLogoutModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setIsLogoutModalOpen(false);
                  onLogout();
                }}
                className="px-4 py-2 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-bold transition cursor-pointer"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
