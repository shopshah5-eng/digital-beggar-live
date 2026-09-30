import { NextRequest, NextResponse } from "next/server";
import { paymentService } from "@/lib/payments/paymentService";
import {
  rateLimiter,
  RATE_LIMITS,
  getClientIp,
  createRateLimitExceededResponse,
} from "@/lib/security/rateLimiter";
import { logger } from "@/lib/logging/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. Webhook Rate Limiting
    const clientIp = getClientIp(request);
    const rateCheck = await rateLimiter.check(
      `webhook_ip:${clientIp}`,
      RATE_LIMITS.WEBHOOK_PER_IP.limit,
      RATE_LIMITS.WEBHOOK_PER_IP.windowMs
    );

    if (!rateCheck.allowed) {
      logger.warn("Webhook rate limit exceeded", { route: "/api/webhooks/razorpay", actor: clientIp });
      return createRateLimitExceededResponse(rateCheck);
    }

    // 2. Read RAW request body (vital: do not parse before signature check)
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");

    if (!rawBody) {
      return NextResponse.json(
        { success: false, error: "Empty webhook payload." },
        { status: 400 }
      );
    }

    // 3. Delegate to paymentService for HMAC-SHA256 signature verification & idempotent processing
    const result = await paymentService.handleRazorpayWebhook(rawBody, signature);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      event: result.event,
      idempotent: result.idempotent,
    });
  } catch (err: any) {
    console.error("Error processing Razorpay webhook:", err);
    return NextResponse.json(
      { success: false, error: "Internal error processing webhook." },
      { status: 500 }
    );
  }
}
