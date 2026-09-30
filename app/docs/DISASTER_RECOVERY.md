# DIGITAL BEGGAR — DISASTER RECOVERY & INCIDENT PLAYBOOK

**Document Version:** 1.0.0  
**Target Environment:** Staging & Production Ready  
**Scope:** PostgreSQL/Supabase, Next.js Backend, Razorpay Webhooks, Event Engine, State Synchronization.

---

## 1. BACKUP ARCHITECTURE & EXPECTATIONS

> [!IMPORTANT]
> Digital Beggar currently operates in **local development / in-memory mode** or **Supabase PostgreSQL mode**. Automated offsite backups exist ONLY if configured through Supabase Pro/Team tier or external automated pg_dump cron jobs. Do not assume automated cross-cloud backups exist by default.

### Backup Strategy for Production:
1. **Automated Database Snapshots:**
   - In Supabase Pro: Daily automated physical backups with 7-day Point-in-Time Recovery (PITR).
   - In Self-Hosted Postgres: Daily `pg_dump -Fc` uploaded to an isolated, encrypted S3/GCS bucket with 30-day lifecycle retention.
2. **Configuration & Secrets Backup:**
   - All server environment secrets must be securely vaulted (e.g. AWS Secrets Manager, Doppler, or Bitwarden Secrets Manager).
   - Never store production credentials or webhook signing secrets in Git.

---

## 2. RECOVERY PROCEDURES

### 2.1 Database Restore Procedure
1. **Stop Application Traffic:**
   - Put CDN/Cloudflare in "Maintenance Mode" to reject incoming payments during restore.
2. **Execute Database Restore:**
   - If using Supabase PITR: Select target timestamp prior to the corruption incident.
   - If using manual pg_dump:
     ```bash
     pg_restore --clean --if-exists -h $DB_HOST -U $DB_USER -d $DB_NAME backup_YYYYMMDD_HHMM.dump
     ```
3. **Execute Post-Restore Verification:**
   - Verify table integrity: `streams`, `support_events`, `payments`, `sponsor_bids`, `sponsor_campaigns`.
   - Run reconciliation script: `GET /api/admin/reconciliation` (via authenticated admin API).

### 2.2 Environment Secret Loss or Compromise
1. **Razorpay Key Rotation:**
   - If `RAZORPAY_KEY_SECRET` or `RAZORPAY_WEBHOOK_SECRET` is compromised:
     - Generate replacement key pair in Razorpay Dashboard.
     - Update server environment variable `RAZORPAY_KEY_SECRET`.
     - Update Webhook signing secret in Razorpay Webhook settings.
     - Redeploy / restart Next.js backend.
2. **Admin Password Compromise:**
   - Immediately update `ADMIN_PASSWORD_HASH` using `bcrypt.hashSync('new_strong_password', 12)`.
   - Invalidate existing active sessions.

### 2.3 Event Queue Recovery
1. The event queue stores transient reaction items in `event_queue` with statuses:
   - `pending`
   - `processing`
   - `completed`
   - `failed`
   - `retrying`
2. If an event processing error occurs:
   - The queue attempts up to 3 retries with backoff.
   - After 3 failed attempts, status transitions to `failed` and records `last_error`.
   - The queue is non-blocking: a single failed event will NEVER halt subsequent queue processing.
3. Admin Manual Retry:
   - Admins can query failed events via `GET /api/admin/overview` or `getFailedEvents()`.
   - Retries trigger visual reactions only; **financial ledgers are decoupled and NEVER re-incremented on event retries**.

### 2.4 Payment & Sponsor Reconciliation
1. Navigate to `/admin/reconciliation`.
2. Review automated audit discrepancies:
   - Payments marked verified without matching support or bid record.
   - Bids marked verified without an activated sponsor campaign.
   - Multiple active sponsor campaigns (violates single-crown invariant).
   - Inactive or pending payments linked to active campaigns.
3. Reconciliation is **strictly read-only and diagnostic**; it reports anomalies without blind database mutations.

---

## 3. FAILURE SCENARIOS & RUNBOOKS

### Scenario A: Razorpay Gateway Outage
- **Symptom:** Create order API returns 502/504 or checkout script fails to load.
- **Behavior:**
  - Backend does not crash.
  - No payment is marked `VERIFIED`.
  - Stream raised balance is untouched.
  - Safe error message returned to user: `"Payment gateway temporarily unreachable. Please try again shortly."`
- **Action:** Monitor Razorpay Status page. Check webhook backlog upon recovery.

### Scenario B: Database Outage
- **Symptom:** API routes encounter DB connection timeout.
- **Behavior:**
  - Health check `GET /api/health` transitions from `ok` to `degraded`.
  - Readiness probe `GET /api/health/ready` returns HTTP 503.
  - Razorpay Webhook handler returns HTTP 500 so Razorpay retries webhook delivery later with exponential backoff.
- **Action:** Check Supabase instance health, connection pooler (PgBouncer) capacity, and restart application nodes.

### Scenario C: Corrupted Sponsor State (Two Active Sponsors)
- **Symptom:** Admin dashboard or reconciliation warns of multiple active campaigns.
- **Action:**
  - Trigger Admin Emergency Action: `POST /api/admin/stream/action` with `{ action: "emergency_stop_sponsor" }`.
  - Review `/admin/reconciliation` to identify valid winning bidder by timestamp and amount.
  - Manually activate the rightful winning campaign via Admin API.
