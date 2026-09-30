"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldAlert,
  ShieldCheck,
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  Layers,
  FileCheck2,
  Lock,
} from "lucide-react";

interface Discrepancy {
  id: string;
  type: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  details: Record<string, unknown>;
}

interface ReconciliationReport {
  timestamp: string;
  streamId: string;
  summary: {
    totalPaymentsChecked: number;
    totalBidsChecked: number;
    totalCampaignsChecked: number;
    discrepancyCount: number;
    status: "HEALTHY" | "DISCREPANCY_FOUND";
  };
  discrepancies: Discrepancy[];
}

export default function AdminReconciliationPage() {
  const router = useRouter();
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reconciliation", {
        headers: getAuthHeaders(),
      });

      if (res.status === 401 || res.status === 403) {
        router.push("/admin/login");
        return;
      }

      const json = await res.json();
      if (json.success && json.report) {
        setReport(json.report);
      } else {
        setError(json.error || "Failed to load reconciliation report.");
      }
    } catch {
      setError("Network error fetching reconciliation report.");
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, router]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-zinc-100 p-6 md:p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Navigation Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                  Phase 4 Reliability Audit
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
                  Read-Only Diagnostic
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-100">
                Sponsor & Financial Ledger Reconciliation
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchReport}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-300 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh Audit</span>
            </button>
          </div>
        </div>

        {/* Warning Banner */}
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-4 flex items-start gap-3 text-xs text-zinc-400">
          <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p>
            <strong className="text-zinc-200">Zero-Tamper Safety Guarantee:</strong> Reconciliation is strictly diagnostic.
            The platform will <strong>never</strong> automatically rewrite, mutate, or delete historical financial records or audit logs during reconciliation.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Summary Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between text-zinc-400 text-xs font-mono mb-1">
              <span>Audit Status</span>
              {report?.summary.status === "HEALTHY" ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-rose-400" />
              )}
            </div>
            <div className="text-xl font-bold font-mono">
              {report?.summary.status === "HEALTHY" ? (
                <span className="text-emerald-400">HEALTHY</span>
              ) : (
                <span className="text-rose-400">DISCREPANCY</span>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-4 backdrop-blur-xl">
            <div className="text-zinc-400 text-xs font-mono mb-1">Payments Checked</div>
            <div className="text-xl font-bold font-mono text-zinc-100">
              {report?.summary.totalPaymentsChecked || 0}
            </div>
          </div>

          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-4 backdrop-blur-xl">
            <div className="text-zinc-400 text-xs font-mono mb-1">Bids Checked</div>
            <div className="text-xl font-bold font-mono text-zinc-100">
              {report?.summary.totalBidsChecked || 0}
            </div>
          </div>

          <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-4 backdrop-blur-xl">
            <div className="text-zinc-400 text-xs font-mono mb-1">Discrepancies</div>
            <div
              className={`text-xl font-bold font-mono ${
                (report?.summary.discrepancyCount || 0) === 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {report?.summary.discrepancyCount || 0}
            </div>
          </div>
        </div>

        {/* Discrepancies Table */}
        <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800/80 p-5 backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
              Discrepancy Investigation Ledger
            </h3>
            <span className="text-[11px] font-mono text-zinc-500">
              Report Generated: {report?.timestamp ? new Date(report.timestamp).toLocaleTimeString() : "—"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 font-mono uppercase text-[10px]">
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Discrepancy Type</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3">Investigation Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {!report?.discrepancies || report.discrepancies.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-zinc-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <FileCheck2 className="w-8 h-8 text-emerald-500/40" />
                        <span className="text-sm font-medium text-zinc-400">
                          All financial transactions, bids, and active sponsor campaigns are 100% reconciled.
                        </span>
                        <span className="text-xs text-zinc-600">Zero discrepancies detected across ledgers.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  report.discrepancies.map((disc) => (
                    <tr key={disc.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                            disc.severity === "CRITICAL"
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                              : disc.severity === "HIGH"
                              ? "bg-orange-500/20 text-orange-300 border border-orange-500/40"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          }`}
                        >
                          {disc.severity}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-zinc-300 font-semibold">{disc.type}</td>
                      <td className="py-2.5 px-3 text-zinc-300 max-w-md">{disc.description}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-500">
                        {JSON.stringify(disc.details)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
