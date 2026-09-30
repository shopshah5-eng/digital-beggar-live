import { NextRequest, NextResponse } from "next/server";
import { eventEngine } from "@/lib/engine/eventEngine";
import { verifyDemoOrAdminAccess } from "@/lib/security/modeCheck";

export async function POST(request: NextRequest) {
  try {
    const access = await verifyDemoOrAdminAccess(request);
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const actor = access.adminUser?.email || "demo_controller";
    const state = await eventEngine.pauseStream(actor);
    return NextResponse.json({
      success: true,
      message: `Stream paused (${access.mode}).`,
      state,
    });
  } catch (err) {
    console.error("Error in /api/demo/pause:", err);
    return NextResponse.json(
      { success: false, error: "Failed to pause stream" },
      { status: 500 }
    );
  }
}
