// demoProvider.ts — Simulated In-Memory Payment Provider for Local / Sandbox Demo Mode
import {
  CreateOrderRequest,
  IPaymentProvider,
  OrderResult,
  PaymentStatus,
  VerifyPaymentRequest,
  VerifyPaymentResult,
} from "./types";

export class DemoPaymentProvider implements IPaymentProvider {
  public readonly name = "DemoPaymentProvider";
  private orders: Map<string, { request: CreateOrderRequest; internalPaymentId: string }> = new Map();
  private payments: Map<string, { orderId: string; amountPaise: number; status: PaymentStatus }> = new Map();

  async createOrder(request: CreateOrderRequest): Promise<OrderResult> {
    const orderId = `order_demo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const internalPaymentId = `pay_demo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    this.orders.set(orderId, { request, internalPaymentId });

    return {
      orderId,
      internalPaymentId,
      amountPaise: request.amountPaise,
      currency: request.currency || "INR",
      keyId: "rzp_test_demo_public_key",
      status: "CREATED",
      provider: "demo",
    };
  }

  async verifyPayment(verification: VerifyPaymentRequest): Promise<VerifyPaymentResult> {
    const orderEntry = this.orders.get(verification.orderId);
    if (!orderEntry) {
      return {
        success: false,
        status: "FAILED",
        internalPaymentId: verification.internalPaymentId || "",
        providerPaymentId: verification.paymentId,
        amountPaise: 0,
        amountInr: 0,
        error: `Demo order ${verification.orderId} not found.`,
      };
    }

    const { request, internalPaymentId } = orderEntry;
    this.payments.set(verification.paymentId, {
      orderId: verification.orderId,
      amountPaise: request.amountPaise,
      status: "CAPTURED",
    });

    return {
      success: true,
      status: "VERIFIED",
      internalPaymentId,
      providerPaymentId: verification.paymentId,
      amountPaise: request.amountPaise,
      amountInr: request.amountInr,
      displayName: request.displayName,
    };
  }

  async getPaymentStatus(providerPaymentId: string): Promise<PaymentStatus> {
    const existing = this.payments.get(providerPaymentId);
    if (existing) {
      return existing.status;
    }
    return "CAPTURED"; // Demo provider treats all test simulated payments as captured
  }

  verifyWebhookSignature(_rawBody: string, signature: string): boolean {
    // In demo mode, accept demo signature or any non-empty test signature
    return signature === "demo_webhook_signature" || signature.startsWith("demo_");
  }

  // Backwards-compatible simulation helper for legacy eventEngine demo flows
  async createPayment(request: { amount: number; currency?: string; displayName?: string; type?: string }) {
    const paymentId = `pay_demo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      success: true,
      paymentId,
      status: "verified",
      amount: request.amount,
      currency: request.currency || "INR",
      displayName: request.displayName || "Anonymous",
      transactionRef: `tx_sim_${Date.now()}`,
    };
  }
}

export const demoPaymentProvider = new DemoPaymentProvider();
