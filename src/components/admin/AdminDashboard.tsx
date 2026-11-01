import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  Activity,
  Users,
  MessageSquare,
  HardDrive,
  Radio,
  Send,
  UserX,
  UserCheck,
  Sparkles,
} from 'lucide-react';
import { User } from '../../types';
import { api } from '../../lib/api';
import { Avatar } from '../common/Avatar';

interface AdminDashboardProps {
  isOpen: boolean;
  currentUser: User;
  onClose: () => void;
  onResetAllData?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ isOpen, currentUser, onClose, onResetAllData }) => {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastCategory, setBroadcastCategory] = useState('system');
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      const [statsData, usersData] = await Promise.all([api.getAdminStats(), api.getAdminUsers()]);
      setStats(statsData);
      setUsers(usersData);
    } catch (err) {
      console.error('Failed to load admin data', err);
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastText.trim()) return;
    setIsSendingBroadcast(true);
    try {
      await api.sendBroadcast(broadcastText.trim(), broadcastCategory);
      setBroadcastText('');
      setMsg('System broadcast sent to all live users!');
      setTimeout(() => setMsg(null), 3000);
      loadData();
    } catch (err) {
      console.error('Broadcast failed', err);
    } finally {
      setIsSendingBroadcast(false);
    }
  };

  const toggleBanUser = async (user: User) => {
    try {
      const res = await api.toggleBanUser(user.id);
      setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, isBanned: res.isBanned } : u)));
    } catch (err) {
      console.error('Ban update failed', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="w-full max-w-4xl rounded-3xl glass-panel border border-white/10 shadow-2xl flex flex-col h-[650px] overflow-hidden">
        {/* Top Header */}
        <div className="h-16 px-6 border-b border-white/5 flex items-center justify-between shrink-0 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Operations & Mesh Administration</h2>
              <p className="text-[11px] text-slate-400">Live Telemetry & Global Management</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {msg && (
            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
              {msg}
            </div>
          )}

          {/* Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl glass-card">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Total Users</span>
                <Users className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl font-extrabold text-slate-100">{stats?.totalUsers ?? '...'}</div>
              <div className="text-[10px] text-emerald-400 font-mono mt-1">Verified Accounts</div>
            </div>

            <div className="p-4 rounded-2xl glass-card">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Live Sockets</span>
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-extrabold text-slate-100">{stats?.activeConnections ?? '...'}</div>
              <div className="text-[10px] text-emerald-400 font-mono mt-1">Active Connections</div>
            </div>

            <div className="p-4 rounded-2xl glass-card">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Messages Exchanged</span>
                <MessageSquare className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-extrabold text-slate-100">{stats?.totalMessages ?? '...'}</div>
              <div className="text-[10px] text-blue-400 font-mono mt-1">Stored in Encrypted DB</div>
            </div>

            <div className="p-4 rounded-2xl glass-card">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Conversations</span>
                <Radio className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-2xl font-extrabold text-slate-100">{stats?.totalConversations ?? '...'}</div>
              <div className="text-[10px] text-indigo-400 font-mono mt-1">Chats, Groups & Channels</div>
            </div>
          </div>

          {/* Broadcast Announcement Bar */}
          <div className="p-5 rounded-2xl glass-card border border-cyan-500/30">
            <div className="flex items-center gap-2 mb-3">
              <Radio className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                System Broadcast Announcement
              </h3>
            </div>
            <form onSubmit={handleSendBroadcast} className="flex gap-2">
              <input
                type="text"
                value={broadcastText}
                onChange={e => setBroadcastText(e.target.value)}
                placeholder="Broadcast a system-wide banner to all active users..."
                className="flex-1 px-4 py-2.5 rounded-xl glass-input text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
              <button
                type="submit"
                disabled={isSendingBroadcast || !broadcastText.trim()}
                className="px-5 py-2.5 rounded-xl font-semibold text-xs bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg disabled:opacity-50 transition flex items-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Broadcast</span>
              </button>
            </form>
          </div>

          {/* Wipe & Reset System Data */}
          {onResetAllData && (
            <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-rose-300">Wipe All System Data & Reset to New</h4>
                <p className="text-[11px] text-slate-400">Purges all conversations, messages, stories, and returns the workspace to pristine new state.</p>
              </div>
              <button
                onClick={() => {
                  if (window.confirm('Wipe all system data and reset to brand new? This will clear all messages and conversations.')) {
                    onResetAllData();
                    onClose();
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-200 text-xs font-semibold transition"
              >
                Wipe All Data Now
              </button>
            </div>
          )}

          {/* Users Table */}
          <div>
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
              Registered Accounts ({users.length})
            </h3>
            <div className="rounded-2xl glass-card border border-white/5 overflow-hidden">
              <div className="divide-y divide-white/5">
                {users.map(u => (
                  <div key={u.id} className="p-3.5 flex items-center justify-between hover:bg-white/5 transition">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.displayName} src={u.avatarUrl} isOnline={u.isOnline} size="sm" />
                      <div>
                        <div className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                          <span>{u.displayName}</span>
                          {u.role === 'superadmin' && (
                            <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-400 font-mono text-[9px]">
                              ADMIN
                            </span>
                          )}
                          {u.isBanned && (
                            <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 font-mono text-[9px]">
                              BANNED
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          @{u.username} • {u.email}
                        </div>
                      </div>
                    </div>

                    {u.role !== 'superadmin' && (
                      <button
                        onClick={() => toggleBanUser(u)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition flex items-center gap-1.5 ${
                          u.isBanned
                            ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                        }`}
                      >
                        {u.isBanned ? (
                          <>
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Unban</span>
                          </>
                        ) : (
                          <>
                            <UserX className="w-3.5 h-3.5" />
                            <span>Ban</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
