import React, { useState } from 'react';
import {
  Search,
  Plus,
  Phone,
  Mic,
  MessageSquare,
  Settings as SettingsIcon,
  LogOut,
  UserPlus,
  Bookmark,
  Command,
  Check,
  CheckCheck,
  Trash2,
  X,
  Shield,
} from 'lucide-react';
import { Conversation, User, Story } from '../../types';
import { isSuperAdminUser } from '../../lib/api';

interface SidebarProps {
  currentUser: User;
  conversations: Conversation[];
  contacts?: User[];
  stories?: Story[];
  activeConversationId: string | null;
  typingUsers: Record<string, string>;
  onSelectConversation: (id: string) => void;
  onStartDirectChat?: (user: User) => void;
  onOpenNewConversation: (defaultType?: 'direct' | 'group' | 'channel') => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
  onSelectStory?: (story: Story) => void;
  onOpenCreateStory?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenCallsHistory?: () => void;
  onDeleteConversation?: (id: string) => void;
  onTogglePinConversation?: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  conversations,
  contacts = [],
  activeConversationId,
  typingUsers,
  onSelectConversation,
  onStartDirectChat,
  onOpenNewConversation,
  onOpenSettings,
  onOpenAdmin,
  onLogout,
  onOpenCommandPalette,
  onOpenCallsHistory,
  onDeleteConversation,
  onTogglePinConversation,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'direct' | 'group' | 'saved'>('all');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [activeBottomNav, setActiveBottomNav] = useState<'message' | 'calls' | 'profile'>('message');
  const [confirmDeleteConvId, setConfirmDeleteConvId] = useState<string | null>(null);

  // Filter conversations by category tab (excluding channels)
  const categoryFiltered = conversations
    .filter(c => c.type !== 'channel')
    .filter(c => {
      if (activeTab === 'all') return true;
      if (activeTab === 'direct') return c.type === 'direct';
      if (activeTab === 'group') return c.type === 'group';
      if (activeTab === 'saved') return c.type === 'saved' || c.id === 'c_saved';
      return true;
    });

  const matchesSearch = (c: Conversation) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.lastMessage?.content || '').toLowerCase().includes(q);
  };

  const displayedConversations = categoryFiltered
    .filter(matchesSearch)
    .sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

  const matchedContacts = contacts.filter(u => {
    if (u.id === currentUser.id) return false;
    if (u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) return false;
    if (u.username && currentUser.username && u.username.toLowerCase() === currentUser.username.toLowerCase()) return false;
    if (!searchQuery.trim()) {
      // Only show in directory section if not already in a direct conversation with them
      const hasDirect = conversations.some(
        c => c.type === 'direct' && c.members.some(m => m.userId === u.id || m.user?.username === u.username)
      );
      return !hasDirect;
    }
    const q = searchQuery.trim().toLowerCase().replace(/^@/, '');
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q))
    );
  });

  const renderSubtitle = (c: Conversation) => {
    const isTyping = typingUsers[c.id];
    if (isTyping) {
      return <span className="text-white font-semibold animate-pulse">{isTyping} is typing...</span>;
    }

    if (c.lastMessage) {
      const isMyMsg = c.lastMessage.senderId === currentUser.id;
      const statusIcon = isMyMsg ? (
        c.lastMessage.status === 'read' ? (
          <CheckCheck className="w-3.5 h-3.5 text-white shrink-0 inline-block mr-1 stroke-[2.2]" />
        ) : (
          <Check className="w-3.5 h-3.5 text-neutral-500 shrink-0 inline-block mr-1 stroke-[1.8]" />
        )
      ) : null;

      if (c.lastMessage.type === 'voice') {
        return (
          <span className="flex items-center gap-1 text-white font-medium">
            {statusIcon}
            <Mic className="w-3 h-3 text-white shrink-0" />
            <span>Voice note</span>
          </span>
        );
      }
      if (c.lastMessage.type === 'image') {
        return (
          <span className="flex items-center text-neutral-400 truncate">
            {statusIcon}
            <span>Photo attachment</span>
          </span>
        );
      }
      if (c.lastMessage.type === 'poll') {
        return (
          <span className="flex items-center text-neutral-300 truncate">
            {statusIcon}
            <span>Poll: {c.lastMessage.content}</span>
          </span>
        );
      }
      if (c.lastMessage.type === 'location') {
        return (
          <span className="flex items-center text-neutral-300 truncate">
            {statusIcon}
            <span>Location shared</span>
          </span>
        );
      }
      if (c.lastMessage.type === 'contact') {
        return (
          <span className="flex items-center text-neutral-300 truncate">
            {statusIcon}
            <span>Contact: {c.lastMessage.content}</span>
          </span>
        );
      }
      if (c.lastMessage.type === 'system') {
        return (
          <span className="flex items-center gap-1 text-neutral-400">
            <Phone className="w-3 h-3 text-neutral-400 shrink-0" />
            <span>Call event</span>
          </span>
        );
      }
      return (
        <span className="flex items-center text-neutral-400 truncate">
          {statusIcon}
          <span className="truncate">{c.lastMessage.content}</span>
        </span>
      );
    }

    return <span className="text-neutral-600 italic text-[11px]">No messages yet</span>;
  };

  const getTimeLabel = (c: Conversation) => {
    if (c.lastMessage?.createdAt) {
      const d = new Date(c.lastMessage.createdAt);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    return '';
  };

  return (
    <aside className="w-full md:w-80 lg:w-[340px] flex flex-col h-full bg-[#050505] border-r border-white/15 select-none relative shrink-0">
      {/* Top Header: Search + Command Palette + Plus + Settings */}
      <div className="p-3.5 pb-2 flex items-center gap-2">
        <div className="flex-1 relative flex items-center">
          <div className="w-full flex items-center px-3.5 py-2 rounded-xl bg-[#111111] border border-white/15 focus-within:border-white transition">
            <Search className="w-4 h-4 text-neutral-400 mr-2 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-transparent text-xs text-white placeholder-neutral-500 focus:outline-none"
            />
            {onOpenCommandPalette && (
              <button
                onClick={onOpenCommandPalette}
                title="Open Command Palette (⌘K)"
                className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-neutral-300 hover:bg-white hover:text-black transition cursor-pointer"
              >
                <Command className="w-2.5 h-2.5" />
                <span>K</span>
              </button>
            )}
          </div>
        </div>

        {/* Plus Action Button */}
        <button
          onClick={() => onOpenNewConversation('direct')}
          title="Start new chat"
          className="w-9 h-9 rounded-xl bg-white text-black hover:bg-neutral-200 flex items-center justify-center transition shrink-0 cursor-pointer active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          title="Open Settings & Preferences"
          className="w-9 h-9 rounded-xl bg-[#111111] border border-white/15 hover:border-white text-neutral-300 hover:text-white flex items-center justify-center transition shrink-0 cursor-pointer active:scale-95"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>

        {isSuperAdminUser(currentUser) && (
          <button
            onClick={onOpenAdmin}
            title="Superadmin Data & User Control (nihal.graphix)"
            className="w-9 h-9 rounded-xl bg-white/10 border border-white/30 hover:bg-white hover:text-black text-white flex items-center justify-center transition shrink-0 cursor-pointer active:scale-95"
          >
            <Shield className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Category Tabs: All, Direct, Groups, Saved */}
      <div className="px-3.5 pt-1 pb-2.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none border-b border-white/10">
        {[
          { id: 'all', label: 'All' },
          { id: 'direct', label: 'Direct' },
          { id: 'group', label: 'Groups' },
          { id: 'saved', label: 'Saved' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white text-black shadow-sm'
                : 'bg-[#111111] border border-white/10 hover:border-white/30 text-neutral-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scrollable Conversation Stream */}
      <div className="flex-1 overflow-y-auto px-3 pb-24 scrollbar-none space-y-1 pt-2">
        {conversations.length === 0 && matchedContacts.length === 0 && (
          <div className="py-12 px-4 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/15 flex items-center justify-center text-white mb-3">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-white mb-1">No conversations yet</h4>
            <p className="text-xs text-neutral-400 max-w-[200px] mb-4 leading-relaxed">
              Start a new conversation or search contacts to begin chatting.
            </p>
            <button
              onClick={() => onOpenNewConversation('direct')}
              className="px-4 py-2 rounded-xl bg-white text-black text-xs font-bold hover:bg-neutral-200 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add & Search Contacts</span>
            </button>
          </div>
        )}

        {displayedConversations.length > 0 && (
          <div className="space-y-1">
            {displayedConversations.map(conv => {
              const isSelected = activeConversationId === conv.id;
              const isConfirmingDelete = confirmDeleteConvId === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    if (!isConfirmingDelete) {
                      onSelectConversation(conv.id);
                    }
                  }}
                  className={`group flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition border relative ${
                    isSelected
                      ? 'bg-[#161616] border-white/30'
                      : 'bg-transparent border-transparent hover:bg-[#111111] hover:border-white/10'
                  }`}
                >
                  <div className="relative shrink-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs select-none border ${
                        isSelected
                          ? 'bg-white text-black border-white'
                          : 'bg-[#1a1a1a] text-white border-white/20'
                      }`}
                    >
                      {conv.name.charAt(0).toUpperCase()}
                    </div>
                    {(conv.unreadCount || 0) > 0 && (
                      <div className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-white text-black border border-black text-[10px] font-bold rounded-full">
                        {conv.unreadCount}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-white truncate">{conv.name}</span>
                        {conv.isPinned && (
                          <Bookmark className="w-3 h-3 text-white fill-white shrink-0" />
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-neutral-400 shrink-0 group-hover:hidden">
                        {getTimeLabel(conv)}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-400 truncate mt-0.5 pr-6">
                      {renderSubtitle(conv)}
                    </div>
                  </div>

                  {/* Quick Hover Actions: Pin & Delete Chat */}
                  {isConfirmingDelete ? (
                    <div
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1 bg-black/95 border border-white/25 rounded-lg p-1 z-10 shrink-0"
                    >
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setConfirmDeleteConvId(null);
                          onDeleteConversation?.(conv.id);
                        }}
                        className="px-2 py-1 rounded bg-white text-black text-[10px] font-bold hover:bg-neutral-200 transition cursor-pointer"
                      >
                        Delete
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setConfirmDeleteConvId(null);
                        }}
                        title="Cancel"
                        className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={e => e.stopPropagation()}
                      className="hidden group-hover:flex items-center gap-1 absolute right-2.5 top-2 z-10 bg-[#111111]/95 border border-white/15 rounded-lg p-0.5 shadow-lg"
                    >
                      {onTogglePinConversation && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onTogglePinConversation(conv.id);
                          }}
                          title={conv.isPinned ? 'Unpin conversation' : 'Pin conversation'}
                          className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                        >
                          <Bookmark className={`w-3.5 h-3.5 ${conv.isPinned ? 'fill-white text-white' : ''}`} />
                        </button>
                      )}
                      {onDeleteConversation && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setConfirmDeleteConvId(conv.id);
                          }}
                          title="Delete conversation"
                          className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/15 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {matchedContacts.length > 0 && (
          <div className="pt-3 space-y-1">
            <div className="px-2 pb-1 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                People on Aether ({matchedContacts.length})
              </span>
              <button
                onClick={() => onOpenNewConversation('direct')}
                className="text-[10px] font-semibold text-white hover:underline cursor-pointer"
              >
                View All
              </button>
            </div>
            {matchedContacts.map(user => (
              <div
                key={user.id}
                onClick={() => {
                  if (onStartDirectChat) {
                    onStartDirectChat(user);
                  } else {
                    onOpenNewConversation('direct');
                  }
                }}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl cursor-pointer transition border bg-transparent border-transparent hover:bg-[#111111] hover:border-white/10"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-[#1a1a1a] text-white border border-white/20 flex items-center justify-center font-bold text-xs select-none">
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                    {user.isOnline && (
                      <span className="w-2.5 h-2.5 rounded-full bg-white border-2 border-black absolute bottom-0 right-0" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{user.displayName}</div>
                    <div className="text-[11px] text-neutral-400 truncate">@{user.username}</div>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-white text-black text-[10px] font-bold shrink-0">
                  Chat
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Floating Navigation Dock */}
      <div className="absolute bottom-4 left-0 right-0 px-4 flex justify-center pointer-events-none z-30">
        <div className="pointer-events-auto flex items-center gap-1 p-1.5 rounded-2xl bg-[#0f0f0f]/95 backdrop-blur-xl border border-white/20 shadow-2xl">
          <button
            onClick={() => setActiveBottomNav('message')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeBottomNav === 'message'
                ? 'bg-white text-black shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 fill-current" />
            <span>Chats</span>
          </button>

          {onOpenCallsHistory && (
            <button
              onClick={() => {
                setActiveBottomNav('calls');
                onOpenCallsHistory();
              }}
              title="Call History & Logs"
              className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <Phone className="w-4 h-4 stroke-[1.75]" />
            </button>
          )}

          <button
            onClick={() => onOpenNewConversation('direct')}
            title="Add contact or conversation"
            className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4 stroke-[1.75]" />
          </button>

          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              title="Account & Preferences"
              className="p-1 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition flex items-center justify-center cursor-pointer"
            >
              <div className="w-6 h-6 rounded-full bg-white text-black flex items-center justify-center font-bold text-[10px] select-none">
                {currentUser.displayName.charAt(0).toUpperCase()}
              </div>
            </button>

            {showProfileMenu && (
              <div className="absolute bottom-12 right-0 w-64 rounded-2xl bg-[#0a0a0a] border border-white/20 p-2 shadow-2xl z-50">
                <div className="px-3 py-2.5 border-b border-white/10">
                  <div className="text-xs font-bold text-white truncate">{currentUser.displayName}</div>
                  <div className="text-[11px] font-mono text-neutral-400 truncate">{currentUser.email || `@${currentUser.username}`}</div>
                </div>

                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onOpenSettings();
                  }}
                  className="w-full px-3 py-2 rounded-xl text-xs font-medium text-neutral-200 hover:bg-white hover:text-black flex items-center gap-2.5 transition cursor-pointer mt-1"
                >
                  <SettingsIcon className="w-4 h-4" />
                  <span>Settings & Profile</span>
                </button>

                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onOpenAdmin();
                  }}
                  className="w-full px-3 py-2 rounded-xl text-xs font-medium text-neutral-200 hover:bg-white hover:text-black flex items-center gap-2.5 transition cursor-pointer"
                >
                  <Shield className="w-4 h-4" />
                  <span>Admin Data & Users</span>
                </button>

                {onOpenCommandPalette && (
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      onOpenCommandPalette();
                    }}
                    className="w-full px-3 py-2 rounded-xl text-xs font-medium text-neutral-200 hover:bg-white hover:text-black flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <Command className="w-4 h-4" />
                    <span>Command Palette (⌘K)</span>
                  </button>
                )}

                {onOpenCallsHistory && (
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      onOpenCallsHistory();
                    }}
                    className="w-full px-3 py-2 rounded-xl text-xs font-medium text-neutral-200 hover:bg-white hover:text-black flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Call History</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onLogout();
                  }}
                  className="w-full px-3 py-2 rounded-xl text-xs font-bold text-white hover:bg-white hover:text-black flex items-center gap-2.5 transition mt-1 border-t border-white/10 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out / Switch Account</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
