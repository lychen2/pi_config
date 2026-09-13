import assert from "node:assert/strict";
import test from "node:test";

import bashGuard, { classifyBashCommand } from "../bash-guard.ts";

function fakePi(active = ["bash", "read", "ls", "grep", "find"]) {
  const handlers = new Map();
  return {
    handlers,
    on(name, handler) {
      handlers.set(name, handler);
    },
    getActiveTools: () => active,
  };
}

function guard(toolName, command, active) {
  const pi = fakePi(active);
  bashGuard(pi);
  return pi.handlers.get("tool_call")({ toolName, input: { command } }, {});
}

test("blocks commands a base tool reproduces", () => {
  for (const command of [
    "cat foo.ts",
    "ls -la src",
    "grep -rn TODO src",
    "rg needle .",
    "find . -name 'foo.ts'",
    'fd needle src',
  ]) {
    const result = guard("bash", command);
    assert.ok(result?.block, `expected block: ${command}`);
  }
});

test("allows shell work the tools cannot do", () => {
  for (const command of [
    "npm run build",
    "git status",
    "ps aux | grep node",
    'find . -name "*.ts" | wc -l',
    "cat a.txt b.txt > all.txt",
    "grep -c TODO src",
    "grep -v foo src/*.ts",
    "sed -n '1,10p' file",
    "du -sh .",
    "echo hi",
    "cat < f",
    "find . -name *.ts",
    "ls /tmp && pwd",
    "head -c 100 bin",
    "head -50 evidence.txt",
    "tail -n 20 evidence.txt",
    "tail -25 evidence.txt",
    "head -n20 evidence.txt",
    "tail --lines=20 evidence.txt",
    "ls --unknown src",
    "cat --show-ends file",
    "rg --unknown needle .",
  ]) {
    assert.equal(guard("bash", command), undefined, `expected allow: ${command}`);
  }
});

test("fails open when the replacement tool is inactive", () => {
  assert.equal(guard("bash", "cat foo.ts", ["bash"]), undefined);
  assert.ok(guard("bash", "cat foo.ts", ["bash", "read"]));
});

test("ignores non-bash tools and empty input", () => {
  assert.equal(guard("read", "cat foo.ts"), undefined);
  assert.equal(guard("bash", undefined), undefined);
  assert.equal(guard("bash", "   "), undefined);
});
