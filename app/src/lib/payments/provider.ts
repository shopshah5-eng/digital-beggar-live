// provider.ts — Payment Provider Factory & Startup Configuration Validator
import { IPaymentProvider, PaymentMode } from "./types";
import { demoPaymentProvider } from "./demoProvider";
import { RazorpayPaymentProvider } from "./razorpayProvider";

export function getPaymentMode(): PaymentMode {
  const mode = (process.env.PAYMENT_MODE || "demo").trim().toLowerCase();
  if (mode === "razorpay_test" || mode === "razorpay_live") {
    return mode;
  }
  return "demo";
}

/**
 * Validates payment gateway configuration.
 * Throws explicit descriptive error if Razorpay mode is selected but credentials are missing.
 * NEVER silently falls back from Razorpay to demo mode.
 */
export function validatePaymentConfig(): {
  mode: PaymentMode;
  keyId?: string;
  hasWebhookSecret: boolean;
} {
  const mode = getPaymentMode();

  if (mode === "razorpay_test" || mode === "razorpay_live") {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new Error(
        `[PaymentConfigError] PAYMENT_MODE is set to '${mode}', but RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing from environment. Never silently falling back to demo mode. Please configure credentials in .env.local.`
      );
    }

    if (mode === "razorpay_live" && keyId.startsWith("rzp_test")) {
      throw new Error(
        `[PaymentConfigError] PAYMENT_MODE is set to 'razorpay_live', but a test key '${keyId}' was provided. Refusing to run live payments with test keys.`
      );
    }

    return {
      mode,
      keyId,
      hasWebhookSecret: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
    };
  }

  return {
    mode: "demo",
    hasWebhookSecret: true,
  };
}

/**
 * Resolves the configured payment provider singleton.
 */
export function resolvePaymentProvider(): IPaymentProvider {
  const mode = getPaymentMode();

  if (mode === "razorpay_test" || mode === "razorpay_live") {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!keyId || !keySecret) {
      throw new Error(
        `[PaymentConfigError] PAYMENT_MODE is set to '${mode}', but RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing. Never silently falling back to demo mode.`
      );
    }

    return new RazorpayPaymentProvider({
      keyId,
      keySecret,
      webhookSecret,
    });
  }

  return demoPaymentProvider;
}

// Global cached provider instance
export const paymentProvider = resolvePaymentProvider();
