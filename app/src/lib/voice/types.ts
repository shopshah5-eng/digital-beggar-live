// types.ts — Voice Provider & Speech Synthesis Interfaces
import { EventType } from "../types/events";

export type VoiceMode = "demo" | "tts";

export type VoicePriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

export interface SpeechRequest {
  id: string;
  text: string;
  category: EventType | "IDLE" | "NO_SUPPORT" | "CUSTOM_ADMIN";
  priority: VoicePriority;
  metadata?: Record<string, unknown>;
}

export interface SpeechResult {
  id: string;
  text: string;
  audioUrl?: string; // Data URL or audio file link
  durationMs: number;
  simulated: boolean;
  provider: string;
  timestamp: string;
}

export interface VoiceProviderStatus {
  provider: string;
  mode: VoiceMode;
  available: boolean;
  isMuted: boolean;
  cachedEntriesCount: number;
  activeSpeechId: string | null;
}

export interface IVoiceProvider {
  readonly name: string;
  generateSpeech(request: SpeechRequest): Promise<SpeechResult>;
  cancelSpeech(speechId: string): Promise<boolean>;
  getStatus(): Promise<VoiceProviderStatus>;
}
