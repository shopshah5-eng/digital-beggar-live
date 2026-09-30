export type EventType =
  | "SUPPORT_SMALL"
  | "SUPPORT_MEDIUM"
  | "SUPPORT_LARGE"
  | "THANK_YOU"
  | "SHOCK"
  | "NEW_SPONSOR"
  | "SPONSOR_WIN"
  | "SPONSOR_LOST"
  | "CELEBRATE"
  | "VICTORY"
  | "NO_SUPPORT"
  | "IDLE";

export type EventStatus = "pending" | "verified" | "processed" | "failed";

export interface StreamEvent {
  id: string;
  type: EventType;
  amount: number;
  currency: string;
  source: "demo" | "webhook" | "admin" | "gateway" | "event_retry";
  displayName: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  status: EventStatus;
}

export interface RecentSupport {
  displayName: string;
  amount: number;
  timestamp: string;
}

export interface StreamState {
  streamId: string;
  status: "active" | "paused" | "offline";
  goalAmount: number;
  raisedAmount: number;
  currentSponsor: string | null;
  currentSponsorBid: number;
  currentSponsorInfo?: {
    displayName: string;
    verifiedBid: number;
    website?: string;
    category?: string;
    campaignStartTime?: string;
    disclosure: "CURRENT SPONSOR" | "SPONSORED";
  } | null;
  minimumNextBid: number;
  recentSupport: RecentSupport | null;
  lastEvent: StreamEvent | null;
  viewerDisplayMode: "static_demo" | "live";
  demoMode: boolean;
  isSpeaking?: boolean;
  isVoiceMuted?: boolean;
  voiceStatus?: string;
  lastVoiceLine?: string | null;
}

export interface BroadcastMessage {
  type: "STATE_UPDATE" | "STREAM_EVENT" | "HEARTBEAT" | "STATE_RESET";
  event?: StreamEvent;
  state: StreamState;
  timestamp: string;
}
