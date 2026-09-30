// paymentService.ts — Core Domain Service for Authoritative Payment & Verification
import { repositoryManager } from "../repositories/factory";
import { IRepositoryManager, PaymentRecord } from "../repositories/types";
import { eventEngine } from "../engine/eventEngine";
import {
  CreateOrderRequest,
  SUPPORT_THRESHOLDS,
  mapAmountToEventType,
  OrderResult,
  PaymentStatus,
} from "./types";
import { resolvePaymentProvider } from "./provider";
import { DEFAULT_STREAM_ID } from "../repositories/inMemoryRepository";

export interface PaymentValidationError {
  field: string;
  message: string;
}

export class PaymentService {
  private repo: IRepositoryManager;

  constructor(repo?: IRepositoryManager) {
    this.repo = repo ?? repositoryManager;
  }

  /**
   * Strictly validates user input amount.
   * Rejects NaN, negative, zero, non-finite, sub-paise decimals, or out-of-range amounts.
   */
  public validateSupportAmount(amount: unknown): {
    valid: boolean;
    amountInr: number;
    amountPaise: number;
    error?: string;
  } {
    if (typeof amount !== "number" || !Number.isFinite(amount) || Number.isNaN(amount)) {
      return {
        valid: false,
        amountInr: 0,
        amountPaise: 0,
        error: "Support amount must be a valid finite number.",
      };
    }

    if (amount < SUPPORT_THRESHOLDS.MIN_INR) {
      return {
        valid: false,
        amountInr: amount,
        amountPaise: 0,
        error: `Support amount cannot be less than ₹${SUPPORT_THRESHOLDS.MIN_INR}.`,
      };
    }

    if (amount > SUPPORT_THRESHOLDS.MAX_INR) {
      return {
        valid: false,
        amountInr: amount,
        amountPaise: 0,
        error: `Support amount cannot exceed ₹${SUPPORT_THRESHOLDS.MAX_INR.toLocaleString()}.`,
      };
    }

    // Ensure precision does not exceed 2 decimal places (paise)
    const roundedPaise = Math.round(amount * 100);
    const reconstructedInr = roundedPaise / 100;
    if (Math.abs(amount - reconstructedInr) > 0.0001) {
      return {
        valid: false,
        amountInr: amount,
        amountPaise: 0,
        error: "Support amount has invalid decimal precision (fractions of paise rejected).",
      };
    }

    return {
      valid: true,
      amountInr: reconstructedInr,
      amountPaise: roundedPaise,
    };
  }

  /**
   * Pre-registers internal payment record and creates gateway order.
   * Stores the order in the repository BEFORE returning checkout payload to the client.
   */
  public async createSupportOrder(params: {
    amount: number;
    displayName?: string;
    message?: string;
    streamId?: string;
  }): Promise<{
    success: boolean;
    order?: OrderResult;
    error?: string;
  }> {
    const streamId = params.streamId || DEFAULT_STREAM_ID;
    const amountVal = this.validateSupportAmount(params.amount);
    if (!amountVal.valid) {
      return { success: false, error: amountVal.error };
    }

    const cleanName = (params.displayName || "").trim().slice(0, 32) || "Anonymous Supporter";
    const cleanMessage = (params.message || "").trim().slice(0, 100);

    const provider = resolvePaymentProvider();

    const orderRequest: CreateOrderRequest = {
      amountInr: amountVal.amountInr,
      amountPaise: amountVal.amountPaise,
      currency: "INR",
      purpose: "SUPPORT",
      displayName: cleanName,
      message: cleanMessage,
      streamId,
    };

    // 1. Create order with gateway provider
    const orderResult = await provider.createOrder(orderRequest);

    // 2. Pre-register authoritative internal payment record in database
    await this.repo.payments.createPayment({
      stream_id: streamId,
      provider: provider.name,
      provider_order_id: orderResult.orderId,
      provider_payment_id: "",
      amount: amountVal.amountInr,
      amount_paise: amountVal.amountPaise,
      currency: "INR",
      purpose: "SUPPORT",
      status: "CREATED",
      payer_name: cleanName,
      message: cleanMessage,
      metadata: {
        provider: provider.name,
        createdVia: "createSupportOrder",
        keyId: orderResult.keyId,
      },
    });

    return {
      success: true,
      order: orderResult,
    };
  }

  /**
   * Verifies standard checkout return from client.
   * Never trusts client amount or status boolean; authoritative values come from internal DB and HMAC.
   */
  public async verifySupportPayment(params: {
    orderId: string;
    paymentId: string;
    signature?: string;
  }): Promise<{
    success: boolean;
    payment?: PaymentRecord;
    idempotent?: boolean;
    error?: string;
    status: number;
  }> {
    const { orderId, paymentId, signature } = params;

    if (!orderId || !paymentId) {
      return {
        success: false,
        error: "Missing required orderId or paymentId.",
        status: 400,
      };
    }

    // 1. Retrieve stored authoritative internal order
    const storedPayment = await this.repo.payments.getPaymentByOrderId(orderId);
    if (!storedPayment) {
      return {
        success: false,
        error: `Order ID '${orderId}' not found in internal ledger.`,
        status: 404,
      };
    }

    // 2. Purpose check: Ensure payment belongs to SUPPORT purpose
    if (storedPayment.purpose !== "SUPPORT" && storedPayment.purpose !== "support") {
      return {
        success: false,
        error: "Order purpose mismatch. Expected SUPPORT payment.",
        status: 400,
      };
    }

    // 3. Idempotency Check: If already verified, return success without double-crediting
    if (storedPayment.status === "VERIFIED" || storedPayment.status === "verified") {
      return {
        success: true,
        payment: storedPayment,
        idempotent: true,
        status: 200,
      };
    }

    // 4. Duplicate Payment ID Protection
    const existingPaymentIdRecord = await this.repo.payments.getPaymentByProviderPaymentId(paymentId);
    if (existingPaymentIdRecord && existingPaymentIdRecord.id !== storedPayment.id) {
      return {
        success: false,
        error: `Duplicate payment detected. Payment ID '${paymentId}' is already linked to another order.`,
        status: 400,
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

      return {
        success: false,
        error: verificationResult.error || "Payment signature verification failed.",
        status: 400,
      };
    }

    // 6. Mark payment VERIFIED in repository
    const verifiedPayment = await this.repo.payments.updatePayment(storedPayment.id, {
      status: "VERIFIED",
      provider_payment_id: paymentId,
      verified_at: new Date().toISOString(),
    });

    // 7. Dispatch to stream & character animation system EXACTLY ONCE
    await this.creditStreamAndTriggerReaction(verifiedPayment);

    return {
      success: true,
      payment: verifiedPayment,
      status: 200,
    };
  }

  /**
   * Processes signed Razorpay webhook notifications.
   * Must receive raw unparsed body for HMAC-SHA256 signature verification.
   */
  public async handleRazorpayWebhook(
    rawBody: string,
    signature: string | null | undefined
  ): Promise<{
    success: boolean;
    event?: string;
    idempotent?: boolean;
    error?: string;
    status: number;
  }> {
    if (!signature) {
      return {
        success: false,
        error: "Missing 'x-razorpay-signature' header in webhook request.",
        status: 400,
      };
    }

    const provider = resolvePaymentProvider();
    const isSignatureValid = provider.verifyWebhookSignature(rawBody, signature);
    if (!isSignatureValid) {
      return {
        success: false,
        error: "Invalid webhook HMAC-SHA256 signature.",
        status: 401,
      };
    }

    let webhookPayload: any;
    try {
      webhookPayload = JSON.parse(rawBody);
    } catch {
      return {
        success: false,
        error: "Malformed JSON in webhook body.",
        status: 400,
      };
    }

    const eventName = webhookPayload.event;
    const webhookEventId = webhookPayload.id || `wh_${Date.now()}`;

    // 1. Idempotency Check: Has this webhook event already been processed?
    const existingWebhook = await this.repo.payments.getPaymentByWebhookEventId(webhookEventId);
    if (existingWebhook) {
      return {
        success: true,
        event: eventName,
        idempotent: true,
        status: 200,
      };
    }

    // 2. Handle successful payment captured / order paid events
    if (eventName === "payment.captured" || eventName === "order.paid") {
      const paymentEntity = webhookPayload.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id || webhookPayload.payload?.order?.entity?.id;
      const paymentId = paymentEntity?.id;
      const capturedAmountPaise = paymentEntity?.amount;

      if (!orderId || !paymentId) {
        return {
          success: false,
          error: "Webhook payload missing order_id or payment id.",
          status: 400,
        };
      }

      const storedOrder = await this.repo.payments.getPaymentByOrderId(orderId);
      if (!storedOrder) {
        return {
          success: false,
          error: `Stored order for order_id '${orderId}' not found.`,
          status: 404,
        };
      }

      // Verify amount integrity against stored order
      if (
        storedOrder.amount_paise &&
        capturedAmountPaise &&
        storedOrder.amount_paise !== capturedAmountPaise
      ) {
        await this.repo.payments.updatePayment(storedOrder.id, {
          status: "REJECTED",
          webhook_event_id: webhookEventId,
        });
        return {
          success: false,
          error: `Amount mismatch: stored order ${storedOrder.amount_paise} paise vs captured ${capturedAmountPaise} paise.`,
          status: 400,
        };
      }

      // If already verified via checkout return, link webhook ID without double processing
      if (storedOrder.status === "VERIFIED" || storedOrder.status === "verified") {
        await this.repo.payments.updatePayment(storedOrder.id, {
          webhook_event_id: webhookEventId,
        });
        return {
          success: true,
          event: eventName,
          idempotent: true,
          status: 200,
        };
      }

      // Mark payment VERIFIED
      const verified = await this.repo.payments.updatePayment(storedOrder.id, {
        status: "VERIFIED",
        provider_payment_id: paymentId,
        webhook_event_id: webhookEventId,
        verified_at: new Date().toISOString(),
      });

      // Dispatch credit and animation reaction
      await this.creditStreamAndTriggerReaction(verified);

      return {
        success: true,
        event: eventName,
        status: 200,
      };
    }

    // Handle failed or cancelled events safely
    if (eventName === "payment.failed") {
      const paymentEntity = webhookPayload.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;
      if (orderId) {
        const stored = await this.repo.payments.getPaymentByOrderId(orderId);
        if (stored && stored.status !== "VERIFIED") {
          await this.repo.payments.updatePayment(stored.id, {
            status: "FAILED",
            webhook_event_id: webhookEventId,
          });
        }
      }
      return { success: true, event: eventName, status: 200 };
    }

    // Unknown or unhandled event acknowledged safely
    return {
      success: true,
      event: eventName,
      status: 200,
    };
  }

  /**
   * Internal helper: Dispatches verified payment to the stream balance and triggers live reaction.
   */
  private async creditStreamAndTriggerReaction(payment: PaymentRecord): Promise<void> {
    const streamId = payment.stream_id || DEFAULT_STREAM_ID;
    const amountInr = Number(payment.amount);
    const eventType = mapAmountToEventType(amountInr);

    // 1. Create verified support event
    const supportEvent = await this.repo.support.createSupportEvent({
      stream_id: streamId,
      payment_id: payment.id,
      event_type: eventType,
      amount: amountInr,
      currency: payment.currency,
      display_name: payment.payer_name || "Anonymous Supporter",
      status: "verified",
      metadata: {
        provider: payment.provider,
        providerPaymentId: payment.provider_payment_id,
        message: payment.message,
      },
    });

    // 2. Increment stream balance
    const updatedStream = await this.repo.streams.updateRaisedAmount(streamId, amountInr);

    // 3. Queue event for guaranteed delivery
    await this.repo.eventQueue.enqueue({
      stream_id: streamId,
      event_type: eventType,
      payload: {
        amount: amountInr,
        displayName: payment.payer_name || "Anonymous Supporter",
        message: payment.message,
        paymentId: payment.id,
        eventId: supportEvent.id,
      },
      status: "pending",
      priority: amountInr >= SUPPORT_THRESHOLDS.TIER_LARGE_INR ? 2 : 1,
    });

    // 4. Construct stream event
    const streamEvent: any = {
      id: supportEvent.id,
      type: eventType,
      amount: amountInr,
      currency: payment.currency,
      source: (payment.provider === "demo" ? "demo" : "gateway"),
      displayName: payment.payer_name || "Anonymous Supporter",
      timestamp: supportEvent.created_at,
      status: "verified",
      metadata: { paymentId: payment.id },
    };

    // 5. Broadcast to SSE subscribers & trigger character animation HUD
    eventEngine.broadcast({
      type: "STREAM_EVENT",
      event: streamEvent,
      state: {
        streamId: updatedStream.id,
        status: updatedStream.status,
        goalAmount: updatedStream.goal_amount,
        raisedAmount: updatedStream.raised_amount,
        currentSponsor: updatedStream.current_sponsor_name,
        currentSponsorBid: updatedStream.current_sponsor_bid,
        minimumNextBid: updatedStream.minimum_next_bid,
        recentSupport: {
          displayName: payment.payer_name || "Anonymous Supporter",
          amount: amountInr,
          timestamp: supportEvent.created_at,
        },
        lastEvent: streamEvent,
        viewerDisplayMode: "static_demo",
        demoMode: updatedStream.demo_mode,
      },
      timestamp: new Date().toISOString(),
    });
  }
}

export const paymentService = new PaymentService();
