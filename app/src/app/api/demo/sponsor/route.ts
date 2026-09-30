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
      `sponsor_ip:${clientIp}`,
      RATE_LIMITS.SPONSOR_PER_IP.limit,
      RATE_LIMITS.SPONSOR_PER_IP.windowMs
    );

    if (!rateCheck.allowed) {
      return createRateLimitExceededResponse(rateCheck);
    }

    const body = await request.json();
    const { businessName, bidAmount, providerPaymentId } = body;

    if (!businessName || typeof businessName !== "string" || !businessName.trim()) {
      return NextResponse.json(
        { success: false, error: "businessName is required and cannot be empty." },
        { status: 400 }
      );
    }

    if (!bidAmount || typeof bidAmount !== "number" || bidAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "bidAmount must be a positive number." },
        { status: 400 }
      );
    }

    const result = await eventEngine.processSponsorBid(businessName, bidAmount, providerPaymentId);

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
    console.error("Error in /api/demo/sponsor:", err);
    return NextResponse.json(
      { success: false, error: "Malformed request payload" },
      { status: 400 }
    );
  }
}
