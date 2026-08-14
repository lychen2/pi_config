import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Value } from "typebox/value";

import register from "../index.ts";

const execFileAsync = promisify(execFile);

function fakePi() {
  const tools = new Map();
  const handlers = new Map();
  const messages = [];
  return {
    tools,
    handlers,
    messages,
    registerTool(tool) { tools.set(tool.name, tool); },
    on(name, handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    sendMessage(message) { messages.push(message); },
  };
}

async function git(cwd, ...args) {
  await execFileAsync("git", args, { cwd });
}

async function makeConflictWorkspace() {
  const cwd = await mkdtemp(join(tmpdir(), "pi-maestro-tools-test-"));
  await git(cwd, "init", "-q");
  await git(cwd, "config", "user.email", "test@example.invalid");
  await git(cwd, "config", "user.name", "Pi test");
  await writeFile(join(cwd, "file.txt"), "base\n", "utf8");
  await git(cwd, "add", "file.txt");
  await git(cwd, "commit", "-qm", "base");
  await git(cwd, "checkout", "-qb", "theirs");
  await writeFile(join(cwd, "file.txt"), "theirs\n", "utf8");
  await git(cwd, "commit", "-qam", "theirs");
  await git(cwd, "checkout", "-q", "master");
  await writeFile(join(cwd, "file.txt"), "ours\n", "utf8");
  await git(cwd, "commit", "-qam", "ours");
  await git(cwd, "merge", "theirs").catch(() => {});
  return cwd;
}

test("registers the focused replacement tools", () => {
  const pi = fakePi();
  register(pi);
  assert.deepEqual([...pi.tools.keys()].sort(), ["bash_bg", "conflict", "fffind", "ffgrep"]);
  assert.equal(pi.handlers.get("session_shutdown").length, 3);
});

test("bash_bg sends a completion wake-up for background jobs", async () => {
  const pi = fakePi();
  register(pi);
  const tool = pi.tools.get("bash_bg");
  const result = await tool.execute("id", {
    action: "start",
    command: "printf completed",
    cwd: process.cwd(),
  }, undefined, undefined, { cwd: process.cwd() });
  const jobId = result.details.jobId;
  assert.match(result.content[0].text, /^Started /);
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(pi.messages.length, 1);
  assert.equal(pi.messages[0].details.jobId, jobId);
  assert.match(pi.messages[0].content, /completed/);
  await Promise.all(pi.handlers.get("session_shutdown").map((handler) => handler()));
});

test("bash_bg run promotes a long command to the background", async () => {
  const pi = fakePi();
  register(pi);
  const tool = pi.tools.get("bash_bg");
  const result = await tool.execute("id", {
    action: "run",
    command: "sleep 1",
    timeout: 1,
    cwd: process.cwd(),
  }, undefined, undefined, { cwd: process.cwd() });
  assert.match(result.content[0].text, /Moved to background/);
  await Promise.all(pi.handlers.get("session_shutdown").map((handler) => handler()));
});

test("conflict schema requires a numbered handle for diff", () => {
  const pi = fakePi();
  register(pi);
  const schema = pi.tools.get("conflict").parameters;
  assert.equal(Value.Check(schema, { action: "diff", uri: "conflict://1" }), true);
  assert.equal(Value.Check(schema, { action: "diff", uri: "conflict://*" }), false);
  assert.equal(Value.Check(schema, { action: "resolve", uri: "conflict://*", content: "@ours" }), true);
});

test("conflict lists and resolves the current Git hunk", async () => {
  const cwd = await makeConflictWorkspace();
  const pi = fakePi();
  register(pi);
  const tool = pi.tools.get("conflict");
  const list = await tool.execute("id", { action: "list" }, undefined, undefined, { cwd });
  assert.match(list.content[0].text, /conflict:\/\/1/);
  const diff = await tool.execute("id", { action: "diff", uri: "conflict://1" }, undefined, undefined, { cwd });
  assert.match(diff.content[0].text, /ours/);
  assert.match(diff.content[0].text, /theirs/);
  const resolved = await tool.execute("id", { action: "resolve", uri: "conflict://1", content: "@theirs" }, undefined, undefined, { cwd });
  assert.match(resolved.content[0].text, /Resolved 1 conflict/);
  assert.equal(await readFile(join(cwd, "file.txt"), "utf8"), "theirs\n");
});

test("conflict refuses a stale hunk", async () => {
  const cwd = await makeConflictWorkspace();
  const pi = fakePi();
  register(pi);
  const tool = pi.tools.get("conflict");
  await tool.execute("id", { action: "list" }, undefined, undefined, { cwd });
  await writeFile(join(cwd, "file.txt"), "changed\n", "utf8");
  await assert.rejects(
    tool.execute("id", { action: "resolve", uri: "conflict://1", content: "@ours" }, undefined, undefined, { cwd }),
    /changed since scan/,
  );
});

test("bash_bg returns a structured failure for a missing command", async () => {
  const pi = fakePi();
  register(pi);
  const tool = pi.tools.get("bash_bg");
  const result = await tool.execute("id", { action: "run" }, undefined, undefined, { cwd: process.cwd() });
  assert.equal(result.details.ok, false);
  assert.equal(result.details.code, "INVALID_ARGUMENT");
  assert.equal(result.details.field, "command");

  const marker = pi.handlers.get("tool_result")[0];
  assert.equal(marker({ details: result.details }).isError, true);
});

test("conflict returns a structured failure for a missing URI", async () => {
  const cwd = await makeConflictWorkspace();
  const pi = fakePi();
  register(pi);
  const tool = pi.tools.get("conflict");
  const result = await tool.execute("id", { action: "diff" }, undefined, undefined, { cwd });
  assert.equal(result.details.ok, false);
  assert.equal(result.details.code, "INVALID_ARGUMENT");
  assert.equal(result.details.field, "uri");

  const marker = pi.handlers.get("tool_result")[0];
  assert.equal(marker({ details: result.details }).isError, true);
});
