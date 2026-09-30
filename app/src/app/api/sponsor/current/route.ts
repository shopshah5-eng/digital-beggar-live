import { NextResponse } from "next/server";
import { sponsorService } from "@/lib/sponsor/sponsorService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await sponsorService.getPublicSponsorState();
    return NextResponse.json({
      success: true,
      currentSponsor: data.currentSponsor,
      minimumNextBid: data.minimumNextBid,
      streamStatus: data.streamStatus,
    });
  } catch (err: any) {
    console.error("Error in /api/sponsor/current:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch current sponsor state." },
      { status: 500 }
    );
  }
}
