import React, { useState } from 'react';
import {
  X,
  Bell,
  Lock,
  Clock,
  Shield,
  FileText,
  Image as ImageIcon,
  Link2,
  Music,
  Users,
  AlertTriangle,
  UserX,
  ChevronRight,
  ExternalLink,
  Download,
} from 'lucide-react';
import { Conversation, Message, User } from '../../types';
import { Avatar } from '../common/Avatar';
import { api } from '../../lib/api';

interface InfoPanelProps {
  conversation: Conversation;
  messages: Message[];
  currentUser: User;
  onClose: () => void;
  onImageClick: (url: string) => void;
  onBlockUser?: () => void;
  onReport?: () => void;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({
  conversation,
  messages,
  currentUser,
  onClose,
  onImageClick,
  onBlockUser,
  onReport,
}) => {
  const [activeTab, setActiveTab] = useState<'media' | 'files' | 'links' | 'members'>('media');
  const [isMuted, setIsMuted] = useState(conversation.isMuted || false);
  const [disappearingTime, setDisappearingTime] = useState<string>('Off');

  const uniqueMessages: Message[] = Array.from(
    new Map<string, Message>(
      messages.filter((m): m is Message => Boolean(m && m.id)).map(m => [m.id, m])
    ).values()
  );

  const mediaMessages = uniqueMessages.filter(m => m.type === 'image' || m.type === 'video');
  const fileMessages = uniqueMessages.filter(m => m.type === 'document');
  const audioMessages = uniqueMessages.filter(m => m.type === 'voice' || m.type === 'audio');

  const handleToggleMute = async () => {
    const res = await api.toggleMuteConversation(conversation.id);
    setIsMuted(res.isMuted);
  };

  const isDirect = conversation.type === 'direct';
  const otherMember = isDirect ? conversation.members.find(m => m.userId !== currentUser.id) : null;

  return (
    <div className="w-full md:w-80 lg:w-96 border-l border-white/10 bg-[#050505] flex flex-col h-full overflow-y-auto shrink-0 select-none">
      {/* Top Header */}
      <div className="h-16 px-6 flex items-center justify-between border-b border-white/10 shrink-0">
        <h3 className="text-sm font-bold text-white">
          {conversation.type === 'group' ? 'Group Info' : 'User Profile'}
        </h3>
        <button onClick={onClose} className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Hero Profile View */}
      <div className="p-6 flex flex-col items-center text-center border-b border-white/10">
        <Avatar
          name={conversation.name}
          src={conversation.avatarUrl}
          isOnline={otherMember?.user?.isOnline}
          size="xl"
          className="mb-4 shadow-2xl ring-4 ring-white/10"
        />
        <h2 className="text-base font-bold text-white">{conversation.name}</h2>
        {otherMember?.user && (
          <div className="text-xs text-neutral-400 font-mono mt-0.5">@{otherMember.user.username}</div>
        )}
        {conversation.description && (
          <p className="text-xs text-neutral-400 mt-2 max-w-xs leading-relaxed">{conversation.description}</p>
        )}
        {otherMember?.user?.bio && (
          <p className="text-xs text-neutral-400 mt-2 max-w-xs leading-relaxed">{otherMember.user.bio}</p>
        )}
      </div>

      {/* Security & Cryptography Details */}
      <div className="p-4 border-b border-white/10 space-y-3">
        <div className="flex items-center justify-between p-3 rounded-2xl bg-[#111111] border border-white/10">
          <div className="flex items-center gap-3">
            <Lock className="w-4 h-4 text-white" />
            <div>
              <div className="text-xs font-semibold text-white">Encryption Status</div>
              <div className="text-[10px] text-neutral-400 font-mono">End-to-End Cryptographic Session</div>
            </div>
          </div>
          <span className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
        </div>

        <div className="flex items-center justify-between p-3 rounded-2xl bg-[#111111] border border-white/10">
          <div className="flex items-center gap-3">
            <Bell className="w-4 h-4 text-neutral-400" />
            <div>
              <div className="text-xs font-semibold text-white">Mute Notifications</div>
              <div className="text-[10px] text-neutral-400">{isMuted ? 'Muted' : 'Enabled'}</div>
            </div>
          </div>
          <button
            onClick={handleToggleMute}
            className={`w-10 h-6 rounded-full transition-colors relative p-0.5 ${
              isMuted ? 'bg-white' : 'bg-neutral-700'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full transition-transform ${
                isMuted ? 'translate-x-4 bg-black' : 'translate-x-0 bg-white'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between p-3 rounded-2xl bg-[#111111] border border-white/10">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-neutral-400" />
            <div>
              <div className="text-xs font-semibold text-white">Disappearing Messages</div>
              <div className="text-[10px] text-neutral-400">Current: {disappearingTime}</div>
            </div>
          </div>
          <select
            value={disappearingTime}
            onChange={e => setDisappearingTime(e.target.value)}
            className="bg-black text-xs text-white rounded-lg px-2 py-1 border border-white/15"
          >
            <option value="Off">Off</option>
            <option value="24 Hours">24 Hours</option>
            <option value="7 Days">7 Days</option>
            <option value="30 Days">30 Days</option>
          </select>
        </div>
      </div>

      {/* Shared Media Tabs */}
      <div className="flex items-center justify-around border-b border-white/10 px-2 pt-2">
        <button
          onClick={() => setActiveTab('media')}
          className={`pb-2.5 text-xs font-semibold transition border-b-2 flex items-center gap-1.5 ${
            activeTab === 'media'
              ? 'border-white text-white'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Media ({mediaMessages.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('files')}
          className={`pb-2.5 text-xs font-semibold transition border-b-2 flex items-center gap-1.5 ${
            activeTab === 'files'
              ? 'border-white text-white'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Files ({fileMessages.length})</span>
        </button>

        {conversation.type !== 'direct' && (
          <button
            onClick={() => setActiveTab('members')}
            className={`pb-2.5 text-xs font-semibold transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'members'
                ? 'border-white text-white'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Members ({conversation.members.length})</span>
          </button>
        )}
      </div>

      {/* Tab Content Area */}
      <div className="p-4 flex-1">
        {activeTab === 'media' && (
          <div>
            {mediaMessages.length === 0 ? (
              <div className="py-8 text-center text-neutral-500 text-xs">No media shared yet</div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {mediaMessages.map(m => (
                  <div
                    key={m.id}
                    onClick={() => m.mediaUrl && onImageClick(m.mediaUrl)}
                    className="aspect-square rounded-xl overflow-hidden cursor-pointer hover:opacity-80 transition relative bg-[#141414] border border-white/10"
                  >
                    <img src={m.mediaUrl} alt="Shared" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-2">
            {fileMessages.length === 0 ? (
              <div className="py-8 text-center text-neutral-500 text-xs">No documents shared yet</div>
            ) : (
              fileMessages.map(m => (
                <div key={m.id} className="p-2.5 rounded-xl bg-[#111111] border border-white/10 flex items-center gap-3">
                  <FileText className="w-4 h-4 text-white shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-white truncate">{m.fileName || m.content}</div>
                    <div className="text-[10px] text-neutral-400">
                      {m.fileSize ? `${Math.round(m.fileSize / 1024)} KB` : 'Document'}
                    </div>
                  </div>
                  {m.mediaUrl && (
                    <a href={m.mediaUrl} download className="p-1.5 text-neutral-400 hover:text-white">
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-2">
            {conversation.members.map(mem => (
              <div key={mem.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5">
                <div className="flex items-center gap-2.5">
                  <Avatar name={mem.user?.displayName || 'User'} src={mem.user?.avatarUrl} size="sm" isOnline={mem.user?.isOnline} />
                  <div>
                    <div className="text-xs font-semibold text-white">{mem.user?.displayName}</div>
                    <div className="text-[10px] text-neutral-400">@{mem.user?.username}</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/10 text-white">
                  {mem.role}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Danger Zone */}
      {isDirect && (
        <div className="p-4 border-t border-white/10 space-y-2">
          <button
            onClick={onBlockUser}
            className="w-full py-2.5 px-4 rounded-xl bg-[#111111] border border-white/10 text-neutral-300 hover:text-white hover:bg-white/10 text-xs font-semibold flex items-center justify-center gap-2 transition"
          >
            <UserX className="w-4 h-4" />
            <span>Block Contact</span>
          </button>
          <button
            onClick={onReport}
            className="w-full py-2.5 px-4 rounded-xl bg-[#111111] border border-white/10 text-neutral-400 hover:text-white hover:bg-white/10 text-xs font-medium flex items-center justify-center gap-2 transition"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Report Conversation</span>
          </button>
        </div>
      )}
    </div>
  );
};
