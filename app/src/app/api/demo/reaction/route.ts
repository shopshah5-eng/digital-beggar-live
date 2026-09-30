import { NextRequest, NextResponse } from "next/server";
import { eventEngine } from "@/lib/engine/eventEngine";
import { EventType } from "@/lib/types/events";
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

    const body = await request.json();
    const { type, displayName } = body;

    const validTypes: EventType[] = [
      "SUPPORT_SMALL",
      "SUPPORT_MEDIUM",
      "SUPPORT_LARGE",
      "THANK_YOU",
      "SHOCK",
      "NEW_SPONSOR",
      "SPONSOR_WIN",
      "SPONSOR_LOST",
      "CELEBRATE",
      "VICTORY",
      "IDLE",
    ];

    if (!type || !validTypes.includes(type as EventType)) {
      return NextResponse.json(
        { success: false, error: `Invalid event type. Supported: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const actor = access.adminUser?.email || "Demo";
    const result = await eventEngine.triggerReaction(type as EventType, displayName || actor);

    return NextResponse.json({
      success: true,
      event: result.event,
      state: result.state,
    });
  } catch (err) {
    console.error("Error in /api/demo/reaction:", err);
    return NextResponse.json(
      { success: false, error: "Malformed request payload" },
      { status: 400 }
    );
  }
}
