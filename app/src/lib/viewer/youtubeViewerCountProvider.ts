// youtubeViewerCountProvider.ts — Stub Provider for Future YouTube Live Broadcast API
import { IViewerCountProvider, ViewerCountResult } from "./types";

export class YouTubeViewerCountProvider implements IViewerCountProvider {
  public readonly name = "YouTubeViewerCountProvider";

  public async getViewerCount(): Promise<ViewerCountResult> {
    // YouTube integration is explicitly deferred until Phase 7.
    // Falls back safely to unconfigured indicator.
    return {
      count: 0,
      isSimulated: false,
      source: "youtube",
      label: "YOUTUBE_DISCONNECTED",
      timestamp: new Date().toISOString(),
    };
  }
}

export const youtubeViewerCountProvider = new YouTubeViewerCountProvider();
