import { EventType } from "../types/events";

export interface StreamRecord {
  id: string;
  name: string;
  status: "active" | "paused" | "offline";
  goal_amount: number;
  raised_amount: number;
  current_sponsor_id: string | null;
  current_sponsor_name: string | null;
  current_sponsor_bid: number;
  minimum_next_bid: number;
  demo_mode: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentRecord {
  id: string;
  stream_id: string;
  provider: string;
  provider_order_id?: string;
  provider_payment_id: string;
  amount: number;
  amount_paise?: number;
  currency: string;
  purpose: "SUPPORT" | "SPONSOR_BID" | "support" | "sponsor_bid";
  status:
    | "CREATED"
    | "PENDING"
    | "AUTHORIZED"
    | "CAPTURED"
    | "FAILED"
    | "CANCELLED"
    | "REFUNDED"
    | "VERIFIED"
    | "REJECTED"
    | "created"
    | "pending"
    | "verified"
    | "failed"
    | "refunded";
  payer_name: string;
  message?: string;
  webhook_event_id?: string;
  verified_at?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SupportEventRecord {
  id: string;
  stream_id: string;
  payment_id: string | null;
  event_type: EventType;
  amount: number;
  currency: string;
  display_name: string;
  status: "pending" | "verified" | "rejected" | "refunded";
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface BusinessRecord {
  id: string;
  name: string;
  contact_email: string;
  website: string;
  category: string;
  description?: string;
  status: "active" | "suspended";
  created_at: string;
  updated_at?: string;
}

export interface SponsorCampaignRecord {
  id: string;
  business_id: string;
  bid_id: string;
  stream_id: string;
  sponsor_name: string;
  website: string;
  category: string;
  bid_amount_inr: number;
  status: "SPONSOR_ACTIVE" | "SPONSOR_ENDED" | "ADMIN_OVERRIDE";
  started_at: string;
  ended_at?: string | null;
  created_at: string;
}

export interface SponsorBidRecord {
  id: string;
  stream_id: string;
  business_id: string | null;
  business_name: string;
  bid_amount: number;
  bid_amount_inr?: number;
  bid_amount_paise?: number;
  currency: string;
  payment_id: string | null;
  provider_order_id?: string;
  provider_payment_id?: string;
  status:
    | "pending"
    | "verified"
    | "rejected"
    | "outbid"
    | "refunded"
    | "BID_DRAFT"
    | "BID_SUBMITTED"
    | "PAYMENT_PENDING"
    | "PAYMENT_VERIFIED"
    | "BID_ACCEPTED"
    | "BID_REJECTED"
    | "BID_EXPIRED"
    | "REFUND_REQUIRED";
  submitted_at?: string;
  verified_at?: string;
  rejected_at?: string;
  rejection_reason?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface EventQueueRecord {
  id: string;
  stream_id: string;
  event_type: EventType;
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "completed" | "failed" | "retrying";
  priority: number;
  attempts?: number;
  last_error?: string | null;
  created_at: string;
  processed_at?: string | null;
  updated_at?: string;
}

export interface AdminActionRecord {
  id: string;
  stream_id: string;
  action_type: string;
  actor: string;
  details?: Record<string, unknown>;
  created_at: string;
}

export interface IStreamRepository {
  getStream(id: string): Promise<StreamRecord | null>;
  updateRaisedAmount(id: string, delta: number): Promise<StreamRecord>;
  updateGoalAmount(id: string, newGoal: number): Promise<StreamRecord>;
  updateSponsor(
    id: string,
    sponsorName: string,
    bidAmount: number,
    nextMinBid: number
  ): Promise<StreamRecord>;
  resetStream(id: string): Promise<StreamRecord>;
  setStreamStatus(id: string, status: StreamRecord["status"]): Promise<StreamRecord>;
}

export interface IPaymentRepository {
  createPayment(
    payment: Omit<PaymentRecord, "id" | "created_at" | "updated_at">
  ): Promise<PaymentRecord>;
  getPaymentByProviderPaymentId(providerPaymentId: string): Promise<PaymentRecord | null>;
  getPaymentByOrderId(providerOrderId: string): Promise<PaymentRecord | null>;
  getPaymentByWebhookEventId(webhookEventId: string): Promise<PaymentRecord | null>;
  getPaymentById(id: string): Promise<PaymentRecord | null>;
  updatePaymentStatus(id: string, status: PaymentRecord["status"]): Promise<PaymentRecord>;
  updatePayment(id: string, updates: Partial<PaymentRecord>): Promise<PaymentRecord>;
  getRecentPayments(streamId?: string, limit?: number): Promise<PaymentRecord[]>;
}

export interface ISupportRepository {
  createSupportEvent(
    event: Omit<SupportEventRecord, "id" | "created_at">
  ): Promise<SupportEventRecord>;
  getRecentSupport(streamId: string, limit?: number): Promise<SupportEventRecord[]>;
  getVerifiedTotal(streamId: string): Promise<number>;
}

export interface ISponsorRepository {
  createBusiness(business: Omit<BusinessRecord, "id" | "created_at">): Promise<BusinessRecord>;
  getBusinessById(id: string): Promise<BusinessRecord | null>;
  getBusinessByEmail(email: string): Promise<BusinessRecord | null>;
  createBid(bid: Omit<SponsorBidRecord, "id" | "created_at">): Promise<SponsorBidRecord>;
  getBidById(id: string): Promise<SponsorBidRecord | null>;
  getBidByOrderId(providerOrderId: string): Promise<SponsorBidRecord | null>;
  updateBidStatus(
    id: string,
    status: SponsorBidRecord["status"],
    updates?: Partial<SponsorBidRecord>
  ): Promise<SponsorBidRecord>;
  getRecentBids(streamId: string, limit?: number): Promise<SponsorBidRecord[]>;
  createCampaign(
    campaign: Omit<SponsorCampaignRecord, "id" | "created_at">
  ): Promise<SponsorCampaignRecord>;
  getActiveCampaign(streamId: string): Promise<SponsorCampaignRecord | null>;
  getCampaignHistory(streamId: string, limit?: number): Promise<SponsorCampaignRecord[]>;
  endActiveCampaign(streamId: string, endedAt?: string): Promise<SponsorCampaignRecord | null>;
  activateWinningBid(
    bidId: string,
    streamId: string
  ): Promise<{
    success: boolean;
    activated: boolean;
    campaign?: SponsorCampaignRecord;
    previousCampaign?: SponsorCampaignRecord | null;
    reason?: string;
    currentMinimumBid: number;
  }>;
}

export interface IEventQueueRepository {
  enqueue(
    entry: Omit<EventQueueRecord, "id" | "created_at" | "processed_at">
  ): Promise<EventQueueRecord>;
  getNextPending(streamId: string): Promise<EventQueueRecord | null>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, error?: string): Promise<EventQueueRecord | null>;
  retryEvent(id: string): Promise<EventQueueRecord | null>;
  getFailedEvents(streamId: string, limit?: number): Promise<EventQueueRecord[]>;
  getPendingCount(streamId: string): Promise<number>;
}


export interface IAdminRepository {
  logAction(action: Omit<AdminActionRecord, "id" | "created_at">): Promise<AdminActionRecord>;
  getRecentActions(streamId: string, limit?: number): Promise<AdminActionRecord[]>;
}

export interface IRepositoryManager {
  readonly name: string;
  readonly isPersistent: boolean;
  streams: IStreamRepository;
  payments: IPaymentRepository;
  support: ISupportRepository;
  sponsors: ISponsorRepository;
  eventQueue: IEventQueueRepository;
  admin: IAdminRepository;
}
