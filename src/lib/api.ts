import { User, Conversation, Message, Story, Call, UserSettings, DeviceSession, ChatFolder, AdminStats, Report, BlockedUser } from '../types';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = typeof window !== 'undefined' ? localStorage.getItem('aether_token') : null;
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('aether_token', token);
    } else {
      localStorage.removeItem('aether_token');
    }
  }

  public setSession(user: User | null, token: string | null) {
    this.token = token;
    if (token && user) {
      localStorage.setItem('aether_token', token);
      localStorage.setItem('aether_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('aether_token');
      localStorage.removeItem('aether_user');
    }
  }

  public getStoredUser(): User | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('aether_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  public logout() {
    this.setSession(null, null);
  }

  private isRefreshing = false;

  private async request<T>(endpoint: string, options: RequestInit = {}, isRetry = false): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('aether_token');
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const storedUser = this.getStoredUser();
    if (storedUser) {
      if (storedUser.id) headers['X-User-Id'] = storedUser.id;
      if (storedUser.email) headers['X-User-Email'] = storedUser.email;
      if (storedUser.displayName) headers['X-User-Name'] = storedUser.displayName;
    }

    const response = await fetch(`/api${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401 && !isRetry && !endpoint.startsWith('/auth/')) {
      const recovered = await this.tryRecoverSession();
      if (recovered) {
        return this.request<T>(endpoint, options, true);
      }
    }

    if (!response.ok) {
      let errorMsg = `Error ${response.status}: ${response.statusText}`;
      try {
        const errorJson = await response.json();
        if (errorJson.error) errorMsg = errorJson.error;
      } catch (_) {}
      throw new Error(errorMsg);
    }

    return response.json() as Promise<T>;
  }

  private async tryRecoverSession(): Promise<boolean> {
    if (this.isRefreshing) return false;
    this.isRefreshing = true;
    try {
      const storedUser = this.getStoredUser();
      if (storedUser?.email) {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: storedUser.email,
            displayName: storedUser.displayName,
            avatarUrl: storedUser.avatarUrl,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.user && data.token) {
            this.setSession(data.user, data.token);
            return true;
          }
        }
      }
      this.logout();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aether:unauthorized'));
      }
      return false;
    } catch {
      return false;
    } finally {
      this.isRefreshing = false;
    }
  }

  // Auth
  public async login(identifier: string, password: string): Promise<{ user: User; token: string }> {
    const res = await this.request<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    this.setSession(res.user, res.token);
    return res;
  }

  public async googleLogin(data: {
    email: string;
    displayName?: string;
    avatarUrl?: string;
    credential?: string;
  }): Promise<{ user: User; token: string }> {
    const res = await this.request<{ user: User; token: string }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setSession(res.user, res.token);
    return res;
  }

  public async githubLogin(data?: {
    username?: string;
    email?: string;
    displayName?: string;
    avatarUrl?: string;
  }): Promise<{ user: User; token: string }> {
    const res = await this.request<{ user: User; token: string }>('/auth/github', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
    this.setSession(res.user, res.token);
    return res;
  }

  public async register(data: {
    username?: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    email: string;
    password: string;
    phone?: string;
  }): Promise<{ user: User; token: string }> {
    const res = await this.request<{ user: User; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setSession(res.user, res.token);
    return res;
  }

  public async forgotPassword(email: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  public async getSqlStats(): Promise<{ engine: string; status: string; stats: any }> {
    return this.request<{ engine: string; status: string; stats: any }>('/sql/stats');
  }

  public async createContact(data: { name?: string; email?: string; username?: string; phone?: string; bio?: string }): Promise<User> {
    const res = await this.request<{ user: User }>('/users/create-contact', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.user;
  }

  public async getMe(): Promise<{ user: User }> {
    return this.request<{ user: User }>('/auth/me');
  }

  public async getCurrentUser(): Promise<User | null> {
    if (!this.token) return null;
    try {
      const res = await this.getMe();
      return res.user;
    } catch {
      return null;
    }
  }

  public async updateProfile(data: Partial<User>): Promise<User> {
    const res = await this.request<{ user: User }>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.user;
  }

  // Users & Search
  public async searchUsers(query: string): Promise<User[]> {
    const res = await this.request<{ users: User[] }>(`/users/search?q=${encodeURIComponent(query)}`);
    return res.users || [];
  }

  public async getContacts(): Promise<User[]> {
    const res = await this.request<{ contacts: User[] }>('/users/contacts');
    return res.contacts || [];
  }

  public async blockUser(userId: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/users/${userId}/block`, { method: 'POST' });
    return res.success;
  }

  public async unblockUser(userId: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/users/${userId}/block`, { method: 'DELETE' });
    return res.success;
  }

  public async getBlockedUsers(): Promise<BlockedUser[]> {
    const res = await this.request<{ blocked: BlockedUser[] }>('/users/me/blocked');
    return res.blocked || [];
  }

  public async reportUser(userId: string, reason: string, details?: string, conversationId?: string, messageId?: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/users/${userId}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason, details, conversationId, messageId }),
    });
    return res.success;
  }

  // Conversations
  public async getConversations(): Promise<Conversation[]> {
    const res = await this.request<{ conversations: Conversation[] }>('/conversations');
    return res.conversations || [];
  }

  public async getConversation(id: string): Promise<Conversation> {
    const res = await this.request<{ conversation: Conversation }>(`/conversations/${id}`);
    return res.conversation;
  }

  public async createConversation(data: {
    type: 'direct' | 'group' | 'channel';
    name?: string;
    description?: string;
    avatarUrl?: string;
    username?: string;
    isPrivate?: boolean;
    memberIds?: string[];
  }): Promise<Conversation> {
    const res = await this.request<{ conversation: Conversation }>('/conversations', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        name: data.name || (data.type === 'direct' ? 'Direct Chat' : 'New Group'),
      }),
    });
    return res.conversation;
  }

  public async markAsRead(conversationId: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/conversations/${conversationId}/read`, {
      method: 'POST',
    });
    return res.success;
  }

  public async getMessages(conversationId: string): Promise<Message[]> {
    const res = await this.request<{ messages: Message[] }>(`/conversations/${conversationId}/messages`);
    return res.messages || [];
  }

  public async sendMessage(data: { conversationId: string; [key: string]: any }): Promise<Message> {
    const { conversationId, ...body } = data;
    const res = await this.request<{ message: Message }>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.message;
  }

  public async togglePinConversation(conversationId: string): Promise<{ isPinned: boolean }> {
    return this.request<{ isPinned: boolean }>(`/conversations/${conversationId}/pin`, { method: 'POST' });
  }

  public async toggleArchiveConversation(conversationId: string): Promise<{ isArchived: boolean }> {
    return this.request<{ isArchived: boolean }>(`/conversations/${conversationId}/archive`, { method: 'POST' });
  }

  public async toggleMuteConversation(conversationId: string): Promise<{ isMuted: boolean }> {
    return this.request<{ isMuted: boolean }>(`/conversations/${conversationId}/mute`, { method: 'POST' });
  }

  public async addMember(conversationId: string, userId: string): Promise<Conversation> {
    const res = await this.request<{ conversation: Conversation }>(`/conversations/${conversationId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    return res.conversation;
  }

  // Messages
  public async editMessage(messageId: string, content: string): Promise<Message> {
    const res = await this.request<{ message: Message }>(`/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
    return res.message;
  }

  public async deleteMessage(messageId: string, forEveryone: boolean): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/messages/${messageId}`, {
      method: 'DELETE',
      body: JSON.stringify({ forEveryone }),
    });
    return res.success;
  }

  public async reactToMessage(messageId: string, emoji: string): Promise<Message> {
    const res = await this.request<{ message: Message }>(`/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
    return res.message;
  }

  public async togglePinMessage(messageId: string): Promise<Message> {
    const res = await this.request<{ message: Message }>(`/messages/${messageId}/pin`, { method: 'POST' });
    return res.message;
  }

  public async forwardMessage(messageId: string, targetConversationId: string): Promise<Message> {
    const res = await this.request<{ message: Message }>(`/messages/${messageId}/forward`, {
      method: 'POST',
      body: JSON.stringify({ targetConversationId }),
    });
    return res.message;
  }

  public async votePoll(messageId: string, optionId: string): Promise<Message> {
    const res = await this.request<{ message: Message }>(`/polls/${messageId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ optionId }),
    });
    return res.message;
  }

  // Voice-to-Text & Audio Transcription
  public async transcribeAudio(data: {
    audioData: string;
    mimeType?: string;
    messageId?: string;
  }): Promise<{ transcription: string; success: boolean; warning?: string }> {
    return this.request<{ transcription: string; success: boolean; warning?: string }>('/ai/transcribe', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async updateTranscription(messageId: string, transcription: string): Promise<Message> {
    const res = await this.request<{ message: Message }>(`/messages/${messageId}/transcription`, {
      method: 'PATCH',
      body: JSON.stringify({ transcription }),
    });
    return res.message;
  }

  // Stories
  public async getStories(): Promise<Story[]> {
    const res = await this.request<{ stories: Story[] }>('/stories');
    return res.stories || [];
  }

  public async createStory(data: Partial<Story>): Promise<Story> {
    const res = await this.request<{ story: Story }>('/stories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.story;
  }

  public async updateStory(storyId: string, data: Partial<Story>): Promise<Story> {
    const res = await this.request<{ story: Story }>(`/stories/${storyId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.story;
  }

  public async deleteStory(storyId: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/stories/${storyId}`, {
      method: 'DELETE',
    });
    return res.success;
  }

  public async viewStory(storyId: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/stories/${storyId}/view`, { method: 'POST' });
    return res.success;
  }

  // Calls
  public async getCalls(): Promise<Call[]> {
    const res = await this.request<{ calls: Call[] }>('/calls');
    return res.calls || [];
  }

  public async getActiveCallState(afterSeq: number = 0): Promise<{
    call: Call | null;
    signals: Array<{ seq: number; fromUserId: string; toUserId: string; callId: string; signal: any }>;
  }> {
    return this.request<{
      call: Call | null;
      signals: Array<{ seq: number; fromUserId: string; toUserId: string; callId: string; signal: any }>;
    }>(`/calls/active?afterSeq=${afterSeq}`);
  }

  public async sendCallSignal(callId: string, toUserId: string, signal: any): Promise<{ success: boolean; seq: number }> {
    return this.request<{ success: boolean; seq: number }>(`/calls/${callId}/signal`, {
      method: 'POST',
      body: JSON.stringify({ toUserId, signal }),
    });
  }

  public async initiateCall(data: { receiverId: string; type: 'voice' | 'video'; conversationId?: string }): Promise<Call> {
    const res = await this.request<{ call: Call }>('/calls/start', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.call;
  }

  public async acceptCall(callId: string, type?: 'voice' | 'video'): Promise<Call> {
    const res = await this.request<{ call: Call }>(`/calls/${callId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active', ...(type ? { type } : {}) }),
    });
    return res.call;
  }

  public async rejectCall(callId: string): Promise<Call> {
    const res = await this.request<{ call: Call }>(`/calls/${callId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' }),
    });
    return res.call;
  }

  public async endCall(callId: string): Promise<Call> {
    const res = await this.request<{ call: Call }>(`/calls/${callId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ended' }),
    });
    return res.call;
  }

  // Settings & Devices
  public async getSettings(): Promise<UserSettings> {
    const res = await this.request<{ settings: UserSettings }>('/settings');
    return res.settings;
  }

  public async updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    const res = await this.request<{ settings: UserSettings }>('/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
    return res.settings;
  }

  public async getDevices(): Promise<DeviceSession[]> {
    const res = await this.request<{ sessions: DeviceSession[] }>('/devices');
    return res.sessions || [];
  }

  public async terminateDevice(id: string): Promise<boolean> {
    const res = await this.request<{ success: boolean }>(`/devices/${id}`, { method: 'DELETE' });
    return res.success;
  }

  public async terminateOtherDevices(): Promise<boolean> {
    const res = await this.request<{ success: boolean }>('/devices/other', { method: 'DELETE' });
    return res.success;
  }

  // Uploads
  public async uploadFile(file: File): Promise<{ url: string; filename: string; size: number; mimetype: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch('/api/upload', {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    return response.json();
  }

  // Admin
  public async getAdminStats(): Promise<AdminStats> {
    const res = await this.request<{ stats: AdminStats }>('/admin/stats');
    return res.stats;
  }

  public async getAdminUsers(): Promise<User[]> {
    const res = await this.request<{ users: User[] }>('/admin/users');
    return res.users || [];
  }

  public async updateUserStatus(userId: string, status: string): Promise<{ isBanned: boolean }> {
    return this.request<{ isBanned: boolean }>(`/admin/users/${userId}/ban`, { method: 'PATCH' });
  }

  public async toggleBanUser(userId: string): Promise<{ isBanned: boolean }> {
    return this.request<{ isBanned: boolean }>(`/admin/users/${userId}/ban`, { method: 'PATCH' });
  }

  public async sendBroadcast(content: string, category: string = 'system'): Promise<any> {
    return this.request<any>('/admin/broadcast', {
      method: 'POST',
      body: JSON.stringify({ content, category }),
    });
  }

  public async getAdminReports(): Promise<Report[]> {
    const res = await this.request<{ reports: Report[] }>('/admin/reports');
    return res.reports || [];
  }

  public async updateReportStatus(reportId: string, status: Report['status']): Promise<Report> {
    const res = await this.request<{ report: Report }>(`/admin/reports/${reportId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return res.report;
  }

  public async exportUserData(): Promise<void> {
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch('/api/export', { headers });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aether-data-export.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  public async resetAllData(): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/system/reset', {
      method: 'POST',
    });
  }
}

export const api = new ApiClient();
