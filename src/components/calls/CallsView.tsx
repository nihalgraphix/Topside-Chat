import React, { useState, useMemo } from 'react';
import {
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Video,
  Link2,
  Lock,
  Search,
  X,
  ArrowLeft,
  Pencil,
  Plus,
  Hash,
  Delete,
  Copy,
  Check,
  Share2,
  MessageSquare,
  Compass,
  UserPlus,
  Star,
  Users,
} from 'lucide-react';
import { Call, User as UserType } from '../../types';

export interface CallsViewProps {
  currentUser: UserType;
  calls: Call[];
  contacts?: UserType[];
  onStartCall: (userId: string, type: 'voice' | 'video', name: string, avatarUrl?: string) => void;
  onSwitchToChats: () => void;
  onOpenChannelsDiscovery?: () => void;
  onOpenNewConversation?: (type?: 'direct' | 'group' | 'channel') => void;
  onOpenSettings?: () => void;
  onLogout?: () => void;
}

interface FavoriteContact {
  id: string;
  name: string;
  avatarUrl: string;
  phone?: string;
  username?: string;
}

interface CallHistoryItem {
  id: string;
  contactName: string;
  contactAvatar: string;
  contactId: string;
  type: 'voice' | 'video';
  direction: 'outgoing' | 'incoming' | 'missed';
  timeLabel: string;
  durationLabel?: string;
  count?: number;
}

interface ContactItem {
  id: string;
  name: string;
  avatarUrl: string;
  phone?: string;
  username?: string;
  section: string;
}

type SidebarSubView = 'main' | 'dialpad' | 'favourites' | 'new_call';

export const CallsView: React.FC<CallsViewProps> = ({
  currentUser,
  calls,
  contacts = [],
  onStartCall,
  onSwitchToChats,
  onOpenChannelsDiscovery,
  onOpenNewConversation,
  onOpenSettings,
  onLogout,
}) => {
  const [subView, setSubView] = useState<SidebarSubView>('main');
  const [searchQuery, setSearchQuery] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [favorites, setFavorites] = useState<FavoriteContact[]>([]);
  const [isCallLinkModalOpen, setIsCallLinkModalOpen] = useState(false);
  const [callLinkType, setCallLinkType] = useState<'video' | 'voice'>('video');
  const [copiedLink, setCopiedLink] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Derive recent calls strictly from real database calls
  const combinedRecentCalls = useMemo(() => {
    if (!calls || calls.length === 0) return [];

    return calls.map(c => {
      const isOutgoing = c.callerId === currentUser.id;
      const contactUser = isOutgoing ? c.receiver : c.caller;
      const isDialed = c.receiverId?.startsWith('dial_');
      const dialedNumber = isDialed ? c.receiverId?.replace('dial_', '') : '';
      const contactName =
        contactUser?.displayName ||
        dialedNumber ||
        (isOutgoing ? 'Outgoing Call' : 'Incoming Call');

      const contactAvatar =
        contactUser?.avatarUrl ||
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(contactName)}`;

      const isMissed = c.status === 'rejected' || c.status === 'missed';

      let timeLabel = 'Just now';
      try {
        const d = new Date(c.startedAt);
        const now = new Date();
        const diffMinutes = Math.floor((now.getTime() - d.getTime()) / (1000 * 60));
        const isToday = d.toDateString() === now.toDateString();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday = d.toDateString() === yesterday.toDateString();

        const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

        if (diffMinutes < 2) {
          timeLabel = 'Just now';
        } else if (isToday) {
          timeLabel = `Today, ${timeStr}`;
        } else if (isYesterday) {
          timeLabel = `Yesterday, ${timeStr}`;
        } else {
          timeLabel = d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${timeStr}`;
        }
      } catch {
        timeLabel = 'Recent';
      }

      let durationLabel = '';
      if (c.duration && c.duration > 0) {
        const mins = Math.floor(c.duration / 60);
        const secs = c.duration % 60;
        durationLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      }

      return {
        id: c.id,
        contactName,
        contactAvatar,
        contactId: isOutgoing ? c.receiverId || 'unknown' : c.callerId,
        type: c.type,
        direction: (isOutgoing ? 'outgoing' : isMissed ? 'missed' : 'incoming') as 'outgoing' | 'incoming' | 'missed',
        timeLabel,
        durationLabel,
      };
    });
  }, [calls, currentUser.id]);

  // Filtered recent calls by search query
  const filteredRecentCalls = useMemo(() => {
    if (!searchQuery.trim()) return combinedRecentCalls;
    const q = searchQuery.toLowerCase().trim();
    return combinedRecentCalls.filter(c => c.contactName.toLowerCase().includes(q));
  }, [combinedRecentCalls, searchQuery]);

  // Filtered favourites
  const filteredFavourites = useMemo(() => {
    if (!searchQuery.trim()) return favorites;
    const q = searchQuery.toLowerCase().trim();
    return favorites.filter(f => f.name.toLowerCase().includes(q));
  }, [favorites, searchQuery]);

  // Combined directory for "New call" - ONLY real signed-in/registered contacts
  const directoryContacts = useMemo(() => {
    const list: ContactItem[] = [];

    (contacts || []).forEach(c => {
      if (
        c.id !== currentUser.id &&
        c.id !== 'u_1789118066028_c7hyx' &&
        !/john\s*fran/i.test(c.displayName || '') &&
        !/john\s*fran/i.test(c.username || '') &&
        !/john\s*fran/i.test(c.email || '')
      ) {
        const firstLetter = c.displayName[0]?.toUpperCase() || '#';
        list.push({
          id: c.id,
          name: c.displayName,
          avatarUrl:
            c.avatarUrl ||
            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(c.displayName)}`,
          phone: c.phone,
          username: c.username,
          section: /[A-Z]/.test(firstLetter) ? firstLetter : '#',
        });
      }
    });

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      item =>
        item.name.toLowerCase().includes(q) ||
        (item.phone && item.phone.toLowerCase().includes(q)) ||
        (item.username && item.username.toLowerCase().includes(q))
    );
  }, [contacts, currentUser.id, searchQuery]);

  // Group directory contacts by section
  const groupedDirectory = useMemo(() => {
    const groups: { [key: string]: ContactItem[] } = {};
    directoryContacts.forEach(item => {
      if (!groups[item.section]) groups[item.section] = [];
      groups[item.section].push(item);
    });
    return groups;
  }, [directoryContacts]);

  // Handle dialpad press
  const handleKeypadPress = (digit: string) => {
    setPhoneNumber(prev => prev + digit);
  };

  const handleKeypadDelete = () => {
    setPhoneNumber(prev => prev.slice(0, -1));
  };

  const handleStartDialpadCall = (type: 'voice' | 'video') => {
    if (!phoneNumber.trim()) return;
    onStartCall(`dial_${phoneNumber.replace(/\s+/g, '')}`, type, phoneNumber);
  };

  // Generate a random Call Link
  const callLinkUrl = useMemo(() => {
    const randomHash = Math.random().toString(36).substring(2, 10);
    return `https://aether.chat/call/${randomHash}`;
  }, []);

  const handleCopyCallLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(callLinkUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden select-none bg-[#050505] text-white">
      {/* LEFT COLUMN: Calls Sidebar (matching WhatsApp Desktop layout in video) */}
      <aside className="w-full md:w-[360px] lg:w-[400px] flex flex-col h-full bg-[#050505] border-r border-white/15 relative shrink-0">
        {/* SUB-VIEW: MAIN CALLS LIST */}
        {subView === 'main' && (
          <>
            {/* Header: Calls title + Dialpad button + New Call button */}
            <div className="px-5 py-4 flex items-center justify-between">
              <h1 className="text-xl font-bold text-white tracking-tight">Calls</h1>
              <div className="flex items-center gap-2">
                {/* Dialpad button */}
                <button
                  onClick={() => setSubView('dialpad')}
                  title="Phone number dialpad"
                  className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
                >
                  <Hash className="w-5 h-5 stroke-[2]" />
                </button>

                {/* New Call button */}
                <button
                  onClick={() => setSubView('new_call')}
                  title="New call"
                  className="p-2 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
                >
                  <PhoneCall className="w-5 h-5 stroke-[2]" />
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="px-4 pb-3">
              <div className="w-full flex items-center px-3.5 py-2 rounded-lg bg-[#121212] border border-transparent focus-within:border-white transition">
                <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search name, number or @username"
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

            {/* Scrollable list of Favourites + Recent */}
            <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-5 custom-scrollbar">
              {/* SECTION: Favourites - only shown when user has added favourites */}
              {favorites.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h2 className="text-sm font-semibold text-slate-200">Favourites</h2>
                    <button
                      onClick={() => setSubView('favourites')}
                      className="text-xs font-semibold text-white hover:text-[#06cf9c] transition cursor-pointer"
                    >
                      View all
                    </button>
                  </div>

                  <div className="space-y-1">
                    {filteredFavourites.slice(0, 4).map(fav => (
                      <div
                        key={fav.id}
                        className="flex items-center justify-between p-2 rounded-xl hover:bg-[#121212] transition group cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={fav.avatarUrl}
                            alt={fav.name}
                            className="w-10 h-10 rounded-full object-cover shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <span className="text-sm font-medium text-white truncate">{fav.name}</span>
                        </div>

                        {/* Right icons: Video + Voice call */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onStartCall(fav.id, 'video', fav.name, fav.avatarUrl);
                            }}
                            title={`Video call ${fav.name}`}
                            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-[#1a1a1a] transition cursor-pointer"
                          >
                            <Video className="w-4 h-4" />
                          </button>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onStartCall(fav.id, 'voice', fav.name, fav.avatarUrl);
                            }}
                            title={`Voice call ${fav.name}`}
                            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-[#1a1a1a] transition cursor-pointer"
                          >
                            <Phone className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION: Recent */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-sm font-bold text-white tracking-wide">Recent Calls</h2>
                  {filteredRecentCalls.length > 0 && (
                    <span className="text-[11px] text-slate-400 font-medium">
                      {filteredRecentCalls.length} {filteredRecentCalls.length === 1 ? 'call' : 'calls'}
                    </span>
                  )}
                </div>

                {filteredRecentCalls.length === 0 ? (
                  <div className="py-14 px-4 text-center flex flex-col items-center justify-center rounded-2xl bg-[#182229]/60 border border-white/5 my-2">
                    <div className="w-14 h-14 rounded-2xl bg-[#121212] border border-white/10 flex items-center justify-center mb-3 text-white shadow-md">
                      <PhoneCall className="w-7 h-7" />
                    </div>
                    <h3 className="text-sm font-bold text-white mb-1">No Recent Calls</h3>
                    <p className="text-xs text-slate-400 max-w-[260px] leading-relaxed mb-5">
                      Calls you place or receive will appear here with contact details, time, and duration.
                    </p>
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => setSubView('new_call')}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-black font-bold text-xs font-semibold shadow-md transition active:scale-95 cursor-pointer"
                      >
                        <Phone className="w-3.5 h-3.5 fill-current" />
                        <span>New Call</span>
                      </button>
                      <button
                        onClick={() => setSubView('dialpad')}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#121212] hover:bg-[#1a1a1a] text-slate-200 text-xs font-semibold border border-white/5 transition active:scale-95 cursor-pointer"
                      >
                        <Hash className="w-3.5 h-3.5" />
                        <span>Dialpad</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredRecentCalls.map(rc => (
                      <div
                        key={rc.id}
                        onClick={() => onStartCall(rc.contactId, rc.type, rc.contactName, rc.contactAvatar)}
                        className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#121212] active:bg-[#283740] transition cursor-pointer group border border-transparent hover:border-white/5"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <img
                              src={rc.contactAvatar}
                              alt={rc.contactName}
                              className="w-10 h-10 rounded-full object-cover ring-1 ring-white/10"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#050505] flex items-center justify-center">
                              {rc.type === 'video' ? (
                                <Video className="w-2.5 h-2.5 text-white" />
                              ) : (
                                <Phone className="w-2.5 h-2.5 text-white" />
                              )}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white truncate group-hover:text-cyan-300 transition-colors">
                              {rc.contactName}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                              {rc.direction === 'outgoing' ? (
                                <PhoneOutgoing className="w-3.5 h-3.5 text-white shrink-0" />
                              ) : rc.direction === 'missed' ? (
                                <PhoneMissed className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              ) : (
                                <PhoneIncoming className="w-3.5 h-3.5 text-white shrink-0" />
                              )}
                              <span
                                className={`capitalize ${
                                  rc.direction === 'missed'
                                    ? 'text-rose-400 font-medium'
                                    : 'text-slate-300'
                                }`}
                              >
                                {rc.direction}
                              </span>
                              {rc.durationLabel && (
                                <span className="text-slate-500 text-[11px]">• {rc.durationLabel}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right: Timestamp & fast call buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-xs text-slate-400 text-right group-hover:hidden transition">
                            {rc.timeLabel}
                          </div>
                          <div className="hidden group-hover:flex items-center gap-1">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onStartCall(rc.contactId, 'voice', rc.contactName, rc.contactAvatar);
                              }}
                              title="Voice Call"
                              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-emerald-500/20 hover:text-emerald-300 transition cursor-pointer"
                            >
                              <Phone className="w-4 h-4" />
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onStartCall(rc.contactId, 'video', rc.contactName, rc.contactAvatar);
                              }}
                              title="Video Call"
                              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-cyan-500/20 hover:text-cyan-300 transition cursor-pointer"
                            >
                              <Video className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* SUB-VIEW: DIALPAD ("Phone number") */}
        {subView === 'dialpad' && (
          <div className="flex flex-col h-full">
            {/* Header: Back arrow + Phone number */}
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('main')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">Phone number</h2>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col items-center">
              {/* Phone number display input */}
              <div className="w-full mb-2">
                <div className="w-full flex items-center px-4 py-3 rounded-lg bg-transparent border-2 border-white focus-within:ring-2 focus-within:ring-[#00a884]/30 transition">
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    placeholder="Phone number"
                    autoFocus
                    className="w-full bg-transparent text-lg font-medium text-white placeholder-slate-500 focus:outline-none"
                  />
                  {phoneNumber && (
                    <button
                      onClick={handleKeypadDelete}
                      className="p-1 rounded-full text-slate-400 hover:text-white transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-400 mb-8 self-start px-1">
                Enter a phone number to start a call
              </p>

              {/* 12-key Dialpad Grid */}
              <div className="grid grid-cols-3 gap-x-6 gap-y-5 w-full max-w-[280px] mb-8">
                {[
                  { num: '1', sub: '' },
                  { num: '2', sub: 'ABC' },
                  { num: '3', sub: 'DEF' },
                  { num: '4', sub: 'GHI' },
                  { num: '5', sub: 'JKL' },
                  { num: '6', sub: 'MNO' },
                  { num: '7', sub: 'PQRS' },
                  { num: '8', sub: 'TUV' },
                  { num: '9', sub: 'WXYZ' },
                  { num: '+', sub: '' },
                  { num: '0', sub: '' },
                  { num: 'del', sub: '' },
                ].map(key => {
                  if (key.num === 'del') {
                    return (
                      <button
                        key="del"
                        onClick={handleKeypadDelete}
                        className="h-16 flex flex-col items-center justify-center rounded-2xl hover:bg-[#121212] active:scale-95 text-slate-300 hover:text-white transition cursor-pointer"
                      >
                        <Delete className="w-6 h-6 stroke-[1.75]" />
                      </button>
                    );
                  }

                  return (
                    <button
                      key={key.num}
                      onClick={() => handleKeypadPress(key.num)}
                      className="h-16 flex flex-col items-center justify-center rounded-2xl hover:bg-[#121212] active:scale-95 transition cursor-pointer"
                    >
                      <span className="text-2xl font-light text-white leading-none">
                        {key.num}
                      </span>
                      {key.sub && (
                        <span className="text-[10px] font-semibold text-slate-400 tracking-wider mt-1">
                          {key.sub}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Call Action Buttons */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleStartDialpadCall('voice')}
                  disabled={!phoneNumber.trim()}
                  className="w-14 h-14 rounded-full bg-[#00a884] hover:bg-[#06cf9c] disabled:opacity-40 disabled:hover:bg-[#00a884] text-white flex items-center justify-center shadow-lg transition active:scale-95 cursor-pointer"
                >
                  <Phone className="w-6 h-6 fill-current" />
                </button>
                <button
                  onClick={() => handleStartDialpadCall('video')}
                  disabled={!phoneNumber.trim()}
                  className="w-14 h-14 rounded-full bg-[#121212] hover:bg-[#1a1a1a] disabled:opacity-40 text-white flex items-center justify-center shadow-lg transition active:scale-95 cursor-pointer"
                >
                  <Video className="w-6 h-6" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUB-VIEW: FAVOURITES ("View all") */}
        {subView === 'favourites' && (
          <div className="flex flex-col h-full">
            {/* Header: Back arrow + Favourites + Edit + Add */}
            <div className="px-4 py-4 flex items-center justify-between border-b border-white/15">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSubView('main')}
                  className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-base font-bold text-white">Favourites</h2>
              </div>

              <div className="flex items-center gap-1">
                <button
                  title="Edit favourites"
                  className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSubView('new_call')}
                  title="Add favourite"
                  className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* List of Favourites */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 custom-scrollbar">
              {favorites.length === 0 ? (
                <div className="py-16 px-6 text-center flex flex-col items-center justify-center">
                  <div className="w-14 h-14 rounded-2xl bg-[#121212] border border-white/5 flex items-center justify-center mb-3 text-amber-400 shadow-inner">
                    <Star className="w-7 h-7" />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">No Favourites Yet</h3>
                  <p className="text-xs text-slate-400 max-w-[240px] leading-relaxed mb-5">
                    Add signed-in contacts to your favourites for quick one-tap calling.
                  </p>
                  <button
                    onClick={() => setSubView('new_call')}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#121212] hover:bg-[#1a1a1a] text-slate-200 text-xs font-semibold border border-white/5 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Choose from Contacts</span>
                  </button>
                </div>
              ) : (
                favorites.map(fav => (
                  <div
                    key={fav.id}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#121212] transition group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={fav.avatarUrl}
                        alt={fav.name}
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">{fav.name}</div>
                        {fav.phone && (
                          <div className="text-xs text-slate-400 truncate">{fav.phone}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onStartCall(fav.id, 'video', fav.name, fav.avatarUrl);
                        }}
                        title={`Video call ${fav.name}`}
                        className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-[#1a1a1a] transition cursor-pointer"
                      >
                        <Video className="w-4 h-4" />
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onStartCall(fav.id, 'voice', fav.name, fav.avatarUrl);
                        }}
                        title={`Voice call ${fav.name}`}
                        className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-[#1a1a1a] transition cursor-pointer"
                      >
                        <Phone className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Bottom Encryption Note */}
            <div className="p-4 flex items-center justify-center gap-1.5 text-[11px] text-white border-t border-white/15">
              <Lock className="w-3.5 h-3.5" />
              <span>Your personal calls are end-to-end encrypted</span>
            </div>
          </div>
        )}

        {/* SUB-VIEW: NEW CALL (Alphabetical contacts) */}
        {subView === 'new_call' && (
          <div className="flex flex-col h-full">
            {/* Header: Back arrow + New call */}
            <div className="px-4 py-4 flex items-center gap-3 border-b border-white/15">
              <button
                onClick={() => setSubView('main')}
                className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-[#121212] transition cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-bold text-white">New call</h2>
            </div>

            {/* Search */}
            <div className="px-4 py-3">
              <div className="w-full flex items-center px-3.5 py-2 rounded-lg bg-[#121212] border border-transparent focus-within:border-white transition">
                <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search name, number or @username"
                  autoFocus
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

            {/* Grouped Alphabetical List */}
            <div className="flex-1 overflow-y-auto px-4 pb-20 space-y-4 custom-scrollbar">
              {Object.keys(groupedDirectory).length === 0 ? (
                <div className="py-16 px-6 text-center flex flex-col items-center justify-center">
                  <div className="w-14 h-14 rounded-2xl bg-[#121212] border border-white/5 flex items-center justify-center mb-3 text-slate-400">
                    <Users className="w-7 h-7" />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">No Signed-in Contacts</h3>
                  <p className="text-xs text-slate-400 max-w-[260px] leading-relaxed mb-5">
                    {searchQuery
                      ? `No registered members match "${searchQuery}".`
                      : 'Only registered members who have signed in appear here. You can also dial any phone number.'}
                  </p>
                  <button
                    onClick={() => setSubView('dialpad')}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-black font-bold text-xs font-semibold shadow-md transition cursor-pointer"
                  >
                    <Hash className="w-3.5 h-3.5" />
                    <span>Open Dialpad</span>
                  </button>
                </div>
              ) : (
                Object.keys(groupedDirectory)
                  .sort()
                  .map(letter => (
                    <div key={letter}>
                      <div className="text-xs font-bold text-slate-400 px-2 mb-1.5">
                        {letter}
                      </div>
                      <div className="space-y-1">
                        {groupedDirectory[letter].map(contact => (
                          <div
                            key={contact.id}
                            className="flex items-center justify-between p-2 rounded-xl hover:bg-[#121212] transition group cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <img
                                src={contact.avatarUrl}
                                alt={contact.name}
                                className="w-10 h-10 rounded-full object-cover shrink-0"
                                referrerPolicy="no-referrer"
                              />
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-white truncate">
                                  {contact.name}
                                </div>
                                {contact.phone && (
                                  <div className="text-xs text-slate-400 truncate">
                                    {contact.phone}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  onStartCall(contact.id, 'video', contact.name, contact.avatarUrl);
                                }}
                                title={`Video call ${contact.name}`}
                                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-[#1a1a1a] transition cursor-pointer"
                              >
                                <Video className="w-4 h-4" />
                              </button>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  onStartCall(contact.id, 'voice', contact.name, contact.avatarUrl);
                                }}
                                title={`Voice call ${contact.name}`}
                                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-[#1a1a1a] transition cursor-pointer"
                              >
                                <Phone className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

        {/* BOTTOM FLOATING DOCK (Matches sidebar dock to switch back to Chats easily) */}
        <div className="absolute bottom-4 left-0 right-0 px-4 flex justify-center pointer-events-none z-30">
          <div className="pointer-events-auto flex items-center gap-1 p-1 rounded-full bg-[#1c1c20]/95 backdrop-blur-xl border border-[#2b2b34] shadow-2xl">
            {/* Chats Button -> switch back to chats */}
            <button
              onClick={onSwitchToChats}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5 fill-current" />
              <span>Chats</span>
            </button>

            {/* Calls Button -> active solid white pill */}
            <button
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-white text-black shadow-md cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5 fill-current" />
              <span>Calls</span>
            </button>

            {/* New Chat Button */}
            {onOpenNewConversation && (
              <button
                onClick={() => onOpenNewConversation('direct')}
                title="Start new conversation"
                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                <UserPlus className="w-4 h-4 stroke-[1.75]" />
              </button>
            )}

            {/* Profile Avatar / Menu */}
            <div className="relative">
              <button
                onClick={() => onOpenSettings?.()}
                title="Profile & Settings"
                className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/5 transition flex items-center justify-center cursor-pointer"
              >
                <div className="w-6 h-6 rounded-full overflow-hidden ring-1 ring-white/20 hover:ring-[#00a884] transition">
                  <img
                    src={
                      currentUser.avatarUrl ||
                      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(currentUser.displayName)}`
                    }
                    alt={currentUser.displayName}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </button>

              {showProfileMenu && (
                <div className="absolute bottom-10 right-0 w-44 rounded-xl bg-[#18181c] border border-white/10 shadow-2xl py-1 z-50 text-xs select-none">
                  {onOpenSettings && (
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        onOpenSettings();
                      }}
                      className="w-full text-left px-3 py-2 text-slate-300 hover:text-white hover:bg-white/5"
                    >
                      Settings
                    </button>
                  )}
                  {onLogout && (
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        onLogout();
                      }}
                      className="w-full text-left px-3 py-2 text-rose-400 hover:bg-white/5"
                    >
                      Sign Out
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* RIGHT COLUMN: Calls Action Hub (matching the video's right panel exactly) */}
      <main className="hidden md:flex flex-1 flex-col items-center justify-center p-8 bg-[#050505] relative overflow-hidden">
        {/* Centered Action Tiles */}
        <div className="flex flex-col items-center gap-4">
          {/* Top Row: Start Call & New Call Link */}
          <div className="flex items-center gap-4">
            {/* Tile 1: Start call */}
            <button
              onClick={() => setSubView('new_call')}
              className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-[#121212] hover:bg-[#1a1a1a] active:scale-95 border border-white/5 flex flex-col items-center justify-center gap-3 transition shadow-lg cursor-pointer group"
            >
              <div className="w-10 h-10 flex items-center justify-center text-slate-200 group-hover:text-white transition">
                <Video className="w-7 h-7 stroke-[1.5]" />
              </div>
              <span className="text-xs font-medium text-slate-300 group-hover:text-white transition">
                Start call
              </span>
            </button>

            {/* Tile 2: New call link */}
            <button
              onClick={() => setIsCallLinkModalOpen(true)}
              className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-[#121212] hover:bg-[#1a1a1a] active:scale-95 border border-white/5 flex flex-col items-center justify-center gap-3 transition shadow-lg cursor-pointer group"
            >
              <div className="w-10 h-10 flex items-center justify-center text-slate-200 group-hover:text-white transition">
                <Link2 className="w-7 h-7 stroke-[1.5]" />
              </div>
              <span className="text-xs font-medium text-slate-300 group-hover:text-white transition">
                New call link
              </span>
            </button>
          </div>

          {/* Bottom Row: Call a number */}
          <button
            onClick={() => setSubView('dialpad')}
            className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-[#121212] hover:bg-[#1a1a1a] active:scale-95 border border-white/5 flex flex-col items-center justify-center gap-3 transition shadow-lg cursor-pointer group"
          >
            <div className="w-10 h-10 flex items-center justify-center text-slate-200 group-hover:text-white transition">
              <Hash className="w-7 h-7 stroke-[1.5]" />
            </div>
            <span className="text-xs font-medium text-slate-300 group-hover:text-white transition">
              Call a number
            </span>
          </button>
        </div>

        {/* Bottom Lock / Encryption Banner */}
        <div className="absolute bottom-8 flex items-center gap-2 text-xs text-slate-400">
          <Lock className="w-3.5 h-3.5 text-slate-400" />
          <span>Your personal calls are end-to-end encrypted</span>
        </div>
      </main>

      {/* MODAL: CREATE CALL LINK */}
      {isCallLinkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm select-none">
          <div className="w-full max-w-md rounded-2xl bg-[#0a0a0a] border border-white/10 p-6 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Create call link</h3>
              <button
                onClick={() => setIsCallLinkModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/5 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              Anyone with this link and Aether Chat can join this call. Only share it with people you trust.
            </p>

            {/* Call type selector */}
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xs text-slate-400">Call type:</span>
              <button
                onClick={() => setCallLinkType('video')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  callLinkType === 'video'
                    ? 'bg-[#00a884] text-white'
                    : 'bg-[#182229] text-slate-300 hover:text-white'
                }`}
              >
                Video
              </button>
              <button
                onClick={() => setCallLinkType('voice')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  callLinkType === 'voice'
                    ? 'bg-[#00a884] text-white'
                    : 'bg-[#182229] text-slate-300 hover:text-white'
                }`}
              >
                Voice
              </button>
            </div>

            {/* Link display & copy box */}
            <div className="flex items-center gap-2 p-3 rounded-xl bg-[#050505] border border-white/10 mb-6">
              <Link2 className="w-4 h-4 text-white shrink-0" />
              <input
                type="text"
                readOnly
                value={callLinkUrl}
                className="flex-1 bg-transparent text-xs text-slate-200 focus:outline-none select-all truncate"
              />
              <button
                onClick={handleCopyCallLink}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#121212] hover:bg-[#1a1a1a] text-xs font-semibold text-white transition cursor-pointer shrink-0"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setIsCallLinkModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setIsCallLinkModalOpen(false);
                  onStartCall('link_call', callLinkType, 'Call Link Room');
                }}
                className="px-5 py-2 rounded-xl bg-white text-black font-bold text-xs font-semibold transition shadow-md cursor-pointer"
              >
                Join call now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
