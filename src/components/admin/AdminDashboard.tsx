import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  Activity,
  Users,
  MessageSquare,
  Radio,
  Send,
  UserX,
  UserCheck,
  Trash2,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { User } from '../../types';
import { api, isSuperAdminUser, verifySuperAdminCredentials } from '../../lib/api';
import { Avatar } from '../common/Avatar';

interface AdminDashboardProps {
  isOpen: boolean;
  currentUser: User;
  onClose: () => void;
  onResetAllData?: () => void;
  onClearChatsOnly?: () => void;
  onUserDeleted?: (userId: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  isOpen,
  currentUser,
  onClose,
  onResetAllData,
  onClearChatsOnly,
  onUserDeleted,
}) => {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [broadcastText, setBroadcastText] = useState('');
  const [broadcastCategory] = useState('system');
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmMode, setConfirmMode] = useState<'none' | 'clear_chats' | 'reset_all' | 'delete_all_users'>('none');
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  // Admin credential unlock for nihal.graphix / SALMANIZAR2244
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isCredsVerified, setIsCredsVerified] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('aether_superadmin_unlocked') === '1') {
      return true;
    }
    return isSuperAdminUser(currentUser);
  });
  const [authError, setAuthError] = useState<string | null>(null);

  const canManageDataAndUsers = isCredsVerified || isSuperAdminUser(currentUser);

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

  const handleUnlockSuperAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (verifySuperAdminCredentials(adminUsername, adminPassword)) {
      setIsCredsVerified(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('aether_superadmin_unlocked', '1');
      }
      setMsg('Superadmin controls unlocked for nihal.graphix.');
    } else {
      setAuthError('Invalid credentials. Enter username=nihal.graphix and pass=SALMANIZAR2244');
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

  const handleDeleteSingleUser = async (targetUser: User) => {
    if (!canManageDataAndUsers) return;
    setIsWorking(true);
    try {
      await api.deleteUserAccount(targetUser);
      setUsers(prev =>
        prev.filter(
          u =>
            u.id !== targetUser.id &&
            u.username.toLowerCase() !== targetUser.username.toLowerCase()
        )
      );
      setConfirmDeleteUserId(null);
      onUserDeleted?.(targetUser.id);
      setMsg(`Deleted user @${targetUser.username} (${targetUser.displayName}).`);
    } catch (err) {
      console.error('Failed to delete user', err);
    } finally {
      setIsWorking(false);
    }
  };

  const handleDeleteAllUsers = async () => {
    if (!canManageDataAndUsers) return;
    setIsWorking(true);
    try {
      const toDelete = users.filter(u => !isSuperAdminUser(u));
      for (const u of toDelete) {
        await api.deleteUserAccount(u);
        onUserDeleted?.(u.id);
      }
      setUsers(prev => prev.filter(u => isSuperAdminUser(u)));
      setConfirmMode('none');
      setMsg(`Deleted ${toDelete.length} user account(s).`);
    } catch (err) {
      console.error('Failed to delete all users', err);
    } finally {
      setIsWorking(false);
    }
  };

  const handleClearChatsOnly = async () => {
    if (!canManageDataAndUsers) return;
    setIsWorking(true);
    try {
      if (onClearChatsOnly) {
        await onClearChatsOnly();
      } else {
        await api.clearAllChatsOnly();
      }
      setConfirmMode('none');
      setMsg('All chat conversations, messages, stories, and call logs cleared.');
      await loadData();
    } catch (err) {
      console.error('Failed to clear chats', err);
    } finally {
      setIsWorking(false);
    }
  };

  const handleFullReset = async () => {
    if (!canManageDataAndUsers) return;
    setIsWorking(true);
    try {
      setConfirmMode('none');
      if (onResetAllData) {
        onResetAllData();
        onClose();
      } else {
        await api.resetAllData();
        window.location.reload();
      }
    } finally {
      setIsWorking(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="w-full max-w-4xl rounded-3xl glass-panel border border-white/10 shadow-2xl flex flex-col h-[680px] overflow-hidden bg-[#080808]">
        {/* Top Header */}
        <div className="h-16 px-6 border-b border-white/10 flex items-center justify-between shrink-0 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>Operations & Mesh Administration</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono">
                  nihal.graphix
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">Live Telemetry, User Deletion & Data Clearing</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {msg && (
            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center justify-between">
              <span>{msg}</span>
              <button onClick={() => setMsg(null)} className="text-cyan-200 hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl glass-card">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Total Users</span>
                <Users className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl font-extrabold text-slate-100">
                {users.length || stats?.totalUsers || 0}
              </div>
              <div className="text-[10px] text-emerald-400 font-mono mt-1">Verified Accounts</div>
            </div>

            <div className="p-4 rounded-2xl glass-card">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Live Sockets</span>
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-extrabold text-slate-100">
                {stats?.activeConnections ?? stats?.activeUsers ?? 1}
              </div>
              <div className="text-[10px] text-emerald-400 font-mono mt-1">Active Connections</div>
            </div>

            <div className="p-4 rounded-2xl glass-card">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Messages Exchanged</span>
                <MessageSquare className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-extrabold text-slate-100">
                {stats?.totalMessages ?? stats?.messagesSent ?? 0}
              </div>
              <div className="text-[10px] text-blue-400 font-mono mt-1">Stored in Encrypted DB</div>
            </div>

            <div className="p-4 rounded-2xl glass-card">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Conversations</span>
                <Radio className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-2xl font-extrabold text-slate-100">
                {stats?.totalConversations ?? stats?.totalGroups ?? 0}
              </div>
              <div className="text-[10px] text-indigo-400 font-mono mt-1">Direct & Group Chats</div>
            </div>
          </div>

          {/* Unlock Superadmin Controls if not unlocked */}
          {!canManageDataAndUsers && (
            <form
              onSubmit={handleUnlockSuperAdmin}
              className="p-4 rounded-2xl bg-white/[0.03] border border-white/15 space-y-3"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Unlock Data Clearing & User Deleting (nihal.graphix)</span>
              </div>
              {authError && <div className="text-xs text-rose-400">{authError}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={adminUsername}
                  onChange={e => setAdminUsername(e.target.value)}
                  placeholder="Username (nihal.graphix)"
                  className="px-3 py-2 rounded-xl bg-black border border-white/15 text-xs text-white focus:outline-none focus:border-white"
                />
                <input
                  type="password"
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  placeholder="Password"
                  className="px-3 py-2 rounded-xl bg-black border border-white/15 text-xs text-white focus:outline-none focus:border-white"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-white text-black font-bold text-xs hover:bg-neutral-200 transition cursor-pointer"
                >
                  Unlock Controls
                </button>
              </div>
            </form>
          )}

          {/* Wipe & Reset System Data (Exclusive to nihal.graphix / SALMANIZAR2244) */}
          {canManageDataAndUsers && (
            <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Superadmin Data Clearing & Reset (nihal.graphix)</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Clear all chat messages/conversations only, delete all other users, or wipe all chats & users.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={() => setConfirmMode('clear_chats')}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 text-black hover:bg-amber-400 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    Clear All Chats Only
                  </button>
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={() => setConfirmMode('delete_all_users')}
                    className="px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    Delete All Other Users
                  </button>
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={() => setConfirmMode('reset_all')}
                    className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    Wipe All Data Now
                  </button>
                </div>
              </div>

              {confirmMode !== 'none' && (
                <div className="p-3 rounded-xl bg-black/80 border border-white/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="text-xs text-white font-medium">
                    {confirmMode === 'clear_chats' &&
                      'Confirm clearing ALL chat conversations, messages, stories, and call logs? (User accounts will be preserved)'}
                    {confirmMode === 'delete_all_users' &&
                      'Confirm deleting ALL non-superadmin user accounts across Cloud & Server?'}
                    {confirmMode === 'reset_all' &&
                      'Confirm wiping ALL system data (all chats, messages, and all users)?'}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => {
                        if (confirmMode === 'clear_chats') void handleClearChatsOnly();
                        else if (confirmMode === 'delete_all_users') void handleDeleteAllUsers();
                        else if (confirmMode === 'reset_all') void handleFullReset();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-bold hover:bg-neutral-200 transition cursor-pointer"
                    >
                      {isWorking ? 'Working...' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      disabled={isWorking}
                      onClick={() => setConfirmMode('none')}
                      className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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
                className="px-5 py-2.5 rounded-xl font-semibold text-xs bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg disabled:opacity-50 transition flex items-center gap-2 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Broadcast</span>
              </button>
            </form>
          </div>

          {/* Users Table */}
          <div>
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
              Registered Accounts ({users.length})
            </h3>
            <div className="rounded-2xl glass-card border border-white/5 overflow-hidden">
              <div className="divide-y divide-white/5">
                {users.map(u => (
                  <div key={u.id || u.username} className="p-3.5 flex items-center justify-between hover:bg-white/5 transition">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.displayName} src={u.avatarUrl} isOnline={u.isOnline} size="sm" />
                      <div>
                        <div className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                          <span>{u.displayName}</span>
                          {(u.role === 'superadmin' || isSuperAdminUser(u)) && (
                            <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-400 font-mono text-[9px]">
                              SUPERADMIN
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

                    <div className="flex items-center gap-2">
                      {u.role !== 'superadmin' && !isSuperAdminUser(u) && (
                        <button
                          onClick={() => toggleBanUser(u)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                            u.isBanned
                              ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
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

                      {canManageDataAndUsers && (
                        <>
                          {confirmDeleteUserId === u.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                disabled={isWorking}
                                onClick={() => handleDeleteSingleUser(u)}
                                className="px-2.5 py-1.5 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition cursor-pointer"
                              >
                                Confirm Delete
                              </button>
                              <button
                                disabled={isWorking}
                                onClick={() => setConfirmDeleteUserId(null)}
                                className="px-2 py-1.5 rounded-xl bg-white/10 text-slate-300 hover:text-white text-xs transition cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteUserId(u.id)}
                              className="px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete User</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
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

