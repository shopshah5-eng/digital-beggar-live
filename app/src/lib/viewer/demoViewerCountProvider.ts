// demoViewerCountProvider.ts — Simulated Viewer Count for Demo / Staging Mode
import { IViewerCountProvider, ViewerCountResult } from "./types";

export class DemoViewerCountProvider implements IViewerCountProvider {
  public readonly name = "DemoViewerCountProvider";
  private baseCount: number = 1240;

  constructor(initialBase: number = 1240) {
    this.baseCount = initialBase;
  }

  public async getViewerCount(): Promise<ViewerCountResult> {
    // Generate realistic small stream fluctuation: ±12 viewers
    const delta = Math.floor(Math.random() * 25) - 12;
    const current = Math.max(100, this.baseCount + delta);

    return {
      count: current,
      isSimulated: true,
      source: "demo",
      label: "DEMO",
      timestamp: new Date().toISOString(),
    };
  }

  public setBaseCount(newBase: number): void {
    if (newBase > 0) {
      this.baseCount = newBase;
    }
  }
}

export const demoViewerCountProvider = new DemoViewerCountProvider();
