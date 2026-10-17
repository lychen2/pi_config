import { TuiMainScreen } from "@earendil-works/pi-tui";
import { installPrototypePatch } from "./prototype-patch-registry.ts";

// Both regular and fullscreen TUIs inherit the overlay compositor from this base.
const overlayPrototype = Object.getPrototypeOf(TuiMainScreen.prototype) as object;

export function installOverlayImageCompatibility(): () => void {
  return installPrototypePatch(overlayPrototype, "compositeOverlays", "overlay-background-images", ({ predecessor, receiver, args }) => {
    const tui = receiver as { hasOverlay(): boolean };
    const lines = args[0] as string[];
    if (!tui.hasOverlay()) return Reflect.apply(predecessor, receiver, args);

    let background: string[] | undefined;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]!;
      const kitty = /\x1b_G([^;]*);/.exec(line);
      const iterm = line.includes("\x1b]1337;File=");
      if (!kitty && !iterm) continue;
      background ??= [...lines];
      const up = iterm ? Number(/\x1b\[(\d+)A/.exec(line)?.[1] ?? 0) : 0;
      const rows = kitty ? Number(/(?:^|,)r=(\d+)(?:,|$)/.exec(kitty[1]!)?.[1] ?? 1) : 1;
      const start = Math.max(0, index - up);
      const end = Math.min(lines.length - 1, index + rows - 1);
      for (let row = start; row <= end; row++) {
        // Make reserved blank rows differ too, so the native renderer clears old pixels.
        background[row] = `${background[row]}\x1b[0m`;
      }
      // Pixel controls cannot be safely sliced or composited with overlay text.
      background[index] = "\x1b[0m";
    }
    return Reflect.apply(predecessor, receiver, [background ?? lines, ...args.slice(1)]);
  });
}
