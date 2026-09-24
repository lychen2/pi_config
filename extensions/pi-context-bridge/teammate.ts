import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";

import { boundTeammateDispatch, previewTeammateDispatch, TeammateDispatchSchema } from "./teammate-contract.ts";
export { boundTeammateDispatch, TEAMMATE_SCOPE_RULES } from "./teammate-contract.ts";

export default async function registerTeammate(pi: ExtensionAPI): Promise<void> {
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
  // Upstream wraps registerTool itself; give it an isolated facade so its
  // reassignment cannot recursively call our interception or alter other extensions.
  const registerTool = pi.registerTool.bind(pi);
  const boundedPi = Object.create(pi) as ExtensionAPI;
  boundedPi.registerTool = (tool) => {
    if (tool.name !== "teammate") return registerTool(tool);
    const execute = tool.execute;
    registerTool<typeof TeammateDispatchSchema>({
      ...tool,
      parameters: TeammateDispatchSchema,
      description: "Delegate bounded independent tasks. Each task requires goal, access, allowedPaths, checks and stopWhen. Use read-only with allowedPaths: [] unless editing is authorized. Edit tasks require narrow write paths. No nested delegation or expert mode. Returns task results or background handles.",
      promptSnippet: "Delegate independent bounded work using structured tasks; discover this tool only when needed.",
      promptGuidelines: ["Use the registered schema: tasks[].goal, access, allowedPaths, checks and stopWhen are required; do not send the upstream prompt/model/mode parameters."],
      renderCall: tool.renderCall ? (args, theme, context) => tool.renderCall!(previewTeammateDispatch(args) as Parameters<NonNullable<typeof tool.renderCall>>[0], theme, context as never) : undefined,
      renderResult: tool.renderResult ? (result, options, theme, context) => tool.renderResult!(result as Parameters<NonNullable<typeof tool.renderResult>>[0], options, theme, context ? { ...context, args: previewTeammateDispatch(context.args) } as never : context) : undefined,
      execute(id, params, signal, onUpdate, ctx) {
        return execute.call(tool, id, boundTeammateDispatch(params) as Parameters<typeof execute>[1], signal, onUpdate, ctx);
      },
    });
  };
  await loaded.default(boundedPi);
}
