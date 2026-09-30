// modeCheck.ts — Environment & Control Mode Boundaries for Digital Beggar
import { NextRequest } from "next/server";
import { verifyAdminAuth } from "../auth/adminAuth";

export type AppMode = "DEMO_MODE" | "ADMIN_MODE" | "PRODUCTION_MODE";

export function isDemoMode(): boolean {
  // If explicitly set to false, demo mode is disabled
  if (process.env.DEMO_MODE === "false") {
    return false;
  }
  // If in production environment and DEMO_MODE isn't explicitly 'true', disable demo mode
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true") {
    return false;
  }
  return true;
}

export function getCurrentMode(): AppMode {
  return isDemoMode() ? "DEMO_MODE" : "PRODUCTION_MODE";
}

export interface DemoAccessResult {
  allowed: boolean;
  mode: AppMode;
  status: number;
  error?: string;
  adminUser?: { id: string; email: string };
}

/**
 * Gatekeeper for demo-specific actions (demo reset, demo pause, demo resume, manual reactions).
 * In DEMO_MODE: Permitted for local development & demonstration.
 * In PRODUCTION_MODE: Strictly blocked for public callers; only permitted if caller is an authorized Admin.
 */
export async function verifyDemoOrAdminAccess(request: NextRequest): Promise<DemoAccessResult> {
  const isForcedProduction = request.headers.get("x-app-mode") === "production";

  if (isDemoMode() && !isForcedProduction) {
    return {
      allowed: true,
      mode: "DEMO_MODE",
      status: 200,
    };
  }

  // In PRODUCTION_MODE, caller must be an authorized admin
  const adminAuth = await verifyAdminAuth(request);
  if (adminAuth.authorized && adminAuth.user) {
    return {
      allowed: true,
      mode: "ADMIN_MODE",
      status: 200,
      adminUser: adminAuth.user,
    };
  }

  return {
    allowed: false,
    mode: "PRODUCTION_MODE",
    status: 403,
    error: "Forbidden: Demo controls are disabled in production mode. Use verified /admin endpoints.",
  };
}
