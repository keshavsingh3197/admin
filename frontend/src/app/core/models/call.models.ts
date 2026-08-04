export type CallMedia = 'audio' | 'video';

/** Server-side room state (mirrors KeshavSingh.Realtime.Calls.CallState). */
export type CallState = 'ringing' | 'active' | 'ended';

export type CallEndReason =
  | 'completed' | 'declined' | 'missed' | 'disconnected' | 'timeout' | 'failed';

export type CallParticipantState = 'invited' | 'joined' | 'left' | 'declined';

export type CallSignalKind = 'offer' | 'answer' | 'candidate';

/** What the local UI is doing — a superset of the server state (device/negotiation phases are local). */
export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';

/** Video layout: one big tile with thumbnails, or an even grid of everyone. */
export type CallLayout = 'pip' | 'gallery';

export interface IceServer {
  urls: string[];
  username: string | null;
  credential: string | null;
}

export interface CallParticipant {
  userId: string;
  displayName: string;
  state: CallParticipantState;
  isOwner: boolean;
  seconds: number;
}

/** The roster — who's in, who's still ringing, and how many are actually on the call. */
export interface CallRoom {
  roomId: string;
  conversationId: string | null;
  meetingId: string | null;
  title: string;
  media: CallMedia;
  ownerUserId: string;
  postSummary: boolean;
  startedAt: string;
  joinedCount: number;
  participants: CallParticipant[];
}

export interface CallJoin {
  room: CallRoom;
  iceServers: IceServer[];
}

export interface IncomingCall {
  roomId: string;
  conversationId: string | null;
  title: string;
  fromUserId: string;
  fromName: string;
  media: CallMedia;
  participantCount: number;
  startedAt: string;
}

export interface CallEnded {
  roomId: string;
  reason: CallEndReason;
  durationSeconds: number;
}

/**
 * Live diagnostics from RTCPeerConnection.getStats(), per peer, so a one-way-audio problem is visible
 * instead of guesswork: whether bytes are actually flowing each way, and whether the path is relayed.
 */
export interface PeerStats {
  transport: 'direct' | 'relayed' | 'unknown';
  sending: boolean;
  receiving: boolean;
  /** 0..1 — the level of the audio arriving from this peer. */
  level: number;
  packetsLost: number;
}

/** One remote participant as the call UI needs them: media + connection + diagnostics. */
export interface PeerView {
  userId: string;
  displayName: string;
  video: MediaStream | null;
  videoLive: boolean;
  connected: boolean;
  stats: PeerStats | null;
}

/** The trace a finished call leaves in the thread. */
export interface CallSummary {
  callId: string;
  media: CallMedia;
  outcome: 'completed' | 'missed' | 'declined' | 'failed';
  durationSeconds: number;
  participantCount: number;
  participants: { name: string; seconds: number }[] | null;
}

export interface CallHistoryEntry {
  callId: string;
  conversationId: string | null;
  title: string;
  organiser: boolean;
  outcome: string;
  startedAt: string;
  durationSeconds: number;
  media: CallMedia;
  participants: { displayName: string; seconds: number }[];
}

export interface AdminCall {
  callId: string;
  title: string;
  participantNames: string[];
  state: CallState;
  endReason: CallEndReason | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  media: CallMedia;
  participantCount: number;
}

/** Everything the chat hub pushes about calls and meetings, as one stream so no event can be dropped. */
export type CallHubEvent =
  | { type: 'incoming'; call: IncomingCall }
  | { type: 'roster'; room: CallRoom }
  | { type: 'joined'; roomId: string; userId: string }
  | { type: 'left'; roomId: string; userId: string }
  | { type: 'ended'; ended: CallEnded }
  | { type: 'media'; roomId: string; media: CallMedia }
  | { type: 'signal'; roomId: string; fromUserId: string; kind: CallSignalKind; payload: string };
