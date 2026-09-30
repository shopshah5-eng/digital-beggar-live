"use client";

import React, { useState } from "react";
import { StreamState, EventType } from "../lib/types/events";

interface DevControlPanelProps {
  isOpen: boolean;
  onClose: () => void;
  streamState: StreamState;
  isMuted: boolean;
  onToggleMute: () => void;
}

export default function DevControlPanel({
  isOpen,
  onClose,
  streamState,
  isMuted,
  onToggleMute,
}: DevControlPanelProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSupport = async (amount: number, displayName: string = "Anonymous") => {
    setLoadingAction(`support_${amount}`);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/demo/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, displayName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Failed to process support event");
      }
    } catch (err) {
      console.error("Support API error:", err);
      setErrorMessage("Network error calling support API");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSponsorBid = async (businessName: string, bidAmount: number) => {
    setLoadingAction("sponsor");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/demo/sponsor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, bidAmount }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Sponsor bid rejected");
      }
    } catch (err) {
      console.error("Sponsor API error:", err);
      setErrorMessage("Network error calling sponsor API");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReaction = async (type: EventType) => {
    setLoadingAction(`react_${type}`);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/demo/reaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Reaction failed");
      }
    } catch (err) {
      console.error("Reaction API error:", err);
      setErrorMessage("Network error calling reaction API");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReset = async () => {
    setLoadingAction("reset");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Reset failed");
      }
    } catch (err) {
      console.error("Reset API error:", err);
      setErrorMessage("Network error calling reset API");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <aside
      aria-label="Development Simulator Control Panel"
      className="fixed inset-y-0 right-0 w-80 md:w-96 bg-zinc-950/95 backdrop-blur-2xl border-l border-zinc-800 text-zinc-100 z-50 flex flex-col shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200 select-none font-sans"
    >
      {/* Panel Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60 sticky top-0 z-10 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="font-bold text-sm text-white tracking-wide">
              EVENT ENGINE CONTROLLER
            </h2>
          </div>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Backend API &amp; SSE Realtime Architecture
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
          title="Close (Ctrl+Shift+D)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-5 flex-1">
        {/* Error notification banner */}
        {errorMessage && (
          <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center justify-between">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white text-sm font-bold">✕</button>
          </div>
        )}

        {/* Active State Summary from Backend */}
        <div className="bg-zinc-900/80 rounded-xl p-3 border border-zinc-800/80 space-y-1.5 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-zinc-400">Architecture:</span>
            <span className="font-mono text-emerald-400 font-semibold text-[10px] bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded">
              EVENT ENGINE (API + SSE)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Stream Status:</span>
            <span className="font-mono text-emerald-400 font-semibold uppercase">
              {streamState.status}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Goal Raised:</span>
            <span className="font-mono text-amber-400 font-semibold">
              ₹{streamState.raisedAmount.toLocaleString()} / ₹{streamState.goalAmount.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Current Sponsor:</span>
            <span className="font-mono text-zinc-300 truncate max-w-[170px] text-right">
              {streamState.currentSponsor || "None"} (₹{streamState.currentSponsorBid.toLocaleString()})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Next Min Bid:</span>
            <span className="font-mono text-amber-300 font-semibold">
              ₹{streamState.minimumNextBid.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Primary Support Event Triggers via API */}
        <div>
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
            Support Events (POST /api/demo/support)
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              disabled={loadingAction !== null}
              onClick={() => handleSupport(10, "Aarav S.")}
              className="px-3 py-2.5 rounded-xl bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 active:scale-95 transition-all border border-emerald-400/30 flex flex-col items-center justify-center gap-1 disabled:opacity-50"
            >
              <span>₹10 Support</span>
              <span className="text-[10px] opacity-80 font-normal">SUPPORT_SMALL</span>
            </button>

            <button
              disabled={loadingAction !== null}
              onClick={() => handleSupport(100, "Pooja M.")}
              className="px-3 py-2.5 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold text-xs shadow-lg shadow-blue-950/40 active:scale-95 transition-all border border-blue-400/30 flex flex-col items-center justify-center gap-1 disabled:opacity-50"
            >
              <span>₹100 Support</span>
              <span className="text-[10px] opacity-80 font-normal">SUPPORT_MEDIUM</span>
            </button>

            <button
              disabled={loadingAction !== null}
              onClick={() => handleSupport(500, "Vikram R.")}
              className="px-3 py-2.5 rounded-xl bg-gradient-to-b from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-xs shadow-lg shadow-amber-950/40 active:scale-95 transition-all border border-amber-400/30 flex flex-col items-center justify-center gap-1 disabled:opacity-50"
            >
              <span>₹500 Support</span>
              <span className="text-[10px] opacity-80 font-normal">SUPPORT_LARGE</span>
            </button>
          </div>
        </div>

        {/* Core Reaction Events via API */}
        <div>
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
            Quick Reactions (POST /api/demo/reaction)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={loadingAction !== null}
              onClick={() => handleReaction("THANK_YOU")}
              className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs border border-zinc-700 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <span>🙏</span>
              <span>Thank You</span>
            </button>

            <button
              disabled={loadingAction !== null}
              onClick={() => handleReaction("SHOCK")}
              className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs border border-zinc-700 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <span>😱</span>
              <span>Shock</span>
            </button>
          </div>
        </div>

        {/* Sponsor Events via API */}
        <div>
          <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block mb-2">
            👑 Sponsor Takeover (POST /api/demo/sponsor)
          </label>
          <button
            disabled={loadingAction !== null}
            onClick={() => handleSponsorBid("Demo Business", Math.max(5000, streamState.minimumNextBid))}
            className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600 hover:from-amber-500 hover:to-orange-400 text-white font-extrabold text-xs shadow-lg shadow-amber-950/50 active:scale-98 transition-all border border-amber-300/40 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span>👑</span>
            <span>
              Bid ₹{Math.max(5000, streamState.minimumNextBid).toLocaleString()} (Demo Business)
            </span>
          </button>
        </div>

        {/* All Available Animations Library */}
        <div>
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
            Animation Library (10 Event Types)
          </label>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <button
              onClick={() => handleReaction("IDLE")}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-left truncate"
            >
              01 Idle
            </button>
            <button
              onClick={() => handleReaction("SUPPORT_SMALL")}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-left truncate"
            >
              02 Happy
            </button>
            <button
              onClick={() => handleReaction("SUPPORT_MEDIUM")}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-left truncate"
            >
              03 Excited
            </button>
            <button
              onClick={() => handleReaction("SHOCK")}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-left truncate"
            >
              04 Shock
            </button>
            <button
              onClick={() => handleReaction("CELEBRATE")}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-left truncate"
            >
              05 Celebrate
            </button>
            <button
              onClick={() => handleReaction("THANK_YOU")}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-left truncate"
            >
              06 Thank You
            </button>
            <button
              onClick={() => handleReaction("NEW_SPONSOR")}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-left truncate"
            >
              10 Sponsor Crown
            </button>
            <button
              onClick={() => handleReaction("SPONSOR_WIN")}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-left truncate"
            >
              11 Sponsor Win
            </button>
            <button
              onClick={() => handleReaction("SPONSOR_LOST")}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-left truncate"
            >
              12 Sponsor Lost
            </button>
            <button
              onClick={() => handleReaction("VICTORY")}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-left truncate"
            >
              13 Victory
            </button>
          </div>
        </div>

        {/* Stream Settings & OBS Info */}
        <div className="pt-2 border-t border-zinc-800 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={onToggleMute}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                isMuted
                  ? "bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white"
                  : "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              }`}
            >
              {isMuted ? "🔇 Unmute Stream Audio" : "🔊 Audio On (Mute)"}
            </button>

            <button
              disabled={loadingAction !== null}
              onClick={handleReset}
              className="py-2 px-3 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-all disabled:opacity-50"
              title="Reset state via POST /api/demo/reset"
            >
              Reset State
            </button>
          </div>

          <div className="p-2.5 rounded-lg bg-zinc-900/50 border border-zinc-800/80 text-[11px] text-zinc-400 space-y-1">
            <p className="font-semibold text-zinc-300">OBS Testing Notice:</p>
            <p>Dev controls are hidden by default for OBS. Toggle with <kbd className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-300">Ctrl+Shift+D</kbd>.</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
