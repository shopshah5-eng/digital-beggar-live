"use client";

import React, { useState, useEffect, useRef } from "react";
import { StreamState } from "../lib/types/events";
import { StreamNotification } from "../lib/hooks/useStreamRealtime";

interface LivestreamSceneProps {
  streamState: StreamState;
  currentAnimation: string;
  notification: StreamNotification | null;
  isMuted: boolean;
  onAnimationEnd: () => void;
}

export default function LivestreamScene({
  streamState,
  currentAnimation,
  notification,
  isMuted,
  onAnimationEnd,
}: LivestreamSceneProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewers = 1247; // Static baseline for simulation mode
  const [pulseSupport, setPulseSupport] = useState(false);

  // Pulse effect on recent supporter update
  useEffect(() => {
    if (streamState.recentSupport) {
      setPulseSupport(true);
      const t = setTimeout(() => setPulseSupport(false), 2000);
      return () => clearTimeout(t);
    }
  }, [streamState.recentSupport]);

  // Video playback engine controlled by Event Queue
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const isIdle = currentAnimation.includes("idle");
    video.src = currentAnimation;
    video.loop = isIdle;
    video.load();

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        // Silently handle browser interruption or autoplay restrictions
        if (err.name !== "AbortError") {
          console.warn("Video playback notice:", err);
        }
      });
    }
  }, [currentAnimation]);

  // Unlock browser audio/video autoplay upon first user interaction
  useEffect(() => {
    const unlockAutoplay = () => {
      const video = videoRef.current;
      if (video && video.paused) {
        video.play().catch(() => {});
      }
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
    Math.round((streamState.raisedAmount / streamState.goalAmount) * 1000) / 10
  );

  const formatRupees = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 0,
    }).format(val);
  };

  const isSponsorActive = Boolean(streamState.currentSponsor && streamState.currentSponsorBid > 0);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black flex items-center justify-center select-none font-sans">
      {/* 16:9 Viewport Canvas (Target: 1920x1080 without distortion) */}
      <div className="relative w-full h-full max-w-[1920px] max-h-[1080px] aspect-video overflow-hidden">
        
        {/* Layer 1: Base Background Image (Fallback / Poster) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/background/digital-beggar-room.png"
          alt="Digital Beggar Room"
          className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none"
        />

        {/* Layer 2: Character Animation Video (16:9 fill) */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover object-center"
          playsInline
          muted={isMuted}
          onEnded={onAnimationEnd}
          onError={() => {
            console.warn(
              `Requested animation [${currentAnimation}] failed to load. Gracefully returning to idle.`
            );
            onAnimationEnd();
          }}
        />

        {/* Subtle Vignette for Livestream Ambience */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/40 via-transparent to-black/25" />

        {/* Layer 3: Livestream HUD Overlay */}
        <div className="absolute inset-0 p-6 md:p-8 flex flex-col justify-between pointer-events-none">
          
          {/* HEADER: Top Bar */}
          <div className="flex items-center justify-between w-full">
            {/* Top Left: Live Status Badge with DEMO Indicator */}
            <div className="flex items-center gap-3">
              <div className="glass-panel px-4 py-2 rounded-full flex items-center gap-2.5 shadow-xl border border-white/10 backdrop-blur-md">
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
                      ? "gold-glass-panel border-amber-400 text-amber-200 shadow-amber-500/30"
                      : "glass-panel border-emerald-500/40 text-white shadow-emerald-500/20"
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

            {/* Top Right: Simulated Viewer Count */}
            <div className="glass-panel px-4 py-2 rounded-full flex items-center gap-2.5 shadow-xl border border-white/10 backdrop-blur-md">
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
                VIEWERS — DEMO
              </span>
              <span className="text-sm md:text-base font-black text-amber-300 tabular-nums tracking-wide">
                {viewers.toLocaleString()}
              </span>
            </div>
          </div>

          {/* FOOTER: Bottom Row Cards */}
          <div className="w-full flex flex-col md:flex-row items-end md:items-end justify-between gap-4">
            
            {/* Bottom Left: Donation Goal Card */}
            <div className="glass-panel p-4 md:p-5 rounded-2xl min-w-[290px] max-w-[350px] shadow-2xl border border-amber-500/20 backdrop-blur-md">
              <div className="flex items-center justify-between text-xs font-bold text-amber-400 tracking-wider uppercase mb-1.5">
                <span>DEMO GOAL</span>
                <span className="text-zinc-300 font-semibold text-[11px]">
                  {progressPercent}%
                </span>
              </div>

              <div className="text-lg md:text-xl font-black text-white tracking-tight flex items-baseline gap-1 mb-2.5">
                <span>₹{formatRupees(streamState.raisedAmount)}</span>
                <span className="text-xs md:text-sm font-normal text-zinc-400">
                  / ₹{formatRupees(streamState.goalAmount)}
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
              className={`glass-panel px-6 py-2.5 rounded-full shadow-2xl border border-white/10 backdrop-blur-md flex items-center gap-3 transition-transform duration-300 ${
                pulseSupport ? "scale-105 border-amber-400/50 shadow-amber-500/20" : ""
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase tracking-wider">
                <span className="text-sm">❤️</span>
                <span>DEMO SUPPORT</span>
              </div>
              <div className="h-3 w-[1px] bg-white/20" />
              <div className="text-xs md:text-sm font-semibold text-zinc-200">
                {streamState.recentSupport && streamState.recentSupport.amount > 0 ? (
                  <>
                    {streamState.recentSupport.displayName} —{" "}
                    <span className="text-amber-300 font-bold">
                      ₹{formatRupees(streamState.recentSupport.amount)}
                    </span>
                  </>
                ) : (
                  <span className="text-zinc-400 font-normal italic">
                    Waiting for first supporter — Be the first!
                  </span>
                )}
              </div>
            </div>

            {/* Bottom Right: Sponsor Card */}
            <div
              className={`p-4 md:p-5 rounded-2xl min-w-[280px] max-w-[340px] shadow-2xl backdrop-blur-md transition-all duration-500 border ${
                isSponsorActive
                  ? "gold-glass-panel border-amber-400/60 shadow-amber-500/25"
                  : "glass-panel border-amber-500/20"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
                  <span className="text-sm">👑</span>
                  <span className="text-amber-400">CURRENT SPONSOR</span>
                </div>
                {isSponsorActive && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 uppercase tracking-wider">
                    ACTIVE
                  </span>
                )}
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
                  BEAT THE CURRENT BID
                </span>
                <span className="font-extrabold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                  ₹{formatRupees(streamState.minimumNextBid)}+ SPONSORED
                </span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
