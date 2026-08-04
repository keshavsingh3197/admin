import { CallSummary } from './call.models';

export type ChatStatus = 'pending' | 'accepted' | 'declined';
export type PresenceState = 'online' | 'idle' | 'offline';

export interface DirectoryUser {
  id: string;
  displayName: string;
  presence: PresenceState;
}

/** A member of a group thread. */
export interface ConversationMember {
  id: string;
  displayName: string;
  presence: PresenceState;
  isOwner: boolean;
}

export interface Conversation {
  id: string;
  /** Empty for a group; `partnerName` mirrors the group title so lists stay simple. */
  partnerId: string;
  partnerName: string;
  status: ChatStatus;
  isInitiator: boolean;
  flaggedSpam: boolean;
  presence: PresenceState;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  isGroup: boolean;
  title: string | null;
  participants: ConversationMember[] | null;
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
  forwarded: boolean;
  /** Set when this row records a call rather than something someone typed. */
  call: CallSummary | null;
  /** Who sent it — only populated in group threads, where bubbles need a name. */
  senderName: string | null;
  /** Set when this row is group housekeeping ("X added Y") rather than someone's message. */
  systemKind: string | null;
}

export interface AdminConversation {
  id: string;
  participantNames: string[];
  status: ChatStatus;
  flaggedSpam: boolean;
  lastMessageAt: string | null;
  messageCount: number;
  isGroup: boolean;
  title: string | null;
}

export interface AdminBlock {
  blockerName: string;
  blockedName: string;
  reason: string;
  createdAt: string;
}

export type ChatVisibility = 'everyone' | 'family';

export interface ShareLink {
  token: string;
  expiresAt: string;
}
