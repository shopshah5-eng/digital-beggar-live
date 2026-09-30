"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Crown,
  DollarSign,
  ExternalLink,
  Flame,
  Globe,
  Mail,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Clock,
  Briefcase,
  HelpCircle,
  FileText,
} from "lucide-react";

interface PublicSponsorInfo {
  isSponsored: true;
  displayName: string;
  verifiedBid: number;
  website: string;
  category: string;
  campaignStartTime: string;
  disclosure: string;
}

type BidFlowState =
  | "idle"
  | "preparing_bid"
  | "creating_payment"
  | "waiting_payment"
  | "verifying_payment"
  | "checking_crown"
  | "crown_won"
  | "outbid"
  | "error";

export default function SponsorBiddingPage() {
  const [currentSponsor, setCurrentSponsor] = useState<PublicSponsorInfo | null>(null);
  const [minimumNextBid, setMinimumNextBid] = useState<number>(500);
  const [paymentMode, setPaymentMode] = useState<string>("demo");
  const [publicKeyId, setPublicKeyId] = useState<string>("");

  // Form Fields
  const [businessName, setBusinessName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [website, setWebsite] = useState<string>("");
  const [category, setCategory] = useState<string>("Tech & Software");
  const [description, setDescription] = useState<string>("");
  const [bidAmount, setBidAmount] = useState<string>("500");

  // Flow State
  const [flowState, setFlowState] = useState<BidFlowState>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultData, setResultData] = useState<any>(null);

  // Load Razorpay Checkout SDK dynamically & fetch initial state
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);

    // Fetch config
    fetch("/api/payments/config")
      .then((res) => res.json())
      .then((cfg) => {
        if (cfg.success) {
          setPaymentMode(cfg.mode || cfg.paymentMode || "demo");
          setPublicKeyId(cfg.keyId || "");
        }
      })
      .catch(() => {});

    // Fetch current sponsor
    const loadSponsorState = () => {
      fetch("/api/sponsor/current")
        .then((res) => res.json())
        .then((data) => {
          if (data && data.success) {
            setCurrentSponsor(data.currentSponsor);
            setMinimumNextBid(data.minimumNextBid || 500);
            if (flowState === "idle" && (!bidAmount || Number(bidAmount) < data.minimumNextBid)) {
              setBidAmount(String(data.minimumNextBid || 500));
            }
          }
        })
        .catch((err) => console.error("Failed to load sponsor state:", err));
    };

    loadSponsorState();
    const interval = setInterval(loadSponsorState, 5000);

    return () => {
      clearInterval(interval);
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const handleQuickAdd = (increment: number) => {
    const current = Number(bidAmount) || minimumNextBid;
    setBidAmount(String(current + increment));
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setResultData(null);

    const amountNum = Number(bidAmount);
    if (!businessName.trim()) {
      setErrorMessage("Please enter your legal or display business name.");
      return;
    }

    if (!email.trim() || !email.includes("@")) {
      setErrorMessage("Please enter a valid business contact email.");
      return;
    }

    if (!amountNum || amountNum <= 0) {
      setErrorMessage("Please enter a valid numeric bid amount.");
      return;
    }

    if (amountNum < minimumNextBid) {
      setErrorMessage(
        `Bid too low. The authoritative minimum required bid is ₹${minimumNextBid.toLocaleString()}.`
      );
      return;
    }

    try {
      // Step 1: Preparing bid
      setFlowState("preparing_bid");
      setStatusMessage("Preparing business sponsorship bid...");

      // Step 2: Creating payment order
      setFlowState("creating_payment");
      setStatusMessage("Validating minimum bid and generating secure payment order...");

      const bidRes = await fetch("/api/sponsor/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          contactEmail: email.trim(),
          website: website.trim() || undefined,
          category: category.trim(),
          description: description.trim() || undefined,
          bidAmount: amountNum,
        }),
      });

      const bidData = await bidRes.json();
      if (!bidRes.ok || !bidData.success) {
        throw new Error(bidData.error || "Failed to create sponsorship bid.");
      }

      const { order, bid } = bidData;

      // Step 3: Handle Payment Checkout
      if (paymentMode === "razorpay_test" && typeof (window as any).Razorpay !== "undefined") {
        setFlowState("waiting_payment");
        setStatusMessage("Opening Razorpay Test Checkout modal...");

        const options = {
          key: order.keyId || publicKeyId,
          amount: order.amountPaise,
          currency: order.currency || "INR",
          name: "Digital Beggar",
          description: `Sponsor Crown Bid: ${businessName}`,
          order_id: order.orderId,
          prefill: {
            name: businessName,
            email: email,
          },
          theme: {
            color: "#D97706",
          },
          handler: async function (response: any) {
            await verifyPayment({
              orderId: order.orderId,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
          },
          modal: {
            ondismiss: function () {
              setFlowState("idle");
              setStatusMessage(null);
            },
          },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      } else {
        // In Demo / Simulated Mode
        setFlowState("verifying_payment");
        setStatusMessage("Simulating instant sandbox payment...");

        await new Promise((r) => setTimeout(r, 600));

        await verifyPayment({
          orderId: order.orderId,
          paymentId: `pay_demo_${Date.now()}`,
          signature: "demo_sig",
        });
      }
    } catch (err: any) {
      console.error("Bid submission failed:", err);
      setFlowState("error");
      setErrorMessage(err.message || "Failed to process sponsorship bid.");
    }
  };

  const verifyPayment = async (payload: {
    orderId: string;
    paymentId: string;
    signature?: string;
  }) => {
    try {
      setFlowState("verifying_payment");
      setStatusMessage("Cryptographically verifying payment with backend...");

      // Small pause for state visualization
      await new Promise((r) => setTimeout(r, 400));
      setFlowState("checking_crown");
      setStatusMessage("Re-checking current Crown eligibility and atomically crowning...");

      const verifyRes = await fetch("/api/sponsor/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData.error || "Payment verification failed.");
      }

      setResultData(verifyData);

      if (verifyData.crownWon) {
        setFlowState("crown_won");
        setStatusMessage(`👑 Crown Won! ${businessName} is now the active Current Sponsor!`);
      } else if (verifyData.status === "REFUND_REQUIRED") {
        setFlowState("outbid");
        setStatusMessage(
          `Payment verified, but another bid of ₹${verifyData.currentMinimumBid?.toLocaleString()} claimed the Crown simultaneously. Marked for refund resolution.`
        );
      } else {
        setFlowState("crown_won");
      }
    } catch (err: any) {
      console.error("Verification failed:", err);
      setFlowState("error");
      setErrorMessage(err.message || "Payment verification failed.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[550px] h-[550px] rounded-full bg-amber-500/10 blur-[130px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-purple-500/10 blur-[140px]" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 border-b border-white/10 bg-[#0A0A0A]/80 backdrop-blur-xl px-4 py-4 md:px-8 flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors duration-200"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Live Stream</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5 text-amber-400" />
            SPONSOR AUCTION
          </span>
          <span
            className={`px-2 py-0.5 text-xs font-mono rounded ${
              paymentMode === "razorpay_test"
                ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                : "bg-zinc-800 text-zinc-400 border border-white/5"
            }`}
          >
            {paymentMode === "razorpay_test" ? "SANDBOX TEST MODE" : "DEMO SIMULATION"}
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-5xl mx-auto w-full px-4 py-8 md:py-12 flex flex-col gap-10">
        {/* Section A: Current Sponsor Crown Banner */}
        <section className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/30 via-zinc-900/60 to-black p-6 md:p-8 backdrop-blur-xl shadow-2xl shadow-amber-950/20">
          <div className="absolute top-0 right-0 transform translate-x-8 -translate-y-8 w-44 h-44 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="p-3.5 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-inner">
                <Crown className="w-9 h-9 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs uppercase tracking-widest font-extrabold text-amber-400/90 bg-amber-500/15 px-2.5 py-0.5 rounded border border-amber-500/30">
                    CURRENT SPONSOR CROWN 👑
                  </span>
                  <span className="text-[11px] uppercase tracking-wider text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                    PAID PLACEMENT
                  </span>
                </div>
                <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  {currentSponsor?.displayName || "Crown Available — No Active Sponsor"}
                </h1>
                <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-zinc-400">
                  {currentSponsor?.website && (
                    <a
                      href={currentSponsor.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-amber-300 hover:text-amber-200 transition-colors"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>{new URL(currentSponsor.website).hostname}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {currentSponsor?.category && (
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{currentSponsor.category}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex md:flex-col items-center md:items-end justify-between border-t md:border-t-0 border-white/10 pt-4 md:pt-0">
              <div className="text-left md:text-right">
                <p className="text-xs text-zinc-400 font-medium">Verified Active Bid</p>
                <p className="text-2xl md:text-3xl font-black text-amber-400">
                  ₹{(currentSponsor?.verifiedBid || 0).toLocaleString()}
                </p>
              </div>
              <div className="text-right mt-1">
                <p className="text-[11px] text-zinc-400">Next Minimum Bid to Crown</p>
                <p className="text-lg font-bold text-emerald-400">
                  ₹{minimumNextBid.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section B & C: How It Works & Bidding Form Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Section B: How It Works (4 Cols) */}
          <section className="lg:col-span-5 flex flex-col gap-6">
            <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 backdrop-blur-xl">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-amber-400" />
                How the Sponsor Crown Works
              </h2>
              <ol className="space-y-4 text-sm text-zinc-300">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    1
                  </span>
                  <div>
                    <strong className="text-white block font-semibold">Choose your bid</strong>
                    Minimum opening bid is ₹500. Each subsequent bid increases by a fixed ₹500 step.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    2
                  </span>
                  <div>
                    <strong className="text-white block font-semibold">Submit business details</strong>
                    Enter brand name, contact email, website, and industry category.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    3
                  </span>
                  <div>
                    <strong className="text-white block font-semibold">Complete payment</strong>
                    Checkout securely via UPI, Card, or Netbanking in Razorpay Test sandbox.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    4
                  </span>
                  <div>
                    <strong className="text-white block font-semibold">Backend verification</strong>
                    Cryptographic signature is verified server-side. Browser cannot crown itself.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    5
                  </span>
                  <div>
                    <strong className="text-white block font-semibold">Receive the Crown 👑</strong>
                    Character triggers epic Crown animation live on stream and the Sponsor HUD updates.
                  </div>
                </li>
              </ol>
            </div>

            {/* Anti-Abuse & Disclosure Guarantee */}
            <div className="rounded-2xl border border-white/5 bg-zinc-950/40 p-5 text-xs text-zinc-400 flex flex-col gap-2.5">
              <div className="flex items-center gap-2 font-semibold text-zinc-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Anti-Abuse & Content Safety
              </div>
              <p>
                All sponsor submissions are sanitized and rate-limited. Script injection, tracking
                pixels, and executable payloads are strictly blocked. Every sponsorship is clearly
                labeled as <span className="text-amber-400 font-semibold">SPONSORED</span>.
              </p>
            </div>
          </section>

          {/* Section C: Business Form (7 Cols) */}
          <section className="lg:col-span-7">
            <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 md:p-8 backdrop-blur-xl">
              <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                Claim the Sponsor Crown
              </h2>
              <p className="text-xs text-zinc-400 mb-6">
                Fill in your brand profile and place a qualifying bid. Your brand will be crowned live
                to all active stream viewers.
              </p>

              {/* Success / Result Banner */}
              {flowState === "crown_won" && (
                <div className="mb-6 p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 flex items-start gap-3">
                  <Crown className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 animate-bounce" />
                  <div>
                    <p className="font-bold text-amber-300">👑 Congratulations! Crown Won!</p>
                    <p className="text-xs text-zinc-300 mt-1">
                      {statusMessage || `${businessName} has been crowned as the Current Sponsor!`}
                    </p>
                    <Link
                      href="/"
                      className="inline-block mt-3 text-xs font-semibold px-3 py-1.5 rounded bg-amber-500 text-black hover:bg-amber-400 transition-colors"
                    >
                      View Live Stream Reaction →
                    </Link>
                  </div>
                </div>
              )}

              {flowState === "outbid" && (
                <div className="mb-6 p-4 rounded-xl border border-yellow-500/40 bg-yellow-500/10 text-yellow-200 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-yellow-300">Payment Verified — Crown Outbid</p>
                    <p className="text-xs text-zinc-300 mt-1">{statusMessage}</p>
                    <p className="text-[11px] text-zinc-400 mt-2">
                      Note: Because another higher bid completed payment before this one, this bid is
                      marked for manual refund resolution.
                    </p>
                  </div>
                </div>
              )}

              {errorMessage && (
                <div className="mb-6 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Progressive Flow Indicator */}
              {flowState !== "idle" && flowState !== "crown_won" && flowState !== "outbid" && flowState !== "error" && (
                <div className="mb-6 p-4 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-200 text-xs flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                  <div>
                    <p className="font-semibold text-blue-300">{statusMessage}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Business Name */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Brand or Business Name <span className="text-amber-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      maxLength={60}
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g. Acme Cloud Corp"
                      disabled={flowState !== "idle" && flowState !== "error"}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                    />
                  </div>
                </div>

                {/* Email & Website Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Business Email <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="sponsor@brand.com"
                      disabled={flowState !== "idle" && flowState !== "error"}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Website URL (HTTPS)
                    </label>
                    <input
                      type="text"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://brand.com"
                      disabled={flowState !== "idle" && flowState !== "error"}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                    />
                  </div>
                </div>

                {/* Category Selection */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Industry Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={flowState !== "idle" && flowState !== "error"}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                  >
                    <option value="Tech & Software">Tech & Software</option>
                    <option value="Creator & Media">Creator & Media</option>
                    <option value="E-Commerce & Retail">E-Commerce & Retail</option>
                    <option value="Financial & Crypto">Financial & Web3</option>
                    <option value="Gaming & Esports">Gaming & Esports</option>
                    <option value="Food & Beverage">Food & Beverage</option>
                    <option value="General">Other / General</option>
                  </select>
                </div>

                {/* Bid Amount & Quick Increments */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-zinc-300">
                      Sponsorship Bid Amount (INR ₹) <span className="text-amber-400">*</span>
                    </label>
                    <span className="text-[11px] text-zinc-400">
                      Minimum required: <strong className="text-emerald-400">₹{minimumNextBid.toLocaleString()}</strong>
                    </span>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400 font-bold">
                      ₹
                    </div>
                    <input
                      type="number"
                      min={minimumNextBid}
                      max={1000000}
                      step={1}
                      required
                      value={bidAmount}
                      onChange={(e) => setBidAmount(e.target.value)}
                      disabled={flowState !== "idle" && flowState !== "error"}
                      className="w-full bg-black/50 border border-white/10 rounded-xl pl-8 pr-4 py-2.5 text-base font-bold text-amber-400 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                    />
                  </div>

                  {/* Quick Bid Increment Buttons */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setBidAmount(String(minimumNextBid))}
                      className="px-2.5 py-1 text-xs rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-zinc-300 transition-colors"
                    >
                      Exact Min (₹{minimumNextBid.toLocaleString()})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAdd(500)}
                      className="px-2.5 py-1 text-xs rounded-lg border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 text-amber-300 transition-colors"
                    >
                      +₹500
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAdd(1000)}
                      className="px-2.5 py-1 text-xs rounded-lg border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 text-amber-300 transition-colors"
                    >
                      +₹1,000
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickAdd(5000)}
                      className="px-2.5 py-1 text-xs rounded-lg border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 text-amber-300 transition-colors"
                    >
                      +₹5,000
                    </button>
                  </div>
                </div>

                {/* Optional Short Description */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Short Description (Optional, max 200 chars)
                  </label>
                  <textarea
                    rows={2}
                    maxLength={200}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Short punchline for your brand..."
                    disabled={flowState !== "idle" && flowState !== "error"}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
                  />
                </div>

                {/* Submit CTA */}
                <button
                  type="submit"
                  disabled={flowState !== "idle" && flowState !== "error"}
                  className="w-full py-3.5 px-6 rounded-xl font-bold text-black bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 transition-all duration-200 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Crown className="w-5 h-5" />
                  <span>
                    {flowState !== "idle" && flowState !== "error"
                      ? "Processing Sponsorship..."
                      : `Submit Bid & Pay ₹${(Number(bidAmount) || minimumNextBid).toLocaleString()}`}
                  </span>
                </button>
              </form>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
