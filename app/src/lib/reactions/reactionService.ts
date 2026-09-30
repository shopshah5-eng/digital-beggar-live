// reactionService.ts — Orchestration of Event -> Animation -> Voice -> HUD
import { StreamEvent, EventType } from "../types/events";
import { getReactionDefinition } from "./reactionRegistry";
import { voiceService } from "../voice/voiceService";
import { OrchestratedReaction } from "./reactionTypes";
import { logger } from "../logging/logger";

export class ReactionService {
  /**
   * Orchestrates an incoming stream event into coordinated animation and voice response.
   * Animation playback never waits for voice synthesis; voice is enqueued asynchronously.
   */
  public async orchestrateReaction(event: StreamEvent): Promise<OrchestratedReaction> {
    const reactionDef = getReactionDefinition(event.type as EventType);

    // Extract dynamic tokens from event and metadata
    const vars = {
      name: event.displayName || "Supporter",
      amount: event.amount,
      businessName: (event.metadata?.businessName as string) || (event.metadata?.sponsorName as string) || event.displayName,
      bidAmount: (event.metadata?.bidAmount as number) || event.amount,
      category: (event.metadata?.category as string) || "General",
    };

    // Enqueue speech response asynchronously without blocking animation or financial flow
    let voiceText = "";
    try {
      voiceText = await voiceService.speakForEvent(event.type as EventType, vars, reactionDef.priority);
    } catch (err: any) {
      logger.error("Failed to generate voice response for event. Animation proceeds unhindered.", {
        metadata: {
          eventId: event.id,
          error: err?.message,
        },
      });
      voiceText = "Thank you!";
    }

    return {
      id: event.id,
      eventType: event.type,
      animationSrc: reactionDef.animationSrc,
      voiceText,
      priority: reactionDef.priority,
      timestamp: new Date().toISOString(),
    };
  }
}

export const reactionService = new ReactionService();
