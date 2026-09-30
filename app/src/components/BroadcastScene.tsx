"use client";

import React, { useState, useEffect, useRef } from "react";
import { StreamState } from "../lib/types/events";
import { StreamNotification } from "../lib/hooks/useStreamRealtime";
import { demoViewerCountProvider } from "../lib/viewer/demoViewerCountProvider";

interface BroadcastSceneProps {
  streamState: StreamState;
  currentAnimation: string;
  notification: StreamNotification | null;
  isMuted?: boolean;
  onAnimationEnd: () => void;
  hudMode?: "broadcast" | "development";
  onDiagnosticsUpdate?: (diag: {
    videoState: "READY" | "LOADING" | "ERROR";
    audioState: "READY" | "BLOCKED — USER INTERACTION REQUIRED" | "ERROR — NON-BLOCKING";
  }) => void;
}

export default function BroadcastScene({
  streamState,
  currentAnimation,
  notification,
  isMuted = false,
  onAnimationEnd,
  hudMode = "broadcast",
  onDiagnosticsUpdate,
}: BroadcastSceneProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [viewerCount, setViewerCount] = useState<number>(1240);
  const [pulseSupport, setPulseSupport] = useState<boolean>(false);
  const [recentSpeech, setRecentSpeech] = useState<string | null>(null);

  // Diagnostic states
  const [videoStatus, setVideoStatus] = useState<"READY" | "LOADING" | "ERROR">("READY");
  const [audioStatus, setAudioStatus] = useState<
    "READY" | "BLOCKED — USER INTERACTION REQUIRED" | "ERROR — NON-BLOCKING"
  >("READY");

  // Broadcast diagnostic updates
  useEffect(() => {
    if (onDiagnosticsUpdate) {
      onDiagnosticsUpdate({
        videoState: videoStatus,
        audioState: audioStatus,
      });
    }
  }, [videoStatus, audioStatus, onDiagnosticsUpdate]);

  // Audio autoplay readiness check for OBS Browser Source
  useEffect(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === "suspended") {
          setAudioStatus("BLOCKED — USER INTERACTION REQUIRED");
        } else {
          setAudioStatus("READY");
        }
        // Auto-close test audio context to avoid memory leak
        const closeTimer = setTimeout(() => {
          ctx.close().catch(() => {});
        }, 1500);
        return () => clearTimeout(closeTimer);
      }
    } catch {
      setAudioStatus("ERROR — NON-BLOCKING");
    }
  }, []);

  // Poll simulated viewer count from DemoViewerCountProvider
  useEffect(() => {
    let mounted = true;
    const updateViewers = async () => {
      try {
        const res = await demoViewerCountProvider.getViewerCount();
        if (mounted) setViewerCount(res.count);
      } catch {
        // fallback
      }
    };

    updateViewers();
    const interval = setInterval(updateViewers, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Update speech bubble when lastVoiceLine arrives
  useEffect(() => {
    if (streamState.lastVoiceLine) {
      setRecentSpeech(streamState.lastVoiceLine);
      const timer = setTimeout(() => {
        setRecentSpeech(null);
      }, 5500);
      return () => clearTimeout(timer);
    }
  }, [streamState.lastVoiceLine]);

  // Pulse effect on recent supporter update
  useEffect(() => {
    if (streamState.recentSupport && streamState.recentSupport.amount > 0) {
      setPulseSupport(true);
      const t = setTimeout(() => setPulseSupport(false), 2400);
      return () => clearTimeout(t);
    }
  }, [streamState.recentSupport]);

  // Video playback engine
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setVideoStatus("LOADING");
    const isIdle = currentAnimation.includes("idle") || currentAnimation.includes("01_idle");
    video.src = currentAnimation;
    video.loop = isIdle;
    video.load();

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setVideoStatus("READY");
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            console.warn("[BroadcastScene] Video playback notice:", err.message);
            // If autoplay is blocked by browser policy
            if (err.name === "NotAllowedError") {
              setAudioStatus("BLOCKED — USER INTERACTION REQUIRED");
            }
          }
        });
    }
  }, [currentAnimation]);

  // Unlock browser audio/video autoplay
  useEffect(() => {
    const unlockAutoplay = () => {
      const video = videoRef.current;
      if (video && video.paused) {
        video.play().catch(() => {});
      }
      setAudioStatus("READY");
    };

    window.addEventListener("pointerdown", unlockAutoplay, { once: true });
    window.addEventListener("keydown", unlockAutoplay, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAutoplay);
      window.removeEventListener("keydown", unlockAutoplay);
    };
  }, []);

  const progressPercent = Math.min(
    100,
    Math.round((streamState.raisedAmount / (streamState.goalAmount || 100000)) * 1000) / 10
  );

  const formatRupees = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  const isSponsorActive = Boolean(streamState.currentSponsor && streamState.currentSponsorBid > 0);

  return (
    <div
      id="obs-hud-root"
      className="relative w-screen h-screen overflow-hidden bg-black flex items-center justify-center select-none font-sans"
    >
      {/* 16:9 Viewport Canvas (Target: 1920x1080 Responsive scaling) */}
      <div className="relative w-full h-full max-w-[1920px] max-h-[1080px] aspect-video overflow-hidden">
        
        {/* Layer 1: Master Livestream Background Image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/MASTER/livestream_background.png"
          onError={(e) => {
            // Fallback to legacy path if MASTER isn't served
            const target = e.currentTarget;
            if (!target.src.includes("digital-beggar-room")) {
              target.src = "/assets/background/digital-beggar-room.png";
            }
          }}
          alt="Livestream Background"
          className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
        />

        {/* Layer 2: Character Animation Video (16:9 fill) */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
          playsInline
          muted={isMuted}
          onEnded={onAnimationEnd}
          onError={() => {
            console.warn(
              `[BroadcastScene] Animation failed to load: ${currentAnimation}. Falling back to idle.`
            );
            setVideoStatus("ERROR");
            onAnimationEnd();
            setTimeout(() => setVideoStatus("READY"), 1000);
          }}
        />

        {/* Subtle Vignette for Broadcast Depth */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/45 via-transparent to-black/30" />

        {/* Layer 3: Character Dialogue / Voice Subtitle Bubble */}
        {recentSpeech && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-[80%]">
            <div className="glass-panel px-6 py-2.5 rounded-full border border-amber-400/40 bg-black/70 backdrop-blur-xl shadow-2xl flex items-center gap-3">
              <span className="text-amber-400 text-sm animate-pulse">🔊</span>
              <p className="text-white font-bold text-sm md:text-base tracking-wide drop-shadow text-center">
                &ldquo;{recentSpeech}&rdquo;
              </p>
            </div>
          </div>
        )}

        {/* Layer 4: Broadcast HUD Overlay - Standard OBS Title & Action Safe Area */}
        <div className="absolute inset-0 p-6 sm:p-8 md:p-10 lg:p-12 flex flex-col justify-between pointer-events-none z-10">
          
          {/* HEADER: Top Bar */}
          <div className="flex items-center justify-between w-full">
            {/* Top Left: Live Status Badge with DEMO Indicator */}
            <div className="flex items-center gap-3">
              <div className="glass-panel px-4 py-2 rounded-full flex items-center gap-2.5 shadow-xl border border-white/10 bg-black/40 backdrop-blur-md">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600 shadow-[0_0_8px_#ef4444]"></span>
                </span>
                <span className="text-white font-black tracking-wider text-xs md:text-sm uppercase drop-shadow">
                  DIGITAL BEGGAR LIVE
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/25 text-amber-300 border border-amber-500/40 tracking-wider uppercase ml-1">
                  DEMO
                </span>
              </div>
            </div>

            {/* Top Center: Notification Toast Popup */}
            {notification && (
              <div className="absolute left-1/2 -translate-x-1/2 top-7 animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto">
                <div
                  className={`px-6 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-center gap-3.5 transition-all ${
                    notification.type === "sponsor"
                      ? "gold-glass-panel border-amber-400 text-amber-200 shadow-amber-500/30 bg-black/80"
                      : "glass-panel border-emerald-500/40 text-white shadow-emerald-500/20 bg-black/80"
                  }`}
                >
                  <div className="text-xl animate-bounce">
                    {notification.type === "sponsor" ? "👑" : "✨"}
                  </div>
                  <div>
                    <p className="font-extrabold text-sm md:text-base tracking-wide text-white uppercase drop-shadow">
                      {notification.message}
                    </p>
                    {notification.subtext && (
                      <p className="text-xs text-amber-200/90 font-medium">
                        {notification.subtext}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Top Right: Simulated Viewer Count (Explicitly Labeled DEMO) */}
            <div className="glass-panel px-4 py-2 rounded-full flex items-center gap-2.5 shadow-xl border border-white/10 bg-black/40 backdrop-blur-md">
              <svg
                className="w-4 h-4 text-amber-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path
                  fillRule="evenodd"
                  d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-xs uppercase text-zinc-300 font-bold tracking-wider">
                VIEWERS
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                DEMO
              </span>
              <span className="text-sm md:text-base font-black text-amber-300 tabular-nums tracking-wide">
                {viewerCount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* FOOTER: Bottom Row Cards */}
          <div className="w-full flex flex-col md:flex-row items-end md:items-end justify-between gap-4">
            
            {/* Bottom Left: Support Goal Card */}
            <div className="glass-panel p-4 md:p-5 rounded-2xl min-w-[290px] max-w-[350px] shadow-2xl border border-amber-500/20 bg-black/50 backdrop-blur-md">
              <div className="flex items-center justify-between text-xs font-bold text-amber-400 tracking-wider uppercase mb-1.5">
                <span>SUPPORT GOAL</span>
                <span className="text-zinc-300 font-semibold text-[11px]">
                  {progressPercent}%
                </span>
              </div>

              <div className="text-lg md:text-xl font-black text-white tracking-tight flex items-baseline gap-1 mb-2.5">
                <span>₹{formatRupees(streamState.raisedAmount)}</span>
                <span className="text-xs md:text-sm font-normal text-zinc-400">
                  / ₹{formatRupees(streamState.goalAmount || 100000)}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="relative w-full h-3 bg-zinc-900/90 rounded-full overflow-hidden border border-white/10 p-[1px]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-300 transition-all duration-700 ease-out shadow-[0_0_12px_rgba(245,158,11,0.6)]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Bottom Center: Recent Support Ticker */}
            <div
              className={`glass-panel px-6 py-2.5 rounded-full shadow-2xl border border-white/10 bg-black/50 backdrop-blur-md flex items-center gap-3 transition-transform duration-300 ${
                pulseSupport ? "scale-105 border-amber-400/50 shadow-amber-500/20" : ""
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase tracking-wider">
                <span className="text-sm">❤️</span>
                <span>RECENT SUPPORT</span>
              </div>
              <div className="h-3 w-[1px] bg-white/20" />
              <div className="text-xs md:text-sm font-semibold text-zinc-200">
                {streamState.recentSupport && streamState.recentSupport.amount > 0 ? (
                  <>
                    {streamState.recentSupport.displayName} •{" "}
                    <span className="text-amber-300 font-bold">
                      ₹{formatRupees(streamState.recentSupport.amount)}
                    </span>
                  </>
                ) : (
                  <span className="text-zinc-400 font-normal italic">
                    Waiting for first supporter
                  </span>
                )}
              </div>
            </div>

            {/* Bottom Right: Sponsor Card */}
            <div
              className={`p-4 md:p-5 rounded-2xl min-w-[280px] max-w-[340px] shadow-2xl bg-black/50 backdrop-blur-md transition-all duration-500 border ${
                isSponsorActive
                  ? "gold-glass-panel border-amber-400/60 shadow-amber-500/25"
                  : "glass-panel border-amber-500/20"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
                  <span className="text-sm">👑</span>
                  <span className="text-amber-400">
                    {isSponsorActive ? "CURRENT SPONSOR" : "CROWN AVAILABLE"}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 uppercase tracking-wider">
                  SPONSORED
                </span>
              </div>

              <div className="text-base md:text-lg font-black text-white mb-2 truncate">
                {isSponsorActive && streamState.currentSponsor ? (
                  <span className="shine-text">{streamState.currentSponsor}</span>
                ) : (
                  <span className="text-zinc-400 font-medium italic">
                    No Sponsor Yet
                  </span>
                )}
              </div>

              <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wide">
                  {isSponsorActive ? "CURRENT BID" : "MINIMUM BID"}
                </span>
                <span className="font-extrabold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                  ₹{formatRupees(isSponsorActive ? streamState.currentSponsorBid : (streamState.minimumNextBid || 500))}
                </span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
