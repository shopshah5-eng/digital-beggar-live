// reconciliation.ts — Independent Reconciliation Engine for Financial & Sponsor Ledgers
import { IRepositoryManager } from "../repositories/types";
import { repositoryManager } from "../repositories/factory";
import { DEFAULT_STREAM_ID } from "../repositories/inMemoryRepository";

export interface ReconciliationDiscrepancy {
  id: string;
  type:
    | "PAYMENT_WITHOUT_BID"
    | "BID_WITHOUT_CAMPAIGN"
    | "MULTIPLE_ACTIVE_CAMPAIGNS"
    | "ACTIVE_CAMPAIGN_UNVERIFIED_PAYMENT"
    | "INCONSISTENT_AMOUNT";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  details: Record<string, unknown>;
}

export interface ReconciliationReport {
  timestamp: string;
  streamId: string;
  summary: {
    totalPaymentsChecked: number;
    totalBidsChecked: number;
    totalCampaignsChecked: number;
    discrepancyCount: number;
    status: "HEALTHY" | "DISCREPANCY_FOUND";
  };
  discrepancies: ReconciliationDiscrepancy[];
}

export class ReconciliationEngine {
  constructor(private repo: IRepositoryManager = repositoryManager) {}

  public async runReconciliation(streamId: string = DEFAULT_STREAM_ID): Promise<ReconciliationReport> {
    const discrepancies: ReconciliationDiscrepancy[] = [];

    // Fetch repository records
    const recentPayments = await this.repo.payments.getRecentPayments(streamId, 100);
    const recentBids = await this.repo.sponsors.getRecentBids(streamId, 100);
    const campaignHistory = await this.repo.sponsors.getCampaignHistory(streamId, 100);
    const activeCampaign = await this.repo.sponsors.getActiveCampaign(streamId);

    // 1. Check: Verified SPONSOR_BID payment with no corresponding bid
    const sponsorPayments = recentPayments.filter((p) => p.purpose === "SPONSOR_BID");
    for (const payment of sponsorPayments) {
      if (payment.status === "VERIFIED" || payment.status === "verified") {
        const orderId = payment.provider_order_id || payment.id;
        const matchingBid = recentBids.find(
          (b) => b.payment_id === payment.id || b.provider_order_id === orderId
        );
        if (!matchingBid) {
          discrepancies.push({
            id: `disc_no_bid_${payment.id}`,
            type: "PAYMENT_WITHOUT_BID",
            severity: "HIGH",
            description: `Verified payment ${payment.id} (₹${payment.amount}) has no corresponding sponsor bid record.`,
            details: { paymentId: payment.id, amount: payment.amount, providerOrderId: payment.provider_order_id },
          });
        }
      }
    }

    // 2. Check: BID_ACCEPTED with no campaign
    const acceptedBids = recentBids.filter((b) => b.status === "BID_ACCEPTED");
    for (const bid of acceptedBids) {
      const matchingCampaign = campaignHistory.find((c) => c.bid_id === bid.id);
      if (!matchingCampaign && activeCampaign?.bid_id !== bid.id) {
        discrepancies.push({
          id: `disc_no_camp_${bid.id}`,
          type: "BID_WITHOUT_CAMPAIGN",
          severity: "HIGH",
          description: `Bid ${bid.id} is marked BID_ACCEPTED but has no corresponding campaign record in history or active state.`,
          details: { bidId: bid.id, businessName: bid.business_name, bidAmount: bid.bid_amount },
        });
      }
    }

    // 3. Check: Multiple active campaigns in campaign history
    const allActiveInHistory = campaignHistory.filter((c) => c.status === "SPONSOR_ACTIVE" && !c.ended_at);
    if (allActiveInHistory.length > 1) {
      discrepancies.push({
        id: `disc_multi_active_${Date.now()}`,
        type: "MULTIPLE_ACTIVE_CAMPAIGNS",
        severity: "CRITICAL",
        description: `Found ${allActiveInHistory.length} active campaigns. Exactly one active campaign is permitted.`,
        details: { activeCampaignIds: allActiveInHistory.map((c) => c.id) },
      });
    }

    // 4. Check: Active campaign backed by unverified or missing payment
    if (activeCampaign) {
      if (activeCampaign.status !== "ADMIN_OVERRIDE") {
        const backedBid = recentBids.find((b) => b.id === activeCampaign.bid_id);
        if (!backedBid) {
          discrepancies.push({
            id: `disc_act_no_bid_${activeCampaign.id}`,
            type: "ACTIVE_CAMPAIGN_UNVERIFIED_PAYMENT",
            severity: "CRITICAL",
            description: `Active campaign '${activeCampaign.sponsor_name}' is not backed by any recorded sponsor bid.`,
            details: { campaignId: activeCampaign.id, sponsorName: activeCampaign.sponsor_name },
          });
        } else if (backedBid.payment_id) {
          const backedPayment = await this.repo.payments.getPaymentById(backedBid.payment_id);
          if (!backedPayment || (backedPayment.status !== "VERIFIED" && backedPayment.status !== "verified")) {
            discrepancies.push({
              id: `disc_act_unverified_${activeCampaign.id}`,
              type: "ACTIVE_CAMPAIGN_UNVERIFIED_PAYMENT",
              severity: "CRITICAL",
              description: `Active campaign '${activeCampaign.sponsor_name}' is linked to an unverified payment status: ${backedPayment?.status || "NOT_FOUND"}.`,
              details: { campaignId: activeCampaign.id, paymentStatus: backedPayment?.status },
            });
          }
        }
      }

      // 5. Inconsistent amount check
      const backingBid = recentBids.find((b) => b.id === activeCampaign.bid_id);
      if (backingBid && backingBid.bid_amount !== activeCampaign.bid_amount_inr) {
        discrepancies.push({
          id: `disc_amount_mismatch_${activeCampaign.id}`,
          type: "INCONSISTENT_AMOUNT",
          severity: "MEDIUM",
          description: `Campaign amount (₹${activeCampaign.bid_amount_inr}) does not match backing bid amount (₹${backingBid.bid_amount}).`,
          details: { campaignAmount: activeCampaign.bid_amount_inr, bidAmount: backingBid.bid_amount },
        });
      }
    }

    return {
      timestamp: new Date().toISOString(),
      streamId,
      summary: {
        totalPaymentsChecked: recentPayments.length,
        totalBidsChecked: recentBids.length,
        totalCampaignsChecked: campaignHistory.length + (activeCampaign ? 1 : 0),
        discrepancyCount: discrepancies.length,
        status: discrepancies.length === 0 ? "HEALTHY" : "DISCREPANCY_FOUND",
      },
      discrepancies,
    };
  }
}

export const reconciliationEngine = new ReconciliationEngine();
