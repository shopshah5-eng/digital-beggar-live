import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/auth/adminAuth";
import { sponsorService } from "@/lib/sponsor/sponsorService";
import {
  rateLimiter,
  RATE_LIMITS,
  createRateLimitExceededResponse,
} from "@/lib/security/rateLimiter";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate Admin
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || "Authentication required." },
        { status: auth.status }
      );
    }

    // 2. Rate Limiting for Admin Actions
    const rateCheck = await rateLimiter.check(
      `admin_override:${auth.user.email}`,
      RATE_LIMITS.ADMIN_PER_USER.limit,
      RATE_LIMITS.ADMIN_PER_USER.windowMs
    );
    if (!rateCheck.allowed) {
      return createRateLimitExceededResponse(rateCheck);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Malformed request payload." },
        { status: 400 }
      );
    }

    const { action, streamId, overrideDetails, confirmation } = body;

    // Strict safety check: Requires explicit confirmation
    if (confirmation !== "CONFIRM_EMERGENCY_OVERRIDE") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Emergency Sponsor Override requires explicit confirmation string 'CONFIRM_EMERGENCY_OVERRIDE'.",
        },
        { status: 400 }
      );
    }

    if (action !== "CLEAR_CROWN" && action !== "SET_CROWN") {
      return NextResponse.json(
        { success: false, error: "Action must be either 'CLEAR_CROWN' or 'SET_CROWN'." },
        { status: 400 }
      );
    }

    const result = await sponsorService.emergencyAdminOverride({
      actor: auth.user.email,
      action,
      streamId,
      overrideDetails,
    });

    return NextResponse.json({
      success: true,
      message: result.message,
      state: result.state,
    });
  } catch (err: any) {
    console.error("Error in /api/sponsor/admin/override:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to execute emergency override." },
      { status: 500 }
    );
  }
}
