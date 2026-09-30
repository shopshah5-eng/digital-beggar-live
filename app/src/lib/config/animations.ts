import { EventType } from "../types/events";

export interface AnimationConfig {
  videoSrc: string;
  durationMs?: number;
  notificationMessage?: string;
  notificationSubtext?: (eventData: { displayName: string; amount: number; metadata?: Record<string, unknown> }) => string;
  notificationType: "support" | "sponsor" | "gratitude" | "info";
  icon: string;
}

export const ANIMATION_MAP: Record<EventType, AnimationConfig> = {
  SUPPORT_SMALL: {
    videoSrc: "/assets/animations/02_happy.mp4",
    notificationMessage: "₹10 SUPPORT RECEIVED ❤️",
    notificationSubtext: (e) => `${e.displayName} sent ₹${e.amount.toLocaleString()}`,
    notificationType: "support",
    icon: "❤️",
  },
  SUPPORT_MEDIUM: {
    videoSrc: "/assets/animations/03_excited.mp4",
    notificationMessage: "₹100 SUPPORT RECEIVED 🔥",
    notificationSubtext: (e) => `${e.displayName} sent ₹${e.amount.toLocaleString()}`,
    notificationType: "support",
    icon: "🔥",
  },
  SUPPORT_LARGE: {
    videoSrc: "/assets/animations/04_shock.mp4",
    notificationMessage: "₹500 SUPPORT RECEIVED 😱",
    notificationSubtext: (e) => `${e.displayName} sent ₹${e.amount.toLocaleString()}`,
    notificationType: "support",
    icon: "😱",
  },
  THANK_YOU: {
    videoSrc: "/assets/animations/06_thank_you.mp4",
    notificationMessage: "THANK YOU SO MUCH! 🙏",
    notificationSubtext: () => "Your support keeps the dream alive!",
    notificationType: "gratitude",
    icon: "🙏",
  },
  CELEBRATE: {
    videoSrc: "/assets/animations/05_celebrate.mp4",
    notificationMessage: "BIG CELEBRATION! 🎉",
    notificationSubtext: () => "Milestone reached!",
    notificationType: "info",
    icon: "🎉",
  },
  SHOCK: {
    videoSrc: "/assets/animations/04_shock.mp4",
    notificationMessage: "UNBELIEVABLE MOMENT! 😱",
    notificationSubtext: () => "Did that really just happen?!",
    notificationType: "info",
    icon: "⚡",
  },
  NEW_SPONSOR: {
    videoSrc: "/assets/animations/10_sponsor_crown.mp4",
    notificationMessage: "NEW SPONSOR 👑",
    notificationSubtext: (e) => `${e.displayName} took the crown with ₹${e.amount.toLocaleString()}!`,
    notificationType: "sponsor",
    icon: "👑",
  },
  SPONSOR_WIN: {
    videoSrc: "/assets/animations/11_sponsor_win.mp4",
    notificationMessage: "SPONSOR VICTORY! 🏆",
    notificationSubtext: (e) => `${e.displayName} defended their title!`,
    notificationType: "sponsor",
    icon: "🏆",
  },
  SPONSOR_LOST: {
    videoSrc: "/assets/animations/12_sponsor_lost.mp4",
    notificationMessage: "SPONSOR OUTBID! 💔",
    notificationSubtext: () => "The crown has changed hands!",
    notificationType: "info",
    icon: "💔",
  },
  VICTORY: {
    videoSrc: "/assets/animations/13_victory.mp4",
    notificationMessage: "VICTORY ACHIEVED! 🏆",
    notificationSubtext: () => "Historic streaming milestone!",
    notificationType: "info",
    icon: "🏆",
  },
  NO_SUPPORT: {
    videoSrc: "/assets/animations/07_no_support.mp4",
    notificationMessage: "WAITING FOR SUPPORT... 🦗",
    notificationSubtext: () => "The stream is quiet today...",
    notificationType: "info",
    icon: "🦗",
  },
  IDLE: {
    videoSrc: "/assets/animations/01_idle.mp4",
    notificationType: "info",
    icon: "✨",
  },
};

export const DEFAULT_IDLE_ANIMATION = "/assets/animations/01_idle.mp4";
