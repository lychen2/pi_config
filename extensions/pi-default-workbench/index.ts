import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import bashGuard from "./bash-guard.ts";
import registerSessionTools from "./session-tools/index.ts";
import registerCodeOutline from "./code-outline/index.ts";
import toolSelector from "./deferred-tools/deferred-tools.ts";
import { ensureEmbeddingModel } from "./embedding-search.ts";
import { registerLazyPreviewCommands, registerLazyTools } from "./lazy-tools.ts";
import registerSkillSearch from "./skill-search.ts";
import { installToolFailureMarker } from "./maestro/src/tool-error.ts";

export function createTodoInitializer<TodoModule, GuardModule>(
  load: () => Promise<[TodoModule, GuardModule]>,
  registerTodo: (module: TodoModule) => void,
  registerGuard: (module: GuardModule) => void,
): () => Promise<void> {
  let todoRegistered = false;
  let guardRegistered = false;
  let inFlight: Promise<void> | undefined;

  return () => {
    if (todoRegistered && guardRegistered) return Promise.resolve();
    if (inFlight) return inFlight;

    inFlight = (async () => {
      const [todo, guard] = await load();
      if (!todoRegistered) {
        registerTodo(todo);
        todoRegistered = true;
      }
      if (!guardRegistered) {
        registerGuard(guard);
        guardRegistered = true;
      }
    })().finally(() => { inFlight = undefined; });
    return inFlight;
  };
}

export default function register(pi: ExtensionAPI): void {
  registerSessionTools(pi);
  registerCodeOutline(pi);
  registerLazyTools(pi);
  registerLazyPreviewCommands(pi);
  installToolFailureMarker(pi);
  bashGuard(pi);
  toolSelector(pi);
  registerSkillSearch(pi);

  const initializeTodo = createTodoInitializer(
    () => Promise.all([import("./todo/index.ts"), import("./todo/guard.ts")]),
    (todo) => todo.default(pi),
    (todoGuard) => todoGuard.default(pi),
  );
  pi.on("session_start", async () => {
    if (process.env.PI_WORKBENCH_NO_EMBEDDING !== "1") ensureEmbeddingModel();
    await initializeTodo();
  });
}
