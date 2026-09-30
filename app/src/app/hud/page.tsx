"use client";

import React from "react";
import BroadcastScene from "@/components/BroadcastScene";
import { useStreamRealtime } from "@/lib/hooks/useStreamRealtime";

export default function HudPage() {
  const {
    streamState,
    currentAnimation,
    notification,
    handleAnimationEnd,
  } = useStreamRealtime();

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black select-none cursor-default m-0 p-0">
      <BroadcastScene
        streamState={streamState}
        currentAnimation={currentAnimation}
        notification={notification}
        isMuted={false}
        onAnimationEnd={handleAnimationEnd}
        hudMode="broadcast"
      />
    </main>
  );
}
