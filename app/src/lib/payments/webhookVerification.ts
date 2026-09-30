// webhookVerification.ts — Cryptographic Signature Verification for Payment Gateways
import crypto from "node:crypto";

/**
 * Validates Razorpay Webhook HMAC-SHA256 signature using timing-safe comparison
 * to eliminate timing-attack vulnerabilities.
 *
 * @param rawBody - Raw, unparsed UTF-8 request body string
 * @param signature - Signature passed in 'x-razorpay-signature' header
 * @param secret - Webhook secret configured in Razorpay dashboard
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!rawBody || !signature || !secret) {
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature, "utf-8");
    const signatureBuffer = Buffer.from(signature, "utf-8");

    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch (err) {
    console.error("[WebhookVerification] Error validating webhook signature:", err);
    return false;
  }
}

/**
 * Validates Razorpay Checkout Return Signature:
 * HMAC_SHA256(order_id + "|" + razorpay_payment_id, secret) == razorpay_signature
 */
export function verifyRazorpayPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!orderId || !paymentId || !signature || !secret) {
    return false;
  }

  try {
    const payload = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature, "utf-8");
    const signatureBuffer = Buffer.from(signature, "utf-8");

    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch (err) {
    console.error("[PaymentVerification] Error validating payment signature:", err);
    return false;
  }
}
