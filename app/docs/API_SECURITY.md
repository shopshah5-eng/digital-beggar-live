# 🛡️ Digital Beggar — API Security & Control Plane Specification

> **Phase 1 Security Architecture**  
> *Last Updated: July 2026*  
> *Status: Implemented & Verified*

---

## 1. Security Architecture Principles

1. **Zero Client Trust:** The client/browser is completely untrusted. The browser cannot claim "I paid ₹500" or assert `isAdmin = true`. All authorizations, state mutations, and financial transactions are strictly verified server-side.
2. **Identity Verification & Allowlist Authorization:** Administrative access requires valid Supabase Auth tokens matching the configured server-side `ADMIN_EMAIL` allowlist.
3. **Environment Isolation:** Operational modes (`DEMO_MODE`, `ADMIN_MODE`, `PRODUCTION_MODE`) are explicitly separated. Demo reset and manual reaction controls cannot be called publicly in production environments.
4. **Defense in Depth:** Dual protection layer:
   - **Network/Route Guard:** Next.js Edge proxy redirects unauthenticated requests targeting `/admin` to `/admin/login`.
   - **Server-Side API Guard:** Every admin API endpoint independently validates the caller's JWT/session before exposing data or mutating state.
5. **Rate Limiting:** IP-based and user-based throttling shields payment ingestion and control endpoints from spam and denial of service.
6. **Immutable Sanitized Audit Trail:** Every privileged operation is immutably logged with actor identity, action type, timestamp, target, and sanitized parameters (secrets/passwords strictly purged).

---

## 2. API Endpoint Security Matrix

| Endpoint | Method | Access Level | Authorization Required | Rate Limit | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/stream/state` | `GET` | **Public** | None | Unrestricted | Read sanitized stream telemetry (goal, raised, sponsor, recent support) |
| `/api/events/stream` | `GET` | **Public** | None | 10 conns / IP | Server-Sent Events (SSE) live stream feed for HUD and OBS |
| `/api/admin/auth/login` | `POST` | **Public / Restricted** | Allowlist check | 5 req / min / IP | Supabase Auth login. Returns HTTP-only session cookie & JWT |
| `/api/admin/auth/logout` | `POST` | **Authenticated** | None | Unrestricted | Clears session cookie |
| `/api/admin/auth/me` | `GET` | **Admin Only** | Valid Admin Token | 60 req / min | Validates session and returns authenticated admin metadata |
| `/api/admin/overview` | `GET` | **Admin Only** | `ADMIN_EMAIL` match | 60 req / min | Financial ledger, supporter breakdown, sponsor bids, and audit log |
| `/api/admin/stream/action` | `POST` | **Admin Only** | `ADMIN_EMAIL` match | 60 req / min | Controls stream state: pause, resume, reset, manual reactions |
| `/api/admin/stream/goal` | `POST` | **Admin Only** | `ADMIN_EMAIL` match | 60 req / min | Modifies fundraising target amount |
| `/api/demo/support` | `POST` | **Simulation / Public** | Rate Limited | 15 req / min / IP | Simulates support payment (Phase 1/2 test harness) |
| `/api/demo/sponsor` | `POST` | **Simulation / Public** | Rate Limited + Min Bid | 8 req / min / IP | Simulates sponsor bidding with minimum bid validation |
| `/api/demo/reset` | `POST` | **Demo / Admin** | Blocked in Prod without Admin | 5 req / min | Resets stream state. Gated by `modeCheck` |
| `/api/demo/pause` | `POST` | **Demo / Admin** | Blocked in Prod without Admin | 5 req / min | Pauses stream loop. Gated by `modeCheck` |
| `/api/demo/resume` | `POST` | **Demo / Admin** | Blocked in Prod without Admin | 5 req / min | Resumes stream loop. Gated by `modeCheck` |
| `/api/demo/reaction` | `POST` | **Demo / Admin** | Blocked in Prod without Admin | 10 req / min | Injects character animation. Gated by `modeCheck` |
| `/api/payments/config` | `GET` | **Public** | None | 60 req / min | Returns active payment gateway mode and public key ID |
| `/api/payments/create-order` | `POST` | **Public** | Validated Amount (₹10–₹10,000) | 15 req / min / IP | Creates internal order & provider order (paise precision) |
| `/api/payments/verify` | `POST` | **Public / Return** | HMAC-SHA256 Signature | 15 req / min / IP | Authoritative verification of client return signature & amount |
| `/api/webhooks/razorpay` | `POST` | **Gateway Webhook** | Raw HMAC-SHA256 Signature | Unrestricted | Authoritative webhook receiver with idempotency deduplication |
| `/api/sponsor/current` | `GET` | **Public** | None | 60 req / min | Sanitized public sponsor card state (display name, bid, website, disclosure) |
| `/api/sponsor/bid` | `POST` | **Public** | Validated Business & Bid | 8 req / min / IP | Validates business details, checks minimum bid, creates order |
| `/api/sponsor/verify` | `POST` | **Public / Return** | Payment Verification & Crown Re-check | 8 req / min / IP | Verifies sponsor payment and executes atomic Crown re-check & activation |
| `/api/sponsor/bids` | `GET / POST` | **Admin Only** | `ADMIN_EMAIL` match | 30 req / min | Admin bid inspection and manual rejection / sponsor ending |
| `/api/sponsor/admin/override` | `POST` | **Admin Only** | `ADMIN_EMAIL` match + explicit confirmation string | 5 req / min | Emergency Sponsor Crown Override (`CONFIRM_EMERGENCY_OVERRIDE`) |


---

## 3. Environment & Mode Boundaries

```
┌────────────────────────────────────────────────────────┐
│                   DIGITAL BEGGAR MODES                 │
└────────────────────────────────────────────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
  [DEMO_MODE=true]                   [PRODUCTION_MODE]
  • In-Memory or DB Fallback          • Strict Supabase Auth
  • /api/demo/* endpoints open        • /api/demo/* controls BLOCKED (403)
  • Test tokens accepted              • Real Gateway Webhooks active
  • Safe for offline development      • Only Admin can control stream
```

### Mode Delineation:
1. **DEMO_MODE:** Enabled by default when `DEMO_MODE=true` in `.env.local`. Useful for local testing and developer demonstrations without live payment credentials.
2. **ADMIN_MODE:** Privileged state accessed via `/admin`. Requires identity verified by Supabase Auth and matching `ADMIN_EMAIL`.
3. **PRODUCTION_MODE:** Activated when `DEMO_MODE=false`. All public demo control routes (`/api/demo/reset`, `pause`, `resume`, `reaction`) return `HTTP 403 Forbidden` unless the request includes a verified admin session.

---

## 4. Rate Limiting Specifications

The platform employs a pluggable `IRateLimiter` interface currently backed by `InMemoryRateLimiter` (with seamless migration readiness for Upstash Redis):

- **Support Creation (`RATE_LIMITS.SUPPORT_PER_IP`):** 15 requests per 60 seconds per IP.
- **Sponsor Bids (`RATE_LIMITS.SPONSOR_PER_IP`):** 8 requests per 60 seconds per IP.
- **Admin Actions (`RATE_LIMITS.ADMIN_PER_USER`):** 60 requests per 60 seconds per admin identity.

When a client breaches these thresholds, the API returns `HTTP 429 Too Many Requests` with standard RFC headers:
- `Retry-After`: Seconds until the current rate limit window resets.
- `X-RateLimit-Limit`: Maximum requests permitted within the window.
- `X-RateLimit-Remaining`: Zero remaining requests.
- `X-RateLimit-Reset`: Unix timestamp of the window reset.

---

## 5. Audit Logging Standard

All administrative mutations automatically invoke the audit logger (`repo.admin.logAction`):

```json
{
  "stream_id": "stream_default_main",
  "action_type": "update_goal | pause | resume | reset | trigger_reaction",
  "actor": "admin@digitalbeggar.com",
  "details": {
    "target": "stream_state",
    "previous_value": 100000,
    "new_value": 150000
  },
  "created_at": "2026-07-15T12:00:00.000Z"
}
```

**Security Invariants:**
- `actor` is assigned directly from the server-verified JWT/session, never from request body parameters.
- Passwords, access tokens, service role keys, and webhook secrets are strictly purged prior to logging.

---

## 6. Payment Gateway Sandbox & Webhook Security (Phase 2 Implemented)

Real money and sandbox payments enforce strict server-side zero-trust guarantees:
1. **Server-Side Order Authoritative Amount:** The frontend never decides what to pay. When `POST /api/payments/create-order` is called with an amount (₹10–₹10,000), the server converts it to integer paise, creates an internal record with `status: "CREATED"`, and registers it with the payment provider.
2. **Double Verification Path:**
   - **Checkout Return (`/api/payments/verify`):** Verifies `crypto.timingSafeEqual` HMAC-SHA256 signature `order_id + "|" + payment_id` against `RAZORPAY_KEY_SECRET`. Fetches payment status to confirm `captured`/`authorized` and exact amount match.
   - **Signed Webhook (`/api/webhooks/razorpay`):** Verifies raw unparsed request body string against `x-razorpay-signature` using `RAZORPAY_WEBHOOK_SECRET`.
3. **Idempotency & Replay Protection:**
   - Both verification paths check if the payment order is already marked `VERIFIED`.
   - Webhook events record `webhook_event_id` in database to reject replayed webhooks.
   - The stream balance is credited exactly once (`raised_amount += amount`), and only a single character reaction is emitted to the Event Engine.
4. **Credential Isolation:**
   - `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are strictly server-only environment variables.
   - Only `keyId` is exposed to the browser via `/api/payments/config` or order payloads.
   - Public stream telemetry (`/api/stream/state`) strictly strips all internal tokens, secrets, and payer identifiers.
