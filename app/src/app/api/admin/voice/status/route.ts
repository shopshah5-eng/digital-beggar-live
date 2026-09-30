// route.ts — Admin Voice Status Inspection Endpoint
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/auth/adminAuth";
import { voiceService } from "@/lib/voice/voiceService";
import {
  rateLimiter,
  RATE_LIMITS,
  createRateLimitExceededResponse,
} from "@/lib/security/rateLimiter";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || "Authentication required." },
        { status: auth.status }
      );
    }

    const rateKey = `admin_voice_status:${auth.user.email}`;
    const rateCheck = await rateLimiter.check(
      rateKey,
      RATE_LIMITS.ADMIN_PER_USER.limit,
      RATE_LIMITS.ADMIN_PER_USER.windowMs
    );
    if (!rateCheck.allowed) {
      return createRateLimitExceededResponse(rateCheck);
    }

    const status = voiceService.getStatus();

    return NextResponse.json({
      success: true,
      status,
      voice: {
        isVoiceMuted: status.isMuted,
        isSpeaking: status.isSpeaking,
        provider: status.provider,
        queueLength: status.queueLength,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Error in /api/admin/voice/status:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching voice status." },
      { status: 500 }
    );
  }
}
