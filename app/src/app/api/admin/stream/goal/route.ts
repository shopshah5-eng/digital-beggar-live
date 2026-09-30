import { NextRequest, NextResponse } from "next/server";
import { eventEngine } from "@/lib/engine/eventEngine";
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
    const rateKey = `admin_goal:${auth.user.id || auth.user.email}`;
    const rateCheck = await rateLimiter.check(
      rateKey,
      RATE_LIMITS.ADMIN_PER_USER.limit,
      RATE_LIMITS.ADMIN_PER_USER.windowMs
    );

    if (!rateCheck.allowed) {
      return createRateLimitExceededResponse(rateCheck);
    }

    const body = await request.json();
    const { goalAmount } = body;
    // Always bind actor to verified authenticated identity — never trust client-supplied actor
    const actor = auth.user.email;

    if (!goalAmount || typeof goalAmount !== "number" || goalAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "Goal amount must be a positive number." },
        { status: 400 }
      );
    }

    const state = await eventEngine.setGoalAmount(goalAmount, actor);

    return NextResponse.json({
      success: true,
      message: `Stream goal updated to ₹${goalAmount.toLocaleString()}`,
      state,
    });
  } catch (err) {
    console.error("Error in /api/admin/stream/goal:", err);
    return NextResponse.json(
      { success: false, error: "Failed to update stream goal" },
      { status: 500 }
    );
  }
}
