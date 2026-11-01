import React, { useState } from 'react';
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
  Sparkles,
  RotateCcw,
  CheckSquare,
  Square,
  Key,
  Info,
  ExternalLink,
  Compass,
} from 'lucide-react';
import { User as UserType, AccentTheme } from '../../types';
import { api } from '../../lib/api';

export interface ProfileSettingsViewProps {
  currentUser: UserType;
  theme: 'dark' | 'light' | 'system';
  accent: AccentTheme;
  onUpdateUser: (updated: UserType) => void;
  onUpdateTheme: (theme: 'dark' | 'light' | 'system', accent: AccentTheme) => void;
  onSwitchToChats: () => void;
  onSwitchToCalls: () => void;
  onOpenChannelsDiscovery?: () => void;
  onOpenNewConversation?: (type?: 'direct' | 'group' | 'channel') => void;
  onLogout: () => void;
}

type SubView =
  | 'main'
  | 'profile'
  | 'account'
  | 'privacy'
  | 'chats'
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

export const ProfileSettingsView: React.FC<ProfileSettingsViewProps> = ({
  currentUser,
  theme,
  accent,
  onUpdateUser,
  onUpdateTheme,
  onSwitchToChats,
  onSwitchToCalls,
  onOpenChannelsDiscovery,
  onOpenNewConversation,
  onLogout,
}) => {
  const [subView, setSubView] = useState<SubView>('main');
  const [searchQuery, setSearchQuery] = useState('');

  // Editable Profile States
  const [isEditingName, setIsEditingName] = useState(false);
  const [displayName, setDisplayName] = useState(currentUser.displayName || '');
  const [isEditingAbout, setIsEditingAbout] = useState(false);
  const [aboutText, setAboutText] = useState(currentUser.bio || '');
  const [phoneText, setPhoneText] = useState(currentUser.phone || '');
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(
    currentUser.avatarUrl ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(currentUser.displayName || 'User')}`
  );

  // Privacy Settings States
  const [readReceipts, setReadReceipts] = useState(true);
  const [blockUnknown, setBlockUnknown] = useState(false);
  const [protectIpCalls, setProtectIpCalls] = useState(false);

  // Chat Settings States
  const [selectedThemeModalOpen, setSelectedThemeModalOpen] = useState(false);
  const [pendingTheme, setPendingTheme] = useState<'dark' | 'light' | 'system'>(theme);
  const [selectedWallpaper, setSelectedWallpaper] = useState<WallpaperOption>(WALLPAPER_COLORS[0]);
  const [addDoodles, setAddDoodles] = useState(true);
  const [mediaQuality, setMediaQuality] = useState<'standard' | 'hd'>('standard');

  // Media Download States
  const [downloadPhotos, setDownloadPhotos] = useState(true);
  const [downloadAudio, setDownloadAudio] = useState(true);
  const [downloadVideos, setDownloadVideos] = useState(false);
  const [downloadDocuments, setDownloadDocuments] = useState(false);

  // Chat toggles
  const [spellCheck, setSpellCheck] = useState(true);
  const [replaceWithEmoji, setReplaceWithEmoji] = useState(true);
  const [enterIsSend, setEnterIsSend] = useState(true);

  // Notifications toggles
  const [showPreviews, setShowPreviews] = useState(true);
  const [soundOutgoing, setSoundOutgoing] = useState(false);
  const [backgroundSync, setBackgroundSync] = useState(true);

  // Help beta toggle
  const [joinBeta, setJoinBeta] = useState(false);

  // Modals
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const handleCopyPhone = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(phoneText);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  };

  const handleSaveProfile = async (field: 'name' | 'about') => {
    try {
      const updated = await api.updateProfile({
        displayName: displayName.trim(),
        bio: aboutText.trim(),
        avatarUrl,
        phone: phoneText.trim(),
      });
      onUpdateUser(updated);
    } catch {
      // Local fallback
      onUpdateUser({
        ...currentUser,
        displayName: displayName.trim(),
        bio: aboutText.trim(),
        avatarUrl,
        phone: phoneText.trim(),
      });
    }
    if (field === 'name') setIsEditingName(false);
    if (field === 'about') setIsEditingAbout(false);
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
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden select-none bg-[#050505] text-white">
      {/* LEFT COLUMN: Settings & Profile Sidebar */}
      <aside className="w-full md:w-[380px] lg:w-[420px] flex flex-col h-full bg-[#050505] border-r border-white/15 relative shrink-0">
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
                  {displayName}
                </h1>
              </div>
            </div>

            {/* Search Bar */}
            <div className="px-4 py-2">
              <div className="w-full flex items-center px-3.5 py-2 rounded-lg bg-[#121212] border border-transparent focus-within:border-white transition">
                <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search"
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

            {/* Status / Mood Speech Bubble + Large Round Avatar */}
            <div className="py-6 flex flex-col items-center justify-center relative">
              {/* Speech bubble */}
              <div className="relative mb-3.5 animate-in fade-in">
                <div className="px-4 py-1.5 rounded-full bg-[#121212] border border-white/5 text-xs text-slate-200 font-medium shadow-md flex items-center gap-1.5">
                  <span>{aboutText || "What's happening?"}</span>
                </div>
                {/* Speech bubble pointer */}
                <div className="w-2.5 h-2.5 bg-[#121212] rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2 border-r border-b border-white/5" />
              </div>

              {/* Large Circular Profile Photo */}
              <div
                onClick={() => setSubView('profile')}
                className="relative w-28 h-28 rounded-full overflow-hidden ring-2 ring-[#00a884]/40 hover:ring-[#00a884] transition cursor-pointer group shadow-xl"
              >
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition">
                  <Camera className="w-6 h-6 mb-1" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">Change</span>
                </div>
              </div>
            </div>

            {/* Settings Menu List */}
            <div className="px-2 space-y-0.5">
              {/* 1. Profile */}
              <button
                onClick={() => setSubView('profile')}
                className="w-full p-3 rounded-xl hover:bg-[#121212] transition flex items-center gap-4 text-left cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-slate-300 group-hover:text-white">
                  <UserIcon className="w-5 h-5 stroke-[1.75]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Profile</div>
                  <div className="text-xs text-slate-400 truncate">Name, profile picture</div>
                </div>
              </button>

              {/* 2. Account */}
              <button
                onClick={() => setSubView('account')}
                className="w-full p-3 rounded-xl hover:bg-[#121212] transition flex items-center gap-4 text-left cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-slate-300 group-hover:text-white">
                  <Key className="w-5 h-5 stroke-[1.75]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Account</div>
                  <div className="text-xs text-slate-400 truncate">
                    Security notifications, account info
                  </div>
                </div>
              </button>

              {/* 3. Privacy */}
              <button
                onClick={() => setSubView('privacy')}
                className="w-full p-3 rounded-xl hover:bg-[#121212] transition flex items-center gap-4 text-left cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-slate-300 group-hover:text-white">
                  <Lock className="w-5 h-5 stroke-[1.75]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Privacy</div>
                  <div className="text-xs text-slate-400 truncate">
                    Blocked contacts, disappearing messages
                  </div>
                </div>
              </button>

              {/* 4. Chats */}
              <button
                onClick={() => setSubView('chats')}
                className="w-full p-3 rounded-xl hover:bg-[#121212] transition flex items-center gap-4 text-left cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-slate-300 group-hover:text-white">
                  <MessageSquare className="w-5 h-5 stroke-[1.75]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Chats</div>
                  <div className="text-xs text-slate-400 truncate">
                    Theme, wallpaper, chat settings
                  </div>
                </div>
              </button>

              {/* 5. Notifications */}
              <button
                onClick={() => setSubView('notifications')}
                className="w-full p-3 rounded-xl hover:bg-[#121212] transition flex items-center gap-4 text-left cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-slate-300 group-hover:text-white">
                  <Bell className="w-5 h-5 stroke-[1.75]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Notifications</div>
                  <div className="text-xs text-slate-400 truncate">Messages, groups, sounds</div>
                </div>
              </button>

              {/* 6. Keyboard shortcuts */}
              <button
                onClick={() => setIsShortcutsModalOpen(true)}
                className="w-full p-3 rounded-xl hover:bg-[#121212] transition flex items-center gap-4 text-left cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-slate-300 group-hover:text-white">
                  <Keyboard className="w-5 h-5 stroke-[1.75]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Keyboard shortcuts</div>
                  <div className="text-xs text-slate-400 truncate">Quick actions</div>
                </div>
              </button>

              {/* 7. Help and feedback */}
              <button
                onClick={() => setSubView('help')}
                className="w-full p-3 rounded-xl hover:bg-[#121212] transition flex items-center gap-4 text-left cursor-pointer group"
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-slate-300 group-hover:text-white">
                  <HelpCircle className="w-5 h-5 stroke-[1.75]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Help and feedback</div>
                  <div className="text-xs text-slate-400 truncate">
                    Help centre, contact us, privacy policy
                  </div>
                </div>
              </button>

              {/* 8. Log out */}
              <div className="pt-2">
                <button
                  onClick={() => setIsLogoutModalOpen(true)}
                  className="w-full p-3 rounded-xl hover:bg-rose-500/10 text-rose-500 transition flex items-center gap-4 text-left cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-rose-500">
                    <LogOut className="w-5 h-5 stroke-[1.75]" />
                  </div>
                  <div className="text-sm font-medium">Log out</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: EDIT PROFILE */}
        {subView === 'profile' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
            {/* Header: Back arrow + Edit profile */}
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('main')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Edit profile</h2>
            </div>

            <div className="p-6 space-y-7">
              {/* Profile Avatar with Camera Overlay */}
              <div className="flex flex-col items-center justify-center">
                <label className="relative w-36 h-36 rounded-full overflow-hidden cursor-pointer group shadow-2xl ring-2 ring-[#00a884]/30 hover:ring-[#00a884] transition">
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="w-full h-full object-cover group-hover:scale-105 transition"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition">
                    <Camera className="w-8 h-8 mb-1.5" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider">
                      Change profile photo
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

              {/* Section: About */}
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2">About</div>
                <div className="p-3.5 rounded-xl bg-[#121212] border border-white/5 flex items-center justify-between">
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
                          className="p-1 rounded-full text-white hover:bg-white/10"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm font-medium text-white flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#00a884]" />
                          <span>{aboutText || 'Current mood'}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">Until I change it</div>
                      </>
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

              {/* Section: Name */}
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2">Name</div>
                <div className="p-3.5 rounded-xl bg-[#121212] border border-white/5 flex items-center justify-between">
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
                          className="p-1 rounded-full text-white hover:bg-white/10"
                        >
                          <Check className="w-4 h-4" />
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

              {/* Section: Phone */}
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2">Phone</div>
                <div className="p-3.5 rounded-xl bg-[#121212] border border-white/5 flex items-center justify-between">
                  <div className="text-sm font-medium text-white tracking-wide">{phoneText}</div>
                  <button
                    onClick={handleCopyPhone}
                    title="Copy phone number"
                    className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  >
                    {copiedPhone ? (
                      <Check className="w-4 h-4 text-white" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: ACCOUNT */}
        {subView === 'account' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
            {/* Header: Back arrow + Account */}
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('main')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Account</h2>
            </div>

            <div className="p-4 space-y-1">
              <button className="w-full p-3.5 rounded-xl hover:bg-[#121212] transition flex items-center justify-between text-left cursor-pointer group">
                <div className="flex items-center gap-3.5">
                  <Shield className="w-5 h-5 text-slate-300" />
                  <span className="text-sm font-medium text-white">Security notifications</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>

              <button className="w-full p-3.5 rounded-xl hover:bg-[#121212] transition flex items-center justify-between text-left cursor-pointer group">
                <div className="flex items-center gap-3.5">
                  <FileText className="w-5 h-5 text-slate-300" />
                  <span className="text-sm font-medium text-white">Request account info</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>

              <button className="w-full p-3.5 rounded-xl hover:bg-[#121212] transition flex items-center justify-between text-left cursor-pointer group">
                <div className="flex items-center gap-3.5">
                  <Info className="w-5 h-5 text-slate-300" />
                  <span className="text-sm font-medium text-white">How to delete my account</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>
        )}

        {/* VIEW 4: PRIVACY */}
        {subView === 'privacy' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
            {/* Header: Back arrow + Privacy */}
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('main')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Privacy</h2>
            </div>

            <div className="p-4 space-y-6">
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2 px-2">
                  Who can see my personal info
                </div>
                <div className="space-y-0.5">
                  {[
                    { title: 'Last seen and online', val: 'Nobody' },
                    { title: 'Profile picture', val: 'Nobody' },
                    { title: 'About', val: 'Everyone' },
                    { title: 'Status', val: 'My contacts' },
                  ].map(item => (
                    <div
                      key={item.title}
                      className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition"
                    >
                      <span className="text-sm text-white">{item.title}</span>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>{item.val}</span>
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      </div>
                    </div>
                  ))}

                  {/* Read Receipts */}
                  <div className="p-3 rounded-xl hover:bg-[#121212] flex items-start justify-between cursor-pointer transition">
                    <div className="pr-4">
                      <div className="text-sm text-white">Read receipts</div>
                      <div className="text-xs text-slate-400 mt-1 leading-relaxed">
                        If turned off, you won't send or receive read receipts. Read receipts are
                        always sent for group chats.
                      </div>
                    </div>
                    <button
                      onClick={() => setReadReceipts(!readReceipts)}
                      className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 ${
                        readReceipts ? 'bg-[#00a884]' : 'bg-[#3b4a54]'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition transform ${
                          readReceipts ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2 px-2">
                  Disappearing messages
                </div>
                <div className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition">
                  <span className="text-sm text-white">Default message timer</span>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Off</span>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>
                </div>
              </div>

              <div className="space-y-0.5">
                <div className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition">
                  <span className="text-sm text-white">Groups</span>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Everyone</span>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>
                </div>

                <div className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition">
                  <span className="text-sm text-white">Blocked contacts</span>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </div>

                <div className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition">
                  <span className="text-sm text-white">App lock</span>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Require password to unlock</span>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2 px-2">Advanced</div>
                <div className="space-y-3">
                  <div className="p-3 rounded-xl hover:bg-[#121212] flex items-start justify-between cursor-pointer transition">
                    <div className="pr-4">
                      <div className="text-sm text-white">Block unknown account messages</div>
                      <div className="text-xs text-slate-400 mt-1 leading-relaxed">
                        To protect your account and improve device performance, WhatsApp will block
                        messages from unknown accounts if they exceed a certain volume.{' '}
                        <span className="text-white hover:underline cursor-pointer">Learn more</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setBlockUnknown(!blockUnknown)}
                      className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 ${
                        blockUnknown ? 'bg-[#00a884]' : 'bg-[#3b4a54]'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition transform ${
                          blockUnknown ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="p-3 rounded-xl hover:bg-[#121212] flex items-start justify-between cursor-pointer transition">
                    <div className="pr-4">
                      <div className="text-sm text-white">Protect IP address in calls</div>
                      <div className="text-xs text-slate-400 mt-1 leading-relaxed">
                        To make it harder for people to infer your location, calls on this device will
                        be securely relayed through WhatsApp servers. This will reduce call quality.{' '}
                        <span className="text-white hover:underline cursor-pointer">Learn more</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setProtectIpCalls(!protectIpCalls)}
                      className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 ${
                        protectIpCalls ? 'bg-[#00a884]' : 'bg-[#3b4a54]'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition transform ${
                          protectIpCalls ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 5: CHATS SETTINGS */}
        {subView === 'chats' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
            {/* Header: Back arrow + Chats */}
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('main')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Chats</h2>
            </div>

            <div className="p-4 space-y-6">
              {/* Display */}
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2 px-2">Display</div>
                <div className="space-y-0.5">
                  {/* Theme */}
                  <div
                    onClick={() => setSelectedThemeModalOpen(true)}
                    className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition"
                  >
                    <div>
                      <div className="text-sm text-white">Theme</div>
                      <div className="text-xs text-slate-400 capitalize">{theme} default</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>

                  {/* Wallpaper */}
                  <div
                    onClick={() => setSubView('wallpaper')}
                    className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition"
                  >
                    <div className="text-sm text-white">Wallpaper</div>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>
                </div>
              </div>

              {/* Chat Settings */}
              <div>
                <div className="text-xs font-semibold text-slate-400 mb-2 px-2">Chat settings</div>
                <div className="space-y-1">
                  {/* Media upload quality */}
                  <div
                    onClick={() => setSubView('media_quality')}
                    className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition"
                  >
                    <div className="text-sm text-white">Media upload quality</div>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>

                  {/* Media auto-download */}
                  <div
                    onClick={() => setSubView('media_download')}
                    className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition"
                  >
                    <div className="text-sm text-white">Media auto-download</div>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>

                  {/* Spell check */}
                  <div className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition">
                    <div>
                      <div className="text-sm text-white">Spell check</div>
                      <div className="text-xs text-slate-400">Check spelling while typing</div>
                    </div>
                    <button
                      onClick={() => setSpellCheck(!spellCheck)}
                      className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 ${
                        spellCheck ? 'bg-[#00a884]' : 'bg-[#3b4a54]'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition transform ${
                          spellCheck ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Replace text with emoji */}
                  <div className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition">
                    <div>
                      <div className="text-sm text-white">Replace text with emoji</div>
                      <div className="text-xs text-slate-400">Emoji will replace specific text as you type</div>
                    </div>
                    <button
                      onClick={() => setReplaceWithEmoji(!replaceWithEmoji)}
                      className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 ${
                        replaceWithEmoji ? 'bg-[#00a884]' : 'bg-[#3b4a54]'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition transform ${
                          replaceWithEmoji ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Enter is send */}
                  <div className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition">
                    <div>
                      <div className="text-sm text-white">Enter is send</div>
                      <div className="text-xs text-slate-400">Enter key will send your message</div>
                    </div>
                    <button
                      onClick={() => setEnterIsSend(!enterIsSend)}
                      className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 ${
                        enterIsSend ? 'bg-[#00a884]' : 'bg-[#3b4a54]'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition transform ${
                          enterIsSend ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 6: WALLPAPER PICKER */}
        {subView === 'wallpaper' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
            {/* Header: Back arrow + Set chat wallpaper */}
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('chats')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Set chat wallpaper</h2>
            </div>

            <div className="p-4 space-y-5">
              {/* Add WhatsApp Doodles toggle */}
              <label className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#121212] cursor-pointer">
                <input
                  type="checkbox"
                  checked={addDoodles}
                  onChange={e => setAddDoodles(e.target.checked)}
                  className="w-4 h-4 rounded text-white accent-white"
                />
                <span className="text-xs text-slate-200 font-medium">Add WhatsApp doodles</span>
              </label>

              {/* Color swatches grid */}
              <div className="grid grid-cols-4 gap-3.5">
                {WALLPAPER_COLORS.map(item => {
                  const isSelected = selectedWallpaper.id === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedWallpaper(item)}
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

        {/* VIEW 7: MEDIA UPLOAD QUALITY */}
        {subView === 'media_quality' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
            {/* Header: Back arrow + Media upload quality */}
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
                className="flex items-start gap-3 p-3.5 rounded-xl hover:bg-[#121212] cursor-pointer transition"
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
                    Standard media uses less storage and is faster to send
                  </div>
                </div>
              </label>

              <label
                onClick={() => setMediaQuality('hd')}
                className="flex items-start gap-3 p-3.5 rounded-xl hover:bg-[#121212] cursor-pointer transition"
              >
                <input
                  type="radio"
                  name="media_quality"
                  checked={mediaQuality === 'hd'}
                  onChange={() => setMediaQuality('hd')}
                  className="mt-1 accent-white"
                />
                <div>
                  <div className="text-sm font-medium text-white">HD quality</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    HD media is slower to send, can be 6 times larger
                  </div>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* VIEW 8: MEDIA AUTO DOWNLOAD */}
        {subView === 'media_download' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
            {/* Header: Back arrow + Media auto-download */}
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
                { label: 'Audio', state: downloadAudio, set: setDownloadAudio },
                { label: 'Videos', state: downloadVideos, set: setDownloadVideos },
                { label: 'Documents', state: downloadDocuments, set: setDownloadDocuments },
              ].map(item => (
                <div
                  key={item.label}
                  className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition"
                >
                  <span className="text-sm text-white">{item.label}</span>
                  <button
                    onClick={() => item.set(!item.state)}
                    className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 ${
                      item.state ? 'bg-[#00a884]' : 'bg-[#3b4a54]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition transform ${
                        item.state ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              ))}

              <div className="text-xs text-slate-400 py-3 leading-relaxed">
                Voice messages are always automatically downloaded for the best communication
                experience.
              </div>

              <button
                onClick={() => {
                  setDownloadPhotos(true);
                  setDownloadAudio(true);
                  setDownloadVideos(false);
                  setDownloadDocuments(false);
                }}
                className="flex items-center gap-2 text-xs font-semibold text-white hover:text-[#06cf9c] transition py-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset auto-download settings</span>
              </button>
            </div>
          </div>
        )}

        {/* VIEW 9: NOTIFICATIONS */}
        {subView === 'notifications' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
            {/* Header: Back arrow + Notifications */}
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('main')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Notifications</h2>
            </div>

            <div className="p-4 space-y-4">
              <div className="space-y-0.5">
                {[
                  { title: 'Messages', val: 'Off' },
                  { title: 'Groups', val: 'Off' },
                  { title: 'Status', val: 'Off' },
                  { title: 'Calls', val: 'On' },
                ].map(item => (
                  <div
                    key={item.title}
                    className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition"
                  >
                    <span className="text-sm text-white">{item.title}</span>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{item.val}</span>
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3 pt-2">
                <div className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition">
                  <div>
                    <div className="text-sm text-white">Show previews</div>
                    <div className="text-xs text-slate-400">
                      Preview message text inside message notifications.
                    </div>
                  </div>
                  <button
                    onClick={() => setShowPreviews(!showPreviews)}
                    className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 ${
                      showPreviews ? 'bg-[#00a884]' : 'bg-[#3b4a54]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition transform ${
                        showPreviews ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition">
                  <div className="text-sm text-white">Play sound for outgoing messages</div>
                  <button
                    onClick={() => setSoundOutgoing(!soundOutgoing)}
                    className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 ${
                      soundOutgoing ? 'bg-[#00a884]' : 'bg-[#3b4a54]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition transform ${
                        soundOutgoing ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition">
                  <div>
                    <div className="text-sm text-white">Background sync</div>
                    <div className="text-xs text-slate-400">
                      Get faster performance by syncing messages in the background.
                    </div>
                  </div>
                  <button
                    onClick={() => setBackgroundSync(!backgroundSync)}
                    className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 ${
                      backgroundSync ? 'bg-[#00a884]' : 'bg-[#3b4a54]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition transform ${
                        backgroundSync ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="text-xs text-slate-500 px-2 pt-2">
                To get notifications, make sure they're turned on in your browser and device settings.
              </div>
            </div>
          </div>
        )}

        {/* VIEW 10: HELP AND FEEDBACK */}
        {subView === 'help' && (
          <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
            {/* Header: Back arrow + Help and feedback */}
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('main')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Help and feedback</h2>
            </div>

            <div className="p-4 space-y-4">
              <div className="space-y-1">
                <button className="w-full p-3 rounded-xl hover:bg-[#121212] text-left transition flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white">Help Centre</div>
                    <div className="text-xs text-slate-400">Frequently asked questions</div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-500" />
                </button>

                <button className="w-full p-3 rounded-xl hover:bg-[#121212] text-left transition flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white">Contact us</div>
                    <div className="text-xs text-slate-400">Chat with support to get answers</div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-500" />
                </button>

                <button className="w-full p-3 rounded-xl hover:bg-[#121212] text-left transition flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white">Send feedback</div>
                    <div className="text-xs text-slate-400">Technical issues, suggestions</div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-500" />
                </button>

                <button className="w-full p-3 rounded-xl hover:bg-[#121212] text-left transition flex items-center justify-between">
                  <div className="text-sm text-white">Terms and Privacy Policy</div>
                  <ExternalLink className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              <div className="pt-2">
                <div className="p-3 rounded-xl hover:bg-[#121212] flex items-center justify-between cursor-pointer transition">
                  <div className="pr-3">
                    <div className="text-sm text-white">Join the beta</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Get new features before they are released. Report bugs using the Contact us
                      form above.
                    </div>
                  </div>
                  <button
                    onClick={() => setJoinBeta(!joinBeta)}
                    className={`w-11 h-6 rounded-full transition flex items-center px-1 shrink-0 ${
                      joinBeta ? 'bg-[#00a884]' : 'bg-[#3b4a54]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition transform ${
                        joinBeta ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 text-center pt-8">
                Version 2.3000.1047296119
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* RIGHT COLUMN: Voice & Video Calling Available Hub (or Wallpaper preview) */}
      <main className="hidden md:flex flex-1 flex-col items-center justify-center p-8 relative overflow-hidden bg-[#050505]">
        {subView === 'wallpaper' ? (
          /* Wallpaper Preview Mode */
          <div
            className="w-full h-full rounded-2xl relative overflow-hidden flex flex-col items-center justify-center border border-white/10 shadow-2xl transition-colors duration-300"
            style={{ backgroundColor: selectedWallpaper.color }}
          >
            {/* WhatsApp Doodles SVG overlay if enabled */}
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
              <span className="text-sm font-semibold text-slate-200 bg-black/40 px-4 py-2 rounded-full backdrop-blur-md">
                Wallpaper preview ({selectedWallpaper.name})
              </span>
            </div>
          </div>
        ) : (
          /* Normal Voice & Video Calling Banner */
          <div className="flex flex-col items-center max-w-md text-center">
            {/* Center Card */}
            <div className="w-full rounded-3xl bg-[#121212] border border-white/5 p-8 shadow-2xl flex flex-col items-center mb-6">
              {/* Green Calling Icon Illustration */}
              <div className="w-16 h-16 rounded-2xl bg-[#00a884]/20 border border-white/40 flex items-center justify-center text-white mb-5 shadow-lg">
                <Phone className="w-8 h-8 fill-current" />
              </div>

              <h2 className="text-lg font-bold text-white mb-2">
                Voice and video calling is now available
              </h2>
              <p className="text-xs text-slate-300 mb-6 leading-relaxed">
                Now you can make and join calls on Aether Web.
              </p>

              {/* Go to Calls Button */}
              <button
                onClick={onSwitchToCalls}
                className="px-6 py-2.5 rounded-full bg-white text-black font-bold text-xs transition shadow-lg cursor-pointer active:scale-95"
              >
                Go to Calls
              </button>
            </div>

            {/* Quick Action Icons Row */}
            <div className="grid grid-cols-4 gap-3 w-full">
              {/* Send document */}
              <button
                onClick={onSwitchToChats}
                className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl hover:bg-[#121212] transition cursor-pointer text-slate-400 hover:text-white group"
              >
                <div className="w-10 h-10 rounded-full bg-[#121212] group-hover:bg-[#1a1a1a] flex items-center justify-center transition">
                  <FileText className="w-5 h-5 stroke-[1.75]" />
                </div>
                <span className="text-[11px] font-medium">Send document</span>
              </button>

              {/* Add contact */}
              <button
                onClick={() => onOpenNewConversation?.('direct')}
                className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl hover:bg-[#121212] transition cursor-pointer text-slate-400 hover:text-white group"
              >
                <div className="w-10 h-10 rounded-full bg-[#121212] group-hover:bg-[#1a1a1a] flex items-center justify-center transition">
                  <UserPlus className="w-5 h-5 stroke-[1.75]" />
                </div>
                <span className="text-[11px] font-medium">Add contact</span>
              </button>

              {/* New call */}
              <button
                onClick={onSwitchToCalls}
                className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl hover:bg-[#121212] transition cursor-pointer text-slate-400 hover:text-white group"
              >
                <div className="w-10 h-10 rounded-full bg-[#121212] group-hover:bg-[#1a1a1a] flex items-center justify-center transition">
                  <PhoneCall className="w-5 h-5 stroke-[1.75]" />
                </div>
                <span className="text-[11px] font-medium">New call</span>
              </button>

              {/* Ask AI */}
              <button
                onClick={onSwitchToChats}
                className="flex flex-col items-center justify-center gap-2 p-3 rounded-2xl hover:bg-[#121212] transition cursor-pointer text-slate-400 hover:text-white group"
              >
                <div className="w-10 h-10 rounded-full bg-[#121212] group-hover:bg-[#1a1a1a] flex items-center justify-center transition">
                  <Sparkles className="w-5 h-5 text-white stroke-[1.75]" />
                </div>
                <span className="text-[11px] font-medium">Ask AI</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* THEME PICKER MODAL (as seen in video at 00:19) */}
      {selectedThemeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none">
          <div className="w-full max-w-xs rounded-2xl bg-[#0a0a0a] border border-white/10 p-6 shadow-2xl animate-in zoom-in-95">
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
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onUpdateTheme(pendingTheme, accent);
                  setSelectedThemeModalOpen(false);
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white hover:bg-white/5 transition"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KEYBOARD SHORTCUTS MODAL (as seen in video at 00:39 - 00:45) */}
      {isShortcutsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none">
          <div className="w-full max-w-2xl rounded-2xl bg-[#0a0a0a] border border-white/10 p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-white">Keyboard shortcuts</h3>
              <button
                onClick={() => setIsShortcutsModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Shortcuts 2-column scrollable grid */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-6 custom-scrollbar text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                {[
                  { name: 'Mark as unread', keys: ['Ctrl', 'Alt', 'Shift', 'U'] },
                  { name: 'Mute', keys: ['Ctrl', 'Alt', 'Shift', 'M'] },
                  { name: 'Archive chat', keys: ['Ctrl', 'Alt', 'E'] },
                  { name: 'Pin chat', keys: ['Ctrl', 'Alt', 'Shift', 'P'] },
                  { name: 'Search', keys: ['Ctrl', 'Alt', '/'] },
                  { name: 'Search chat', keys: ['Ctrl', 'Shift', 'F'] },
                  { name: 'New chat', keys: ['Ctrl', 'Alt', 'N'] },
                  { name: 'Next chat', keys: ['Ctrl', 'Alt', 'Tab'] },
                  { name: 'Previous chat', keys: ['Ctrl', 'Alt', 'Shift', 'Tab'] },
                  { name: 'Add chat to list', keys: ['Ctrl', 'Alt', 'Shift', 'L'] },
                  { name: 'Close chat', keys: ['Escape'] },
                  { name: 'New group', keys: ['Ctrl', 'Alt', 'Shift', 'N'] },
                  { name: 'Profile and About', keys: ['Ctrl', 'Alt', 'P'] },
                  { name: 'Increase speed of selected voice', keys: ['Shift', '.'] },
                  { name: 'Decrease speed of selected voice', keys: ['Shift', ','] },
                  { name: 'Settings', keys: ['Ctrl', 'Alt', ','] },
                  { name: 'Emoji panel', keys: ['Ctrl', 'Alt', 'E'] },
                  { name: 'GIF panel', keys: ['Ctrl', 'Alt', 'G'] },
                  { name: 'Sticker panel', keys: ['Ctrl', 'Alt', 'S'] },
                  { name: 'Extended search', keys: ['Alt', 'K'] },
                  { name: 'Lock app', keys: ['Ctrl', 'Alt', 'L'] },
                  { name: 'Open chat info', keys: ['Alt', 'I'] },
                  { name: 'Block chat', keys: ['Ctrl', 'Shift', 'B'] },
                  { name: 'Reply', keys: ['Alt', 'R'] },
                  { name: 'Reply privately', keys: ['Ctrl', 'Alt', 'R'] },
                  { name: 'Forward', keys: ['Ctrl', 'Alt', 'D'] },
                  { name: 'Star message', keys: ['Ctrl', 'Alt', 'Shift', 'S'] },
                  { name: 'Open attachment dropdown', keys: ['Alt', 'A'] },
                  { name: 'Start PTT recording', keys: ['Ctrl', 'Alt', 'Shift', 'R'] },
                  { name: 'Pause PTT recording', keys: ['Alt', 'P'] },
                  { name: 'Send text', keys: ['Ctrl', 'Enter'] },
                  { name: 'Edit last message', keys: ['Cmd', 'ArrowUp'] },
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

              <div>
                <div className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">
                  Calls
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                  {[
                    { name: 'Toggle camera', keys: ['Ctrl', 'Alt', 'V'] },
                    { name: 'Toggle mute', keys: ['Ctrl', 'Alt', 'M'] },
                    { name: 'Reactions', keys: ['Ctrl', 'Alt', 'R'] },
                    { name: 'Raise hand', keys: ['Ctrl', 'Alt', 'H'] },
                    { name: 'Screen share', keys: ['Ctrl', 'Alt', 'S'] },
                    { name: 'End call', keys: ['Ctrl', 'Alt', 'W'] },
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
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setIsLogoutModalOpen(false);
                  onLogout();
                }}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold transition"
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
