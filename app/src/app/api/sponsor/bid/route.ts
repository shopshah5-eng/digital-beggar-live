import { NextRequest, NextResponse } from "next/server";
import { sponsorService } from "@/lib/sponsor/sponsorService";
import {
  rateLimiter,
  RATE_LIMITS,
  getClientIp,
  createRateLimitExceededResponse,
} from "@/lib/security/rateLimiter";
import { parseAndValidateJson } from "@/lib/security/requestValidator";
import { validateEnvironment } from "@/lib/security/envValidator";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. Financial Safety Flag Check
    const envCheck = validateEnvironment();
    if (envCheck.mode === "razorpay_live" && !envCheck.livePaymentsAllowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Live sponsor transactions are blocked: LIVE_PAYMENT_ENABLED safety flag is disabled.",
        },
        { status: 403 }
      );
    }

    // 2. Rate Limiting per IP
    const clientIp = getClientIp(request);
    const rateCheck = await rateLimiter.check(
      `sponsor_bid_ip:${clientIp}`,
      RATE_LIMITS.SPONSOR_PER_IP.limit,
      RATE_LIMITS.SPONSOR_PER_IP.windowMs
    );

    if (!rateCheck.allowed) {
      return createRateLimitExceededResponse(rateCheck);
    }

    // 3. Request Body Parsing
    const parsed = await parseAndValidateJson<{
      businessName?: string;
      contactEmail?: string;
      website?: string;
      category?: string;
      description?: string;
      bidAmount?: number;
      streamId?: string;
    }>(request);

    if (!parsed.success || !parsed.data) {
      return parsed.response || NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const {
      businessName = "",
      contactEmail = "",
      website,
      category,
      description,
      bidAmount = 0,
      streamId,
    } = parsed.data;

    const result = await sponsorService.createSponsorBid({
      businessName,
      contactEmail,
      website,
      category,
      description,
      bidAmount,
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
      bid: result.bid,
      order: result.order,
    });
  } catch (err: any) {
    console.error("Error in /api/sponsor/bid:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to create sponsor bid." },
      { status: 500 }
    );
  }
}
