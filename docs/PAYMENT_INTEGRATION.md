# 💳 Digital Beggar — Payment Provider Integration Guide

## 1. Provider Abstraction

All payment gateways (Demo, Razorpay, and future providers) implement the standard interface defined in:
[`app/src/lib/payments/types.ts`](file:///c:/Users/Asus/OneDrive/Desktop/digital%20begger/app/src/lib/payments/types.ts)

```typescript
export interface IPaymentProvider {
  readonly name: string;
  createOrder(request: CreateOrderRequest): Promise<OrderResult>;
  verifyPayment(verification: VerifyPaymentRequest): Promise<VerifyPaymentResult>;
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatus>;
  verifyWebhookSignature(rawBody: string, signature: string, secret?: string): boolean;
}
```

---

## 2. Pluggable Providers

Digital Beggar provides out-of-the-box providers in `src/lib/payments/`:
1. **`DemoPaymentProvider` (`src/lib/payments/demoProvider.ts`):** In-memory simulated transactions for local development without credentials.
2. **`RazorpayPaymentProvider` (`src/lib/payments/razorpayProvider.ts`):** Complete integration with Razorpay Orders API, Payments API, and Webhooks with timing-safe HMAC-SHA256 signature verification.

Provider resolution is governed by `PAYMENT_MODE` in `src/lib/payments/provider.ts`:
- `demo`: Uses `DemoPaymentProvider`
- `razorpay_test`: Uses `RazorpayPaymentProvider` in Test/Sandbox mode
- `razorpay_live`: Uses `RazorpayPaymentProvider` in Live mode (requires verified production keys)

---

## 3. Webhook Handling Architecture

Incoming webhooks are ingested via `/api/webhooks/razorpay`:
1. **Raw Body Ingestion:** Ingests raw text payload to prevent JSON serialization differences from breaking HMAC computation.
2. **Timing-Safe Comparison:** Compares computed HMAC-SHA256 signature against `x-razorpay-signature` using `crypto.timingSafeEqual`.
3. **Idempotency Check:** Records `webhook_event_id` in database. Replayed webhook events return HTTP 200 OK without re-crediting balances or re-triggering character animations.
4. **Order Reconciliation:** Reconciles against the internal pre-registered order record in database before triggering the Event Engine.

---

---

## 4. Payment Purposes & Authoritative Scope

Payment creation enforces immutable, server-authoritative purposes (`PaymentPurpose`):
1. **`SUPPORT`**: Direct viewer contributions towards stream funding goal. Triggers `THANK_YOU`, `SHOCK`, `VICTORY`, or `CELEBRATE` character animations based on amount tiers.
2. **`SPONSOR_BID`**: Business sponsorship bids attempting to acquire the Sponsor Crown. Triggers atomic Crown qualification check, `SPONSOR_WIN`, `NEW_SPONSOR`, and `SPONSOR_LOST` events.

The payment purpose is fixed at order generation time and cannot be altered by the client browser during checkout or verification.

---

## 5. Sponsor Payment Reconciliation & Race Handling

Unlike viewer support (which immediately credits the stream total upon verification), verified `SPONSOR_BID` payments undergo a secondary qualification check:
- If `bidAmount >= currentMinimumBid`: The Crown is transferred, and previous campaign is ended.
- If outbid concurrently before verification completes: The bid is marked `REFUND_REQUIRED` rather than crowned, preventing race conditions from granting the Crown to outbid bidders.

---

## 6. Zero Visual Breakage Guarantee for Stream & Animations

Because the frontend and OBS HUD subscribe strictly to the Server-Sent Events stream from `EventEngine`, swapping providers requires zero changes to the character visual scene, WebGL/Canvas renderer, or animation player.

For detailed configuration instructions and testing guidelines, refer to:
[`docs/PAYMENT_RAZORPAY.md`](file:///c:/Users/Asus/OneDrive/Desktop/digital%20begger/docs/PAYMENT_RAZORPAY.md)
and [`docs/SPONSOR_SYSTEM.md`](file:///c:/Users/Asus/OneDrive/Desktop/digital%20begger/docs/SPONSOR_SYSTEM.md)

