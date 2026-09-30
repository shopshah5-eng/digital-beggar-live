import { NextRequest, NextResponse } from "next/server";
import { eventEngine } from "@/lib/engine/eventEngine";
import { verifyAdminAuth } from "@/lib/auth/adminAuth";
import {
  rateLimiter,
  RATE_LIMITS,
  createRateLimitExceededResponse,
} from "@/lib/security/rateLimiter";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // 1. Server-side Authentication & Authorization Verification
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || "Authentication required." },
        { status: auth.status }
      );
    }

    // 2. Rate Limiting for Admin Requests
    const rateKey = `admin_overview:${auth.user.id || auth.user.email}`;
    const rateCheck = await rateLimiter.check(
      rateKey,
      RATE_LIMITS.ADMIN_PER_USER.limit,
      RATE_LIMITS.ADMIN_PER_USER.windowMs
    );

    if (!rateCheck.allowed) {
      return createRateLimitExceededResponse(rateCheck);
    }

    // 3. Retrieve and return privileged administrative overview
    const overview = await eventEngine.getAdminOverview();
    return NextResponse.json({
      success: true,
      data: overview,
    });
  } catch (err) {
    console.error("Error in /api/admin/overview:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch admin overview" },
      { status: 500 }
    );
  }
}
