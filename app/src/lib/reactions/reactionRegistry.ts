// reactionRegistry.ts — Centralized Mapping of Event Types to Animations & Voice Categories
import { ReactionDefinition } from "./reactionTypes";
import { EventType } from "../types/events";

export const REACTION_REGISTRY: Record<string, ReactionDefinition> = {
  SUPPORT_SMALL: {
    eventType: "SUPPORT_SMALL",
    animationSrc: "/assets/animations/02_happy.mp4",
    voiceCategory: "SUPPORT_SMALL",
    priority: "NORMAL",
    durationMs: 4000,
    cooldownMs: 2000,
    hudNotification: {
      title: "SUPPORT RECEIVED ❤️",
      icon: "❤️",
      type: "support",
    },
  },
  SUPPORT_MEDIUM: {
    eventType: "SUPPORT_MEDIUM",
    animationSrc: "/assets/animations/03_excited.mp4",
    voiceCategory: "SUPPORT_MEDIUM",
    priority: "HIGH",
    durationMs: 4500,
    cooldownMs: 2500,
    hudNotification: {
      title: "MEDIUM SUPPORT RECEIVED 🔥",
      icon: "🔥",
      type: "support",
    },
  },
  SUPPORT_LARGE: {
    eventType: "SUPPORT_LARGE",
    animationSrc: "/assets/animations/04_shock.mp4",
    voiceCategory: "SUPPORT_LARGE",
    priority: "CRITICAL",
    durationMs: 5000,
    cooldownMs: 3000,
    hudNotification: {
      title: "MEGA SUPPORT RECEIVED 😱",
      icon: "😱",
      type: "support",
    },
  },
  THANK_YOU: {
    eventType: "THANK_YOU",
    animationSrc: "/assets/animations/06_thank_you.mp4",
    voiceCategory: "THANK_YOU",
    priority: "NORMAL",
    durationMs: 4000,
    cooldownMs: 2000,
    hudNotification: {
      title: "THANK YOU SO MUCH! 🙏",
      icon: "🙏",
      type: "gratitude",
    },
  },
  NO_SUPPORT: {
    eventType: "NO_SUPPORT",
    animationSrc: "/assets/animations/07_no_support.mp4",
    voiceCategory: "NO_SUPPORT",
    priority: "LOW",
    durationMs: 3500,
    cooldownMs: 15000,
    hudNotification: {
      title: "WAITING FOR SUPPORT... 🦗",
      icon: "🦗",
      type: "info",
    },
  },
  NEW_SPONSOR: {
    eventType: "NEW_SPONSOR",
    animationSrc: "/assets/animations/10_sponsor_crown.mp4",
    voiceCategory: "NEW_SPONSOR",
    priority: "HIGH",
    durationMs: 5500,
    cooldownMs: 3000,
    hudNotification: {
      title: "NEW SPONSOR UNLOCKED 👑",
      icon: "👑",
      type: "sponsor",
    },
  },
  SPONSOR_WIN: {
    eventType: "SPONSOR_WIN",
    animationSrc: "/assets/animations/11_sponsor_win.mp4",
    voiceCategory: "SPONSOR_WIN",
    priority: "CRITICAL",
    durationMs: 6000,
    cooldownMs: 4000,
    hudNotification: {
      title: "SPONSOR CROWN DEFENDED 🏆",
      icon: "🏆",
      type: "sponsor",
    },
  },
  SPONSOR_LOST: {
    eventType: "SPONSOR_LOST",
    animationSrc: "/assets/animations/12_sponsor_lost.mp4",
    voiceCategory: "SPONSOR_LOST",
    priority: "HIGH",
    durationMs: 4500,
    cooldownMs: 3000,
    hudNotification: {
      title: "SPONSOR OUTBID 💔",
      icon: "💔",
      type: "info",
    },
  },
  CELEBRATE: {
    eventType: "CELEBRATE",
    animationSrc: "/assets/animations/05_celebrate.mp4",
    voiceCategory: "CELEBRATE",
    priority: "NORMAL",
    durationMs: 5000,
    cooldownMs: 2500,
    hudNotification: {
      title: "BIG CELEBRATION! 🎉",
      icon: "🎉",
      type: "info",
    },
  },
  VICTORY: {
    eventType: "VICTORY",
    animationSrc: "/assets/animations/13_victory.mp4",
    voiceCategory: "VICTORY",
    priority: "CRITICAL",
    durationMs: 6000,
    cooldownMs: 5000,
    hudNotification: {
      title: "VICTORY ACHIEVED! 🏆",
      icon: "🏆",
      type: "info",
    },
  },
  SHOCK: {
    eventType: "SHOCK",
    animationSrc: "/assets/animations/04_shock.mp4",
    voiceCategory: "SHOCK",
    priority: "NORMAL",
    durationMs: 4500,
    cooldownMs: 2000,
    hudNotification: {
      title: "SHOCKING EVENT ⚡",
      icon: "⚡",
      type: "info",
    },
  },
  IDLE: {
    eventType: "IDLE",
    animationSrc: "/assets/animations/01_idle.mp4",
    voiceCategory: "IDLE",
    priority: "LOW",
    durationMs: 3000,
    cooldownMs: 10000,
    hudNotification: {
      title: "LIVE STREAMING",
      icon: "✨",
      type: "info",
    },
  },
};

export function getReactionDefinition(eventType: EventType | "NO_SUPPORT" | "IDLE"): ReactionDefinition {
  return REACTION_REGISTRY[eventType] || REACTION_REGISTRY.IDLE;
}
