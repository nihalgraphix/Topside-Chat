import React, { useState, useRef } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Phone,
  Video,
  ArrowLeftRight,
  MapPin,
  FileText,
  UserCheck,
  X,
  Send,
  DollarSign,
  Check,
} from 'lucide-react';
import { Conversation, Message, User } from '../../types';

interface MediaActionsPanelProps {
  conversation: Conversation;
  messages?: Message[];
  currentUser: User;
  onStartCall: (type: 'voice' | 'video') => void;
  onSendMessage: (data: any) => void;
  onImageClick: (url: string) => void;
}

export const MediaActionsPanel: React.FC<MediaActionsPanelProps> = ({
  conversation,
  messages = [],
  currentUser,
  onStartCall,
  onSendMessage,
  onImageClick,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Modals for quick actions
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  // Shared photos from the actual conversation messages (deduplicated by id)
  const sharedPhotos: Array<{ id: string; title: string; thumbnail: string }> = Array.from(
    new Map<string, { id: string; title: string; thumbnail: string }>(
      messages
        .filter((m): m is Message => Boolean(m && m.id && m.type === 'image' && m.mediaUrl))
        .map(m => [
          m.id,
          {
            id: m.id,
            title: m.content || 'Shared photo',
            thumbnail: m.mediaUrl!,
          },
        ])
    ).values()
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fakeUrl = URL.createObjectURL(file);
    const isImg = file.type.startsWith('image/');
    onSendMessage({
      type: isImg ? 'image' : 'document',
      content: file.name,
      mediaUrl: fakeUrl,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExecuteTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    onSendMessage({
      type: 'text',
      content: `💸 Transfer Sent: $${transferAmount}\nNote: ${transferNote}\nStatus: Completed`,
    });
    setShowTransferModal(false);
  };

  const handleSendLocation = (e: React.FormEvent) => {
    e.preventDefault();
    onSendMessage({
      type: 'location',
      content: locationName,
      location: {
        latitude: 37.7749,
        longitude: -122.4194,
        title: locationName,
      },
    },
    );
    setShowLocationModal(false);
  };

  const handleSendContactCard = (e: React.FormEvent) => {
    e.preventDefault();
    onSendMessage({
      type: 'contact',
      content: `Contact: ${contactName}`,
      contactCard: {
        name: contactName,
        phone: contactPhone,
        email: conversation.email || '',
      },
    });
    setShowContactModal(false);
  };

  return (
    <aside className="w-80 lg:w-[340px] shrink-0 h-full flex flex-col p-4 bg-[#0a0a0c] border-l border-[#1b1b20] overflow-y-auto select-none scrollbar-none">
      {/* Hidden file inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
      />
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Top Action: Take Photos Card */}
      <div className="mb-4">
        <button
          onClick={() => cameraInputRef.current?.click()}
          className="w-full h-24 rounded-2xl bg-[#141418] hover:bg-[#18181e] border border-[#222228] flex flex-col items-center justify-center gap-2 group transition duration-200 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 group-hover:text-white transition">
            <Camera className="w-6 h-6 stroke-[1.75]" />
          </div>
          <span className="text-xs font-medium text-slate-200 group-hover:text-white transition">
            Share Photo
          </span>
        </button>
      </div>

      {/* Shared Conversation Media */}
      <div className="mb-5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-2.5 px-1">
          Shared Media ({sharedPhotos.length})
        </div>
        {sharedPhotos.length > 0 ? (
          <div className="grid grid-cols-2 gap-2.5">
            {sharedPhotos.map(item => (
              <div
                key={item.id}
                onClick={() => onImageClick(item.thumbnail)}
                className="group relative aspect-square rounded-xl overflow-hidden bg-[#16161b] border border-[#222228] cursor-pointer hover:border-slate-500/40 transition"
              >
                <img
                  src={item.thumbnail}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  referrerPolicy="no-referrer"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 px-4 rounded-2xl bg-[#111114] border border-white/5 text-center flex flex-col items-center justify-center">
            <ImageIcon className="w-6 h-6 text-neutral-600 mb-2" />
            <p className="text-xs text-neutral-500">No shared photos in this chat yet</p>
          </div>
        )}
      </div>

      {/* Quick Actions Grid (2 columns x 3 rows) */}
      <div className="mt-auto pt-2 grid grid-cols-2 gap-2.5">
        {/* Voice Call */}
        <button
          onClick={() => onStartCall('voice')}
          className="h-16 rounded-2xl bg-[#16161a] hover:bg-[#1f1f26] border border-[#222228] flex flex-col items-center justify-center gap-1.5 text-slate-200 hover:text-white transition"
        >
          <Phone className="w-4 h-4 text-slate-300" />
          <span className="text-[11px] font-medium tracking-wide">Voice Call</span>
        </button>

        {/* Video Call */}
        <button
          onClick={() => onStartCall('video')}
          className="h-16 rounded-2xl bg-[#16161a] hover:bg-[#1f1f26] border border-[#222228] flex flex-col items-center justify-center gap-1.5 text-slate-200 hover:text-white transition"
        >
          <Video className="w-4 h-4 text-slate-300" />
          <span className="text-[11px] font-medium tracking-wide">Video Call</span>
        </button>

        {/* Transfer */}
        <button
          onClick={() => setShowTransferModal(true)}
          className="h-16 rounded-2xl bg-[#16161a] hover:bg-[#1f1f26] border border-[#222228] flex flex-col items-center justify-center gap-1.5 text-slate-200 hover:text-white transition"
        >
          <ArrowLeftRight className="w-4 h-4 text-slate-300" />
          <span className="text-[11px] font-medium tracking-wide">Transfer</span>
        </button>

        {/* Location */}
        <button
          onClick={() => setShowLocationModal(true)}
          className="h-16 rounded-2xl bg-[#16161a] hover:bg-[#1f1f26] border border-[#222228] flex flex-col items-center justify-center gap-1.5 text-slate-200 hover:text-white transition"
        >
          <MapPin className="w-4 h-4 text-slate-300" />
          <span className="text-[11px] font-medium tracking-wide">Location</span>
        </button>

        {/* File */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="h-16 rounded-2xl bg-[#16161a] hover:bg-[#1f1f26] border border-[#222228] flex flex-col items-center justify-center gap-1.5 text-slate-200 hover:text-white transition"
        >
          <FileText className="w-4 h-4 text-slate-300" />
          <span className="text-[11px] font-medium tracking-wide">File</span>
        </button>

        {/* Contact Card */}
        <button
          onClick={() => setShowContactModal(true)}
          className="h-16 rounded-2xl bg-[#16161a] hover:bg-[#1f1f26] border border-[#222228] flex flex-col items-center justify-center gap-1.5 text-slate-200 hover:text-white transition"
        >
          <UserCheck className="w-4 h-4 text-slate-300" />
          <span className="text-[11px] font-medium tracking-wide">Contact Card</span>
        </button>
      </div>

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#141418] border border-[#26262e] p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                  <ArrowLeftRight className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Transfer to {conversation.name}</h3>
              </div>
              <button
                onClick={() => setShowTransferModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleExecuteTransfer} className="space-y-4">
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1.5">Amount ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={transferAmount}
                    onChange={e => setTransferAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-[#1b1b22] border border-[#2a2a34] text-white text-sm focus:outline-none focus:border-white/40 font-mono"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1.5">Note</label>
                <input
                  type="text"
                  value={transferNote}
                  onChange={e => setTransferNote(e.target.value)}
                  placeholder="What is this for?"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#1b1b22] border border-[#2a2a34] text-white text-xs focus:outline-none focus:border-white/40"
                />
              </div>
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-[#202026] text-slate-300 text-xs font-semibold hover:bg-[#282830] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-white text-black text-xs font-bold hover:bg-slate-200 transition"
                >
                  Send Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#141418] border border-[#26262e] p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                  <MapPin className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Share Location</h3>
              </div>
              <button
                onClick={() => setShowLocationModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSendLocation} className="space-y-4">
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1.5">Location Name / Landmark</label>
                <input
                  type="text"
                  value={locationName}
                  onChange={e => setLocationName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#1b1b22] border border-[#2a2a34] text-white text-xs focus:outline-none focus:border-white/40"
                  required
                />
              </div>
              <div className="h-32 rounded-xl bg-[#141414] border border-white/15 flex flex-col items-center justify-center text-neutral-400 text-xs">
                <MapPin className="w-8 h-8 text-white mb-1" />
                <span>37.7749° N, 122.4194° W</span>
              </div>
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowLocationModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-[#202026] text-slate-300 text-xs font-semibold hover:bg-[#282830] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-white text-black text-xs font-bold hover:bg-slate-200 transition"
                >
                  Send Pin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#141418] border border-[#26262e] p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                  <UserCheck className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white">Send Contact Card</h3>
              </div>
              <button
                onClick={() => setShowContactModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSendContactCard} className="space-y-4">
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#1b1b22] border border-[#2a2a34] text-white text-xs focus:outline-none focus:border-white/40"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1.5">Phone Number</label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#1b1b22] border border-[#2a2a34] text-white text-xs focus:outline-none focus:border-white/40 font-mono"
                  required
                />
              </div>
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowContactModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-[#202026] text-slate-300 text-xs font-semibold hover:bg-[#282830] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-white text-black text-xs font-bold hover:bg-slate-200 transition"
                >
                  Share Card
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
};
