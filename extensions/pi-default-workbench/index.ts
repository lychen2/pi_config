import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import toolSelector from "./deferred-tools/deferred-tools.ts";
import { registerLazyLargeCommand, registerLazyTools } from "./lazy-tools.ts";
import registerSkillSearch from "./skill-search.ts";
import { installToolFailureMarker } from "./maestro/src/tool-error.ts";

export default function register(pi: ExtensionAPI): void {
  registerLazyTools(pi);
  registerLazyLargeCommand(pi);
  installToolFailureMarker(pi);
  toolSelector(pi);
  registerSkillSearch(pi);

  let todoLoaded = false;
  pi.on("session_start", async () => {
    if (todoLoaded) return;
    todoLoaded = true;
    const [todo, todoGuard] = await Promise.all([
      import("./todo/index.ts"),
      import("./todo/guard.ts"),
    ]);
    todo.default(pi);
    todoGuard.default(pi);
  });
}
