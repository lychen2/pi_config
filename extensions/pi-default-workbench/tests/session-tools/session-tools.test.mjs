import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { mkdtemp, readdir, readFile, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { exportMarkdown } from "../../session-tools/markdown.ts";
import register from "../../session-tools/index.ts";
import { buildRecords, copyOptions, parseExportArgs, recordsMarkdown } from "../../session-tools/records.ts";
import { CopyBrowser, safeDisplay } from "../../session-tools/copy-browser.ts";

const entry = (id, message) => ({ type: "message", id, parentId: null, timestamp: "", message });
const entries = [
  entry("u1", { role: "user", content: "first question" }),
  entry("a1", { role: "assistant", content: [{ type: "thinking", thinking: "private reasoning" }, { type: "text", text: "answer" }, { type: "toolCall", id: "call", name: "bash", arguments: { command: "pwd" } }] }),
  entry("t1", { role: "toolResult", toolName: "bash", toolCallId: "call", content: [{ type: "text", text: "```\n/home/test" }] }),
  entry("u2", { role: "user", content: [{ type: "text", text: "second question" }, { type: "image", data: "secret-base64" }] }),
  entry("a2", { role: "assistant", content: [{ type: "text", text: "second answer" }] }),
  { type: "custom", id: "c", parentId: "a2", customType: "sol-checkpoint", data: { ref: "obs_1" } },
];

test("Markdown defaults exclude tools, reasoning and internal records", () => {
  const text = recordsMarkdown(buildRecords(entries, parseExportArgs("")));
  assert.match(text, /first question/);
  assert.match(text, /Image omitted/);
  for (const value of ["private reasoning", "pwd", "obs_1", "secret-base64"]) assert.ok(!text.includes(value));
});

test("recent turns, explicit thinking and exact case-insensitive tool filters", () => {
  assert.deepEqual(buildRecords(entries, parseExportArgs("1")).map((r) => r.id), ["u2", "a2"]);
  const text = recordsMarkdown(buildRecords(entries, parseExportArgs("t tc +BASH")));
  assert.match(text, /private reasoning/);
  assert.match(text, /pwd/);
  assert.match(text, /````/);
  assert.ok(!recordsMarkdown(buildRecords(entries, parseExportArgs("tc -bash"))).includes("pwd"));
  assert.ok(!recordsMarkdown(buildRecords(entries, parseExportArgs("tc +ba"))).includes("pwd"));
  for (const args of ["all 2", "+bash", "0", "2 3", "wat"]) assert.throws(() => parseExportArgs(args));
});

test("tool result copy carries original arguments and all export preserves parent metadata", () => {
  const records = buildRecords(entries, copyOptions, true);
  assert.match(records.find((r) => r.id === "t1").text(), /pwd/);
  assert.match(records.find((r) => r.id === "c").text(), /obs_1/);
  assert.match(recordsMarkdown(records, true), /parent: a2/);
});

test("stash restores/swaps exact text and isolates session slots", async () => {
  const commands = new Map(); const events = new Map(); const shortcuts = [];
  register({ registerCommand: (n, c) => commands.set(n, c), registerShortcut: (k) => shortcuts.push(k), on: (n, h) => events.set(n, h) });
  let id = "a"; let text = "draft\n  code"; let status;
  const ctx = { hasUI: true, sessionManager: { getSessionId: () => id }, ui: { getEditorText: () => text, setEditorText: (v) => { text = v; }, setStatus: (_k, v) => { status = v; }, notify() {} } };
  const toggle = () => commands.get("stash").handler("", ctx);
  await toggle(); assert.equal(text, ""); assert.equal(status, "Draft stashed");
  text = "new draft"; await toggle(); assert.equal(text, "draft\n  code");
  text = ""; await toggle(); assert.equal(text, "new draft"); assert.equal(status, undefined);
  text = "session a"; await toggle(); id = "b";
  events.get("session_start")({}, ctx); assert.equal(status, undefined);
  await toggle(); assert.equal(text, ""); id = "a"; await toggle(); assert.equal(text, "session a");
  assert.deepEqual([...commands.keys()], ["stash", "anycopy", "md"]);
  assert.deepEqual(shortcuts, ["ctrl+alt+s", "ctrl+alt+y"]);
});

test("copy browser copies ranges in history order, previews and cancels without touching editor", () => {
  const records = buildRecords(entries, copyOptions);
  let result = null;
  const browser = new CopyBrowser(records, { fg: (_c, s) => s }, (value) => { result = value; }, () => 24);
  browser.handleInput("\x1b[A"); // previous
  browser.handleInput("\x00"); // ctrl+space
  browser.handleInput("\x1b[A");
  browser.handleInput("\x12"); // ctrl+r range
  browser.handleInput("\t"); assert.match(browser.render(80).join("\n"), /Preview/);
  browser.handleInput("\x1b"); browser.handleInput("\r");
  assert.deepEqual(result, [records.length - 3, records.length - 2]);
  browser.handleInput("\x1b"); assert.equal(result, undefined);
  assert.ok(browser.render(8).every((line) => visibleWidth(line) <= 8));
  assert.equal(safeDisplay("hello\x1b[31mred\x1b]52;c;payload\x07\x00"), "hellored");
});

test("save writes private unique files and chooses branch versus all entries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-session-export-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = directory;
  const notices = [];
  let branchReads = 0; let allReads = 0;
  const ctx = { sessionManager: {
    getBranch: () => { branchReads++; return entries.slice(0, 5); },
    getEntries: () => { allReads++; return entries; },
  }, ui: { notify: (message) => notices.push(message) } };
  try {
    await exportMarkdown("1 save", ctx);
    await exportMarkdown("all tc save", ctx);
    const paths = (await readdir(join(directory, "pi-sessions-extracted"))).map((name) => join(directory, "pi-sessions-extracted", name));
    assert.equal(paths.length, 2); assert.equal(branchReads, 1); assert.equal(allReads, 1);
    const texts = await Promise.all(paths.map((path) => readFile(path, "utf8")));
    assert.ok(texts.some((text) => text.includes("all branches") && text.includes("parent:")));
    assert.ok(texts.some((text) => text.includes("second question") && !text.includes("first question")));
    assert.ok(texts.every((text) => !text.includes("obs_1")));
    if (process.platform !== "win32") for (const path of paths) assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal(notices.length, 2);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
