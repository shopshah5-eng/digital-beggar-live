import {
  AdminActionRecord,
  IAdminRepository,
  IEventQueueRepository,
  IPaymentRepository,
  IRepositoryManager,
  ISponsorRepository,
  IStreamRepository,
  ISupportRepository,
  BusinessRecord,
  SponsorCampaignRecord,
  EventQueueRecord,
  PaymentRecord,
  SponsorBidRecord,
  StreamRecord,
  SupportEventRecord,
} from "./types";
import { calculateMinimumNextBid } from "../sponsor/rules";

export const DEFAULT_STREAM_ID = "stream_default_01";

export class InMemoryStreamRepository implements IStreamRepository {
  private streams: Map<string, StreamRecord> = new Map();

  constructor() {
    this.initDefaultStream();
  }

  private initDefaultStream(): void {
    const now = new Date().toISOString();
    this.streams.set(DEFAULT_STREAM_ID, {
      id: DEFAULT_STREAM_ID,
      name: "Digital Beggar Live",
      status: "active",
      goal_amount: 100000,
      raised_amount: 0,
      current_sponsor_id: null,
      current_sponsor_name: null,
      current_sponsor_bid: 0,
      minimum_next_bid: 500,
      demo_mode: true,
      created_at: now,
      updated_at: now,
    });
  }

  async getStream(id: string): Promise<StreamRecord | null> {
    const stream = this.streams.get(id);
    return stream ? { ...stream } : null;
  }

  async updateRaisedAmount(id: string, delta: number): Promise<StreamRecord> {
    const stream = this.streams.get(id) || (await this.getStream(DEFAULT_STREAM_ID))!;
    stream.raised_amount += delta;
    stream.updated_at = new Date().toISOString();
    this.streams.set(stream.id, stream);
    return { ...stream };
  }

  async updateGoalAmount(id: string, newGoal: number): Promise<StreamRecord> {
    const stream = this.streams.get(id) || (await this.getStream(DEFAULT_STREAM_ID))!;
    stream.goal_amount = newGoal;
    stream.updated_at = new Date().toISOString();
    this.streams.set(stream.id, stream);
    return { ...stream };
  }

  async updateSponsor(
    id: string,
    sponsorName: string,
    bidAmount: number,
    nextMinBid: number
  ): Promise<StreamRecord> {
    const stream = this.streams.get(id) || (await this.getStream(DEFAULT_STREAM_ID))!;
    stream.current_sponsor_name = sponsorName;
    stream.current_sponsor_bid = bidAmount;
    stream.minimum_next_bid = nextMinBid;
    stream.updated_at = new Date().toISOString();
    this.streams.set(stream.id, stream);
    return { ...stream };
  }

  async resetStream(id: string): Promise<StreamRecord> {
    const now = new Date().toISOString();
    const clean: StreamRecord = {
      id,
      name: "Digital Beggar Live",
      status: "active",
      goal_amount: 100000,
      raised_amount: 0,
      current_sponsor_id: null,
      current_sponsor_name: null,
      current_sponsor_bid: 0,
      minimum_next_bid: 500,
      demo_mode: true,
      created_at: now,
      updated_at: now,
    };
    this.streams.set(id, clean);
    return { ...clean };
  }

  async setStreamStatus(id: string, status: StreamRecord["status"]): Promise<StreamRecord> {
    const stream = this.streams.get(id) || (await this.getStream(DEFAULT_STREAM_ID))!;
    stream.status = status;
    stream.updated_at = new Date().toISOString();
    this.streams.set(stream.id, stream);
    return { ...stream };
  }
}

export class InMemoryPaymentRepository implements IPaymentRepository {
  private paymentsById: Map<string, PaymentRecord> = new Map();
  private paymentsByProviderId: Map<string, PaymentRecord> = new Map();
  private paymentsByOrderId: Map<string, PaymentRecord> = new Map();
  private paymentsByWebhookId: Map<string, PaymentRecord> = new Map();

  async createPayment(
    payment: Omit<PaymentRecord, "id" | "created_at" | "updated_at">
  ): Promise<PaymentRecord> {
    if (payment.provider_payment_id) {
      const existing = this.paymentsByProviderId.get(payment.provider_payment_id);
      if (existing) {
        throw new Error(`Duplicate payment detected. Provider Payment ID ${payment.provider_payment_id} already exists.`);
      }
    }

    const id = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();
    const record: PaymentRecord = {
      id,
      created_at: now,
      updated_at: now,
      ...payment,
    };

    this.paymentsById.set(id, record);
    if (payment.provider_payment_id) {
      this.paymentsByProviderId.set(payment.provider_payment_id, record);
    }
    if (payment.provider_order_id) {
      this.paymentsByOrderId.set(payment.provider_order_id, record);
    }
    if (payment.webhook_event_id) {
      this.paymentsByWebhookId.set(payment.webhook_event_id, record);
    }
    return { ...record };
  }

  async getPaymentByProviderPaymentId(providerPaymentId: string): Promise<PaymentRecord | null> {
    const record = this.paymentsByProviderId.get(providerPaymentId);
    return record ? { ...record } : null;
  }

  async getPaymentByOrderId(providerOrderId: string): Promise<PaymentRecord | null> {
    const record = this.paymentsByOrderId.get(providerOrderId);
    return record ? { ...record } : null;
  }

  async getPaymentByWebhookEventId(webhookEventId: string): Promise<PaymentRecord | null> {
    const record = this.paymentsByWebhookId.get(webhookEventId);
    return record ? { ...record } : null;
  }

  async getPaymentById(id: string): Promise<PaymentRecord | null> {
    const record = this.paymentsById.get(id);
    return record ? { ...record } : null;
  }

  async updatePaymentStatus(id: string, status: PaymentRecord["status"]): Promise<PaymentRecord> {
    return this.updatePayment(id, { status });
  }

  async updatePayment(id: string, updates: Partial<PaymentRecord>): Promise<PaymentRecord> {
    const record = this.paymentsById.get(id);
    if (!record) {
      throw new Error(`Payment with ID ${id} not found.`);
    }
    const updated: PaymentRecord = {
      ...record,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.paymentsById.set(id, updated);
    if (updated.provider_payment_id) {
      this.paymentsByProviderId.set(updated.provider_payment_id, updated);
    }
    if (updated.provider_order_id) {
      this.paymentsByOrderId.set(updated.provider_order_id, updated);
    }
    if (updated.webhook_event_id) {
      this.paymentsByWebhookId.set(updated.webhook_event_id, updated);
    }
    return { ...updated };
  }

  async getRecentPayments(streamId?: string, limit: number = 30): Promise<PaymentRecord[]> {
    const all = Array.from(this.paymentsById.values());
    const filtered = streamId ? all.filter((p) => p.stream_id === streamId) : all;
    return filtered
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  }
}

export class InMemorySupportRepository implements ISupportRepository {
  private events: SupportEventRecord[] = [];

  async createSupportEvent(
    event: Omit<SupportEventRecord, "id" | "created_at">
  ): Promise<SupportEventRecord> {
    const id = `supp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const record: SupportEventRecord = {
      id,
      created_at: new Date().toISOString(),
      ...event,
    };
    this.events.push(record);
    return { ...record };
  }

  async getRecentSupport(streamId: string, limit: number = 10): Promise<SupportEventRecord[]> {
    return this.events
      .filter((e) => e.stream_id === streamId && e.status === "verified")
      .slice(-limit)
      .reverse()
      .map((e) => ({ ...e }));
  }

  async getVerifiedTotal(streamId: string): Promise<number> {
    return this.events
      .filter((e) => e.stream_id === streamId && e.status === "verified")
      .reduce((sum, e) => sum + e.amount, 0);
  }
}

export class InMemorySponsorRepository implements ISponsorRepository {
  private businesses: Map<string, BusinessRecord> = new Map();
  private bids: SponsorBidRecord[] = [];
  private campaigns: SponsorCampaignRecord[] = [];

  constructor(private streamRepo?: InMemoryStreamRepository) {}

  async createBusiness(business: Omit<BusinessRecord, "id" | "created_at">): Promise<BusinessRecord> {
    const id = `biz_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const record: BusinessRecord = {
      id,
      created_at: new Date().toISOString(),
      ...business,
    };
    this.businesses.set(id, record);
    return { ...record };
  }

  async getBusinessById(id: string): Promise<BusinessRecord | null> {
    const biz = this.businesses.get(id);
    return biz ? { ...biz } : null;
  }

  async getBusinessByEmail(email: string): Promise<BusinessRecord | null> {
    const normalized = email.trim().toLowerCase();
    for (const b of this.businesses.values()) {
      if (b.contact_email.toLowerCase() === normalized) {
        return { ...b };
      }
    }
    return null;
  }

  async createBid(bid: Omit<SponsorBidRecord, "id" | "created_at">): Promise<SponsorBidRecord> {
    const id = `bid_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const record: SponsorBidRecord = {
      id,
      created_at: new Date().toISOString(),
      ...bid,
      bid_amount_inr: bid.bid_amount_inr ?? bid.bid_amount,
      bid_amount_paise:
        bid.bid_amount_paise ?? Math.round((bid.bid_amount_inr ?? bid.bid_amount) * 100),
    };
    this.bids.push(record);
    return { ...record };
  }

  async getBidById(id: string): Promise<SponsorBidRecord | null> {
    const bid = this.bids.find((b) => b.id === id);
    return bid ? { ...bid } : null;
  }

  async getBidByOrderId(providerOrderId: string): Promise<SponsorBidRecord | null> {
    const bid = this.bids.find((b) => b.provider_order_id === providerOrderId);
    return bid ? { ...bid } : null;
  }

  async updateBidStatus(
    id: string,
    status: SponsorBidRecord["status"],
    updates?: Partial<SponsorBidRecord>
  ): Promise<SponsorBidRecord> {
    const bid = this.bids.find((b) => b.id === id);
    if (!bid) {
      throw new Error(`Sponsor bid with ID ${id} not found.`);
    }
    bid.status = status;
    if (updates) {
      Object.assign(bid, updates);
    }
    return { ...bid };
  }

  async getRecentBids(streamId: string, limit: number = 30): Promise<SponsorBidRecord[]> {
    return this.bids
      .filter((b) => b.stream_id === streamId)
      .slice(-limit)
      .reverse()
      .map((b) => ({ ...b }));
  }

  async createCampaign(
    campaign: Omit<SponsorCampaignRecord, "id" | "created_at">
  ): Promise<SponsorCampaignRecord> {
    const id = `camp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const record: SponsorCampaignRecord = {
      id,
      created_at: new Date().toISOString(),
      ...campaign,
    };
    this.campaigns.push(record);
    return { ...record };
  }

  async getActiveCampaign(streamId: string): Promise<SponsorCampaignRecord | null> {
    const active = this.campaigns
      .filter((c) => c.stream_id === streamId && c.status === "SPONSOR_ACTIVE")
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0];
    return active ? { ...active } : null;
  }

  async getCampaignHistory(streamId: string, limit: number = 20): Promise<SponsorCampaignRecord[]> {
    return this.campaigns
      .filter((c) => c.stream_id === streamId)
      .slice(-limit)
      .reverse()
      .map((c) => ({ ...c }));
  }

  async endActiveCampaign(streamId: string, endedAt?: string): Promise<SponsorCampaignRecord | null> {
    const active = this.campaigns.find(
      (c) => c.stream_id === streamId && c.status === "SPONSOR_ACTIVE"
    );
    if (active) {
      active.status = "SPONSOR_ENDED";
      active.ended_at = endedAt || new Date().toISOString();
      return { ...active };
    }
    return null;
  }

  async activateWinningBid(
    bidId: string,
    streamId: string
  ): Promise<{
    success: boolean;
    activated: boolean;
    campaign?: SponsorCampaignRecord;
    previousCampaign?: SponsorCampaignRecord | null;
    reason?: string;
    currentMinimumBid: number;
  }> {
    const bid = this.bids.find((b) => b.id === bidId);
    if (!bid) {
      throw new Error(`Sponsor bid ${bidId} not found.`);
    }

    // Atomic Crown Check: Determine current verified crown & minimum next bid
    const activeCampaign = await this.getActiveCampaign(streamId);
    let currentVerifiedBid = activeCampaign?.bid_amount_inr || 0;

    if (!activeCampaign && this.streamRepo) {
      const stream = await this.streamRepo.getStream(streamId);
      if (stream?.current_sponsor_bid) {
        currentVerifiedBid = stream.current_sponsor_bid;
      }
    }

    const currentMinimumBid = calculateMinimumNextBid(currentVerifiedBid);
    const bidAmountInr =
      bid.bid_amount_inr ?? bid.bid_amount ?? ((bid.bid_amount_paise || 0) / 100);

    // Concurrency / Eligibility Check:
    if (bidAmountInr < currentMinimumBid) {
      // Outbid by a concurrent winning bid!
      bid.status = "REFUND_REQUIRED";
      bid.rejected_at = new Date().toISOString();
      bid.rejection_reason = `Outbid by concurrent verified sponsor. Required: ₹${currentMinimumBid.toLocaleString()}, Offered: ₹${bidAmountInr.toLocaleString()}.`;
      return {
        success: false,
        activated: false,
        reason: "OUTBID",
        currentMinimumBid,
      };
    }

    // Crown Won! End previous campaign
    const previousCampaign = await this.endActiveCampaign(streamId);

    const business = bid.business_id ? await this.getBusinessById(bid.business_id) : null;
    const sponsorName = business?.name || bid.business_name || "Anonymous Sponsor";
    const website = business?.website || "";
    const category = business?.category || "General";

    const newCampaign = await this.createCampaign({
      business_id: bid.business_id || `biz_${bid.id}`,
      bid_id: bid.id,
      stream_id: streamId,
      sponsor_name: sponsorName,
      website,
      category,
      bid_amount_inr: bidAmountInr,
      status: "SPONSOR_ACTIVE",
      started_at: new Date().toISOString(),
      ended_at: null,
    });

    // Update Stream Record
    const nextMin = calculateMinimumNextBid(bidAmountInr);
    if (this.streamRepo) {
      await this.streamRepo.updateSponsor(streamId, sponsorName, bidAmountInr, nextMin);
    }

    bid.status = "BID_ACCEPTED";
    bid.verified_at = new Date().toISOString();

    return {
      success: true,
      activated: true,
      campaign: newCampaign,
      previousCampaign,
      currentMinimumBid: nextMin,
    };
  }
}

export class InMemoryEventQueueRepository implements IEventQueueRepository {
  private queue: EventQueueRecord[] = [];

  async enqueue(
    entry: Omit<EventQueueRecord, "id" | "created_at" | "processed_at">
  ): Promise<EventQueueRecord> {
    const id = `eq_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const record: EventQueueRecord = {
      id,
      created_at: new Date().toISOString(),
      processed_at: null,
      attempts: 0,
      last_error: null,
      ...entry,
    };
    this.queue.push(record);
    return { ...record };
  }

  async getNextPending(streamId: string): Promise<EventQueueRecord | null> {
    const next = this.queue.find(
      (e) => e.stream_id === streamId && (e.status === "pending" || e.status === "retrying")
    );
    return next ? { ...next } : null;
  }

  async markProcessed(id: string): Promise<void> {
    const record = this.queue.find((e) => e.id === id);
    if (record) {
      record.status = "completed";
      record.processed_at = new Date().toISOString();
      record.updated_at = new Date().toISOString();
    }
  }

  async markFailed(id: string, error?: string): Promise<EventQueueRecord | null> {
    const record = this.queue.find((e) => e.id === id);
    if (record) {
      const attempts = (record.attempts || 0) + 1;
      record.attempts = attempts;
      record.last_error = error || "Processing error";
      record.updated_at = new Date().toISOString();

      // Retry policy: max 3 attempts before marking terminal FAILED
      if (attempts < 3) {
        record.status = "retrying";
      } else {
        record.status = "failed";
      }
      return { ...record };
    }
    return null;
  }

  async retryEvent(id: string): Promise<EventQueueRecord | null> {
    const record = this.queue.find((e) => e.id === id);
    if (record && record.status === "failed") {
      record.status = "retrying";
      record.updated_at = new Date().toISOString();
      return { ...record };
    }
    return null;
  }

  async getFailedEvents(streamId: string, limit: number = 20): Promise<EventQueueRecord[]> {
    return this.queue
      .filter((e) => e.stream_id === streamId && e.status === "failed")
      .slice(-limit)
      .reverse();
  }

  async getPendingCount(streamId: string): Promise<number> {
    return this.queue.filter(
      (e) => e.stream_id === streamId && (e.status === "pending" || e.status === "retrying")
    ).length;
  }
}

export class InMemoryAdminRepository implements IAdminRepository {
  private actions: AdminActionRecord[] = [];

  async logAction(action: Omit<AdminActionRecord, "id" | "created_at">): Promise<AdminActionRecord> {
    const record: AdminActionRecord = {
      ...action,
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      created_at: new Date().toISOString(),
    };
    this.actions.unshift(record);
    return { ...record };
  }

  async getRecentActions(streamId: string, limit: number = 20): Promise<AdminActionRecord[]> {
    return this.actions
      .filter((a) => a.stream_id === streamId)
      .slice(0, limit)
      .map((a) => ({ ...a }));
  }
}

export class InMemoryRepositoryManager implements IRepositoryManager {
  public readonly name = "InMemoryRepositoryManager";
  public readonly isPersistent = false;

  public streams: IStreamRepository;
  public payments: IPaymentRepository;
  public support: ISupportRepository;
  public sponsors: ISponsorRepository;
  public eventQueue: IEventQueueRepository;
  public admin: IAdminRepository;

  constructor() {
    const streams = new InMemoryStreamRepository();
    this.streams = streams;
    this.payments = new InMemoryPaymentRepository();
    this.support = new InMemorySupportRepository();
    this.sponsors = new InMemorySponsorRepository(streams);
    this.eventQueue = new InMemoryEventQueueRepository();
    this.admin = new InMemoryAdminRepository();
  }
}
