import { KittyRenderer } from "./render_kitty.ts";
import type { ImageDims } from "./render_image.ts";
import { wrapTmuxPassthrough } from "./tmux.ts";

/**
 * Kitty renderer for use inside tmux with `allow-passthrough on`.
 * Wraps all kitty graphics sequences in tmux DCS passthrough.
 */
export class TmuxKittyRenderer extends KittyRenderer {
  protected encode(base64: string, dims: ImageDims, rows: number, yOffset: number): string | null {
    const raw = super.encode(base64, dims, rows, yOffset);
    if (!raw) return null;
    // Delete previous image before displaying new one — kitty's same-ID
    // replacement doesn't work reliably through tmux DCS passthrough.
    const del = `\x1b_Ga=d,d=I,i=${this.imageId},q=2\x1b\\`;
    return wrapTmuxPassthrough(del + raw);
  }

  dispose() {
    const del = `\x1b_Ga=d,d=I,i=${this.imageId},q=2\x1b\\`;
    process.stdout.write(wrapTmuxPassthrough(del));
    this.currentFrame = null;
  }
}
