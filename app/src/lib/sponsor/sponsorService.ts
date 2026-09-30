// sponsorService.ts — Core Domain Service for Sponsor Crown & Business Bidding System
import { repositoryManager } from "../repositories/factory";
import { IRepositoryManager, SponsorBidRecord, SponsorCampaignRecord } from "../repositories/types";
import { DEFAULT_STREAM_ID } from "../repositories/inMemoryRepository";
import { eventEngine } from "../engine/eventEngine";
import { resolvePaymentProvider } from "../payments/provider";
import { CreateOrderRequest } from "../payments/types";
import {
  calculateMinimumNextBid,
  sanitizeText,
  validateEmail,
  validateSponsorBidAmount,
  validateWebsiteUrl,
  SPONSOR_AUCTION_RULES,
} from "./rules";
import {
  CreateSponsorBidInput,
  PublicSponsorInfo,
  SponsorBidResult,
} from "./types";
import { StreamEvent, StreamState } from "../types/events";

export class SponsorService {
  private repo: IRepositoryManager;

  constructor(repo?: IRepositoryManager) {
    this.repo = repo ?? repositoryManager;
  }

  /**
   * Retrieves sanitized public sponsor state.
   * Exposes only public-safe fields (disclosure, display name, verified bid, website, category, minimum next bid).
   * Strictly strips internal IDs, contact email, payment tokens, and secrets.
   */
  public async getPublicSponsorState(streamId: string = DEFAULT_STREAM_ID): Promise<{
    currentSponsor: PublicSponsorInfo | null;
    minimumNextBid: number;
    streamStatus: string;
  }> {
    const stream = await this.repo.streams.getStream(streamId);
    const activeCampaign = await this.repo.sponsors.getActiveCampaign(streamId);

    const currentVerifiedBid = activeCampaign?.bid_amount_inr || stream?.current_sponsor_bid || 0;
    const minimumNextBid = calculateMinimumNextBid(currentVerifiedBid);

    let currentSponsor: PublicSponsorInfo | null = null;
    if (activeCampaign && activeCampaign.status === "SPONSOR_ACTIVE") {
      currentSponsor = {
        isSponsored: true,
        displayName: activeCampaign.sponsor_name,
        verifiedBid: activeCampaign.bid_amount_inr,
        website: activeCampaign.website,
        category: activeCampaign.category,
        campaignStartTime: activeCampaign.started_at,
        disclosure: "CURRENT SPONSOR",
      };
    } else if (stream?.current_sponsor_name && stream.current_sponsor_bid) {
      currentSponsor = {
        isSponsored: true,
        displayName: stream.current_sponsor_name,
        verifiedBid: stream.current_sponsor_bid,
        website: "",
        category: "General",
        campaignStartTime: stream.updated_at,
        disclosure: "CURRENT SPONSOR",
      };
    }

    return {
      currentSponsor,
      minimumNextBid,
      streamStatus: stream?.status || "active",
    };
  }

  /**
   * Creates a new business sponsor bid.
   * 1. Sanitizes & validates business input.
   * 2. Recalculates authoritative minimum bid from server-side repository state.
   * 3. Creates business & bid records.
   * 4. Pre-registers internal payment record with purpose "SPONSOR_BID".
   * 5. Generates payment gateway order.
   */
  public async createSponsorBid(input: CreateSponsorBidInput): Promise<SponsorBidResult> {
    const streamId = input.streamId || DEFAULT_STREAM_ID;

    // 1. Sanitize text fields
    const businessName = sanitizeText(input.businessName, 60);
    const category = sanitizeText(input.category || "General", 40) || "General";
    const description = sanitizeText(input.description || "", 250);

    if (!businessName || businessName.length < 2) {
      return { success: false, error: "Business name is required (minimum 2 characters)." };
    }

    // 2. Validate email
    if (!validateEmail(input.contactEmail)) {
      return { success: false, error: "A valid business contact email address is required." };
    }
    const cleanEmail = input.contactEmail.trim().toLowerCase();

    // 3. Validate website
    const webVal = validateWebsiteUrl(input.website);
    if (!webVal.valid) {
      return { success: false, error: webVal.error || "Invalid website URL." };
    }
    const cleanWebsite = webVal.normalized || "";

    // 4. Authoritative minimum bid check
    const activeCampaign = await this.repo.sponsors.getActiveCampaign(streamId);
    const stream = await this.repo.streams.getStream(streamId);
    const currentVerifiedBid = activeCampaign?.bid_amount_inr || stream?.current_sponsor_bid || 0;

    const amountVal = validateSponsorBidAmount(input.bidAmount, currentVerifiedBid);
    if (!amountVal.valid) {
      return { success: false, error: amountVal.error };
    }

    // 5. Find or create Business record
    let business = await this.repo.sponsors.getBusinessByEmail(cleanEmail);
    if (!business) {
      business = await this.repo.sponsors.createBusiness({
        name: businessName,
        contact_email: cleanEmail,
        website: cleanWebsite,
        category,
        description,
        status: "active",
      });
    }

    // 6. Create internal SponsorBid record with status BID_SUBMITTED
    const bidRecord = await this.repo.sponsors.createBid({
      stream_id: streamId,
      business_id: business.id,
      business_name: businessName,
      bid_amount: amountVal.amountInr,
      bid_amount_inr: amountVal.amountInr,
      bid_amount_paise: amountVal.amountPaise,
      currency: "INR",
      payment_id: null,
      status: "BID_SUBMITTED",
      submitted_at: new Date().toISOString(),
      metadata: {
        category,
        website: cleanWebsite,
        description,
      },
    });

    // 7. Pre-register internal payment record (purpose = SPONSOR_BID)
    const provider = resolvePaymentProvider();
    const orderRequest: CreateOrderRequest = {
      amountInr: amountVal.amountInr,
      amountPaise: amountVal.amountPaise,
      currency: "INR",
      purpose: "SPONSOR_BID",
      displayName: businessName,
      message: `Sponsorship Bid: ${businessName}`,
      streamId,
      metadata: {
        bidId: bidRecord.id,
        businessId: business.id,
      },
    };

    const orderResult = await provider.createOrder(orderRequest);

    const paymentRecord = await this.repo.payments.createPayment({
      stream_id: streamId,
      provider: provider.name,
      provider_order_id: orderResult.orderId,
      provider_payment_id: "",
      amount: amountVal.amountInr,
      amount_paise: amountVal.amountPaise,
      currency: "INR",
      purpose: "SPONSOR_BID",
      status: "CREATED",
      payer_name: businessName,
      message: `Sponsorship Bid by ${businessName}`,
      metadata: {
        bidId: bidRecord.id,
        businessId: business.id,
        keyId: orderResult.keyId,
      },
    });

    // 8. Link payment order to bid and update status to PAYMENT_PENDING
    const updatedBid = await this.repo.sponsors.updateBidStatus(bidRecord.id, "PAYMENT_PENDING", {
      payment_id: paymentRecord.id,
      provider_order_id: orderResult.orderId,
    });

    return {
      success: true,
      bid: updatedBid,
      order: {
        orderId: orderResult.orderId,
        amount: amountVal.amountInr,
        amountPaise: amountVal.amountPaise,
        amountInr: amountVal.amountInr,
        currency: "INR",
        keyId: orderResult.keyId,
        provider: provider.name,
        purpose: "SPONSOR_BID",
      },
    };
  }

  /**
   * Verifies sponsor payment and executes atomic Crown activation.
   * Re-checks the current Crown at the moment of verification to ensure the bid still qualifies.
   */
  public async verifySponsorPayment(params: {
    orderId: string;
    paymentId: string;
    signature?: string;
  }): Promise<{
    success: boolean;
    crownWon: boolean;
    bid?: SponsorBidRecord;
    campaign?: SponsorCampaignRecord;
    status: string;
    reason?: string;
    currentMinimumBid?: number;
    error?: string;
    httpStatus: number;
  }> {
    const { orderId, paymentId, signature } = params;

    if (!orderId || !paymentId) {
      return {
        success: false,
        crownWon: false,
        status: "FAILED",
        error: "Missing required orderId or paymentId.",
        httpStatus: 400,
      };
    }

    // 1. Locate internal payment record
    const storedPayment = await this.repo.payments.getPaymentByOrderId(orderId);
    if (!storedPayment) {
      return {
        success: false,
        crownWon: false,
        status: "FAILED",
        error: `Order ID '${orderId}' not found.`,
        httpStatus: 404,
      };
    }

    // 2. Strict Purpose Enforcment: MUST be SPONSOR_BID
    if (storedPayment.purpose !== "SPONSOR_BID") {
      return {
        success: false,
        crownWon: false,
        status: "FAILED",
        error: `Invalid payment purpose '${storedPayment.purpose}'. Expected SPONSOR_BID.`,
        httpStatus: 400,
      };
    }

    // 3. Locate corresponding bid
    const bid = await this.repo.sponsors.getBidByOrderId(orderId);
    if (!bid) {
      return {
        success: false,
        crownWon: false,
        status: "FAILED",
        error: `Sponsor bid associated with order '${orderId}' not found.`,
        httpStatus: 404,
      };
    }

    const streamId = bid.stream_id || DEFAULT_STREAM_ID;

    // 4. Duplicate Check: If already accepted or verified
    if (bid.status === "BID_ACCEPTED" || storedPayment.status === "VERIFIED") {
      const activeCampaign = await this.repo.sponsors.getActiveCampaign(streamId);
      const isCurrentWinner = activeCampaign?.bid_id === bid.id;
      return {
        success: true,
        crownWon: isCurrentWinner,
        bid,
        campaign: isCurrentWinner ? activeCampaign : undefined,
        status: bid.status,
        httpStatus: 200,
      };
    }

    // 5. Cryptographic signature and status verification via active provider
    const provider = resolvePaymentProvider();
    const verificationResult = await provider.verifyPayment({
      orderId,
      paymentId,
      signature,
      internalPaymentId: storedPayment.id,
    });

    if (!verificationResult.success) {
      await this.repo.payments.updatePayment(storedPayment.id, {
        status: "REJECTED",
        provider_payment_id: paymentId,
      });
      await this.repo.sponsors.updateBidStatus(bid.id, "BID_REJECTED", {
        rejected_at: new Date().toISOString(),
        rejection_reason: verificationResult.error || "Cryptographic signature check failed.",
      });

      return {
        success: false,
        crownWon: false,
        status: "BID_REJECTED",
        error: verificationResult.error || "Payment signature verification failed.",
        httpStatus: 400,
      };
    }

    // 6. Mark payment VERIFIED
    await this.repo.payments.updatePayment(storedPayment.id, {
      status: "VERIFIED",
      provider_payment_id: paymentId,
      verified_at: new Date().toISOString(),
    });

    await this.repo.sponsors.updateBidStatus(bid.id, "PAYMENT_VERIFIED", {
      provider_payment_id: paymentId,
      verified_at: new Date().toISOString(),
    });

    // 7. ATOMIC CROWN RE-CHECK & ACTIVATION
    // Even though payment is verified, the server MUST re-check if the bid still qualifies!
    const activationResult = await this.repo.sponsors.activateWinningBid(bid.id, streamId);

    if (!activationResult.activated) {
      // Outbid by a concurrent bid that finished payment earlier!
      return {
        success: true,
        crownWon: false,
        bid: await this.repo.sponsors.getBidById(bid.id) || bid,
        status: "REFUND_REQUIRED",
        reason: activationResult.reason || "OUTBID",
        currentMinimumBid: activationResult.currentMinimumBid,
        httpStatus: 200,
      };
    }

    // 8. Crown Activated! Broadcast Sponsor Events via Event Engine
    const updatedStream = await this.repo.streams.getStream(streamId);
    const campaign = activationResult.campaign!;
    const previousCampaign = activationResult.previousCampaign;

    await this.broadcastSponsorCrownEvents({
      stream: updatedStream!,
      newCampaign: campaign,
      previousCampaign: previousCampaign || null,
      paymentId: storedPayment.id,
    });

    const finalBid = (await this.repo.sponsors.getBidById(bid.id)) || bid;

    return {
      success: true,
      crownWon: true,
      bid: finalBid,
      campaign,
      status: "SPONSOR_ACTIVE",
      currentMinimumBid: activationResult.currentMinimumBid,
      httpStatus: 200,
    };
  }

  /**
   * Broadcasts sponsor events and character reactions.
   * If there was a previous sponsor: emits SPONSOR_LOST.
   * Always emits SPONSOR_WIN and NEW_SPONSOR.
   */
  private async broadcastSponsorCrownEvents(params: {
    stream: any;
    newCampaign: SponsorCampaignRecord;
    previousCampaign: SponsorCampaignRecord | null;
    paymentId: string;
  }): Promise<void> {
    const { stream, newCampaign, previousCampaign, paymentId } = params;
    const now = new Date().toISOString();

    // 1. If previous sponsor was dethroned, emit SPONSOR_LOST event
    if (previousCampaign) {
      const lostEvent: StreamEvent = {
        id: `lost_${Date.now()}`,
        type: "SPONSOR_LOST",
        amount: previousCampaign.bid_amount_inr,
        currency: "INR",
        source: "gateway",
        displayName: previousCampaign.sponsor_name,
        timestamp: now,
        status: "verified",
        metadata: {
          replacedBy: newCampaign.sponsor_name,
          newBid: newCampaign.bid_amount_inr,
        },
      };

      eventEngine.broadcast({
        type: "STREAM_EVENT",
        event: lostEvent,
        state: await eventEngine.getState(),
        timestamp: now,
      });
    }

    // 2. Emit SPONSOR_WIN event
    const winEvent: StreamEvent = {
      id: `win_${Date.now()}`,
      type: "SPONSOR_WIN",
      amount: newCampaign.bid_amount_inr,
      currency: "INR",
      source: "gateway",
      displayName: newCampaign.sponsor_name,
      timestamp: now,
      status: "verified",
      metadata: {
        website: newCampaign.website,
        category: newCampaign.category,
        paymentId,
      },
    };

    // 3. Emit NEW_SPONSOR crown animation event
    const crownEvent: StreamEvent = {
      id: `crown_${Date.now()}`,
      type: "NEW_SPONSOR",
      amount: newCampaign.bid_amount_inr,
      currency: "INR",
      source: "gateway",
      displayName: newCampaign.sponsor_name,
      timestamp: now,
      status: "verified",
      metadata: {
        website: newCampaign.website,
        category: newCampaign.category,
      },
    };

    // Enqueue event for character animation HUD
    await this.repo.eventQueue.enqueue({
      stream_id: stream.id,
      event_type: "NEW_SPONSOR",
      payload: {
        campaignId: newCampaign.id,
        sponsorName: newCampaign.sponsor_name,
        bidAmount: newCampaign.bid_amount_inr,
        website: newCampaign.website,
      },
      status: "pending",
      priority: 10,
    });

    const currentState = await eventEngine.getState();
    const updatedState: StreamState = {
      ...currentState,
      currentSponsor: newCampaign.sponsor_name,
      currentSponsorBid: newCampaign.bid_amount_inr,
      minimumNextBid: calculateMinimumNextBid(newCampaign.bid_amount_inr),
      lastEvent: crownEvent,
    };

    eventEngine.broadcast({
      type: "STREAM_EVENT",
      event: crownEvent,
      state: updatedState,
      timestamp: now,
    });
  }

  /**
   * Emergency Admin Crown Override.
   * Requires authenticated admin identity.
   * Creates an immutable audit log with action_type "ADMIN_SPONSOR_OVERRIDE".
   * Never generates fake payment records.
   */
  public async emergencyAdminOverride(params: {
    actor: string;
    action: "CLEAR_CROWN" | "SET_CROWN";
    streamId?: string;
    overrideDetails?: {
      sponsorName: string;
      bidAmount: number;
      website?: string;
      reason: string;
    };
  }): Promise<{ success: boolean; message: string; state: StreamState }> {
    const streamId = params.streamId || DEFAULT_STREAM_ID;

    if (params.action === "CLEAR_CROWN") {
      await this.repo.sponsors.endActiveCampaign(streamId);
      await this.repo.streams.updateSponsor(
        streamId,
        "",
        0,
        SPONSOR_AUCTION_RULES.OPENING_MINIMUM_BID_INR
      );

      await this.repo.admin.logAction({
        stream_id: streamId,
        action_type: "ADMIN_SPONSOR_OVERRIDE",
        actor: params.actor,
        details: {
          action: "CLEAR_CROWN",
          timestamp: new Date().toISOString(),
        },
      });

      const updated = await eventEngine.getState();
      eventEngine.broadcast({
        type: "STATE_UPDATE",
        state: updated,
        timestamp: new Date().toISOString(),
      });

      return { success: true, message: "Sponsor Crown cleared by admin.", state: updated };
    }

    if (params.action === "SET_CROWN") {
      const details = params.overrideDetails;
      if (!details || !details.sponsorName || !details.bidAmount) {
        throw new Error("Missing required override details (sponsorName, bidAmount).");
      }

      await this.repo.sponsors.endActiveCampaign(streamId);

      const campaign = await this.repo.sponsors.createCampaign({
        business_id: `admin_override_${Date.now()}`,
        bid_id: `admin_bid_${Date.now()}`,
        stream_id: streamId,
        sponsor_name: sanitizeText(details.sponsorName, 60),
        website: details.website || "",
        category: "Admin Override",
        bid_amount_inr: details.bidAmount,
        status: "ADMIN_OVERRIDE",
        started_at: new Date().toISOString(),
        ended_at: null,
      });

      const nextMin = calculateMinimumNextBid(details.bidAmount);
      await this.repo.streams.updateSponsor(
        streamId,
        campaign.sponsor_name,
        details.bidAmount,
        nextMin
      );

      await this.repo.admin.logAction({
        stream_id: streamId,
        action_type: "ADMIN_SPONSOR_OVERRIDE",
        actor: params.actor,
        details: {
          action: "SET_CROWN",
          sponsorName: campaign.sponsor_name,
          bidAmount: details.bidAmount,
          reason: details.reason,
          timestamp: new Date().toISOString(),
        },
      });

      const updated = await eventEngine.getState();
      eventEngine.broadcast({
        type: "STATE_UPDATE",
        state: updated,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: `Sponsor Crown manually set to '${campaign.sponsor_name}' by admin.`,
        state: updated,
      };
    }

    throw new Error("Invalid admin action specified.");
  }
}

export const sponsorService = new SponsorService();
