# 🏛️ Digital Beggar Live — Architecture Specification

## 1. System Overview

Digital Beggar is an interactive, real-time virtual livestream engine built for broadcast via OBS Studio. The architecture decouples **payment processing**, **business logic/state management**, and **visual display**:

```text
[ Payment Source / Demo Simulator ]
                │
                ▼
      [ Payment Provider ]
   (DemoProvider / Cashfree / Razorpay)
                │
                ▼
     [ Payment Verification ]
                │
                ▼
       [ Event Engine ] ──────────────► [ State Store / Supabase ]
                │
                ▼
   [ Server-Sent Events (SSE) ]
        (/api/events/stream)
                │
                ▼
     [ Frontend Event Queue ]
                │
                ▼
  [ Animation Mapper & HUD Player ] ──► [ OBS Studio 1080p Canvas ]
```

---

## 2. Core Components

### A. Payment Provider Layer (`/lib/payments`)
- Defines standard `PaymentProvider` interface:
  - `createPayment(request: PaymentRequest): Promise<PaymentResult>`
  - `verifyPayment(verification: PaymentVerificationRequest): Promise<PaymentResult>`
  - `getPaymentStatus(paymentId: string): Promise<PaymentResult>`
- `DemoPaymentProvider`:
  - Enforces positive amounts and simulated verified status.
  - Generates signed transaction tokens without connecting external gateways.

### B. Event Engine (`/lib/engine/eventEngine.ts`)
- Centralized event ingestion and stream state authority.
- Maintains in-memory single-source-of-truth:
  - `raisedAmount`, `goalAmount`
  - `currentSponsor`, `currentSponsorBid`, `minimumNextBid`
  - `recentSupport`
  - `status` (`active` | `paused` | `offline`)
- Dispatches realtime `BroadcastMessage` instances to active SSE subscribers.

### C. Realtime Transport (`/api/events/stream`)
- Implements standard HTTP **Server-Sent Events (SSE)**.
- Transmits immediate events (`STREAM_EVENT`, `STATE_UPDATE`, `STATE_RESET`) and periodic keepalive pulses.
- Native reconnection and browser compatibility.

### D. Frontend Sequential Reaction Queue (`/lib/hooks/useStreamRealtime.ts`)
- Manages strict serial execution:
  - Rapid bursts of donations/sponsors are queued.
  - Reaction $N$ plays $\rightarrow$ ends $\rightarrow$ Reaction $N+1$ plays $\rightarrow$ returns to `idle.mp4` when empty.
  - Zero overlapping animations.

### E. Sponsor Crown & Business Bidding Subsystem (`/lib/sponsor`)
- Manages the Single Crown invariant and business bidding auctions:
  - Centralized auction arithmetic: minimum opening bid ₹500, fixed increments (+₹500 per bid), maximum ₹10,00,000.
  - Server-side verification gate with double Crown qualification re-check upon payment confirmation.
  - Concurrency protection: Atomic repository activation ensures only one winning bid becomes `SPONSOR_ACTIVE`, marking concurrent losing bids as `REFUND_REQUIRED`.
  - Comprehensive disclosure and sanitization enforcing zero arbitrary HTML or executable scripts.

### F. AI Voice & Character Personality Layer (`/lib/voice` & `/lib/reactions`)
- Character Personality profile: Fictional entertainment avatar speaking Hinglish, humorous, dramatic, never claiming distress or real begging.
- Multi-provider abstraction (`IVoiceProvider`):
  - `DemoVoiceProvider`: Zero-cost simulated speech duration for local testing.
  - `ExternalTtsProvider`: Server-side integration with ElevenLabs/OpenAI/GCP TTS, protected behind server-only secrets.
- Response Generation & Anti-Repetition:
  - Curated template response bank across 12 event types.
  - 5-item circular buffer history preventing consecutive identical lines.
  - Strict token sanitization (`{name}`, `{amount}`, `{businessName}`, `{bidAmount}`). User messages or sponsor descriptions are never read aloud.
- Priority Voice Queue:
  - Strict serial playback: one voice response at a time, zero overlapping audio.
  - Priority-weighted scheduling (`CRITICAL > HIGH > NORMAL > LOW`).
  - Cooldown enforcement (min 2s gap) and drop-policy discarding low-priority idle speech when full (max 10 items).
  - Decoupled from financial transactions: Voice failures or timeouts never fail financial events.


