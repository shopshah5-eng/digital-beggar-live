// types.ts — Payment Gateway & Provider Abstraction Types
import { EventType } from "../types/events";

export type PaymentMode = "demo" | "razorpay_test" | "razorpay_live";

export type PaymentPurpose = "SUPPORT" | "SPONSOR_BID";

export type PaymentStatus =
  | "CREATED"
  | "PENDING"
  | "AUTHORIZED"
  | "CAPTURED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "VERIFIED"
  | "REJECTED";

export interface CreateOrderRequest {
  amountInr: number;
  amountPaise: number;
  currency: string;
  purpose: PaymentPurpose;
  displayName: string;
  message?: string;
  streamId?: string;
  metadata?: Record<string, unknown>;
}

export interface OrderResult {
  orderId: string;
  internalPaymentId: string;
  amountPaise: number;
  currency: string;
  keyId?: string;
  status: PaymentStatus;
  provider: string;
}

export interface VerifyPaymentRequest {
  orderId: string;
  paymentId: string;
  signature?: string;
  internalPaymentId?: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  status: PaymentStatus;
  internalPaymentId: string;
  providerPaymentId: string;
  amountPaise: number;
  amountInr: number;
  displayName?: string;
  error?: string;
}

export interface IPaymentProvider {
  readonly name: string;
  createOrder(request: CreateOrderRequest): Promise<OrderResult>;
  verifyPayment(verification: VerifyPaymentRequest): Promise<VerifyPaymentResult>;
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatus>;
  verifyWebhookSignature(rawBody: string, signature: string, secret?: string): boolean;
}

// Configurable thresholds for mapping verified support amounts to character animations
export const SUPPORT_THRESHOLDS = {
  MIN_INR: 10,
  MAX_INR: 10000,
  TIER_MEDIUM_INR: 50,
  TIER_LARGE_INR: 500,
} as const;

export function mapAmountToEventType(amountInr: number): EventType {
  if (amountInr >= SUPPORT_THRESHOLDS.TIER_LARGE_INR) {
    return "SUPPORT_LARGE";
  }
  if (amountInr >= SUPPORT_THRESHOLDS.TIER_MEDIUM_INR) {
    return "SUPPORT_MEDIUM";
  }
  return "SUPPORT_SMALL";
}

// Backwards compatibility helper for existing legacy payment calls
export interface LegacyPaymentRequest {
  amount: number;
  currency: string;
  displayName: string;
  type: "support" | "sponsor";
  metadata?: Record<string, unknown>;
}

export interface LegacyPaymentResult {
  paymentId: string;
  status: "pending" | "verified" | "failed";
  amount: number;
  currency: string;
  displayName: string;
  type: "support" | "sponsor";
  transactionRef?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}
