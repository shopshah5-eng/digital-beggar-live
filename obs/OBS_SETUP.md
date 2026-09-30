# 🎥 OBS Studio Browser Source Setup Guide

Follow these steps to capture the **Digital Beggar Live** prototype directly in OBS Studio.

---

## 1. Prerequisites
Ensure the Next.js development server is running locally:
```powershell
cd "c:\Users\Asus\OneDrive\Desktop\digital begger\app"
npm run dev -- --port 3005
```
Verify that the URL [http://localhost:3005](http://localhost:3005) is accessible in your browser.

---

## 2. Add Browser Source in OBS

1. Open **OBS Studio**.
2. In the **Sources** dock at the bottom, click the **`+`** (Add) icon.
3. Select **Browser** from the menu.
4. Name the source (e.g., `Digital Beggar Live Overlay`) and click **OK**.
5. Configure the properties dialog with the following settings:
   - **URL**: `http://localhost:3005`
   - **Width**: `1920`
   - **Height**: `1080`
   - **FPS**: `30` (or `60`)
   - **Custom CSS**: *(leave blank or default)*
   - **Shutdown source when not visible**: ☑ Checked (saves CPU/GPU when scene is inactive)
   - **Refresh browser when scene becomes active**: ☑ Checked
   - **Control audio via OBS**: ☑ Checked (allows you to mix the character audio inside OBS mixer)
6. Click **OK**.

---

## 3. Interactive Developer Simulator Controls

- **Toggle Shortcut**: Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> inside the browser window. (The on-screen toggle button is completely removed to keep the OBS stream 100% clean).
- **Control Panel Actions**:
  - `[₹10 Support]`: Adds ₹10 to today's demo goal, plays `02_happy.mp4`, and shows `₹10 SUPPORT RECEIVED ❤️`.
  - `[₹100 Support]`: Adds ₹100 to today's demo goal, plays `03_excited.mp4`, and shows `₹100 SUPPORT RECEIVED 🔥`.
  - `[₹500 Support]`: Adds ₹500 to today's demo goal, plays `04_shock.mp4`, and shows `₹500 SUPPORT RECEIVED 😱`.
  - `[Thank You]`: Plays gratitude animation with gratitude toast.
  - `[Shock]`: Triggers shock reaction.
  - `[New Sponsor]`: Changes sponsor to *Demo Business*, sets bid to ₹5,000, triggers `10_sponsor_crown.mp4`, and displays `NEW SPONSOR 👑`.
  - **Animation Library**: Direct triggers for all 15 clips (`01_idle` through `15_sleepy`).
  - **Mute / Unmute**: Toggle video sound stream.
  - **Reset**: Restores numbers and cards back to defaults.
