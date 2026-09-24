import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import bashGuard from "./bash-guard.ts";
import registerSessionTools from "./session-tools/index.ts";
import registerCodeOutline from "./code-outline/index.ts";
import toolSelector from "./deferred-tools/deferred-tools.ts";
import { ensureEmbeddingModel } from "./embedding-search.ts";
import { registerLazyLargeCommand, registerLazyPreviewCommands, registerLazyTools } from "./lazy-tools.ts";
import registerSkillSearch from "./skill-search.ts";
import { installToolFailureMarker } from "./maestro/src/tool-error.ts";

export default function register(pi: ExtensionAPI): void {
  registerSessionTools(pi);
  registerCodeOutline(pi);
  registerLazyTools(pi);
  registerLazyPreviewCommands(pi);
  registerLazyLargeCommand(pi);
  installToolFailureMarker(pi);
  bashGuard(pi);
  toolSelector(pi);
  registerSkillSearch(pi);

  let todoLoaded = false;
  pi.on("session_start", async () => {
    if (process.env.PI_WORKBENCH_NO_EMBEDDING !== "1") ensureEmbeddingModel();
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
