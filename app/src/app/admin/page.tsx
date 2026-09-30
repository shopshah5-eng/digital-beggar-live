"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Crown,
  Database,
  DollarSign,
  ExternalLink,
  Flame,
  Layers,
  LogOut,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
  Ban,
  X,
} from "lucide-react";

interface AdminOverviewData {
  state: {
    streamId: string;
    status: "active" | "paused" | "offline";
    goalAmount: number;
    raisedAmount: number;
    currentSponsor: string | null;
    currentSponsorBid: number;
    minimumNextBid: number;
    demoMode: boolean;
  };
  metrics: {
    totalRevenue: number;
    totalSupporters: number;
    pendingQueueCount: number;
    repoType: string;
    isPersistent: boolean;
    paymentMode?: string;
    verifiedCount?: number;
    pendingCount?: number;
    failedCount?: number;
  };
  recentSupport: Array<{
    id: string;
    display_name: string;
    amount: number;
    event_type: string;
    status: string;
    created_at: string;
  }>;
  recentBids: Array<{
    id: string;
    business_name: string;
    bid_amount: number;
    status: string;
    created_at: string;
    payment_id?: string | null;
  }>;
  activeCampaign?: {
    id: string;
    sponsor_name: string;
    bid_amount_inr: number;
    website?: string;
    category?: string;
    status: string;
    started_at: string;
    ended_at?: string | null;
  } | null;
  campaignHistory?: Array<{
    id: string;
    sponsor_name: string;
    bid_amount_inr: number;
    status: string;
    started_at: string;
    ended_at?: string | null;
  }>;
  recentActions: Array<{
    id: string;
    action_type: string;
    actor: string;
    details?: Record<string, unknown>;
    created_at: string;
  }>;
  recentPayments?: Array<{
    id: string;
    provider: string;
    provider_order_id?: string;
    provider_payment_id: string;
    amount: number;
    currency: string;
    purpose: string;
    status: string;
    payer_name: string;
    created_at: string;
  }>;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [adminUser, setAdminUser] = useState<{ id: string; email: string } | null>(null);
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [newGoalInput, setNewGoalInput] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"support" | "sponsors" | "payments" | "audit">("support");

  // Sponsor Control & Emergency Override State
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideAction, setOverrideAction] = useState<"CLEAR_CROWN" | "SET_CROWN">("CLEAR_CROWN");
  const [overrideSponsorName, setOverrideSponsorName] = useState("");
  const [overrideBidAmount, setOverrideBidAmount] = useState("");
  const [overrideWebsite, setOverrideWebsite] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideConfirmation, setOverrideConfirmation] = useState("");

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const handleRejectBid = async (bidId: string) => {
    if (!confirm(`Are you sure you want to reject bid ${bidId}?`)) return;
    setActionLoading(`reject_${bidId}`);
    try {
      const res = await fetch("/api/sponsor/bids", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ action: "reject_bid", bidId }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(json.message || "Bid rejected.");
        fetchOverview();
      } else {
        showToast(json.error || "Failed to reject bid", "error");
      }
    } catch {
      showToast("Network error rejecting bid", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleEndSponsor = async () => {
    if (!confirm("Are you sure you want to end the active sponsor campaign? This will remove the Crown.")) return;
    setActionLoading("end_sponsor");
    try {
      const res = await fetch("/api/sponsor/bids", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ action: "end_sponsor" }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(json.message || "Active sponsor ended.");
        fetchOverview();
      } else {
        showToast(json.error || "Failed to end sponsor", "error");
      }
    } catch {
      showToast("Network error ending sponsor", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleEmergencyOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (overrideConfirmation !== "CONFIRM_EMERGENCY_OVERRIDE") {
      showToast("You must enter 'CONFIRM_EMERGENCY_OVERRIDE' to proceed.", "error");
      return;
    }

    if (overrideAction === "SET_CROWN") {
      if (!overrideSponsorName.trim() || !Number(overrideBidAmount)) {
        showToast("Sponsor Name and valid Bid Amount are required.", "error");
        return;
      }
    }

    setActionLoading("emergency_override");
    try {
      const res = await fetch("/api/sponsor/admin/override", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          action: overrideAction,
          confirmation: overrideConfirmation,
          overrideDetails: overrideAction === "SET_CROWN" ? {
            sponsorName: overrideSponsorName.trim(),
            bidAmount: Number(overrideBidAmount),
            website: overrideWebsite.trim(),
            reason: overrideReason.trim() || "Manual Admin Override",
          } : undefined,
        }),
      });

      const json = await res.json();
      if (json.success) {
        showToast(json.message || "Emergency override applied!");
        setOverrideModalOpen(false);
        setOverrideConfirmation("");
        setOverrideSponsorName("");
        setOverrideBidAmount("");
        setOverrideWebsite("");
        setOverrideReason("");
        fetchOverview();
      } else {
        showToast(json.error || "Emergency override failed", "error");
      }
    } catch {
      showToast("Network error executing emergency override", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("admin_token");
      }
      router.push("/admin/login");
    }
  };

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/auth/me", {
        headers: { ...getAuthHeaders() },
      });
      if (res.status === 401 || res.status === 403) {
        router.push("/admin/login");
        return false;
      }
      const json = await res.json();
      if (json.success && json.user) {
        setAdminUser(json.user);
        return true;
      }
      router.push("/admin/login");
      return false;
    } catch {
      router.push("/admin/login");
      return false;
    }
  }, [getAuthHeaders, router]);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/overview", {
        headers: { ...getAuthHeaders() },
      });

      if (res.status === 401 || res.status === 403) {
        router.push("/admin/login");
        return;
      }

      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error("Failed to load admin overview:", err);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, router]);

  useEffect(() => {
    checkAuth();
    fetchOverview();
    const interval = setInterval(fetchOverview, 3000);
    return () => clearInterval(interval);
  }, [checkAuth, fetchOverview]);

  const handleAction = async (action: string, payload: Record<string, unknown> = {}) => {
    setActionLoading(action);
    try {
      const res = await fetch("/api/admin/stream/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ action, ...payload }),
      });

      if (res.status === 401 || res.status === 403) {
        router.push("/admin/login");
        return;
      }

      const json = await res.json();
      if (json.success) {
        showToast(json.message || `Action ${action} executed successfully!`);
        fetchOverview();
      } else {
        showToast(json.error || "Action failed", "error");
      }
    } catch {
      showToast("Network error executing action", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(newGoalInput);
    if (!val || val <= 0) {
      showToast("Please enter a valid positive goal amount", "error");
      return;
    }

    setActionLoading("goal");
    try {
      const res = await fetch("/api/admin/stream/goal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ goalAmount: val }),
      });

      if (res.status === 401 || res.status === 403) {
        router.push("/admin/login");
        return;
      }

      const json = await res.json();
      if (json.success) {
        showToast(json.message || "Goal updated!");
        setNewGoalInput("");
        fetchOverview();
      } else {
        showToast(json.error || "Failed to update goal", "error");
      }
    } catch {
      showToast("Error updating stream goal", "error");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
        <p className="text-zinc-400 font-mono text-sm tracking-wider">CONNECTING TO STREAM REPOSITORY...</p>
      </div>
    );
  }

  const streamState = data?.state;
  const metrics = data?.metrics;
  const progressPercent = streamState
    ? Math.min(100, Math.round((streamState.raisedAmount / (streamState.goalAmount || 1)) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans p-4 sm:p-6 lg:p-8 space-y-8 selection:bg-amber-500/30 selection:text-amber-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl border backdrop-blur-xl shadow-2xl transition-all animate-in fade-in slide-in-from-top-4 ${
            toastMessage.type === "success"
              ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-200"
              : "bg-rose-950/80 border-rose-500/40 text-rose-200"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span className="text-sm font-medium">{toastMessage.text}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Digital Beggar Mission Control
                </h1>
                <span className="px-2.5 py-0.5 text-xs font-mono font-semibold rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  PHASE 5 ADMIN
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-400">
                Stream State Management, Event Queue Telemetry & Financial Ledger
              </p>
            </div>
          </div>
        </div>

        {/* Live Status Indicators & OBS HUD Link */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs font-mono">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-zinc-400">Storage:</span>
            <span className={`font-semibold ${metrics?.isPersistent ? "text-emerald-400" : "text-amber-400"}`}>
              {metrics?.isPersistent ? "Supabase PostgreSQL" : "In-Memory (DEMO)"}
            </span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                streamState?.status === "active"
                  ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]"
                  : "bg-amber-500"
              }`}
            />
            <span className="text-zinc-400">State:</span>
            <span
              className={`font-semibold uppercase ${
                streamState?.status === "active" ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {streamState?.status || "active"}
            </span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs font-mono">
            <span className="text-zinc-400">Gateway:</span>
            <span className="font-semibold text-cyan-400">
              {metrics?.paymentMode === "razorpay_test"
                ? "Razorpay (Test)"
                : metrics?.paymentMode === "razorpay_live"
                ? "Razorpay (Live)"
                : "Demo Mode"}
            </span>
          </div>

          <Link
            href="/"
            target="_blank"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700 text-xs font-medium text-zinc-200 transition-all hover:text-white"
          >
            <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
            <span>Open Livestream HUD</span>
          </Link>

          {adminUser && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span className="truncate max-w-[140px]">{adminUser.email}</span>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-all"
            title="Sign out of administrative session"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Bento Grid: Core Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Raised Revenue */}
        <div className="relative overflow-hidden rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono tracking-wider text-zinc-400 uppercase">Total Raised</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold tracking-tight text-white font-mono">
              ₹{(streamState?.raisedAmount || 0).toLocaleString()}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
              <span>Goal: ₹{(streamState?.goalAmount || 100000).toLocaleString()}</span>
              <span className="font-mono text-emerald-400 font-semibold">{progressPercent}%</span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 2: Current Sponsor */}
        <div className="relative overflow-hidden rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono tracking-wider text-zinc-400 uppercase">Current Sponsor</span>
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Crown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold tracking-tight text-amber-200 truncate">
              {streamState?.currentSponsor || "NO SPONSOR YET"}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs font-mono text-zinc-400">
              <span>Winning Bid:</span>
              <span className="text-amber-400 font-semibold">
                ₹{(streamState?.currentSponsorBid || 0).toLocaleString()}
              </span>
            </div>
            <div className="mt-2 pt-2 border-t border-zinc-800/80 text-[11px] font-mono text-zinc-400 flex justify-between">
              <span>Next Min Bid:</span>
              <span className="text-cyan-400 font-semibold">
                ₹{(streamState?.minimumNextBid || 500).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Total Supporters */}
        <div className="relative overflow-hidden rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono tracking-wider text-zinc-400 uppercase">Supporter Count</span>
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold tracking-tight text-white font-mono">
              {metrics?.totalSupporters || 0}
            </div>
            <p className="mt-2 text-xs text-zinc-400">Verified unique stream contributions</p>
          </div>
        </div>

        {/* Card 4: Event Queue Pipeline */}
        <div className="relative overflow-hidden rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono tracking-wider text-zinc-400 uppercase">Event Queue</span>
            <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-extrabold tracking-tight text-white font-mono">
              {metrics?.pendingQueueCount || 0}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400">
              <span
                className={`w-2 h-2 rounded-full ${
                  (metrics?.pendingQueueCount || 0) > 0 ? "bg-amber-400 animate-ping" : "bg-emerald-400"
                }`}
              />
              <span>
                {(metrics?.pendingQueueCount || 0) === 0 ? "Pipeline idle & responsive" : "Processing reactions"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Interaction Section: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Quick Controls & Reaction Triggers (1 Col) */}
        <div className="space-y-6 lg:col-span-1">
          {/* Stream Master Controls */}
          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-5 backdrop-blur-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
              <Activity className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold tracking-wide uppercase text-zinc-200">
                Stream Controls
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {streamState?.status === "active" ? (
                <button
                  onClick={() => handleAction("pause")}
                  disabled={actionLoading === "pause"}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold transition-all disabled:opacity-50"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause Stream</span>
                </button>
              ) : (
                <button
                  onClick={() => handleAction("resume")}
                  disabled={actionLoading === "resume"}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-all disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Resume Stream</span>
                </button>
              )}

              <button
                onClick={() => {
                  if (confirm("Reset will restore the stream balance to ₹0 and remove the sponsor. Proceed?")) {
                    handleAction("reset");
                  }
                }}
                disabled={actionLoading === "reset"}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-all disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset State</span>
              </button>
            </div>

            {/* Adjust Goal Form */}
            <form onSubmit={handleUpdateGoal} className="pt-2 border-t border-zinc-800/80 space-y-2">
              <label className="text-xs font-mono text-zinc-400 flex items-center justify-between">
                <span>Update Stream Goal (₹)</span>
                <span className="text-zinc-500">Current: ₹{(streamState?.goalAmount || 100000).toLocaleString()}</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="e.g. 150000"
                  value={newGoalInput}
                  onChange={(e) => setNewGoalInput(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60"
                />
                <button
                  type="submit"
                  disabled={actionLoading === "goal"}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-semibold text-xs transition-all hover:brightness-110 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </form>
          </div>

          {/* Manual Character Reaction Triggers */}
          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-5 backdrop-blur-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-semibold tracking-wide uppercase text-zinc-200">
                Trigger Animation
              </h2>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Inject character reaction directly into the event pipeline for OBS testing:
            </p>

            <div className="grid grid-cols-2 gap-2">
              {[
                { type: "THANK_YOU", label: "Thank You (₹10)", color: "emerald" },
                { type: "SHOCK", label: "Shock (₹100)", color: "cyan" },
                { type: "VICTORY", label: "Victory (₹500)", color: "purple" },
                { type: "CELEBRATE", label: "Celebrate", color: "amber" },
                { type: "SPONSOR_WIN", label: "Crown Sponsor", color: "orange" },
                { type: "IDLE", label: "Idle Loop", color: "zinc" },
              ].map((btn) => (
                <button
                  key={btn.type}
                  onClick={() =>
                    handleAction("reaction", { reactionType: btn.type, displayName: "Admin Console" })
                  }
                  disabled={actionLoading === "reaction"}
                  className="px-3 py-2 rounded-xl bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/70 text-xs font-medium text-zinc-200 text-left transition-all hover:border-zinc-500 flex items-center justify-between group disabled:opacity-50"
                >
                  <span>{btn.label}</span>
                  <Flame className="w-3 h-3 text-zinc-500 group-hover:text-amber-400 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Tabbed Data Ledgers (2 Cols) */}
        <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-5 backdrop-blur-xl lg:col-span-2 space-y-4 flex flex-col">
          {/* Navigation Tabs */}
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab("support")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "support"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Support Ledger ({data?.recentSupport.length || 0})
              </button>
              <button
                onClick={() => setActiveTab("sponsors")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "sponsors"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Sponsor Bids ({data?.recentBids.length || 0})
              </button>
              <button
                onClick={() => setActiveTab("payments")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "payments"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Payment Orders ({data?.recentPayments?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab("audit")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "audit"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Audit Log ({data?.recentActions.length || 0})
              </button>
            </div>

            <button
              onClick={fetchOverview}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
              title="Refresh ledger"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-x-auto min-h-[360px]">
            {activeTab === "support" && (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 font-mono uppercase text-[10px]">
                    <th className="py-2.5 px-3">Supporter</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {data?.recentSupport.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-zinc-500">
                        No support transactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    data?.recentSupport.map((item) => (
                      <tr key={item.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-zinc-200">{item.display_name}</td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-emerald-400">
                          ₹{item.amount.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-zinc-400">{item.event_type}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            {item.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-500 font-mono text-[11px]">
                          {new Date(item.created_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {activeTab === "sponsors" && (
              <div className="space-y-6">
                {/* 1. CURRENT CROWN HERO CARD */}
                <div className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-950/30 via-zinc-900/60 to-orange-950/20 p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
                        <Crown className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                            Current Crown Sponsor
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            {data?.activeCampaign ? data.activeCampaign.status : (data?.state.currentSponsor ? "ACTIVE" : "VACANT")}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                          {data?.activeCampaign?.sponsor_name || data?.state.currentSponsor || "No active sponsor"}
                          {data?.activeCampaign?.website && (
                            <a
                              href={data.activeCampaign.website}
                              target="_blank"
                              rel="noreferrer"
                              className="text-zinc-500 hover:text-amber-400 transition-colors"
                              title="Visit website"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </h3>
                        <p className="text-xs text-zinc-400 font-mono mt-0.5">
                          Active Verified Bid:{" "}
                          <span className="text-amber-400 font-semibold">
                            ₹{(data?.activeCampaign?.bid_amount_inr || data?.state.currentSponsorBid || 0).toLocaleString()}
                          </span>{" "}
                          • Next Minimum Bid:{" "}
                          <span className="text-zinc-300">
                            ₹{(data?.state.minimumNextBid || 500).toLocaleString()}
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {(data?.activeCampaign || data?.state.currentSponsor) && (
                        <button
                          onClick={handleEndSponsor}
                          disabled={actionLoading === "end_sponsor"}
                          className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-all disabled:opacity-50"
                        >
                          End Sponsor
                        </button>
                      )}
                      <button
                        onClick={() => setOverrideModalOpen(true)}
                        className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-xs font-semibold transition-all flex items-center gap-1.5"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Emergency Override</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. PENDING & RECENT BIDS */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                      Sponsor Bids & Submissions
                    </h4>
                    <span className="text-[11px] font-mono text-zinc-500">
                      Total: {data?.recentBids.length || 0}
                    </span>
                  </div>

                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500 font-mono uppercase text-[10px]">
                        <th className="py-2.5 px-3">Business Name</th>
                        <th className="py-2.5 px-3">Bid Amount</th>
                        <th className="py-2.5 px-3">Payment / Bid Status</th>
                        <th className="py-2.5 px-3">Submitted</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {data?.recentBids.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-zinc-500">
                            No sponsor bids recorded yet.
                          </td>
                        </tr>
                      ) : (
                        data?.recentBids.map((bid) => (
                          <tr key={bid.id} className="hover:bg-zinc-800/30 transition-colors">
                            <td className="py-2.5 px-3 font-medium text-amber-200">
                              {bid.business_name}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-amber-400">
                              ₹{bid.bid_amount.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                                  bid.status === "verified" ||
                                  bid.status === "accepted" ||
                                  bid.status === "BID_ACCEPTED" ||
                                  bid.status === "PAYMENT_VERIFIED"
                                    ? "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                                    : bid.status === "rejected" || bid.status === "BID_REJECTED"
                                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                                    : bid.status === "REFUND_REQUIRED"
                                    ? "bg-orange-500/20 text-orange-300 border border-orange-500/40"
                                    : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                                }`}
                              >
                                {bid.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-zinc-500 font-mono text-[11px]">
                              {new Date(bid.created_at).toLocaleTimeString()}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {bid.status !== "BID_REJECTED" && bid.status !== "rejected" && (
                                <button
                                  onClick={() => handleRejectBid(bid.id)}
                                  disabled={actionLoading === `reject_${bid.id}`}
                                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-rose-500/20 border border-zinc-700 hover:border-rose-500/40 text-[11px] text-zinc-400 hover:text-rose-300 transition-colors disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 3. SPONSOR CAMPAIGN HISTORY */}
                <div className="space-y-2 pt-4 border-t border-zinc-800/80">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                      Sponsor Campaign History
                    </h4>
                    <span className="text-[11px] font-mono text-zinc-500">
                      Total: {data?.campaignHistory?.length || 0}
                    </span>
                  </div>

                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500 font-mono uppercase text-[10px]">
                        <th className="py-2.5 px-3">Sponsor Name</th>
                        <th className="py-2.5 px-3">Bid Amount</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Started</th>
                        <th className="py-2.5 px-3">Ended</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {!data?.campaignHistory || data.campaignHistory.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-zinc-500">
                            No past campaigns recorded.
                          </td>
                        </tr>
                      ) : (
                        data.campaignHistory.map((camp) => (
                          <tr key={camp.id} className="hover:bg-zinc-800/30 transition-colors">
                            <td className="py-2.5 px-3 font-medium text-zinc-200">
                              {camp.sponsor_name}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-amber-400">
                              ₹{camp.bid_amount_inr.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                                  camp.status === "SPONSOR_ACTIVE"
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                    : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                                }`}
                              >
                                {camp.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-zinc-500 font-mono text-[11px]">
                              {new Date(camp.started_at).toLocaleTimeString()}
                            </td>
                            <td className="py-2.5 px-3 text-zinc-500 font-mono text-[11px]">
                              {camp.ended_at ? new Date(camp.ended_at).toLocaleTimeString() : "Current"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "payments" && (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 font-mono uppercase text-[10px]">
                    <th className="py-2.5 px-3">Payer</th>
                    <th className="py-2.5 px-3">Provider</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Order / Payment ID</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {!data?.recentPayments || data.recentPayments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-zinc-500">
                        No payment records registered yet.
                      </td>
                    </tr>
                  ) : (
                    data.recentPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-2.5 px-3 font-medium text-zinc-200">{p.payer_name}</td>
                        <td className="py-2.5 px-3 font-mono text-zinc-400 capitalize">{p.provider}</td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-emerald-400">
                          ₹{p.amount.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-400">
                          {p.provider_payment_id || p.provider_order_id || p.id}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                              p.status === "VERIFIED" || p.status === "verified" || p.status === "CAPTURED"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                : p.status === "FAILED" || p.status === "REJECTED"
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                                : "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-500 font-mono text-[11px]">
                          {new Date(p.created_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {activeTab === "audit" && (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 font-mono uppercase text-[10px]">
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Actor</th>
                    <th className="py-2.5 px-3">Details</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {data?.recentActions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-zinc-500">
                        No administrative actions logged yet.
                      </td>
                    </tr>
                  ) : (
                    data?.recentActions.map((act) => (
                      <tr key={act.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-cyan-300 font-semibold">{act.action_type}</td>
                        <td className="py-2.5 px-3 text-zinc-300">{act.actor}</td>
                        <td className="py-2.5 px-3 font-mono text-zinc-500 text-[11px]">
                          {act.details ? JSON.stringify(act.details) : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-zinc-500 font-mono text-[11px]">
                          {new Date(act.created_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Emergency Sponsor Override Modal */}
      {overrideModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-zinc-950 border border-amber-500/40 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-zinc-100 uppercase tracking-wide">
                  Emergency Sponsor Override
                </h3>
              </div>
              <button
                onClick={() => setOverrideModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300/90 leading-relaxed">
              <strong className="text-amber-200">Warning:</strong> This administrative override directly alters the active Sponsor Crown. It is recorded in the immutable audit log under <code className="font-mono text-white bg-black/40 px-1 py-0.5 rounded">ADMIN_SPONSOR_OVERRIDE</code> and will <strong>never</strong> generate fake payment records.
            </div>

            <form onSubmit={handleEmergencyOverrideSubmit} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-zinc-400 font-mono">Select Override Action</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOverrideAction("CLEAR_CROWN")}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                      overrideAction === "CLEAR_CROWN"
                        ? "bg-rose-500/20 border-rose-500 text-rose-300"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    Clear Active Crown
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverrideAction("SET_CROWN")}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                      overrideAction === "SET_CROWN"
                        ? "bg-amber-500/20 border-amber-500 text-amber-300"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    Set Crown Sponsor
                  </button>
                </div>
              </div>

              {overrideAction === "SET_CROWN" && (
                <div className="space-y-3 pt-2 border-t border-zinc-800/80">
                  <div>
                    <label className="text-zinc-400 block mb-1">Sponsor Business Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Acme Corporation"
                      value={overrideSponsorName}
                      onChange={(e) => setOverrideSponsorName(e.target.value)}
                      required
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Verified Bid Amount (₹) *</label>
                    <input
                      type="number"
                      placeholder="e.g. 5000"
                      value={overrideBidAmount}
                      onChange={(e) => setOverrideBidAmount(e.target.value)}
                      required
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Website URL (optional)</label>
                    <input
                      type="text"
                      placeholder="https://example.com"
                      value={overrideWebsite}
                      onChange={(e) => setOverrideWebsite(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-400 block mb-1">Override Reason</label>
                    <input
                      type="text"
                      placeholder="Reason for administrative intervention"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                <label className="text-zinc-300 font-medium block">
                  Required Confirmation: Type <span className="font-mono text-amber-400 select-all font-bold">CONFIRM_EMERGENCY_OVERRIDE</span>
                </label>
                <input
                  type="text"
                  placeholder="CONFIRM_EMERGENCY_OVERRIDE"
                  value={overrideConfirmation}
                  onChange={(e) => setOverrideConfirmation(e.target.value)}
                  required
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 font-mono text-amber-300 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => setOverrideModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={overrideConfirmation !== "CONFIRM_EMERGENCY_OVERRIDE" || actionLoading === "emergency_override"}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold transition-all hover:brightness-110 disabled:opacity-40"
                >
                  {actionLoading === "emergency_override" ? "Applying..." : "Execute Emergency Override"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
