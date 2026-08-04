import { CallJoin, CallMedia } from './call.models';

export type MeetingStatus = 'scheduled' | 'started' | 'ended' | 'cancelled';

export interface MeetingInvitee {
  id: string;
  displayName: string;
}

export interface Meeting {
  id: string;
  title: string;
  description: string | null;
  ownerUserId: string;
  ownerName: string;
  isOwner: boolean;
  /** UTC instant; render in local time. */
  startsAt: string;
  durationMinutes: number;
  media: CallMedia;
  postSummary: boolean;
  status: MeetingStatus;
  conversationId: string | null;
  roomId: string | null;
  /** True while the join window is open (shortly before the start until a grace period after the end). */
  canJoin: boolean;
  invitees: MeetingInvitee[];
}

export interface SaveMeeting {
  title: string;
  description: string | null;
  /** Must be sent as a UTC ISO instant. */
  startsAt: string;
  durationMinutes: number;
  media: CallMedia;
  postSummary: boolean;
  inviteeUserIds: string[];
  conversationId: string | null;
}

export interface MeetingReminder {
  meetingId: string;
  title: string;
  startsAt: string;
  minutesUntil: number;
}

export interface MeetingJoin {
  meeting: Meeting;
  call: CallJoin;
}
