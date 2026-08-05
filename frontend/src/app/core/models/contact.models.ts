export type ContactStatus = 'new' | 'read' | 'replied' | 'spam' | 'archived';

export interface ContactReply {
  body: string;
  sentByUserId: string;
  sentAt: string;
  /** The admin confirmed they actually sent it from their mail client. */
  markedSent: boolean;
}

/** A message someone sent through the portfolio's contact form. */
export interface ContactSubmission {
  id: string;
  source: string;
  name: string;
  email: string;
  message: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  userAgent: string | null;
  status: ContactStatus;
  createdAt: string;
  readAt: string | null;
  replies: ContactReply[];
}

export interface ContactInboxSummary {
  unread: number;
  total: number;
}
