// rules.ts — Centralized Auction & Bidding Rules for Sponsor Crown System

export const SPONSOR_AUCTION_RULES = {
  OPENING_MINIMUM_BID_INR: 500, // ₹500
  FIXED_INCREMENT_INR: 500,     // ₹500 fixed step (NOT percentage-based)
  MAXIMUM_BID_INR: 1000000,     // ₹10,00,000 (10 Lakh INR)
  CURRENCY: "INR",
} as const;

/**
 * Calculates the authoritative minimum next bid in INR.
 * Centralized rule:
 * - If no active sponsor: minimum opening bid = ₹500
 * - If there is an active sponsor: minimum next bid = current_verified_bid + ₹500
 */
export function calculateMinimumNextBid(currentVerifiedBidInr: number | null | undefined): number {
  if (!currentVerifiedBidInr || currentVerifiedBidInr <= 0) {
    return SPONSOR_AUCTION_RULES.OPENING_MINIMUM_BID_INR;
  }
  return currentVerifiedBidInr + SPONSOR_AUCTION_RULES.FIXED_INCREMENT_INR;
}

/**
 * Sanitizes plain text input by stripping all HTML tags, script markers, and malicious characters.
 * Prevents XSS, iframe injection, and malformed content.
 */
export function sanitizeText(input: unknown, maxLength: number = 100): string {
  if (typeof input !== "string") return "";
  let clean = input
    .replace(/<[^>]*>/g, "") // Strip HTML tags
    .replace(/javascript:/gi, "")
    .replace(/data:/gi, "")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  return clean.slice(0, maxLength);
}

/**
 * Validates a website URL.
 * Only allows valid http: or https: schemes (prefers https:). Rejects javascript:, data:, etc.
 */
export function validateWebsiteUrl(urlStr: unknown): { valid: boolean; normalized?: string; error?: string } {
  if (!urlStr || typeof urlStr !== "string") {
    return { valid: true, normalized: "" }; // Optional field
  }
  const clean = urlStr.trim();
  if (!clean) {
    return { valid: true, normalized: "" };
  }

  // Prepend https:// if protocol was omitted
  const toTest = clean.match(/^https?:\/\//i) ? clean : `https://${clean}`;

  try {
    const parsed = new URL(toTest);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, error: "Website URL must use HTTP or HTTPS protocol." };
    }
    // Block local / private loopbacks in production
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      // Allow during local development
    }
    return { valid: true, normalized: parsed.href };
  } catch {
    return { valid: false, error: "Invalid website URL format." };
  }
}

/**
 * Validates an email address.
 */
export function validateEmail(email: unknown): boolean {
  if (!email || typeof email !== "string") return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim().toLowerCase()) && email.length <= 120;
}

/**
 * Validates a sponsor bid amount.
 * - Must be a finite number.
 * - Must meet or exceed minimum bid.
 * - Must not exceed maximum bid.
 * - Must have integer paise precision (no fractional paise).
 */
export function validateSponsorBidAmount(
  amountInr: unknown,
  currentVerifiedBidInr: number | null | undefined
): {
  valid: boolean;
  amountInr: number;
  amountPaise: number;
  minimumRequiredInr: number;
  error?: string;
} {
  const minRequired = calculateMinimumNextBid(currentVerifiedBidInr);

  if (typeof amountInr !== "number" || !Number.isFinite(amountInr) || Number.isNaN(amountInr)) {
    return {
      valid: false,
      amountInr: 0,
      amountPaise: 0,
      minimumRequiredInr: minRequired,
      error: "Bid amount must be a valid finite number.",
    };
  }

  if (amountInr < minRequired) {
    return {
      valid: false,
      amountInr,
      amountPaise: 0,
      minimumRequiredInr: minRequired,
      error: `Bid of ₹${amountInr.toLocaleString()} rejected. Minimum required bid is ₹${minRequired.toLocaleString()}.`,
    };
  }

  if (amountInr > SPONSOR_AUCTION_RULES.MAXIMUM_BID_INR) {
    return {
      valid: false,
      amountInr,
      amountPaise: 0,
      minimumRequiredInr: minRequired,
      error: `Bid amount cannot exceed maximum permitted of ₹${SPONSOR_AUCTION_RULES.MAXIMUM_BID_INR.toLocaleString()}.`,
    };
  }

  // Paise check
  const roundedPaise = Math.round(amountInr * 100);
  const reconstructedInr = roundedPaise / 100;
  if (Math.abs(amountInr - reconstructedInr) > 0.0001) {
    return {
      valid: false,
      amountInr,
      amountPaise: 0,
      minimumRequiredInr: minRequired,
      error: "Bid amount has invalid decimal precision (fractions of paise rejected).",
    };
  }

  return {
    valid: true,
    amountInr: reconstructedInr,
    amountPaise: roundedPaise,
    minimumRequiredInr: minRequired,
  };
}
