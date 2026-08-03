import { isReadToolResult, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { compactHashlineRead } from "./src/compact.ts";
import { loadCompatLimits } from "./src/config.ts";

export default function rtkHashlineCompat(pi: ExtensionAPI): void {
  pi.on("tool_result", (event) => {
    if (!isReadToolResult(event) || event.isError) return;

    const limits = loadCompatLimits();
    if (!limits) return;

    return compactHashlineRead(event, limits);
  });
}
