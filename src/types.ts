export type UserRole = 'user' | 'moderator' | 'admin' | 'superadmin';

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  phone?: string;
  avatarUrl: string;
  bio?: string;
  onlineStatus: 'online' | 'offline' | 'away';
  lastSeen?: string;
  isOnline: boolean;
  createdAt: string;
  role: UserRole;
  isBanned?: boolean;
}

export type ConversationType = 'direct' | 'group' | 'channel' | 'saved';

export interface MemberPermissions {
  canSendMessages: boolean;
  canAddMembers: boolean;
  canPinMessages: boolean;
  canDeleteMessages: boolean;
  canManageCalls: boolean;
}

export interface ConversationMember {
  id: string;
  conversationId: string;
  userId: string;
  role: 'owner' | 'admin' | 'moderator' | 'member';
  permissions: MemberPermissions;
  joinedAt: string;
  isMuted?: boolean;
  isArchived?: boolean;
  isPinned?: boolean;
  unreadCount?: number;
  user?: User;
}

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'document'
  | 'location'
  | 'contact'
  | 'poll'
  | 'system';

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  userDisplayName?: string;
}

export interface PollOption {
  id: string;
  text: string;
  voterIds: string[];
}

export interface Poll {
  id: string;
  messageId: string;
  question: string;
  options: PollOption[];
  isMultiple: boolean;
  isAnonymous: boolean;
  isClosed?: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  sender?: User;
  type: MessageType;
  content: string;
  replyToId?: string;
  replyTo?: {
    id: string;
    senderName: string;
    content: string;
    type: MessageType;
  };
  forwardedFromId?: string;
  forwardedFromName?: string;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  duration?: number;
  voiceDuration?: number;
  transcription?: string;
  isEdited?: boolean;
  editedAt?: string;
  isPinned?: boolean;
  isDeletedForEveryone?: boolean;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  createdAt: string;
  reactions: MessageReaction[];
  poll?: Poll;
  location?: {
    latitude: number;
    longitude: number;
    title?: string;
  };
  contactCard?: {
    name: string;
    phone: string;
    email?: string;
  };
}

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string;
  description?: string;
  avatarUrl?: string;
  username?: string;
  isPrivate: boolean;
  isEncrypted: boolean;
  disappearingSeconds?: number;
  createdAt: string;
  createdBy: string;
  wallpaper?: string;
  unreadCount?: number;
  lastMessage?: Message;
  isPinned?: boolean;
  isArchived?: boolean;
  isMuted?: boolean;
  members: ConversationMember[];
  subscriberCount?: number;
}

export interface Story {
  id: string;
  userId: string;
  user?: User;
  type: 'image' | 'video' | 'text';
  mediaUrl?: string;
  text?: string;
  background?: string;
  fontStyle?: 'sans' | 'display' | 'serif' | 'script' | 'mono' | 'neon';
  textColor?: string;
  textHighlight?: 'none' | 'pill' | 'box' | 'glow';
  filter?: string;
  stickers?: { id: string; emoji: string; x: number; y: number; scale?: number }[];
  doodleData?: string;
  viewers: string[];
  isEdited?: boolean;
  editedAt?: string;
  createdAt: string;
  expiresAt: string;
}

export interface Call {
  id: string;
  callerId: string;
  caller?: User;
  receiverId?: string;
  receiver?: User;
  conversationId: string;
  type: 'voice' | 'video';
  status: 'initiating' | 'ringing' | 'active' | 'ended' | 'rejected' | 'missed';
  startedAt: string;
  endedAt?: string;
  duration?: number;
}

export interface ChatFolder {
  id: string;
  userId: string;
  name: string;
  icon?: string;
  filterType: 'all' | 'unread' | 'groups' | 'channels' | 'direct' | 'custom';
  conversationIds: string[];
}

export type AccentTheme = 'aurora' | 'ocean' | 'midnight' | 'purple' | 'emerald' | 'sunset';

export interface UserSettings {
  theme: 'dark' | 'light' | 'system';
  accent: AccentTheme;
  fontSize: 'sm' | 'md' | 'lg';
  glassIntensity: 'low' | 'medium' | 'high';
  notifications: {
    messages: boolean;
    calls: boolean;
    mentionsOnly: boolean;
    preview: boolean;
    sound: boolean;
  };
  privacy: {
    lastSeen: 'everyone' | 'contacts' | 'nobody';
    readReceipts: boolean;
    profilePhoto: 'everyone' | 'contacts' | 'nobody';
    stories: 'everyone' | 'contacts' | 'nobody';
    disappearingDefault: number;
  };
  mediaAutoDownload: {
    photos: boolean;
    videos: boolean;
    documents: boolean;
    audio: boolean;
  };
}

export interface DeviceSession {
  id: string;
  userId: string;
  deviceName: string;
  browser: string;
  os: string;
  ip: string;
  lastActive: string;
  isCurrent: boolean;
  createdAt: string;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  messagesSent: number;
  totalGroups: number;
  totalChannels: number;
  totalCalls: number;
  storageUsageBytes: number;
  pendingReports: number;
  dailyActivity: { date: string; messages: number; activeUsers: number }[];
}

export interface Report {
  id: string;
  reporterId: string;
  reporterName?: string;
  reportedUserId?: string;
  reportedUserName?: string;
  reportedMessageId?: string;
  reportedMessageContent?: string;
  reportedConversationId?: string;
  reason: string;
  details?: string;
  status: 'pending' | 'investigating' | 'resolved' | 'dismissed';
  createdAt: string;
}

export interface BlockedUser {
  id: string;
  userId: string;
  blockedUserId: string;
  blockedUser?: User;
  createdAt: string;
}
