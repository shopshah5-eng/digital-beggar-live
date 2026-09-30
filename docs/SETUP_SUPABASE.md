# 🏛️ Digital Beggar — Supabase PostgreSQL Setup & Persistence Guide

This guide details how to set up the persistent database layer for Digital Beggar using Supabase PostgreSQL.

---

## 1. Create Your Supabase Project

1. Visit [Supabase](https://supabase.com) and sign in or create an account.
2. Click **New Project**.
3. Fill in the project details:
   - **Name**: `Digital Beggar`
   - **Database Password**: Choose a strong, secure password and save it securely in a password manager.
   - **Region**: Select the region closest to your target audience (e.g., `ap-south-1` Mumbai if targeting India).
4. Wait for the project initialization to complete (typically ~1-2 minutes).

---

## 2. Execute the Database Schema & RLS Policies

1. In your Supabase Dashboard, navigate to the **SQL Editor** tab (left sidebar icon `>_`).
2. Click **New query**.
3. Open [`docs/schema.sql`](./schema.sql) from this repository, copy the entire SQL script, and paste it into the editor.
4. Click **Run** (`Ctrl+Enter` or click the green Run button).
5. Verify that all 9 tables are created successfully:
   - `streams`
   - `stream_settings`
   - `businesses`
   - `payments`
   - `support_events`
   - `sponsor_bids`
   - `sponsor_campaigns`
   - `event_queue`
   - `admin_actions`
6. Verify that Row Level Security (RLS) is enabled with appropriate policies:
   - **Public Read Access**: Stream public metadata, verified support events, verified sponsor bids, and active sponsor campaigns are readable by anonymous viewers.
   - **Strict Isolation**: Payments, business contact emails/phones, internal event queue items, and admin audit logs are strictly protected and only accessible by the `service_role`.

---

## 3. Configure Environment Variables

1. In your Supabase Dashboard, go to **Project Settings** (gear icon) -> **API**.
2. Find the following values:
   - **Project URL** (e.g., `https://abcdefghijklm.supabase.co`)
   - **service_role key** (secret key under *Project API keys*)
3. In your local repository, create or update `app/.env.local`:
   ```bash
   # Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_secret_key

   # Set to false to switch from In-Memory fallback to Supabase PostgreSQL
   DEMO_MODE=false
   ```

> [!CAUTION]
> **CRITICAL SECURITY REQUIREMENT**:
> Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser/client-side code or commit it to GitHub. This key bypasses Row Level Security and must be strictly confined to server-side Next.js route handlers and the repository layer.

---

## 4. DEMO_MODE & Offline Fallback Behavior

Digital Beggar is engineered with an intelligent **Repository Factory Pattern**:

```
               ┌──────────────────────────┐
               │    createRepository()    │
               └────────────┬─────────────┘
                            │
          ┌─────────────────┴─────────────────┐
          │                                   │
 Credentials Present &               Credentials Missing OR
   DEMO_MODE=false                       DEMO_MODE=true
          │                                   │
          ▼                                   ▼
┌───────────────────────────┐       ┌───────────────────────────┐
│ SupabaseRepositoryManager │       │ InMemoryRepositoryManager │
│  (Supabase PostgreSQL)    │       │  (Zero-downtime offline)  │
└───────────────────────────┘       └───────────────────────────┘
```

- **Without Credentials**: If `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` are not set, the application automatically uses `InMemoryRepositoryManager`. All test controls (`Ctrl+Shift+D`), animations, and SSE event streaming work out-of-the-box offline.
- **With Credentials**: When configured and `DEMO_MODE=false`, all events, payments, bids, and stream progress are permanently persisted across server restarts.

---

## 5. Verification & Testing

To test the repository layer and event engine:

```bash
cd app
npm test
```

Or run the build test:

```bash
cd app
npm run build
```
