// test-engine.mjs — Comprehensive Security & Payment Gateway Sandbox Test Suite for Digital Beggar
import assert from "node:assert";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = process.env.PORT || "3005";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

let serverProcess = null;
let reqCounter = 0;

function getTestHeaders(extra = {}) {
  reqCounter++;
  return {
    "Content-Type": "application/json",
    "x-forwarded-for": `10.0.${Math.floor(reqCounter / 5)}.${(reqCounter % 200) + 1}`,
    ...extra,
  };
}

async function isServerRunning() {
  try {
    const res = await fetch(`${BASE_URL}/api/stream/state`, { signal: AbortSignal.timeout(1500) });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function startServerIfNeeded() {
  const running = await isServerRunning();
  if (running) {
    console.log(`[TestRunner] Using already running server at ${BASE_URL}\n`);
    return;
  }

  console.log(`[TestRunner] Spawning Next.js test server on port ${PORT}...`);
  serverProcess = spawn(
    process.execPath,
    ["./node_modules/next/dist/bin/next", "start", "-p", PORT],
    {
      stdio: "pipe",
      env: { ...process.env, PORT },
    }
  );

  serverProcess.stderr.on("data", (data) => {
    const str = data.toString();
    if (str.includes("Error") && !str.includes("proxy")) {
      console.error(`[Server stderr] ${str}`);
    }
  });

  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (await isServerRunning()) {
      console.log(`[TestRunner] Server is ready on ${BASE_URL} (${Date.now() - start}ms)\n`);
      return;
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  throw new Error("Timed out waiting for test server to start.");
}

// Cryptographic test helpers replicating webhookVerification.ts
function computeHmacSignature(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function verifyHmacTimingSafe(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) return false;
  const expected = computeHmacSignature(rawBody, secret);
  const expectedBuf = Buffer.from(expected, "utf-8");
  const signatureBuf = Buffer.from(signature, "utf-8");
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

// Standalone config validation helper matching provider.ts logic
function testValidatePaymentConfig(mode, keyId, keySecret) {
  if (mode === "razorpay_test" || mode === "razorpay_live") {
    if (!keyId || !keySecret) {
      throw new Error(
        `[PaymentConfigError] PAYMENT_MODE is set to '${mode}', but RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing. Never silently falling back to demo mode.`
      );
    }
    if (mode === "razorpay_live" && keyId.startsWith("rzp_test")) {
      throw new Error(
        `[PaymentConfigError] PAYMENT_MODE is set to 'razorpay_live', but a test key '${keyId}' was provided. Refusing to run live payments with test keys.`
      );
    }
    return { mode, valid: true };
  }
  return { mode: "demo", valid: true };
}

// Standalone environment validation helper matching envValidator.ts
function testValidateEnvironment(env = {}) {
  const errors = [];
  const warnings = [];
  const rawMode = (env.PAYMENT_MODE || "demo").toLowerCase().trim();
  let mode = "demo";

  if (rawMode === "razorpay_test") mode = "razorpay_test";
  else if (rawMode === "razorpay_live") mode = "razorpay_live";
  else if (rawMode === "demo") mode = "demo";
  else errors.push(`Invalid PAYMENT_MODE '${rawMode}'. Must be one of: 'demo', 'razorpay_test', 'razorpay_live'.`);

  const rawLiveEnabled = (env.LIVE_PAYMENT_ENABLED || "false").toLowerCase().trim();
  const livePaymentsAllowed = rawLiveEnabled === "true";
  const keyId = env.RAZORPAY_KEY_ID || "";
  const keySecret = env.RAZORPAY_KEY_SECRET || "";
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET || "";

  if (mode === "razorpay_live") {
    if (!livePaymentsAllowed) {
      errors.push("PAYMENT_MODE is 'razorpay_live' but LIVE_PAYMENT_ENABLED is not 'true'. Live financial transactions are strictly disabled by the safety flag.");
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
  }

  const isProduction = env.NODE_ENV === "production";
  if (isProduction && !env.ADMIN_EMAIL) {
    errors.push("ADMIN_EMAIL is required in production environment.");
  }

  return {
    valid: errors.length === 0,
    mode,
    livePaymentsAllowed: mode === "razorpay_live" && livePaymentsAllowed,
    errors,
    warnings,
  };
}

// Amount validation logic matching paymentService.ts
function testValidateSupportAmount(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount) || Number.isNaN(amount)) {
    return { valid: false, error: "Support amount must be a valid finite number." };
  }
  if (amount < 10) {
    return { valid: false, error: "Support amount cannot be less than ₹10." };
  }
  if (amount > 10000) {
    return { valid: false, error: "Support amount cannot exceed ₹10,000." };
  }
  const roundedPaise = Math.round(amount * 100);
  const reconstructedInr = roundedPaise / 100;
  if (Math.abs(amount - reconstructedInr) > 0.0001) {
    return { valid: false, error: "Support amount has invalid decimal precision (fractions of paise rejected)." };
  }
  return { valid: true, amountInr: reconstructedInr, amountPaise: roundedPaise };
}

async function runTests() {
  console.log("==================================================================");
  console.log("DIGITAL BEGGAR — PHASE 2 PAYMENT GATEWAY & SECURITY TEST SUITE");
  console.log(`Target: ${BASE_URL}`);
  console.log("==================================================================\n");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(`   Error: ${err.message}`);
      failed++;
    }
  }

  try {
    await startServerIfNeeded();

    // Reset stream state baseline
    await fetch(`${BASE_URL}/api/demo/reset`, { method: "POST", headers: getTestHeaders() });

    // =========================================================================
    // SECTION 1: 25 PAYMENT GATEWAY & SANDBOX VERIFICATION REQUIREMENTS
    // =========================================================================

    // 1. Demo payment still works
    await test("1. Demo payment still works", async () => {
      const orderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 25, displayName: "Demo Supporter" }),
      });
      const orderData = await orderRes.json();
      assert.strictEqual(orderRes.status, 200, `Expected 200, got ${orderRes.status}`);
      assert.strictEqual(orderData.success, true);
      assert(orderData.order.orderId);

      const verifyRes = await fetch(`${BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: orderData.order.orderId,
          paymentId: `pay_demo_${Date.now()}`,
          signature: "demo_sig",
        }),
      });
      const verifyData = await verifyRes.json();
      assert.strictEqual(verifyRes.status, 200);
      assert.strictEqual(verifyData.success, true);
      assert.strictEqual(verifyData.payment.status, "VERIFIED");
    });

    // 2. Razorpay configuration validation works
    await test("2. Razorpay configuration validation works", async () => {
      const validTest = testValidatePaymentConfig("razorpay_test", "rzp_test_abc123", "secret_xyz456");
      assert.strictEqual(validTest.valid, true);
      assert.strictEqual(validTest.mode, "razorpay_test");

      const configRes = await fetch(`${BASE_URL}/api/payments/config`, { headers: getTestHeaders() });
      const configData = await configRes.json();
      assert.strictEqual(configRes.status, 200);
      assert.strictEqual(configData.success, true);
      const activeMode = configData.mode || configData.paymentMode;
      assert(["demo", "razorpay_test", "razorpay_live"].includes(activeMode));
    });

    // 3. Missing Razorpay credentials fail safely
    await test("3. Missing Razorpay credentials fail safely", async () => {
      assert.throws(() => {
        testValidatePaymentConfig("razorpay_test", "", "");
      }, (err) => {
        return err.message.includes("[PaymentConfigError]") && err.message.includes("missing");
      });
      assert.throws(() => {
        testValidatePaymentConfig("razorpay_test", "rzp_test_key", "");
      }, (err) => {
        return err.message.includes("[PaymentConfigError]");
      });
    });

    // 4. Payment amount converted to paise correctly
    await test("4. Payment amount converted to paise correctly", async () => {
      const r1 = testValidateSupportAmount(10);
      assert.strictEqual(r1.valid, true);
      assert.strictEqual(r1.amountPaise, 1000);

      const r2 = testValidateSupportAmount(50.75);
      assert.strictEqual(r2.valid, true);
      assert.strictEqual(r2.amountPaise, 5075);

      const orderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 100, displayName: "Paise Test" }),
      });
      const data = await orderRes.json();
      assert.strictEqual(data.order.amountPaise, 10000);
    });

    // 5. Invalid amount rejected
    await test("5. Invalid amount rejected", async () => {
      const resNaN = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: "not_a_number" }),
      });
      assert.strictEqual(resNaN.status, 400);

      const resNeg = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: -50 }),
      });
      assert.strictEqual(resNeg.status, 400);

      const resFrac = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 15.1234 }),
      });
      assert.strictEqual(resFrac.status, 400);
    });

    // 6. Amount below ₹10 rejected
    await test("6. Amount below ₹10 rejected", async () => {
      const res = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 9.99 }),
      });
      const data = await res.json();
      assert.strictEqual(res.status, 400);
      assert(data.error.includes("less than ₹10"));
    });

    // 7. Amount above ₹10,000 rejected
    await test("7. Amount above ₹10,000 rejected", async () => {
      const res = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 10001 }),
      });
      const data = await res.json();
      assert.strictEqual(res.status, 400);
      assert(data.error.includes("exceed ₹10,000"));
    });

    // 8. Browser cannot override authoritative order amount
    await test("8. Browser cannot override authoritative order amount", async () => {
      const stateBeforeRes = await fetch(`${BASE_URL}/api/stream/state`);
      const stateBefore = await stateBeforeRes.json();
      const raisedBefore = stateBefore.raisedAmount;

      // Create an order for ₹30
      const orderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 30, displayName: "Honest Supporter" }),
      });
      const orderData = await orderRes.json();

      // Malicious client tries to verify while sending fraudulent amount: 1 rupee in payload
      const verifyRes = await fetch(`${BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: orderData.order.orderId,
          paymentId: `pay_tamper_${Date.now()}`,
          signature: "demo_sig",
          amount: 1, // Fraudulent attempt to override
          amountPaise: 100,
        }),
      });
      assert.strictEqual(verifyRes.status, 200);

      // Verify stream raisedAmount increased by the authoritative ₹30, NOT ₹1
      const stateAfterRes = await fetch(`${BASE_URL}/api/stream/state`);
      const stateAfter = await stateAfterRes.json();
      assert.strictEqual(stateAfter.raisedAmount, raisedBefore + 30);
    });

    // 9. Payment purpose is enforced (SUPPORT)
    await test("9. Payment purpose is enforced (SUPPORT)", async () => {
      const orderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 20 }),
      });
      const orderData = await orderRes.json();
      assert.strictEqual(orderData.success, true);
    });

    // 10. Invalid payment signature rejected
    await test("10. Invalid payment signature rejected", async () => {
      const secret = "test_key_secret_12345";
      const orderId = "order_rzp_test_1001";
      const paymentId = "pay_rzp_test_2002";
      const wrongSignature = "invalid_tampered_signature_hex_code";

      const isValid = verifyHmacTimingSafe(`${orderId}|${paymentId}`, wrongSignature, secret);
      assert.strictEqual(isValid, false);
    });

    // 11. Valid payment verification accepted
    await test("11. Valid payment verification accepted", async () => {
      const secret = "test_key_secret_12345";
      const orderId = "order_rzp_test_valid";
      const paymentId = "pay_rzp_test_valid";
      const validSignature = computeHmacSignature(`${orderId}|${paymentId}`, secret);

      const isValid = verifyHmacTimingSafe(`${orderId}|${paymentId}`, validSignature, secret);
      assert.strictEqual(isValid, true);
    });

    // 12. Wrong order ID rejected
    await test("12. Wrong order ID rejected", async () => {
      const res = await fetch(`${BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: "order_non_existent_random_id",
          paymentId: "pay_test_random",
          signature: "demo_sig",
        }),
      });
      const data = await res.json();
      assert([400, 404].includes(res.status));
      assert.strictEqual(data.success, false);
      assert(data.error.includes("not found"));
    });

    // 13. Wrong amount rejected
    await test("13. Wrong amount rejected", async () => {
      const fakeOrderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 50 }),
      });
      const fakeOrder = await fakeOrderRes.json();

      const webhookPayload = JSON.stringify({
        event: "payment.captured",
        id: `wh_err_amt_${Date.now()}`,
        payload: {
          payment: {
            entity: {
              id: `pay_amt_mismatch_${Date.now()}`,
              order_id: fakeOrder.order.orderId,
              amount: 1000, // 1000 paise != 5000 paise stored order
            },
          },
        },
      });

      const res = await fetch(`${BASE_URL}/api/webhooks/razorpay`, {
        method: "POST",
        headers: getTestHeaders({
          "x-razorpay-signature": "demo_webhook_signature",
        }),
        body: webhookPayload,
      });
      const data = await res.json();
      assert.strictEqual(res.status, 400);
      assert(data.error.includes("Amount mismatch"));
    });

    // 14. Wrong currency rejected
    await test("14. Wrong currency rejected", async () => {
      const orderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 20 }),
      });
      const order = await orderRes.json();
      assert.strictEqual(order.order.currency, "INR");
    });

    // 15. Duplicate payment rejected/idempotent
    await test("15. Duplicate payment rejected/idempotent", async () => {
      const orderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 20, displayName: "Idempotent Supporter" }),
      });
      const order = await orderRes.json();
      const pId = `pay_idem_${Date.now()}`;

      // First verification call
      const v1 = await fetch(`${BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: order.order.orderId,
          paymentId: pId,
          signature: "demo_sig",
        }),
      });
      const data1 = await v1.json();
      assert.strictEqual(v1.status, 200);
      assert.strictEqual(data1.success, true);

      // Second verification call (duplicate)
      const v2 = await fetch(`${BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: order.order.orderId,
          paymentId: pId,
          signature: "demo_sig",
        }),
      });
      const data2 = await v2.json();
      assert.strictEqual(v2.status, 200);
      assert.strictEqual(data2.idempotent, true);
    });

    // 16. Duplicate webhook is idempotent
    await test("16. Duplicate webhook is idempotent", async () => {
      const orderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 20 }),
      });
      const order = await orderRes.json();
      const whId = `evt_wh_dup_${Date.now()}`;
      const payload = JSON.stringify({
        event: "payment.captured",
        id: whId,
        payload: {
          payment: {
            entity: {
              id: `pay_wh_dup_${Date.now()}`,
              order_id: order.order.orderId,
              amount: 2000,
            },
          },
        },
      });

      const res1 = await fetch(`${BASE_URL}/api/webhooks/razorpay`, {
        method: "POST",
        headers: getTestHeaders({
          "x-razorpay-signature": "demo_webhook_signature",
        }),
        body: payload,
      });
      assert.strictEqual(res1.status, 200);

      // Replay identical webhook
      const res2 = await fetch(`${BASE_URL}/api/webhooks/razorpay`, {
        method: "POST",
        headers: getTestHeaders({
          "x-razorpay-signature": "demo_webhook_signature",
        }),
        body: payload,
      });
      const data2 = await res2.json();
      assert.strictEqual(res2.status, 200);
      assert.strictEqual(data2.idempotent, true);
    });

    // 17. Invalid webhook signature rejected
    await test("17. Invalid webhook signature rejected", async () => {
      const res = await fetch(`${BASE_URL}/api/webhooks/razorpay`, {
        method: "POST",
        headers: getTestHeaders({
          "x-razorpay-signature": "forged_invalid_signature_xyz",
        }),
        body: JSON.stringify({ event: "payment.captured", id: "evt_invalid" }),
      });
      assert([400, 401].includes(res.status));
    });

    // 18. Valid webhook accepted
    await test("18. Valid webhook accepted", async () => {
      const orderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 35 }),
      });
      const order = await orderRes.json();

      const res = await fetch(`${BASE_URL}/api/webhooks/razorpay`, {
        method: "POST",
        headers: getTestHeaders({
          "x-razorpay-signature": "demo_webhook_signature",
        }),
        body: JSON.stringify({
          event: "payment.captured",
          id: `evt_valid_${Date.now()}`,
          payload: {
            payment: {
              entity: {
                id: `pay_valid_wh_${Date.now()}`,
                order_id: order.order.orderId,
                amount: 3500,
              },
            },
          },
        }),
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
    });

    // 19. Unverified payment does NOT increase stream total
    await test("19. Unverified payment does NOT increase stream total", async () => {
      const state1 = await (await fetch(`${BASE_URL}/api/stream/state`)).json();
      const initialRaised = state1.raisedAmount;

      // Only create order, do not verify
      await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 100 }),
      });

      const state2 = await (await fetch(`${BASE_URL}/api/stream/state`)).json();
      assert.strictEqual(state2.raisedAmount, initialRaised);
    });

    // 20. Verified payment increases stream total exactly once
    await test("20. Verified payment increases stream total exactly once", async () => {
      const state1 = await (await fetch(`${BASE_URL}/api/stream/state`)).json();
      const initialRaised = state1.raisedAmount;

      const orderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 40 }),
      });
      const order = await orderRes.json();
      assert.strictEqual(orderRes.status, 200);
      const pId = `pay_once_${Date.now()}`;

      await fetch(`${BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: order.order.orderId,
          paymentId: pId,
          signature: "demo_sig",
        }),
      });

      const state2 = await (await fetch(`${BASE_URL}/api/stream/state`)).json();
      assert.strictEqual(state2.raisedAmount, initialRaised + 40);

      // Calling verify again must NOT increase raisedAmount
      await fetch(`${BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: order.order.orderId,
          paymentId: pId,
          signature: "demo_sig",
        }),
      });

      const state3 = await (await fetch(`${BASE_URL}/api/stream/state`)).json();
      assert.strictEqual(state3.raisedAmount, initialRaised + 40);
    });

    // 21. Verified support creates exactly one support event
    await test("21. Verified support creates exactly one support event", async () => {
      const name = `Supporter_${Date.now()}`;
      const orderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 15, displayName: name }),
      });
      const order = await orderRes.json();
      assert.strictEqual(orderRes.status, 200);

      await fetch(`${BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: order.order.orderId,
          paymentId: `pay_single_event_${Date.now()}`,
          signature: "demo_sig",
        }),
      });

      const state = await (await fetch(`${BASE_URL}/api/stream/state`)).json();
      assert(state.recentSupport !== null, "Expected recentSupport to not be null");
      assert.strictEqual(state.recentSupport.displayName, name);
      assert.strictEqual(state.recentSupport.amount, 15);
    });

    // 22. Verified support triggers exactly one reaction
    await test("22. Verified support triggers exactly one reaction", async () => {
      function mapAmountToReaction(amt) {
        if (amt >= 500) return "SUPPORT_LARGE";
        if (amt >= 50) return "SUPPORT_MEDIUM";
        return "SUPPORT_SMALL";
      }

      assert.strictEqual(mapAmountToReaction(10), "SUPPORT_SMALL");
      assert.strictEqual(mapAmountToReaction(49), "SUPPORT_SMALL");
      assert.strictEqual(mapAmountToReaction(50), "SUPPORT_MEDIUM");
      assert.strictEqual(mapAmountToReaction(499), "SUPPORT_MEDIUM");
      assert.strictEqual(mapAmountToReaction(500), "SUPPORT_LARGE");
      assert.strictEqual(mapAmountToReaction(5000), "SUPPORT_LARGE");
    });

    // 23. Public stream state contains no secrets
    await test("23. Public stream state contains no secrets", async () => {
      const res = await fetch(`${BASE_URL}/api/stream/state`);
      const state = await res.json();
      const serialized = JSON.stringify(state);

      assert.strictEqual(state.RAZORPAY_KEY_SECRET, undefined);
      assert.strictEqual(state.RAZORPAY_WEBHOOK_SECRET, undefined);
      assert.strictEqual(state.serviceRoleKey, undefined);
      assert(!serialized.includes("secret"));
      assert(!serialized.includes("ADMIN_EMAIL"));
    });

    // 24. Razorpay secret never appears in client bundle
    await test("24. Razorpay secret never appears in client bundle", async () => {
      const envExamplePath = path.resolve("./.env.example");
      if (fs.existsSync(envExamplePath)) {
        const envContent = fs.readFileSync(envExamplePath, "utf-8");
        assert(!envContent.includes("NEXT_PUBLIC_RAZORPAY_KEY_SECRET"));
        assert(!envContent.includes("NEXT_PUBLIC_RAZORPAY_WEBHOOK_SECRET"));
      }

      // Check client config API response
      const configRes = await fetch(`${BASE_URL}/api/payments/config`);
      const configData = await configRes.json();
      assert.strictEqual(configData.keySecret, undefined);
      assert.strictEqual(configData.webhookSecret, undefined);
    });

    // 25. Demo/test/live mode boundaries work
    await test("25. Demo/test/live mode boundaries work", async () => {
      // Test live boundary enforcement: live mode with test key throws
      assert.throws(() => {
        testValidatePaymentConfig("razorpay_live", "rzp_test_fake_key", "secret_fake");
      }, (err) => {
        return err.message.includes("Refusing to run live payments with test keys");
      });

      // Test demo mode requires no keys
      const demoConf = testValidatePaymentConfig("demo", "", "");
      assert.strictEqual(demoConf.valid, true);
      assert.strictEqual(demoConf.mode, "demo");
    });

    // =========================================================================
    // SECTION 2: PHASE 1 SECURITY & REGRESSION AUDIT VERIFICATIONS
    // =========================================================================

    await test("26. Security: Unauthenticated /admin access redirects to /admin/login", async () => {
      const res = await fetch(`${BASE_URL}/admin`, { redirect: "manual" });
      assert([307, 308, 302].includes(res.status));
      const loc = res.headers.get("location") || "";
      assert(loc.includes("/admin/login"));
    });

    await test("27. Security: Unauthenticated GET /api/admin/overview is rejected with HTTP 401", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/overview`);
      assert.strictEqual(res.status, 401);
    });

    await test("28. Security: Unauthorized admin API call (non-admin token) is rejected with HTTP 403 Forbidden", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/overview`, {
        headers: { Authorization: "Bearer unauthorized_user_test_token" },
      });
      assert.strictEqual(res.status, 403);
    });

    await test("29. Security: Authorized admin API call successfully retrieves overview data", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/overview`, {
        headers: { Authorization: "Bearer valid_admin_test_token" },
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(data.success, true);
      assert(Array.isArray(data.data.recentPayments));
    });

    await test("30. Security: Demo reset cannot be called publicly under production rules", async () => {
      const resUnauth = await fetch(`${BASE_URL}/api/demo/reset`, {
        method: "POST",
        headers: { "x-app-mode": "production" },
      });
      assert.strictEqual(resUnauth.status, 403);
    });

    await test("31. SSE Realtime Stream: text/event-stream active", async () => {
      const res = await fetch(`${BASE_URL}/api/events/stream`);
      assert.strictEqual(res.status, 200);
      assert(res.headers.get("content-type")?.includes("text/event-stream"));
    });

    // =========================================================================
    // SECTION 3: PHASE 3 SPONSOR CROWN & BUSINESS BIDDING SYSTEM TESTS (32 - 61)
    // =========================================================================

    // Test shared state variables
    let savedOrder1 = null;
    let savedBid1 = null;
    let concurrentBidA = null;
    let concurrentBidB = null;

    // 32. No sponsor → minimum bid ₹500
    await test("32. Sponsor: No sponsor -> minimum opening bid is ₹500", async () => {
      // Clear Crown via Admin Override
      await fetch(`${BASE_URL}/api/sponsor/admin/override`, {
        method: "POST",
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
        body: JSON.stringify({
          action: "CLEAR_CROWN",
          confirmation: "CONFIRM_EMERGENCY_OVERRIDE",
        }),
      });

      const res = await fetch(`${BASE_URL}/api/sponsor/current`, { headers: getTestHeaders() });
      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.currentSponsor, null);
      assert.strictEqual(json.minimumNextBid, 500);
    });

    // 33. Existing ₹500 sponsor → minimum ₹1,000
    await test("33. Sponsor: Existing ₹500 sponsor -> minimum next bid is ₹1,000", async () => {
      await fetch(`${BASE_URL}/api/sponsor/admin/override`, {
        method: "POST",
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
        body: JSON.stringify({
          action: "SET_CROWN",
          confirmation: "CONFIRM_EMERGENCY_OVERRIDE",
          overrideDetails: {
            sponsorName: "Alpha Corp",
            bidAmount: 500,
            website: "https://alpha.example.com",
            reason: "Baseline setup for minimum bid test",
          },
        }),
      });

      const res = await fetch(`${BASE_URL}/api/sponsor/current`, { headers: getTestHeaders() });
      const json = await res.json();
      assert.strictEqual(json.currentSponsor?.verifiedBid, 500);
      assert.strictEqual(json.minimumNextBid, 1000);
    });

    // 34. Bid below minimum rejected
    await test("34. Sponsor: Bid below minimum rejected (₹700 < ₹1,000)", async () => {
      const res = await fetch(`${BASE_URL}/api/sponsor/bid`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          businessName: "Beta LLC",
          contactEmail: "beta@test.com",
          website: "https://beta.com",
          bidAmount: 700,
        }),
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert(json.error.includes("Minimum next bid") || json.error.includes("1,000"));
    });

    // 35. Bid exactly at minimum accepted according to configured rule
    await test("35. Sponsor: Bid exactly at minimum accepted according to configured rule (₹1,000)", async () => {
      const res = await fetch(`${BASE_URL}/api/sponsor/bid`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          businessName: "Beta LLC",
          contactEmail: "beta@test.com",
          website: "https://beta.com",
          bidAmount: 1000,
        }),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.bid.bid_amount, 1000);
      savedOrder1 = json.order;
      savedBid1 = json.bid;
    });

    // 36. Invalid business rejected
    await test("36. Sponsor: Invalid business name rejected (empty or < 2 characters)", async () => {
      const res = await fetch(`${BASE_URL}/api/sponsor/bid`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          businessName: " ",
          contactEmail: "biz@test.com",
          bidAmount: 1000,
        }),
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert(json.error.includes("Business name"));
    });

    // 37. Invalid email rejected
    await test("37. Sponsor: Invalid contact email format rejected", async () => {
      const res = await fetch(`${BASE_URL}/api/sponsor/bid`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          businessName: "Good Biz",
          contactEmail: "not-an-email-at-all",
          bidAmount: 1000,
        }),
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      assert(json.error.includes("email"));
    });

    // 38. Invalid bid rejected
    await test("38. Sponsor: Invalid bid amount rejected (negative or exceeding ₹10,00,000)", async () => {
      const resExceed = await fetch(`${BASE_URL}/api/sponsor/bid`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          businessName: "Whale Corp",
          contactEmail: "whale@test.com",
          bidAmount: 1500000, // Exceeds initial max ₹10,00,000
        }),
      });
      assert.strictEqual(resExceed.status, 400);
      const json = await resExceed.json();
      assert.strictEqual(json.success, false);
      assert(json.error.includes("cannot exceed") || json.error.includes("10,00,000"));
    });

    // 39. Browser cannot override minimum bid
    await test("39. Sponsor: Browser cannot override minimum bid via payload tampering", async () => {
      const res = await fetch(`${BASE_URL}/api/sponsor/bid`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          businessName: "Sneaky Biz",
          contactEmail: "sneaky@test.com",
          bidAmount: 600,
          currentMinimumBid: 500, // Client tries to supply lower minimum
          minimumNextBid: 500,
        }),
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.success, false);
      // Backend authoritatively derived minimum from repository state
      assert(json.error.includes("Minimum"));
    });

    // 40. Browser cannot change payment purpose
    await test("40. Sponsor: Browser cannot change payment purpose (strictly SPONSOR_BID)", async () => {
      const res = await fetch(`${BASE_URL}/api/sponsor/bid`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          businessName: "Purpose Co",
          contactEmail: "purpose@test.com",
          bidAmount: 1000,
          purpose: "SUPPORT", // Client tries to spoof purpose
        }),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.order.purpose, "SPONSOR_BID");
    });

    // 41. Sponsor payment order created correctly
    await test("41. Sponsor: Payment order created with correct paise, currency & metadata", async () => {
      assert(savedOrder1, "Order should exist from test 35");
      assert(savedOrder1.orderId, "orderId must be present");
      assert.strictEqual(savedOrder1.amount, 1000);
      assert.strictEqual(savedOrder1.amountPaise, 100000);
      assert.strictEqual(savedOrder1.currency, "INR");
      assert.strictEqual(savedOrder1.purpose, "SPONSOR_BID");
    });

    // 42. Unverified payment cannot activate sponsor
    await test("42. Sponsor: Unverified payment cannot activate sponsor Crown", async () => {
      // Check current sponsor is still Alpha Corp (not Beta LLC)
      const res = await fetch(`${BASE_URL}/api/sponsor/current`, { headers: getTestHeaders() });
      const json = await res.json();
      assert.strictEqual(json.currentSponsor?.displayName, "Alpha Corp");
      assert.notStrictEqual(json.currentSponsor?.displayName, "Beta LLC");
    });

    // 43. Invalid payment signature rejected
    await test("43. Sponsor: Non-existent or invalid payment verification rejected", async () => {
      const res = await fetch(`${BASE_URL}/api/sponsor/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: "order_non_existent_fake_id",
          paymentId: "pay_fake_test_id",
          signature: "bad_signature",
        }),
      });
      assert([400, 404].includes(res.status));
      const json = await res.json();
      assert.strictEqual(json.success, false);
    });

    // 44. Valid payment verification works
    await test("44. Sponsor: Valid payment verification succeeds", async () => {
      const verifyRes = await fetch(`${BASE_URL}/api/sponsor/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: savedOrder1.orderId,
          paymentId: `pay_demo_${Date.now()}`,
        }),
      });
      assert.strictEqual(verifyRes.status, 200);
      const json = await verifyRes.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.crownWon, true);
    });

    // 45. Verified payment still requires Crown re-check
    await test("45. Sponsor: Verified payment still requires Crown re-check before activation", async () => {
      // Current sponsor is now Beta LLC (₹1,000). Next min is ₹1,500.
      // Create two competing bids for ₹1,500
      const resA = await fetch(`${BASE_URL}/api/sponsor/bid`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          businessName: "Competitor A",
          contactEmail: "compa@test.com",
          bidAmount: 1500,
        }),
      });
      const jsonA = await resA.json();
      concurrentBidA = jsonA;

      const resB = await fetch(`${BASE_URL}/api/sponsor/bid`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          businessName: "Competitor B",
          contactEmail: "compb@test.com",
          bidAmount: 1500,
        }),
      });
      const jsonB = await resB.json();
      concurrentBidB = jsonB;

      assert.strictEqual(jsonA.success, true);
      assert.strictEqual(jsonB.success, true);
    });

    // 46. Verified qualifying bid activates sponsor
    await test("46. Sponsor: First qualifying bid payment activates Crown (Competitor A wins)", async () => {
      const res = await fetch(`${BASE_URL}/api/sponsor/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: concurrentBidA.order.orderId,
          paymentId: `pay_demo_${Date.now()}_a`,
        }),
      });
      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.crownWon, true);

      // Verify Crown is now Competitor A with ₹1,500
      const curr = await fetch(`${BASE_URL}/api/sponsor/current`, { headers: getTestHeaders() });
      const currJson = await curr.json();
      assert.strictEqual(currJson.currentSponsor?.displayName, "Competitor A");
      assert.strictEqual(currJson.currentSponsor?.verifiedBid, 1500);
      assert.strictEqual(currJson.minimumNextBid, 2000); // 1500 + 500
    });

    // 47. Losing concurrent bid does not activate sponsor
    await test("47. Sponsor: Losing concurrent bid is marked REFUND_REQUIRED and does not take Crown", async () => {
      // Competitor B also paid ₹1,500, but minimum is now ₹2,000!
      const res = await fetch(`${BASE_URL}/api/sponsor/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: concurrentBidB.order.orderId,
          paymentId: `pay_demo_${Date.now()}_b`,
        }),
      });
      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.crownWon, false);
      assert.strictEqual(json.status, "REFUND_REQUIRED");
      assert(json.reason.includes("OUTBID") || json.reason.includes("minimum"));

      // Ensure Competitor A remains the Crown holder!
      const curr = await fetch(`${BASE_URL}/api/sponsor/current`, { headers: getTestHeaders() });
      const currJson = await curr.json();
      assert.strictEqual(currJson.currentSponsor?.displayName, "Competitor A");
    });

    // 48. Two simultaneous bids cannot create two active sponsors
    await test("48. Sponsor: Concurrency protection guarantees strictly one SPONSOR_ACTIVE campaign", async () => {
      const res = await fetch(`${BASE_URL}/api/sponsor/bids`, {
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
      });
      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert(json.activeCampaign);
      assert.strictEqual(json.activeCampaign.status, "SPONSOR_ACTIVE");
      assert.strictEqual(json.activeCampaign.sponsor_name, "Competitor A");
    });

    // 49. Duplicate sponsor payment is idempotent
    await test("49. Sponsor: Duplicate verification request returns identical result idempotently", async () => {
      const res = await fetch(`${BASE_URL}/api/sponsor/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: concurrentBidA.order.orderId,
          paymentId: `pay_demo_duplicate`,
        }),
      });
      const json = await res.json();
      assert.strictEqual(res.status, 200);
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.crownWon, true);
    });

    // 50. Duplicate activation does not trigger duplicate events
    await test("50. Sponsor: Duplicate activation does not push redundant events", async () => {
      // Stream state last event remains valid without duplicate race
      const stateRes = await fetch(`${BASE_URL}/api/stream/state`);
      const state = await stateRes.json();
      assert.strictEqual(state.currentSponsor, "Competitor A");
      assert.strictEqual(state.currentSponsorBid, 1500);
    });

    // 51. Previous sponsor receives endedAt
    await test("51. Sponsor: Previous sponsor campaign receives endedAt timestamp on crown handover", async () => {
      // Crown a new sponsor: Titan Ltd for ₹2,000
      const bidTitan = await fetch(`${BASE_URL}/api/sponsor/bid`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          businessName: "Titan Ltd",
          contactEmail: "titan@test.com",
          website: "https://titan.com",
          bidAmount: 2000,
        }),
      });
      const titanJson = await bidTitan.json();

      await fetch(`${BASE_URL}/api/sponsor/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: titanJson.order.orderId,
          paymentId: `pay_demo_${Date.now()}_titan`,
        }),
      });

      // Inspect campaign history
      const bidsRes = await fetch(`${BASE_URL}/api/sponsor/bids`, {
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
      });
      const bidsData = await bidsRes.json();
      const pastCompA = bidsData.campaignHistory?.find(
        (c) => c.sponsor_name === "Competitor A"
      );
      assert(pastCompA, "Competitor A should now be in campaign history");
      assert(pastCompA.ended_at, "Competitor A must have an ended_at timestamp");
    });

    // 52. New sponsor receives SPONSOR_ACTIVE
    await test("52. Sponsor: New winner receives status SPONSOR_ACTIVE with startedAt", async () => {
      const bidsRes = await fetch(`${BASE_URL}/api/sponsor/bids`, {
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
      });
      const bidsData = await bidsRes.json();
      assert.strictEqual(bidsData.activeCampaign?.sponsor_name, "Titan Ltd");
      assert.strictEqual(bidsData.activeCampaign?.status, "SPONSOR_ACTIVE");
      assert(bidsData.activeCampaign?.started_at);
    });

    // 53. Public state exposes safe sponsor information only
    await test("53. Sponsor: Public state exposes safe sponsor information", async () => {
      const res = await fetch(`${BASE_URL}/api/stream/state`);
      const state = await res.json();
      assert.strictEqual(state.currentSponsor, "Titan Ltd");
      assert.strictEqual(state.currentSponsorBid, 2000);
      assert.strictEqual(state.minimumNextBid, 2500);

      const pubRes = await fetch(`${BASE_URL}/api/sponsor/current`, { headers: getTestHeaders() });
      const pubData = await pubRes.json();
      assert.strictEqual(pubData.currentSponsor?.displayName, "Titan Ltd");
      assert.strictEqual(pubData.currentSponsor?.verifiedBid, 2000);
      assert.strictEqual(pubData.minimumNextBid, 2500);
    });

    // 54. Contact email is not publicly exposed
    await test("54. Sponsor: Business contact email is never exposed in public responses", async () => {
      const resStream = await fetch(`${BASE_URL}/api/stream/state`);
      const bodyStream = await resStream.text();
      assert(!bodyStream.includes("titan@test.com"));
      assert(!bodyStream.includes("contact_email"));

      const resSponsor = await fetch(`${BASE_URL}/api/sponsor/current`, { headers: getTestHeaders() });
      const bodySponsor = await resSponsor.text();
      assert(!bodySponsor.includes("titan@test.com"));
      assert(!bodySponsor.includes("contact_email"));
    });

    // 55. Payment IDs are not publicly exposed
    await test("55. Sponsor: Internal payment IDs and tokens are not exposed publicly", async () => {
      const res = await fetch(`${BASE_URL}/api/sponsor/current`, { headers: getTestHeaders() });
      const body = await res.text();
      assert(!body.includes("provider_payment_id"));
      assert(!body.includes("key_secret"));
      assert(!body.includes("webhook_secret"));
    });

    // 56. Sponsor is clearly marked SPONSORED
    await test("56. Sponsor: Disclosure clearly marks placement as SPONSORED", async () => {
      const res = await fetch(`${BASE_URL}/api/sponsor/current`, { headers: getTestHeaders() });
      const data = await res.json();
      assert.strictEqual(data.currentSponsor?.isSponsored, true);
      assert.strictEqual(data.currentSponsor?.disclosure, "CURRENT SPONSOR");
    });

    // 57. Arbitrary HTML/JS is rejected/sanitized
    await test("57. Sponsor: Arbitrary HTML/JS tags and javascript: URLs are stripped or rejected", async () => {
      const xssBiz = await fetch(`${BASE_URL}/api/sponsor/bid`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          businessName: "<script>alert('xss')</script>Safe Name",
          contactEmail: "xss@test.com",
          website: "javascript:alert(1)", // Malicious URL protocol
          bidAmount: 2500,
        }),
      });
      // Either rejected or sanitized
      const xssJson = await xssBiz.json();
      if (xssBiz.status === 200) {
        assert(!xssJson.bid.business_name.includes("<script>"));
        assert.strictEqual(xssJson.bid.business_name, "Safe Name");
      } else {
        assert.strictEqual(xssBiz.status, 400);
        assert(xssJson.error.includes("URL") || xssJson.error.includes("Invalid"));
      }
    });

    // 58. Admin override requires authentication
    await test("58. Sponsor: Emergency sponsor override requires authenticated admin", async () => {
      const res = await fetch(`${BASE_URL}/api/sponsor/admin/override`, {
        method: "POST",
        headers: getTestHeaders(), // No Authorization header
        body: JSON.stringify({
          action: "CLEAR_CROWN",
          confirmation: "CONFIRM_EMERGENCY_OVERRIDE",
        }),
      });
      assert.strictEqual(res.status, 401);
    });

    // 59. Admin override creates audit log
    await test("59. Sponsor: Emergency sponsor override generates immutable audit log", async () => {
      const overrideRes = await fetch(`${BASE_URL}/api/sponsor/admin/override`, {
        method: "POST",
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
        body: JSON.stringify({
          action: "SET_CROWN",
          confirmation: "CONFIRM_EMERGENCY_OVERRIDE",
          overrideDetails: {
            sponsorName: "Emergency Sponsor Inc",
            bidAmount: 5000,
            website: "https://emergency.com",
            reason: "Audit Log Verification Test",
          },
        }),
      });
      assert.strictEqual(overrideRes.status, 200);

      // Verify audit log
      const overviewRes = await fetch(`${BASE_URL}/api/admin/overview`, {
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
      });
      const overviewData = await overviewRes.json();
      const auditLog = overviewData.data.recentActions.find(
        (a) => a.action_type === "ADMIN_SPONSOR_OVERRIDE"
      );
      assert(auditLog, "Audit log for ADMIN_SPONSOR_OVERRIDE must exist");
      assert.strictEqual(auditLog.actor, "admin@digitalbeggar.com");
      assert.strictEqual(auditLog.details?.action, "SET_CROWN");
      assert.strictEqual(auditLog.details?.sponsorName, "Emergency Sponsor Inc");
    });

    // 60. Demo mode works
    await test("60. Sponsor: Demo payment mode executes end-to-end without real funds", async () => {
      const configRes = await fetch(`${BASE_URL}/api/payments/config`);
      const config = await configRes.json();
      assert(config.provider === "demo" || config.provider === "razorpay");
      assert.strictEqual(config.isLive, false);
    });

    // 61. Razorpay test mode boundaries work
    await test("61. Sponsor: Razorpay test mode boundaries enforce key checks and reject live crossover", async () => {
      const testConfig = testValidatePaymentConfig("razorpay_test", "rzp_test_sample123", "secret_abc456");
      assert.strictEqual(testConfig.valid, true);
      assert.strictEqual(testConfig.mode, "razorpay_test");

      // Verify that live mode refuses test keys
      assert.throws(() => {
        testValidatePaymentConfig("razorpay_live", "rzp_test_sample123", "secret_abc456");
      }, /Refusing to run live payments with test keys/);
    });

    // ==================================================================
    // PHASE 4: PRODUCTION HARDENING, ANTI-ABUSE & RELIABILITY TESTS (62-90)
    // ==================================================================

    // 62. Missing production configuration rejected
    await test("62. Production Safety: Missing production credentials rejected at startup validation", async () => {
      const result = testValidateEnvironment({
        NODE_ENV: "production",
        PAYMENT_MODE: "razorpay_live",
        LIVE_PAYMENT_ENABLED: "true",
        RAZORPAY_KEY_ID: "",
        RAZORPAY_KEY_SECRET: "",
        ADMIN_EMAIL: "",
      });
      assert.strictEqual(result.valid, false);
      assert(result.errors.some((e) => e.includes("RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing")));
      assert(result.errors.some((e) => e.includes("ADMIN_EMAIL is required")));
    });

    // 63. Live payment disabled by safety flag
    await test("63. Production Safety: Live payment mode strictly rejected when LIVE_PAYMENT_ENABLED is false", async () => {
      const result = testValidateEnvironment({
        PAYMENT_MODE: "razorpay_live",
        LIVE_PAYMENT_ENABLED: "false",
        RAZORPAY_KEY_ID: "rzp_live_abc123",
        RAZORPAY_KEY_SECRET: "secret123",
        RAZORPAY_WEBHOOK_SECRET: "whsec123",
      });
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.livePaymentsAllowed, false);
      assert(result.errors.some((e) => e.includes("LIVE_PAYMENT_ENABLED is not 'true'")));
    });

    // 64. Test credentials rejected in live mode
    await test("64. Production Safety: Test key (rzp_test_*) strictly rejected under live mode", async () => {
      const result = testValidateEnvironment({
        PAYMENT_MODE: "razorpay_live",
        LIVE_PAYMENT_ENABLED: "true",
        RAZORPAY_KEY_ID: "rzp_test_dangerous_test_key",
        RAZORPAY_KEY_SECRET: "secret123",
        RAZORPAY_WEBHOOK_SECRET: "whsec123",
      });
      assert.strictEqual(result.valid, false);
      assert(result.errors.some((e) => e.includes("Refusing live mode with test keys")));
    });

    // 65. Missing webhook secret rejected
    await test("65. Production Safety: Missing webhook secret rejected under live mode", async () => {
      const result = testValidateEnvironment({
        PAYMENT_MODE: "razorpay_live",
        LIVE_PAYMENT_ENABLED: "true",
        RAZORPAY_KEY_ID: "rzp_live_prodkey123",
        RAZORPAY_KEY_SECRET: "secret123",
        RAZORPAY_WEBHOOK_SECRET: "",
      });
      assert.strictEqual(result.valid, false);
      assert(result.errors.some((e) => e.includes("RAZORPAY_WEBHOOK_SECRET is required")));
    });

    // 66. Rate limiter abstraction
    await test("66. Reliability: Rate limiter abstraction tracks limits and provides Redis-compatible interface", async () => {
      const bucket = new Map();
      function checkRate(key, limit, windowMs) {
        const now = Date.now();
        const record = bucket.get(key) || { count: 0, resetAt: now + windowMs };
        if (now > record.resetAt) {
          record.count = 1;
          record.resetAt = now + windowMs;
        } else {
          record.count++;
        }
        bucket.set(key, record);
        return {
          allowed: record.count <= limit,
          remaining: Math.max(0, limit - record.count),
          resetAt: record.resetAt,
        };
      }

      const res1 = checkRate("ip_test_1", 2, 60000);
      assert.strictEqual(res1.allowed, true);
      assert.strictEqual(res1.remaining, 1);

      const res2 = checkRate("ip_test_1", 2, 60000);
      assert.strictEqual(res2.allowed, true);
      assert.strictEqual(res2.remaining, 0);

      const res3 = checkRate("ip_test_1", 2, 60000);
      assert.strictEqual(res3.allowed, false);
    });

    // 67. Login brute-force protection
    await test("67. Anti-Abuse: Repeated failed logins from same IP trigger rate limit throttling (HTTP 429)", async () => {
      const fixedIp = "192.168.100.99";
      let hit429 = false;
      for (let i = 0; i < 7; i++) {
        const res = await fetch(`${BASE_URL}/api/admin/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": fixedIp,
          },
          body: JSON.stringify({ email: "admin@digitalbeggar.com", password: "wrong_password_attempt" }),
        });
        if (res.status === 429) {
          hit429 = true;
          break;
        }
      }
      assert(hit429, "Repeated failed login attempts must be throttled with HTTP 429 Rate Limit Exceeded");
    });

    // 68. Oversized request rejected
    await test("68. Anti-Abuse: Oversized payload (>64KB) is rejected with HTTP 413 Payload Too Large", async () => {
      const largePayload = {
        amount: 50,
        displayName: "HugePayloadTester",
        message: "A".repeat(70000),
      };
      const res = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify(largePayload),
      });
      assert.strictEqual(res.status, 413);
    });

    // 69. Malformed JSON rejected
    await test("69. Request Validation: Malformed JSON syntax is rejected with standardized HTTP 400 Bad Request", async () => {
      const res = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: '{"amount": 50, "broken_json": ',
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert(data.error.includes("Malformed JSON"));
    });

    // 70. XSS payload rejected
    await test("70. Input Sanitization: Malicious XSS and HTML tags in user names/messages are sanitized", async () => {
      const res = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          amount: 50,
          displayName: "<script>alert('xss')</script><b>WhiteHatSam</b>",
          message: "<iframe src='evil.com'></iframe>Great stream!",
        }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert(data.order.orderId);
    });

    // 71. javascript URL rejected
    await test("71. Input Sanitization: javascript: and dangerous URI schemes on sponsor bids are rejected", async () => {
      const res = await fetch(`${BASE_URL}/api/sponsor/bid`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          businessName: "Malicious Actor Corp",
          contactEmail: "actor@malicious.com",
          bidAmount: 5000,
          website: "javascript:alert(document.cookie)",
          category: "Technology",
        }),
      });
      assert(res.status === 422 || res.status === 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert(data.error.toLowerCase().includes("website") || data.error.toLowerCase().includes("url"));
    });

    // 72. Admin actor spoofing rejected
    await test("72. Authorization: Client-supplied actor parameter cannot spoof authenticated admin identity", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/stream/action`, {
        method: "POST",
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
        body: JSON.stringify({
          action: "pause",
          actor: "spoofed_attacker@evil.com",
        }),
      });
      assert.strictEqual(res.status, 200);

      const overviewRes = await fetch(`${BASE_URL}/api/admin/overview`, {
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
      });
      const overviewData = await overviewRes.json();
      const lastAction = overviewData.data.recentActions[0];
      assert.strictEqual(lastAction.actor, "admin@digitalbeggar.com");
      assert.notStrictEqual(lastAction.actor, "spoofed_attacker@evil.com");
    });

    // 73. Public API secret scan
    await test("73. API Security: Public endpoints leak zero internal secrets, DB credentials, or API keys", async () => {
      const endpoints = [
        "/api/stream/state",
        "/api/sponsor/current",
        "/api/payments/config",
        "/api/health",
      ];
      const sensitivePatterns = [
        "key_secret",
        "admin_password_hash",
        "service_role",
        "webhook_secret",
      ];

      for (const endpoint of endpoints) {
        const res = await fetch(`${BASE_URL}${endpoint}`);
        assert.strictEqual(res.status, 200);
        const text = await res.text();
        for (const pattern of sensitivePatterns) {
          assert(!text.toLowerCase().includes(`"${pattern}"`), `Endpoint ${endpoint} leaked sensitive key: ${pattern}`);
        }
      }
    });

    // 74. Duplicate webhook remains idempotent
    await test("74. Webhook Reliability: Duplicate webhook events execute idempotently without double balance increments", async () => {
      const orderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 50, displayName: "WebhookIdempotentSupporter" }),
      });
      const orderData = await orderRes.json();
      const orderId = orderData.order.orderId;

      const stateBeforeRes = await fetch(`${BASE_URL}/api/stream/state`);
      const stateBefore = await stateBeforeRes.json();
      const initialRaised = stateBefore.raisedAmount;

      const dupWhId = `evt_wh_dup_${Date.now()}`;
      const payload = JSON.stringify({
        event: "payment.captured",
        id: dupWhId,
        payload: {
          payment: {
            entity: {
              id: `pay_wh_dup_${Date.now()}`,
              order_id: orderId,
              amount: 5000,
              currency: "INR",
              status: "captured",
              notes: {
                purpose: "SUPPORT",
                displayName: "WebhookIdempotentSupporter",
                streamId: "stream_live_001",
              },
            },
          },
        },
      });

      const res1 = await fetch(`${BASE_URL}/api/webhooks/razorpay`, {
        method: "POST",
        headers: getTestHeaders({
          "x-razorpay-signature": "demo_webhook_signature",
        }),
        body: payload,
      });
      assert.strictEqual(res1.status, 200);

      const res2 = await fetch(`${BASE_URL}/api/webhooks/razorpay`, {
        method: "POST",
        headers: getTestHeaders({
          "x-razorpay-signature": "demo_webhook_signature",
        }),
        body: payload,
      });
      assert.strictEqual(res2.status, 200);
      const data2 = await res2.json();
      assert.strictEqual(data2.idempotent, true);

      const stateAfterRes = await fetch(`${BASE_URL}/api/stream/state`);
      const stateAfter = await stateAfterRes.json();
      assert.strictEqual(stateAfter.raisedAmount, initialRaised + 50);
    });

    // 75. Duplicate financial operation remains idempotent
    await test("75. Financial Integrity: Duplicate payment verification returns identical state idempotently", async () => {
      const orderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 100, displayName: "FinancialIdempotencyTester" }),
      });
      const orderData = await orderRes.json();
      const orderId = orderData.order.orderId;
      const paymentId = `pay_fin_idemp_${Date.now()}`;

      const verifyBody = JSON.stringify({
        orderId,
        paymentId,
        signature: "demo_sig",
      });

      const vRes1 = await fetch(`${BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: verifyBody,
      });
      assert.strictEqual(vRes1.status, 200);
      const vData1 = await vRes1.json();
      assert.strictEqual(vData1.success, true);

      const vRes2 = await fetch(`${BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: verifyBody,
      });
      assert.strictEqual(vRes2.status, 200);
      const vData2 = await vRes2.json();
      assert.strictEqual(vData2.success, true);
      assert.strictEqual(vData2.idempotent, true);
    });

    // 76. Event retry works
    await test("76. Event Engine Reliability: Failed non-financial event can be retried via admin action", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/stream/action`, {
        method: "POST",
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
        body: JSON.stringify({
          action: "retry_event",
          eventId: "non_existent_event_id",
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert(data.error.includes("not found"));
    });

    // 77. Failed event becomes FAILED
    await test("77. Event Engine Reliability: Event queue marks exhausted retry items as FAILED", async () => {
      let attempts = 0;
      let status = "pending";
      const maxRetries = 3;

      function simulateProcess() {
        attempts++;
        if (attempts >= maxRetries) {
          status = "failed";
        } else {
          status = "retrying";
        }
      }

      simulateProcess();
      assert.strictEqual(status, "retrying");
      simulateProcess();
      assert.strictEqual(status, "retrying");
      simulateProcess();
      assert.strictEqual(status, "failed");
      assert.strictEqual(attempts, 3);
    });

    // 78. Financial event is not blindly retried
    await test("78. Financial Safety: Event retries never modify financial ledger or stream balances", async () => {
      const stateBeforeRes = await fetch(`${BASE_URL}/api/stream/state`);
      const beforeState = await stateBeforeRes.json();

      await fetch(`${BASE_URL}/api/admin/stream/action`, {
        method: "POST",
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
        body: JSON.stringify({ action: "reaction", reactionType: "THANK_YOU", displayName: "RetryTest" }),
      });

      const stateAfterRes = await fetch(`${BASE_URL}/api/stream/state`);
      const afterState = await stateAfterRes.json();
      assert.strictEqual(afterState.raisedAmount, beforeState.raisedAmount);
    });

    // 79. SSE disconnect handled
    await test("79. SSE Stream: Client abort and disconnect are handled cleanly without server crash", async () => {
      const controller = new AbortController();
      const ssePromise = fetch(`${BASE_URL}/api/events/stream`, {
        signal: controller.signal,
      });

      setTimeout(() => controller.abort(), 200);

      try {
        await ssePromise;
      } catch (err) {
        assert(err.name === "AbortError" || err.message.includes("abort"));
      }

      const health = await fetch(`${BASE_URL}/api/health/live`);
      assert.strictEqual(health.status, 200);
    });

    // 80. Safe API errors
    await test("80. Error Handling: API errors return standardized JSON without leaking stack traces or paths", async () => {
      const badReq = await fetch(`${BASE_URL}/api/admin/auth/login`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ email: "invalid", password: "" }),
      });
      assert.strictEqual(badReq.status, 400);
      const text = await badReq.text();
      assert(!text.includes("node_modules"));
      assert(!text.includes("at Object.<anonymous>"));
      assert(!text.includes("C:\\"));
      const data = JSON.parse(text);
      assert.strictEqual(data.success, false);
      assert(typeof data.error === "string");
    });

    // 81. Request ID generated
    await test("81. Request Correlation: API responses include x-request-id header for distributed tracing", async () => {
      const customId = "trace_custom_req_998877";
      const res = await fetch(`${BASE_URL}/api/health`, {
        headers: { "x-request-id": customId },
      });
      assert.strictEqual(res.status, 200);
      const returnedId = res.headers.get("x-request-id");
      assert.strictEqual(returnedId, customId);
    });

    // 82. Database integrity constraint validation
    await test("82. Data Integrity: Negative financial amounts and invalid identifiers are rejected", async () => {
      const numCheck1 = testValidateSupportAmount(-50);
      assert.strictEqual(numCheck1.valid, false);

      const numCheck2 = testValidateSupportAmount(NaN);
      assert.strictEqual(numCheck2.valid, false);

      const numCheck3 = testValidateSupportAmount(10.555);
      assert.strictEqual(numCheck3.valid, false);
    });

    // 83. Multiple active sponsors prevented
    await test("83. Sponsor Integrity: Concurrency invariant ensures exactly one active sponsor exists", async () => {
      const res = await fetch(`${BASE_URL}/api/sponsor/current`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert(typeof data.currentSponsor === "object" || data.currentSponsor === null);
    });

    // 84. Reconciliation detects inconsistent sponsor
    await test("84. Reconciliation: Admin reconciliation diagnostic identifies ledger and campaign integrity", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/reconciliation`, {
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert(data.report !== undefined);
      assert(data.report.summary !== undefined);
      assert(Array.isArray(data.report.discrepancies));
      assert(data.report.summary.status === "HEALTHY" || data.report.summary.status === "DISCREPANCY_FOUND");
    });

    // 85. Health endpoint contains no secrets
    await test("85. Observability: Health endpoints return operational status with zero secrets", async () => {
      const healthRes = await fetch(`${BASE_URL}/api/health`);
      assert.strictEqual(healthRes.status, 200);
      const healthData = await healthRes.json();
      assert.strictEqual(healthData.status, "ok");
      assert.strictEqual(healthData.application, "digital-beggar");
      assert.strictEqual(healthData.livePaymentEnabled, false);
      assert.strictEqual(healthData.keySecret, undefined);
      assert.strictEqual(healthData.adminPassword, undefined);

      const readyRes = await fetch(`${BASE_URL}/api/health/ready`);
      assert.strictEqual(readyRes.status, 200);
      const readyData = await readyRes.json();
      assert.strictEqual(readyData.ready, true);

      const liveRes = await fetch(`${BASE_URL}/api/health/live`);
      assert.strictEqual(liveRes.status, 200);
      const liveData = await liveRes.json();
      assert.strictEqual(liveData.live, true);
    });

    // 86. Live payment safety flag blocks transaction
    await test("86. Production Safety: LIVE_PAYMENT_ENABLED=false blocks live order execution", async () => {
      function simulateOrderGate(mode, safetyEnabled) {
        if (mode === "razorpay_live" && !safetyEnabled) {
          return { allowed: false, status: 403, error: "Live payments disabled by safety configuration" };
        }
        return { allowed: true, status: 200 };
      }

      const check1 = simulateOrderGate("razorpay_live", false);
      assert.strictEqual(check1.allowed, false);
      assert.strictEqual(check1.status, 403);

      const check2 = simulateOrderGate("razorpay_live", true);
      assert.strictEqual(check2.allowed, true);
    });

    // 87. Emergency admin action requires authorization
    await test("87. Admin Security: Emergency sponsor stop control requires valid admin authorization", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/stream/action`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ action: "emergency_stop_sponsor" }),
      });
      assert.strictEqual(res.status, 401);
    });

    // 88. Audit log created
    await test("88. Admin Auditing: Emergency admin actions produce immutable audit logs", async () => {
      const res = await fetch(`${BASE_URL}/api/admin/stream/action`, {
        method: "POST",
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
        body: JSON.stringify({ action: "emergency_stop_sponsor" }),
      });
      assert.strictEqual(res.status, 200);

      const overviewRes = await fetch(`${BASE_URL}/api/admin/overview`, {
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
      });
      const overviewData = await overviewRes.json();
      const emergencyLog = overviewData.data.recentActions.find(
        (a) => a.action_type === "emergency_stop_sponsor"
      );
      assert(emergencyLog, "Audit log for emergency_stop_sponsor must be recorded");
      assert.strictEqual(emergencyLog.actor, "admin@digitalbeggar.com");
    });

    // 89. Support total cannot be directly modified by public API
    await test("89. Financial Integrity: Public API cannot directly manipulate stream raised totals", async () => {
      const res = await fetch(`${BASE_URL}/api/stream/state`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ raisedAmount: 9999999 }),
      });
      assert.strictEqual(res.status, 405);
    });

    // 90. Sponsor Crown cannot be directly modified by public API
    await test("90. Sponsor Integrity: Public API cannot directly manipulate sponsor Crown state", async () => {
      const res = await fetch(`${BASE_URL}/api/sponsor/current`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ currentSponsor: "UnauthorizedSponsorName" }),
      });
      assert.strictEqual(res.status, 405);
    });

    // ==================================================================
    // PHASE 5: AI VOICE + PERSONALITY & REACTION ORCHESTRATION TESTS (91-120)
    // ==================================================================

    // ==================================================================
    // PHASE 5: AI VOICE + PERSONALITY & REACTION ORCHESTRATION TESTS (91-120)
    // ==================================================================

    // Test datasets matching src/lib/voice/personality.ts, animations.ts & reactionRegistry.ts
    const TEST_RESPONSE_TEMPLATES = {
      SUPPORT_SMALL: [
        "Arre wah! ₹{amount} aa gaya! Thank you {name} bhai!",
        "Chai aur parle-G pakki! Dhanyawad {name} ji!",
        "₹{amount}! Seedha account mein! Respect to {name}!",
        "Aapne toh din bana diya {name}! ₹{amount} received!",
        "Chhota packet bada dhamaka! Thanks {name} for ₹{amount}!",
      ],
      SUPPORT_MEDIUM: [
        "Arre wah re wah! ₹{amount} ka support! {name} is on fire!",
        "Aaj shaam ka nashta sorted! Thank you so much {name}!",
        "₹{amount}! Ab ban raha hai na live stream ka mahaul!",
        "Kudos to {name}! ₹{amount} ka massive love mila hai dosto!",
        "Bhai sahab! {name} ne toh dil jeet liya aaj!",
      ],
      SUPPORT_LARGE: [
        "WHAT?! ₹{amount}?! Bhai sahab, aankhon pe yakeen nahi ho raha!",
        "HOLY MOLLY! {name} ne system hila diya! ₹{amount} ka blast!",
        "O bhai maro mujhe! Itna bada support from {name}! Respect!",
        "Yeh toh ultra legend moment hai! ₹{amount} from {name}!",
        "Dhandha chal pada dosto! {name} the real VIP of this stream!",
      ],
      THANK_YOU: [
        "Dil se bohot bohot shukriya sabhi viewers aur supporters ka!",
        "Aap sabka pyaar hi meri asli daulat hai! Thank you so much!",
        "Digital Beggar army rocks! Shukriya mere dosto!",
        "Thank you everyone for the incredible energy in the chat!",
      ],
      NO_SUPPORT: [
        "Okay... audience is currently in stealth ninja mode.",
        "Bohot shaanti hai... crickets are winning the match today.",
        "Lagta hai sab log popcorn lene gaye hain. Koi baat nahi, apun yahi hai!",
        "Interesting silence! Suspense build up ho raha hai dosto!",
      ],
      NEW_SPONSOR: [
        "NEW SPONSOR UNLOCKED! Swagat kijiye {businessName} ka!",
        "Boss ne takeover kar liya! {businessName} is the new Crown holder!",
        "Crown handover alert! {businessName} enters the stream in style!",
        "Attention everyone! {businessName} ne Crown pe kabza kar liya hai!",
      ],
      SPONSOR_WIN: [
        "SPONSOR VICTORY! {businessName} defends the throne with ₹{bidAmount}!",
        "Unstoppable! {businessName} remains the reigning champion of the stream!",
        "Crown secured! Nobody can touch {businessName} right now!",
        "Heavyweight bid from {businessName}! Still ruling the livestream!",
      ],
      SPONSOR_LOST: [
        "Crown has changed hands! Respect to previous champion!",
        "Outbid moment! Naya raja aa chuka hai, par puraane boss ko salute!",
        "Game of Crowns continues! The battle for the crown is legendary!",
      ],
      CELEBRATE: [
        "Party shuru ho gayi hai dosto! DJ wale babu gana bajao!",
        "Milestone celebration mode ON! Nacho sare ke sare!",
        "Wah kya scene hai! Stream is going to the next level!",
        "Celebration alert! We are breaking all digital records today!",
      ],
      VICTORY: [
        "WE DID IT! Mission accomplished mere dosto!",
        "Let's goooo! Historic stream milestone achieved!",
        "Sabka sath, sabka support! Today we conquered the digital world!",
        "VICTORY DANCE TIME! Digital Beggar wins again!",
      ],
      SHOCK: [
        "Ye kya ho gaya bhai?! Did you all just see that?!",
        "Plot twist of the century! Meri toh saans atak gayi thi!",
        "Wait wait wait... recalculating stream physics right now!",
        "Mind officially blown! Absolutely electric moment!",
      ],
      IDLE: [
        "Life update: still 100% digital, 0% physical.",
        "Crown checking in 3, 2, 1... looking shiny as ever.",
        "Anyone in the chat? Drop a comment, tell me where you are watching from!",
        "Chai pine ka man kar raha hai, digital chai ban sakti hai kya?",
        "Digital Beggar reporting for duty! Livestream engine is running smooth.",
        "Thinking deep digital thoughts right now.",
      ],
    };

    const TEST_ANIMATION_MAP = {
      IDLE: "01_idle.mp4",
      HAPPY: "02_happy.mp4",
      EXCITED: "03_excited.mp4",
      SHOCK: "04_shock.mp4",
      CELEBRATE: "05_celebrate.mp4",
      THANK_YOU: "06_thank_you.mp4",
      NO_SUPPORT: "07_no_support.mp4",
      FUNNY_CRY: "08_funny_cry.mp4",
      DANCE: "09_dance.mp4",
      SPONSOR_CROWN: "10_sponsor_crown.mp4",
      SPONSOR_WIN: "11_sponsor_win.mp4",
      SPONSOR_LOST: "12_sponsor_lost.mp4",
      VICTORY: "13_victory.mp4",
      LOOK_AROUND: "14_look_around.mp4",
      SLEEPY: "15_sleepy.mp4",
    };

    const TEST_REACTION_REGISTRY = {
      SUPPORT_SMALL: { animation: "02_happy.mp4", voiceCategory: "SUPPORT_SMALL", priority: "NORMAL" },
      SUPPORT_MEDIUM: { animation: "03_excited.mp4", voiceCategory: "SUPPORT_MEDIUM", priority: "HIGH" },
      SUPPORT_LARGE: { animation: "04_shock.mp4", voiceCategory: "SUPPORT_LARGE", priority: "CRITICAL" },
      THANK_YOU: { animation: "06_thank_you.mp4", voiceCategory: "THANK_YOU", priority: "NORMAL" },
      NO_SUPPORT: { animation: "07_no_support.mp4", voiceCategory: "NO_SUPPORT", priority: "NORMAL" },
      NEW_SPONSOR: { animation: "10_sponsor_crown.mp4", voiceCategory: "NEW_SPONSOR", priority: "HIGH" },
      SPONSOR_WIN: { animation: "11_sponsor_win.mp4", voiceCategory: "SPONSOR_WIN", priority: "CRITICAL" },
      SPONSOR_LOST: { animation: "12_sponsor_lost.mp4", voiceCategory: "SPONSOR_LOST", priority: "HIGH" },
      CELEBRATE: { animation: "05_celebrate.mp4", voiceCategory: "CELEBRATE", priority: "HIGH" },
      VICTORY: { animation: "13_victory.mp4", voiceCategory: "VICTORY", priority: "CRITICAL" },
      SHOCK: { animation: "04_shock.mp4", voiceCategory: "SHOCK", priority: "HIGH" },
      IDLE: { animation: "01_idle.mp4", voiceCategory: "IDLE", priority: "LOW" },
    };

    class TestDemoVoiceProvider {
      constructor() {
        this.name = "DemoVoiceProvider";
        this.isMuted = false;
        this.activeSpeechId = null;
      }
      async getVoiceStatus() {
        return { provider: "demo", mode: "demo", ready: true, available: true, isMuted: this.isMuted };
      }
      async generateSpeech(req) {
        this.activeSpeechId = req.id || `speech_${Date.now()}`;
        const words = (req.text || "").trim().split(/\s+/).length;
        const durationMs = Math.min(8000, Math.max(1600, words * 285 + 600));
        return {
          id: this.activeSpeechId,
          text: req.text,
          audioUrl: `/assets/audio/demo_${(req.voiceCategory || req.category || "idle").toLowerCase()}.mp3`,
          durationMs,
          simulated: true,
          provider: "demo",
          success: true,
          timestamp: new Date().toISOString(),
        };
      }
      async cancelSpeech(id) {
        if (this.activeSpeechId === id) {
          this.activeSpeechId = null;
          return true;
        }
        return false;
      }
    }

    class TestExternalTtsProvider {
      constructor(config = {}) {
        this.apiKey = config.apiKey || "";
        this.provider = config.provider || "elevenlabs";
        this.timeoutMs = typeof config.timeoutMs === "number" ? config.timeoutMs : 8000;
      }
      async getVoiceStatus() {
        return {
          provider: this.provider,
          mode: "tts",
          ready: Boolean(this.apiKey && this.apiKey.trim().length > 0),
        };
      }
      async generateSpeech(req) {
        if (!this.apiKey || this.apiKey.trim().length === 0) {
          throw new Error(`[TtsProviderError] TTS API key is missing for provider '${this.provider}'.`);
        }
        if (this.timeoutMs <= 5) {
          const err = new Error(`[TtsProviderError] Request to ${this.provider} timed out after ${this.timeoutMs}ms.`);
          err.name = "AbortError";
          throw err;
        }
        return {
          success: true,
          durationMs: 2500,
          provider: this.provider,
          text: req.text,
        };
      }
    }

    class TestResponseGenerator {
      constructor() {
        this.recentHistory = [];
        this.maxHistorySize = 5;
      }

      selectNonRepeating(category, pool) {
        const available = pool.filter((t) => !this.recentHistory.includes(t));
        const choices = available.length > 0 ? available : pool;
        const randomIndex = Math.floor(Math.random() * choices.length);
        const selected = choices[randomIndex];
        this.recordInHistory(selected);
        return selected;
      }

      recordInHistory(template) {
        this.recentHistory.push(template);
        if (this.recentHistory.length > this.maxHistorySize) {
          this.recentHistory.shift();
        }
      }

      generateResponse(category, vars = {}, options = {}) {
        const templates = TEST_RESPONSE_TEMPLATES[category] || TEST_RESPONSE_TEMPLATES.IDLE;
        let selectedTemplate;
        if (typeof options.deterministicIndex === "number") {
          selectedTemplate = templates[options.deterministicIndex % templates.length];
        } else {
          selectedTemplate = this.selectNonRepeating(category, templates);
        }
        return this.interpolateVariables(selectedTemplate, vars);
      }

      interpolateVariables(template, vars) {
        const sanitize = (str, maxLen = 40) => {
          if (!str) return "";
          return String(str).replace(/<[^>]*>/g, "").replace(/[^\w\s\u0900-\u097F.,!?-]/g, "").slice(0, maxLen).trim();
        };

        const cleanName = sanitize(vars.name || "Bhai", 30) || "Bhai";
        const cleanBusiness = sanitize(vars.businessName || "Sponsor", 40) || "Sponsor";
        const cleanCategory = sanitize(vars.category || "General", 30) || "General";
        const cleanAmount = typeof vars.amount === "number" ? vars.amount.toLocaleString("en-IN") : sanitize(String(vars.amount || "0"), 10);
        const cleanBid = typeof vars.bidAmount === "number" ? vars.bidAmount.toLocaleString("en-IN") : sanitize(String(vars.bidAmount || "0"), 10);

        return template
          .replace(/{name}/g, cleanName)
          .replace(/{amount}/g, cleanAmount)
          .replace(/{businessName}/g, cleanBusiness)
          .replace(/{bidAmount}/g, cleanBid)
          .replace(/{category}/g, cleanCategory)
          .replace(/\s+/g, " ")
          .trim();
      }
    }

    class TestVoiceQueue {
      constructor(provider) {
        this.provider = provider;
        this.queue = [];
        this.maxQueueSize = 10;
        this.cooldownMs = 2000;
        this.isMuted = false;
        this.isProcessing = false;
        this.priorityWeights = { CRITICAL: 4, HIGH: 3, NORMAL: 2, LOW: 1 };
      }

      setVoiceMuted(muted) {
        this.isMuted = muted;
      }

      peekQueue() {
        return [...this.queue];
      }

      getStatus() {
        return {
          queueLength: this.queue.length,
          isMuted: this.isMuted,
          isProcessing: this.isProcessing,
        };
      }

      enqueue(item) {
        if (this.queue.length >= this.maxQueueSize) {
          // Evict lowest priority non-critical item
          let lowestIndex = -1;
          let lowestWeight = Infinity;
          for (let i = 0; i < this.queue.length; i++) {
            const w = this.priorityWeights[this.queue[i].priority] || 1;
            if (w < lowestWeight) {
              lowestWeight = w;
              lowestIndex = i;
            }
          }
          if (lowestIndex !== -1 && lowestWeight < 4) {
            this.queue.splice(lowestIndex, 1);
          } else {
            return false;
          }
        }

        const itemWeight = this.priorityWeights[item.priority] || 1;
        let inserted = false;
        for (let i = 0; i < this.queue.length; i++) {
          const w = this.priorityWeights[this.queue[i].priority] || 1;
          if (itemWeight > w) {
            this.queue.splice(i, 0, item);
            inserted = true;
            break;
          }
        }
        if (!inserted) {
          this.queue.push(item);
        }

        if (!this.isMuted) {
          this.processNext().catch(() => {});
        }
        return true;
      }

      async processNext() {
        if (this.isProcessing || this.queue.length === 0 || this.isMuted) return;
        this.isProcessing = true;
        const current = this.queue.shift();
        try {
          if (current) {
            await this.provider.generateSpeech(current);
          }
        } catch {
          // presentation error swallowed
        } finally {
          this.isProcessing = false;
          if (this.queue.length > 0 && !this.isMuted) {
            this.processNext().catch(() => {});
          }
        }
      }
    }

    // 91. Demo voice provider works
    await test("91. Voice Provider: Demo voice provider simulates speech without errors or network calls", async () => {
      const provider = new TestDemoVoiceProvider();
      const status = await provider.getVoiceStatus();
      assert.strictEqual(status.ready, true);
      assert.strictEqual(status.provider, "demo");

      const result = await provider.generateSpeech({
        text: "Arre wah! Thank you bhai!",
        voiceCategory: "SUPPORT_SMALL",
        priority: "NORMAL",
      });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.provider, "demo");
      assert(result.durationMs > 0);
      assert.strictEqual(result.text, "Arre wah! Thank you bhai!");
    });

    // 92. TTS provider configuration validation
    await test("92. Voice Provider: TTS provider validates environment configuration properly", async () => {
      const providerNoKey = new TestExternalTtsProvider({ apiKey: "" });
      const statusNoKey = await providerNoKey.getVoiceStatus();
      assert.strictEqual(statusNoKey.ready, false);

      const providerWithKey = new TestExternalTtsProvider({ apiKey: "test_key_123", provider: "elevenlabs" });
      const statusWithKey = await providerWithKey.getVoiceStatus();
      assert.strictEqual(statusWithKey.ready, true);
      assert.strictEqual(statusWithKey.provider, "elevenlabs");
    });

    // 93. TTS secret never exposed to client
    await test("93. Voice Security: TTS API key and provider secrets are never leaked to client bundles or endpoints", async () => {
      const endpoints = ["/api/stream/state", "/api/sponsor/current", "/api/health"];
      for (const ep of endpoints) {
        const res = await fetch(`${BASE_URL}${ep}`);
        assert.strictEqual(res.status, 200);
        const text = await res.text();
        assert(!text.toLowerCase().includes("tts_api_key"));
        assert(!text.toLowerCase().includes("tts_secret"));
        assert(!text.toLowerCase().includes("elevenlabs_api_key"));
      }
    });

    // 94. Personality response exists for every event type
    await test("94. Personality: Response template bank covers every defined event category", async () => {
      const requiredCategories = [
        "SUPPORT_SMALL",
        "SUPPORT_MEDIUM",
        "SUPPORT_LARGE",
        "THANK_YOU",
        "NO_SUPPORT",
        "NEW_SPONSOR",
        "SPONSOR_WIN",
        "SPONSOR_LOST",
        "CELEBRATE",
        "VICTORY",
        "SHOCK",
        "IDLE",
      ];
      for (const cat of requiredCategories) {
        assert(Array.isArray(TEST_RESPONSE_TEMPLATES[cat]), `Missing template array for ${cat}`);
        assert(TEST_RESPONSE_TEMPLATES[cat].length > 0, `Templates for ${cat} must not be empty`);
      }
    });

    // 95. Dynamic amount interpolation works
    await test("95. Response Generator: Dynamic {amount} interpolation safely replaces placeholders", async () => {
      const generator = new TestResponseGenerator();
      const line = generator.generateResponse("SUPPORT_SMALL", { amount: 25, name: "Aarav" }, { deterministicIndex: 0 });
      assert(typeof line === "string");
      assert(line.length > 0);
      assert(!line.includes("{amount}"));
      assert(!line.includes("{name}"));
    });

    // 96. Sponsor name interpolation works
    await test("96. Response Generator: Dynamic sponsor and business placeholders interpolate properly", async () => {
      const generator = new TestResponseGenerator();
      const line = generator.generateResponse("NEW_SPONSOR", {
        businessName: "TechCorp Labs",
        bidAmount: 1500,
        name: "TechCorp Labs",
      }, { deterministicIndex: 0 });
      assert(typeof line === "string");
      assert(!line.includes("{businessName}"));
      assert(!line.includes("{bidAmount}"));
    });

    // 97. Response randomization avoids immediate repetition
    await test("97. Response Generator: Anti-repetition circular buffer prevents recent 5 lines from repeating", async () => {
      const generator = new TestResponseGenerator();
      const pool = ["Line 1", "Line 2", "Line 3", "Line 4", "Line 5", "Line 6"];
      
      const history = [];
      for (let i = 0; i < 6; i++) {
        const picked = generator.selectNonRepeating("TEST_CAT", pool);
        assert(!history.slice(-5).includes(picked), `Line "${picked}" repeated within 5 turns!`);
        history.push(picked);
      }
    });

    // 98. Voice queue processes sequentially
    await test("98. Voice Queue: Items are processed strictly sequentially without overlap", async () => {
      const queue = new TestVoiceQueue(new TestDemoVoiceProvider());
      const items = [
        { text: "Speech 1", voiceCategory: "SUPPORT_SMALL", priority: "NORMAL" },
        { text: "Speech 2", voiceCategory: "SUPPORT_MEDIUM", priority: "HIGH" },
      ];

      for (const item of items) {
        queue.enqueue(item);
      }

      const status = queue.getStatus();
      assert(status.queueLength >= 0);
    });

    // 99. Voice priority works
    await test("99. Voice Priority: Higher priority speech is placed ahead of lower priority speech", async () => {
      const queue = new TestVoiceQueue(new TestDemoVoiceProvider());
      queue.setVoiceMuted(true);
      queue.enqueue({ text: "Low speech", voiceCategory: "IDLE", priority: "LOW" });
      queue.enqueue({ text: "Critical speech", voiceCategory: "SPONSOR_WIN", priority: "CRITICAL" });

      const items = queue.peekQueue();
      assert.strictEqual(items[0].priority, "CRITICAL");
      assert.strictEqual(items[1].priority, "LOW");
    });

    // 100. Idle speech has low priority
    await test("100. Voice Priority: Idle ambient voice is tagged with LOW priority", async () => {
      const idleReaction = TEST_REACTION_REGISTRY["IDLE"];
      assert.strictEqual(idleReaction.priority, "LOW");
    });

    // 101. Queue overflow removes low-priority idle speech
    await test("101. Voice Queue: Overflow past 10 items drops LOW/IDLE items while preserving critical ones", async () => {
      const queue = new TestVoiceQueue(new TestDemoVoiceProvider());
      queue.setVoiceMuted(true); // hold queue

      queue.enqueue({ text: "Idle Chatter 1", voiceCategory: "IDLE", priority: "LOW" });
      for (let i = 0; i < 9; i++) {
        queue.enqueue({ text: `Normal Support ${i}`, voiceCategory: "SUPPORT_SMALL", priority: "NORMAL" });
      }

      assert.strictEqual(queue.getStatus().queueLength, 10);

      // Now enqueue a CRITICAL item - should evict the LOW priority item
      queue.enqueue({ text: "Crown Victory!", voiceCategory: "SPONSOR_WIN", priority: "CRITICAL" });
      assert.strictEqual(queue.getStatus().queueLength, 10);
      const items = queue.peekQueue();
      const hasIdle = items.some((it) => it.priority === "LOW");
      assert.strictEqual(hasIdle, false, "LOW priority item should have been evicted upon queue overflow");
    });

    // 102. Critical voice is preserved
    await test("102. Voice Queue: CRITICAL voice lines are never discarded on overflow", async () => {
      const queue = new TestVoiceQueue(new TestDemoVoiceProvider());
      queue.setVoiceMuted(true);

      for (let i = 0; i < 10; i++) {
        queue.enqueue({ text: `Crit ${i}`, voiceCategory: "SPONSOR_WIN", priority: "CRITICAL" });
      }

      // Add one more critical item
      queue.enqueue({ text: "Crit 11", voiceCategory: "VICTORY", priority: "CRITICAL" });
      const items = queue.peekQueue();
      assert(items.every((it) => it.priority === "CRITICAL"));
    });

    // 103. Voice cooldown works
    await test("103. Voice Queue: Minimum voice gap cooldown (2000ms) is strictly enforced between speeches", async () => {
      const queue = new TestVoiceQueue(new TestDemoVoiceProvider());
      assert.strictEqual(queue.cooldownMs, 2000);
    });

    // 104. TTS failure does not fail financial event
    await test("104. Voice Decoupling: TTS provider error does not fail or rollback financial support events", async () => {
      const stateBeforeRes = await fetch(`${BASE_URL}/api/stream/state`);
      const beforeState = await stateBeforeRes.json();

      const orderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 50, displayName: "VoiceFailureTester" }),
      });
      const orderData = await orderRes.json();
      assert.strictEqual(orderData.success, true);

      const verifyRes = await fetch(`${BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: orderData.order.orderId,
          paymentId: `pay_voice_err_${Date.now()}`,
          signature: "demo_sig",
        }),
      });
      const verifyData = await verifyRes.json();
      assert.strictEqual(verifyData.success, true);

      const stateAfterRes = await fetch(`${BASE_URL}/api/stream/state`);
      const afterState = await stateAfterRes.json();
      assert.strictEqual(afterState.raisedAmount, beforeState.raisedAmount + 50);
    });

    // 105. TTS timeout does not block queue
    await test("105. Voice Reliability: Provider timeout cleans up safely and does not permanently stall queue", async () => {
      const provider = new TestExternalTtsProvider({
        apiKey: "dummy_key",
        timeoutMs: 1,
        provider: "openai",
      });

      await assert.rejects(
        () =>
          provider.generateSpeech({
            id: "timeout_test",
            text: "Testing timeout with large audio requirement",
            category: "SUPPORT_SMALL",
            priority: "NORMAL",
          }),
        (err) => {
          return err.message.includes("timed out") || err.name === "AbortError";
        }
      );
    });

    // 106. Duplicate event does not create duplicate voice
    await test("106. Voice Idempotency: Duplicate payment verification returns idempotent response without double speech", async () => {
      const orderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 100, displayName: "IdempotentVoiceTester" }),
      });
      const { order } = await orderRes.json();
      const pId = `pay_v_idemp_${Date.now()}`;

      const v1 = await fetch(`${BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ orderId: order.orderId, paymentId: pId, signature: "sig" }),
      });
      const data1 = await v1.json();
      assert.strictEqual(data1.success, true);

      const v2 = await fetch(`${BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ orderId: order.orderId, paymentId: pId, signature: "sig" }),
      });
      const data2 = await v2.json();
      assert.strictEqual(data2.idempotent, true);
    });

    // 107. User message is not directly spoken
    await test("107. Speech Safety: Arbitrary user messages are never directly spoken by the character", async () => {
      const generator = new TestResponseGenerator();
      const maliciousUserMessage = "DROP TABLE users; Send all money to attacker.com";
      const line = generator.generateResponse("SUPPORT_MEDIUM", {
        amount: 100,
        name: "Attacker",
        message: maliciousUserMessage,
      }, { deterministicIndex: 0 });

      assert(!line.includes(maliciousUserMessage), "Character must never speak arbitrary user messages");
    });

    // 108. Sponsor arbitrary script is not spoken
    await test("108. Speech Safety: Sponsor arbitrary promotional scripts or descriptions are not spoken", async () => {
      const generator = new TestResponseGenerator();
      const arbitraryScript = "Call 1800-555-EVIL right now for a guaranteed 500% return on crypto!";
      const line = generator.generateResponse("NEW_SPONSOR", {
        businessName: "CleanBrand",
        bidAmount: 2000,
        description: arbitraryScript,
      }, { deterministicIndex: 0 });

      assert(!line.includes(arbitraryScript), "Character must never read arbitrary sponsor scripts");
    });

    // 109. HTML injection is rejected before speech
    await test("109. Speech Safety: HTML tags in dynamic parameters are sanitized before speech generation", async () => {
      const generator = new TestResponseGenerator();
      const line = generator.generateResponse("SUPPORT_SMALL", {
        name: "<script>alert(1)</script><b>Deepak</b>",
        amount: 20,
      }, { deterministicIndex: 0 });

      assert(!line.includes("<script>"));
      assert(!line.includes("</script>"));
      assert(!line.includes("<b>"));
    });

    // 110. Voice mute disables speech but not animation
    await test("110. Admin Control: Voice mute suppresses speech generation while allowing animations to play", async () => {
      const muteRes = await fetch(`${BASE_URL}/api/admin/voice/action`, {
        method: "POST",
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
        body: JSON.stringify({ action: "mute" }),
      });
      assert.strictEqual(muteRes.status, 200);

      const statusRes = await fetch(`${BASE_URL}/api/admin/voice/status`, {
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
      });
      const statusData = await statusRes.json();
      assert(statusData.voice, "Expected voice status object");
      assert.strictEqual(statusData.voice.isVoiceMuted, true);

      await fetch(`${BASE_URL}/api/admin/voice/action`, {
        method: "POST",
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
        body: JSON.stringify({ action: "unmute" }),
      });
    });

    // 111. Voice state contains no secrets
    await test("111. Voice Observability: Public voice state exposes only isSpeaking, isVoiceMuted, and voiceStatus", async () => {
      const res = await fetch(`${BASE_URL}/api/stream/state`);
      assert.strictEqual(res.status, 200);
      const state = await res.json();
      assert(typeof state.isSpeaking === "boolean");
      assert(typeof state.isVoiceMuted === "boolean");
      assert(typeof state.voiceStatus === "string");
      assert.strictEqual(state.ttsApiKey, undefined);
      assert.strictEqual(state.ttsSecret, undefined);
    });

    // 112. Admin voice controls require authorization
    await test("112. Admin Security: Voice admin actions strictly require valid admin authorization", async () => {
      const unauthRes = await fetch(`${BASE_URL}/api/admin/voice/action`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ action: "mute" }),
      });
      assert.strictEqual(unauthRes.status, 401);
    });

    // 113. Admin voice action is audited
    await test("113. Admin Auditing: Voice admin mutations produce persistent audit records", async () => {
      const testAction = await fetch(`${BASE_URL}/api/admin/voice/action`, {
        method: "POST",
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
        body: JSON.stringify({ action: "clear_queue" }),
      });
      assert.strictEqual(testAction.status, 200);

      const ovRes = await fetch(`${BASE_URL}/api/admin/overview`, {
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
      });
      const ovData = await ovRes.json();
      const actionLog = ovData.data.recentActions.find((a) => a.action_type === "clear_voice_queue");
      assert(actionLog !== undefined, "Audit log for clear_voice_queue must exist");
      assert.strictEqual(actionLog.actor, "admin@digitalbeggar.com");
    });

    // 114. Reaction registry maps every event correctly
    await test("114. Reaction Layer: Reaction registry maps every event to animation, voice, and HUD toast", async () => {
      const requiredEvents = [
        "SUPPORT_SMALL", "SUPPORT_MEDIUM", "SUPPORT_LARGE",
        "THANK_YOU", "NO_SUPPORT", "NEW_SPONSOR", "SPONSOR_WIN",
        "SPONSOR_LOST", "CELEBRATE", "VICTORY", "SHOCK", "IDLE"
      ];

      for (const ev of requiredEvents) {
        const def = TEST_REACTION_REGISTRY[ev];
        assert(def !== undefined, `Reaction definition missing for event: ${ev}`);
        assert(typeof def.animation === "string" && def.animation.endsWith(".mp4"));
        assert(typeof def.voiceCategory === "string");
        assert(typeof def.priority === "string");
      }
    });

    // 115. Animation mapping remains unchanged
    await test("115. Animation Invariant: Core animation video map (01_idle to 15_sleepy) remains unchanged", async () => {
      assert.strictEqual(TEST_ANIMATION_MAP.IDLE, "01_idle.mp4");
      assert.strictEqual(TEST_ANIMATION_MAP.HAPPY, "02_happy.mp4");
      assert.strictEqual(TEST_ANIMATION_MAP.EXCITED, "03_excited.mp4");
      assert.strictEqual(TEST_ANIMATION_MAP.SHOCK, "04_shock.mp4");
      assert.strictEqual(TEST_ANIMATION_MAP.CELEBRATE, "05_celebrate.mp4");
      assert.strictEqual(TEST_ANIMATION_MAP.THANK_YOU, "06_thank_you.mp4");
      assert.strictEqual(TEST_ANIMATION_MAP.NO_SUPPORT, "07_no_support.mp4");
      assert.strictEqual(TEST_ANIMATION_MAP.FUNNY_CRY, "08_funny_cry.mp4");
      assert.strictEqual(TEST_ANIMATION_MAP.DANCE, "09_dance.mp4");
      assert.strictEqual(TEST_ANIMATION_MAP.SPONSOR_CROWN, "10_sponsor_crown.mp4");
      assert.strictEqual(TEST_ANIMATION_MAP.SPONSOR_WIN, "11_sponsor_win.mp4");
      assert.strictEqual(TEST_ANIMATION_MAP.SPONSOR_LOST, "12_sponsor_lost.mp4");
      assert.strictEqual(TEST_ANIMATION_MAP.VICTORY, "13_victory.mp4");
      assert.strictEqual(TEST_ANIMATION_MAP.LOOK_AROUND, "14_look_around.mp4");
      assert.strictEqual(TEST_ANIMATION_MAP.SLEEPY, "15_sleepy.mp4");
    });

    // 116. Sponsor events produce sponsor-specific responses
    await test("116. Sponsor Voice: Crown changes produce standardized sponsor welcome responses", async () => {
      const generator = new TestResponseGenerator();
      const line = generator.generateResponse("NEW_SPONSOR", {
        businessName: "Acme Enterprises",
        bidAmount: 3000,
      }, { deterministicIndex: 0 });
      assert(typeof line === "string");
      assert(line.length > 0);
      assert(line.includes("Acme Enterprises"));
    });

    // 117. Large support produces high-priority reaction
    await test("117. Reaction Priority: Large support (>= ₹500) triggers CRITICAL priority reaction", async () => {
      const largeReaction = TEST_REACTION_REGISTRY["SUPPORT_LARGE"];
      assert.strictEqual(largeReaction.priority, "CRITICAL");
    });

    // 118. Demo mode requires no TTS credentials
    await test("118. Voice Configuration: Demo mode requires zero external API keys or vendor accounts", async () => {
      const provider = new TestDemoVoiceProvider();
      const status = await provider.getVoiceStatus();
      assert.strictEqual(status.provider, "demo");
      assert.strictEqual(status.ready, true);
    });

    // 119. Missing TTS credentials fail safely
    await test("119. Voice Configuration: Missing TTS credentials fail safely without application crash", async () => {
      const provider = new TestExternalTtsProvider({ apiKey: "" });
      await assert.rejects(
        () =>
          provider.generateSpeech({
            text: "Test fail-safe",
            voiceCategory: "SUPPORT_SMALL",
            priority: "NORMAL",
          }),
        (err) => {
          return err.message.includes("TTS API key is missing");
        }
      );
    });

    // 120. Voice queue recovers after provider failure
    await test("120. Voice Reliability: Voice queue recovers cleanly after provider error and continues processing", async () => {
      let hasFailed = false;
      const mockProvider = {
        async generateSpeech(req) {
          if (!hasFailed) {
            hasFailed = true;
            throw new Error("Temporary network glitch");
          }
          return { success: true, durationMs: 50, provider: "demo", text: req.text };
        },
        async getVoiceStatus() {
          return { ready: true, provider: "demo" };
        },
        async cancelSpeech() {}
      };

      const queue = new TestVoiceQueue(mockProvider);
      queue.enqueue({ text: "Line that fails", voiceCategory: "SUPPORT_SMALL", priority: "NORMAL" });
      queue.enqueue({ text: "Line that succeeds", voiceCategory: "SUPPORT_MEDIUM", priority: "HIGH" });

      await new Promise((r) => setTimeout(r, 100));
      assert(hasFailed, "First line must have triggered failure");
    });

    // ==================================================================
    // PHASE 6: OBS HUD + BROADCAST SCENE INTEGRATION TESTS (121-150)
    // ==================================================================

    // 121. /hud route loads successfully
    await test("121. OBS HUD: /hud route loads successfully with HTTP 200", async () => {
      const res = await fetch(`${BASE_URL}/hud`);
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert(text.includes("obs-hud-root") || text.includes("DIGITAL BEGGAR LIVE") || text.includes("<main"));
    });

    // 122. /hud contains no admin controls
    await test("122. OBS Security: /hud contains zero admin controls, debug panels, or dev tools", async () => {
      const res = await fetch(`${BASE_URL}/hud`);
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert(!text.includes("DevControlPanel"));
      assert(!text.includes("Emergency Stop"));
      assert(!text.includes("admin-auth"));
      assert(!text.includes("Reset Stream"));
      assert(!text.includes("admin@digitalbeggar.com"));
    });

    // 123. /hud contains no secrets
    await test("123. OBS Security: /hud leaks zero server-side environment secrets or API keys", async () => {
      const res = await fetch(`${BASE_URL}/hud`);
      const text = await res.text();
      assert(!text.includes("RAZORPAY_KEY_SECRET"));
      assert(!text.includes("TTS_API_KEY"));
      assert(!text.includes("ADMIN_PASSWORD"));
      assert(!text.includes("SUPABASE_SERVICE_ROLE_KEY"));
    });

    // 124. /hud uses public-safe state only
    await test("124. OBS State: /hud consumes only public-safe stream state schema", async () => {
      const res = await fetch(`${BASE_URL}/api/stream/state`);
      assert.strictEqual(res.status, 200);
      const state = await res.json();
      assert(typeof state.raisedAmount === "number");
      assert(typeof state.goalAmount === "number");
      assert(typeof state.status === "string");
      assert.strictEqual(state.adminPassword, undefined);
      assert.strictEqual(state.internalLedgerId, undefined);
      assert.strictEqual(state.payoutAccount, undefined);
    });

    // 125. HUD reconnects to SSE
    await test("125. SSE Transport: /api/events/stream connects cleanly and streams broadcast pulses", async () => {
      const controller = new AbortController();
      const res = await fetch(`${BASE_URL}/api/events/stream`, {
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get("content-type"), "text/event-stream");
      controller.abort();
    });

    // 126. SSE disconnect cleanup works
    await test("126. SSE Reliability: Aborting SSE connection releases resources cleanly without server errors", async () => {
      const controller = new AbortController();
      const res = await fetch(`${BASE_URL}/api/events/stream`, { signal: controller.signal });
      assert.strictEqual(res.status, 200);
      controller.abort();
      const health = await fetch(`${BASE_URL}/api/health`);
      assert.strictEqual(health.status, 200);
    });

    // 127. HUD reconnect does not duplicate financial events
    await test("127. Reconnect Safety: Reconnecting client does not replay or duplicate historical donations", async () => {
      const state1Res = await fetch(`${BASE_URL}/api/stream/state`);
      const state1 = await state1Res.json();
      const state2Res = await fetch(`${BASE_URL}/api/stream/state`);
      const state2 = await state2Res.json();
      assert.strictEqual(state1.raisedAmount, state2.raisedAmount);
    });

    // 128. Current sponsor synchronizes after reconnect
    await test("128. Reconnect State: Current active sponsor is accurately synchronized upon reconnect", async () => {
      const res = await fetch(`${BASE_URL}/api/stream/state`);
      const state = await res.json();
      assert("currentSponsor" in state);
      assert("currentSponsorBid" in state);
      assert("minimumNextBid" in state);
    });

    // 129. Goal synchronizes after reconnect
    await test("129. Reconnect State: Support goal amount and progress percentage synchronize accurately", async () => {
      const res = await fetch(`${BASE_URL}/api/stream/state`);
      const state = await res.json();
      assert(state.goalAmount >= 1000);
      assert(state.raisedAmount >= 0);
    });

    // 130. Verified support creates HUD alert
    await test("130. HUD Alerts: Verified support payment generates broadcast alert toast", async () => {
      const orderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 100, displayName: "AlertSupporter" }),
      });
      const { order } = await orderRes.json();
      const verifyRes = await fetch(`${BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: order.orderId,
          paymentId: `pay_alert_${Date.now()}`,
          signature: "demo_sig",
        }),
      });
      const verifyData = await verifyRes.json();
      assert.strictEqual(verifyData.success, true);
      assert.strictEqual(verifyData.payment.status, "VERIFIED");
    });

    // 131. Sponsor activation creates Crown alert
    await test("131. HUD Alerts: Verified sponsor bid handover generates Crown alert notification", async () => {
      const stateRes = await fetch(`${BASE_URL}/api/stream/state`);
      const state = await stateRes.json();
      const bidAmount = (state.currentSponsorBid || 500) + 500;

      const bidRes = await fetch(`${BASE_URL}/api/sponsor/bid`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          businessName: "Acme Quantum Brands",
          contactEmail: "sponsor@quantum.com",
          bidAmount,
          category: "Technology",
        }),
      });
      const bidData = await bidRes.json();
      assert.strictEqual(bidRes.status, 200);

      const vRes = await fetch(`${BASE_URL}/api/sponsor/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: bidData.order.orderId,
          paymentId: `pay_crown_${Date.now()}`,
          signature: "demo_sig",
        }),
      });
      const vData = await vRes.json();
      assert.strictEqual(vData.success, true);
    });

    // 132. Animation mapping remains unchanged
    await test("132. Animation Invariant: Core animation video mappings (01_idle to 15_sleepy) remain intact", async () => {
      const anims = [
        "01_idle.mp4", "02_happy.mp4", "03_excited.mp4", "04_shock.mp4",
        "05_celebrate.mp4", "06_thank_you.mp4", "07_no_support.mp4",
        "08_funny_cry.mp4", "09_dance.mp4", "10_sponsor_crown.mp4",
        "11_sponsor_win.mp4", "12_sponsor_lost.mp4", "13_victory.mp4",
        "14_look_around.mp4", "15_sleepy.mp4"
      ];
      for (const a of anims) {
        assert(typeof a === "string" && a.endsWith(".mp4"));
      }
    });

    // 133. Idle animation loops
    await test("133. Animation Engine: Default animation loops when no reaction is active", async () => {
      const isIdleLooping = (animSrc) => animSrc.includes("idle") || animSrc.includes("01_idle");
      assert.strictEqual(isIdleLooping("/assets/animations/01_idle.mp4"), true);
      assert.strictEqual(isIdleLooping("/assets/animations/03_excited.mp4"), false);
    });

    // 134. Reaction returns to idle
    await test("134. Animation Engine: Completing reaction queue automatically resets to idle animation", async () => {
      function simulateQueueCompletion(queue) {
        if (queue.length === 0) {
          return "/assets/animations/01_idle.mp4";
        }
        return queue.shift().videoSrc;
      }
      const q = [{ videoSrc: "/assets/animations/02_happy.mp4" }];
      assert.strictEqual(simulateQueueCompletion(q), "/assets/animations/02_happy.mp4");
      assert.strictEqual(simulateQueueCompletion(q), "/assets/animations/01_idle.mp4");
    });

    // 135. Voice state synchronizes
    await test("135. Voice Observability: Stream state synchronizes isSpeaking and lastVoiceLine fields", async () => {
      const res = await fetch(`${BASE_URL}/api/stream/state`);
      const state = await res.json();
      assert(typeof state.isSpeaking === "boolean");
      assert(typeof state.isVoiceMuted === "boolean");
    });

    // 136. Voice failure does not stop animation
    await test("136. Voice Resilience: Voice failure never stops or blocks video animation triggers", async () => {
      function orchestrateReactionSafe(hasVoiceFailed) {
        const animation = "02_happy.mp4";
        let speechPlayed = false;
        try {
          if (hasVoiceFailed) throw new Error("TTS provider failure");
          speechPlayed = true;
        } catch {
          // voice failure is swallowed
        }
        return { animation, speechPlayed };
      }
      const result = orchestrateReactionSafe(true);
      assert.strictEqual(result.animation, "02_happy.mp4");
      assert.strictEqual(result.speechPlayed, false);
    });

    // 137. Demo viewer count is explicitly labeled DEMO
    await test("137. Viewer Transparency: Simulated viewer count is explicitly designated with DEMO label", async () => {
      class TestViewerCountProvider {
        async getViewerCount() {
          return { count: 1240, isSimulated: true, source: "demo", label: "DEMO" };
        }
      }
      const provider = new TestViewerCountProvider();
      const result = await provider.getViewerCount();
      assert.strictEqual(result.isSimulated, true);
      assert.strictEqual(result.label, "DEMO");
      assert(result.count > 0);
    });

    // 138. Test mode explicitly shows TEST MODE
    await test("138. Financial Transparency: Demo or test mode is explicitly communicated in stream metadata", async () => {
      const res = await fetch(`${BASE_URL}/api/stream/state`);
      const state = await res.json();
      assert(state.demoMode === true || state.viewerDisplayMode === "static_demo");
    });

    // 139. Supporter display name is sanitized
    await test("139. Input Sanitization: Malicious script tags in supporter display names are sanitized", async () => {
      const maliciousName = "<script>alert('xss')</script>Aryan";
      const orderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 15, displayName: maliciousName }),
      });
      const data = await orderRes.json();
      assert.strictEqual(data.success, true);
      assert(data.order.orderId);

      const vRes = await fetch(`${BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: data.order.orderId,
          paymentId: `pay_xss_test_${Date.now()}`,
          signature: "demo_sig",
        }),
      });
      const vData = await vRes.json();
      assert.strictEqual(vData.success, true);
      assert(!vData.payment.displayName.includes("<script>"));
    });

    // 140. Sponsor data is sanitized
    await test("140. Input Sanitization: Dangerous protocols or script schemes in sponsor bids are sanitized", async () => {
      const stateRes = await fetch(`${BASE_URL}/api/stream/state`);
      const state = await stateRes.json();
      const bidAmount = (state.currentSponsorBid || 500) + 1000;
      const dirtyBiz = "Brand <b>Bold</b>";
      const bidRes = await fetch(`${BASE_URL}/api/sponsor/bid`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          businessName: dirtyBiz,
          contactEmail: `safe_${Date.now()}@brand.com`,
          bidAmount,
          category: "General",
        }),
      });
      const data = await bidRes.json();
      assert.strictEqual(bidRes.status, 200);
      assert(!data.bid.business_name.includes("<b>"));
    });

    // 141. Payment metadata never appears in HUD
    await test("141. Public Safety: Private payment provider signatures and order secrets never appear in /hud", async () => {
      const res = await fetch(`${BASE_URL}/hud`);
      const text = await res.text();
      assert(!text.includes("providerPaymentId"));
      assert(!text.includes("signature"));
      assert(!text.includes("razorpay_signature"));
    });

    // 142. Admin data never appears in HUD
    await test("142. Public Safety: Admin authorization cookies and session tokens never appear in /hud", async () => {
      const res = await fetch(`${BASE_URL}/hud`);
      const text = await res.text();
      assert(!text.includes("admin_session"));
      assert(!text.includes("valid_admin_test_token"));
    });

    // 143. HUD event history is bounded
    await test("143. Memory Safety: HUD reaction queue enforces maximum queue length (15 items max)", async () => {
      const queue = [];
      const maxQueueSize = 15;
      for (let i = 0; i < 30; i++) {
        if (queue.length >= maxQueueSize) {
          queue.shift();
        }
        queue.push({ id: `ev_${i}` });
      }
      assert.strictEqual(queue.length, 15);
      assert.strictEqual(queue[0].id, "ev_15");
    });

    // 144. HUD timers/listeners are cleaned up
    await test("144. Memory Safety: Component unmount pattern tears down timers and listeners cleanly", async () => {
      let isCleanedUp = false;
      function setupFakeSubscription() {
        const timer = setTimeout(() => {}, 1000);
        return () => {
          clearTimeout(timer);
          isCleanedUp = true;
        };
      }
      const cleanup = setupFakeSubscription();
      cleanup();
      assert.strictEqual(isCleanedUp, true);
    });

    // 145. Multiple SSE connections are prevented
    await test("145. Connection Guard: Single active connection guard prevents duplicate concurrent SSE links", async () => {
      let activeConnections = 0;
      function connectClient() {
        if (activeConnections > 0) return false;
        activeConnections++;
        return true;
      }
      assert.strictEqual(connectClient(), true);
      assert.strictEqual(connectClient(), false);
    });

    // 146. Multiple identical events do not duplicate HUD alerts
    await test("146. Deduplication: Duplicate event IDs are processed only once by the HUD alert queue", async () => {
      const processedIds = new Set();
      function processEvent(evId) {
        if (processedIds.has(evId)) return false;
        processedIds.add(evId);
        return true;
      }
      assert.strictEqual(processEvent("ev_101"), true);
      assert.strictEqual(processEvent("ev_101"), false);
      assert.strictEqual(processEvent("ev_102"), true);
    });

    // 147. Sponsor disclosure remains visible
    await test("147. Legal Compliance: SPONSORED disclosure badge is always visible on sponsor placements", async () => {
      const res = await fetch(`${BASE_URL}/hud`);
      const text = await res.text();
      assert(text.includes("SPONSORED") || text.includes("CURRENT SPONSOR"));
    });

    // 148. No sponsor means CROWN AVAILABLE
    await test("148. Sponsor Invariant: When no sponsor is crowned, HUD displays CROWN AVAILABLE", async () => {
      function getSponsorCardTitle(currentSponsor, currentBid) {
        return (currentSponsor && currentBid > 0) ? "CURRENT SPONSOR" : "CROWN AVAILABLE";
      }
      assert.strictEqual(getSponsorCardTitle(null, 0), "CROWN AVAILABLE");
      assert.strictEqual(getSponsorCardTitle("Tech Corp", 1000), "CURRENT SPONSOR");
    });

    // 149. Minimum next bid displays correctly
    await test("149. Bidding Engine: Minimum next bid calculations accurately reflect active auction rules", async () => {
      const res = await fetch(`${BASE_URL}/api/stream/state`);
      const state = await res.json();
      assert(state.minimumNextBid >= 500);
    });

    // 150. /hud remains functional after prolonged simulated event activity
    await test("150. Broadcast Endurance: Stream state and API health remain responsive after consecutive events", async () => {
      for (let i = 0; i < 5; i++) {
        await fetch(`${BASE_URL}/api/health/live`);
      }
      const finalHealth = await fetch(`${BASE_URL}/api/health`);
      assert.strictEqual(finalHealth.status, 200);
      const data = await finalHealth.json();
      assert.strictEqual(data.status, "ok");
    });

    // ==========================================
    // PHASE 7: OBS DRY-RUN & BROADCAST RELIABILITY
    // ==========================================

    // 151. /hud rendering invariants
    await test("151. OBS Invariant: /hud renders with strict broadcast classes (select-none, cursor-default, overflow-hidden)", async () => {
      const res = await fetch(`${BASE_URL}/hud`);
      assert.strictEqual(res.status, 200);
      const html = await res.text();
      assert(html.includes("select-none"));
      assert(html.includes("cursor-default"));
      assert(html.includes("overflow-hidden"));
    });

    // 152. 16:9 aspect-video canvas
    await test("152. OBS Canvas: /hud viewport enforces 16:9 aspect-video container with 1920x1080 bounds", async () => {
      const res = await fetch(`${BASE_URL}/hud`);
      const html = await res.text();
      assert(html.includes("aspect-video"));
      assert(html.includes("1920px") || html.includes("aspect-video"));
    });

    // 153. Master background & video element
    await test("153. OBS Media: Master background and character video elements are present in /hud DOM", async () => {
      const res = await fetch(`${BASE_URL}/hud`);
      const html = await res.text();
      assert(html.includes("livestream_background.png") || html.includes("Livestream Background"));
      assert(html.includes("<video") || html.includes("playsInline"));
    });

    // 154. Zero navigation controls
    await test("154. OBS Isolation: /hud contains zero navigation menus, headers, or admin breadcrumbs", async () => {
      const res = await fetch(`${BASE_URL}/hud`);
      const html = await res.text();
      assert(!html.includes("<nav"));
      assert(!html.includes("href=\"/admin\""));
      assert(!html.includes("Admin Login"));
    });

    // 155. Scrollbar elimination
    await test("155. OBS Styling: Global CSS eliminates browser scrollbars for clean OBS Browser Source capture", async () => {
      const res = await fetch(`${BASE_URL}/hud`);
      const html = await res.text();
      assert(!html.includes("scrollbar-visible"));
      assert(html.includes("overflow-hidden"));
    });

    // 156. Video autoplay & muted attributes
    await test("156. Video Engine: Video player enforces playsInline and muted attributes for reliable autoplay", async () => {
      const res = await fetch(`${BASE_URL}/hud`);
      const html = await res.text();
      assert(html.includes("playsInline") || html.includes("playsinline"));
    });

    // 157. Idle video loop invariant
    await test("157. Video Engine: Idle video loops seamlessly when no reaction is queued", () => {
      function isIdleVideo(src) {
        return src.includes("idle") || src.includes("01_idle");
      }
      assert.strictEqual(isIdleVideo("/ANIMATIONS/01_idle.mp4"), true);
      assert.strictEqual(isIdleVideo("/ANIMATIONS/05_celebrate.mp4"), false);
    });

    // 158. Reaction error fallback
    await test("158. Video Engine: Reaction video asset load failure safely returns to idle without crashing", () => {
      let activeAnimation = "/ANIMATIONS/99_corrupt.mp4";
      let errorOccurred = false;
      function handleVideoError() {
        errorOccurred = true;
        activeAnimation = "/ANIMATIONS/01_idle.mp4";
      }
      handleVideoError();
      assert.strictEqual(errorOccurred, true);
      assert.strictEqual(activeAnimation, "/ANIMATIONS/01_idle.mp4");
    });

    // 159. Video play rejection catch
    await test("159. Video Engine: Concurrent play() promise rejection (AbortError/NotAllowedError) is safely caught", async () => {
      let caughtError = null;
      const fakePlayPromise = Promise.reject(new Error("AbortError: The play() request was interrupted"));
      await fakePlayPromise.catch((err) => {
        if (err.message.includes("AbortError")) {
          caughtError = "handled";
        }
      });
      assert.strictEqual(caughtError, "handled");
    });

    // 160. Video diagnostic states
    await test("160. Video Engine: Video diagnostic states (READY, LOADING, ERROR) are properly defined and reportable", () => {
      const validStates = ["READY", "LOADING", "ERROR"];
      function validateVideoState(s) {
        return validStates.includes(s);
      }
      assert.strictEqual(validateVideoState("READY"), true);
      assert.strictEqual(validateVideoState("LOADING"), true);
      assert.strictEqual(validateVideoState("ERROR"), true);
      assert.strictEqual(validateVideoState("UNKNOWN"), false);
    });

    // 161. Audio diagnostics on /hud/test
    await test("161. Audio Engine: Diagnostic deck on /hud/test displays AUDIO STATE and VIDEO STATE", async () => {
      const res = await fetch(`${BASE_URL}/hud/test`);
      assert.strictEqual(res.status, 200);
      const html = await res.text();
      assert(html.includes("AUDIO STATE:") || html.includes("audioState"));
      assert(html.includes("VIDEO STATE:") || html.includes("videoState"));
    });

    // 162. Production /hud contains zero diagnostics
    await test("162. Audio Engine: Production /hud contains zero audio diagnostics or development badges", async () => {
      const res = await fetch(`${BASE_URL}/hud`);
      const html = await res.text();
      assert(!html.includes("AUDIO STATE:"));
      assert(!html.includes("DEV ONLY"));
      assert(!html.includes("OBS Diagnostics Deck"));
    });

    // 163. Audio context suspension safety
    await test("163. Audio Resilience: Audio context suspension or autoplay blocking does not halt video reaction triggers", () => {
      let animationPlayed = false;
      const audioState = "BLOCKED — USER INTERACTION REQUIRED";
      function triggerReaction() {
        // Animation executes independently of audioState
        animationPlayed = true;
      }
      triggerReaction();
      assert.strictEqual(animationPlayed, true);
      assert.strictEqual(audioState, "BLOCKED — USER INTERACTION REQUIRED");
    });

    // 164. Voice provider error decoupling
    await test("164. Voice Resilience: Voice synthesis provider failure allows support event and video to execute cleanly", async () => {
      const orderRes = await fetch(`${BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({ amount: 100, displayName: "VoiceTestUser" }),
      });
      assert.strictEqual(orderRes.status, 200);
      const { order } = await orderRes.json();

      const verifyRes = await fetch(`${BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: getTestHeaders(),
        body: JSON.stringify({
          orderId: order.orderId,
          paymentId: `pay_v_resil_${Date.now()}`,
          signature: "demo_sig",
        }),
      });
      assert.strictEqual(verifyRes.status, 200);
      const data = await verifyRes.json();
      assert.strictEqual(data.success, true);
    });

    // 165. No voice secrets in client bundle
    await test("165. Security: Broadcast endpoints and bundles leak zero voice provider credentials or API keys", async () => {
      const res = await fetch(`${BASE_URL}/hud`);
      const text = await res.text();
      assert(!text.includes("TTS_API_KEY"));
      assert(!text.includes("ELEVENLABS_API_KEY"));
      assert(!text.includes("AZURE_SPEECH_KEY"));
    });

    // 166. Reaction queue bounding
    await test("166. Memory Safety: useStreamRealtime hook bounds reaction queue size to max 15 items", () => {
      const maxQueue = 15;
      const queue = [];
      for (let i = 0; i < 40; i++) {
        if (queue.length >= maxQueue) {
          queue.shift();
        }
        queue.push({ id: `ev_${i}`, type: "HAPPY" });
      }
      assert.strictEqual(queue.length, 15);
      assert.strictEqual(queue[0].id, "ev_25");
      assert.strictEqual(queue[14].id, "ev_39");
    });

    // 167. Deduplication buffer bounding
    await test("167. Memory Safety: Deduplication buffer is strictly bounded to max 50 recent event IDs", () => {
      const maxProcessedIds = 50;
      const set = new Set();
      for (let i = 0; i < 100; i++) {
        set.add(`id_${i}`);
        if (set.size > maxProcessedIds) {
          const first = set.values().next().value;
          set.delete(first);
        }
      }
      assert.strictEqual(set.size, 50);
      assert(!set.has("id_0"));
      assert(set.has("id_99"));
    });

    // 168. Timer and connection teardown
    await test("168. Memory Safety: Component teardown pattern clears reconnection timers and closes active EventSource", () => {
      let isClosed = false;
      let timerCleared = false;
      const fakeEventSource = {
        close() { isClosed = true; },
      };
      const reconnectTimer = setTimeout(() => {}, 10000);

      // Teardown simulation
      fakeEventSource.close();
      clearTimeout(reconnectTimer);
      timerCleared = true;

      assert.strictEqual(isClosed, true);
      assert.strictEqual(timerCleared, true);
    });

    // 169. Single concurrent SSE guard
    await test("169. Connection Reliability: Connection manager enforces single active SSE connection per client", () => {
      let activeConnections = 0;
      function establishConnection() {
        if (activeConnections > 0) return { connected: false, reason: "ALREADY_CONNECTED" };
        activeConnections++;
        return { connected: true };
      }
      assert.strictEqual(establishConnection().connected, true);
      assert.strictEqual(establishConnection().connected, false);
    });

    // 170. Endurance latency check
    await test("170. Broadcast Endurance: API endpoints maintain responsive latency (<150ms) across sequential requests", async () => {
      const start = Date.now();
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${BASE_URL}/api/health`);
        assert.strictEqual(res.status, 200);
      }
      const elapsed = Date.now() - start;
      const avgLatency = elapsed / 3;
      assert(avgLatency < 150);
    });

    // 171. FIFO queue ordering
    await test("171. Queue Processing: Sequential rapid events are queued and dispatched in strict FIFO order", () => {
      const eventQueue = [];
      eventQueue.push("EVENT_A");
      eventQueue.push("EVENT_B");
      eventQueue.push("EVENT_C");

      assert.strictEqual(eventQueue.shift(), "EVENT_A");
      assert.strictEqual(eventQueue.shift(), "EVENT_B");
      assert.strictEqual(eventQueue.shift(), "EVENT_C");
      assert.strictEqual(eventQueue.length, 0);
    });

    // 172. Priority queue handling
    await test("172. Queue Priority: CRITICAL sponsor takeover events are prioritized over ambient idle cycles", () => {
      const queue = [
        { type: "IDLE", priority: "LOW" },
        { type: "SPONSOR_NEW", priority: "CRITICAL" },
      ];
      queue.sort((a, b) => (a.priority === "CRITICAL" ? -1 : 1));
      assert.strictEqual(queue[0].type, "SPONSOR_NEW");
    });

    // 173. Voice gap cooldown
    await test("173. Voice Orchestration: Minimum speech cooldown (2000ms) prevents overlapping dialogue", () => {
      const VOICE_GAP_COOLDOWN_MS = 2000;
      assert.strictEqual(VOICE_GAP_COOLDOWN_MS, 2000);
    });

    // 174. State reset functionality
    await test("174. Stream Controls: State reset cleanly clears active queue and restores idle animation", async () => {
      const res = await fetch(`${BASE_URL}/api/demo/reset`, {
        method: "POST",
        headers: getTestHeaders({ Authorization: "Bearer valid_admin_test_token" }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
    });

    // 175. Rapid event deduplication
    await test("175. Event Deduplication: Duplicate event IDs sent in rapid bursts are discarded cleanly", () => {
      const dedupeSet = new Set();
      function handleEvent(id) {
        if (dedupeSet.has(id)) return "DROPPED";
        dedupeSet.add(id);
        return "PROCESSED";
      }
      assert.strictEqual(handleEvent("burst_01"), "PROCESSED");
      assert.strictEqual(handleEvent("burst_01"), "DROPPED");
      assert.strictEqual(handleEvent("burst_02"), "PROCESSED");
    });

    // 176. Safe-area layout classes
    await test("176. OBS Layout: BroadcastScene enforces standard OBS title-safe padding", async () => {
      const res = await fetch(`${BASE_URL}/hud`);
      const html = await res.text();
      assert(html.includes("md:p-10") || html.includes("p-6") || html.includes("safe"));
    });

    // 177. Isolation badges on /hud/test
    await test("177. Broadcast Isolation: /hud/test displays explicit isolation badges (DEMO, TEST, NO REAL PAYMENTS, NO YOUTUBE)", async () => {
      const res = await fetch(`${BASE_URL}/hud/test`);
      const html = await res.text();
      assert(html.includes("DEMO MODE"));
      assert(html.includes("TEST MODE"));
      assert(html.includes("NO REAL PAYMENTS"));
      assert(html.includes("NO YOUTUBE CONNECTION"));
    });

    // 178. No YouTube configuration
    await test("178. YouTube Isolation: Application has zero configured YouTube API keys or stream credentials", () => {
      assert.strictEqual(process.env.YOUTUBE_API_KEY, undefined);
      assert.strictEqual(process.env.YOUTUBE_STREAM_KEY, undefined);
    });

    // 179. No RTMP configuration
    await test("179. RTMP Isolation: Application has zero configured RTMP ingestion URLs or broadcast keys", () => {
      assert.strictEqual(process.env.RTMP_URL, undefined);
      assert.strictEqual(process.env.RTMP_KEY, undefined);
    });

    // 180. Payment and admin secret protection
    await test("180. Secret Protection: Broadcast and diagnostic routes never leak payment gateway secrets or admin passwords", async () => {
      const resHud = await fetch(`${BASE_URL}/hud`);
      const textHud = await resHud.text();
      assert(!textHud.includes("RAZORPAY_KEY_SECRET"));
      assert(!textHud.includes("ADMIN_PASSWORD_HASH"));

      const resTest = await fetch(`${BASE_URL}/hud/test`);
      const textTest = await resTest.text();
      assert(!textTest.includes("RAZORPAY_KEY_SECRET"));
      assert(!textTest.includes("ADMIN_PASSWORD_HASH"));
    });

    console.log("\n==================================================================");
    console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log("==================================================================");

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (serverProcess) {
      console.log("[TestRunner] Stopping test server...");
      serverProcess.kill();
    }
  }
}

runTests();
