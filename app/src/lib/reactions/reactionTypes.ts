// reactionTypes.ts — Definitions for Video Animation + Voice Reaction Synchronization
import { EventType } from "../types/events";
import { VoicePriority } from "../voice/types";

export interface ReactionDefinition {
  eventType: EventType | "NO_SUPPORT" | "IDLE";
  animationSrc: string;
  fallbackAnimationSrc?: string;
  voiceCategory: string;
  priority: VoicePriority;
  durationMs: number;
  cooldownMs: number;
  hudNotification: {
    title: string;
    icon: string;
    type: "support" | "sponsor" | "gratitude" | "info";
  };
}

export interface OrchestratedReaction {
  id: string;
  eventType: EventType | "NO_SUPPORT" | "IDLE";
  animationSrc: string;
  voiceText: string;
  priority: VoicePriority;
  timestamp: string;
}
