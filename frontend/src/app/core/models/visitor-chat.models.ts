/** Mirrors Admin.Api VisitorChatDtos — live chat with visitors on the public sites. */

export type VisitorChatStatus = 'open' | 'closed' | 'blocked';

export interface VisitorChatMessageView {
  id: string;
  /** "visitor" or "staff". */
  author: string;
  staffName: string | null;
  body: string;
  sentAt: string;
}

export interface VisitorChatSessionView {
  id: string;
  source: string;
  displayName: string | null;
  email: string | null;
  status: VisitorChatStatus;
  userAgent: string | null;
  createdAt: string;
  lastMessageAt: string;
  visitorSeenAt: string;
  visitorOnline: boolean;
  visitorTyping: boolean;
  unreadForStaff: number;
  lastMessagePreview: string | null;
  lastStaffUserId: string | null;
}

export interface VisitorChatThread {
  session: VisitorChatSessionView;
  messages: VisitorChatMessageView[];
}

export interface VisitorChatSummary {
  waiting: number;
  online: number;
  open: number;
}
