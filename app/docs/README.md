# 🌟 Digital Beggar Live — Prototype v1

Interactive livestream character prototype for entertainment streaming, designed for seamless capture via OBS Studio.

---

## 📁 Project Structure

```text
digital begger/
├── MASTER/
│   └── livestream_background.png          # High-resolution 1080p master room background
│
├── ANIMATIONS/                            # 15 Standardized Numbered Video Assets (1080p, 16:9)
│   ├── 01_idle.mp4
│   ├── 02_happy.mp4
│   ├── 03_excited.mp4
│   ├── 04_shock.mp4
│   ├── 05_celebrate.mp4
│   ├── 06_thank_you.mp4
│   ├── 07_no_support.mp4
│   ├── 08_funny_cry.mp4
│   ├── 09_dance.mp4
│   ├── 10_sponsor_crown.mp4
│   ├── 11_sponsor_win.mp4
│   ├── 12_sponsor_lost.mp4
│   ├── 13_victory.mp4
│   ├── 14_look_around.mp4
│   └── 15_sleepy.mp4
│
├── assets/
│   ├── background/
│   │   └── digital-beggar-room.png        # 16:9 room background
│   └── animations/                        # Named video reactions for app player
│
├── app/                                   # Next.js 16 + React + Tailwind CSS Web Application
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                   # Livestream scene orchestrator & keyboard handler
│   │   │   ├── layout.tsx                 # Dark mode root layout & metadata
│   │   │   └── globals.css                # OBS-optimized glassmorphic styling
│   │   └── components/
│   │       ├── LivestreamScene.tsx        # 16:9 Livestream HUD & video engine
│   │       └── DevControlPanel.tsx        # Slide-out developer simulator panel
│   └── public/                            # Static assets served by Next.js
│
├── obs/
│   └── OBS_SETUP.md                       # Full OBS Studio browser source guide
└── docs/
    └── README.md
```

---

## 🚀 Running the Prototype Locally

1. Open PowerShell or Terminal and navigate to `app`:
   ```powershell
   cd "c:\Users\Asus\OneDrive\Desktop\digital begger\app"
   ```

2. Start the development server on port 3005:
   ```powershell
   npm run dev -- --port 3005
   ```

3. Open your browser:
   [http://localhost:3005](http://localhost:3005)

4. Test Developer Controls:
   - Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> or click the subtle **Dev Controls** badge in the top right.
   - Click `[₹10 Support]`, `[₹100 Support]`, `[₹500 Support]`, or `[New Sponsor]`.
