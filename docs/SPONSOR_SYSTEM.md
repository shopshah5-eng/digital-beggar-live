# 👑 Digital Beggar — Phase 3 Sponsor Crown & Business Bidding System Architecture

---

## 1. Executive Summary & Core Product Rules

The **Digital Beggar Sponsor Crown System** is an auction architecture designed to handle business sponsor bids during livestreams. 

### Fundamental Invariants
1. **Single Authoritative Crown**: Exactly one active sponsor crown (`SPONSOR_ACTIVE`) can exist at any point in time.
2. **Server-Side Verification Gate**: A browser request, client submission, or database record marked `"submitted"` can **never** crown a sponsor.
3. **Double Verification Rule (Concurrency Re-Check)**: Payment verification alone does **not** automatically grant the Crown. The backend atomically re-checks whether the bid still meets the latest minimum bid requirements at the exact moment of activation. If a concurrent competitor verified a higher bid earlier, the losing bid is marked `REFUND_REQUIRED` and does not take the Crown.
4. **Authoritative Purpose**: Every sponsor bid payment strictly enforces `purpose: "SPONSOR_BID"`. The browser cannot modify the payment purpose after order creation.
5. **No Executable Code**: Arbitrary HTML, scripts, iframes, tracking pixels, or `javascript:` URLs are strictly prohibited and sanitized.

---

## 2. Centralized Bidding Rules (`src/lib/sponsor/rules.ts`)

Bidding follows a centralized, deterministic arithmetic rule with **zero percentage multipliers**:

- **No Active Sponsor (Opening Minimum)**:
  $$\text{Opening Minimum Bid} = ₹500$$
- **Active Sponsor Exists**:
  $$\text{Minimum Next Bid} = \text{Current Active Verified Bid} + ₹500$$
- **Bid Increment**: Fixed ₹500 increment (`currentVerifiedBid + 500`).
- **Initial Maximum Bid**: ₹10,00,000 (10 Lakhs INR).
- **Precision**: Strict integer paise precision (no fractional paise, currency INR).

*Example Progression:*
- Vacant Crown → Minimum ₹500
- Business A verified @ ₹500 → Minimum ₹1,000
- Business B verified @ ₹1,000 → Minimum ₹1,500
- Business C verified @ ₹1,500 → Minimum ₹2,000

---

## 3. End-to-End Sponsor Payment & Verification Flow

```
Viewer / Business (/sponsor)
       │
       ▼
1. Submit Business Details & Bid Amount (POST /api/sponsor/bid)
       │
       ▼
2. Server validates business, email, sanitized text, HTTPS URL, and checks authoritative minimum bid
       │
       ▼
3. Create Internal Sponsor Bid Record (status: BID_SUBMITTED)
       │
       ▼
4. Pre-register Payment Record (purpose: SPONSOR_BID, status: PENDING)
       │
       ▼
5. Create Gateway Order (DemoProvider or Razorpay Orders API)
       │
       ▼
6. Business Completes Payment (Modal / Checkout)
       │
       ▼
7. Verification Phase (POST /api/sponsor/verify or Signed Webhook)
       │
       ├── Cryptographic HMAC SHA256 Signature Check
       ├── Idempotency Check (returns existing status if already processed)
       └── Server marks payment VERIFIED, bid PAYMENT_VERIFIED
       │
       ▼
8. ATOMIC CROWN RE-CHECK
       │
       ├── Current Sponsor still qualifies? (bidAmount >= currentMinimumBid)
       │      │
       │      ├── YES:
       │      │     1. End previous campaign (endedAt = now)
       │      │     2. Create new campaign (status: SPONSOR_ACTIVE, startedAt = now)
       │      │     3. Update Stream sponsor & raise minimum next bid (+₹500)
       │      │     4. Update bid status: BID_ACCEPTED
       │      │     5. Enqueue events: SPONSOR_LOST (prev), SPONSOR_WIN, NEW_SPONSOR
       │      │     6. Broadcast SSE stream update & trigger character reaction
       │      │
       │      └── NO (Concurrently outbid by earlier verified bidder):
       │            1. Current Crown remains unchanged
       │            2. Update bid status: REFUND_REQUIRED
       │            3. Return { crownWon: false, status: "REFUND_REQUIRED", reason: "OUTBID" }
```

---

## 4. Sponsor Lifecycle & Data Model

### Bid Status State Machine
- `BID_DRAFT`: Bid details formulated.
- `BID_SUBMITTED`: Business and bid validated and recorded in database.
- `PAYMENT_PENDING`: Payment gateway order created; waiting for checkout.
- `PAYMENT_VERIFIED`: Payment signature cryptographically confirmed by server/webhook.
- `BID_ACCEPTED`: Atomic Crown check passed; bidder is officially crowned.
- `BID_REJECTED`: Invalid signature, rejected by validation, or manually rejected by admin.
- `BID_EXPIRED`: Order timed out without payment.
- `REFUND_REQUIRED`: Payment was verified, but the bid was outbid by a concurrent transaction before Crown activation.

### Campaign Status State Machine
- `SPONSOR_ACTIVE`: Currently reigning Sponsor Crown.
- `SPONSOR_ENDED`: Previous sponsor whose campaign ended when outbid or manually ended.
- `ADMIN_OVERRIDE`: Campaign created via manual authenticated administrative intervention.

---

## 5. Concurrency Protection & Race Condition Mitigation

When two businesses attempt to claim the Crown at the same time:
1. Both may legitimately pay the required amount (e.g. ₹1,500).
2. The server uses an atomic repository transaction (`activateWinningBid`).
3. Only the first transaction processed by the database acquires the Crown and raises the minimum next bid to ₹2,000.
4. When the second transaction attempts activation, `activateWinningBid` evaluates:
   $$\text{bidAmount} (₹1,500) < \text{currentMinimumBid} (₹2,000)$$
5. The second bid fails activation, is marked `REFUND_REQUIRED`, and the system logs the condition without crashing or crowning duplicate sponsors.

---

## 6. Idempotency Guarantees

Every verification and payment operation supports strict idempotency:
- Duplicate gateway webhooks or repeated client verification requests check `orderId` and `paymentId`.
- If a bid is already `BID_ACCEPTED` or `VERIFIED`, the system returns the existing verified state without:
  - Re-charging or duplicating revenue totals.
  - Creating duplicate campaigns.
  - Firing duplicate SSE events or character reaction triggers.

---

## 7. Administrative Controls & Emergency Override

### Standard Admin Actions (`/admin`)
- **View Bids & Campaigns**: Inspect recent submissions, amounts, payment IDs, and campaign history.
- **Reject Bid**: Manually reject pending or abusive bids (`action: "reject_bid"`).
- **End Sponsor**: Gracefully retire the active sponsor, vacating the Crown (`action: "end_sponsor"`).

### Emergency Sponsor Override (`/api/sponsor/admin/override`)
- **Strict Authorization**: Authenticated admin JWT session required.
- **Confirmation Guard**: Requires explicit confirmation string: `CONFIRM_EMERGENCY_OVERRIDE`.
- **Audit Logging**: Every override writes an immutable record in `admin_actions` with `action_type: "ADMIN_SPONSOR_OVERRIDE"`, logging actor, action, sponsor details, and timestamp.
- **No Fake Payments**: Overrides mark the campaign status as `ADMIN_OVERRIDE` and **never** manufacture fake financial or payment records.

---

## 8. Public State Sanitization & Paid Placement Disclosure

Public endpoints (`GET /api/stream/state` and `GET /api/sponsor/current`) strictly adhere to public hygiene rules:
- **Exposed**: `displayName`, `verifiedBid`, `website`, `category`, `campaignStartTime`, `minimumNextBid`, and `disclosure`.
- **Strictly Omitted**: Contact email, payment IDs (`payment_id`, `provider_order_id`), private metadata, audit logs, and gateway credentials.
- **Mandatory Disclosure**: The sponsor card visibly and prominently states `CURRENT SPONSOR` / `SPONSORED` to ensure transparency and compliance.

---

## 9. Content Restrictions & Anti-Abuse

- **Sanitization**: All business names, descriptions, and categories pass through `sanitizeText()`, stripping HTML tags (`<script>`, `<iframe>`, `<div>`, etc.).
- **URL Whitelisting**: Websites must use `http:` or `https:`. Malicious schemes (`javascript:`, `data:`, `vbscript:`) are rejected.
- **Rate Limiting**:
  - `POST /api/sponsor/bid`: 8 requests / min per IP.
  - `POST /api/sponsor/verify`: 8 requests / min per IP.
  - `POST /api/sponsor/admin/override`: 5 requests / min per admin.

---

## 10. Refund Limitation Disclosure

> [!IMPORTANT]
> **Refund Policy for Concurrent Bids**:
> If a payment is verified but the bid loses due to a concurrent higher verified bid, the system records status `REFUND_REQUIRED`. The system does **not** falsely claim an automated refund has occurred. Automated refund gateway handling will be implemented explicitly before live public monetary launch.

---

## 11. Payment Gateway Modes

1. **`demo`**: Sandbox local execution with mock provider (`DemoPaymentProvider`). No real cards or UPI needed.
2. **`razorpay_test`**: Razorpay Test Mode with test keys (`rzp_test_...`) for staging validation.
3. **`razorpay_live`**: Production mode (disabled until production readiness review and live credentials configured).
