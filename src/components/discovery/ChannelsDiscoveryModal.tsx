import React, { useState } from 'react';
import { X, Search, Radio, Users, Check, Sparkles, Bell, ExternalLink } from 'lucide-react';
import { Conversation } from '../../types';

interface ChannelsDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectChannel: (channelId: string) => void;
  onSubscribe: (channelId: string) => void;
}

export const ChannelsDiscoveryModal: React.FC<ChannelsDiscoveryModalProps> = ({
  isOpen,
  onClose,
  onSelectChannel,
  onSubscribe,
}) => {
  const [search, setSearch] = useState('');
  const [subscribedIds, setSubscribedIds] = useState<string[]>([]);

  if (!isOpen) return null;

  const publicChannels = [
    {
      id: 'pub_tech',
      name: 'Tech Horizon & AI Daily',
      username: '@techhorizon',
      subscribers: '124.5K',
      description: 'Daily curated breakthroughs in artificial intelligence, neural interfaces, quantum computing, and decentralized tech.',
      avatarUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=150&auto=format&fit=crop&q=80',
      category: 'Technology',
    },
    {
      id: 'pub_crypto',
      name: 'Crypto & Zero-Knowledge Alpha',
      username: '@zkalpha',
      subscribers: '89.2K',
      description: 'Institutional-grade cryptographic research, ZK proofs, rollup performance metrics, and Web3 security audits.',
      avatarUrl: 'https://images.unsplash.com/photo-1622979135225-d2ba269bc1df?w=150&auto=format&fit=crop&q=80',
      category: 'Finance',
    },
    {
      id: 'pub_design',
      name: 'Aether Glassmorphism & UI Design',
      username: '@aetherdesign',
      subscribers: '62.8K',
      description: 'Futuristic design inspirations, dark-mode color palettes, fluid physics animation systems, and Figma asset drops.',
      avatarUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=150&auto=format&fit=crop&q=80',
      category: 'Design',
    },
    {
      id: 'pub_cyber',
      name: 'Global Mesh Security & Privacy',
      username: '@meshprivacy',
      subscribers: '41.1K',
      description: 'End-to-end encryption protocols, digital sovereignty guides, OpSec practices, and vulnerability dispatches.',
      avatarUrl: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=150&auto=format&fit=crop&q=80',
      category: 'Security',
    },
  ];

  const filtered = publicChannels.filter(
    c =>
      c.name.toLowerCase().includes(search.toLowerCase().trim()) ||
      c.description.toLowerCase().includes(search.toLowerCase().trim()) ||
      c.category.toLowerCase().includes(search.toLowerCase().trim())
  );

  const handleToggleSub = (id: string) => {
    if (subscribedIds.includes(id)) {
      setSubscribedIds(subscribedIds.filter(x => x !== id));
    } else {
      setSubscribedIds([...subscribedIds, id]);
      onSubscribe(id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none animate-in fade-in">
      <div className="w-full max-w-xl rounded-2xl bg-[#111116] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[580px]">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Public Channels Discovery</h3>
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
            placeholder="Search channels by topic, name or @username..."
            className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
          />
        </div>

        {/* Channels Grid */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {filtered.map(ch => {
            const isSubbed = subscribedIds.includes(ch.id);
            return (
              <div
                key={ch.id}
                className="p-3.5 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl overflow-hidden shrink-0 ring-1 ring-white/10">
                    <img
                      src={ch.avatarUrl}
                      alt={ch.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-white truncate">{ch.name}</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 font-mono">
                        {ch.category}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {ch.username} • {ch.subscribers} subscribers
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                      {ch.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    onClick={() => handleToggleSub(ch.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      isSubbed
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                    }`}
                  >
                    {isSubbed ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Subscribed</span>
                      </>
                    ) : (
                      <>
                        <Bell className="w-3.5 h-3.5" />
                        <span>Subscribe</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
