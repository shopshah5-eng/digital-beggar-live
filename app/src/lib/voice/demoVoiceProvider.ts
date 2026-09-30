// demoVoiceProvider.ts — Simulated Speech Provider for Local / Sandbox Mode (Zero Cost, No External API)
import {
  IVoiceProvider,
  SpeechRequest,
  SpeechResult,
  VoiceProviderStatus,
} from "./types";

export class DemoVoiceProvider implements IVoiceProvider {
  public readonly name = "DemoVoiceProvider";
  private isMuted: boolean = false;
  private activeSpeechId: string | null = null;
  private cancelToken: boolean = false;

  public async generateSpeech(request: SpeechRequest): Promise<SpeechResult> {
    this.activeSpeechId = request.id;
    this.cancelToken = false;

    // Word count calculation: approx 3.5 words/sec (285ms per word) + 600ms boundary pause
    const words = request.text.trim().split(/\s+/).length;
    const estimatedDuration = Math.min(8000, Math.max(1600, words * 285 + 600));

    return {
      id: request.id,
      text: request.text,
      audioUrl: `/assets/audio/demo_${request.category.toLowerCase()}.mp3`, // Safe mock asset path
      durationMs: estimatedDuration,
      simulated: true,
      provider: this.name,
      timestamp: new Date().toISOString(),
    };
  }

  public async cancelSpeech(speechId: string): Promise<boolean> {
    if (this.activeSpeechId === speechId) {
      this.cancelToken = true;
      this.activeSpeechId = null;
      return true;
    }
    return false;
  }

  public setMute(muted: boolean): void {
    this.isMuted = muted;
  }

  public async getStatus(): Promise<VoiceProviderStatus> {
    return {
      provider: this.name,
      mode: "demo",
      available: true,
      isMuted: this.isMuted,
      cachedEntriesCount: 0,
      activeSpeechId: this.activeSpeechId,
    };
  }
}

export const demoVoiceProvider = new DemoVoiceProvider();
