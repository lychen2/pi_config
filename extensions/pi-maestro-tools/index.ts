import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerBashBg } from "./src/bash-bg.ts";
import { registerConflictTool } from "./src/conflict.ts";
import { registerFff } from "./src/fff.ts";
import { installToolFailureMarker } from "./src/tool-error.ts";

export default function register(pi: ExtensionAPI): void {
  registerFff(pi);
  registerBashBg(pi);
  registerConflictTool(pi);
  installToolFailureMarker(pi);
}
