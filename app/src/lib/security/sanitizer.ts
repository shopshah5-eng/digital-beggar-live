// sanitizer.ts — Strict Allowlist-Based Input Sanitizer for Digital Beggar
export interface SanitizeOptions {
  allowMultiline?: boolean;
  maxLength?: number;
}

/**
 * Sanitizes user-provided text inputs using strict allowlist and stripping approaches:
 * - Strips all HTML tags (<...>)
 * - Neutralizes dangerous script/iframe/data/javascript patterns
 * - Strips control characters and CRLF (log/header injection prevention) unless allowMultiline is enabled
 */
export function sanitizeUserInput(input: unknown, options: SanitizeOptions = {}): string {
  if (input === null || input === undefined) {
    return "";
  }

  let text = String(input);

  // 1. Remove dangerous zero-width and control characters (except standard spaces/tabs/newlines)
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, "");

  // 2. Prevent CRLF log/header injection if single-line expected
  if (!options.allowMultiline) {
    text = text.replace(/[\r\n]+/g, " ");
  }

  // 3. Strip HTML tags completely
  text = text.replace(/<[^>]*>/g, "");

  // 4. Strip dangerous pseudo-protocols even if outside tags (e.g. javascript:, data:, vbscript:)
  text = text.replace(/(?:javascript|data|vbscript)\s*:/gi, "");

  // 5. Trim whitespace and enforce length
  text = text.trim();
  if (options.maxLength && options.maxLength > 0 && text.length > options.maxLength) {
    text = text.substring(0, options.maxLength).trim();
  }

  return text;
}

/**
 * Validates a website URL against strict HTTP/HTTPS protocol allowlist.
 * Explicitly rejects javascript:, data:, vbscript:, file:, ftp:, etc.
 */
export function sanitizeAndValidateUrl(urlStr: unknown): { valid: boolean; url?: string; error?: string } {
  if (!urlStr || typeof urlStr !== "string") {
    return { valid: true, url: "" };
  }

  const raw = urlStr.trim();
  if (!raw) {
    return { valid: true, url: "" };
  }

  // Explicit dangerous schemes check
  if (/^(javascript|data|vbscript|file|about):/i.test(raw)) {
    return { valid: false, error: "Dangerous URL protocol rejected. Only HTTP/HTTPS allowed." };
  }

  const toTest = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(toTest);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, error: "Invalid protocol. Only HTTP and HTTPS are permitted." };
    }
    return { valid: true, url: parsed.href };
  } catch {
    return { valid: false, error: "Invalid website URL format." };
  }
}
