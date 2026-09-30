// provider.ts — Voice Provider Factory & Mode Resolver
import { IVoiceProvider, VoiceMode } from "./types";
import { demoVoiceProvider } from "./demoVoiceProvider";
import { ExternalTtsProvider } from "./ttsProvider";

export function getVoiceMode(): VoiceMode {
  const mode = (process.env.VOICE_MODE || "demo").toLowerCase().trim();
  return mode === "tts" ? "tts" : "demo";
}

export function resolveVoiceProvider(): IVoiceProvider {
  const mode = getVoiceMode();
  if (mode === "tts") {
    return new ExternalTtsProvider();
  }
  return demoVoiceProvider;
}
