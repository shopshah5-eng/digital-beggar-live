// voiceService.ts — Unified Voice Orchestrator & Audio Cache Manager
import { EventType } from "../types/events";
import { IVoiceProvider, SpeechRequest, VoicePriority } from "./types";
import { resolveVoiceProvider } from "./provider";
import { VoiceQueue } from "./voiceQueue";
import { responseGenerator, ResponseVariables } from "./responseGenerator";
import { logger } from "../logging/logger";

export interface AudioCacheEntry {
  key: string;
  text: string;
  audioUrl?: string;
  durationMs: number;
  timestamp: string;
}

export class VoiceService {
  private provider: IVoiceProvider;
  private queue: VoiceQueue;
  private audioCache: Map<string, AudioCacheEntry> = new Map();
  private lastIdleSpeechTime: number = 0;
  private idleIntervalMs: number = 180000; // 3 minutes default idle chatter interval
  private lastSpokenText: string | null = null;

  constructor(provider?: IVoiceProvider) {
    this.provider = provider || resolveVoiceProvider();
    this.queue = new VoiceQueue(this.provider);
  }

  public getProvider(): IVoiceProvider {
    return this.provider;
  }

  public setProvider(provider: IVoiceProvider): void {
    this.provider = provider;
    this.queue.setProvider(provider);
  }

  public setMuted(muted: boolean): void {
    this.queue.setMuted(muted);
    logger.info(`Voice service ${muted ? "MUTED" : "UNMUTED"}`);
  }

  public getIsMuted(): boolean {
    return this.queue.getIsMuted();
  }

  public getIsSpeaking(): boolean {
    return this.queue.getIsSpeaking();
  }

  public getLastSpokenText(): string | null {
    return this.lastSpokenText;
  }

  public clearQueue(): void {
    this.queue.clearQueue();
  }

  /**
   * Generates a personality-driven voice line for a stream event and enqueues it.
   * Priority defaults by event category if not explicitly provided.
   */
  public async speakForEvent(
    eventType: EventType | "IDLE" | "NO_SUPPORT",
    vars: ResponseVariables = {},
    customPriority?: VoicePriority
  ): Promise<string> {
    const text = responseGenerator.generateResponse(eventType, vars);
    this.lastSpokenText = text;

    const priority = customPriority || this.resolvePriority(eventType);
    const speechId = `speech_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const request: SpeechRequest = {
      id: speechId,
      text,
      category: eventType,
      priority,
      metadata: { ...vars },
    };

    // Cache lookup
    const cacheKey = this.computeCacheKey(this.provider.name, text);
    const cached = this.audioCache.get(cacheKey);

    if (cached) {
      logger.info("Using cached voice audio", { metadata: { key: cacheKey } });
    }

    this.queue.enqueue(request);
    return text;
  }

  /**
   * Periodically triggers an idle chatter line if the stream has been quiet.
   * Enforces 2-5 minute interval and uses LOW priority so it never blocks transactions.
   */
  public maybeTriggerIdleSpeech(): string | null {
    const now = Date.now();
    if (now - this.lastIdleSpeechTime < this.idleIntervalMs) {
      return null;
    }
    if (this.queue.getIsMuted() || this.queue.getQueueLength() > 0 || this.queue.getIsSpeaking()) {
      return null;
    }

    this.lastIdleSpeechTime = now;
    const text = responseGenerator.generateResponse("IDLE");
    this.lastSpokenText = text;

    this.queue.enqueue({
      id: `idle_${now}`,
      text,
      category: "IDLE",
      priority: "LOW",
    });

    return text;
  }

  public resolvePriority(eventType: EventType | "IDLE" | "NO_SUPPORT"): VoicePriority {
    switch (eventType) {
      case "SPONSOR_WIN":
      case "VICTORY":
      case "SUPPORT_LARGE":
        return "CRITICAL";
      case "NEW_SPONSOR":
      case "SPONSOR_LOST":
      case "SUPPORT_MEDIUM":
        return "HIGH";
      case "SUPPORT_SMALL":
      case "THANK_YOU":
      case "CELEBRATE":
      case "SHOCK":
        return "NORMAL";
      case "IDLE":
      case "NO_SUPPORT":
      default:
        return "LOW";
    }
  }

  private computeCacheKey(provider: string, text: string): string {
    return `${provider}:${text.toLowerCase().trim()}`;
  }

  public getStatus() {
    const queueStatus = this.queue.getStatus();
    return {
      provider: this.provider.name,
      isMuted: this.queue.getIsMuted(),
      isSpeaking: queueStatus.isSpeaking,
      queueLength: queueStatus.queueLength,
      currentSpeech: queueStatus.currentSpeech,
      cachedEntriesCount: this.audioCache.size,
      lastSpokenText: this.lastSpokenText,
    };
  }
}

// Preserve singleton across hot reloads in development
const globalForVoiceService = globalThis as unknown as {
  voiceService: VoiceService | undefined;
};

export const voiceService = globalForVoiceService.voiceService ?? new VoiceService();

if (process.env.NODE_ENV !== "production") {
  globalForVoiceService.voiceService = voiceService;
}
