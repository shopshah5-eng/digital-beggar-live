import {
  BroadcastMessage,
  EventType,
  StreamEvent,
  StreamState,
} from "../types/events";
import { demoPaymentProvider } from "../payments/demoProvider";
import { IRepositoryManager } from "../repositories/types";
import { repositoryManager } from "../repositories/factory";
import { DEFAULT_STREAM_ID } from "../repositories/inMemoryRepository";
import { calculateMinimumNextBid } from "../sponsor/rules";
import { voiceService } from "../voice/voiceService";
import { reactionService } from "../reactions/reactionService";

export interface PublicStreamState {
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
  recentSupport: { displayName: string; amount: number; timestamp: string } | null;
  lastEvent: { type: EventType; amount: number; displayName: string; timestamp: string; status?: string } | null;
  viewerDisplayMode: "static_demo" | "live";
  demoMode: boolean;
  isSpeaking?: boolean;
  isVoiceMuted?: boolean;
  voiceStatus?: string;
  lastVoiceLine?: string | null;
}

type SubscriberCallback = (msg: BroadcastMessage) => void;

export class EventEngine {
  private repo: IRepositoryManager;
  private streamId: string = DEFAULT_STREAM_ID;
  private subscribers: Map<string, SubscriberCallback> = new Map();
  private lastStreamEvent: StreamEvent | null = null;

  constructor(repo?: IRepositoryManager) {
    this.repo = repo ?? repositoryManager;
  }

  public async getState(): Promise<StreamState> {
    const stream = await this.repo.streams.getStream(this.streamId);
    const recent = await this.repo.support.getRecentSupport(this.streamId, 1);
    const activeCampaign = await this.repo.sponsors.getActiveCampaign(this.streamId);

    const recentSupport =
      recent.length > 0
        ? {
            displayName: recent[0].display_name,
            amount: recent[0].amount,
            timestamp: recent[0].created_at,
          }
        : null;

    const sponsorName = activeCampaign?.sponsor_name || stream?.current_sponsor_name || null;
    const sponsorBid = activeCampaign?.bid_amount_inr || stream?.current_sponsor_bid || 0;
    const minBid = calculateMinimumNextBid(sponsorBid);

    const currentSponsorInfo =
      activeCampaign && activeCampaign.status === "SPONSOR_ACTIVE"
        ? {
            displayName: activeCampaign.sponsor_name,
            verifiedBid: activeCampaign.bid_amount_inr,
            website: activeCampaign.website,
            category: activeCampaign.category,
            campaignStartTime: activeCampaign.started_at,
            disclosure: "CURRENT SPONSOR" as const,
          }
        : sponsorName && sponsorBid > 0
        ? {
            displayName: sponsorName,
            verifiedBid: sponsorBid,
            website: "",
            category: "General",
            campaignStartTime: stream?.updated_at || new Date().toISOString(),
            disclosure: "CURRENT SPONSOR" as const,
          }
        : null;

    const voice = voiceService.getStatus();

    if (!stream) {
      return {
        streamId: this.streamId,
        status: "active",
        goalAmount: 100000,
        raisedAmount: 0,
        currentSponsor: null,
        currentSponsorBid: 0,
        currentSponsorInfo: null,
        minimumNextBid: 500,
        recentSupport,
        lastEvent: this.lastStreamEvent,
        viewerDisplayMode: "static_demo",
        demoMode: true,
        isSpeaking: voice.isSpeaking,
        isVoiceMuted: voice.isMuted,
        voiceStatus: voice.provider,
        lastVoiceLine: voice.lastSpokenText,
      };
    }

    return {
      streamId: stream.id,
      status: stream.status,
      goalAmount: stream.goal_amount,
      raisedAmount: stream.raised_amount,
      currentSponsor: sponsorName,
      currentSponsorBid: sponsorBid,
      currentSponsorInfo,
      minimumNextBid: minBid,
      recentSupport,
      lastEvent: this.lastStreamEvent,
      viewerDisplayMode: "static_demo",
      demoMode: stream.demo_mode,
      isSpeaking: voice.isSpeaking,
      isVoiceMuted: voice.isMuted,
      voiceStatus: voice.provider,
      lastVoiceLine: voice.lastSpokenText,
    };
  }

  // Sanitized public state: NEVER leaks internal IDs, payment tokens, or secrets
  public async getPublicState(): Promise<PublicStreamState> {
    const s = await this.getState();
    return {
      streamId: s.streamId,
      status: s.status,
      goalAmount: s.goalAmount,
      raisedAmount: s.raisedAmount,
      currentSponsor: s.currentSponsor,
      currentSponsorBid: s.currentSponsorBid,
      currentSponsorInfo: s.currentSponsorInfo,
      minimumNextBid: s.minimumNextBid,
      recentSupport: s.recentSupport,
      lastEvent: s.lastEvent
        ? {
            type: s.lastEvent.type,
            amount: s.lastEvent.amount,
            displayName: s.lastEvent.displayName,
            timestamp: s.lastEvent.timestamp,
            status: s.lastEvent.status,
          }
        : null,
      viewerDisplayMode: s.viewerDisplayMode,
      demoMode: s.demoMode,
      isSpeaking: s.isSpeaking,
      isVoiceMuted: s.isVoiceMuted,
      voiceStatus: s.voiceStatus,
      lastVoiceLine: s.lastVoiceLine,
    };
  }

  public async subscribe(id: string, callback: SubscriberCallback): Promise<() => void> {
    this.subscribers.set(id, callback);

    const currentState = await this.getState();
    callback({
      type: "STATE_UPDATE",
      state: currentState,
      timestamp: new Date().toISOString(),
    });

    return () => {
      this.subscribers.delete(id);
    };
  }

  public broadcast(message: BroadcastMessage): void {
    for (const [id, callback] of this.subscribers.entries()) {
      try {
        callback(message);
      } catch (err) {
        console.error(`Error notifying subscriber ${id}:`, err);
      }
    }
  }

  public async recordSupport(
    amount: number,
    displayName: string = "Anonymous",
    customProviderPaymentId?: string
  ): Promise<{ success: boolean; event?: StreamEvent; state: StreamState; error?: string }> {
    const currentState = await this.getState();

    if (currentState.status === "paused") {
      return { success: false, error: "Stream is currently paused.", state: currentState };
    }

    if (!amount || amount <= 0 || !Number.isFinite(amount)) {
      return { success: false, error: "Support amount must be a positive number.", state: currentState };
    }

    const cleanName = displayName.trim() || "Anonymous";

    // 1. Process payment via provider abstraction
    const payment = await demoPaymentProvider.createPayment({
      amount,
      currency: "INR",
      displayName: cleanName,
      type: "support",
    });

    const providerPaymentId = customProviderPaymentId || payment.paymentId;

    // 2. Idempotency Check: Protect against duplicate payment processing
    const existingPayment = await this.repo.payments.getPaymentByProviderPaymentId(providerPaymentId);
    if (existingPayment && existingPayment.status === "verified") {
      return {
        success: false,
        error: `Duplicate payment detected. Payment ${providerPaymentId} has already been processed.`,
        state: currentState,
      };
    }

    // 3. Persist verified payment in PaymentRepository
    const persistedPayment = await this.repo.payments.createPayment({
      stream_id: this.streamId,
      provider: "demo",
      provider_payment_id: providerPaymentId,
      amount: payment.amount,
      currency: payment.currency,
      purpose: "support",
      status: "verified",
      payer_name: cleanName,
      metadata: { transactionRef: payment.transactionRef },
    });

    // 4. Categorize event type
    let type: EventType = "SUPPORT_SMALL";
    if (amount >= 500) {
      type = "SUPPORT_LARGE";
    } else if (amount >= 100) {
      type = "SUPPORT_MEDIUM";
    }

    // 5. Persist support event in SupportRepository
    const persistedSupport = await this.repo.support.createSupportEvent({
      stream_id: this.streamId,
      payment_id: persistedPayment.id,
      event_type: type,
      amount: payment.amount,
      currency: payment.currency,
      display_name: cleanName,
      status: "verified",
      metadata: { paymentId: persistedPayment.id },
    });

    // 6. Update stream raised amount in StreamRepository
    await this.repo.streams.updateRaisedAmount(this.streamId, payment.amount);

    // 7. Enqueue in EventQueueRepository
    await this.repo.eventQueue.enqueue({
      stream_id: this.streamId,
      event_type: type,
      payload: {
        supportId: persistedSupport.id,
        amount: payment.amount,
        displayName: cleanName,
      },
      status: "pending",
      priority: amount >= 500 ? 2 : 1,
    });

    const event: StreamEvent = {
      id: persistedSupport.id,
      type,
      amount: payment.amount,
      currency: payment.currency,
      source: "demo",
      displayName: cleanName,
      timestamp: persistedSupport.created_at,
      status: "verified",
      metadata: { paymentId: persistedPayment.id },
    };

    this.lastStreamEvent = event;
    const updatedState = await this.getState();

    // 8. Broadcast realtime event
    this.broadcast({
      type: "STREAM_EVENT",
      event,
      state: updatedState,
      timestamp: new Date().toISOString(),
    });

    return { success: true, event, state: updatedState };
  }

  public async processSponsorBid(
    businessName: string,
    bidAmount: number,
    customProviderPaymentId?: string
  ): Promise<{ success: boolean; event?: StreamEvent; state: StreamState; error?: string }> {
    const currentState = await this.getState();

    if (currentState.status === "paused") {
      return { success: false, error: "Stream is currently paused.", state: currentState };
    }

    if (!businessName || !businessName.trim()) {
      return { success: false, error: "businessName is required and cannot be empty.", state: currentState };
    }

    if (!bidAmount || bidAmount <= 0 || !Number.isFinite(bidAmount)) {
      return { success: false, error: "bidAmount must be a positive number.", state: currentState };
    }

    const cleanBiz = businessName.trim();

    // Rule: Must exceed current sponsor bid and meet minimum required next bid
    if (bidAmount < currentState.minimumNextBid || bidAmount <= currentState.currentSponsorBid) {
      return {
        success: false,
        error: `Bid of ₹${bidAmount.toLocaleString()} rejected. Minimum required bid is ₹${currentState.minimumNextBid.toLocaleString()}.`,
        state: currentState,
      };
    }

    // 1. Process payment through payment provider
    const payment = await demoPaymentProvider.createPayment({
      amount: bidAmount,
      currency: "INR",
      displayName: cleanBiz,
      type: "sponsor",
    });

    const providerPaymentId = customProviderPaymentId || payment.paymentId;

    // 2. Idempotency Check: Protect against duplicate sponsor activation
    const existingPayment = await this.repo.payments.getPaymentByProviderPaymentId(providerPaymentId);
    if (existingPayment && existingPayment.status === "verified") {
      return {
        success: false,
        error: `Duplicate payment detected. Sponsor payment ${providerPaymentId} has already activated a sponsor.`,
        state: currentState,
      };
    }

    // 3. Persist payment
    const persistedPayment = await this.repo.payments.createPayment({
      stream_id: this.streamId,
      provider: "demo",
      provider_payment_id: providerPaymentId,
      amount: payment.amount,
      currency: payment.currency,
      purpose: "sponsor_bid",
      status: "verified",
      payer_name: cleanBiz,
    });

    // 4. Persist sponsor bid
    const persistedBid = await this.repo.sponsors.createBid({
      stream_id: this.streamId,
      business_id: null,
      business_name: cleanBiz,
      bid_amount: bidAmount,
      currency: "INR",
      payment_id: persistedPayment.id,
      status: "verified",
    });

    // Calculate new minimum next bid using centralized auction rule
    const newMinBid = calculateMinimumNextBid(bidAmount);

    // 5. Update sponsor in StreamRepository
    await this.repo.streams.updateSponsor(this.streamId, cleanBiz, bidAmount, newMinBid);

    // 6. Enqueue in EventQueueRepository
    await this.repo.eventQueue.enqueue({
      stream_id: this.streamId,
      event_type: "NEW_SPONSOR",
      payload: {
        bidId: persistedBid.id,
        amount: bidAmount,
        businessName: cleanBiz,
      },
      status: "pending",
      priority: 3,
    });

    const event: StreamEvent = {
      id: persistedBid.id,
      type: "NEW_SPONSOR",
      amount: bidAmount,
      currency: "INR",
      source: "demo",
      displayName: cleanBiz,
      timestamp: persistedBid.created_at,
      status: "verified",
      metadata: {
        paymentId: persistedPayment.id,
        previousSponsor: currentState.currentSponsor,
        previousBid: currentState.currentSponsorBid,
      },
    };

    this.lastStreamEvent = event;
    const updatedState = await this.getState();

    this.broadcast({
      type: "STREAM_EVENT",
      event,
      state: updatedState,
      timestamp: new Date().toISOString(),
    });

    return { success: true, event, state: updatedState };
  }

  public async triggerReaction(
    type: EventType,
    displayName: string = "Admin",
    metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; event: StreamEvent; state: StreamState }> {
    const event: StreamEvent = {
      id: `ev_react_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      amount: 0,
      currency: "INR",
      source: "admin",
      displayName,
      timestamp: new Date().toISOString(),
      status: "verified",
      metadata,
    };

    await this.repo.eventQueue.enqueue({
      stream_id: this.streamId,
      event_type: type,
      payload: { displayName, metadata },
      status: "pending",
      priority: 1,
    });

    this.lastStreamEvent = event;
    const updatedState = await this.getState();

    this.broadcast({
      type: "STREAM_EVENT",
      event,
      state: updatedState,
      timestamp: new Date().toISOString(),
    });

    reactionService.orchestrateReaction(event).catch(() => {});

    return { success: true, event, state: updatedState };
  }

  public async muteVoice(actor: string = "admin"): Promise<StreamState> {
    voiceService.setMuted(true);
    await this.repo.admin.logAction({
      stream_id: this.streamId,
      action_type: "VOICE_MUTED",
      actor,
    });
    const state = await this.getState();
    this.broadcast({ type: "STATE_UPDATE", state, timestamp: new Date().toISOString() });
    return state;
  }

  public async unmuteVoice(actor: string = "admin"): Promise<StreamState> {
    voiceService.setMuted(false);
    await this.repo.admin.logAction({
      stream_id: this.streamId,
      action_type: "VOICE_UNMUTED",
      actor,
    });
    const state = await this.getState();
    this.broadcast({ type: "STATE_UPDATE", state, timestamp: new Date().toISOString() });
    return state;
  }

  public async testVoice(
    text?: string,
    category: string = "IDLE",
    actor: string = "admin"
  ): Promise<{ success: boolean; text: string }> {
    const spoken = await voiceService.speakForEvent(
      category as any,
      { name: actor },
      "NORMAL"
    );
    await this.repo.admin.logAction({
      stream_id: this.streamId,
      action_type: "VOICE_TEST",
      actor,
      details: { text: spoken, category },
    });
    return { success: true, text: spoken };
  }

  public async clearVoiceQueue(actor: string = "admin"): Promise<{ success: boolean }> {
    voiceService.clearQueue();
    await this.repo.admin.logAction({
      stream_id: this.streamId,
      action_type: "clear_voice_queue",
      actor,
    });
    return { success: true };
  }

  public async setGoalAmount(newGoal: number, actor: string = "admin"): Promise<StreamState> {
    await this.repo.streams.updateGoalAmount(this.streamId, newGoal);
    await this.repo.admin.logAction({
      stream_id: this.streamId,
      action_type: "update_goal",
      actor,
      details: { newGoal },
    });
    const state = await this.getState();
    this.broadcast({
      type: "STATE_UPDATE",
      state,
      timestamp: new Date().toISOString(),
    });
    return state;
  }

  public async pauseStream(actor: string = "admin"): Promise<StreamState> {
    await this.repo.streams.setStreamStatus(this.streamId, "paused");
    await this.repo.admin.logAction({
      stream_id: this.streamId,
      action_type: "pause",
      actor,
    });
    const state = await this.getState();
    this.broadcast({
      type: "STATE_UPDATE",
      state,
      timestamp: new Date().toISOString(),
    });
    return state;
  }

  public async resumeStream(actor: string = "admin"): Promise<StreamState> {
    await this.repo.streams.setStreamStatus(this.streamId, "active");
    await this.repo.admin.logAction({
      stream_id: this.streamId,
      action_type: "resume",
      actor,
    });
    const state = await this.getState();
    this.broadcast({
      type: "STATE_UPDATE",
      state,
      timestamp: new Date().toISOString(),
    });
    return state;
  }

  public async resetState(actor: string = "admin"): Promise<StreamState> {
    await this.repo.streams.resetStream(this.streamId);
    await this.repo.admin.logAction({
      stream_id: this.streamId,
      action_type: "reset",
      actor,
    });
    this.lastStreamEvent = null;
    const state = await this.getState();

    this.broadcast({
      type: "STATE_RESET",
      state,
      timestamp: new Date().toISOString(),
    });

    return state;
  }

  public async emergencyStopSponsor(actor: string = "admin"): Promise<StreamState> {
    const ended = await this.repo.sponsors.endActiveCampaign(this.streamId);
    await this.repo.streams.updateSponsor(this.streamId, "", 0, 500);
    await this.repo.admin.logAction({
      stream_id: this.streamId,
      action_type: "emergency_stop_sponsor",
      actor,
      details: { endedCampaignId: ended?.id || null },
    });
    const state = await this.getState();
    this.broadcast({
      type: "STATE_UPDATE",
      state,
      timestamp: new Date().toISOString(),
    });
    return state;
  }

  public async getAdminOverview() {
    const state = await this.getState();
    const recentSupport = await this.repo.support.getRecentSupport(this.streamId, 30);
    const recentBids = await this.repo.sponsors.getRecentBids(this.streamId, 30);
    const pendingQueueCount = await this.repo.eventQueue.getPendingCount(this.streamId);
    const recentActions = await this.repo.admin.getRecentActions(this.streamId, 25);
    const recentPayments = await this.repo.payments.getRecentPayments(this.streamId, 30);
    const totalVerified = await this.repo.support.getVerifiedTotal(this.streamId);

    const verifiedPayments = recentPayments.filter(
      (p) => p.status === "VERIFIED" || p.status === "verified" || p.status === "CAPTURED"
    );
    const pendingPayments = recentPayments.filter(
      (p) => p.status === "PENDING" || p.status === "CREATED"
    );
    const failedPayments = recentPayments.filter(
      (p) => p.status === "FAILED" || p.status === "REJECTED"
    );

    const activeCampaign = await this.repo.sponsors.getActiveCampaign(this.streamId);
    const campaignHistory = await this.repo.sponsors.getCampaignHistory(this.streamId, 20);
    const failedEvents = await this.repo.eventQueue.getFailedEvents(this.streamId, 20);

    return {
      state,
      metrics: {
        totalRevenue: totalVerified,
        totalSupporters: recentSupport.length,
        pendingQueueCount,
        failedQueueCount: failedEvents.length,
        repoType: this.repo.name,
        isPersistent: this.repo.isPersistent,
        paymentMode: process.env.PAYMENT_MODE || "demo",
        verifiedCount: verifiedPayments.length,
        pendingCount: pendingPayments.length,
        failedCount: failedPayments.length,
      },
      recentSupport,
      recentBids,
      activeCampaign,
      campaignHistory,
      failedEvents,
      recentActions,
      recentPayments,
    };
  }

  public async getFailedEvents(limit: number = 20) {
    return this.repo.eventQueue.getFailedEvents(this.streamId, limit);
  }

  /**
   * Retries a failed non-financial queue event.
   * Guarantees that financial ledger totals are NEVER modified during event retries.
   */
  public async retryFailedEvent(eventId: string): Promise<{ success: boolean; event?: any; error?: string }> {
    const retried = await this.repo.eventQueue.retryEvent(eventId);
    if (!retried) {
      return { success: false, error: `Event ${eventId} not found or not in failed state.` };
    }

    // Broadcast visual reaction event without financial side effects
    const streamEvent: StreamEvent = {
      id: retried.id,
      type: retried.event_type,
      amount: 0, // Zero financial delta during retry
      currency: "INR",
      source: "event_retry",
      displayName: (retried.payload?.displayName as string) || "Retried Event",
      timestamp: new Date().toISOString(),
      status: "verified",
      metadata: { retried: true, originalPayload: retried.payload },
    };

    const state = await this.getState();
    this.broadcast({
      type: "STREAM_EVENT",
      event: streamEvent,
      state,
      timestamp: new Date().toISOString(),
    });

    await this.repo.eventQueue.markProcessed(retried.id);
    return { success: true, event: retried };
  }
}

// Preserve singleton on globalThis
const globalForEventEngine = globalThis as unknown as {
  eventEngine: EventEngine | undefined;
};

export const eventEngine = globalForEventEngine.eventEngine ?? new EventEngine();

if (process.env.NODE_ENV !== "production") {
  globalForEventEngine.eventEngine = eventEngine;
}
