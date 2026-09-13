import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Blocks bash calls that a base tool already covers, so the model routes through the
// tool (indexed, .gitignore-aware, timeout-bounded) instead of raw shell.
// Fails open: shell composition, unknown flags, or an inactive replacement all pass.

const DISABLE_ENV = "PI_BASH_GUARD_DISABLE";

type Group = {
  tool: string;
  hint: string;
  verbs: Set<string>;
  valueFlags: Set<string>; // consumes one argument
  bailFlags: Set<string>; // semantics the replacement tool does not reproduce
  cluster: string; // letters that are safe to bundle into one short flag
  numeric?: boolean; // -25 / -n25 style counts the tool expresses as a limit
};

const GROUPS: Group[] = [
  {
    tool: "read",
    hint: "use the read tool (offset/limit for ranges)",
    verbs: new Set(["cat", "head", "tail", "less", "more", "bat", "view", "nl", "tac"]),
    valueFlags: new Set(["-n"]),
    bailFlags: new Set([
      "-f", "-F", "--follow", "--retry", "-s", "--sleep-interval", "-p", "--preset",
      "-b", "--binary", "--pid", "-r", "--reverse", "-z", "--zero-terminated",
      "-c", "--chars", "-C", "--bytes", "--delimiter", "-t",
    ]),
    cluster: "qAu",
    numeric: true,
  },
  {
    tool: "ls",
    hint: "use the ls tool",
    verbs: new Set(["ls", "eza", "exa"]),
    valueFlags: new Set(["-T", "--charset", "--time-style", "--color", "-I", "--ignore"]),
    bailFlags: new Set(["-L", "-P", "--format", "--time", "--quoting-style", "-D", "--full-lines", "--hyperlink"]),
    cluster: "abdhloqstuxFGX1",
  },
  {
    tool: "grep",
    hint: "use the grep tool (pattern/path/glob/ignoreCase params)",
    verbs: new Set(["grep", "egrep", "fgrep", "rg", "ag", "ack"]),
    valueFlags: new Set([
      "-m", "--max-count", "-e", "--regexp", "-f", "--file", "-g", "--glob",
      "--exclude", "--exclude-dir", "--include", "--type", "-A", "-B", "-C",
      "--engine", "--ignore-file", "--pre", "--sort", "--sortr", "-M", "-S",
      "-T", "--threads", "--context-separator",
    ]),
    bailFlags: new Set([
      "-c", "--count", "-o", "--only-matching", "-v", "--invert-match", "-w",
      "--stats", "--json", "-0", "--null", "--files", "-z", "--null-data",
      "--hostname-bin", "--debug", "-l", "--files-without-match", "-q",
      "--color", "--colors", "-a", "--text", "--vimgrep", "--pre-glob",
    ]),
    cluster: "hinrsHVnx",
  },
  {
    tool: "find",
    hint: "use the find tool (glob pattern + path)",
    verbs: new Set(["find", "fd", "fdfind"]),
    valueFlags: new Set([
      "-name", "-iname", "-path", "-ipath", "-regex", "-maxdepth", "-mindepth",
      "-depth", "-newer", "-newermt", "-perm", "-user", "-group", "-size", "-t",
      "-E", "--engine", "--strip-cwd-prefix", "--prune",
    ]),
    bailFlags: new Set([
      "-exec", "-execdir", "-ok", "-okdir", "-delete", "-printf", "-fprintf",
      "-ls", "-fls", "-mtime", "-atime", "-ctime", "-empty", "-not", "!",
      "--exec", "--exec-batch", "--run", "-X", "--transform", "-a",
      "--absolute-paths", "-o",
    ]),
    cluster: "HSL",
  },
];

// Metacharacters that mean real shell work. Checked outside quotes only, so
// `find . -name "*.ts"` is still a plain single command.
const META = "<>|;&()`$\\";

function tokenize(command: string): string[] | undefined {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let has = false;

  const push = () => {
    if (has) tokens.push(current);
    current = "";
    has = false;
  };

  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = undefined;
      else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      has = true;
      continue;
    }
    // Unquoted glob characters change what the command selects; the tools take
    // explicit patterns instead, so treat them as non-equivalent.
    if (META.includes(ch) || "*?[]{}~".includes(ch) || ch === " " || ch === "\t" || ch === "\n") {
      if (ch === " " || ch === "\t" || ch === "\n") {
        push();
        continue;
      }
      return undefined;
    }
    current += ch;
    has = true;
  }
  if (quote) return undefined;
  push();
  return tokens.length ? tokens : undefined;
}

export function classifyBashCommand(command: unknown): { tool: string; hint: string } | undefined {
  if (typeof command !== "string") return undefined;
  const trimmed = command.trim();
  if (!trimmed) return undefined;

  const tokens = tokenize(trimmed);
  if (!tokens) return undefined;

  const [verb, ...args] = tokens;
  if (!verb || verb.includes("/")) return undefined;

  // Explicit line windows are valid exact evidence readback, including SoL archives.
  if (["head", "tail"].includes(verb) && args.some((arg) => /^-\d+$/.test(arg) || /^-n(?:[+-]?\d+)?$/.test(arg) || /^--lines(?:=|$)/.test(arg))) return undefined;

  const group = GROUPS.find((candidate) => candidate.verbs.has(verb));
  if (!group) return undefined;

  let operands = 0;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (group.bailFlags.has(arg)) return undefined;
    if (group.valueFlags.has(arg)) {
      i += 1;
      continue;
    }
    if (!arg.startsWith("-")) {
      operands += 1;
      continue;
    }
    if (arg === "--") continue;
    if (arg === "-") return undefined; // stdin
    if (arg.startsWith("--")) return undefined; // unknown long flags are not equivalent
    if (group.numeric && /^-\d+$/.test(arg)) continue;
    if (group.numeric && /^-\d*m$/.test(arg)) continue;
    // Bundled short flags count only when every letter is a safe cluster member.
    if (![...arg.slice(1)].every((letter) => group.cluster.includes(letter))) return undefined;
  }
  if (operands === 0) return undefined;
  return { tool: group.tool, hint: group.hint };
}

export default function bashGuard(pi: ExtensionAPI): void {
  if (process.env[DISABLE_ENV] === "1") return;

  pi.on("tool_call", (event) => {
    if (event.toolName !== "bash") return undefined;
    const match = classifyBashCommand((event.input as { command?: unknown } | undefined)?.command);
    // Lazy tool rails can leave the replacement inactive; blocking then dead-ends the turn.
    if (!match || !pi.getActiveTools().includes(match.tool)) return undefined;
    return {
      block: true,
      reason: `Bash guard: use the ${match.tool} tool instead (${match.hint}). It is indexed, respects .gitignore, and is timeout-bounded. Set PI_BASH_GUARD_DISABLE=1 to bypass.`,
    };
  });
}
