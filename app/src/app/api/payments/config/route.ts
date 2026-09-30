import { NextResponse } from "next/server";
import { getPaymentMode } from "@/lib/payments/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  const mode = getPaymentMode();
  const publicTestKey =
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
    process.env.RAZORPAY_KEY_ID ||
    (mode === "demo" ? "rzp_test_demo_public" : "");

  return NextResponse.json({
    success: true,
    mode,
    paymentMode: mode,
    provider: mode === "demo" ? "demo" : "razorpay",
    isLive: mode === "razorpay_live",
    keyId: publicTestKey,
  });
}
