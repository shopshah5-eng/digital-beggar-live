# 💻 Digital Beggar — Development & Operations Guide

## 1. Local Development

1. Navigate to the `app` directory:
   ```powershell
   cd "c:\Users\Asus\OneDrive\Desktop\digital begger\app"
   ```

2. Start the development server on port 3005:
   ```powershell
   npm run dev -- --port 3005
   ```

3. Open the livestream overlay in your browser:
   [http://localhost:3005](http://localhost:3005)

---

## 2. Testing Controls (Simulator)

- **Toggle Shortcut**: <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd>
- Buttons call the live backend REST endpoints:
  - `POST /api/demo/support` (`{ amount: 10 | 100 | 500, displayName: "..." }`)
  - `POST /api/demo/sponsor` (`{ businessName: "...", bidAmount: 5000 }`)
  - `POST /api/demo/reaction` (`{ type: "SHOCK" | "THANK_YOU" | ... }`)
  - `POST /api/demo/reset`

---

## 3. Environment Modes (`DEMO_MODE`)

- When `DEMO_MODE=true` (Default):
  - Uses `DemoPaymentProvider`
  - In-memory event engine state
  - `DEMO` badge displayed on stream
  - Test controls accessible via <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>

- When `DEMO_MODE=false`:
  - Enforces verified production gateway signatures
  - Connects to Supabase PostgreSQL database
  - Disables client simulator actions
