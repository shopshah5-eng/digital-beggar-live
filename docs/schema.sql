-- ==============================================================================
-- DIGITAL BEGGAR — SUPABASE / POSTGRESQL PRODUCTION & DEMO SCHEMA
-- Phase 4: Persistent Stream State, Repositories, and Event Engine
-- ==============================================================================

-- Enable UUID extension if not already available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. Streams Table
-- Stores current state of livestream: raised total, goal, sponsor, demo_mode.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS streams (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL DEFAULT 'Digital Beggar Live',
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'offline')),
  goal_amount NUMERIC(14, 2) NOT NULL DEFAULT 100000.00,
  raised_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  current_sponsor_id VARCHAR(64),
  current_sponsor_name VARCHAR(255),
  current_sponsor_bid NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  minimum_next_bid NUMERIC(14, 2) NOT NULL DEFAULT 500.00,
  demo_mode BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_streams_status ON streams(status);

-- ------------------------------------------------------------------------------
-- 2. Stream Settings Table
-- Stream-level configuration and thresholds.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stream_settings (
  stream_id VARCHAR(64) PRIMARY KEY REFERENCES streams(id) ON DELETE CASCADE,
  minimum_support_amount NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
  minimum_initial_sponsor_bid NUMERIC(10, 2) NOT NULL DEFAULT 500.00,
  sponsor_bid_increment_percent INT NOT NULL DEFAULT 10,
  auto_fallback_to_idle BOOLEAN NOT NULL DEFAULT true,
  obs_resolution_width INT NOT NULL DEFAULT 1920,
  obs_resolution_height INT NOT NULL DEFAULT 1080,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. Businesses Table
-- Registered businesses/advertisers bidding for stream sponsorship.
-- Private contact info must never be exposed on public stream.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS businesses (
  id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  website VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_businesses_name ON businesses(business_name);
CREATE INDEX IF NOT EXISTS idx_businesses_status ON businesses(status);

-- ------------------------------------------------------------------------------
-- 4. Payments Table (Provider-Independent)
-- Tracks all payment attempts, status, and verification.
-- Idempotency enforced via provider_payment_id UNIQUE constraint.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  stream_id VARCHAR(64) NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL, -- demo, razorpay, cashfree, upi
  provider_payment_id VARCHAR(255) NOT NULL UNIQUE,
  amount NUMERIC(14, 2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('support', 'sponsor_bid')),
  status VARCHAR(32) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pending', 'verified', 'failed', 'refunded')),
  payer_name VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider_id ON payments(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_stream ON payments(stream_id);

-- ------------------------------------------------------------------------------
-- 5. Support Events Table
-- Persists verified supporter contributions that trigger character reactions.
-- Only 'verified' events count toward stream raised_amount.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_events (
  id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  stream_id VARCHAR(64) NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  payment_id VARCHAR(64) REFERENCES payments(id) ON DELETE SET NULL,
  amount NUMERIC(14, 2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  display_name VARCHAR(255) NOT NULL DEFAULT 'Anonymous',
  event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('SUPPORT_SMALL', 'SUPPORT_MEDIUM', 'SUPPORT_LARGE')),
  status VARCHAR(32) NOT NULL DEFAULT 'verified' CHECK (status IN ('pending', 'verified', 'rejected', 'refunded')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_events_stream ON support_events(stream_id);
CREATE INDEX IF NOT EXISTS idx_support_events_status ON support_events(status);
CREATE INDEX IF NOT EXISTS idx_support_events_created ON support_events(created_at DESC);

-- ------------------------------------------------------------------------------
-- 6. Sponsor Bids Table
-- Tracks every sponsor bidding attempt. Only verified bids can crown a sponsor.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sponsor_bids (
  id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  stream_id VARCHAR(64) NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  business_id VARCHAR(64) REFERENCES businesses(id) ON DELETE SET NULL,
  campaign_id VARCHAR(64),
  business_name VARCHAR(255) NOT NULL,
  bid_amount NUMERIC(14, 2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  payment_id VARCHAR(64) REFERENCES payments(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'outbid', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sponsor_bids_stream ON sponsor_bids(stream_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_bids_status ON sponsor_bids(status);
CREATE INDEX IF NOT EXISTS idx_sponsor_bids_created ON sponsor_bids(created_at DESC);

-- ------------------------------------------------------------------------------
-- 7. Sponsor Campaigns Table
-- Sanitized sponsor display configurations (strictly no raw HTML/JS injection).
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sponsor_campaigns (
  id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id VARCHAR(64) REFERENCES businesses(id) ON DELETE SET NULL,
  stream_id VARCHAR(64) NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  sponsor_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  website_url TEXT,
  creative_config JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sponsor_campaigns_status ON sponsor_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_sponsor_campaigns_stream ON sponsor_campaigns(stream_id);

-- ------------------------------------------------------------------------------
-- 8. Event Queue Table
-- Queue of animation/audio reaction events waiting to be dispatched & rendered.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_queue (
  id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  stream_id VARCHAR(64) NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_event_queue_status_prio ON event_queue(stream_id, status, priority DESC, created_at ASC);

-- ------------------------------------------------------------------------------
-- 9. Admin Actions Table
-- Audit logging for administrative actions (reset, pause, manual triggers).
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_actions (
  id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  stream_id VARCHAR(64) NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  action_type VARCHAR(64) NOT NULL, -- reset, pause, resume, manual_reaction
  actor VARCHAR(255) NOT NULL DEFAULT 'admin',
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_stream ON admin_actions(stream_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- DEFAULT SEED DATA
-- Default development stream for immediate local & OBS usage
-- ------------------------------------------------------------------------------
INSERT INTO streams (
  id,
  name,
  status,
  goal_amount,
  raised_amount,
  current_sponsor_id,
  current_sponsor_name,
  current_sponsor_bid,
  minimum_next_bid,
  demo_mode
) VALUES (
  'stream_default_main',
  'Digital Beggar Live',
  'active',
  100000.00,
  0.00,
  NULL,
  NULL,
  0.00,
  500.00,
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO stream_settings (
  stream_id,
  minimum_support_amount,
  minimum_initial_sponsor_bid,
  sponsor_bid_increment_percent,
  auto_fallback_to_idle,
  obs_resolution_width,
  obs_resolution_height
) VALUES (
  'stream_default_main',
  10.00,
  500.00,
  10,
  true,
  1920,
  1080
) ON CONFLICT (stream_id) DO NOTHING;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Ensures public safe access for stream viewers & strict isolation for private data.
-- ==============================================================================

-- 1. Streams: Public can read stream public info; only service role can write.
ALTER TABLE streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to streams"
  ON streams FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow service role full access to streams"
  ON streams FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Stream Settings: Public can read settings.
ALTER TABLE stream_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to stream_settings"
  ON stream_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow service role full access to stream_settings"
  ON stream_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Support Events: Public can read verified support events for HUD display.
ALTER TABLE support_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to verified support events"
  ON support_events FOR SELECT
  TO anon, authenticated
  USING (status = 'verified');

CREATE POLICY "Allow service role full access to support events"
  ON support_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Payments: Private! Strictly NO public access. Service role only.
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to payments"
  ON payments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. Businesses: Private business and contact information. Service role only.
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to businesses"
  ON businesses FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. Sponsor Bids: Public can see verified bids for transparency; private bids hidden.
ALTER TABLE sponsor_bids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to verified sponsor bids"
  ON sponsor_bids FOR SELECT
  TO anon, authenticated
  USING (status = 'verified');

CREATE POLICY "Allow service role full access to sponsor bids"
  ON sponsor_bids FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 7. Sponsor Campaigns: Public can read active sanitized campaigns.
ALTER TABLE sponsor_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to active sponsor campaigns"
  ON sponsor_campaigns FOR SELECT
  TO anon, authenticated
  USING (status = 'active');

CREATE POLICY "Allow service role full access to sponsor campaigns"
  ON sponsor_campaigns FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 8. Event Queue: Internal engine work queue. Service role only.
ALTER TABLE event_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to event_queue"
  ON event_queue FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 9. Admin Actions: Internal audit logs. Service role only.
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access to admin_actions"
  ON admin_actions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
