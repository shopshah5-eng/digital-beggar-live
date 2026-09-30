// voiceQueue.ts — Priority-Based Voice Queue with Overflow Protection & Cooldowns
import { SpeechRequest, SpeechResult, VoicePriority, IVoiceProvider } from "./types";
import { logger } from "../logging/logger";

const PRIORITY_WEIGHTS: Record<VoicePriority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
};

export interface QueuedVoiceItem {
  request: SpeechRequest;
  enqueuedAt: number;
}

export class VoiceQueue {
  private queue: QueuedVoiceItem[] = [];
  private isProcessing: boolean = false;
  private isSpeaking: boolean = false;
  private currentSpeech: SpeechResult | null = null;
  private lastSpeechEndTime: number = 0;
  private isMuted: boolean = false;

  public readonly maxQueueSize: number = 10;
  public readonly cooldownMs: number = 2000; // Minimum 2s gap between voice lines
  private provider: IVoiceProvider;

  constructor(provider: IVoiceProvider) {
    this.provider = provider;
  }

  public peekQueue(): QueuedVoiceItem[] {
    return [...this.queue];
  }

  public setProvider(provider: IVoiceProvider): void {
    this.provider = provider;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      this.cancelCurrentSpeech();
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  public getCurrentSpeech(): SpeechResult | null {
    return this.currentSpeech;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Enqueues a speech request with priority-ordered insertion.
   * If the queue overflows, discards the lowest-priority item first.
   */
  public enqueue(request: SpeechRequest): boolean {
    if (this.isMuted) {
      logger.info("Voice is muted. Skipping speech enqueue", { requestId: request.id });
      return false;
    }

    // Handle overflow if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      const dropped = this.dropLowestPriorityItem(request.priority);
      if (!dropped) {
        logger.warn("Voice queue full and new request priority not high enough to preempt. Dropping new item.", {
          metadata: {
            id: request.id,
            priority: request.priority,
          },
        });
        return false;
      }
    }

    // Insert in priority order (higher priority first; FIFO within same priority)
    const item: QueuedVoiceItem = { request, enqueuedAt: Date.now() };
    const newWeight = PRIORITY_WEIGHTS[request.priority];

    let inserted = false;
    for (let i = 0; i < this.queue.length; i++) {
      const existingWeight = PRIORITY_WEIGHTS[this.queue[i].request.priority];
      if (newWeight > existingWeight) {
        this.queue.splice(i, 0, item);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.queue.push(item);
    }

    this.processQueue();
    return true;
  }

  /**
   * Drops the lowest-priority item from the queue to make room for a higher-priority request.
   * Returns true if an item was successfully evicted.
   */
  private dropLowestPriorityItem(incomingPriority: VoicePriority): boolean {
    const incomingWeight = PRIORITY_WEIGHTS[incomingPriority];

    // Find the item with the minimum weight
    let minIdx = -1;
    let minWeight = Infinity;

    for (let i = 0; i < this.queue.length; i++) {
      const w = PRIORITY_WEIGHTS[this.queue[i].request.priority];
      if (w < minWeight) {
        minWeight = w;
        minIdx = i;
      }
    }

    // Only drop if incoming item has strictly higher priority than the candidate to be dropped
    if (minIdx !== -1 && minWeight < incomingWeight) {
      const evicted = this.queue.splice(minIdx, 1)[0];
      logger.info("Dropped low-priority voice item due to queue overflow", {
        metadata: {
          evictedId: evicted.request.id,
          evictedPriority: evicted.request.priority,
        },
      });
      return true;
    }

    return false;
  }

  /**
   * Processes queued voice items sequentially.
   * Enforces minimum cooldown between speeches and handles provider errors gracefully.
   */
  public async processQueue(): Promise<void> {
    if (this.isProcessing || this.isMuted) {
      return;
    }

    if (this.queue.length === 0) {
      this.isSpeaking = false;
      this.currentSpeech = null;
      return;
    }

    this.isProcessing = true;

    try {
      // Cooldown enforcement
      const now = Date.now();
      const timeSinceLast = now - this.lastSpeechEndTime;
      if (timeSinceLast < this.cooldownMs && this.lastSpeechEndTime > 0) {
        await new Promise((r) => setTimeout(r, this.cooldownMs - timeSinceLast));
      }

      if (this.queue.length === 0) {
        this.isProcessing = false;
        return;
      }

      const item = this.queue.shift()!;
      this.isSpeaking = true;

      try {
        const result = await this.provider.generateSpeech(item.request);
        this.currentSpeech = result;

        // In simulated/demo environments, wait for duration
        await new Promise((r) => setTimeout(r, Math.min(result.durationMs, 5000)));
      } catch (err: any) {
        // Voice presentation failure must NEVER crash or block the queue
        logger.error("Voice generation/playback error. Advancing queue safely.", {
          metadata: {
            error: err?.message,
            requestId: item.request.id,
          },
        });
      } finally {
        this.isSpeaking = false;
        this.currentSpeech = null;
        this.lastSpeechEndTime = Date.now();
      }
    } finally {
      this.isProcessing = false;
      // Continue to next item if still queued
      if (this.queue.length > 0) {
        this.processQueue();
      }
    }
  }

  public cancelCurrentSpeech(): void {
    if (this.currentSpeech) {
      this.provider.cancelSpeech(this.currentSpeech.id).catch(() => {});
      this.currentSpeech = null;
      this.isSpeaking = false;
    }
  }

  public clearQueue(): void {
    this.queue = [];
    this.cancelCurrentSpeech();
  }

  public getStatus() {
    return {
      isSpeaking: this.isSpeaking,
      isMuted: this.isMuted,
      queueLength: this.queue.length,
      currentSpeech: this.currentSpeech
        ? {
            id: this.currentSpeech.id,
            text: this.currentSpeech.text,
            durationMs: this.currentSpeech.durationMs,
          }
        : null,
      cooldownRemainingMs: Math.max(0, this.cooldownMs - (Date.now() - this.lastSpeechEndTime)),
    };
  }
}
