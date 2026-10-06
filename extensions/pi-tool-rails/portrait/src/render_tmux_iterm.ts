import { ITermRenderer } from "./render_iterm.ts";
import type { ImageDims } from "./render_image.ts";
import { wrapTmuxPassthrough } from "./tmux.ts";

/**
 * iTerm2 renderer for use inside tmux with `allow-passthrough on`.
 *
 * Wraps iTerm2 inline image sequences in tmux DCS passthrough.
 * Uses cursor save/restore to prevent cursor advancement, allowing
 * the simpler kitty-style widget layout (image on row 0 + padding).
 */
export class TmuxITermRenderer extends ITermRenderer {
  protected cursorAdvances = false;
  protected padMode: "spaces" | "skip" = "skip";

  protected encode(base64: string, dims: ImageDims, rows: number, yOffset: number): string | null {
    const raw = super.encode(base64, dims, rows, yOffset);
    if (!raw) return null;
    // Replace BEL (\x07) terminator with ST (\x1b\\) — BEL doesn't
    // survive tmux DCS passthrough, but ST gets doubled and forwarded.
    const withST = raw.replace(/\x07$/, "\x1b\\");
    // Wrap with cursor save/restore — iTerm2 always advances the cursor
    // but we report cursorAdvances=false for the simpler widget layout.
    const wrapped = `\x1b7${withST}\x1b8`;
    return wrapTmuxPassthrough(wrapped);
  }
}
