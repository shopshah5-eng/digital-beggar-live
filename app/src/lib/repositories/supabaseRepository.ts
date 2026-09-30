import { createClient, SupabaseClient } from "@supabase/supabase-js";
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
import { DEFAULT_STREAM_ID } from "./inMemoryRepository";
import { calculateMinimumNextBid } from "../sponsor/rules";

export class SupabaseStreamRepository implements IStreamRepository {
  constructor(private client: SupabaseClient) {}

  async getStream(id: string): Promise<StreamRecord | null> {
    const { data, error } = await this.client
      .from("streams")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      name: data.name || data.title || "Digital Beggar Live",
      status: data.status,
      goal_amount: Number(data.goal_amount),
      raised_amount: Number(data.raised_amount),
      current_sponsor_id: data.current_sponsor_id,
      current_sponsor_name: data.current_sponsor_name,
      current_sponsor_bid: Number(data.current_sponsor_bid),
      minimum_next_bid: Number(data.minimum_next_bid),
      demo_mode: Boolean(data.demo_mode),
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async updateRaisedAmount(id: string, delta: number): Promise<StreamRecord> {
    const current = await this.getStream(id);
    const newTotal = (current ? current.raised_amount : 0) + delta;

    const { data, error } = await this.client
      .from("streams")
      .update({
        raised_amount: newTotal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to update raised amount in Supabase: ${error?.message}`);
    }

    return {
      id: data.id,
      name: data.name || data.title,
      status: data.status,
      goal_amount: Number(data.goal_amount),
      raised_amount: Number(data.raised_amount),
      current_sponsor_id: data.current_sponsor_id,
      current_sponsor_name: data.current_sponsor_name,
      current_sponsor_bid: Number(data.current_sponsor_bid),
      minimum_next_bid: Number(data.minimum_next_bid),
      demo_mode: Boolean(data.demo_mode),
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async updateGoalAmount(id: string, newGoal: number): Promise<StreamRecord> {
    const { data, error } = await this.client
      .from("streams")
      .update({
        goal_amount: newGoal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to update goal amount in Supabase: ${error?.message}`);
    }

    return {
      id: data.id,
      name: data.name || data.title,
      status: data.status,
      goal_amount: Number(data.goal_amount),
      raised_amount: Number(data.raised_amount),
      current_sponsor_id: data.current_sponsor_id,
      current_sponsor_name: data.current_sponsor_name,
      current_sponsor_bid: Number(data.current_sponsor_bid),
      minimum_next_bid: Number(data.minimum_next_bid),
      demo_mode: Boolean(data.demo_mode),
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async updateSponsor(
    id: string,
    sponsorName: string,
    bidAmount: number,
    nextMinBid: number
  ): Promise<StreamRecord> {
    const { data, error } = await this.client
      .from("streams")
      .update({
        current_sponsor_name: sponsorName,
        current_sponsor_bid: bidAmount,
        minimum_next_bid: nextMinBid,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to update sponsor in Supabase: ${error?.message}`);
    }

    return {
      id: data.id,
      name: data.name || data.title,
      status: data.status,
      goal_amount: Number(data.goal_amount),
      raised_amount: Number(data.raised_amount),
      current_sponsor_id: data.current_sponsor_id,
      current_sponsor_name: data.current_sponsor_name,
      current_sponsor_bid: Number(data.current_sponsor_bid),
      minimum_next_bid: Number(data.minimum_next_bid),
      demo_mode: Boolean(data.demo_mode),
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async resetStream(id: string): Promise<StreamRecord> {
    const { data, error } = await this.client
      .from("streams")
      .update({
        raised_amount: 0,
        current_sponsor_id: null,
        current_sponsor_name: null,
        current_sponsor_bid: 0,
        minimum_next_bid: 500,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to reset stream in Supabase: ${error?.message}`);
    }

    return {
      id: data.id,
      name: data.name || data.title,
      status: data.status,
      goal_amount: Number(data.goal_amount),
      raised_amount: Number(data.raised_amount),
      current_sponsor_id: data.current_sponsor_id,
      current_sponsor_name: data.current_sponsor_name,
      current_sponsor_bid: Number(data.current_sponsor_bid),
      minimum_next_bid: Number(data.minimum_next_bid),
      demo_mode: Boolean(data.demo_mode),
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async setStreamStatus(id: string, status: StreamRecord["status"]): Promise<StreamRecord> {
    const { data, error } = await this.client
      .from("streams")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to set stream status in Supabase: ${error?.message}`);
    }

    return {
      id: data.id,
      name: data.name || data.title,
      status: data.status,
      goal_amount: Number(data.goal_amount),
      raised_amount: Number(data.raised_amount),
      current_sponsor_id: data.current_sponsor_id,
      current_sponsor_name: data.current_sponsor_name,
      current_sponsor_bid: Number(data.current_sponsor_bid),
      minimum_next_bid: Number(data.minimum_next_bid),
      demo_mode: Boolean(data.demo_mode),
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }
}

export class SupabasePaymentRepository implements IPaymentRepository {
  constructor(private client: SupabaseClient) {}

  async createPayment(
    payment: Omit<PaymentRecord, "id" | "created_at" | "updated_at">
  ): Promise<PaymentRecord> {
    const { data, error } = await this.client
      .from("payments")
      .insert({
        stream_id: payment.stream_id,
        provider: payment.provider,
        provider_payment_id: payment.provider_payment_id,
        amount: payment.amount,
        currency: payment.currency,
        payment_type: payment.purpose,
        status: payment.status,
        payer_name: payment.payer_name,
        raw_payload: payment.metadata,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to persist payment in Supabase: ${error?.message}`);
    }

    return {
      id: data.id,
      stream_id: data.stream_id,
      provider: data.provider,
      provider_payment_id: data.provider_payment_id,
      amount: Number(data.amount),
      currency: data.currency,
      purpose: data.payment_type,
      status: data.status,
      payer_name: data.payer_name,
      metadata: data.raw_payload,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async getPaymentByProviderPaymentId(providerPaymentId: string): Promise<PaymentRecord | null> {
    const { data, error } = await this.client
      .from("payments")
      .select("*")
      .eq("provider_payment_id", providerPaymentId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      stream_id: data.stream_id,
      provider: data.provider,
      provider_payment_id: data.provider_payment_id,
      amount: Number(data.amount),
      currency: data.currency,
      purpose: data.payment_type,
      status: data.status,
      payer_name: data.payer_name,
      metadata: data.raw_payload,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async getPaymentById(id: string): Promise<PaymentRecord | null> {
    const { data, error } = await this.client
      .from("payments")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      stream_id: data.stream_id,
      provider: data.provider,
      provider_payment_id: data.provider_payment_id,
      amount: Number(data.amount),
      currency: data.currency,
      purpose: data.payment_type,
      status: data.status,
      payer_name: data.payer_name,
      metadata: data.raw_payload,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async getPaymentByOrderId(providerOrderId: string): Promise<PaymentRecord | null> {
    const { data, error } = await this.client
      .from("payments")
      .select("*")
      .eq("provider_order_id", providerOrderId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      stream_id: data.stream_id,
      provider: data.provider,
      provider_order_id: data.provider_order_id,
      provider_payment_id: data.provider_payment_id,
      amount: Number(data.amount),
      amount_paise: data.amount_paise ? Number(data.amount_paise) : undefined,
      currency: data.currency,
      purpose: data.payment_type || data.purpose,
      status: data.status,
      payer_name: data.payer_name,
      message: data.message,
      webhook_event_id: data.webhook_event_id,
      verified_at: data.verified_at,
      metadata: data.raw_payload || data.metadata,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async getPaymentByWebhookEventId(webhookEventId: string): Promise<PaymentRecord | null> {
    const { data, error } = await this.client
      .from("payments")
      .select("*")
      .eq("webhook_event_id", webhookEventId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      stream_id: data.stream_id,
      provider: data.provider,
      provider_order_id: data.provider_order_id,
      provider_payment_id: data.provider_payment_id,
      amount: Number(data.amount),
      amount_paise: data.amount_paise ? Number(data.amount_paise) : undefined,
      currency: data.currency,
      purpose: data.payment_type || data.purpose,
      status: data.status,
      payer_name: data.payer_name,
      message: data.message,
      webhook_event_id: data.webhook_event_id,
      verified_at: data.verified_at,
      metadata: data.raw_payload || data.metadata,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async updatePaymentStatus(id: string, status: PaymentRecord["status"]): Promise<PaymentRecord> {
    return this.updatePayment(id, { status });
  }

  async updatePayment(id: string, updates: Partial<PaymentRecord>): Promise<PaymentRecord> {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.status) payload.status = updates.status;
    if (updates.provider_payment_id) payload.provider_payment_id = updates.provider_payment_id;
    if (updates.webhook_event_id) payload.webhook_event_id = updates.webhook_event_id;
    if (updates.verified_at) payload.verified_at = updates.verified_at;
    if (updates.metadata) payload.raw_payload = updates.metadata;

    const { data, error } = await this.client
      .from("payments")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to update payment in Supabase: ${error?.message}`);
    }

    return {
      id: data.id,
      stream_id: data.stream_id,
      provider: data.provider,
      provider_order_id: data.provider_order_id,
      provider_payment_id: data.provider_payment_id,
      amount: Number(data.amount),
      currency: data.currency,
      purpose: data.payment_type || data.purpose,
      status: data.status,
      payer_name: data.payer_name,
      metadata: data.raw_payload || data.metadata,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async getRecentPayments(streamId?: string, limit: number = 30): Promise<PaymentRecord[]> {
    let query = this.client.from("payments").select("*").order("created_at", { ascending: false }).limit(limit);
    if (streamId) {
      query = query.eq("stream_id", streamId);
    }
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map((d) => ({
      id: d.id,
      stream_id: d.stream_id,
      provider: d.provider,
      provider_order_id: d.provider_order_id,
      provider_payment_id: d.provider_payment_id,
      amount: Number(d.amount),
      currency: d.currency,
      purpose: d.payment_type || d.purpose,
      status: d.status,
      payer_name: d.payer_name,
      metadata: d.raw_payload || d.metadata,
      created_at: d.created_at,
      updated_at: d.updated_at,
    }));
  }
}

export class SupabaseSupportRepository implements ISupportRepository {
  constructor(private client: SupabaseClient) {}

  async createSupportEvent(
    event: Omit<SupportEventRecord, "id" | "created_at">
  ): Promise<SupportEventRecord> {
    const { data, error } = await this.client
      .from("support_events")
      .insert({
        stream_id: event.stream_id,
        payment_id: event.payment_id,
        event_type: event.event_type,
        amount: event.amount,
        currency: event.currency,
        display_name: event.display_name,
        status: event.status,
        metadata: event.metadata,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create support event in Supabase: ${error?.message}`);
    }

    return {
      id: data.id,
      stream_id: data.stream_id,
      payment_id: data.payment_id,
      event_type: data.event_type,
      amount: Number(data.amount),
      currency: data.currency,
      display_name: data.display_name,
      status: data.status,
      metadata: data.metadata,
      created_at: data.created_at,
    };
  }

  async getRecentSupport(streamId: string, limit: number = 10): Promise<SupportEventRecord[]> {
    const { data, error } = await this.client
      .from("support_events")
      .select("*")
      .eq("stream_id", streamId)
      .eq("status", "verified")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((d) => ({
      id: d.id,
      stream_id: d.stream_id,
      payment_id: d.payment_id,
      event_type: d.event_type,
      amount: Number(d.amount),
      currency: d.currency,
      display_name: d.display_name,
      status: d.status,
      metadata: d.metadata,
      created_at: d.created_at,
    }));
  }

  async getVerifiedTotal(streamId: string): Promise<number> {
    const { data, error } = await this.client
      .from("support_events")
      .select("amount")
      .eq("stream_id", streamId)
      .eq("status", "verified");

    if (error || !data) return 0;

    return data.reduce((sum, row) => sum + Number(row.amount), 0);
  }
}

export class SupabaseSponsorRepository implements ISponsorRepository {
  constructor(private client: SupabaseClient) {}

  async createBusiness(business: Omit<BusinessRecord, "id" | "created_at">): Promise<BusinessRecord> {
    const { data, error } = await this.client
      .from("businesses")
      .insert({
        name: business.name,
        contact_email: business.contact_email,
        website: business.website,
        category: business.category,
        description: business.description,
        status: business.status,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create business in Supabase: ${error?.message}`);
    }

    return {
      id: data.id,
      name: data.name,
      contact_email: data.contact_email,
      website: data.website,
      category: data.category,
      description: data.description,
      status: data.status,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async getBusinessById(id: string): Promise<BusinessRecord | null> {
    const { data, error } = await this.client.from("businesses").select("*").eq("id", id).single();
    if (error || !data) return null;
    return {
      id: data.id,
      name: data.name,
      contact_email: data.contact_email,
      website: data.website,
      category: data.category,
      description: data.description,
      status: data.status,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async getBusinessByEmail(email: string): Promise<BusinessRecord | null> {
    const { data, error } = await this.client
      .from("businesses")
      .select("*")
      .eq("contact_email", email.trim().toLowerCase())
      .single();
    if (error || !data) return null;
    return {
      id: data.id,
      name: data.name,
      contact_email: data.contact_email,
      website: data.website,
      category: data.category,
      description: data.description,
      status: data.status,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async createBid(bid: Omit<SponsorBidRecord, "id" | "created_at">): Promise<SponsorBidRecord> {
    const bidAmountInr = bid.bid_amount_inr ?? bid.bid_amount;
    const bidAmountPaise = bid.bid_amount_paise ?? Math.round(bidAmountInr * 100);

    const { data, error } = await this.client
      .from("sponsor_bids")
      .insert({
        stream_id: bid.stream_id,
        business_id: bid.business_id,
        business_name: bid.business_name,
        bid_amount: bidAmountInr,
        bid_amount_paise: bidAmountPaise,
        currency: bid.currency,
        payment_id: bid.payment_id,
        provider_order_id: bid.provider_order_id,
        provider_payment_id: bid.provider_payment_id,
        status: bid.status,
        submitted_at: bid.submitted_at || new Date().toISOString(),
        metadata: bid.metadata,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create sponsor bid in Supabase: ${error?.message}`);
    }

    return {
      id: data.id,
      stream_id: data.stream_id,
      business_id: data.business_id,
      business_name: data.business_name,
      bid_amount: Number(data.bid_amount),
      bid_amount_inr: Number(data.bid_amount),
      bid_amount_paise: data.bid_amount_paise ? Number(data.bid_amount_paise) : bidAmountPaise,
      currency: data.currency,
      payment_id: data.payment_id,
      provider_order_id: data.provider_order_id,
      provider_payment_id: data.provider_payment_id,
      status: data.status,
      submitted_at: data.submitted_at,
      verified_at: data.verified_at,
      rejected_at: data.rejected_at,
      rejection_reason: data.rejection_reason,
      metadata: data.metadata,
      created_at: data.created_at,
    };
  }

  async getBidById(id: string): Promise<SponsorBidRecord | null> {
    const { data, error } = await this.client.from("sponsor_bids").select("*").eq("id", id).single();
    if (error || !data) return null;
    return {
      id: data.id,
      stream_id: data.stream_id,
      business_id: data.business_id,
      business_name: data.business_name,
      bid_amount: Number(data.bid_amount),
      bid_amount_inr: Number(data.bid_amount),
      bid_amount_paise: data.bid_amount_paise ? Number(data.bid_amount_paise) : undefined,
      currency: data.currency,
      payment_id: data.payment_id,
      provider_order_id: data.provider_order_id,
      provider_payment_id: data.provider_payment_id,
      status: data.status,
      submitted_at: data.submitted_at,
      verified_at: data.verified_at,
      rejected_at: data.rejected_at,
      rejection_reason: data.rejection_reason,
      metadata: data.metadata,
      created_at: data.created_at,
    };
  }

  async getBidByOrderId(providerOrderId: string): Promise<SponsorBidRecord | null> {
    const { data, error } = await this.client
      .from("sponsor_bids")
      .select("*")
      .eq("provider_order_id", providerOrderId)
      .single();
    if (error || !data) return null;
    return {
      id: data.id,
      stream_id: data.stream_id,
      business_id: data.business_id,
      business_name: data.business_name,
      bid_amount: Number(data.bid_amount),
      bid_amount_inr: Number(data.bid_amount),
      bid_amount_paise: data.bid_amount_paise ? Number(data.bid_amount_paise) : undefined,
      currency: data.currency,
      payment_id: data.payment_id,
      provider_order_id: data.provider_order_id,
      provider_payment_id: data.provider_payment_id,
      status: data.status,
      submitted_at: data.submitted_at,
      verified_at: data.verified_at,
      rejected_at: data.rejected_at,
      rejection_reason: data.rejection_reason,
      metadata: data.metadata,
      created_at: data.created_at,
    };
  }

  async updateBidStatus(
    id: string,
    status: SponsorBidRecord["status"],
    updates?: Partial<SponsorBidRecord>
  ): Promise<SponsorBidRecord> {
    const payload: Record<string, unknown> = { status, ...(updates || {}) };
    const { data, error } = await this.client
      .from("sponsor_bids")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to update bid status in Supabase: ${error?.message}`);
    }

    return {
      id: data.id,
      stream_id: data.stream_id,
      business_id: data.business_id,
      business_name: data.business_name,
      bid_amount: Number(data.bid_amount),
      bid_amount_inr: Number(data.bid_amount),
      currency: data.currency,
      payment_id: data.payment_id,
      provider_order_id: data.provider_order_id,
      provider_payment_id: data.provider_payment_id,
      status: data.status,
      submitted_at: data.submitted_at,
      verified_at: data.verified_at,
      rejected_at: data.rejected_at,
      rejection_reason: data.rejection_reason,
      metadata: data.metadata,
      created_at: data.created_at,
    };
  }

  async getRecentBids(streamId: string, limit: number = 30): Promise<SponsorBidRecord[]> {
    const { data, error } = await this.client
      .from("sponsor_bids")
      .select("*")
      .eq("stream_id", streamId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((d) => ({
      id: d.id,
      stream_id: d.stream_id,
      business_id: d.business_id,
      business_name: d.business_name,
      bid_amount: Number(d.bid_amount),
      bid_amount_inr: Number(d.bid_amount),
      bid_amount_paise: d.bid_amount_paise ? Number(d.bid_amount_paise) : undefined,
      currency: d.currency,
      payment_id: d.payment_id,
      provider_order_id: d.provider_order_id,
      provider_payment_id: d.provider_payment_id,
      status: d.status,
      submitted_at: d.submitted_at,
      verified_at: d.verified_at,
      rejected_at: d.rejected_at,
      rejection_reason: d.rejection_reason,
      metadata: d.metadata,
      created_at: d.created_at,
    }));
  }

  async createCampaign(
    campaign: Omit<SponsorCampaignRecord, "id" | "created_at">
  ): Promise<SponsorCampaignRecord> {
    const { data, error } = await this.client
      .from("sponsor_campaigns")
      .insert({
        business_id: campaign.business_id,
        bid_id: campaign.bid_id,
        stream_id: campaign.stream_id,
        sponsor_name: campaign.sponsor_name,
        website: campaign.website,
        category: campaign.category,
        bid_amount: campaign.bid_amount_inr,
        status: campaign.status,
        started_at: campaign.started_at,
        ended_at: campaign.ended_at,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create campaign in Supabase: ${error?.message}`);
    }

    return {
      id: data.id,
      business_id: data.business_id,
      bid_id: data.bid_id,
      stream_id: data.stream_id,
      sponsor_name: data.sponsor_name,
      website: data.website,
      category: data.category,
      bid_amount_inr: Number(data.bid_amount),
      status: data.status,
      started_at: data.started_at,
      ended_at: data.ended_at,
      created_at: data.created_at,
    };
  }

  async getActiveCampaign(streamId: string): Promise<SponsorCampaignRecord | null> {
    const { data, error } = await this.client
      .from("sponsor_campaigns")
      .select("*")
      .eq("stream_id", streamId)
      .eq("status", "SPONSOR_ACTIVE")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return {
      id: data.id,
      business_id: data.business_id,
      bid_id: data.bid_id,
      stream_id: data.stream_id,
      sponsor_name: data.sponsor_name,
      website: data.website,
      category: data.category,
      bid_amount_inr: Number(data.bid_amount),
      status: data.status,
      started_at: data.started_at,
      ended_at: data.ended_at,
      created_at: data.created_at,
    };
  }

  async getCampaignHistory(streamId: string, limit: number = 20): Promise<SponsorCampaignRecord[]> {
    const { data, error } = await this.client
      .from("sponsor_campaigns")
      .select("*")
      .eq("stream_id", streamId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data.map((d) => ({
      id: d.id,
      business_id: d.business_id,
      bid_id: d.bid_id,
      stream_id: d.stream_id,
      sponsor_name: d.sponsor_name,
      website: d.website,
      category: d.category,
      bid_amount_inr: Number(d.bid_amount),
      status: d.status,
      started_at: d.started_at,
      ended_at: d.ended_at,
      created_at: d.created_at,
    }));
  }

  async endActiveCampaign(streamId: string, endedAt?: string): Promise<SponsorCampaignRecord | null> {
    const now = endedAt || new Date().toISOString();
    const { data, error } = await this.client
      .from("sponsor_campaigns")
      .update({ status: "SPONSOR_ENDED", ended_at: now })
      .eq("stream_id", streamId)
      .eq("status", "SPONSOR_ACTIVE")
      .select()
      .maybeSingle();

    if (error || !data) return null;
    return {
      id: data.id,
      business_id: data.business_id,
      bid_id: data.bid_id,
      stream_id: data.stream_id,
      sponsor_name: data.sponsor_name,
      website: data.website,
      category: data.category,
      bid_amount_inr: Number(data.bid_amount),
      status: data.status,
      started_at: data.started_at,
      ended_at: data.ended_at,
      created_at: data.created_at,
    };
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
    const bid = await this.getBidById(bidId);
    if (!bid) {
      throw new Error(`Sponsor bid ${bidId} not found in Supabase.`);
    }

    const activeCampaign = await this.getActiveCampaign(streamId);
    const currentVerifiedBid = activeCampaign?.bid_amount_inr || 0;
    const currentMinimumBid = calculateMinimumNextBid(currentVerifiedBid);
    const bidAmountInr = bid.bid_amount_inr ?? bid.bid_amount;

    if (bidAmountInr < currentMinimumBid) {
      await this.updateBidStatus(bidId, "REFUND_REQUIRED", {
        rejected_at: new Date().toISOString(),
        rejection_reason: `Outbid by concurrent verified sponsor. Required: ₹${currentMinimumBid.toLocaleString()}, Offered: ₹${bidAmountInr.toLocaleString()}.`,
      });
      return {
        success: false,
        activated: false,
        reason: "OUTBID",
        currentMinimumBid,
      };
    }

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

    const nextMin = calculateMinimumNextBid(bidAmountInr);
    await this.client
      .from("streams")
      .update({
        current_sponsor_name: sponsorName,
        current_sponsor_bid: bidAmountInr,
        minimum_next_bid: nextMin,
        updated_at: new Date().toISOString(),
      })
      .eq("id", streamId);

    await this.updateBidStatus(bidId, "BID_ACCEPTED", {
      verified_at: new Date().toISOString(),
    });

    return {
      success: true,
      activated: true,
      campaign: newCampaign,
      previousCampaign,
      currentMinimumBid: nextMin,
    };
  }
}

export class SupabaseEventQueueRepository implements IEventQueueRepository {
  constructor(private client: SupabaseClient) {}

  async enqueue(
    entry: Omit<EventQueueRecord, "id" | "created_at" | "processed_at">
  ): Promise<EventQueueRecord> {
    const { data, error } = await this.client
      .from("event_queue")
      .insert({
        stream_id: entry.stream_id,
        event_type: entry.event_type,
        payload: entry.payload,
        status: entry.status,
        priority: entry.priority,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to enqueue event in Supabase: ${error?.message}`);
    }

    return {
      id: data.id,
      stream_id: data.stream_id,
      event_type: data.event_type,
      payload: data.payload,
      status: data.status,
      priority: data.priority,
      created_at: data.created_at,
      processed_at: data.processed_at,
    };
  }

  async getNextPending(streamId: string): Promise<EventQueueRecord | null> {
    const { data, error } = await this.client
      .from("event_queue")
      .select("*")
      .eq("stream_id", streamId)
      .eq("status", "pending")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      stream_id: data.stream_id,
      event_type: data.event_type,
      payload: data.payload,
      status: data.status,
      priority: data.priority,
      created_at: data.created_at,
      processed_at: data.processed_at,
    };
  }

  async markProcessed(id: string): Promise<void> {
    await this.client
      .from("event_queue")
      .update({
        status: "completed",
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  }

  async markFailed(id: string, error?: string): Promise<EventQueueRecord | null> {
    const { data: existing } = await this.client
      .from("event_queue")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!existing) return null;

    const attempts = (existing.attempts || 0) + 1;
    const status = attempts < 3 ? "retrying" : "failed";

    const { data, error: updateError } = await this.client
      .from("event_queue")
      .update({
        attempts,
        last_error: error || "Processing error",
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError || !data) return null;
    return {
      id: data.id,
      stream_id: data.stream_id,
      event_type: data.event_type,
      payload: data.payload,
      status: data.status,
      priority: data.priority,
      attempts: data.attempts,
      last_error: data.last_error,
      created_at: data.created_at,
      processed_at: data.processed_at,
      updated_at: data.updated_at,
    };
  }

  async retryEvent(id: string): Promise<EventQueueRecord | null> {
    const { data, error } = await this.client
      .from("event_queue")
      .update({
        status: "retrying",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) return null;
    return {
      id: data.id,
      stream_id: data.stream_id,
      event_type: data.event_type,
      payload: data.payload,
      status: data.status,
      priority: data.priority,
      attempts: data.attempts,
      last_error: data.last_error,
      created_at: data.created_at,
      processed_at: data.processed_at,
      updated_at: data.updated_at,
    };
  }

  async getFailedEvents(streamId: string, limit: number = 20): Promise<EventQueueRecord[]> {
    const { data, error } = await this.client
      .from("event_queue")
      .select("*")
      .eq("stream_id", streamId)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data.map((d) => ({
      id: d.id,
      stream_id: d.stream_id,
      event_type: d.event_type,
      payload: d.payload,
      status: d.status,
      priority: d.priority,
      attempts: d.attempts,
      last_error: d.last_error,
      created_at: d.created_at,
      processed_at: d.processed_at,
      updated_at: d.updated_at,
    }));
  }

  async getPendingCount(streamId: string): Promise<number> {
    const { count, error } = await this.client
      .from("event_queue")
      .select("*", { count: "exact", head: true })
      .eq("stream_id", streamId)
      .in("status", ["pending", "retrying"]);

    if (error || count === null) return 0;
    return count;
  }
}

export class SupabaseAdminRepository implements IAdminRepository {
  constructor(private client: SupabaseClient) {}

  async logAction(action: Omit<AdminActionRecord, "id" | "created_at">): Promise<AdminActionRecord> {
    const { data, error } = await this.client
      .from("admin_actions")
      .insert({
        stream_id: action.stream_id,
        action_type: action.action_type,
        actor: action.actor,
        details: action.details,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to log admin action in Supabase: ${error?.message}`);
    }

    return {
      id: data.id,
      stream_id: data.stream_id,
      action_type: data.action_type,
      actor: data.actor,
      details: data.details,
      created_at: data.created_at,
    };
  }

  async getRecentActions(streamId: string, limit: number = 20): Promise<AdminActionRecord[]> {
    const { data, error } = await this.client
      .from("admin_actions")
      .select("*")
      .eq("stream_id", streamId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((d) => ({
      id: d.id,
      stream_id: d.stream_id,
      action_type: d.action_type,
      actor: d.actor,
      details: d.details,
      created_at: d.created_at,
    }));
  }
}

export class SupabaseRepositoryManager implements IRepositoryManager {
  public readonly name = "SupabaseRepositoryManager";
  public readonly isPersistent = true;

  public streams: IStreamRepository;
  public payments: IPaymentRepository;
  public support: ISupportRepository;
  public sponsors: ISponsorRepository;
  public eventQueue: IEventQueueRepository;
  public admin: IAdminRepository;

  constructor(supabaseUrl: string, supabaseServiceKey: string) {
    const client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    this.streams = new SupabaseStreamRepository(client);
    this.payments = new SupabasePaymentRepository(client);
    this.support = new SupabaseSupportRepository(client);
    this.sponsors = new SupabaseSponsorRepository(client);
    this.eventQueue = new SupabaseEventQueueRepository(client);
    this.admin = new SupabaseAdminRepository(client);
  }
}
