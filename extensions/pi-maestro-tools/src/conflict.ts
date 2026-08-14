import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { resolve } from "node:path";

import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type {
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolFailure } from "./tool-error.ts";

const ConflictParams = Type.Object({
  action: Type.Union([Type.Literal("list"), Type.Literal("diff"), Type.Literal("resolve")]),
  uri: Type.Optional(Type.String({ description: "Short-lived handle from the latest conflict list: conflict://N for one conflict or conflict://* for all conflicts" })),
  content: Type.Optional(Type.String({ minLength: 1, description: "@ours, @theirs, or custom resolution text" })),
}, {
  additionalProperties: false,
  allOf: [
    {
      if: { properties: { action: { const: "diff" } }, required: ["action"] },
      then: {
        required: ["uri"],
        properties: { uri: { type: "string", pattern: "^conflict://[1-9]\\d*$" } },
      },
    },
    {
      if: { properties: { action: { const: "resolve" } }, required: ["action"] },
      then: {
        required: ["uri", "content"],
        properties: { uri: { type: "string", pattern: "^conflict://(?:[1-9]\\d*|\\*)$" } },
      },
    },
  ],
});

type ConflictParamsInput = {
  action: "list" | "diff" | "resolve";
  uri?: string;
  content?: string;
};

type ConflictHunk = { start: number; length: number; raw: string; ours: string; theirs: string };
type ConflictFile = { path: string; hunks: ConflictHunk[]; issue?: string };
type FlatConflict = { uri: string; file: ConflictFile; hunk: ConflictHunk };

const HUNK_RE = /^<<<<<<<[^\r\n]*\r?\n([\s\S]*?)\r?\n?=======\r?\n?([\s\S]*?)\r?\n?>>>>>>>[^\r\n]*(?=\r?\n|$)/gm;

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile("git", args, { cwd, timeout: 15_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim()));
      else resolvePromise(stdout);
    });
  });
}

function parseIssue(text: string): string | undefined {
  const lines = text.split(/\r?\n/);
  const opens = lines.filter((line) => line.startsWith("<<<<<<<")).length;
  const closes = lines.filter((line) => line.startsWith(">>>>>>>")).length;
  if (lines.some((line) => line.startsWith("|||||||"))) return "diff3 conflict markers are not supported";
  if (opens !== closes) return `unbalanced conflict markers (${opens} open, ${closes} close)`;
  return undefined;
}

function parseHunks(text: string): ConflictHunk[] {
  if (parseIssue(text)) return [];
  const hunks: ConflictHunk[] = [];
  HUNK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HUNK_RE.exec(text)) !== null) {
    hunks.push({ start: match.index, length: match[0].length, raw: match[0], ours: match[1]!, theirs: match[2]! });
  }
  return hunks;
}

async function scan(cwd: string): Promise<ConflictFile[]> {
  let output: string;
  try {
    output = await git(["diff", "--name-only", "--diff-filter=U", "-z"], cwd);
  } catch (error) {
    throw new Error(`conflict list failed: ${error instanceof Error ? error.message : String(error)}. This tool requires a Git repository with unmerged files.`);
  }
  const paths = output.split("\0").filter(Boolean);
  return Promise.all(paths.map(async (path) => {
    try {
      const text = await readFile(resolve(cwd, path), "utf8");
      const issue = parseIssue(text);
      return { path, hunks: issue ? [] : parseHunks(text), issue };
    } catch {
      return { path, hunks: [], issue: "unreadable file" };
    }
  }));
}

function flatten(files: ConflictFile[]): FlatConflict[] {
  const result: FlatConflict[] = [];
  for (const file of files) for (const hunk of file.hunks) result.push({ uri: `conflict://${result.length + 1}`, file, hunk });
  return result;
}

function lineRange(text: string, hunk: ConflictHunk): string {
  const start = text.slice(0, hunk.start).split("\n").length;
  const end = start + hunk.raw.split("\n").length - 1;
  return start === end ? String(start) : `${start}-${end}`;
}

function listText(files: ConflictFile[]): string {
  const flat = flatten(files);
  if (files.length === 0) return "No merge conflicts found.";
  const lines: string[] = [];
  let index = 0;
  for (const file of files) {
    if (!file.hunks.length) lines.push(`- ${file.path}: ${file.issue ?? "no parseable conflict markers"}`);
    else lines.push(`- ${file.path}: ${file.hunks.map(() => `conflict://${++index}`).join(", ")}`);
  }
  return flat.length ? `Found ${flat.length} conflict(s):\n${lines.join("\n")}` : `Unmerged paths without parseable conflicts:\n${lines.join("\n")}`;
}

function select(uri: string, conflicts: FlatConflict[]): FlatConflict[] {
  if (uri === "conflict://*") return conflicts;
  const target = conflicts.find((conflict) => conflict.uri === uri);
  if (!target) throw new Error(`${uri} not found. Run conflict list to refresh conflict numbering.`);
  return [target];
}

function replacement(hunk: ConflictHunk, content: string): string {
  if (content.trim() === "@ours") return hunk.ours;
  if (content.trim() === "@theirs") return hunk.theirs;
  return content;
}

async function resolveConflicts(cwd: string, targets: FlatConflict[], content: string, signal?: AbortSignal): Promise<string[]> {
  const byPath = new Map<string, FlatConflict[]>();
  for (const target of targets) byPath.set(target.file.path, [...(byPath.get(target.file.path) ?? []), target]);

  const prepared: Array<{ path: string; absolutePath: string; text: string; replacements: Array<{ hunk: ConflictHunk; content: string }> }> = [];
  for (const [path, entries] of byPath) {
    if (signal?.aborted) throw new Error("Tool execution aborted.");
    const absolutePath = resolve(cwd, path);
    const text = await readFile(absolutePath, "utf8");
    const replacements = entries.map(({ hunk }) => ({ hunk, content: replacement(hunk, content) })).sort((a, b) => b.hunk.start - a.hunk.start);
    for (const item of replacements) {
      const { hunk } = item;
      if (text.slice(hunk.start, hunk.start + hunk.length) !== hunk.raw) {
        throw new Error(`Conflict in ${path} changed since scan. Run conflict list again.`);
      }
    }
    prepared.push({ path, absolutePath, text, replacements });
  }

  const written: string[] = [];
  for (const file of prepared) {
    if (signal?.aborted) throw new Error(`Tool execution aborted after writing ${written.length} file(s).`);
    let text = file.text;
    for (const item of file.replacements) {
      const { hunk } = item;
      if (text.slice(hunk.start, hunk.start + hunk.length) !== hunk.raw) throw new Error(`Conflict in ${file.path} changed during write.`);
      text = text.slice(0, hunk.start) + item.content + text.slice(hunk.start + hunk.length);
    }
    await writeFile(file.absolutePath, text, "utf8");
    written.push(file.path);
  }
  return written;
}

export function createConflictTool(): ToolDefinition<typeof ConflictParams, unknown> {
  return {
    name: "conflict",
    label: "Conflict",
    description: "List, inspect, and resolve Git merge conflicts. Use list first and copy a current short-lived conflict://N handle, then diff or resolve it with @ours, @theirs, or custom content. Resolution writes files and must be followed by git add.",
    promptSnippet: "Use conflict to list, inspect, and resolve Git merge conflicts via conflict://N.",
    parameters: ConflictParams,
    async execute(_id, params: ConflictParamsInput, signal, _onUpdate, ctx): Promise<AgentToolResult<unknown>> {
      const files = await scan(ctx.cwd);
      const conflicts = flatten(files);
      if (params.action === "list") return { content: [{ type: "text", text: listText(files) }], details: { conflicts: conflicts.length } } as AgentToolResult<unknown>;
      if (!params.uri) throw new Error(`conflict ${params.action} requires a conflict://N URI.`);
      if (params.action === "diff") {
        if (params.uri === "conflict://*") throw new Error("conflict diff requires one numbered URI.");
        const [target] = select(params.uri, conflicts);
        const text = await readFile(resolve(ctx.cwd, target.file.path), "utf8");
        return { content: [{ type: "text", text: `## ${target.uri} - ${target.file.path} (lines ${lineRange(text, target.hunk)})\n\n### @ours\n\n${target.hunk.ours || "(empty)"}\n\n### @theirs\n\n${target.hunk.theirs || "(empty)"}` }] } as AgentToolResult<unknown>;
      }
      if (!params.content?.trim()) throw new Error("conflict resolve requires @ours, @theirs, or custom content.");
      const targets = select(params.uri, conflicts);
      const filesWritten = await resolveConflicts(ctx.cwd, targets, params.content, signal);
      return { content: [{ type: "text", text: `Resolved ${targets.length} conflict(s) in:\n${filesWritten.map((path) => `- ${path}`).join("\n")}\n\nRun git add when ready.` }], details: { resolved: targets.length, files: filesWritten } } as AgentToolResult<unknown>;
    },
  };
}

export function registerConflictTool(pi: ExtensionAPI): void {
  const snapshots = new Map<string, ConflictFile[]>();
  const baseTool = createConflictTool();
  const originalExecute = baseTool.execute;

  pi.registerTool({
    ...baseTool,
    async execute(
      id: string,
      params: ConflictParamsInput,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<unknown> | undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<unknown>> {
      const cwd = resolve(ctx.cwd);
      if (params.action === "list") {
        const files = await scan(cwd);
        snapshots.set(cwd, files);
        return originalExecute.call(baseTool, id, params, signal, onUpdate, { ...ctx, cwd });
      }
      const files = snapshots.get(cwd) ?? await scan(cwd);
      if (!snapshots.has(cwd)) snapshots.set(cwd, files);
      const conflicts = flatten(files);
      if (params.action === "diff") {
        if (!params.uri) return toolFailure("INVALID_ARGUMENT", "conflict diff requires a conflict://N URI.", { field: "uri" });
        if (params.uri === "conflict://*") return toolFailure("INVALID_ARGUMENT", "conflict diff requires one numbered URI.", { field: "uri" });
        const [target] = select(params.uri, conflicts);
        const text = await readFile(resolve(cwd, target.file.path), "utf8");
        return { content: [{ type: "text", text: `## ${target.uri} - ${target.file.path} (lines ${lineRange(text, target.hunk)})\\n\\n### @ours\\n\\n${target.hunk.ours || "(empty)"}\\n\\n### @theirs\\n\\n${target.hunk.theirs || "(empty)"}` }] } as AgentToolResult<unknown>;
      }
      if (!params.uri) return toolFailure("INVALID_ARGUMENT", "conflict resolve requires a conflict://N URI.", { field: "uri" });
      if (!params.content?.trim()) return toolFailure("INVALID_ARGUMENT", "conflict resolve requires @ours, @theirs, or custom content.", { field: "content" });
      const targets = select(params.uri, conflicts);
      const filesWritten = await resolveConflicts(cwd, targets, params.content, signal);
      snapshots.delete(cwd);
      return { content: [{ type: "text", text: `Resolved ${targets.length} conflict(s) in:\\n${filesWritten.map((path) => `- ${path}`).join("\\n")}\\n\\nRun git add when ready.` }], details: { resolved: targets.length, files: filesWritten } } as AgentToolResult<unknown>;
    },
  } as never);
  pi.on("session_shutdown", () => snapshots.clear());
}
