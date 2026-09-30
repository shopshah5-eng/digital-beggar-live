// envValidator.ts — Strict Environment & Production Safety Validator
export type AppPaymentMode = "demo" | "razorpay_test" | "razorpay_live";

export interface EnvironmentValidationResult {
  valid: boolean;
  mode: AppPaymentMode;
  livePaymentsAllowed: boolean;
  errors: string[];
  warnings: string[];
}

export function validateEnvironment(env: Record<string, string | undefined> = process.env): EnvironmentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const rawMode = (env.PAYMENT_MODE || "demo").toLowerCase().trim();
  let mode: AppPaymentMode = "demo";

  if (rawMode === "razorpay_test") {
    mode = "razorpay_test";
  } else if (rawMode === "razorpay_live") {
    mode = "razorpay_live";
  } else if (rawMode === "demo") {
    mode = "demo";
  } else {
    errors.push(`Invalid PAYMENT_MODE '${rawMode}'. Must be one of: 'demo', 'razorpay_test', 'razorpay_live'.`);
  }

  // Financial Safety Switch: Defaults strictly to false
  const rawLiveEnabled = (env.LIVE_PAYMENT_ENABLED || "false").toLowerCase().trim();
  const livePaymentsAllowed = rawLiveEnabled === "true";

  // Check Razorpay Credentials based on Mode
  const keyId = env.RAZORPAY_KEY_ID || "";
  const keySecret = env.RAZORPAY_KEY_SECRET || "";
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET || "";

  if (mode === "razorpay_live") {
    if (!livePaymentsAllowed) {
      errors.push(
        "PAYMENT_MODE is 'razorpay_live' but LIVE_PAYMENT_ENABLED is not 'true'. Live financial transactions are strictly disabled by the safety flag."
      );
    }
    if (!keyId || !keySecret) {
      errors.push("PAYMENT_MODE is 'razorpay_live' but RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing.");
    }
    if (keyId.startsWith("rzp_test")) {
      errors.push(`PAYMENT_MODE is 'razorpay_live' but a test key '${keyId}' was provided. Refusing live mode with test keys.`);
    }
    if (!webhookSecret) {
      errors.push("RAZORPAY_WEBHOOK_SECRET is required in razorpay_live mode.");
    }
  } else if (mode === "razorpay_test") {
    if (livePaymentsAllowed) {
      warnings.push("LIVE_PAYMENT_ENABLED is 'true' while PAYMENT_MODE is 'razorpay_test'. Real money will not be charged in test mode.");
    }
    if (!keyId || !keySecret) {
      errors.push("PAYMENT_MODE is 'razorpay_test' but RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing.");
    }
    if (keyId.startsWith("rzp_live")) {
      errors.push(`PAYMENT_MODE is 'razorpay_test' but a live key '${keyId}' was provided. Refusing test mode with live credentials.`);
    }
    if (!webhookSecret) {
      warnings.push("RAZORPAY_WEBHOOK_SECRET is missing. Webhook verification will reject non-mocked payloads in test mode.");
    }
  }

  // Administrative Security Validation in Production
  const isProduction = env.NODE_ENV === "production";
  const adminEmail = env.ADMIN_EMAIL || "";

  if (isProduction) {
    if (!adminEmail) {
      errors.push("ADMIN_EMAIL is required in production environment.");
    }
    if (!env.NEXTAUTH_SECRET && !env.SUPABASE_SERVICE_ROLE_KEY && !env.JWT_SECRET) {
      warnings.push("No dedicated JWT_SECRET or SUPABASE_SERVICE_ROLE_KEY configured for token signing.");
    }
  }

  // Secret Exposure Guard: Verify NEXT_PUBLIC_ variables
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith("NEXT_PUBLIC_") && value) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("secret") ||
        lowerKey.includes("private") ||
        lowerKey.includes("service_role") ||
        lowerKey.includes("password")
      ) {
        errors.push(`CRITICAL SECURITY VIOLATION: Private secret found in public variable '${key}'. Never expose server secrets to client bundle.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    mode,
    livePaymentsAllowed: mode === "razorpay_live" && livePaymentsAllowed,
    errors,
    warnings,
  };
}

export function enforceStartupEnvironmentSafety(env?: Record<string, string | undefined>): EnvironmentValidationResult {
  const result = validateEnvironment(env);
  if (!result.valid) {
    const errorMsg = `[EnvironmentSafetyFailure] Startup blocked due to configuration errors:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`;
    console.error(errorMsg);
    // In production, throw to halt process
    if (process.env.NODE_ENV === "production") {
      throw new Error(errorMsg);
    }
  }
  return result;
}
