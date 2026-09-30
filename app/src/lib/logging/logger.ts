// logger.ts — Structured JSON Logger with Sensitive Data Masking
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  route?: string;
  actor?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "secret",
  "key_secret",
  "webhook_secret",
  "razorpay_key_secret",
  "razorpay_webhook_secret",
  "authorization",
  "cookie",
  "token",
  "access_token",
  "refresh_token",
  "pin",
  "otp",
  "cvv",
  "pan",
]);

/**
 * Deeply traverses an object or array to mask confidential keys and patterns.
 */
export function maskSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    // Mask potential card numbers (13-19 digits)
    return data.replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{1,7}\b/g, "****-****-****-****");
  }

  if (Array.isArray(data)) {
    return data.map(maskSensitiveData);
  }

  if (typeof data === "object") {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      let isSensitive = false;
      for (const sensitive of SENSITIVE_KEYS) {
        if (lower.includes(sensitive)) {
          isSensitive = true;
          break;
        }
      }

      if (isSensitive) {
        masked[key] = "[REDACTED]";
      } else {
        masked[key] = maskSensitiveData(value);
      }
    }
    return masked;
  }

  return data;
}

export class StructuredLogger {
  private format(entry: LogEntry): string {
    const safeEntry = {
      ...entry,
      metadata: entry.metadata ? (maskSensitiveData(entry.metadata) as Record<string, unknown>) : undefined,
    };
    return JSON.stringify(safeEntry);
  }

  info(message: string, context: Partial<Omit<LogEntry, "timestamp" | "level" | "message">> = {}): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      message,
      ...context,
    };
    console.log(this.format(entry));
  }

  warn(message: string, context: Partial<Omit<LogEntry, "timestamp" | "level" | "message">> = {}): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "warn",
      message,
      ...context,
    };
    console.warn(this.format(entry));
  }

  error(message: string, context: Partial<Omit<LogEntry, "timestamp" | "level" | "message">> = {}): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "error",
      message,
      ...context,
    };
    console.error(this.format(entry));
  }

  debug(message: string, context: Partial<Omit<LogEntry, "timestamp" | "level" | "message">> = {}): void {
    if (process.env.NODE_ENV !== "production") {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: "debug",
        message,
        ...context,
      };
      console.debug(this.format(entry));
    }
  }
}

export const logger = new StructuredLogger();
