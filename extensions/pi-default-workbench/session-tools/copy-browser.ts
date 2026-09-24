import { copyToClipboard, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Input, Key, matchesKey, truncateToWidth, wrapTextWithAnsi, type Component, type Focusable } from "@earendil-works/pi-tui";
import { buildRecords, copyOptions, recordsMarkdown, type CopyRecord } from "./records.ts";

// Never render terminal escape sequences taken from history. Copy retains originals.
export function safeDisplay(text: string): string {
  return text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}

export class CopyBrowser implements Component, Focusable {
  private input = new Input({ prompt: "Search: " });
  private filtered: number[];
  private cursor = 0;
  private selected = new Set<number>();
  private anchor: number | undefined;
  private preview = false;
  private previewLines: string[] = [];
  private previewOffset = 0;
  private previewWidth = 0;
  private wrappedPreview: string[] = [];
  private query = "";
  private searchLabels: string[];
  private records: CopyRecord[];
  private theme: ExtensionContext["ui"]["theme"];
  private done: (indices: number[] | undefined) => void;
  private rows: () => number;
  constructor(records: CopyRecord[], theme: ExtensionContext["ui"]["theme"], done: (indices: number[] | undefined) => void, rows: () => number) {
    this.records = records;
    this.theme = theme;
    this.done = done;
    this.rows = rows;
    this.filtered = records.map((_, i) => i);
    this.cursor = Math.max(0, records.length - 1);
    this.searchLabels = records.map((record) => safeDisplay(record.label).toLowerCase());
  }
  get focused(): boolean { return this.input.focused; }
  set focused(value: boolean) { this.input.focused = value; }
  invalidate(): void { this.input.invalidate(); }
  handleInput(data: string): void {
    if (this.preview) {
      if (matchesKey(data, "escape") || matchesKey(data, "tab")) this.preview = false;
      else if (matchesKey(data, "up")) this.previewOffset = Math.max(0, this.previewOffset - 1);
      else if (matchesKey(data, "down")) this.previewOffset = Math.min(Math.max(0, this.wrappedPreview.length - 1), this.previewOffset + 1);
      else if (matchesKey(data, "pageDown")) this.previewOffset = Math.min(Math.max(0, this.wrappedPreview.length - 1), this.previewOffset + 10);
      else if (matchesKey(data, "pageUp")) this.previewOffset = Math.max(0, this.previewOffset - 10);
      return;
    }
    const current = this.filtered[this.cursor];
    if (matchesKey(data, "escape")) { this.done(undefined); return; }
    if (matchesKey(data, "enter")) {
      this.done(this.selected.size ? [...this.selected].sort((a, b) => a - b) : current === undefined ? [] : [current]); return;
    }
    if (matchesKey(data, "up")) this.cursor = Math.max(0, this.cursor - 1);
    else if (matchesKey(data, "down")) this.cursor = Math.min(Math.max(0, this.filtered.length - 1), this.cursor + 1);
    else if (matchesKey(data, "pageUp")) this.cursor = Math.max(0, this.cursor - 10);
    else if (matchesKey(data, "pageDown")) this.cursor = Math.min(Math.max(0, this.filtered.length - 1), this.cursor + 10);
    else if (matchesKey(data, Key.ctrl("space")) && current !== undefined) {
      if (this.selected.has(current)) this.selected.delete(current); else this.selected.add(current);
      this.anchor = this.cursor;
    } else if (matchesKey(data, Key.ctrl("r")) && current !== undefined) {
      const anchor = this.anchor ?? this.cursor;
      for (let i = Math.min(anchor, this.cursor); i <= Math.max(anchor, this.cursor); i++) this.selected.add(this.filtered[i]!);
      this.anchor = this.cursor;
    } else if (matchesKey(data, "tab") && current !== undefined) {
      const text = this.records[current]!.text();
      this.previewLines = safeDisplay(text.slice(0, 100_000)).split("\n");
      if (text.length > 100_000) this.previewLines.push("[Preview truncated; copy includes full text]");
      this.previewOffset = 0;
      this.previewWidth = 0;
      this.preview = true;
    } else {
      this.input.handleInput(data);
      const query = this.input.getValue().toLowerCase();
      if (query !== this.query) {
        this.query = query;
        this.filtered = this.searchLabels.flatMap((label, index) => label.includes(query) ? [index] : []);
        this.cursor = Math.max(0, this.filtered.length - 1);
        this.anchor = undefined;
      }
    }
  }
  render(width: number): string[] {
    const clip = (text: string) => truncateToWidth(text, Math.max(1, width), "");
    const height = Math.max(1, Math.min(16, this.rows() - 7));
    const title = this.theme.fg("accent", `Copy history · ${this.filtered.length}/${this.records.length} records · ${this.selected.size} selected`);
    if (this.preview) {
      if (this.previewWidth !== Math.max(1, width)) {
        this.previewWidth = Math.max(1, width);
        this.wrappedPreview = this.previewLines.flatMap((line) => wrapTextWithAnsi(line, this.previewWidth));
        this.previewOffset = Math.min(this.previewOffset, Math.max(0, this.wrappedPreview.length - 1));
      }
      return [clip(title), clip(this.theme.fg("dim", "Preview · ↑↓/PgUp/PgDn scroll · Tab/Esc back")), ...this.wrappedPreview.slice(this.previewOffset, this.previewOffset + height).map(clip)];
    }
    const start = Math.max(0, Math.min(this.cursor - Math.floor(height / 2), this.filtered.length - height));
    const lines = this.filtered.slice(start, start + height).map((index, offset) => {
      const line = `${this.selected.has(index) ? "[x]" : "[ ]"} ${safeDisplay(this.records[index]!.label)}`;
      return clip(start + offset === this.cursor ? this.theme.fg("accent", `› ${line}`) : `  ${line}`);
    });
    return [clip(title), ...this.input.render(Math.max(1, width)), ...(lines.length ? lines : [clip("No matching records.")]), clip(this.theme.fg("dim", "↑↓ move · Ctrl+Space select · Ctrl+R range · Tab preview")), clip(this.theme.fg("dim", "Enter copy · Esc cancel · Search matches visible labels"))];
  }
}

export async function openCopyBrowser(args: string, ctx: ExtensionContext): Promise<void> {
  if (args.trim() && args.trim() !== "all") throw new Error("Usage: /anycopy [all]");
  const all = args.trim() === "all";
  const records = buildRecords(all ? ctx.sessionManager.getEntries() : ctx.sessionManager.getBranch(), copyOptions, true);
  if (!records.length) { ctx.ui.notify("No history to copy.", "info"); return; }
  const indices = await ctx.ui.custom<number[] | undefined>((tui, theme, _keys, done) => new CopyBrowser(records, theme, done, () => tui.terminal.rows));
  if (!indices?.length) return;
  await copyToClipboard(recordsMarkdown(indices.map((index) => records[index]!), all));
  ctx.ui.notify(`Copied ${indices.length} records.`, "info");
}
