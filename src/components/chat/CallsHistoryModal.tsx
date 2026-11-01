import React from 'react';
import {
  X,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Video,
  Clock,
  User,
} from 'lucide-react';
import { Call, User as UserType } from '../../types';

interface CallsHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  calls: Call[];
  currentUser: UserType;
  onStartCall: (userId: string, type: 'voice' | 'video', name: string, avatarUrl?: string) => void;
}

export const CallsHistoryModal: React.FC<CallsHistoryModalProps> = ({
  isOpen,
  onClose,
  calls,
  currentUser,
  onStartCall,
}) => {
  if (!isOpen) return null;

  const formatDuration = (sec?: number) => {
    if (!sec) return 'Missed';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none animate-in fade-in">
      <div className="w-full max-w-lg rounded-2xl bg-[#111116] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[560px]">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Call History & Logs</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {calls.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No recent calls recorded in SQLite database.
            </div>
          ) : (
            calls.map(c => {
              const isOutgoing = c.callerId === currentUser.id;
              const contactUser = isOutgoing ? c.receiver : c.caller;
              const contactName = contactUser?.displayName || (isOutgoing ? 'Outgoing Contact' : 'Incoming Contact');
              const contactAvatar = contactUser?.avatarUrl;
              const isMissed = c.status === 'rejected' || !c.duration;

              return (
                <div
                  key={c.id}
                  className="p-3 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 ring-1 ring-white/10">
                      <img
                        src={
                          contactAvatar ||
                          `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(contactName)}`
                        }
                        alt={contactName}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{contactName}</div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                        {isOutgoing ? (
                          <PhoneOutgoing className="w-3 h-3 text-cyan-400" />
                        ) : isMissed ? (
                          <PhoneMissed className="w-3 h-3 text-rose-400" />
                        ) : (
                          <PhoneIncoming className="w-3 h-3 text-emerald-400" />
                        )}
                        <span className={isMissed ? 'text-rose-400' : 'text-slate-300'}>
                          {isMissed ? 'Missed Call' : formatDuration(c.duration)}
                        </span>
                        <span>•</span>
                        <span>{formatTime(c.startedAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Redial Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        onClose();
                        onStartCall(contactUser?.id || c.callerId, 'voice', contactName, contactAvatar);
                      }}
                      title="Redial Voice Call"
                      className="p-2 rounded-xl bg-white/5 hover:bg-cyan-500 hover:text-slate-950 text-slate-300 transition cursor-pointer"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        onClose();
                        onStartCall(contactUser?.id || c.callerId, 'video', contactName, contactAvatar);
                      }}
                      title="Redial Video Call"
                      className="p-2 rounded-xl bg-white/5 hover:bg-cyan-500 hover:text-slate-950 text-slate-300 transition cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
