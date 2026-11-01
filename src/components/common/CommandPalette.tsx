import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  MessageSquare,
  Users,
  Radio,
  Bookmark,
  Phone,
  Settings,
  Shield,
  Palette,
  Bot,
  Compass,
  LogOut,
  Sparkles,
  Command,
  X,
  Check,
} from 'lucide-react';
import { Conversation, User, AccentTheme } from '../../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
  onOpenNewChat: (type: 'direct' | 'group' | 'channel') => void;
  onOpenSettings: () => void;
  onOpenCallsHistory: () => void;
  onOpenDiscovery: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  currentUser,
  conversations,
  onSelectConversation,
  onOpenNewChat,
  onOpenSettings,
  onOpenCallsHistory,
  onOpenDiscovery,
  onToggleTheme,
  onLogout,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Build items based on query
  const staticActions = [
    {
      id: 'act_new_chat',
      title: 'New Direct Chat',
      category: 'Actions',
      icon: MessageSquare,
      action: () => onOpenNewChat('direct'),
    },
    {
      id: 'act_new_group',
      title: 'Create New Group',
      category: 'Actions',
      icon: Users,
      action: () => onOpenNewChat('group'),
    },
    {
      id: 'act_saved',
      title: 'Saved Messages & Notes',
      category: 'Navigation',
      icon: Bookmark,
      action: () => {
        const saved = conversations.find(c => c.type === 'saved');
        if (saved) onSelectConversation(saved.id);
        else onOpenNewChat('direct');
      },
    },
    {
      id: 'act_calls',
      title: 'Call History & Redial',
      category: 'Navigation',
      icon: Phone,
      action: onOpenCallsHistory,
    },
    {
      id: 'act_settings',
      title: 'Settings & Privacy Center',
      category: 'Preferences',
      icon: Settings,
      action: onOpenSettings,
    },
    {
      id: 'act_theme',
      title: 'Toggle Theme (Dark / Light)',
      category: 'Preferences',
      icon: Palette,
      action: onToggleTheme,
    },
    {
      id: 'act_logout',
      title: 'Log Out of Account',
      category: 'Account',
      icon: LogOut,
      action: onLogout,
    },
  ];

  // Filter conversations
  const q = query.toLowerCase().trim();
  const matchedConversations = conversations
    .filter(c => c.type !== 'channel' && c.name.toLowerCase().includes(q))
    .slice(0, 5)
    .map(c => ({
      id: `conv_${c.id}`,
      title: c.name,
      category: 'Chats',
      icon: c.type === 'group' ? Users : MessageSquare,
      action: () => onSelectConversation(c.id),
    }));

  const matchedActions = staticActions.filter(
    a => a.title.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
  );

  const allItems = [...matchedConversations, ...matchedActions];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % (allItems.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + allItems.length) % (allItems.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allItems[selectedIndex]) {
        allItems[selectedIndex].action();
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4 bg-black/85 backdrop-blur-md select-none animate-in fade-in">
      <div className="w-full max-w-xl rounded-2xl bg-[#0a0a0a] border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[480px]">
        {/* Search Input Bar */}
        <div className="p-3.5 border-b border-white/10 flex items-center gap-3 bg-black">
          <Search className="w-5 h-5 text-neutral-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search chats... (Ctrl+K)"
            className="w-full bg-transparent text-sm text-white placeholder-neutral-500 focus:outline-none"
          />
          <kbd className="hidden sm:inline-block px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-neutral-400">
            ESC
          </kbd>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {allItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-500">
              No matching commands or conversations found.
            </div>
          ) : (
            allItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    item.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center justify-between text-xs transition cursor-pointer ${
                    isSelected
                      ? 'bg-white text-black border border-white'
                      : 'text-neutral-300 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-1.5 rounded-lg ${
                        isSelected ? 'bg-black text-white' : 'bg-white/5 text-neutral-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className={`font-medium ${isSelected ? 'text-black' : 'text-white'}`}>{item.title}</span>
                  </div>

                  <span className={`text-[10px] font-mono uppercase tracking-wider ${isSelected ? 'text-neutral-700' : 'text-neutral-400'}`}>
                    {item.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-black border-t border-white/10 flex items-center justify-between text-[11px] text-neutral-400">
          <div className="flex items-center gap-3">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
          </div>
          <span className="flex items-center gap-1 text-white">
            <Sparkles className="w-3 h-3" />
            <span>Aether Command</span>
          </span>
        </div>
      </div>
    </div>
  );
};
