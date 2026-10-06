import type { Component } from "@earendil-works/pi-tui";

export interface DashboardPanel extends Component {
  render(width: number, maxRows?: number): string[];
}

/** One owner per mounted portrait; other views keep their existing data sources. */
export class DashboardState {
  active = false;
  modelLine: (() => string | undefined) | undefined;
  workingText = "";
  workingFrames: string[] = ["✻"];
  workingInterval = 125;
  panels = new Map<"plan" | "agents", DashboardPanel>();
  private redraw: (() => void) | undefined;

  mount(redraw: () => void): void {
    this.active = true;
    this.redraw = redraw;
  }

  unmount(): void {
    this.active = false;
    this.redraw = undefined;
  }

  refresh(): void { this.redraw?.(); }

  setPanel(name: "plan" | "agents", component?: DashboardPanel): void {
    if (component) this.panels.set(name, component);
    else this.panels.delete(name);
    this.refresh();
  }

  setWorking(text: string, frames = this.workingFrames, interval = this.workingInterval): void {
    this.workingText = text;
    this.workingFrames = frames;
    this.workingInterval = interval;
    this.refresh();
  }

  renderWorking(): string | undefined {
    if (!this.workingText) return undefined;
    const index = Math.floor(Date.now() / this.workingInterval) % this.workingFrames.length;
    return `${this.workingFrames[index]} ${this.workingText}`;
  }
}

// Pi loads each extension entry with a separate jiti cache. A process symbol
// shares presentation state across prompt-frame, tool-rails, and portrait.
const KEY = Symbol.for("pi.toolRails.portraitDashboard");
const shared = globalThis as typeof globalThis & { [KEY]?: DashboardState };
export const dashboard = shared[KEY] ??= new DashboardState();
