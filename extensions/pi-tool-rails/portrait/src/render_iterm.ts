import { encodeITerm2 } from "@earendil-works/pi-tui";
import { BaseImageRenderer } from "./render_image.ts";
import type { ImageDims } from "./render_image.ts";

/**
 * iTerm2 inline image protocol renderer.
 *
 * Strategy: the widget places text rows first, then the image sequence on the
 * LAST row with cursor-up positioning. Since the TUI processes lines top-to-bottom
 * within a synchronized output block, the image is placed AFTER all `\x1b[2K`
 * clears, so it always extends over the text rows without being erased.
 *
 * The encode() returns just the raw iTerm2 escape sequence. The widget handles
 * all cursor positioning (cursor-up to first row, image placement, cursor-right
 * for text after the image).
 */
export class ITermRenderer extends BaseImageRenderer {
  protected cursorAdvances = true;
  private frameCounter = 0;

  constructor(size: number) {
    super(size);
  }

  protected encode(base64: string, _dims: ImageDims, rows: number, _yOffset: number): string | null {
    this.frameCounter++;
    return encodeITerm2(base64, {
      width: this.size,
      height: "auto",
      preserveAspectRatio: true,
      name: `emote-${this.frameCounter}`,
    });
  }

  dispose() {
    this.currentFrame = null;
  }
}
