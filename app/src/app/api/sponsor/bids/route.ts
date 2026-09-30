import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/auth/adminAuth";
import { repositoryManager } from "@/lib/repositories/factory";
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

    const { searchParams } = new URL(request.url);
    const streamId = searchParams.get("streamId") || DEFAULT_STREAM_ID;

    const bids = await repositoryManager.sponsors.getRecentBids(streamId, 30);
    const activeCampaign = await repositoryManager.sponsors.getActiveCampaign(streamId);
    const history = await repositoryManager.sponsors.getCampaignHistory(streamId, 20);

    return NextResponse.json({
      success: true,
      activeCampaign,
      bids,
      campaignHistory: history,
    });
  } catch (err: any) {
    console.error("Error in GET /api/sponsor/bids:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch sponsor bids." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.authorized || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || "Authentication required." },
        { status: auth.status }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Malformed request payload." },
        { status: 400 }
      );
    }

    const { action, bidId, reason, streamId = DEFAULT_STREAM_ID } = body;
    const actor = auth.user.email;

    if (action === "reject_bid") {
      if (!bidId) {
        return NextResponse.json(
          { success: false, error: "Missing bidId field." },
          { status: 400 }
        );
      }

      const updatedBid = await repositoryManager.sponsors.updateBidStatus(
        bidId,
        "BID_REJECTED",
        reason || "Rejected by administrator"
      );

      await repositoryManager.admin.logAction({
        stream_id: streamId,
        action_type: "BID_REJECTED",
        actor,
        details: {
          bidId,
          reason: reason || "Rejected by administrator",
          timestamp: new Date().toISOString(),
        },
      });

      return NextResponse.json({
        success: true,
        message: `Bid ${bidId} marked as rejected.`,
        bid: updatedBid,
      });
    }

    if (action === "end_sponsor") {
      await repositoryManager.sponsors.endActiveCampaign(streamId);
      await repositoryManager.streams.updateSponsor(streamId, "", 0, 500);

      await repositoryManager.admin.logAction({
        stream_id: streamId,
        action_type: "SPONSOR_ENDED",
        actor,
        details: {
          streamId,
          timestamp: new Date().toISOString(),
          reason: reason || "Ended by administrator",
        },
      });

      return NextResponse.json({
        success: true,
        message: "Active sponsor campaign ended successfully.",
      });
    }

    return NextResponse.json(
      { success: false, error: `Unsupported action: ${action}` },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("Error in POST /api/sponsor/bids:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process sponsor bid action." },
      { status: 500 }
    );
  }
}

