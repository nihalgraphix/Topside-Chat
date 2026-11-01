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
} from 'lucide-react';
import { Conversation, User, Story } from '../../types';

interface SidebarProps {
  currentUser: User;
  conversations: Conversation[];
  stories?: Story[];
  activeConversationId: string | null;
  typingUsers: Record<string, string>;
  onSelectConversation: (id: string) => void;
  onOpenNewConversation: (defaultType?: 'direct' | 'group' | 'channel') => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
  onSelectStory?: (story: Story) => void;
  onOpenCreateStory?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenCallsHistory?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  conversations,
  activeConversationId,
  typingUsers,
  onSelectConversation,
  onOpenNewConversation,
  onOpenSettings,
  onLogout,
  onOpenCommandPalette,
  onOpenCallsHistory,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'direct' | 'group' | 'saved'>('all');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [activeBottomNav, setActiveBottomNav] = useState<'message' | 'calls' | 'profile'>('message');

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
        {conversations.length === 0 && (
          <div className="py-12 px-4 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/15 flex items-center justify-center text-white mb-3">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-white mb-1">No conversations yet</h4>
            <p className="text-xs text-neutral-400 max-w-[200px] mb-4 leading-relaxed">
              Start a new conversation or invite a contact to begin chatting.
            </p>
            <button
              onClick={() => onOpenNewConversation('direct')}
              className="px-4 py-2 rounded-xl bg-white text-black text-xs font-bold hover:bg-neutral-200 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Start New Chat</span>
            </button>
          </div>
        )}

        {displayedConversations.length > 0 && (
          <div className="space-y-1">
            {displayedConversations.map(conv => {
              const isSelected = activeConversationId === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition border ${
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-white truncate">{conv.name}</span>
                        {conv.isPinned && (
                          <Bookmark className="w-3 h-3 text-white fill-white shrink-0" />
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-neutral-400 shrink-0">{getTimeLabel(conv)}</span>
                    </div>
                    <div className="text-xs text-neutral-400 truncate mt-0.5">
                      {renderSubtitle(conv)}
                    </div>
                  </div>
                </div>
              );
            })}
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
