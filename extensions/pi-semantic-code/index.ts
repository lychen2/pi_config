import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CONFIG_DIR_NAME,
  getAgentDir,
  withFileMutationQueue,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";

type Action = "status" | "diagnostics" | "definition" | "references" | "hover" | "symbols" | "rename";
type JsonRecord = Record<string, unknown>;
type Position = { line: number; character: number };
type Range = { start: Position; end: Position };
type TextEdit = { range: Range; newText: string };
type ServerSpec = {
  name: string;
  command: string[];
  extensions: string[];
  languageIds?: Record<string, string>;
  actions?: Action[];
  enabled?: boolean;
};
type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};
type SemanticDetails = {
  action: Action;
  server?: string;
  language?: string;
  root?: string;
  count?: number;
  applied?: boolean;
};

const ACTIONS = ["status", "diagnostics", "definition", "references", "hover", "symbols", "rename"] as const;
const OUTPUT_BYTES = 12_000;
const MAX_RESULTS = 100;
const DEFAULT_TIMEOUT_MS = 25_000;
const commandCache = new Map<string, string | null>();

const COMMON_LANGUAGE_IDS: Record<string, string> = {
  ".c": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".h": "cpp",
  ".hh": "cpp",
  ".hpp": "cpp",
  ".hxx": "cpp",
  ".py": "python",
  ".pyi": "python",
  ".rs": "rust",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".mts": "typescript",
  ".cts": "typescript",
  ".cs": "csharp",
  ".go": "go",
  ".tex": "latex",
  ".ltx": "latex",
  ".bib": "bibtex",
  ".typ": "typst",
};

const BUILTIN_SERVERS: ServerSpec[] = [
  {
    name: "clangd",
    command: ["clangd", "--background-index", "--clang-tidy"],
    extensions: [".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx"],
  },
  {
    name: "basedpyright",
    command: ["basedpyright-langserver", "--stdio"],
    extensions: [".py", ".pyi"],
  },
  {
    name: "pyright",
    command: ["pyright-langserver", "--stdio"],
    extensions: [".py", ".pyi"],
  },
  {
    name: "pylsp",
    command: ["pylsp"],
    extensions: [".py", ".pyi"],
  },
  {
    name: "ty",
    command: ["ty", "server"],
    extensions: [".py", ".pyi"],
    actions: ["diagnostics"],
  },
  {
    name: "ruff",
    command: ["ruff", "server"],
    extensions: [".py", ".pyi"],
    actions: ["diagnostics"],
  },
  {
    name: "rust-analyzer",
    command: ["rust-analyzer"],
    extensions: [".rs"],
  },
  {
    name: "typescript-language-server",
    command: ["typescript-language-server", "--stdio"],
    extensions: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"],
  },
  {
    name: "vtsls",
    command: ["vtsls", "--stdio"],
    extensions: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"],
  },
  {
    name: "deno",
    command: ["deno", "lsp"],
    extensions: [".js", ".jsx", ".mjs", ".ts", ".tsx", ".mts"],
  },
  {
    name: "biome",
    command: ["biome", "lsp-proxy"],
    extensions: [".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"],
    actions: ["diagnostics"],
  },
  {
    name: "csharp-ls",
    command: ["csharp-ls"],
    extensions: [".cs"],
  },
  {
    name: "omnisharp",
    command: ["OmniSharp", "--languageserver"],
    extensions: [".cs"],
  },
  {
    name: "gopls",
    command: ["gopls", "serve"],
    extensions: [".go"],
  },
  {
    name: "texlab",
    command: ["texlab"],
    extensions: [".tex", ".ltx", ".bib"],
  },
  {
    name: "tinymist",
    command: ["tinymist"],
    extensions: [".typ"],
  },
];

const SemanticParams = Type.Object({
  action: StringEnum(ACTIONS, { description: "Semantic operation to run." }),
  path: Type.Optional(Type.String({ description: "Source file path. Required for all non-status actions." })),
  line: Type.Optional(Type.Integer({ minimum: 1, description: "1-indexed source line for position operations." })),
  character: Type.Optional(Type.Integer({ minimum: 1, description: "1-indexed UTF-16 column. Inferred from symbol when omitted." })),
  symbol: Type.Optional(Type.String({ description: "Symbol text used to infer the column on the selected line." })),
  query: Type.Optional(Type.String({ description: "Workspace-symbol query." })),
  newName: Type.Optional(Type.String({ description: "Replacement identifier for rename." })),
  apply: Type.Optional(Type.Boolean({ description: "Apply rename edits. Defaults to false and only previews." })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_RESULTS, description: "Maximum returned items. Defaults to 40." })),
  timeoutSeconds: Type.Optional(Type.Integer({ minimum: 5, maximum: 120, description: "LSP request timeout. Defaults to 25 seconds." })),
});

type SemanticParamsType = Static<typeof SemanticParams>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bounded(text: string, maxBytes = OUTPUT_BYTES): string {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.byteLength <= maxBytes) return text;
  return `${bytes.subarray(0, maxBytes).toString("utf8")}\n[truncated to ${maxBytes} bytes]`;
}

function stripAt(value: string): string {
  return value.startsWith("@") ? value.slice(1) : value;
}

function resolveExecutable(command: string, root?: string): string | undefined {
  const cacheKey = `${root ?? "<path>"}\0${command}`;
  if (commandCache.has(cacheKey)) return commandCache.get(cacheKey) ?? undefined;

  const localNames = process.platform === "win32" ? [command, `${command}.cmd`, `${command}.exe`] : [command];
  if (isAbsolute(command)) {
    const found = existsSync(command) ? command : undefined;
    commandCache.set(cacheKey, found ?? null);
    return found;
  }
  if ((command.includes("/") || command.includes("\\")) && root) {
    const candidate = resolve(root, command);
    const found = existsSync(candidate) ? candidate : undefined;
    commandCache.set(cacheKey, found ?? null);
    return found;
  }

  const virtualEnvBin = process.platform === "win32" ? "Scripts" : "bin";
  const localDirs = [
    ...(root ? [
      join(root, "node_modules", ".bin"),
      join(root, ".venv", virtualEnvBin),
      join(root, "venv", virtualEnvBin),
    ] : []),
    join(homedir(), ".local", "bin"),
    join(homedir(), ".dotnet", "tools"),
    join(homedir(), "go", "bin"),
  ];
  for (const directory of localDirs) {
    for (const name of localNames) {
      const candidate = join(directory, name);
      if (existsSync(candidate)) {
        commandCache.set(cacheKey, candidate);
        return candidate;
      }
    }
  }

  const probe = process.platform === "win32" ? spawnSync("where", [command], { stdio: "ignore" }) : spawnSync("which", [command], { stdio: "ignore" });
  const found = probe.status === 0 ? command : undefined;
  commandCache.set(cacheKey, found ?? null);
  return found;
}

function resolvedServer(server: ServerSpec, root?: string): ServerSpec | undefined {
  const executable = resolveExecutable(server.command[0]!, root);
  return executable ? { ...server, command: [executable, ...server.command.slice(1)] } : undefined;
}

function parseServerConfig(path: string): ServerSpec[] {
  if (!existsSync(path)) return [];
  const raw = JSON.parse(requireFile(path)) as unknown;
  if (!isRecord(raw) || !isRecord(raw.servers)) throw new Error(`Invalid semantic-code config: ${path}`);
  const servers: ServerSpec[] = [];
  for (const [name, value] of Object.entries(raw.servers)) {
    if (!isRecord(value)) throw new Error(`Invalid server ${name} in ${path}`);
    const command = Array.isArray(value.command) && value.command.every((item) => typeof item === "string")
      ? value.command as string[]
      : undefined;
    const extensions = Array.isArray(value.extensions) && value.extensions.every((item) => typeof item === "string")
      ? (value.extensions as string[]).map((item) => item.startsWith(".") ? item.toLowerCase() : `.${item.toLowerCase()}`)
      : undefined;
    if (!command?.length || !extensions?.length) throw new Error(`Server ${name} requires command[] and extensions[] in ${path}`);
    const actions = Array.isArray(value.actions)
      ? value.actions.filter((item): item is Action => typeof item === "string" && ACTIONS.includes(item as Action))
      : undefined;
    const languageIds = isRecord(value.languageIds)
      ? Object.fromEntries(Object.entries(value.languageIds).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
      : undefined;
    servers.push({
      name,
      command,
      extensions,
      ...(actions?.length ? { actions } : {}),
      ...(languageIds ? { languageIds } : {}),
      enabled: value.enabled !== false,
    });
  }
  return servers;
}

function requireFile(path: string): string {
  return readFileSync(path, "utf8");
}

function loadServers(cwd: string, projectTrusted: boolean): ServerSpec[] {
  const byName = new Map(BUILTIN_SERVERS.map((server) => [server.name, server]));
  const userPath = join(getAgentDir(), "semantic-code.json");
  const projectPath = join(cwd, CONFIG_DIR_NAME, "semantic-code.json");
  for (const server of parseServerConfig(userPath)) byName.set(server.name, server);
  if (projectTrusted) {
    for (const server of parseServerConfig(projectPath)) byName.set(server.name, server);
  }
  return [...byName.values()].filter((server) => server.enabled !== false);
}

function supportsAction(server: ServerSpec, action: Action): boolean {
  return action === "status" || !server.actions || server.actions.includes(action);
}

function candidatesFor(servers: ServerSpec[], extension: string, action: Action): ServerSpec[] {
  return servers.filter((server) => server.extensions.includes(extension) && supportsAction(server, action));
}

function selectServer(servers: ServerSpec[], extension: string, action: Action, root: string): ServerSpec | undefined {
  for (const server of candidatesFor(servers, extension, action)) {
    const resolved = resolvedServer(server, root);
    if (resolved) return resolved;
  }
  return undefined;
}

function sourceRoot(file: string, cwd: string): string {
  let current = dirname(file);
  const floor = resolve(cwd);
  const markers = [".git", "Cargo.toml", "go.mod", "pyproject.toml", "package.json", "CMakeLists.txt", "typst.toml", "latexmkrc"];
  while (true) {
    if (markers.some((marker) => existsSync(join(current, marker))) || readdirSync(current, { withFileTypes: true }).some((entry) => entry.isFile() && entry.name.endsWith(".sln"))) return current;
    if (current === floor || dirname(current) === current) return floor;
    const next = dirname(current);
    if (!relative(floor, next).startsWith("..")) current = next;
    else return floor;
  }
}

function languageId(server: ServerSpec, extension: string): string {
  return server.languageIds?.[extension] ?? COMMON_LANGUAGE_IDS[extension] ?? extension.replace(/^\./, "");
}

class LspClient {
  private child?: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private diagnostics = new Map<string, unknown[]>();
  private stderr = "";
  capabilities: JsonRecord = {};

  constructor(private readonly server: ServerSpec, private readonly root: string, private readonly timeoutMs: number, private readonly signal?: AbortSignal) {}

  async start(): Promise<void> {
    if (this.signal?.aborted) throw new Error("LSP request cancelled");
    const child = spawn(this.server.command[0]!, this.server.command.slice(1), {
      cwd: this.root,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout.on("data", (chunk: Buffer) => this.onData(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      if (this.stderr.length < 8_000) this.stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => this.rejectAll(error));
    child.on("exit", (code, signal) => {
      if (this.pending.size) this.rejectAll(new Error(`${this.server.name} exited (${code ?? signal ?? "unknown"})${this.stderr.trim() ? `: ${bounded(this.stderr.trim(), 2_000)}` : ""}`));
    });
    this.signal?.addEventListener("abort", () => this.kill(), { once: true });

    const rootUri = pathToFileURL(this.root).toString();
    const result = await this.request("initialize", {
      processId: process.pid,
      clientInfo: { name: "pi-semantic-code", version: "0.1.0" },
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: basename(this.root) }],
      capabilities: {
        workspace: { workspaceFolders: true, configuration: true, symbol: { dynamicRegistration: false } },
        textDocument: {
          definition: { dynamicRegistration: false, linkSupport: true },
          references: { dynamicRegistration: false },
          hover: { dynamicRegistration: false, contentFormat: ["markdown", "plaintext"] },
          documentSymbol: { dynamicRegistration: false, hierarchicalDocumentSymbolSupport: true },
          diagnostic: { dynamicRegistration: false },
          rename: { dynamicRegistration: false, prepareSupport: true },
          publishDiagnostics: { relatedInformation: true, versionSupport: true },
        },
      },
    });
    if (isRecord(result) && isRecord(result.capabilities)) this.capabilities = result.capabilities;
    this.notify("initialized", {});
  }

  open(uri: string, text: string, lang: string): void {
    this.notify("textDocument/didOpen", { textDocument: { uri, languageId: lang, version: 1, text } });
  }

  getPublishedDiagnostics(uri: string): unknown[] {
    return this.diagnostics.get(uri) ?? [];
  }

  async request(method: string, params: unknown): Promise<unknown> {
    const child = this.child;
    if (!child) throw new Error(`${this.server.name} is not running`);
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error(`${this.server.name} timed out during ${method}`));
      }, this.timeoutMs);
      const onAbort = () => {
        this.pending.delete(id);
        rejectPromise(new Error("LSP request cancelled"));
      };
      if (this.signal?.aborted) {
        clearTimeout(timer);
        rejectPromise(new Error("LSP request cancelled"));
        return;
      }
      this.signal?.addEventListener("abort", onAbort, { once: true });
      const cleanup = () => {
        clearTimeout(timer);
        this.signal?.removeEventListener("abort", onAbort);
      };
      this.pending.set(id, {
        resolve: (value) => { cleanup(); resolvePromise(value); },
        reject: (error) => { cleanup(); rejectPromise(error); },
        cleanup,
      });
      try {
        this.write({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        this.pending.delete(id);
        cleanup();
        rejectPromise(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  notify(method: string, params: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  async close(): Promise<void> {
    if (!this.child) return;
    try {
      await this.request("shutdown", null);
      this.notify("exit", null);
    } catch {
      // Shutdown is best-effort; the process is killed below.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
    this.kill();
  }

  private kill(): void {
    if (this.child && !this.child.killed) this.child.kill("SIGTERM");
  }

  private write(message: unknown): void {
    const child = this.child;
    if (!child || child.stdin.destroyed) throw new Error(`${this.server.name} stdin is unavailable`);
    const body = Buffer.from(JSON.stringify(message), "utf8");
    child.stdin.write(`Content-Length: ${body.byteLength}\r\n\r\n`);
    child.stdin.write(body);
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (this.buffer.byteLength < bodyStart + length) return;
      const body = this.buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
      this.buffer = this.buffer.subarray(bodyStart + length);
      try {
        this.onMessage(JSON.parse(body) as unknown);
      } catch {
        // Ignore malformed server notifications; valid responses remain usable.
      }
    }
  }

  private onMessage(message: unknown): void {
    if (!isRecord(message)) return;
    if (typeof message.id === "number" && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (isRecord(message.error)) pending.reject(new Error(String(message.error.message ?? "LSP request failed")));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === "textDocument/publishDiagnostics" && isRecord(message.params)) {
      const uri = typeof message.params.uri === "string" ? message.params.uri : undefined;
      const items = Array.isArray(message.params.diagnostics) ? message.params.diagnostics : [];
      if (uri) this.diagnostics.set(uri, items);
      return;
    }
    if (typeof message.id === "number" && typeof message.method === "string") {
      let result: unknown = null;
      if (message.method === "workspace/configuration" && isRecord(message.params) && Array.isArray(message.params.items)) {
        result = message.params.items.map(() => null);
      } else if (message.method === "workspace/workspaceFolders") {
        const uri = pathToFileURL(this.root).toString();
        result = [{ uri, name: basename(this.root) }];
      }
      this.write({ jsonrpc: "2.0", id: message.id, result });
    }
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.cleanup();
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function targetPosition(text: string, params: SemanticParamsType): Position {
  if (!params.line) throw new Error(`${params.action} requires line`);
  const lines = text.split(/\r?\n/);
  const line = params.line - 1;
  if (line < 0 || line >= lines.length) throw new Error(`Line ${params.line} is outside the file`);
  if (params.character) return { line, character: params.character - 1 };
  const source = lines[line] ?? "";
  if (params.symbol) {
    const index = source.indexOf(params.symbol);
    if (index < 0) throw new Error(`Symbol ${params.symbol} was not found on line ${params.line}`);
    return { line, character: index };
  }
  const match = /[A-Za-z_$][\w$]*/.exec(source);
  if (!match) throw new Error(`Cannot infer a symbol column on line ${params.line}; provide character or symbol`);
  return { line, character: match.index };
}

function uriPath(uri: string): string {
  try {
    return uri.startsWith("file:") ? fileURLToPath(uri) : uri;
  } catch {
    return uri;
  }
}

function rangeOf(value: unknown): Range | undefined {
  if (!isRecord(value) || !isRecord(value.start) || !isRecord(value.end)) return undefined;
  const start = value.start;
  const end = value.end;
  if (typeof start.line !== "number" || typeof start.character !== "number" || typeof end.line !== "number" || typeof end.character !== "number") return undefined;
  return { start: { line: start.line, character: start.character }, end: { line: end.line, character: end.character } };
}

function displayPath(path: string, root: string): string {
  const rel = relative(root, path);
  return !rel.startsWith("..") && !isAbsolute(rel) ? rel || basename(path) : path;
}

function locationLine(value: unknown, root: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const uri = typeof value.uri === "string" ? value.uri : typeof value.targetUri === "string" ? value.targetUri : undefined;
  const range = rangeOf(value.range) ?? rangeOf(value.targetSelectionRange);
  if (!uri) return undefined;
  const suffix = range ? `:${range.start.line + 1}:${range.start.character + 1}` : "";
  return `${displayPath(uriPath(uri), root)}${suffix}`;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function formatLocations(value: unknown, root: string, limit: number): string {
  const lines = asArray(value).flatMap((item) => {
    const line = locationLine(item, root);
    return line ? [line] : [];
  });
  return lines.length ? lines.slice(0, limit).join("\n") + (lines.length > limit ? `\n... ${lines.length - limit} more` : "") : "No locations returned.";
}

function diagnosticItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.items)) return value.items;
  return [];
}

function formatDiagnostics(items: unknown[], root: string, file: string, limit: number): string {
  const severityNames = ["", "error", "warning", "info", "hint"];
  const lines = items.slice(0, limit).map((item) => {
    if (!isRecord(item)) return String(item);
    const range = rangeOf(item.range);
    const severity = typeof item.severity === "number" ? severityNames[item.severity] ?? `severity-${item.severity}` : "diagnostic";
    const source = typeof item.source === "string" ? ` ${item.source}` : "";
    const code = typeof item.code === "string" || typeof item.code === "number" ? ` ${item.code}` : "";
    const message = String(item.message ?? "Unknown diagnostic").replace(/\s+/g, " ");
    const position = range ? `:${range.start.line + 1}:${range.start.character + 1}` : "";
    return `${displayPath(file, root)}${position} [${severity}${source}${code}] ${message}`;
  });
  if (!lines.length) return "No diagnostics reported.";
  if (items.length > limit) lines.push(`... ${items.length - limit} more diagnostics`);
  return lines.join("\n");
}

function hoverText(value: unknown): string {
  if (!isRecord(value)) return "No hover information returned.";
  const contents = value.contents;
  const render = (item: unknown): string => {
    if (typeof item === "string") return item;
    if (isRecord(item) && typeof item.value === "string") return item.value;
    return JSON.stringify(item);
  };
  return Array.isArray(contents) ? contents.map(render).join("\n\n") : render(contents);
}

function formatSymbols(value: unknown, root: string, limit: number): string {
  const flatten = (items: unknown[], depth = 0): string[] => items.flatMap((item) => {
    if (!isRecord(item)) return [];
    const name = typeof item.name === "string" ? item.name : "<anonymous>";
    const kind = typeof item.kind === "number" ? `kind=${item.kind}` : "symbol";
    const location = isRecord(item.location) ? locationLine(item.location, root) : undefined;
    const range = rangeOf(item.selectionRange) ?? rangeOf(item.range);
    const suffix = location ?? (range ? `line ${range.start.line + 1}:${range.start.character + 1}` : "");
    const current = `${"  ".repeat(depth)}${name} [${kind}]${suffix ? ` ${suffix}` : ""}`;
    const children = Array.isArray(item.children) ? flatten(item.children, depth + 1) : [];
    return [current, ...children];
  });
  const lines = flatten(asArray(value));
  return lines.length ? lines.slice(0, limit).join("\n") + (lines.length > limit ? `\n... ${lines.length - limit} more symbols` : "") : "No symbols returned.";
}

function workspaceEdits(value: unknown): Map<string, TextEdit[]> {
  const result = new Map<string, TextEdit[]>();
  const add = (uri: string, edits: unknown[]) => {
    const valid = edits.flatMap((item): TextEdit[] => {
      if (!isRecord(item) || typeof item.newText !== "string") return [];
      const range = rangeOf(item.range);
      return range ? [{ range, newText: item.newText }] : [];
    });
    if (valid.length) result.set(uriPath(uri), [...(result.get(uriPath(uri)) ?? []), ...valid]);
  };
  if (!isRecord(value)) return result;
  if (isRecord(value.changes)) {
    for (const [uri, edits] of Object.entries(value.changes)) if (Array.isArray(edits)) add(uri, edits);
  }
  if (Array.isArray(value.documentChanges)) {
    for (const change of value.documentChanges) {
      if (!isRecord(change) || !isRecord(change.textDocument) || typeof change.textDocument.uri !== "string" || !Array.isArray(change.edits)) continue;
      add(change.textDocument.uri, change.edits);
    }
  }
  return result;
}

function positionOffset(text: string, position: Position): number {
  const lines = text.split(/\r?\n/);
  if (position.line < 0 || position.line >= lines.length) throw new Error(`Edit line ${position.line + 1} is outside the file`);
  let offset = 0;
  for (let index = 0; index < position.line; index++) offset += (lines[index]?.length ?? 0) + 1;
  return offset + Math.min(position.character, lines[position.line]?.length ?? 0);
}

async function applyEdits(root: string, editsByFile: Map<string, TextEdit[]>): Promise<void> {
  for (const [file, edits] of editsByFile) {
    const rel = relative(root, file);
    if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Rename attempted to edit outside workspace: ${file}`);
    await withFileMutationQueue(file, async () => {
      let text = await readFile(file, "utf8");
      const ordered = edits.map((edit) => ({
        edit,
        start: positionOffset(text, edit.range.start),
        end: positionOffset(text, edit.range.end),
      })).sort((left, right) => right.start - left.start || right.end - left.end);
      for (const item of ordered) text = `${text.slice(0, item.start)}${item.edit.newText}${text.slice(item.end)}`;
      await writeFile(file, text, "utf8");
    });
  }
}

function formatEditPreview(root: string, editsByFile: Map<string, TextEdit[]>): string {
  if (!editsByFile.size) return "Rename returned no edits.";
  const lines: string[] = [];
  for (const [file, edits] of editsByFile) {
    lines.push(`${displayPath(file, root)}: ${edits.length} edit(s)`);
    for (const edit of edits.slice(0, 10)) lines.push(`  ${edit.range.start.line + 1}:${edit.range.start.character + 1}-${edit.range.end.line + 1}:${edit.range.end.character + 1}`);
    if (edits.length > 10) lines.push(`  ... ${edits.length - 10} more`);
  }
  return lines.join("\n");
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const timer = setTimeout(resolvePromise, ms);
    const abort = () => { clearTimeout(timer); rejectPromise(new Error("LSP request cancelled")); };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

async function runSemantic(
  client: LspClient,
  params: SemanticParamsType,
  file: string | undefined,
  root: string,
  extension: string,
  lang: string,
  signal?: AbortSignal,
): Promise<{ text: string; count?: number; applied?: boolean }> {
  const limit = params.limit ?? 40;
  let source = "";
  let uri = "";
  if (file) {
    source = await readFile(file, "utf8");
    uri = pathToFileURL(file).toString();
    client.open(uri, source, lang);
  }

  if (params.action === "diagnostics") {
    let items: unknown[] = [];
    try {
      const provider = client.capabilities.diagnosticProvider;
      if (provider) items = diagnosticItems(await client.request("textDocument/diagnostic", { textDocument: { uri } }));
    } catch {
      // Push diagnostics are used below when pull diagnostics are unsupported.
    }
    if (!items.length) {
      await delay(900, signal);
      items = client.getPublishedDiagnostics(uri);
    }
    return { text: formatDiagnostics(items, root, file!, limit), count: items.length };
  }

  if (params.action === "symbols") {
    const result = file
      ? await client.request("textDocument/documentSymbol", { textDocument: { uri } })
      : await client.request("workspace/symbol", { query: params.query ?? "" });
    return { text: formatSymbols(result, root, limit), count: asArray(result).length };
  }

  const position = targetPosition(source, params);
  const textDocument = { uri };
  if (params.action === "definition") {
    const result = await client.request("textDocument/definition", { textDocument, position });
    return { text: formatLocations(result, root, limit), count: asArray(result).length };
  }
  if (params.action === "references") {
    const result = await client.request("textDocument/references", { textDocument, position, context: { includeDeclaration: true } });
    return { text: formatLocations(result, root, limit), count: asArray(result).length };
  }
  if (params.action === "hover") {
    const result = await client.request("textDocument/hover", { textDocument, position });
    return { text: hoverText(result), count: result == null ? 0 : 1 };
  }
  if (params.action === "rename") {
    if (!params.newName?.trim()) throw new Error("rename requires newName");
    const result = await client.request("textDocument/rename", { textDocument, position, newName: params.newName.trim() });
    const edits = workspaceEdits(result);
    const preview = formatEditPreview(root, edits);
    if (params.apply === true) await applyEdits(root, edits);
    return { text: params.apply === true ? `Applied rename:\n${preview}` : `Rename preview (set apply=true to write):\n${preview}`, count: [...edits.values()].reduce((sum, values) => sum + values.length, 0), applied: params.apply === true };
  }
  throw new Error(`Unsupported semantic action: ${params.action}`);
}

function statusText(servers: ServerSpec[], root: string): string {
  const groups = [
    ["C/C++", [".c", ".cpp", ".h"]],
    ["Python", [".py"]],
    ["Rust", [".rs"]],
    ["JavaScript/TypeScript", [".js", ".ts", ".tsx"]],
    ["C#", [".cs"]],
    ["Go", [".go"]],
    ["LaTeX", [".tex", ".bib"]],
    ["Typst", [".typ"]],
  ] as const;
  return groups.map(([label, extensions]) => {
    const matches = servers.filter((server) => extensions.some((extension) => server.extensions.includes(extension)));
    const ready = matches.flatMap((server) => {
      const resolved = resolvedServer(server, root);
      return resolved ? [resolved] : [];
    });
    const details = ready.length
      ? ready.map((server) => `${server.name} (${server.command.join(" ")})`).join(", ")
      : `missing; install one of: ${matches.map((server) => server.command[0]).join(", ")}`;
    return `${label}: ${details}`;
  }).join("\n");
}

export default function semanticCode(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "semantic_code",
    label: "Semantic Code",
    description: "Query an automatically selected language server for diagnostics, definitions, references, hover, symbols, or rename. Supports C/C++, Python, Rust, JavaScript/TypeScript, C#, Go, LaTeX, and Typst. Results are capped at 12KB; rename previews unless apply=true.",
    parameters: SemanticParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const action = params.action as Action;
      const servers = loadServers(ctx.cwd, ctx.isProjectTrusted());
      if (action === "status") {
        return { content: [{ type: "text", text: statusText(servers, ctx.cwd) }], details: { action } satisfies SemanticDetails };
      }

      const file = params.path ? resolve(ctx.cwd, stripAt(params.path)) : undefined;
      if (!file && action !== "symbols") throw new Error(`${action} requires path`);
      if (file) {
        const metadata = await stat(file).catch(() => undefined);
        if (!metadata?.isFile()) throw new Error(`Source file not found: ${file}`);
      }
      const extension = file ? extname(file).toLowerCase() : "";
      const root = file ? sourceRoot(file, ctx.cwd) : ctx.cwd;
      const candidates = file ? candidatesFor(servers, extension, action) : servers.filter((server) => supportsAction(server, action));
      const server = file
        ? selectServer(servers, extension, action, root)
        : candidates.map((candidate) => resolvedServer(candidate, root)).find((candidate): candidate is ServerSpec => candidate !== undefined);
      if (!server) {
        const expected = candidates.map((candidate) => candidate.command[0]).filter(Boolean);
        throw new Error(expected.length
          ? `No available LSP server for ${extension || action}. Install one of: ${[...new Set(expected)].join(", ")}`
          : `No configured LSP server supports ${action} for ${extension || "this workspace"}`);
      }

      const lang = file ? languageId(server, extension) : "workspace";
      const timeoutMs = (params.timeoutSeconds ?? DEFAULT_TIMEOUT_MS / 1_000) * 1_000;
      onUpdate?.({ content: [{ type: "text", text: `Starting ${server.name} for ${action}...` }], details: { action, server: server.name, language: lang, root } satisfies SemanticDetails });
      const client = new LspClient(server, root, timeoutMs, signal);
      try {
        await client.start();
        const result = await runSemantic(client, params, file, root, extension, lang, signal);
        return {
          content: [{ type: "text", text: bounded(`${server.name} (${lang})\n${result.text}`) }],
          details: { action, server: server.name, language: lang, root, count: result.count, applied: result.applied } satisfies SemanticDetails,
        };
      } finally {
        await client.close();
      }
    },
  });
}
