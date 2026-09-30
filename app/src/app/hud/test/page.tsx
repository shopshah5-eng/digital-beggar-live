"use client";

import React, { useState, useEffect } from "react";
import BroadcastScene from "@/components/BroadcastScene";
import { useStreamRealtime } from "@/lib/hooks/useStreamRealtime";

export default function HudTestPage() {
  const {
    streamState,
    currentAnimation,
    notification,
    isConnected,
    queueLength,
    recentEventsList,
    handleAnimationEnd,
  } = useStreamRealtime();

  const [testLog, setTestLog] = useState<string>("Ready for test triggers");
  const [loading, setLoading] = useState<boolean>(false);
  const [uptimeSeconds, setUptimeSeconds] = useState<number>(0);
  const [isDiagnosticVisible, setIsDiagnosticVisible] = useState<boolean>(true);

  // Diagnostics reported from BroadcastScene
  const [videoState, setVideoState] = useState<"READY" | "LOADING" | "ERROR">("READY");
  const [audioState, setAudioState] = useState<
    "READY" | "BLOCKED — USER INTERACTION REQUIRED" | "ERROR — NON-BLOCKING"
  >("READY");

  // Track Uptime
  useEffect(() => {
    const timer = setInterval(() => {
      setUptimeSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatUptime = (secs: number) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const triggerTestSupport = async (amount: number) => {
    try {
      setLoading(true);
      const res = await fetch("/api/demo/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, displayName: `TestSupporter_${amount}` }),
      });
      const data = await res.json();
      setTestLog(data.success ? `Triggered ₹${amount} test support` : `Error: ${data.error}`);
    } catch (err: any) {
      setTestLog(`Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const triggerTestSponsor = async () => {
    try {
      setLoading(true);
      const bidAmount = (streamState.currentSponsorBid || 500) + 500;
      const res = await fetch("/api/demo/sponsor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: "Acme Quantum Labs",
          bidAmount,
          category: "Technology",
        }),
      });
      const data = await res.json();
      setTestLog(data.success ? `Triggered test sponsor bid ₹${bidAmount}` : `Error: ${data.error}`);
    } catch (err: any) {
      setTestLog(`Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const triggerTestReaction = async (reaction: string) => {
    try {
      setLoading(true);
      const res = await fetch("/api/demo/reaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction }),
      });
      const data = await res.json();
      setTestLog(data.success ? `Triggered reaction ${reaction}` : `Error: ${data.error}`);
    } catch (err: any) {
      setTestLog(`Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const triggerStateReset = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/demo/reset", { method: "POST" });
      const data = await res.json();
      setTestLog(data.success ? "Stream state reset cleanly" : `Reset error: ${data.error}`);
    } catch (err: any) {
      setTestLog(`Reset failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const triggerEnginePause = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/demo/pause", { method: "POST" });
      const data = await res.json();
      setTestLog(data.success ? "Event engine paused" : `Pause error: ${data.error}`);
    } catch (err: any) {
      setTestLog(`Pause failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const triggerEngineResume = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/demo/resume", { method: "POST" });
      const data = await res.json();
      setTestLog(data.success ? "Event engine resumed" : `Resume error: ${data.error}`);
    } catch (err: any) {
      setTestLog(`Resume failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const currentAnimLabel = currentAnimation
    .split("/")
    .pop()
    ?.replace(".mp4", "")
    ?.toUpperCase() || "IDLE";

  const voiceStateLabel = streamState.isSpeaking
    ? "SPEAKING"
    : streamState.isVoiceMuted
    ? "MUTED"
    : "IDLE";

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black select-none cursor-default">
      {/* Broadcast Scene Canvas */}
      <BroadcastScene
        streamState={streamState}
        currentAnimation={currentAnimation}
        notification={notification}
        isMuted={false}
        onAnimationEnd={handleAnimationEnd}
        hudMode="development"
        onDiagnosticsUpdate={(diag) => {
          setVideoState(diag.videoState);
          setAudioState(diag.audioState);
        }}
      />

      {/* Toggle button if minimized */}
      {!isDiagnosticVisible && (
        <button
          onClick={() => setIsDiagnosticVisible(true)}
          className="absolute top-4 right-4 z-50 px-3 py-1.5 rounded-full bg-amber-500/80 hover:bg-amber-500 text-black font-extrabold text-xs shadow-lg transition"
        >
          ⚙️ Open Diagnostics Deck
        </button>
      )}

      {/* Floating Developer Test & Diagnostics Deck (Development / Dry Run ONLY) */}
      {isDiagnosticVisible && (
        <div className="absolute top-4 right-4 z-50 p-4 rounded-2xl bg-zinc-950/90 border border-white/15 backdrop-blur-2xl text-white shadow-2xl w-96 max-h-[92vh] overflow-y-auto text-xs font-sans">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <span className="font-black uppercase tracking-wider text-amber-400">
                OBS Diagnostics Deck
              </span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">
                DEV ONLY
              </span>
            </div>
            <button
              onClick={() => setIsDiagnosticVisible(false)}
              className="text-zinc-400 hover:text-white text-sm px-1.5 py-0.5"
            >
              ✕
            </button>
          </div>

          {/* Isolation Badges */}
          <div className="grid grid-cols-2 gap-1.5 mb-3 font-mono text-[10px]">
            <div className="bg-red-950/40 border border-red-500/30 text-red-300 px-2 py-1 rounded text-center font-bold">
              DEMO MODE
            </div>
            <div className="bg-amber-950/40 border border-amber-500/30 text-amber-300 px-2 py-1 rounded text-center font-bold">
              TEST MODE
            </div>
            <div className="bg-zinc-900 border border-white/10 text-zinc-300 px-2 py-1 rounded text-center font-bold">
              NO REAL PAYMENTS
            </div>
            <div className="bg-blue-950/40 border border-blue-500/30 text-blue-300 px-2 py-1 rounded text-center font-bold">
              NO YOUTUBE CONNECTION
            </div>
          </div>

          {/* Realtime Metrics Grid */}
          <div className="bg-black/60 rounded-xl p-2.5 border border-white/10 mb-3 space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-zinc-400">UPTIME:</span>
              <span className="text-amber-300 font-bold">{formatUptime(uptimeSeconds)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">SSE CONNECTION:</span>
              <span className={isConnected ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                {isConnected ? "CONNECTED" : "DISCONNECTED"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">QUEUE SIZE:</span>
              <span className="text-white font-bold">{queueLength}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">CURRENT REACTION:</span>
              <span className="text-amber-400 font-bold truncate max-w-[170px]">{currentAnimLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">CURRENT VOICE STATE:</span>
              <span className="text-purple-400 font-bold">{voiceStateLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">VIDEO STATE:</span>
              <span className={videoState === "READY" ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                {videoState}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">AUDIO STATE:</span>
              <span className={audioState === "READY" ? "text-emerald-400 font-bold" : "text-amber-400 font-bold truncate max-w-[160px]"}>
                {audioState}
              </span>
            </div>
          </div>

          {/* Action Trigger Buttons */}
          <div className="space-y-2 mb-3">
            <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
              Trigger Support Simulation:
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => triggerTestSupport(10)}
                disabled={loading}
                className="px-2 py-1.5 rounded-lg font-bold bg-zinc-800 hover:bg-zinc-700 transition"
              >
                ₹10 Support
              </button>
              <button
                onClick={() => triggerTestSupport(100)}
                disabled={loading}
                className="px-2 py-1.5 rounded-lg font-bold bg-zinc-800 hover:bg-zinc-700 transition"
              >
                ₹100 Support
              </button>
              <button
                onClick={() => triggerTestSupport(500)}
                disabled={loading}
                className="px-2 py-1.5 rounded-lg font-bold bg-amber-600 hover:bg-amber-500 transition"
              >
                ₹500 Blast
              </button>
            </div>

            <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider pt-1">
              Trigger Sponsor & Reactions:
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={triggerTestSponsor}
                disabled={loading}
                className="px-2 py-1.5 rounded-lg font-bold bg-gradient-to-r from-amber-600 to-yellow-500 hover:brightness-110 transition shadow text-center"
              >
                👑 Sponsor Bid
              </button>
              <button
                onClick={() => triggerTestReaction("DANCE")}
                disabled={loading}
                className="px-2 py-1.5 rounded-lg font-bold bg-purple-700 hover:bg-purple-600 transition"
              >
                💃 Dance
              </button>
              <button
                onClick={() => triggerTestReaction("HAPPY")}
                disabled={loading}
                className="px-2 py-1.5 rounded-lg font-bold bg-zinc-800 hover:bg-zinc-700 transition"
              >
                😊 Happy
              </button>
              <button
                onClick={() => triggerTestReaction("CELEBRATE")}
                disabled={loading}
                className="px-2 py-1.5 rounded-lg font-bold bg-zinc-800 hover:bg-zinc-700 transition"
              >
                🎉 Celebrate
              </button>
            </div>

            <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider pt-1">
              Engine Controls:
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={triggerEnginePause}
                disabled={loading}
                className="px-2 py-1.5 rounded-lg font-bold bg-zinc-800 hover:bg-zinc-700 transition"
              >
                ⏸️ Pause
              </button>
              <button
                onClick={triggerEngineResume}
                disabled={loading}
                className="px-2 py-1.5 rounded-lg font-bold bg-zinc-800 hover:bg-zinc-700 transition"
              >
                ▶️ Resume
              </button>
              <button
                onClick={triggerStateReset}
                disabled={loading}
                className="px-2 py-1.5 rounded-lg font-bold bg-red-900/60 hover:bg-red-800 transition text-red-200"
              >
                🔄 Reset
              </button>
            </div>
          </div>

          {/* Recent Events List */}
          <div className="mb-3">
            <div className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1">
              Recent Events ({recentEventsList.length}):
            </div>
            <div className="bg-black/50 rounded-lg p-2 max-h-24 overflow-y-auto space-y-1 font-mono text-[10px] border border-white/5">
              {recentEventsList.length === 0 ? (
                <div className="text-zinc-500 italic">No events recorded in session</div>
              ) : (
                recentEventsList.slice(0, 5).map((ev, idx) => (
                  <div key={idx} className="flex justify-between text-zinc-300">
                    <span className="text-amber-300">{ev.type}</span>
                    <span className="truncate max-w-[120px]">{ev.displayName || "Anonymous"}</span>
                    {ev.amount ? <span>₹{ev.amount}</span> : null}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Activity Console Log */}
          <div className="text-[11px] font-mono text-zinc-300 bg-black/70 p-2 rounded-lg border border-white/10 truncate">
            {testLog}
          </div>
        </div>
      )}
    </main>
  );
}
