// apiError.ts — Standardized, Safe Public API Error Handler
import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE";

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: ApiErrorCode;
  requestId?: string;
  details?: unknown;
}

const STATUS_CODE_MAP: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

/**
 * Creates standardized public-safe JSON error response.
 * Sanitizes messages to prevent internal database errors or stack traces from reaching client.
 */
export function createApiError(
  message: string,
  code: ApiErrorCode = "BAD_REQUEST",
  options: {
    requestId?: string;
    details?: unknown;
    headers?: Record<string, string>;
  } = {}
): NextResponse<ApiErrorResponse> {
  const status = STATUS_CODE_MAP[code] || 400;

  // Sanitize internal details: never expose internal stack traces, DB connection strings, or filesystem paths
  let safeMessage = message;
  if (
    message.includes("postgresql://") ||
    message.includes("supabase") ||
    message.includes("C:\\") ||
    message.includes("/Users/") ||
    message.includes("at ") ||
    message.includes("node_modules")
  ) {
    safeMessage = "An internal server error occurred. Please try again later.";
  }

  const body: ApiErrorResponse = {
    success: false,
    error: safeMessage,
    code,
    ...(options.requestId ? { requestId: options.requestId } : {}),
    ...(options.details ? { details: options.details } : {}),
  };

  return NextResponse.json(body, {
    status,
    headers: options.headers,
  });
}
