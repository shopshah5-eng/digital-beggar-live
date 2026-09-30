// razorpayProvider.ts — Production & Sandbox Razorpay Payment Provider
import crypto from "node:crypto";
import {
  CreateOrderRequest,
  IPaymentProvider,
  OrderResult,
  PaymentStatus,
  VerifyPaymentRequest,
  VerifyPaymentResult,
} from "./types";
import {
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
} from "./webhookVerification";

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
}

export class RazorpayPaymentProvider implements IPaymentProvider {
  public readonly name = "RazorpayPaymentProvider";
  private keyId: string;
  private keySecret: string;
  private webhookSecret?: string;

  constructor(config: RazorpayConfig) {
    this.keyId = config.keyId.trim();
    this.keySecret = config.keySecret.trim();
    this.webhookSecret = config.webhookSecret?.trim();
  }

  get isMockMode(): boolean {
    return this.keyId.startsWith("rzp_test_mock");
  }

  async createOrder(request: CreateOrderRequest): Promise<OrderResult> {
    const internalPaymentId = `pay_rzp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Offline / Mock Test Harness for Automated Test Suites
    if (this.isMockMode) {
      const mockOrderId = `order_mock_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      return {
        orderId: mockOrderId,
        internalPaymentId,
        amountPaise: request.amountPaise,
        currency: "INR",
        keyId: this.keyId,
        status: "CREATED",
        provider: "razorpay",
      };
    }

    // Real Razorpay Orders API
    const authHeader = `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`;
    const payload = {
      amount: request.amountPaise,
      currency: request.currency || "INR",
      receipt: internalPaymentId,
      notes: {
        purpose: request.purpose,
        displayName: request.displayName,
        streamId: request.streamId || "stream_default_main",
      },
    };

    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(
        `Razorpay Orders API error (${res.status}): ${
          errBody.error?.description || errBody.message || "Failed to create order"
        }`
      );
    }

    const orderData = await res.json();
    return {
      orderId: orderData.id,
      internalPaymentId,
      amountPaise: orderData.amount,
      currency: orderData.currency,
      keyId: this.keyId,
      status: "CREATED",
      provider: "razorpay",
    };
  }

  async verifyPayment(verification: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    const { orderId, paymentId, signature, internalPaymentId } = verification;

    if (!signature) {
      return {
        success: false,
        status: "REJECTED",
        internalPaymentId: internalPaymentId || "",
        providerPaymentId: paymentId,
        amountPaise: 0,
        amountInr: 0,
        error: "Missing Razorpay payment signature.",
      };
    }

    const isValid = verifyRazorpayPaymentSignature(
      orderId,
      paymentId,
      signature,
      this.keySecret
    );

    if (!isValid) {
      return {
        success: false,
        status: "REJECTED",
        internalPaymentId: internalPaymentId || "",
        providerPaymentId: paymentId,
        amountPaise: 0,
        amountInr: 0,
        error: "Cryptographic HMAC signature verification failed.",
      };
    }

    // Verify payment status with Razorpay
    const providerStatus = await this.getPaymentStatus(paymentId);
    if (providerStatus !== "CAPTURED" && providerStatus !== "AUTHORIZED") {
      return {
        success: false,
        status: providerStatus,
        internalPaymentId: internalPaymentId || "",
        providerPaymentId: paymentId,
        amountPaise: 0,
        amountInr: 0,
        error: `Payment is not in captured status (current: ${providerStatus}).`,
      };
    }

    return {
      success: true,
      status: "VERIFIED",
      internalPaymentId: internalPaymentId || "",
      providerPaymentId: paymentId,
      amountPaise: 0, // Authoritative amount is resolved from stored order record in PaymentService
      amountInr: 0,
    };
  }

  async getPaymentStatus(providerPaymentId: string): Promise<PaymentStatus> {
    if (this.isMockMode) {
      // In mock test mode, reject specific test error IDs or accept valid ones
      if (providerPaymentId.includes("failed") || providerPaymentId.includes("err")) {
        return "FAILED";
      }
      return "CAPTURED";
    }

    const authHeader = `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`;
    const res = await fetch(`https://api.razorpay.com/v1/payments/${providerPaymentId}`, {
      headers: { Authorization: authHeader },
    });

    if (!res.ok) {
      return "FAILED";
    }

    const paymentData = await res.json();
    switch (paymentData.status) {
      case "captured":
        return "CAPTURED";
      case "authorized":
        return "AUTHORIZED";
      case "failed":
        return "FAILED";
      case "refunded":
        return "REFUNDED";
      default:
        return "PENDING";
    }
  }

  verifyWebhookSignature(rawBody: string, signature: string, secretOverride?: string): boolean {
    const secret = secretOverride || this.webhookSecret;
    if (!secret) {
      console.error("[RazorpayProvider] Webhook secret not configured.");
      return false;
    }
    return verifyRazorpayWebhookSignature(rawBody, signature, secret);
  }
}
