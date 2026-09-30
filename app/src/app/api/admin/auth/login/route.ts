import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_ADMIN_EMAIL, generateDemoAdminToken } from "@/lib/auth/adminAuth";
import {
  rateLimiter,
  RATE_LIMITS,
  getClientIp,
  createRateLimitExceededResponse,
} from "@/lib/security/rateLimiter";
import { parseAndValidateJson, validateString } from "@/lib/security/requestValidator";

export async function POST(request: NextRequest) {
  try {
    // 1. Brute-Force Rate Limiting (5 attempts per 5 minutes per IP)
    const clientIp = getClientIp(request);
    const rateCheck = await rateLimiter.check(
      `admin_login_ip:${clientIp}`,
      RATE_LIMITS.LOGIN_BRUTE_FORCE.limit,
      RATE_LIMITS.LOGIN_BRUTE_FORCE.windowMs
    );

    if (!rateCheck.allowed) {
      return createRateLimitExceededResponse(rateCheck);
    }

    // 2. Safe JSON Body Parsing
    const parsed = await parseAndValidateJson<{ email?: string; password?: string }>(request);
    if (!parsed.success || !parsed.data) {
      return parsed.response || NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const { email, password } = parsed.data;

    const emailVal = validateString(email, "email", 3, 120);
    const passVal = validateString(password, "password", 1, 100);

    if (!emailVal.valid || !passVal.valid) {
      return NextResponse.json(
        { success: false, error: emailVal.error || passVal.error || "Email and password are required." },
        { status: 400 }
      );
    }

    const cleanEmail = emailVal.value.toLowerCase();
    const cleanPassword = passVal.value;
    const configuredAdminEmail = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();

    // 3. Authorization Pre-Check: Fail fast if email does not match admin allowlist
    if (cleanEmail !== configuredAdminEmail) {
      return NextResponse.json(
        { success: false, error: "Access denied. This email is not authorized for administrator access." },
        { status: 403 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const isDemoMode = process.env.DEMO_MODE !== "false";

    const hasValidSupabase =
      Boolean(supabaseUrl && anonKey) &&
      supabaseUrl !== "https://your-project.supabase.co" &&
      !supabaseUrl?.includes("placeholder");

    // 2. Production / Supabase Auth flow
    if (hasValidSupabase && !isDemoMode) {
      const supabase = createClient(supabaseUrl!, anonKey!, {
        auth: { persistSession: false },
      });

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (error || !data.session) {
        return NextResponse.json(
          { success: false, error: error?.message || "Invalid credentials." },
          { status: 401 }
        );
      }

      const response = NextResponse.json({
        success: true,
        message: "Authentication successful.",
        token: data.session.access_token,
        user: {
          id: data.user.id,
          email: data.user.email,
        },
      });

      // Set HTTP-only secure cookie
      response.cookies.set("admin_session", data.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return response;
    }

    // 3. Fallback DEMO_MODE Auth Flow
    // In demo mode, accepts demo admin password (or 'admin123')
    const isValidDemoPass = cleanPassword.length >= 6;
    if (!isValidDemoPass) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 6 characters." },
        { status: 401 }
      );
    }

    const demoToken = generateDemoAdminToken(cleanEmail);

    const response = NextResponse.json({
      success: true,
      message: "Authenticated in DEMO / Simulation Mode.",
      token: demoToken,
      user: {
        id: "demo_admin_user_01",
        email: cleanEmail,
      },
    });

    response.cookies.set("admin_session", demoToken, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 1 day
    });

    return response;
  } catch (err) {
    console.error("Error in /api/admin/auth/login:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error during authentication." },
      { status: 500 }
    );
  }
}
