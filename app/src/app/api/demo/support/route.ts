import { NextRequest, NextResponse } from "next/server";
import { eventEngine } from "@/lib/engine/eventEngine";
import {
  rateLimiter,
  RATE_LIMITS,
  getClientIp,
  createRateLimitExceededResponse,
} from "@/lib/security/rateLimiter";

export async function POST(request: NextRequest) {
  try {
    // 1. IP-based rate limiting
    const clientIp = getClientIp(request);
    const rateCheck = await rateLimiter.check(
      `support_ip:${clientIp}`,
      RATE_LIMITS.SUPPORT_PER_IP.limit,
      RATE_LIMITS.SUPPORT_PER_IP.windowMs
    );

    if (!rateCheck.allowed) {
      return createRateLimitExceededResponse(rateCheck);
    }

    const body = await request.json();
    const { amount, displayName, providerPaymentId } = body;

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid amount. Must be a positive number." },
        { status: 400 }
      );
    }

    const result = await eventEngine.recordSupport(amount, displayName, providerPaymentId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, state: result.state },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      event: result.event,
      state: result.state,
    });
  } catch (err) {
    console.error("Error in /api/demo/support:", err);
    return NextResponse.json(
      { success: false, error: "Malformed request payload" },
      { status: 400 }
    );
  }
}
