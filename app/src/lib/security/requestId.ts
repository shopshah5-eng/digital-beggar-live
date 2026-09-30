// requestId.ts — Request Correlation ID Helper
import { NextRequest } from "next/server";
import crypto from "node:crypto";

export function getOrCreateRequestId(request: NextRequest): string {
  const existing = request.headers.get("x-request-id") || request.headers.get("x-correlation-id");
  if (existing && existing.length < 100) {
    // Sanitize to alphanumeric + hyphens/underscores
    return existing.replace(/[^a-zA-Z0-9-_]/g, "");
  }
  return `req_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}
