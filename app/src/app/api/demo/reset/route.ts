import { NextRequest, NextResponse } from "next/server";
import { eventEngine } from "@/lib/engine/eventEngine";
import { verifyDemoOrAdminAccess } from "@/lib/security/modeCheck";

export async function POST(request: NextRequest) {
  try {
    // Restrict demo controls: only allowed in DEMO_MODE or if caller is an authorized Admin
    const access = await verifyDemoOrAdminAccess(request);
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const actor = access.adminUser?.email || "demo_controller";
    const state = await eventEngine.resetState(actor);
    return NextResponse.json({
      success: true,
      message: `Stream state reset to initial demo values (${access.mode}).`,
      state,
    });
  } catch (err) {
    console.error("Error in /api/demo/reset:", err);
    return NextResponse.json(
      { success: false, error: "Failed to reset state" },
      { status: 500 }
    );
  }
}
