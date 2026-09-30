import { NextRequest, NextResponse } from "next/server";
import { paymentService } from "@/lib/payments/paymentService";
import {
  rateLimiter,
  RATE_LIMITS,
  getClientIp,
  createRateLimitExceededResponse,
} from "@/lib/security/rateLimiter";
import { parseAndValidateJson, validateNumberRange } from "@/lib/security/requestValidator";
import { sanitizeUserInput } from "@/lib/security/sanitizer";
import { validateEnvironment } from "@/lib/security/envValidator";

export async function POST(request: NextRequest) {
  try {
    // 1. Financial Safety Flag Check
    const envCheck = validateEnvironment();
    if (envCheck.mode === "razorpay_live" && !envCheck.livePaymentsAllowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Live payment operations are blocked: LIVE_PAYMENT_ENABLED safety flag is disabled.",
        },
        { status: 403 }
      );
    }

    // 2. IP-based rate limiting
    const clientIp = getClientIp(request);
    const rateCheck = await rateLimiter.check(
      `order_create_ip:${clientIp}`,
      RATE_LIMITS.SUPPORT_PER_IP.limit,
      RATE_LIMITS.SUPPORT_PER_IP.windowMs
    );

    if (!rateCheck.allowed) {
      return createRateLimitExceededResponse(rateCheck);
    }

    // 3. Request validation
    const parsed = await parseAndValidateJson<{
      amount?: number;
      displayName?: string;
      message?: string;
      streamId?: string;
    }>(request);

    if (!parsed.success || !parsed.data) {
      return parsed.response || NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const { amount, displayName, message, streamId } = parsed.data;

    // Sanitize user inputs
    const cleanName = sanitizeUserInput(displayName || "Anonymous Supporter", { maxLength: 50 });
    const cleanMsg = sanitizeUserInput(message || "", { maxLength: 200, allowMultiline: false });

    const result = await paymentService.createSupportOrder({
      amount: amount as number,
      displayName: cleanName || "Anonymous Supporter",
      message: cleanMsg,
      streamId,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      order: result.order,
    });
  } catch (err: any) {
    console.error("Error in /api/payments/create-order:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to create payment order." },
      { status: 500 }
    );
  }
}
