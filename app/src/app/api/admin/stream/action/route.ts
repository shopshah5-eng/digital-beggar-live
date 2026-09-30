import { NextRequest, NextResponse } from "next/server";
import { eventEngine } from "@/lib/engine/eventEngine";
import { EventType } from "@/lib/types/events";
import { verifyAdminAuth } from "@/lib/auth/adminAuth";
import {
  rateLimiter,
  RATE_LIMITS,
  createRateLimitExceededResponse,
} from "@/lib/security/rateLimiter";

export async function POST(request: NextRequest) {
  try {
    // 1. Server-side Authentication & Authorization Verification
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || "Authentication required." },
        { status: auth.status }
      );
    }

    // 2. Rate Limiting for Admin Actions
    const rateKey = `admin_action:${auth.user.id || auth.user.email}`;
    const rateCheck = await rateLimiter.check(
      rateKey,
      RATE_LIMITS.ADMIN_PER_USER.limit,
      RATE_LIMITS.ADMIN_PER_USER.windowMs
    );

    if (!rateCheck.allowed) {
      return createRateLimitExceededResponse(rateCheck);
    }

    const body = await request.json();
    const { action, reactionType, displayName } = body;
    // Always bind actor to verified authenticated identity — never trust client-supplied actor
    const actor = auth.user.email;

    if (!action) {
      return NextResponse.json(
        { success: false, error: "Missing action field." },
        { status: 400 }
      );
    }

    if (action === "pause") {
      const state = await eventEngine.pauseStream(actor);
      return NextResponse.json({ success: true, message: "Stream paused", state });
    }

    if (action === "resume") {
      const state = await eventEngine.resumeStream(actor);
      return NextResponse.json({ success: true, message: "Stream resumed", state });
    }

    if (action === "reset") {
      const state = await eventEngine.resetState(actor);
      return NextResponse.json({ success: true, message: "Stream state reset", state });
    }

    if (action === "emergency_stop_sponsor") {
      const state = await eventEngine.emergencyStopSponsor(actor);
      return NextResponse.json({ success: true, message: "Active sponsor emergency stopped", state });
    }

    if (action === "retry_event") {
      const { eventId } = body;
      if (!eventId) {
        return NextResponse.json(
          { success: false, error: "Missing eventId field." },
          { status: 400 }
        );
      }
      const retryResult = await eventEngine.retryFailedEvent(eventId);
      if (!retryResult.success) {
        return NextResponse.json(
          { success: false, error: retryResult.error },
          { status: 400 }
        );
      }
      return NextResponse.json({ success: true, message: "Event retried successfully", event: retryResult.event });
    }

    if (action === "reaction") {
      if (!reactionType) {
        return NextResponse.json(
          { success: false, error: "Missing reactionType field." },
          { status: 400 }
        );
      }
      const result = await eventEngine.triggerReaction(reactionType as EventType, displayName || `Admin (${actor})`);
      return NextResponse.json({ success: true, event: result.event, state: result.state });
    }

    return NextResponse.json(
      { success: false, error: `Unsupported action: ${action}` },
      { status: 400 }
    );
  } catch (err) {
    console.error("Error in /api/admin/stream/action:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
