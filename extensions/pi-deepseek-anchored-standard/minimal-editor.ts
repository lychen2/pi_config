import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

const MAX_OUTPUT_CHARS = 16000;
const CLIPPED =
  "<response clipped><NOTE>Only part of this file was shown. Search it before reading a narrower range.</NOTE>";

type EditorArgs = {
  command: "view" | "create" | "str_replace" | "insert";
  path: string;
  file_text?: string;
  insert_line?: number;
  new_str?: string;
  old_str?: string;
  view_range?: number[];
};

function truncate(text: string): string {
  return text.length <= MAX_OUTPUT_CHARS
    ? text
    : text.slice(0, MAX_OUTPUT_CHARS) + CLIPPED;
}

function absolutePath(path: string): string {
  if (!path.trim()) throw new Error("path must be a non-empty string");
  if (!isAbsolute(path)) throw new Error(`The path ${path} is not absolute.`);
  return path;
}

function listDirectory(path: string): string {
  const rows: string[] = [];
  const visit = (directory: string, depth: number) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (
        entry.name.startsWith(".") ||
        entry.name === "node_modules" ||
        entry.name === "__pycache__"
      ) {
        continue;
      }
      const child = join(directory, entry.name);
      rows.push(`${entry.isDirectory() ? "d" : entry.isFile() ? "f" : "?"}\t${child}`);
      if (entry.isDirectory() && depth < 2) visit(child, depth + 1);
    }
  };
  rows.push(`d\t${path}`);
  visit(path, 1);
  rows.sort();
  return truncate(
    `Files and directories up to two levels under ${path}:\n${rows.join("\n")}\n`,
  );
}

function viewFile(path: string, range: number[] | undefined): string {
  const lines = readFileSync(path, "utf8").split("\n");
  let start = 1;
  let end = lines.length;
  if (range !== undefined) {
    if (range.length !== 2 || !range.every(Number.isInteger)) {
      throw new Error("view_range must be two integers.");
    }
    [start, end] = range;
    if (
      start < 1 ||
      start > lines.length ||
      (end !== -1 && (end < start || end > lines.length))
    ) {
      throw new Error(`Invalid view_range: [${range.join(", ")}].`);
    }
    if (end === -1) end = lines.length;
  }
  const numbered = lines
    .slice(start - 1, end)
    .map((line, index) => `${String(start + index).padStart(6, " ")}  ${line}`)
    .join("\n");
  return truncate(`Here's the content of ${path} with line numbers:\n${numbered}\n`);
}

function occurrences(text: string, needle: string): number[] {
  const indexes: number[] = [];
  let index = text.indexOf(needle);
  while (index >= 0) {
    indexes.push(index);
    index = text.indexOf(needle, index + needle.length);
  }
  return indexes;
}

function executeEditor(args: EditorArgs): string {
  const path = absolutePath(args.path);
  if (args.command === "view") {
    if (!existsSync(path)) throw new Error(`The path ${path} does not exist.`);
    const info = statSync(path);
    if (info.isDirectory()) {
      if (args.view_range !== undefined) {
        throw new Error("view_range is not allowed for directories.");
      }
      return listDirectory(path);
    }
    if (!info.isFile()) {
      throw new Error(`cannot view ${path}: not a regular file or directory`);
    }
    return viewFile(path, args.view_range);
  }
  if (args.command === "create") {
    if (args.file_text === undefined) {
      throw new Error("file_text is required for create.");
    }
    if (existsSync(path)) throw new Error(`File already exists at: ${path}.`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, args.file_text, "utf8");
    return `New file created successfully at: ${path}`;
  }
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`The path ${path} is not a regular file.`);
  }
  const before = readFileSync(path, "utf8");
  if (args.command === "str_replace") {
    if (!args.old_str) throw new Error("old_str is required for str_replace.");
    const hits = occurrences(before, args.old_str);
    if (hits.length === 0) {
      throw new Error(`old_str did not appear verbatim in ${path}.`);
    }
    if (hits.length > 1) {
      throw new Error(`old_str appears ${hits.length} times in ${path}; it must be unique.`);
    }
    writeFileSync(
      path,
      before.slice(0, hits[0]) +
        (args.new_str ?? "") +
        before.slice(hits[0] + args.old_str.length),
      "utf8",
    );
    return `The file ${path} has been edited successfully.`;
  }
  if (args.insert_line === undefined || !Number.isInteger(args.insert_line)) {
    throw new Error("insert_line must be an integer for insert.");
  }
  if (args.new_str === undefined) throw new Error("new_str is required for insert.");
  const lines = before.split("\n");
  if (args.insert_line < 0 || args.insert_line > lines.length) {
    throw new Error(`insert_line must be within [0, ${lines.length}].`);
  }
  lines.splice(args.insert_line, 0, ...args.new_str.split("\n"));
  writeFileSync(path, lines.join("\n"), "utf8");
  return `The file ${path} has been edited successfully.`;
}

/** Register the DSH Minimal preset's second API-visible tool. */
export function registerMinimalEditor(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "str_replace_editor",
    label: "str_replace_editor",
    description: [
      "Custom editing tool for viewing, creating and editing files.",
      "Use view, create, str_replace, or insert.",
      "For str_replace, old_str must match exactly once.",
    ].join("\n"),
    parameters: Type.Object({
      command: Type.Union([
        Type.Literal("view"),
        Type.Literal("create"),
        Type.Literal("str_replace"),
        Type.Literal("insert"),
      ]),
      path: Type.String(),
      file_text: Type.Optional(Type.String()),
      insert_line: Type.Optional(Type.Integer()),
      new_str: Type.Optional(Type.String()),
      old_str: Type.Optional(Type.String()),
      view_range: Type.Optional(Type.Array(Type.Integer())),
    }),
    async execute(_toolCallId, params) {
      const input = params as EditorArgs;
      const text = executeEditor(input);
      return {
        content: [{ type: "text", text }],
        details: { command: input.command, path: input.path },
      };
    },
  });
}
