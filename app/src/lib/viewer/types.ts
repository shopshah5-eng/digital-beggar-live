// types.ts — Viewer Count Provider Abstraction
export interface ViewerCountResult {
  count: number;
  isSimulated: boolean;
  source: "demo" | "youtube" | "twitch";
  label: string; // e.g. "DEMO", "LIVE"
  timestamp: string;
}

export interface IViewerCountProvider {
  readonly name: string;
  getViewerCount(): Promise<ViewerCountResult>;
}
