import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { boundTeammateDispatch, previewTeammateDispatch, TeammateDispatchSchema } from "./teammate-contract.ts";
export { boundTeammateDispatch, TEAMMATE_SCOPE_RULES } from "./teammate-contract.ts";

const DEFERRED_COMMANDS = ["teammate-models", "teammate-send", "delegate", "monitor", "teammate-handoff-reload"];
const DEFERRED_SHORTCUTS = ["alt+r", "alt+m"] as const;

export default async function registerTeammate(pi: ExtensionAPI): Promise<void> {
  let loading: Promise<void> | undefined;
  const commands = new Map<string, Parameters<ExtensionAPI["registerCommand"]>[1]>();
  let teammateTool: Parameters<ExtensionAPI["registerTool"]>[0] | undefined;
  const shortcuts = new Map<string, { description?: string; handler: (ctx: Parameters<Parameters<ExtensionAPI["registerShortcut"]>[1]["handler"]>[0]) => Promise<void> | void }>();
  const sessionStartHandlers: Array<(event: any, ctx: any) => unknown> = [];
  let latestSessionStart: { event: any; ctx: any } | undefined;
  let uiOwnership: unknown;
  pi.events.on("cockpit:ui-ownership", payload => { uiOwnership = payload; });

  const load = () => loading ??= (async () => {
    const { createJiti } = await import("jiti");
    const jiti = createJiti(import.meta.url, { interopDefault: true });
    // Validate/reapply the version-checked patch even after --ignore-scripts installs.
    // Keep this before importing upstream: nested children load its patched entrypoint.
    const policy = await jiti.import("./patch-teammate.mjs") as {
      patchTeammate(root: string): number; installedTeammateRoot(): string;
    };
    policy.patchTeammate(policy.installedTeammateRoot());
    const loaded = await jiti.import("pi-maestro-teammate/src/extension/index.ts") as {
      default: (pi: ExtensionAPI) => void | Promise<void>;
    };
    // Upstream wraps registerTool itself; isolate its reassignment and apply the dispatch contract.
    const facade = Object.create(pi) as ExtensionAPI;
    facade.on = ((event: string, handler: (event: any, ctx: any) => unknown) => {
      if (event === "session_start") {
        sessionStartHandlers.push(handler);
        return () => { const index = sessionStartHandlers.indexOf(handler); if (index >= 0) sessionStartHandlers.splice(index, 1); };
      }
      return (pi.on as (event: string, handler: (event: any, ctx: any) => unknown) => () => void)(event, handler);
    }) as ExtensionAPI["on"];
    facade.registerTool = ((tool) => {
      if (tool.name !== "teammate") return pi.registerTool(tool);
      const execute = tool.execute;
      teammateTool = {
        ...tool,
        parameters: TeammateDispatchSchema,
        description: "Delegate bounded independent tasks. Each task requires goal, access, allowedPaths, checks and stopWhen. Use read-only with allowedPaths: [] unless editing is authorized. Edit tasks require narrow write paths. No nested delegation or expert mode. Returns task results or background handles.",
        promptSnippet: "Delegate independent bounded work using structured tasks; discover this tool only when needed.",
        promptGuidelines: ["Use the registered schema: tasks[].goal, access, allowedPaths, checks and stopWhen are required; do not send the upstream prompt/model/mode parameters."],
        renderCall: tool.renderCall ? (args, theme, context) => tool.renderCall!(previewTeammateDispatch(args) as Parameters<NonNullable<typeof tool.renderCall>>[0], theme, context as never) : undefined,
        renderResult: tool.renderResult ? (result, options, theme, context) => tool.renderResult!(result as Parameters<NonNullable<typeof tool.renderResult>>[0], options, theme, context ? { ...context, args: previewTeammateDispatch(context.args) } as never : context) : undefined,
        execute(id, params, signal, onUpdate, ctx) {
          return execute.call(tool, id, params as Parameters<typeof execute>[1], signal, onUpdate, ctx);
        },
      };
    }) as ExtensionAPI["registerTool"];
    facade.registerCommand = ((name, options) => { commands.set(name, options); }) as ExtensionAPI["registerCommand"];
    facade.registerShortcut = ((key, options) => { shortcuts.set(key, options); }) as ExtensionAPI["registerShortcut"];
    await loaded.default(facade);
    if (latestSessionStart) {
      for (const handler of sessionStartHandlers) await handler(latestSessionStart.event, latestSessionStart.ctx);
    }
    // Tool-rails claimed the agent widget at session_start, before this lazy import
    // subscribed to ownership events. Replay the latest claim after initialization.
    if (uiOwnership !== undefined) pi.events.emit("cockpit:ui-ownership", uiOwnership);
  })();

  (pi.on as (event: string, handler: (event: any, ctx: any) => unknown) => () => void)("session_start", async (event, ctx) => {
    latestSessionStart = { event, ctx };
    if (loading) {
      await load();
      for (const handler of sessionStartHandlers) await handler(event, ctx);
    }
  });

  // Keep the schema visible to tool discovery, but load the upstream package only if called.
  pi.registerTool<typeof TeammateDispatchSchema>({
    name: "teammate",
    label: "teammate",
    description: "Delegate bounded independent tasks. Each task requires goal, access, allowedPaths, checks and stopWhen. Use read-only with allowedPaths: [] unless editing is authorized.",
    parameters: TeammateDispatchSchema,
    execute: async (id, params, signal, onUpdate, ctx) => {
      await load();
      if (!teammateTool) throw new Error("Teammate dispatch tool was not registered");
      return teammateTool.execute(id, boundTeammateDispatch(params), signal, onUpdate, ctx);
    },
  });
  for (const name of DEFERRED_COMMANDS) {
    pi.registerCommand(name, {
      description: "Teammate command (loaded on first use)",
      handler: async (args, ctx) => {
        await load();
        const command = commands.get(name);
        if (!command) throw new Error(`Teammate command /${name} was not registered`);
        await command.handler(args, ctx);
      },
    });
  }
  for (const key of DEFERRED_SHORTCUTS) {
    pi.registerShortcut(key, {
      description: "Teammate shortcut (loaded on first use)",
      handler: async (ctx) => {
        await load();
        const shortcut = shortcuts.get(key);
        if (!shortcut) throw new Error(`Teammate shortcut ${key} was not registered`);
        await shortcut.handler(ctx);
      },
    });
  }
}
