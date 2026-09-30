// requestValidator.ts — Reusable Server-Side Request Validation Utilities
import { NextRequest, NextResponse } from "next/server";

export interface ParsedJsonResult<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  response?: NextResponse;
}

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64 KB default limit

/**
 * Validates Content-Type header and parses JSON body safely.
 * Returns standard 400 Bad Request on malformed JSON or oversized payload.
 */
export async function parseAndValidateJson<T = Record<string, unknown>>(
  request: NextRequest,
  options: {
    maxBytes?: number;
    requiredContentType?: string;
  } = {}
): Promise<ParsedJsonResult<T>> {
  const maxBytes = options.maxBytes ?? MAX_PAYLOAD_BYTES;
  const expectedType = options.requiredContentType ?? "application/json";

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes(expectedType)) {
    return {
      success: false,
      error: `Invalid Content-Type. Expected '${expectedType}'.`,
      response: NextResponse.json(
        {
          success: false,
          error: `Invalid Content-Type header. Must be '${expectedType}'.`,
        },
        { status: 415 }
      ),
    };
  }

  // Check content length header if present
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    return {
      success: false,
      error: `Payload exceeds maximum permitted size of ${maxBytes} bytes.`,
      response: NextResponse.json(
        {
          success: false,
          error: `Payload Too Large. Maximum allowed size is ${maxBytes} bytes.`,
        },
        { status: 413 }
      ),
    };
  }

  let rawText = "";
  try {
    rawText = await request.text();
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to read request body: ${err?.message || "Unknown error"}`,
      response: NextResponse.json(
        { success: false, error: "Failed to read request body." },
        { status: 400 }
      ),
    };
  }

  if (Buffer.byteLength(rawText, "utf8") > maxBytes) {
    return {
      success: false,
      error: `Payload size exceeds limit (${maxBytes} bytes).`,
      response: NextResponse.json(
        { success: false, error: "Payload Too Large." },
        { status: 413 }
      ),
    };
  }

  if (!rawText.trim()) {
    return {
      success: false,
      error: "Request body cannot be empty.",
      response: NextResponse.json(
        { success: false, error: "Empty request payload." },
        { status: 400 }
      ),
    };
  }

  try {
    const data = JSON.parse(rawText) as T;
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return {
        success: false,
        error: "JSON root payload must be an object.",
        response: NextResponse.json(
          { success: false, error: "Malformed payload. JSON body must be an object." },
          { status: 400 }
        ),
      };
    }
    return { success: true, data };
  } catch (err: any) {
    return {
      success: false,
      error: `Malformed JSON: ${err?.message || "Syntax error"}`,
      response: NextResponse.json(
        { success: false, error: "Malformed JSON payload. Please provide valid JSON." },
        { status: 400 }
      ),
    };
  }
}

/**
 * Validates that string field exists and conforms to length constraints.
 */
export function validateString(
  val: unknown,
  fieldName: string,
  min: number = 1,
  max: number = 255
): { valid: boolean; value: string; error?: string } {
  if (typeof val !== "string") {
    return { valid: false, value: "", error: `Field '${fieldName}' must be a string.` };
  }
  const trimmed = val.trim();
  if (trimmed.length < min) {
    return { valid: false, value: "", error: `Field '${fieldName}' must have at least ${min} characters.` };
  }
  if (trimmed.length > max) {
    return { valid: false, value: "", error: `Field '${fieldName}' cannot exceed ${max} characters.` };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validates numeric range and finite status.
 */
export function validateNumberRange(
  val: unknown,
  fieldName: string,
  min: number,
  max: number
): { valid: boolean; value: number; error?: string } {
  if (typeof val !== "number" || !Number.isFinite(val) || Number.isNaN(val)) {
    return { valid: false, value: 0, error: `Field '${fieldName}' must be a valid finite number.` };
  }
  if (val < min) {
    return { valid: false, value: val, error: `Field '${fieldName}' cannot be less than ${min}.` };
  }
  if (val > max) {
    return { valid: false, value: val, error: `Field '${fieldName}' cannot exceed ${max}.` };
  }
  return { valid: true, value: val };
}
