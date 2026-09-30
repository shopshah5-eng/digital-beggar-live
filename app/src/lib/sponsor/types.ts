// types.ts — Domain Types & Statuses for Sponsor Crown System

export type BidStatus =
  | "BID_DRAFT"
  | "BID_SUBMITTED"
  | "PAYMENT_PENDING"
  | "PAYMENT_VERIFIED"
  | "BID_ACCEPTED"
  | "BID_REJECTED"
  | "BID_EXPIRED"
  | "REFUND_REQUIRED"
  | "pending"
  | "verified"
  | "rejected"
  | "outbid"
  | "refunded";


export type CampaignStatus = "SPONSOR_ACTIVE" | "SPONSOR_ENDED" | "ADMIN_OVERRIDE";

export interface BusinessRecord {
  id: string;
  name: string;
  contact_email: string;
  website: string;
  category: string;
  description?: string;
  status: "active" | "suspended";
  created_at: string;
  updated_at?: string;
}

export interface SponsorBidRecord {
  id: string;
  business_id: string | null;
  business_name?: string;
  stream_id: string;
  bid_amount?: number;
  bid_amount_paise?: number;
  bid_amount_inr?: number;
  currency: string;
  status: BidStatus;
  payment_id?: string | null;
  provider_order_id?: string;
  provider_payment_id?: string;
  submitted_at?: string;
  verified_at?: string;
  rejected_at?: string;
  rejection_reason?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface SponsorCampaignRecord {
  id: string;
  business_id: string | null;
  bid_id: string;
  stream_id: string;
  sponsor_name: string;
  website: string;
  category: string;
  bid_amount_inr: number;
  status: CampaignStatus;
  started_at: string;
  ended_at?: string | null;
  created_at: string;
}


export interface PublicSponsorInfo {
  isSponsored: true;
  displayName: string;
  verifiedBid: number;
  website: string;
  category: string;
  campaignStartTime: string;
  disclosure: "CURRENT SPONSOR" | "SPONSORED";
}

export interface CreateSponsorBidInput {
  businessName: string;
  contactEmail: string;
  website?: string;
  category?: string;
  description?: string;
  bidAmount: number;
  streamId?: string;
}

export interface SponsorBidResult {
  success: boolean;
  bid?: SponsorBidRecord;
  order?: {
    orderId: string;
    amount?: number;
    amountPaise: number;
    amountInr: number;
    currency: string;
    keyId?: string;
    provider: string;
    purpose?: string;
  };
  error?: string;
}
