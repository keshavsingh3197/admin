export type ChatStatus = 'pending' | 'accepted' | 'declined';
export type PresenceState = 'online' | 'idle' | 'offline';

export interface DirectoryUser {
  id: string;
  displayName: string;
  presence: PresenceState;
}

export interface Conversation {
  id: string;
  partnerId: string;
  partnerName: string;
  status: ChatStatus;
  isInitiator: boolean;
  flaggedSpam: boolean;
  presence: PresenceState;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
}

export interface Attachment {
  messageId: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  attachment: Attachment | null;
  sentAt: string;
  readAt: string | null;
  deleted: boolean;
}

export interface AdminConversation {
  id: string;
  participantNames: string[];
  status: ChatStatus;
  flaggedSpam: boolean;
  lastMessageAt: string | null;
  messageCount: number;
}

export interface AdminBlock {
  blockerName: string;
  blockedName: string;
  reason: string;
  createdAt: string;
}
