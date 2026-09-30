"use client";

import React, { useState, useEffect, useCallback } from "react";
import LivestreamScene from "@/components/LivestreamScene";
import DevControlPanel from "@/components/DevControlPanel";
import { useStreamRealtime } from "@/lib/hooks/useStreamRealtime";

export default function Home() {
  const {
    streamState,
    currentAnimation,
    notification,
    handleAnimationEnd,
  } = useStreamRealtime();

  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  // Keyboard shortcut Ctrl+Shift+D for toggling developer control panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setIsControlsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black select-none">
      <LivestreamScene
        streamState={streamState}
        currentAnimation={currentAnimation}
        notification={notification}
        isMuted={isMuted}
        onAnimationEnd={handleAnimationEnd}
      />

      <DevControlPanel
        isOpen={isControlsOpen}
        onClose={() => setIsControlsOpen(false)}
        streamState={streamState}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
      />
    </main>
  );
}
