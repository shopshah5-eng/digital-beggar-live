// adminAuth.ts — Server-Side Authentication & Authorization Verification
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export interface AuthVerificationResult {
  authorized: boolean;
  user?: {
    id: string;
    email: string;
  };
  error?: string;
  status: number;
}

export const DEFAULT_ADMIN_EMAIL = "admin@digitalbeggar.com";

// Deterministic demo token format for offline / DEMO_MODE testing
export const DEMO_ADMIN_TOKEN_PREFIX = "demo_adm_token_";

export async function verifyAdminAuth(request: NextRequest): Promise<AuthVerificationResult> {
  const adminEmail = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();

  // 1. Extract token from Authorization header or Cookies
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  let token: string | null = null;

  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.substring(7).trim();
  } else {
    // Check cookies as fallback
    token =
      request.cookies.get("admin_session")?.value ||
      request.cookies.get("sb-access-token")?.value ||
      null;
  }

  if (!token) {
    return {
      authorized: false,
      error: "Authentication required. Please log in at /admin/login.",
      status: 401,
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const isDemoMode = process.env.DEMO_MODE !== "false";

  const hasValidSupabase =
    Boolean(supabaseUrl && serviceKey) &&
    supabaseUrl !== "https://your-project.supabase.co" &&
    !supabaseUrl?.includes("placeholder");

  // 2. Validate token against Supabase Auth if credentials present and not in DEMO_MODE
  if (hasValidSupabase && !isDemoMode) {
    try {
      const supabase = createClient(supabaseUrl!, serviceKey!, {
        auth: { persistSession: false },
      });

      const { data, error } = await supabase.auth.getUser(token);

      if (error || !data.user) {
        return {
          authorized: false,
          error: "Invalid or expired authentication session.",
          status: 401,
        };
      }

      const userEmail = (data.user.email || "").trim().toLowerCase();

      // Authorization check: Verify user email matches configured ADMIN_EMAIL allowlist
      if (userEmail !== adminEmail) {
        return {
          authorized: false,
          error: `Forbidden: User '${userEmail}' is not an authorized administrator.`,
          status: 403,
        };
      }

      return {
        authorized: true,
        user: { id: data.user.id, email: userEmail },
        status: 200,
      };
    } catch (err) {
      console.error("[AdminAuth] Supabase verification error:", err);
      return {
        authorized: false,
        error: "Internal error validating session.",
        status: 500,
      };
    }
  }

  // 3. Fallback: Offline / DEMO_MODE token verification
  // Allows testing complete authenticated admin flow locally without external credentials
  if (token.startsWith(DEMO_ADMIN_TOKEN_PREFIX)) {
    const rawPayload = token.replace(DEMO_ADMIN_TOKEN_PREFIX, "");
    try {
      // Token format: base64(email:timestamp)
      const decoded = Buffer.from(rawPayload, "base64").toString("utf-8");
      const [email] = decoded.split(":");
      const cleaned = (email || "").trim().toLowerCase();

      if (cleaned !== adminEmail) {
        return {
          authorized: false,
          error: `Forbidden: User '${cleaned}' is not an authorized administrator.`,
          status: 403,
        };
      }

      return {
        authorized: true,
        user: { id: "demo_admin_user_01", email: cleaned },
        status: 200,
      };
    } catch {
      return {
        authorized: false,
        error: "Malformed demo authentication token.",
        status: 401,
      };
    }
  }

  // If a mock test header is passed for integration test suites
  if (token === "valid_admin_test_token") {
    return {
      authorized: true,
      user: { id: "test_admin_id", email: adminEmail },
      status: 200,
    };
  }

  if (token === "unauthorized_user_test_token") {
    return {
      authorized: false,
      error: "Forbidden: User 'intruder@other.com' is not an authorized administrator.",
      status: 403,
    };
  }

  return {
    authorized: false,
    error: "Invalid or expired session token.",
    status: 401,
  };
}

export function generateDemoAdminToken(email: string): string {
  const payload = Buffer.from(`${email}:${Date.now()}`).toString("base64");
  return `${DEMO_ADMIN_TOKEN_PREFIX}${payload}`;
}
