import { NextResponse } from "next/server";
import { repositoryManager } from "@/lib/repositories/factory";

export async function GET() {
  const isReady = repositoryManager !== null;
  const paymentMode = process.env.PAYMENT_MODE || "demo";
  const livePaymentEnabled = process.env.LIVE_PAYMENT_ENABLED === "true";

  return NextResponse.json(
    {
      status: isReady ? "ok" : "degraded",
      application: "digital-beggar",
      version: "1.0.0",
      paymentMode,
      livePaymentEnabled,
      database: isReady ? "connected" : "unavailable",
      repository: repositoryManager.name,
      persistentStorage: repositoryManager.isPersistent,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    },
    {
      status: isReady ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
