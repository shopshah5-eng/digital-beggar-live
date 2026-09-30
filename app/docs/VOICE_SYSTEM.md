# DIGITAL BEGGAR — AI VOICE & REACTION ORCHESTRATION SYSTEM

**Document Version:** 1.0.0 (Phase 5)  
**Status:** IMPLEMENTED & TESTED  
**Scope:** Character Persona, Multi-Vendor TTS Abstraction, Template Anti-Repetition, Priority Queueing, Audio Cache, Safety Guardrails.

---

## 1. VOICE ARCHITECTURE OVERVIEW

The Digital Beggar Voice & Reaction System brings the fictional stream personality to life by orchestrating audio commentary in lockstep with video animation triggers and HUD alerts.

```
Incoming Stream Event (Support / Sponsor / System)
                      ↓
           Reaction Service Orchestrator
           ├── Video Animation Trigger (Immediate)
           └── Voice Service (Non-Blocking)
                      ↓
            Response Generator
            ├── Sanitize User Tokens (name, amount, business)
            ├── Anti-Repetition Memory (Exclude last 5 lines)
            └── Curated Template Interpolation
                      ↓
               Voice Queue
            ├── Priority Sorting (CRITICAL > HIGH > NORMAL > LOW)
            ├── Cooldown Enforcement (Min 2s gap between voice lines)
            └── Overflow Eviction (Drops lowest-priority idle first)
                      ↓
            Resolved Voice Provider
            ├── DemoVoiceProvider (Local simulated timing, 0 API cost)
            └── ExternalTtsProvider (ElevenLabs / OpenAI / GCP TTS)
```

---

## 2. FICTIONAL CHARACTER PERSONALITY

- **Character Name:** Digital Beggar
- **Fictional Disclaimer:** Purely an entertainment persona. The character **never** claims actual homelessness, poverty, physical distress, or emergency relief. No guilt tactics or manipulative begging are permitted.
- **Traits:** Funny, dramatic, self-aware, chaotic, deeply grateful, playful, non-abusive.
- **Language & Tone:** Primarily snappy **Hinglish**, dynamic, meme-aware, respectful, and timed for livestream viewers.

### Curated Response Categories & Templates
1. **`SUPPORT_SMALL` (₹10–₹49):**
   - *"Arre wah! ₹{amount} aa gaya! Thank you {name} bhai!"*
   - *"Chai aur parle-G pakki! Dhanyawad {name} ji!"*
   - *"₹{amount}! Seedha account mein! Respect to {name}!"*
2. **`SUPPORT_MEDIUM` (₹50–₹499):**
   - *"Arre wah re wah! ₹{amount} ka support! {name} is on fire!"*
   - *"Aaj shaam ka nashta sorted! Thank you so much {name}!"*
   - *"₹{amount}! Ab ban raha hai na live stream ka mahaul!"*
3. **`SUPPORT_LARGE` (₹500+):**
   - *"WHAT?! ₹{amount}?! Bhai sahab, aankhon pe yakeen nahi ho raha!"*
   - *"HOLY MOLLY! {name} ne system hila diya! ₹{amount} ka blast!"*
   - *"Yeh toh ultra legend moment hai! ₹{amount} from {name}!"*
4. **`NEW_SPONSOR`:**
   - *"NEW SPONSOR UNLOCKED! Swagat kijiye {businessName} ka!"*
   - *"Boss ne takeover kar liya! {businessName} is the new Crown holder!"*
5. **`SPONSOR_WIN`:**
   - *"SPONSOR VICTORY! {businessName} defends the throne with ₹{bidAmount}!"*
6. **`SPONSOR_LOST`:**
   - *"Crown has changed hands! Respect to previous champion!"*
7. **`NO_SUPPORT` (Crickets / Peaceful Stream):**
   - *"Okay... audience is currently in stealth ninja mode."*
   - *"Bohot shaanti hai... crickets are winning the match today."*
8. **`IDLE` (Periodic Chatter every 2–5 min):**
   - *"Life update: still 100% digital, 0% physical."*
   - *"Crown checking in 3, 2, 1... looking shiny as ever."*
   - *"Digital Beggar reporting for duty! Livestream engine is running smooth."*

---

## 3. PROVIDER ABSTRACTION (`IVoiceProvider`)

The platform implements vendor neutrality via `IVoiceProvider`:

```typescript
export interface IVoiceProvider {
  readonly name: string;
  generateSpeech(request: SpeechRequest): Promise<SpeechResult>;
  cancelSpeech(speechId: string): Promise<boolean>;
  getStatus(): Promise<VoiceProviderStatus>;
}
```

### Configured Modes:
- **`VOICE_MODE=demo` (Default):** Uses `DemoVoiceProvider`. Simulates speech generation, realistic word-count durations, and zero network calls or billing costs.
- **`VOICE_MODE=tts`:** Uses `ExternalTtsProvider`. Integrates server-side with ElevenLabs, OpenAI Audio Speech, or Google Cloud TTS using environment variables `TTS_PROVIDER`, `TTS_API_KEY`, and `TTS_VOICE_ID`.

> [!SECURITY]
> TTS credentials are strictly server-side. Zero API keys or vendor tokens are ever exposed to the client or browser bundles.

---

## 4. PRIORITY QUEUEING & OVERFLOW MANAGEMENT

To prevent audio overlapping and race conditions, all voice requests flow through a priority queue (`VoiceQueue`):

| Priority | Event Types | Weight | Eviction Rule |
| :--- | :--- | :--- | :--- |
| **CRITICAL** | `SPONSOR_WIN`, `VICTORY`, `SUPPORT_LARGE` | 4 | **Never evicted.** |
| **HIGH** | `NEW_SPONSOR`, `SPONSOR_LOST`, `SUPPORT_MEDIUM` | 3 | Evicted only if queue saturated by CRITICAL. |
| **NORMAL** | `SUPPORT_SMALL`, `THANK_YOU`, `CELEBRATE`, `SHOCK` | 2 | Evicted before HIGH or CRITICAL. |
| **LOW** | `IDLE`, `NO_SUPPORT` | 1 | **Evicted first** upon queue overflow. |

### Queue Safeguards:
- **Sequential Playback:** Only one voice line plays at a time.
- **Queue Ceiling:** Maximum 10 queued items.
- **Cooldown Gap:** Enforces a minimum 2-second pause between consecutive speech lines.
- **Decoupled Failure:** If voice generation fails or times out, the queue logs the error, advances immediately, and **never interrupts or rolls back the parent financial transaction**.

---

## 5. SPEECH SAFETY & RESTRICTIONS

1. **No Arbitrary User Voice Output:** Viewers cannot submit text to be directly read aloud by the TTS engine. All dynamic parameters (`displayName`, `businessName`, `amount`) are strictly sanitized (HTML stripped, length clamped) and placed into curated templates.
2. **Sponsor Script Restriction:** Sponsors cannot submit promotional copy or arbitrary scripts for the character to speak. Only the verified business name, category, and bid amount are interpolated.
3. **Mute Switch:** Admins can instantly mute the voice service via `POST /api/admin/voice/action` (`action: "mute"`). When muted, video animations and HUD alerts continue playing while speech generation is skipped.

---

## 6. PRODUCTION TTS DEPLOYMENT REQUIREMENTS

Before enabling `VOICE_MODE=tts` in live production:
1. Provision ElevenLabs or OpenAI TTS account with dedicated voice ID.
2. Configure `TTS_API_KEY` in vaulted environment storage.
3. Enable edge CDN audio caching or local Redis caching for recurring templates.
4. Verify audio playback latency under high stream traffic.
