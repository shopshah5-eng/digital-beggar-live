# 📺 DIGITAL BEGGAR — OBS LOCAL DRY-RUN PROCEDURE

> ⚠️ **CRITICAL NOTICE:**  
> **THIS IS NOT A YOUTUBE STREAM.**  
> **DO NOT CONNECT YOUTUBE. DO NOT ENTER RTMP CREDENTIALS. DO NOT USE LIVE MONEY.**  
> This procedure is strictly an offline local verification run inside OBS Studio to guarantee scene composition, video scaling, audio mixer routing, event queue handling, and endurance stability before any public broadcast setup.

---

## 📋 PRE-FLIGHT VERIFICATION CHECKLIST

Follow this step-by-step verification protocol sequentially:

### Step 1: Start Next.js Server
Run in terminal:
```bash
cd "c:\Users\Asus\OneDrive\Desktop\digital begger\app"
npm run dev
```
Confirm server listening on `http://localhost:3005`.

### Step 2: Open Broadcast Route in Standard Browser
Open `http://localhost:3005/hud` in Google Chrome or Edge.
* Confirm master background loads cleanly.
* Confirm `01_idle.mp4` loops smoothly without stutter.
* Confirm no horizontal or vertical scrollbars exist.
* Confirm no admin controls, headers, footers, or navigation bars appear.

### Step 3: Open Companion Test Route
Open `http://localhost:3005/hud/test` in a separate browser tab or second monitor.
* Confirm the **OBS Diagnostics Deck** appears with:
  * `UPTIME`
  * `SSE CONNECTION: CONNECTED`
  * `QUEUE SIZE: 0`
  * `VIDEO STATE: READY`
  * `AUDIO STATE: READY`
  * Badges: `DEMO MODE`, `TEST MODE`, `NO REAL PAYMENTS`, `NO YOUTUBE CONNECTION`

### Step 4: Launch OBS Studio
Open OBS Studio (version 32.2.2+).
* **DO NOT** run the auto-configuration wizard for YouTube or streaming.
* Create a fresh profile or scene collection named `DigitalBeggar_DryRun`.

### Step 5: Add Browser Source
In the **Sources** dock:
1. Click the **+** (Add Source) button.
2. Select **Browser**.
3. Name it `DigitalBeggar_HUD`.

### Step 6: Configure Source URL
Set **URL** to:
```text
http://localhost:3005/hud
```

### Step 7: Configure Width
Set **Width** to:
```text
1920
```

### Step 8: Configure Height
Set **Height** to:
```text
1080
```

### Step 9: Verify Custom CSS is Unnecessary
* In the Browser Source properties, the default CSS field can remain blank or default (`body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }`).
* The `/hud` application already enforces strict broadcast margins, hidden overflow, and non-selectable layout natively.
* Check the box: **"Control audio via OBS"** (routes audio directly into OBS Audio Mixer).
* Check the box: **"Reroute audio to OBS"** / **"Shutdown source when not visible"** (Optional: uncheck shutdown if background persistence is desired).

### Step 10: Verify Scene Rendering
Inspect the OBS preview canvas:
* Confirm the 16:9 frame is completely filled with no black borders or letterboxing.
* Verify Top-Left live badge: `DIGITAL BEGGAR LIVE ● LIVE [DEMO]` is within the title-safe area.
* Verify Top-Right viewer counter: `VIEWERS [DEMO] 1,240` is within the title-safe area.
* Verify Bottom-Left goal card, Bottom-Center support ticker, and Bottom-Right sponsor crown card are intact.

### Step 11: Trigger Support Event
On `/hud/test`, click **"₹100 Support"**:
* Verify toast alert pops up: `₹100 SUPPORT!`.
* Verify character switches to `02_happy.mp4` or `03_excited.mp4`.
* Verify speech bubble subtitle displays Hindi gratitude line.
* Verify audio reaches the OBS Audio Mixer meter.

### Step 12: Trigger Sponsor Event
On `/hud/test`, click **"👑 Sponsor Bid"**:
* Verify Crown alert toast displays: `👑 NEW SPONSOR`.
* Verify character switches to `10_sponsor_crown.mp4`.
* Verify speech subtitle updates to sponsor announcement line.
* Verify Bottom-Right sponsor card updates to the new winning business name.

### Step 13: Trigger Multiple Rapid Events
Click **"₹10 Support"**, **"₹100 Support"**, and **"₹500 Blast"** in rapid succession:
* Confirm `/hud/test` Queue Size increments.
* Confirm the system does NOT freeze or crash.

### Step 14: Verify FIFO Reactions
Observe character animation sequence:
* Confirm reactions play strictly sequentially (First-In, First-Out).
* Confirm video elements do not overlap or play simultaneously.

### Step 15: Verify Voice Behavior
* Ensure each voice line corresponds to the active animation.
* Confirm voice lines do not talk over each other (enforced minimum 2000ms cooldown).
* If audio is muted or blocked, confirm animation continues smoothly without halting.

### Step 16: Verify Idle Return
After the queue empties:
* Verify character automatically returns to `01_idle.mp4`.
* Verify idle animation loops seamlessly.

### Step 17: Verify SSE Reconnect
In Developer Tools (or by temporarily stopping and restarting the server):
* Confirm OBS Browser Source automatically reconnects to `/api/events/stream`.
* Confirm stream balances and current sponsor state remain intact.

### Step 18: Verify No Duplicate Events
Check the recent support ticker:
* Confirm identical event IDs are discarded and never trigger duplicate toasts or reactions.

### Step 19: Start Local OBS Recording
* In OBS Studio, click **"Start Recording"** (recording locally to disk, e.g., MP4/MKV).
* **DO NOT CLICK "START STREAMING".**

### Step 20: Record At Least 10 Minutes
Allow OBS to record continuously for 10 minutes while periodically triggering demo events.

### Step 21: Inspect Recorded Video
Stop recording and open the recorded file in VLC or Media Player:
* Confirm 1080p 60fps/30fps smoothness.
* Confirm audio and video are in sync.
* Confirm no visual clipping or artifacting.

### Step 22: Perform 30–60 Minute Endurance Test
Leave `/hud` running continuously in OBS for 30–60 minutes:
* Monitor OBS CPU usage and RAM usage in Task Manager.

### Step 23: Confirm No Visible Memory/UI Degradation
* Verify OBS browser process memory remains stable (bounded event history and queue prevent leaks).
* Verify frame rate remains consistent.

### Step 24: Confirm No Audio/Video Desynchronization
* Trigger a final test reaction at minute 60 and confirm instant, crisp response.

---

## 🛠️ TROUBLESHOOTING GUIDE

| Issue | Cause | Resolution |
| :--- | :--- | :--- |
| **No audio in OBS** | Browser Source audio not routed to mixer | In Browser Source properties, check **"Control audio via OBS"**. In OBS Audio Mixer, verify the `DigitalBeggar_HUD` track is unmuted. |
| **Audio blocked message** | Chromium autoplay restriction | Right-click the Browser Source in OBS and select **Interact**. Click once inside the window to allow audio playback. |
| **Black screen in OBS** | Port mismatch or server offline | Verify `http://localhost:3005/hud` is accessible in Chrome. Ensure Next.js dev server is running. |
| **Video doesn't play** | Missing codecs or asset path error | Verify video files exist in `app/public/ANIMATIONS/`. Check DevTools console on `/hud/test`. |
| **Scrollbars appear** | OBS resolution mismatch | Ensure Browser Source Width is `1920` and Height is `1080`. |
