// route.ts — Admin Voice Controls (Mute, Unmute, Test, Clear Queue)
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/auth/adminAuth";
import { eventEngine } from "@/lib/engine/eventEngine";
import {
  rateLimiter,
  RATE_LIMITS,
  createRateLimitExceededResponse,
} from "@/lib/security/rateLimiter";
import { parseAndValidateJson, validateString } from "@/lib/security/requestValidator";

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate & Authorize Admin
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || "Authentication required." },
        { status: auth.status }
      );
    }

    // 2. Rate limit admin actions
    const rateKey = `admin_voice_action:${auth.user.email}`;
    const rateCheck = await rateLimiter.check(
      rateKey,
      RATE_LIMITS.ADMIN_PER_USER.limit,
      RATE_LIMITS.ADMIN_PER_USER.windowMs
    );
    if (!rateCheck.allowed) {
      return createRateLimitExceededResponse(rateCheck);
    }

    // 3. Parse request payload
    const parsed = await parseAndValidateJson<{
      action?: string;
      category?: string;
      text?: string;
    }>(request);

    if (!parsed.success || !parsed.data) {
      return parsed.response || NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const { action, category, text } = parsed.data;
    const actor = auth.user.email;

    if (!action) {
      return NextResponse.json(
        { success: false, error: "Missing required 'action' field." },
        { status: 400 }
      );
    }

    switch (action) {
      case "mute": {
        const state = await eventEngine.muteVoice(actor);
        return NextResponse.json({ success: true, message: "Voice muted", state });
      }

      case "unmute": {
        const state = await eventEngine.unmuteVoice(actor);
        return NextResponse.json({ success: true, message: "Voice unmuted", state });
      }

      case "test": {
        const cat = category || "IDLE";
        const result = await eventEngine.testVoice(text, cat, actor);
        return NextResponse.json({ success: true, message: "Voice test enqueued", text: result.text });
      }

      case "clear_queue": {
        await eventEngine.clearVoiceQueue(actor);
        return NextResponse.json({ success: true, message: "Voice queue cleared" });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unsupported action: '${action}'. Supported: mute, unmute, test, clear_queue.` },
          { status: 400 }
        );
    }
  } catch (err: any) {
    console.error("Error in /api/admin/voice/action:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error processing voice action." },
      { status: 500 }
    );
  }
}
