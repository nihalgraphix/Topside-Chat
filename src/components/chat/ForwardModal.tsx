import React, { useState } from 'react';
import { X, Search, Send, Users, Radio, MessageSquare, Bookmark, Check } from 'lucide-react';
import { Conversation, Message } from '../../types';

interface ForwardModalProps {
  isOpen: boolean;
  message: Message | null;
  conversations: Conversation[];
  onClose: () => void;
  onForward: (targetConversationId: string, message: Message) => void;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  isOpen,
  message,
  conversations,
  onClose,
  onForward,
}) => {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!isOpen || !message) return null;

  const filtered = conversations.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase().trim())
  );

  const handleConfirm = () => {
    if (!selectedId) return;
    onForward(selectedId, message);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl bg-[#111116] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[500px]">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Forward Message</h3>
            <p className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">
              "{message.content || (message.type === 'voice' ? 'Voice note' : 'Media file')}"
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-white/5 bg-black/30 flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search destination chat or group..."
            className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
          />
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.map(c => {
            const isSelected = selectedId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full p-2.5 rounded-xl flex items-center justify-between text-left transition cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-500/20 border border-cyan-500/30 text-white'
                    : 'hover:bg-white/5 text-slate-300 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 ring-1 ring-white/10">
                    <img
                      src={
                        c.avatarUrl ||
                        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(c.name)}`
                      }
                      alt={c.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">{c.name}</div>
                    <div className="text-[10px] text-slate-400 capitalize">{c.type}</div>
                  </div>
                </div>

                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 bg-black/50 border-t border-white/5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            Cancel
          </button>
          <button
            disabled={!selectedId}
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 transition flex items-center gap-1.5 shadow-md"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Forward Now</span>
          </button>
        </div>
      </div>
    </div>
  );
};
