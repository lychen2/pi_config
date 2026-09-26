import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { compatibleRtkApi } from "./rtk-compat.ts";

type Handler = (event: any, ctx: any) => unknown | Promise<unknown>;
type CommandOptions = Parameters<ExtensionAPI["registerCommand"]>[1];
type ToolOptions = Parameters<ExtensionAPI["registerTool"]>[0];

export default async function rtkCompatibility(pi: ExtensionAPI): Promise<void> {
  let loading: Promise<void> | undefined;
  let rtkCommand: CommandOptions | undefined;
  let sessionStartHandler: Handler | undefined;
  let latestSessionStart: { event: any; ctx: any } | undefined;

  const load = () => loading ??= (async () => {
    const { createJiti } = await import("jiti");
    const jiti = createJiti(import.meta.url, { interopDefault: true });
    const loaded = await jiti.import("pi-rtk-optimizer") as {
      default?: (api: ExtensionAPI) => void | Promise<void>;
    } | ((api: ExtensionAPI) => void | Promise<void>);
    const register = typeof loaded === "function" ? loaded : loaded.default;
    if (typeof register !== "function") throw new Error("RTK has no default extension factory");
    const facade = Object.create(pi) as ExtensionAPI;
    facade.on = ((event: string, handler: Handler) => {
      if (event === "session_start") {
        sessionStartHandler = handler;
        return () => { sessionStartHandler = undefined; };
      }
      return (pi.on as (event: string, handler: Handler) => () => void)(event, handler);
    }) as ExtensionAPI["on"];
    facade.registerTool = ((tool: ToolOptions) => pi.registerTool(tool)) as ExtensionAPI["registerTool"];
    facade.registerCommand = ((name: string, options: CommandOptions) => {
      if (name === "rtk") rtkCommand = options;
      else pi.registerCommand(name, options);
    }) as ExtensionAPI["registerCommand"];
    const api = compatibleRtkApi(facade);
    await register(api);
    if (latestSessionStart) await sessionStartHandler?.(latestSessionStart.event, latestSessionStart.ctx);
  })();

  (pi.on as (event: string, handler: Handler) => () => void)("session_start", async (event, ctx) => {
    latestSessionStart = { event, ctx };
    if (loading) {
      await load();
      await sessionStartHandler?.(event, ctx);
    }
  });

  // Load before the first prompt is built so RTK hooks are active for its tool calls.
  (pi.on as (event: string, handler: Handler) => () => void)("input", async () => {
    await load();
    return { action: "continue" };
  });

  // Keep /rtk available without importing RTK until the command is used.
  pi.registerCommand("rtk", {
    description: "Configure RTK rewrite and output compaction integration",
    handler: async (args, ctx) => {
      await load();
      if (!rtkCommand) throw new Error("RTK command was not registered");
      await rtkCommand.handler(args, ctx);
    },
  });
}
