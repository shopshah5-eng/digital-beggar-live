"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Coffee,
  Crown,
  Heart,
  Loader2,
  ShieldCheck,
  Sparkles,
  Utensils,
  Zap,
} from "lucide-react";

const SUPPORT_TIERS = [
  {
    amount: 10,
    label: "Chai Support",
    emoji: "☕",
    icon: Coffee,
    reaction: "Thank You Animation",
    color: "from-amber-500/20 to-orange-500/20",
    border: "border-amber-500/40",
    activeText: "text-amber-300",
  },
  {
    amount: 50,
    label: "Snack Break",
    emoji: "🥟",
    icon: Heart,
    reaction: "Thank You Animation",
    color: "from-rose-500/20 to-pink-500/20",
    border: "border-rose-500/40",
    activeText: "text-rose-300",
  },
  {
    amount: 100,
    label: "Proper Lunch",
    emoji: "🍱",
    icon: Utensils,
    reaction: "Shock & Gratitude Animation",
    color: "from-cyan-500/20 to-blue-500/20",
    border: "border-cyan-500/40",
    activeText: "text-cyan-300",
  },
  {
    amount: 500,
    label: "Royal Feast",
    emoji: "👑",
    icon: Crown,
    reaction: "Epic Victory & Dance Animation",
    color: "from-purple-500/20 to-indigo-500/20",
    border: "border-purple-500/40",
    activeText: "text-purple-300",
  },
];

export default function SupportPage() {
  const [selectedAmount, setSelectedAmount] = useState<number>(100);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<{ paymentMode: string; keyId: string }>({
    paymentMode: "demo",
    keyId: "",
  });
  const [successEvent, setSuccessEvent] = useState<{
    id: string;
    amount: number;
    displayName: string;
    reaction: string;
  } | null>(null);
  const [streamGoal, setStreamGoal] = useState<{ raised: number; goal: number } | null>(null);

  // Load Razorpay Checkout SDK dynamically
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);

    fetch("/api/payments/config")
      .then((res) => res.json())
      .then((cfg) => {
        if (cfg.success) {
          setPaymentConfig({ paymentMode: cfg.paymentMode, keyId: cfg.keyId });
        }
      })
      .catch(() => {});

    fetch("/api/stream/state")
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setStreamGoal({ raised: data.raisedAmount, goal: data.goalAmount });
        }
      })
      .catch(() => {});

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const currentAmount = customAmount ? Number(customAmount) : selectedAmount;

  const handleSelectTier = (amt: number) => {
    setSelectedAmount(amt);
    setCustomAmount("");
    setErrorMessage(null);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomAmount(e.target.value);
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!currentAmount || currentAmount < 10) {
      setErrorMessage("Minimum support amount is ₹10.");
      return;
    }

    if (currentAmount > 10000) {
      setErrorMessage("Maximum support amount is ₹10,000.");
      return;
    }

    setLoading(true);
    setStatusMessage("Creating payment order...");

    try {
      // 1. Create order on backend
      const res = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: currentAmount,
          displayName: displayName.trim() || "Anonymous Supporter",
          message: message.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!json.success || !json.order) {
        setErrorMessage(json.error || "Failed to create payment order.");
        setLoading(false);
        setStatusMessage(null);
        return;
      }

      const order = json.order;

      // 2A. DEMO MODE Flow
      if (paymentConfig.paymentMode === "demo" || order.provider === "demo") {
        setStatusMessage("Verifying payment...");
        const verifyRes = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.orderId,
            paymentId: `pay_demo_${Date.now()}`,
          }),
        });

        const verifyJson = await verifyRes.json();
        if (verifyJson.success) {
          setStatusMessage("Support verified!");
          let reactionName = "Thank You Animation";
          if (currentAmount >= 500) reactionName = "Epic Victory & Dance Animation";
          else if (currentAmount >= 100) reactionName = "Shock & Gratitude Animation";

          setSuccessEvent({
            id: verifyJson.payment.id || order.orderId,
            amount: currentAmount,
            displayName: displayName.trim() || "Anonymous Supporter",
            reaction: reactionName,
          });
        } else {
          setErrorMessage(verifyJson.error || "Payment could not be verified.");
        }
        setLoading(false);
        setStatusMessage(null);
        return;
      }

      // 2B. RAZORPAY TEST MODE Flow
      setStatusMessage("Opening secure checkout...");

      if (typeof window === "undefined" || !(window as any).Razorpay) {
        setErrorMessage("Razorpay Checkout SDK not ready. Please refresh the page.");
        setLoading(false);
        setStatusMessage(null);
        return;
      }

      const rzp = new (window as any).Razorpay({
        key: order.keyId || paymentConfig.keyId,
        amount: order.amountPaise,
        currency: order.currency || "INR",
        name: "Digital Beggar",
        description: "Fictional Stream Entertainment Support (TEST MODE)",
        order_id: order.orderId,
        prefill: {
          name: displayName.trim() || "Anonymous Supporter",
        },
        theme: {
          color: "#f59e0b",
        },
        handler: async function (response: any) {
          setStatusMessage("Payment submitted... Verifying payment...");
          try {
            const verifyRes = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              }),
            });

            const verifyJson = await verifyRes.json();
            if (verifyJson.success) {
              setStatusMessage("Support verified!");
              let reactionName = "Thank You Animation";
              if (currentAmount >= 500) reactionName = "Epic Victory & Dance Animation";
              else if (currentAmount >= 100) reactionName = "Shock & Gratitude Animation";

              setSuccessEvent({
                id: verifyJson.payment.id || response.razorpay_payment_id,
                amount: currentAmount,
                displayName: displayName.trim() || "Anonymous Supporter",
                reaction: reactionName,
              });
            } else {
              setErrorMessage(verifyJson.error || "Payment could not be verified.");
            }
          } catch {
            setErrorMessage("Network error during payment verification.");
          } finally {
            setLoading(false);
            setStatusMessage(null);
          }
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
            setStatusMessage(null);
          },
        },
      });

      rzp.open();
    } catch {
      setErrorMessage("Network error processing payment request.");
      setLoading(false);
      setStatusMessage(null);
    }
  };

  const isDemo = paymentConfig.paymentMode === "demo";

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8 selection:bg-amber-500/30 selection:text-amber-200">
      {/* Top Navbar */}
      <nav className="max-w-xl mx-auto w-full flex items-center justify-between pb-6 border-b border-zinc-800/80">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Live Stream</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-mono text-emerald-400 font-semibold">STREAM LIVE</span>
        </div>
      </nav>

      {/* Main Support Card */}
      <main className="max-w-xl mx-auto w-full my-auto py-8">
        {successEvent ? (
          <div className="rounded-3xl bg-zinc-900/80 border border-emerald-500/40 p-8 backdrop-blur-2xl text-center space-y-6 animate-in zoom-in-95 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold">
                Contribution Verified
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                Thank You, {successEvent.displayName}!
              </h2>
              <p className="text-sm text-zinc-400 mt-2">
                Your ₹{successEvent.amount.toLocaleString()} support was verified and broadcast to the live stream.
              </p>
            </div>

            <div className="rounded-2xl bg-zinc-950/80 border border-zinc-800 p-4 font-mono text-xs text-left space-y-2">
              <div className="flex justify-between text-zinc-400">
                <span>Reaction Triggered:</span>
                <span className="text-amber-400 font-semibold">{successEvent.reaction}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Payment Reference:</span>
                <span className="text-zinc-500 truncate max-w-[200px]">{successEvent.id}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Verification Authority:</span>
                <span className="text-emerald-400">Cryptographically Verified Server-Side</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/"
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold text-sm text-center hover:brightness-110 transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)]"
              >
                Watch Stream Reaction Live
              </Link>
              <button
                onClick={() => setSuccessEvent(null)}
                className="px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold transition-all"
              >
                Send Another
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl bg-zinc-900/70 border border-zinc-800/80 p-6 sm:p-8 backdrop-blur-2xl space-y-6 shadow-2xl">
            {/* Header */}
            <div className="text-center space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>INTERACTIVE LIVESTREAM SUPPORT</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Support the Digital Beggar
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400">
                Every verified contribution triggers an authentic character reaction on stream.
              </p>
            </div>

            {/* Mode Banner Notice */}
            <div
              className={`p-3 rounded-2xl border text-xs font-mono flex items-center justify-center gap-2 ${
                isDemo
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  : "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                {isDemo
                  ? "DEMO MODE — No real money is transferred."
                  : "TEST MODE — No real money is transferred. Razorpay Sandbox active."}
              </span>
            </div>

            {/* Error Message Alert */}
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-300 text-xs font-medium flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Goal Progress Snippet */}
            {streamGoal && (
              <div className="rounded-2xl bg-zinc-950/60 border border-zinc-800/80 p-4 space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-zinc-400">Stream Goal Progress:</span>
                  <span className="text-amber-400 font-semibold">
                    ₹{streamGoal.raised.toLocaleString()} / ₹{streamGoal.goal.toLocaleString()}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.round((streamGoal.raised / streamGoal.goal) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Preset Tier Selection */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                  Select Support Amount
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {SUPPORT_TIERS.map((tier) => {
                    const isSelected = !customAmount && selectedAmount === tier.amount;
                    return (
                      <button
                        type="button"
                        key={tier.amount}
                        onClick={() => handleSelectTier(tier.amount)}
                        className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-between min-h-[90px] ${
                          isSelected
                            ? `bg-zinc-800/90 ${tier.border} shadow-[0_0_15px_rgba(245,158,11,0.2)]`
                            : "bg-zinc-950/50 border-zinc-800/80 hover:border-zinc-700 opacity-80 hover:opacity-100"
                        }`}
                      >
                        <span className="text-xl">{tier.emoji}</span>
                        <div className="font-mono font-bold text-sm text-white">₹{tier.amount}</div>
                        <div className="text-[10px] text-zinc-400 truncate w-full">{tier.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Amount */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-zinc-400 flex justify-between">
                  <span>Or Enter Custom Amount (₹)</span>
                  <span className="text-zinc-500">Min ₹10 • Max ₹10,000</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-zinc-400 text-sm font-semibold">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="10"
                    max="10000"
                    placeholder="Custom ₹ amount..."
                    value={customAmount}
                    onChange={handleCustomChange}
                    className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl pl-8 pr-4 py-2.5 text-sm font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60"
                  />
                </div>
              </div>

              {/* Supporter Details */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-zinc-400">Your Display Name</label>
                  <input
                    type="text"
                    maxLength={32}
                    placeholder="Anonymous Supporter"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-zinc-400">Stream Message (Optional)</label>
                  <input
                    type="text"
                    maxLength={100}
                    placeholder="Cheering for you from Mumbai!"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60"
                  />
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={loading || !currentAmount || currentAmount < 10}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 bg-[length:200%_auto] hover:bg-right font-bold text-black text-sm transition-all shadow-[0_0_25px_rgba(245,158,11,0.3)] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    <span>{statusMessage || "Processing payment..."}</span>
                  </span>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-black" />
                    <span>Support ₹{currentAmount ? currentAmount.toLocaleString() : 0}</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-2 text-[11px] font-mono text-zinc-500 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Voluntary entertainment stream support • Cryptographic verification</span>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-zinc-600 font-mono py-4">
        Digital Beggar Live • Fictional Entertainment Stream • 24/7 AI-Stream Interactive Event Engine
      </footer>
    </div>
  );
}
