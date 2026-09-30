// route.ts — Admin Reconciliation Report Endpoint
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/auth/adminAuth";
import { reconciliationEngine } from "@/lib/sponsor/reconciliation";
import {
  rateLimiter,
  RATE_LIMITS,
  createRateLimitExceededResponse,
} from "@/lib/security/rateLimiter";
import { DEFAULT_STREAM_ID } from "@/lib/repositories/inMemoryRepository";

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

    const rateCheck = await rateLimiter.check(
      `admin_recon:${auth.user.email}`,
      RATE_LIMITS.ADMIN_PER_USER.limit,
      RATE_LIMITS.ADMIN_PER_USER.windowMs
    );
    if (!rateCheck.allowed) {
      return createRateLimitExceededResponse(rateCheck);
    }

    const { searchParams } = new URL(request.url);
    const streamId = searchParams.get("streamId") || DEFAULT_STREAM_ID;

    const report = await reconciliationEngine.runReconciliation(streamId);

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err: any) {
    console.error("Error in GET /api/admin/reconciliation:", err);
    return NextResponse.json(
      { success: false, error: "Failed to generate reconciliation report." },
      { status: 500 }
    );
  }
}
