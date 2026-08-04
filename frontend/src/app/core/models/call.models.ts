/** Server-side call states (mirrors KeshavSingh.Realtime.Calls.CallState). */
export type CallState = 'ringing' | 'active' | 'ended';

export type CallMedia = 'audio' | 'video';

/** Video layout: remote big with a local thumbnail, or two equal tiles side by side. */
export type CallLayout = 'pip' | 'gallery';

/**
 * Live diagnostics from RTCPeerConnection.getStats(), so a one-way-audio problem is visible instead of
 * guesswork: whether bytes are actually flowing each way, and whether the path is direct or relayed.
 */
export interface CallStats {
  transport: 'direct' | 'relayed' | 'unknown';
  sending: boolean;
  receiving: boolean;
  /** 0..1 — our own mic level, straight from the encoder's media source. */
  micLevel: number;
  /** 0..1 — the level of the audio we are receiving. */
  remoteLevel: number;
  packetsLost: number;
}

export type CallEndReason =
  | 'completed' | 'declined' | 'missed' | 'disconnected' | 'timeout' | 'failed';

export type CallSignalKind = 'offer' | 'answer' | 'candidate';

/** What the local UI is doing — a superset of the server state (mic/negotiation phases are local). */
export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';

export interface IceServer {
  urls: string[];
  username: string | null;
  credential: string | null;
}

export interface Call {
  callId: string;
  conversationId: string;
  partnerUserId: string;
  partnerName: string;
  isCaller: boolean;
  state: CallState;
  startedAt: string;
  iceServers: IceServer[];
  /** What the server granted — audio even if video was requested but is disabled server-side. */
  media: CallMedia;
}

export interface IncomingCall {
  callId: string;
  conversationId: string;
  fromUserId: string;
  fromName: string;
  startedAt: string;
  media: CallMedia;
}

export interface CallStateChanged {
  callId: string;
  conversationId: string;
  state: CallState;
  endReason: CallEndReason | null;
  durationSeconds: number;
}

/** The trace a finished call leaves in the thread. */
export interface CallSummary {
  callId: string;
  media: CallMedia;
  outcome: 'completed' | 'missed' | 'declined' | 'failed';
  durationSeconds: number;
}

export interface AdminCall {
  callId: string;
  participantNames: string[];
  state: CallState;
  endReason: CallEndReason | null;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  media: CallMedia;
}

/** Everything the chat hub pushes about calls, as one stream so no event can be dropped. */
export type CallHubEvent =
  | { type: 'incoming'; call: IncomingCall }
  | { type: 'state'; state: CallStateChanged }
  | { type: 'media'; callId: string; media: CallMedia }
  | { type: 'signal'; callId: string; kind: CallSignalKind; payload: string };
