import React, { useState, useEffect } from 'react';
import { X, Search, Users, MessageSquare, Check, Sparkles, UserPlus } from 'lucide-react';
import { User } from '../../types';
import { Avatar } from '../common/Avatar';
import { api } from '../../lib/api';

interface NewConversationModalProps {
  isOpen: boolean;
  initialType?: 'direct' | 'group' | 'channel';
  currentUser: User;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
}

export const NewConversationModal: React.FC<NewConversationModalProps> = ({
  isOpen,
  initialType = 'direct',
  currentUser,
  onClose,
  onCreated,
}) => {
  const [tab, setTab] = useState<'direct' | 'group'>(initialType === 'group' ? 'group' : 'direct');
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Contact fields for quick adding
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [contactError, setContactError] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      const list = await api.searchUsers('');
      setUsers(list);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      setContactError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredUsers = users.filter(u => {
    if (u.id === currentUser.id) return false;
    if (
      u.id === 'u_1789118066028_c7hyx' ||
      /john\s*fran/i.test(u.displayName || '') ||
      /john\s*fran/i.test(u.username || '') ||
      /john\s*fran/i.test(u.email || '')
    ) {
      return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.displayName.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q))
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

  const handleCreateNewContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = contactEmail.trim().toLowerCase();
    if (!query) return;

    setContactError(null);
    setIsSubmitting(true);
    try {
      const foundUser = await api.createContact({
        email: query,
        username: query,
      });
      const conv = await api.createConversation({
        type: 'direct',
        memberIds: [foundUser.id],
      });
      onCreated(conv.id);
      onClose();
    } catch (err: any) {
      console.error(err);
      setContactError(err.message || 'User not found. Only registered and signed-in members can be added.');
    } finally {
      setIsSubmitting(false);
    }
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
            <h3 className="text-base font-bold text-white">New Conversation</h3>
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
                  placeholder="Search contacts..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#141414] border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/40"
                />
              </div>

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
                    <span>Find & Add Signed-in Person</span>
                  </div>
                  <span className="text-[10px] text-neutral-400">Registered users only</span>
                </div>
                <input
                  type="text"
                  required
                  value={contactEmail}
                  onChange={e => {
                    setContactEmail(e.target.value);
                    if (contactError) setContactError(null);
                  }}
                  placeholder="Enter user email or @username..."
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
                  {isSubmitting ? 'Searching...' : 'Find & Add Contact'}
                </button>
              </form>
            )}

            {/* Contact List */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {filteredUsers.length === 0 ? (
                <div className="py-10 text-center text-xs text-neutral-400 px-4">
                  <p className="font-semibold text-white mb-1">No signed-in users found</p>
                  <p className="text-[11px] text-neutral-500 mb-3">
                    Only persons who are signed in to Aether will appear in your contacts.
                  </p>
                  {!showAddContact && (
                    <button
                      onClick={() => setShowAddContact(true)}
                      className="text-white font-semibold hover:underline inline-flex items-center gap-1"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Find member by email
                    </button>
                  )}
                </div>
              ) : (
                filteredUsers.map(user => (
                  <div
                    key={user.id}
                    onClick={() => toggleUserSelection(user.id)}
                    className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-white/5 cursor-pointer transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={user.displayName} src={user.avatarUrl} isOnline={user.isOnline} size="md" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">{user.displayName}</div>
                        <div className="text-[10px] text-neutral-400 truncate">{user.email || `@${user.username}`}</div>
                      </div>
                    </div>
                    <button className="px-3 py-1.5 rounded-xl bg-white text-black text-xs font-bold hover:bg-neutral-200 transition cursor-pointer">
                      Chat
                    </button>
                  </div>
                ))
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
                {users.filter(u => u.id !== currentUser.id).length === 0 ? (
                  <div className="text-center py-4 text-xs text-neutral-500">No other users yet</div>
                ) : (
                  users
                    .filter(u => u.id !== currentUser.id)
                    .map(user => {
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
                            <span className="text-xs text-white truncate">{user.displayName}</span>
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
