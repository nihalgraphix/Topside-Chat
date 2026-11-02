import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Users, MessageSquare, Check, Sparkles, UserPlus, RefreshCw, Loader2 } from 'lucide-react';
import { User } from '../../types';
import { Avatar } from '../common/Avatar';
import { api } from '../../lib/api';

interface NewConversationModalProps {
  isOpen: boolean;
  initialType?: 'direct' | 'group' | 'channel';
  currentUser: User;
  initialContacts?: User[];
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}

export const NewConversationModal: React.FC<NewConversationModalProps> = ({
  isOpen,
  initialType = 'direct',
  currentUser,
  initialContacts = [],
  onClose,
  onCreated,
}) => {
  const [tab, setTab] = useState<'direct' | 'group'>(initialType === 'group' ? 'group' : 'direct');
  const [users, setUsers] = useState<User[]>(initialContacts);
  const [search, setSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // New Contact fields for quick adding
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [contactError, setContactError] = useState<string | null>(null);

  const loadUsers = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsLoadingUsers(true);
    try {
      const [searched, contacts] = await Promise.all([
        api.searchUsers(''),
        api.getContacts(),
      ]);
      const byKey = new Map<string, User>();
      for (const u of [...initialContacts, ...searched, ...contacts]) {
        if (!u || !u.id) continue;
        const key = (u.username || u.email || u.id).toLowerCase();
        if (!byKey.has(key)) {
          byKey.set(key, u);
        }
      }
      setUsers(Array.from(byKey.values()));
    } catch (err) {
      console.error(err);
    } finally {
      if (showSpinner) setIsLoadingUsers(false);
    }
  }, [initialContacts]);

  useEffect(() => {
    if (initialContacts.length > 0 && users.length === 0) {
      setUsers(initialContacts);
    }
  }, [initialContacts, users.length]);

  useEffect(() => {
    if (!isOpen) return;
    loadUsers(users.length === 0);
    setContactError(null);
    const interval = setInterval(() => {
      loadUsers(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [isOpen, loadUsers]);

  if (!isOpen) return null;

  const isSelfUser = (u: User) => {
    if (u.id === currentUser.id) return true;
    if (u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) return true;
    if (u.username && currentUser.username && u.username.toLowerCase() === currentUser.username.toLowerCase()) return true;
    return false;
  };

  const validOtherUsers = users.filter(u => {
    if (isSelfUser(u)) return false;
    if (
      u.id === 'u_1789118066028_c7hyx' ||
      u.username === 'directory_reader' ||
      u.username === 'guest_viewer' ||
      /john\s*fran/i.test(u.displayName || '') ||
      /john\s*fran/i.test(u.username || '') ||
      /john\s*fran/i.test(u.email || '')
    ) {
      return false;
    }
    return true;
  });

  const directoryUsers: User[] = [
    ...validOtherUsers,
    ...(currentUser ? [currentUser] : []),
  ];

  const filteredUsers = directoryUsers.filter(u => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase().replace(/^@/, '');
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.phone && u.phone.toLowerCase().includes(q))
    );
  });

  const toggleUserSelection = (id: string) => {
    if (tab === 'direct') {
      handleCreateDirect(id);
      return;
    }

    setSelectedUserIds(prev =>
      prev.includes(id) ? prev.filter(uId => uId !== id) : [...prev, id]
    );
  };

  const handleCreateDirect = async (targetUserId: string) => {
    setIsSubmitting(true);
    try {
      const conv = await api.createConversation({
        type: 'direct',
        memberIds: [targetUserId],
      });
      onCreated(conv.id);
      onClose();
    } catch (err) {
      console.error('Failed to create direct chat', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickAddAndChat = async (rawQuery: string) => {
    const queryStr = rawQuery.trim();
    if (!queryStr) return;

    setContactError(null);
    setIsSubmitting(true);
    try {
      const foundUser = await api.createContact({
        name: queryStr.includes('@') ? undefined : queryStr,
        email: queryStr.includes('@') ? queryStr.toLowerCase() : undefined,
        username: queryStr.toLowerCase().replace(/^@/, ''),
      });
      const conv = await api.createConversation({
        type: 'direct',
        memberIds: [foundUser.id],
      });
      onCreated(conv.id);
      onClose();
    } catch (err: any) {
      console.error(err);
      setContactError(err.message || 'Could not add contact.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateNewContact = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleQuickAddAndChat(contactEmail);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const conv = await api.createConversation({
        type: 'group',
        name: name.trim(),
        description: description.trim(),
        memberIds: selectedUserIds,
      });
      onCreated(conv.id);
      onClose();
    } catch (err) {
      console.error('Failed to create conversation', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-md rounded-3xl bg-[#0a0a0a] border border-white/15 p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-white" />
            <h3 className="text-base font-bold text-white">Add & Search Contacts</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 py-3 border-b border-white/10">
          <button
            onClick={() => {
              setTab('direct');
              setShowAddContact(false);
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              tab === 'direct'
                ? 'bg-white text-black border border-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Direct Chat</span>
          </button>

          <button
            onClick={() => {
              setTab('group');
              setShowAddContact(false);
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              tab === 'group'
                ? 'bg-white text-black border border-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>New Group</span>
          </button>
        </div>

        {/* Direct Chat Tab */}
        {tab === 'direct' && (
          <div className="flex-1 flex flex-col min-h-0 py-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name, @username, or email..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#141414] border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/40"
                />
              </div>

              <button
                type="button"
                onClick={() => loadUsers(true)}
                title="Refresh contacts directory"
                className="p-2 rounded-xl bg-[#141414] hover:bg-white/10 text-neutral-300 border border-white/10 transition cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingUsers ? 'animate-spin text-white' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => setShowAddContact(!showAddContact)}
                title="Add new contact"
                className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1 transition cursor-pointer ${
                  showAddContact
                    ? 'bg-white text-black border-white'
                    : 'bg-[#141414] hover:bg-white/10 text-neutral-300 border-white/10'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span className="hidden sm:inline">Add</span>
              </button>
            </div>

            {/* Quick Add Contact Inline Form */}
            {showAddContact && (
              <form onSubmit={handleCreateNewContact} className="mb-3 p-3 rounded-2xl bg-[#141414] border border-white/15 space-y-2">
                <div className="text-xs font-semibold text-white flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Add Contact by Email, @Username, or Name</span>
                  </div>
                </div>
                <input
                  type="text"
                  required
                  value={contactEmail}
                  onChange={e => {
                    setContactEmail(e.target.value);
                    if (contactError) setContactError(null);
                  }}
                  placeholder="Enter email, @username, or display name..."
                  className="w-full px-3 py-2 rounded-xl bg-black border border-white/15 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/40"
                />
                {contactError && (
                  <p className="text-[11px] text-neutral-300 px-1">{contactError}</p>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting || !contactEmail.trim()}
                  className="w-full py-2 rounded-xl bg-white text-black font-bold text-xs shadow-md hover:bg-neutral-200 disabled:opacity-50 transition cursor-pointer"
                >
                  {isSubmitting ? 'Starting Chat...' : 'Add & Start Chat'}
                </button>
              </form>
            )}

            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                People Using Aether ({filteredUsers.length})
              </span>
              {isLoadingUsers && (
                <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Syncing directory...
                </span>
              )}
            </div>

            {/* Contact List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {search.trim() && (
                <div
                  onClick={() => handleQuickAddAndChat(search)}
                  className="flex items-center justify-between p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/15 cursor-pointer transition mb-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shrink-0">
                      <UserPlus className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        Add & Chat with "{search.trim()}"
                      </div>
                      <div className="text-[10px] text-neutral-400 truncate">
                        Start a direct conversation immediately
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    className="px-3 py-1.5 rounded-xl bg-white text-black text-xs font-bold hover:bg-neutral-200 transition cursor-pointer shrink-0"
                  >
                    Start Chat
                  </button>
                </div>
              )}

              {filteredUsers.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-400 px-4">
                  {isLoadingUsers ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-white" />
                      <p className="text-xs text-neutral-300">Finding people who use Aether...</p>
                    </div>
                  ) : (
                    <>
                      <p className="font-semibold text-white mb-1">No other contacts matched</p>
                      <p className="text-[11px] text-neutral-500 mb-3">
                        Type any person's email, @username, or name above to add them and start chatting right away.
                      </p>
                      {!showAddContact && (
                        <button
                          onClick={() => setShowAddContact(true)}
                          className="px-4 py-2 rounded-xl bg-white text-black font-bold text-xs hover:bg-neutral-200 inline-flex items-center gap-1.5 cursor-pointer transition"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Add Contact by Email / Username</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              ) : (
                filteredUsers.map(user => {
                  const isSelf = isSelfUser(user);
                  return (
                    <div
                      key={user.id}
                      onClick={() => toggleUserSelection(user.id)}
                      className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-white/5 border border-transparent hover:border-white/10 cursor-pointer transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={user.displayName} src={user.avatarUrl} isOnline={user.isOnline ?? true} size="md" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                            <span className="truncate">{user.displayName}</span>
                            {isSelf && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-neutral-300 shrink-0">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-neutral-400 truncate">
                            @{user.username}
                            {user.email && !user.email.endsWith('@aether.chat') && !user.email.endsWith('@aether.local')
                              ? ` • ${user.email}`
                              : ''}
                          </div>
                        </div>
                      </div>
                      <button className="px-3 py-1.5 rounded-xl bg-white text-black text-xs font-bold hover:bg-neutral-200 transition cursor-pointer shrink-0">
                        {isSelf ? 'Saved Chat' : 'Chat'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Group Form */}
        {tab === 'group' && (
          <form onSubmit={handleCreateGroup} className="flex-1 flex flex-col min-h-0 py-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Group Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Project Alpha Team"
                className="w-full px-3.5 py-2 rounded-xl bg-[#141414] border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/40"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Description (Optional)</label>
              <textarea
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What is this group about?"
                className="w-full px-3.5 py-2 rounded-xl bg-[#141414] border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/40 resize-none"
              />
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Select Members ({selectedUserIds.length})
              </label>
              <div className="flex-1 overflow-y-auto space-y-1 pr-1 border border-white/10 rounded-xl p-2 bg-[#141414]">
                {validOtherUsers.length === 0 ? (
                  <div className="text-center py-4 text-xs text-neutral-500">No other users yet</div>
                ) : (
                  validOtherUsers.map(user => {
                    const isSelected = selectedUserIds.includes(user.id);
                    return (
                      <div
                        key={user.id}
                        onClick={() => toggleUserSelection(user.id)}
                        className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition ${
                          isSelected ? 'bg-white/15 border border-white/30' : 'hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
                          <div className="min-w-0">
                            <div className="text-xs text-white truncate">{user.displayName}</div>
                            <div className="text-[10px] text-neutral-400 truncate">@{user.username}</div>
                          </div>
                        </div>
                        <div
                          className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                            isSelected ? 'bg-white border-white text-black' : 'border-white/20'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="w-full py-2.5 rounded-xl bg-white text-black font-bold text-xs shadow-md hover:bg-neutral-200 disabled:opacity-50 transition cursor-pointer mt-2"
            >
              {isSubmitting ? 'Creating...' : 'Create Group'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
