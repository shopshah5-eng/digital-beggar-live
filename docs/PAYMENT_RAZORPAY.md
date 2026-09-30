# 💳 Digital Beggar — Razorpay Payment Gateway Integration (Test Mode)

> **Phase 2 Payment Gateway Sandbox Specification**  
> *Target Gateway: Razorpay Test Mode / Sandbox*  
> *Last Updated: July 2026*  
> *Status: Fully Implemented & Cryptographically Verified*

---

## 1. Architectural Overview & Security Flow

```
                      [ Viewer / Business ]
                                │
                                ▼
                       Clicks Support ₹100
                                │
                                ▼
                   POST /api/payments/create-order
                                │
                                ▼
                  Backend validates amount (₹10–₹10,000)
                 Stores internal order with status CREATED
                     Calls Razorpay Orders API
                                │
                                ▼
           Browser receives order_id & keyId (No secrets)
                                │
                                ▼
                     Razorpay Checkout Modal
                 (Handles UPI, Cards, Netbanking)
                                │
                  ┌─────────────┴─────────────┐
                  ▼                           ▼
        [Standard Checkout Return]    [Signed Webhook]
                  │                           │
                  ▼                           ▼
      POST /api/payments/verify   POST /api/webhooks/razorpay
                  │                           │
                  ▼                           ▼
   1. Cryptographic HMAC Check    1. Raw body HMAC-SHA256 Check
   2. Verify internal order ID    2. Idempotency on webhook ID
   3. Verify amount & currency    3. Amount & currency verify
                  │                           │
                  └─────────────┬─────────────┘
                                ▼
                   Mark Payment Status = VERIFIED
                                │
                                ▼
            Insert record into support_events table
                                │
                                ▼
               Stream raised_amount += ₹100
                                │
                                ▼
           Event Engine dispatches live reaction via SSE
                                │
                                ▼
            OBS HUD & Character Reacts Live on Stream
```

### Critical Security Rule:
**The browser is never trusted to assert payment success or specify payment amounts.**  
Only the backend—via cryptographic HMAC-SHA256 signature verification over the Razorpay payment identifiers or signed webhook payloads—is authorized to mark a payment `VERIFIED`.

---

## 2. Environment Variables

Configure these variables in `.env.local`:

```bash
# ------------------------------------------------------------------------------
# PAYMENT GATEWAY MODE
# ------------------------------------------------------------------------------
# Options:
#   demo           - In-memory simulated transactions (default)
#   razorpay_test  - Razorpay Sandbox / Test Mode
#   razorpay_live  - Real Money Production (Requires explicit production keys)
PAYMENT_MODE=demo

# Razorpay Test Credentials (from Dashboard > Settings > API Keys)
RAZORPAY_KEY_ID=rzp_test_YourKeyIdHere
RAZORPAY_KEY_SECRET=YourSecretHere

# Razorpay Webhook Secret (from Dashboard > Settings > Webhooks)
RAZORPAY_WEBHOOK_SECRET=YourWebhookSecretHere

# Optional browser-safe key id mirror
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_YourKeyIdHere
```

> [!CAUTION]
> **NEVER** prefix `RAZORPAY_KEY_SECRET` or `RAZORPAY_WEBHOOK_SECRET` with `NEXT_PUBLIC_`.  
> Secrets must only exist in server-side execution runtimes.

---

## 3. Payment Provider Abstraction

All gateway operations are mediated by the `IPaymentProvider` interface defined in [`app/src/lib/payments/types.ts`](file:///c:/Users/Asus/OneDrive/Desktop/digital%20begger/app/src/lib/payments/types.ts):

```typescript
export interface IPaymentProvider {
  readonly name: string;
  createOrder(request: CreateOrderRequest): Promise<OrderResult>;
  verifyPayment(verification: VerifyPaymentRequest): Promise<VerifyPaymentResult>;
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatus>;
  verifyWebhookSignature(rawBody: string, signature: string, secret?: string): boolean;
}
```

### Startup Validation
`resolvePaymentProvider()` strictly validates credentials on invocation:
- If `PAYMENT_MODE=razorpay_test` or `razorpay_live` and credentials are missing, it throws an explicit `PaymentConfigError`.
- **It never silently falls back to demo mode.**

---

## 4. Endpoints Specification

### 1. Create Payment Order
`POST /api/payments/create-order`
- **Rate Limit:** 15 req/min per IP
- **Input:** `{ amount: number, displayName: string, message?: string }`
- **Validation:**
  - Min ₹10, Max ₹10,000
  - Integer paise precision ($₹1 = 100\text{ paise}$)
  - Rejects zero, negative, NaN, Infinity, and sub-paise amounts
- **Pre-Registration:** Stored with status `CREATED` in database before returning.
- **Output:** `{ success: true, order: { orderId, amountPaise, currency, keyId } }`

### 2. Verify Client Return
`POST /api/payments/verify`
- **Rate Limit:** 15 req/min per IP
- **Input:** `{ orderId: string, paymentId: string, signature: string }`
- **Server Verification Rules:**
  1. Internal order exists in database.
  2. Order purpose is `SUPPORT`.
  3. Status is not already `VERIFIED` (idempotency guard).
  4. Payment ID has not been used by another transaction.
  5. Cryptographic signature check: $\text{HMAC-SHA256}(order\_id + "|" + payment\_id, secret) == signature$.
  6. Razorpay status is `CAPTURED` or `AUTHORIZED`.
  7. Amount matches order paise amount.
- **Result:** Marks payment `VERIFIED`, updates stream balance, and dispatches animation.

### 3. Signed Webhook
`POST /api/webhooks/razorpay`
- **Input:** Raw unparsed request body string + `x-razorpay-signature` header.
- **Verification:** Timing-safe buffer comparison using `crypto.timingSafeEqual`.
- **Supported Events:**
  - `payment.captured`
  - `order.paid`
  - `payment.failed`
- **Idempotency:** Webhook event ID (`event.id`) is recorded; duplicate deliveries are acknowledged safely without re-triggering character reactions or double-crediting balances.

---

## 5. Animation Reaction Mapping

Verified support amounts automatically map to existing character animations:

| Support Amount | Event Type | Character Reaction |
| :--- | :--- | :--- |
| ₹10 – ₹49 | `SUPPORT_SMALL` | Thank You Animation |
| ₹50 – ₹499 | `SUPPORT_MEDIUM` | Shock & Gratitude Animation |
| ₹500+ | `SUPPORT_LARGE` | Epic Victory & Dance Animation |

---

## 6. How to Configure Razorpay Test Mode

1. Log in to [Razorpay Dashboard](https://dashboard.razorpay.com).
2. Ensure you are in **Test Mode** (toggle in upper right / left menu).
3. Navigate to **Account & Settings $\rightarrow$ API Keys $\rightarrow$ Generate Test Key**.
4. Copy the `Key Id` and `Key Secret`.
5. Navigate to **Account & Settings $\rightarrow$ Webhooks $\rightarrow$ Add New Webhook**:
   - Webhook URL: `https://your-domain.com/api/webhooks/razorpay` (or ngrok / tunnel during local testing)
   - Secret: enter a strong random secret
   - Active Events: select `payment.captured`, `order.paid`, `payment.failed`.
6. Add these to `.env.local`:
   ```bash
   PAYMENT_MODE=razorpay_test
   RAZORPAY_KEY_ID=rzp_test_xxxxxxx
   RAZORPAY_KEY_SECRET=yyyyyyy
   RAZORPAY_WEBHOOK_SECRET=zzzzzzz
   ```
7. Restart server and test via `/support`.

---

## 7. How to Switch Back to Demo Mode

Simply update `.env.local`:
```bash
PAYMENT_MODE=demo
```
In Demo Mode, transactions are simulated in-memory and no credentials or network calls are required.
