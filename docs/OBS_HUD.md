# DIGITAL BEGGAR — OBS HUD & BROADCAST SCENE INTEGRATION GUIDE

**Document Version:** 1.0.0 (Phase 6)  
**Status:** IMPLEMENTED & VERIFIED  
**Canvas Target:** 1920 × 1080 (16:9 Aspect Ratio)  
**Route:** `/hud` (Clean Broadcast Overlay) | `/hud/test` (Developer Simulation Deck)

---

## 1. OVERVIEW

The Digital Beggar OBS HUD (`/hud`) is a dedicated presentation layer engineered exclusively to be embedded as an **OBS Studio Browser Source**. 

It presents a high-definition 16:9 virtual livestream scene composed of:
1. **Master Livestream Room Background** (`/MASTER/livestream_background.png`)
2. **Character Animation Video Loop** (Smooth seamless looping of `01_idle.mp4` with event-driven dynamic reactions `02_happy.mp4` to `13_victory.mp4`)
3. **Character Voice Dialogue Subtitle Bubble** (Displays real-time Hinglish reactions synchronized with character speech)
4. **Live Broadcast HUD Overlay**:
   - **Top Left:** `DIGITAL BEGGAR LIVE` with pulsating red `● LIVE` badge and `DEMO` indicator
   - **Top Right:** Real-time viewer count with explicit `DEMO` badge (powered by `DemoViewerCountProvider`)
   - **Bottom Left:** Real-time Support Goal card (`₹raised / ₹goal`, percentage, glowing gradient progress bar)
   - **Bottom Center:** Recent verified supporter ticker (`{name} • ₹{amount}`) with pulse animations
   - **Bottom Right:** Sponsor Crown card (`CURRENT SPONSOR`, `SPONSORED`, verified bid, minimum next bid)
   - **Top Center:** Animated notification toasts for new support and Crown takeovers

---

## 2. OBS STUDIO BROWSER SOURCE CONFIGURATION

### Recommended Settings in OBS Studio

1. In OBS Studio, under **Sources**, click **+** and select **Browser Source**.
2. Name the source: `Digital Beggar HUD`.
3. Configure the following parameters:
   - **URL:** `http://localhost:3005/hud` *(or your production domain `https://your-domain.com/hud`)*
   - **Width:** `1920`
   - **Height:** `1080`
   - **FPS:** `60` *(or `30` depending on your broadcast profile)*
   - **Control audio via OBS:** `[x] CHECKED` *(Allows routing character voice audio into OBS Audio Mixer)*
   - **Shutdown source when not visible:** `[x] CHECKED` *(Conserves CPU/GPU memory when switching scenes)*
   - **Refresh browser when scene becomes active:** `[x] CHECKED`

### Custom CSS in OBS (Optional)
The page is pre-styled with a pure black background and transparent glass panels. If chroma keying or specific margin adjustments are needed:
```css
body {
  background-color: rgba(0, 0, 0, 0) !important;
  margin: 0px auto;
  overflow: hidden;
}
```

---

## 3. RESPONSIVE SCALING & CANVAS INVARIANTS

The broadcast canvas is fixed to a native 16:9 ratio and automatically scales across standard broadcast resolutions without distorting the character or room perspective:

| Resolution | Scale Factor | Use Case |
| :--- | :--- | :--- |
| **1920 × 1080** | 1.0× (Native) | Full HD 1080p Broadcasts (Default) |
| **1280 × 720** | 0.667× | HD 720p Low-Bandwidth Streaming |
| **854 × 480** | 0.444× | SD 480p Mobile Previews |

The video element and background utilize `object-cover object-center` within a fixed `aspect-video max-w-[1920px] max-h-[1080px]` viewport, ensuring the character, goal bar, and sponsor card remain locked in position.

---

## 4. AUDIO ARCHITECTURE & AUTOPLAY

In browser environments, audio autoplay policies can block unprompted audio playback. In OBS Studio Browser Source:
- OBS executes an internal Chromium runtime where audio is routed directly to the OBS Audio Mixer when **Control audio via OBS** is checked.
- `/hud` initializes video elements unmuted (`isMuted=false`) and attaches passive interaction listeners (`pointerdown`, `keydown`) so regular browser previews automatically unlock audio upon first interaction.
- The voice subtitle overlay (`"Arre wah! ₹50 aa gaya!"`) ensures deaf/muted viewers can always read the character's reactions even if audio is silenced.

---

## 5. SSE CONNECTION & RECONNECT RESILIENCE

The HUD maintains a single persistent **Server-Sent Events (SSE)** connection to `/api/events/stream`:
1. **Heartbeat:** Server transmits periodic keepalive comments to prevent firewall timeouts.
2. **Auto-Reconnect:** If the local network drops or the Next.js server restarts, the HUD automatically re-polls every 3 seconds.
3. **State Resynchronization:** Upon reconnecting, the HUD immediately queries `GET /api/stream/state` to synchronize:
   - Latest campaign raised amount and goal
   - Current active sponsor and verified bid
   - Most recent supporter
   - Character voice and speaking status
4. **Idempotent Queueing:** The HUD tracks processed event IDs (`processedEventIdsRef`) using a circular buffer (last 50 IDs) to guarantee that reconnects never trigger duplicate reaction alerts or replay historical financial events.

---

## 6. MEMORY & RUNTIME SAFETY FOR 24/7 BROADCASTS

Because livestream scenes run continuously for days or weeks without restarts, `/hud` enforces strict memory safeguards:
- **Bounded Animation Queue:** Reaction queue is capped at 15 items maximum, evicting oldest non-critical events during burst donation spikes.
- **Single SSE Instance:** Strict cleanup on unmount ensures orphaned EventSource listeners are never leaked.
- **Viewer Polling Cleanup:** Timers for simulated viewer counts and toast dismissals are cleaned up on unmount.
- **Zero DOM Inflation:** Notifications and toasts are auto-dismissed after 4.2 seconds; video elements are reused rather than recreated.

---

## 7. TRANSPARENCY & LEGAL COMPLIANCE LABELS

To prevent viewer deception during testing and development:
- **Simulated Viewers:** Labeled with an explicit badge: `VIEWERS DEMO`.
- **Demo Mode:** When `PAYMENT_MODE=demo`, a prominent `DEMO` badge is displayed next to `DIGITAL BEGGAR LIVE`.
- **Test Payments:** When `PAYMENT_MODE=razorpay_test`, displayed state clarifies that test sandbox tokens are in use.
- **Sponsor Disclosure:** Every sponsor card prominently displays `SPONSORED` and `CURRENT SPONSOR`. If no active sponsor exists, it displays `CROWN AVAILABLE` with the opening minimum bid (`₹500`).

---

## 8. DEVELOPER TEST COMPANION: `/hud/test`

For developer verification without OBS:
- Navigate to: `http://localhost:3005/hud/test`
- Provides an overlaid developer simulation panel allowing instantaneous triggering of:
  - ₹10 Support (`02_happy.mp4`)
  - ₹100 Support (`03_excited.mp4`)
  - ₹500 Blast (`04_shock.mp4`)
  - Crown Sponsor Bidding (`10_sponsor_crown.mp4`)
  - Milestone Reactions (`09_dance.mp4`, `13_victory.mp4`)
- **Safety Restriction:** `/hud/test` interacts solely with `/api/demo/*` endpoints and is inaccessible or inert in production live environments.

---

## 9. TROUBLESHOOTING

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| Black screen in OBS | URL incorrect or server not running | Verify `http://localhost:3005/hud` is accessible in Chrome. |
| No sound in OBS | Audio not routed | In OBS source properties, check **Control audio via OBS**, then verify the audio slider in OBS Audio Mixer. |
| Video character frozen | Video autoplay blocked | Right click source in OBS $\rightarrow$ **Interact** $\rightarrow$ click once on canvas to unlock. |
| Outdated sponsor or goal | SSE disconnected | Right click source $\rightarrow$ **Refresh** or let auto-reconnect trigger within 3s. |
