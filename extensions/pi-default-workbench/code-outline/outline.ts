import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { extname, resolve } from "node:path";
import ts from "typescript-api";

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_OUTPUT_CHARS = 24_000;
interface Declaration { kind: string; name: string; start: number; end: number; signature: string }
export interface OutlineParams { path: string; offset?: number; limit?: number }

export function outlineSource(source: string, path: string, offset = 0, limit = 80) {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("Invalid offset or limit.");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const declarations: Declaration[] = [];
  const short = (text: string, cap: number) => text.length > cap ? text.slice(0, cap - 1) + "…" : text;
  const line = (position: number) => file.getLineAndCharacterOfPosition(position).line + 1;
  const visit = (node: ts.Node, parent = "") => {
    let kind: string | undefined;
    let name = "";
    let cutoff = node.end;
    let children = false;
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)) {
      kind = ts.isInterfaceDeclaration(node) ? "interface" : ts.isEnumDeclaration(node) ? "enum" : ts.isModuleDeclaration(node) ? "namespace" : "class";
      name = node.name?.getText(file) ?? "default";
      cutoff = ts.isModuleDeclaration(node) ? node.body?.getStart(file) ?? node.end : node.members.pos - 1;
      children = true;
    } else if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) || ts.isCallSignatureDeclaration(node) || ts.isConstructSignatureDeclaration(node)) {
      kind = ts.isFunctionDeclaration(node) ? "function" : "method";
      name = ts.isConstructorDeclaration(node) ? "constructor" : node.name?.getText(file) ?? (ts.isCallSignatureDeclaration(node) ? "(call)" : "default");
      cutoff = "body" in node && node.body ? node.body.getStart(file) : node.end;
    } else if (ts.isTypeAliasDeclaration(node)) { kind = "type"; name = node.name.text; }
    else if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) {
      kind = "property"; name = node.name.getText(file);
      if (ts.isPropertyDeclaration(node) && node.initializer) {
        const value = node.initializer;
        cutoff = ts.isArrowFunction(value) || ts.isFunctionExpression(value) ? value.body.getStart(file) : value.getStart(file);
      }
    } else if (ts.isVariableDeclaration(node) && ts.isVariableDeclarationList(node.parent)) {
      const value = node.initializer;
      kind = value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) ? "function" : "variable";
      name = node.name.getText(file);
      cutoff = value ? ts.isArrowFunction(value) || ts.isFunctionExpression(value) ? value.body.getStart(file) : value.getStart(file) : node.end;
    }
    if (kind) {
      const start = node.getStart(file);
      // Slice before normalizing: a huge initializer/type must not inflate output work.
      const signature = short(source.slice(start, Math.max(start, Math.min(cutoff, start + 1200))).replace(/\s+/g, " ").trim().replace(/[=\s]+$/, ""), 300);
      declarations.push({ kind, name: short(parent ? `${parent}.${name}` : name, 160), start: line(start), end: line(Math.max(start, node.end - 1)), signature });
      // Do not descend into function bodies or variable initializers.
      if (!children) return;
      ts.forEachChild(node, (child) => visit(child, parent ? `${parent}.${name}` : name));
    } else ts.forEachChild(node, (child) => visit(child, parent));
  };
  visit(file);
  const lines: string[] = [];
  let count = 0;
  let chars = 0;
  for (const declaration of declarations.slice(offset, offset + limit)) {
    const text = `${declaration.start}-${declaration.end} ${declaration.kind} ${declaration.name}: ${declaration.signature}`;
    if (chars + text.length + 1 > MAX_OUTPUT_CHARS - 1000) break;
    lines.push(text); chars += text.length + 1; count++;
  }
  const nextOffset = offset + count < declarations.length ? offset + count : undefined;
  const diagnostics = (file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
  const warning = diagnostics.length ? `\nWarning: ${diagnostics.length} syntax errors; outline may be incomplete.` : "";
  return {
    text: `Outline: ${short(path.replace(/[\x00-\x1f\x7f]/g, "?"), 500)}\nDeclarations ${declarations.length ? Math.min(offset + 1, declarations.length) : 0}-${Math.min(offset + count, declarations.length)} of ${declarations.length}; line ranges are 1-based. Syntax only.${warning}\n${lines.join("\n") || "No declarations in this page."}${nextOffset === undefined ? "" : `\nTruncated. Continue with offset=${nextOffset}.`}`,
    total: declarations.length, returned: count, nextOffset, syntaxErrors: diagnostics.length,
  };
}

export async function outlineFile(params: OutlineParams, cwd: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const path = resolve(cwd, params.path);
  if (!/^(?:\.[cm]?[jt]s|\.[jt]sx)$/.test(extname(path).toLowerCase())) throw new Error("Supported files: .ts, .tsx, .mts, .cts, .js, .jsx, .mjs, .cjs.");
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  let source: string;
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("Expected a regular source file.");
    if (stat.size > MAX_FILE_BYTES) throw new Error("Source file exceeds the 2 MiB limit; use read with line ranges.");
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      signal?.throwIfAborted();
      const result = await handle.read(buffer, bytes, buffer.length - bytes, bytes);
      if (!result.bytesRead) break;
      bytes += result.bytesRead;
    }
    if (bytes > MAX_FILE_BYTES) throw new Error("Source file exceeds the 2 MiB limit; use read with line ranges.");
    source = buffer.toString("utf8", 0, bytes);
  } finally { await handle.close(); }
  signal?.throwIfAborted();
  return outlineSource(source, path, params.offset, params.limit);
}
