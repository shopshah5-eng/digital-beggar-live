import { NextRequest, NextResponse } from "next/server";
import { sponsorService } from "@/lib/sponsor/sponsorService";
import {
  rateLimiter,
  RATE_LIMITS,
  getClientIp,
  createRateLimitExceededResponse,
} from "@/lib/security/rateLimiter";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = await rateLimiter.check(
      `sponsor_verify_ip:${clientIp}`,
      RATE_LIMITS.SPONSOR_PER_IP.limit,
      RATE_LIMITS.SPONSOR_PER_IP.windowMs
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

    const { orderId, paymentId, signature } = body;

    const result = await sponsorService.verifySponsorPayment({
      orderId,
      paymentId,
      signature,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, status: result.status },
        { status: result.httpStatus }
      );
    }

    return NextResponse.json({
      success: true,
      crownWon: result.crownWon,
      status: result.status,
      reason: result.reason,
      currentMinimumBid: result.currentMinimumBid,
      bid: result.bid,
      campaign: result.campaign,
    });
  } catch (err: any) {
    console.error("Error in /api/sponsor/verify:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to verify sponsor payment." },
      { status: 500 }
    );
  }
}
