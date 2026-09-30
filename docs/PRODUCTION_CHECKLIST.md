# DIGITAL BEGGAR — PRODUCTION LAUNCH CHECKLIST

**Version:** 1.0.0 (Phase 4 Hardening Review)  
**Status Key:**  
`[x]` Verified / Completed  
`[ ]` Incomplete / Pending Live Infrastructure or Deployment

---

## 1. SECURITY
- [x] Admin authentication uses bcrypt password hashing
- [x] Admin authorization verified server-side on every `/api/admin/*` route
- [x] Brute-force protection throttles repeated login attempts (5 attempts / 5 min / IP)
- [x] Rate limiting abstraction implemented (In-Memory for dev; Redis/Upstash adapter ready for prod)
- [x] Request payload size limits enforced (64 KB ceiling)
- [x] Server-side allowlist input sanitization against XSS and HTML injection
- [x] `javascript:`, `data:`, `vbscript:` URI schemes strictly rejected on sponsor links
- [x] Public endpoints leak zero internal secrets, database keys, or customer PII
- [x] Security headers configured (CSP, X-Content-Type-Options: nosniff, Referrer-Policy, SAMEORIGIN)
- [x] Safe standardized API error responses (zero stack traces or filesystem paths returned)
- [x] Request correlation ID (`x-request-id`) tracking across requests and logs

---

## 2. PAYMENTS
- [x] Payment provider abstraction layer implemented (`demo` and `razorpay` providers)
- [x] Order amount determined server-side from catalog rules (never accepted from frontend)
- [x] Currency locked server-side to INR
- [x] HMAC-SHA256 signature verification implemented for checkout and webhooks
- [x] Raw unparsed body used for webhook cryptographic signature verification
- [x] Webhook processing is idempotent (duplicate events ignored without double accounting)
- [x] Unverified payments cannot increment stream balances or activate sponsors
- [x] Financial safety mode (`LIVE_PAYMENT_ENABLED=false`) default active
- [x] Boot-time check rejects test keys (`rzp_test_`) in live mode and live keys in test mode
- [ ] Complete live Razorpay merchant KYC and business registration
- [ ] Configure live bank settlement account
- [ ] Set `LIVE_PAYMENT_ENABLED=true` in production environment after KYC signoff

---

## 3. SPONSORS
- [x] Minimum next bid calculated server-side (dynamic 10% increment or min +₹100)
- [x] Sponsor bid payment purpose enforced as `SPONSOR_BID`
- [x] Sponsor Crown re-verified against latest active campaign prior to activation
- [x] Atomic single-crown activation logic prevents simultaneous dual-sponsors
- [x] Losing / late bids marked `REFUND_REQUIRED` rather than falsely crowned
- [x] Sponsor reconciliation engine detects discrepancies and unverified activations
- [x] Admin diagnostics page available at `/admin/reconciliation`
- [x] Admin emergency sponsor stop control implemented (`emergency_stop_sponsor`)
- [ ] Automated Razorpay refund integration for `REFUND_REQUIRED` bids

---

## 4. DATABASE
- [x] Repository abstraction implemented (`InMemoryRepository` + `SupabaseRepository`)
- [x] PostgreSQL database schema with constraints in `docs/schema.sql`
- [x] Unique constraints on `provider_payment_id` and `provider_order_id`
- [x] Single active sponsor campaign constraint modeled
- [x] Financial totals derived from immutable verified payments
- [x] Event queue failure states tracked (`pending`, `processing`, `completed`, `failed`, `retrying`)
- [ ] Apply `schema.sql` migrations to Supabase Production PostgreSQL instance
- [ ] Configure connection pooling (PgBouncer/Supabase Supavisor) for high concurrency

---

## 5. ADMIN
- [x] Dedicated admin login portal at `/admin/login`
- [x] Session cookie protected (`HttpOnly`, `SameSite=Lax`, `Secure` in production)
- [x] Server-side identity verified via `verifyAdminAuth` on all admin mutations
- [x] Admin action audit logging records actor, timestamp, action type, and stream ID
- [x] Admin emergency controls: pause stream, resume stream, reset stream, emergency stop sponsor
- [x] Admin event retry for failed non-financial queue events (guarantees zero balance modification)
- [ ] Multi-admin role-based access control (RBAC) if multiple staff members onboarded

---

## 6. MONITORING
- [x] Structured JSON logger implemented with automated PII & secret redactor
- [x] Correlation request IDs (`x-request-id`) included in logs
- [x] Health check endpoints implemented: `/api/health`, `/api/health/ready`, `/api/health/live`
- [x] Zero secrets or sensitive configuration exposed in health check payloads
- [ ] Setup external uptime monitor (e.g., BetterStack, UptimeRobot) pinging `/api/health`
- [ ] Configure Sentry or Datadog for production application exception alerts

---

## 7. BACKUPS
- [x] Disaster recovery documentation created in `docs/DISASTER_RECOVERY.md`
- [x] Step-by-step restore playbooks for database, secret rotation, and sponsor state corruption
- [ ] Configure Supabase Point-in-Time Recovery (PITR) or daily automated `pg_dump` cron to encrypted S3
- [ ] Test real database restoration drill in staging environment

---

## 8. ENVIRONMENT
- [x] Strict environment validator (`validateEnvironment()`) runs at startup
- [x] Dedicated modes defined: `DEMO`, `RAZORPAY_TEST`, `RAZORPAY_LIVE`
- [x] Application boot fails immediately if live mode has missing keys or test credentials
- [x] Public variables audited; zero private secrets prefixed with `NEXT_PUBLIC_`
- [ ] Store production `.env.production` in encrypted secrets manager (AWS Secrets Manager / Doppler)

---

## 9. LEGAL & COMPLIANCE
- [x] Stream HUD displays explicit sponsor disclosure ("CURRENT SPONSOR" / "SPONSORED")
- [ ] Publish Terms of Service (ToS) and Refund Policy on website
- [ ] Publish Privacy Policy complying with applicable data privacy regulations
- [ ] Setup GSTIN and invoice generation for business sponsor payments
- [ ] Consult tax advisor regarding digital entertainment donations / sponsorships

---

## 10. AI VOICE & REACTION ORCHESTRATION
- [x] Multi-vendor voice provider abstraction implemented (`IVoiceProvider`)
- [x] Demo mode (`VOICE_MODE=demo`) simulates speech duration without API keys or costs
- [x] Real TTS mode (`VOICE_MODE=tts`) protected by server-side secrets (`TTS_API_KEY`, etc.)
- [x] Personality response template engine configured with 12 distinct event categories
- [x] Character personality strictly fictional; zero claims of poverty, distress, or real begging
- [x] Circular buffer history prevents repetition of last 5 spoken lines
- [x] Token sanitization allows only approved tokens (`{name}`, `{amount}`, `{businessName}`, `{bidAmount}`)
- [x] Arbitrary user messages and sponsor custom scripts are strictly blocked from speech
- [x] Priority voice queue enforces serial playback (`CRITICAL > HIGH > NORMAL > LOW`)
- [x] Cooldown enforcement (min 2s gap) and queue overflow drop policy (max 10 items)
- [x] Voice failure decoupling: TTS timeout or error never cancels or rolls back financial payments
- [x] Admin voice controls implemented: mute/unmute, test speech, clear queue, audit logging
- [x] Zero voice API secrets exposed to frontend or SSE stream state
- [ ] Select production TTS provider (ElevenLabs / OpenAI / GCP) and provision live API key
- [ ] Setup cloud CDN/S3 bucket for speech audio caching under high live stream traffic

---

## 11. OBS (OPEN BROADCASTER SOFTWARE)
- [x] Dedicated OBS Browser Source route created at `/hud`
- [x] Canvas calibrated to 1920×1080 (16:9 native ratio) with responsive downscaling
- [x] Master background (`/MASTER/livestream_background.png`) and character video loop configured
- [x] Character reaction engine bound to real-time events (`01_idle` to `13_victory`)
- [x] Viewer count abstraction implemented (`IViewerCountProvider`) with explicit `DEMO` badge
- [x] Support goal, recent supporter ticker, and Sponsor Crown cards integrated into HUD
- [x] Reconnect logic synchronizes stream state without replaying old transactions
- [x] Memory safety: Bounded queues (15 items) and event ID deduplication (50 items)
- [x] Developer companion testing route created at `/hud/test`
- [ ] Connect OBS Studio Browser Source to `http://localhost:3005/hud`
- [ ] Verify audio routing in OBS Studio Audio Mixer with "Control audio via OBS"
- [ ] Configure live OBS stream output settings and scene transitions


---

## 12. YOUTUBE
- [ ] Configure YouTube Live RTMP stream key in OBS
- [ ] Set stream title, description, and sponsor disclosure tags
- [ ] Test live chat integration and latency settings (Ultra-Low Latency)
- [ ] Verify 24/7 stream loop handling on YouTube Live dashboard

---

## 13. 24/7 HOSTING & INFRASTRUCTURE
- [ ] Provision production cloud VM / container (e.g. AWS ECS, GCP Cloud Run, or Railway)
- [ ] Provision production Redis cluster (Upstash Redis) for distributed rate limiting
- [ ] Configure SSL/TLS certificates via Cloudflare CDN with DDoS mitigation rules
- [ ] Setup systemd or Docker restart policies (`restart: always`) for zero-downtime reboots
- [ ] Conduct end-to-end 24-hour staging stress test before public announcement

