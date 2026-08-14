import { homedir } from "node:os";
import { parse, resolve } from "node:path";

import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { FileFinder, type FileFinderApi } from "@ff-labs/fff-node";
import { Type } from "typebox";

const SCAN_TIMEOUT_MS = 15_000;
const MAX_CACHED_FINDERS = 4;

const FffGrepParams = Type.Object({
  pattern: Type.String({ minLength: 1, description: "Literal text to search for" }),
  context: Type.Optional(Type.Integer({ minimum: 0, maximum: 20, description: "Context lines before and after each match" })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, description: "Maximum matches to return" })),
});

const FffFindParams = Type.Object({
  pattern: Type.String({ minLength: 1, description: "Fuzzy file-path query" }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, description: "Maximum files to return" })),
});

function unsafeBasePathReason(directory: string): string | undefined {
  if (directory === parse(directory).root) return "filesystem roots";
  if (directory.toLowerCase() === homedir().toLowerCase()) return "home directories";
  return undefined;
}

function abortError(): Error {
  const error = new Error("FFF search aborted.");
  error.name = "AbortError";
  return error;
}

function formatGrep(items: Array<{ relativePath: string; lineNumber: number; lineContent: string }>): string {
  return items.length
    ? items.map((item) => `${item.relativePath}:${item.lineNumber}: ${item.lineContent}`).join("\n")
    : "No matches found.";
}

export function registerFff(pi: ExtensionAPI): void {
  const finders = new Map<string, FileFinderApi>();
  const initializing = new Map<string, Promise<FileFinderApi>>();
  const failedWorkspaces = new Set<string>();

  const evictOldest = (): void => {
    while (finders.size > MAX_CACHED_FINDERS) {
      const oldest = finders.keys().next().value;
      if (!oldest) return;
      finders.get(oldest)?.destroy();
      finders.delete(oldest);
    }
  };

  const getFinder = async (cwd: string): Promise<FileFinderApi> => {
    const workspace = resolve(cwd);
    const denied = unsafeBasePathReason(workspace);
    if (denied) throw new Error(`FFF does not index ${denied}; start Pi from a project directory.`);
    if (failedWorkspaces.has(workspace)) {
      throw new Error(`FFF could not index ${workspace}; use readseek grep or native grep instead.`);
    }

    const cached = finders.get(workspace);
    if (cached && !cached.isDestroyed) {
      finders.delete(workspace);
      finders.set(workspace, cached);
      return cached;
    }
    const pending = initializing.get(workspace);
    if (pending) return pending;

    const task = (async (): Promise<FileFinderApi> => {
      const created = FileFinder.create({ basePath: workspace, aiMode: true });
      if (!created.ok) throw new Error(`FFF initialization failed: ${created.error}`);
      const finder = created.value;
      const scan = await finder.waitForScan(SCAN_TIMEOUT_MS);
      if (!scan.ok || !scan.value) {
        finder.destroy();
        throw new Error(scan.ok ? `FFF initial scan timed out after ${SCAN_TIMEOUT_MS}ms.` : `FFF initial scan failed: ${scan.error}`);
      }
      finders.set(workspace, finder);
      evictOldest();
      return finder;
    })().catch((error: unknown) => {
      failedWorkspaces.add(workspace);
      throw error;
    }).finally(() => initializing.delete(workspace));

    initializing.set(workspace, task);
    return task;
  };

  pi.registerTool({
    name: "ffgrep",
    label: "FFF Grep",
    description: "Fast indexed literal content search in the current workspace. Use readseek grep for regular expressions or structural search.",
    promptSnippet: "Use fffgrep for fast literal content search; use readseek grep for regex or structure.",
    parameters: FffGrepParams,
    async execute(_id, params, signal, _onUpdate, ctx): Promise<AgentToolResult<unknown>> {
      if (signal?.aborted) throw abortError();
      const finder = await getFinder(ctx.cwd);
      if (signal?.aborted) throw abortError();
      const result = finder.grep(params.pattern, {
        mode: "plain",
        smartCase: true,
        pageSize: params.limit ?? 20,
        beforeContext: params.context ?? 0,
        afterContext: params.context ?? 0,
        classifyDefinitions: true,
      });
      if (!result.ok) throw new Error(`FFF grep failed: ${result.error}`);
      return { content: [{ type: "text", text: formatGrep(result.value.items) }] } as AgentToolResult<unknown>;
    },
  });

  pi.registerTool({
    name: "fffind",
    label: "FFF Find",
    description: "Fast indexed fuzzy file-path search in the current workspace.",
    promptSnippet: "Use fffind to find files by fuzzy path in the current workspace.",
    parameters: FffFindParams,
    async execute(_id, params, signal, _onUpdate, ctx): Promise<AgentToolResult<unknown>> {
      if (signal?.aborted) throw abortError();
      const finder = await getFinder(ctx.cwd);
      if (signal?.aborted) throw abortError();
      const result = finder.fileSearch(params.pattern, { pageSize: params.limit ?? 30 });
      if (!result.ok) throw new Error(`FFF file search failed: ${result.error}`);
      const text = result.value.items.length
        ? result.value.items.map((item) => item.relativePath).join("\n")
        : "No files found.";
      return { content: [{ type: "text", text }] } as AgentToolResult<unknown>;
    },
  });

  pi.on("session_shutdown", () => {
    for (const finder of finders.values()) finder.destroy();
    finders.clear();
    initializing.clear();
    failedWorkspaces.clear();
  });
}
