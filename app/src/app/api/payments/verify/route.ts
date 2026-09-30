import { NextRequest, NextResponse } from "next/server";
import { paymentService } from "@/lib/payments/paymentService";
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
      `payment_verify_ip:${clientIp}`,
      RATE_LIMITS.SUPPORT_PER_IP.limit,
      RATE_LIMITS.SUPPORT_PER_IP.windowMs
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

    const result = await paymentService.verifySupportPayment({
      orderId,
      paymentId,
      signature,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      idempotent: result.idempotent,
      payment: {
        id: result.payment?.id,
        amount: result.payment?.amount,
        currency: result.payment?.currency,
        status: result.payment?.status,
        displayName: result.payment?.payer_name,
        verifiedAt: result.payment?.verified_at,
      },
    });
  } catch (err: any) {
    console.error("Error in /api/payments/verify:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to verify payment." },
      { status: 500 }
    );
  }
}
