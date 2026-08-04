/** Server-side call states (mirrors KeshavSingh.Realtime.Calls.CallState). */
export type CallState = 'ringing' | 'active' | 'ended';

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
}

export interface IncomingCall {
  callId: string;
  conversationId: string;
  fromUserId: string;
  fromName: string;
  startedAt: string;
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
  media: string;
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
}

/** Everything the chat hub pushes about calls, as one stream so no event can be dropped. */
export type CallHubEvent =
  | { type: 'incoming'; call: IncomingCall }
  | { type: 'state'; state: CallStateChanged }
  | { type: 'signal'; callId: string; kind: CallSignalKind; payload: string };
