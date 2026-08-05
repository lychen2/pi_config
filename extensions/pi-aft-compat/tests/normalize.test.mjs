import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import aftCompat, { exclusiveEditSchema, rewriteProviderEditSchema } from "../index.ts";
import { isGitWorktree } from "../normalize.mjs";

const temporaryDirectories = [];
after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

function batchItemSchema(schema) {
  return schema.oneOf.find((branch) => branch.properties?.edits)?.properties.edits.items;
}

test("rewrites OpenAI Responses edit parameters", () => {
  const payload = {
    model: "gpt",
    tools: [
      { type: "function", name: "edit", parameters: { type: "object", properties: {} } },
      { type: "function", name: "read", parameters: { type: "object", properties: {} } },
    ],
  };
  const rewritten = rewriteProviderEditSchema(payload);
  assert.deepEqual(rewritten.tools[0].parameters, exclusiveEditSchema);
  assert.deepEqual(rewritten.tools[1], payload.tools[1]);
  assert.notEqual(rewritten, payload);
  assert.notEqual(rewritten.tools[0].parameters, exclusiveEditSchema);
});

test("rewrites OpenAI Chat and Anthropic edit schemas", () => {
  const chat = { tools: [{ type: "function", function: { name: "edit", parameters: { type: "object" } } }] };
  const anthropic = { tools: [{ name: "edit", input_schema: { type: "object" } }] };
  assert.deepEqual(rewriteProviderEditSchema(chat).tools[0].function.parameters, exclusiveEditSchema);
  assert.deepEqual(rewriteProviderEditSchema(anthropic).tools[0].input_schema, exclusiveEditSchema);
});

test("makes root and nested edit modes mutually exclusive", () => {
  assert.equal(exclusiveEditSchema.oneOf.length, 3);
  assert.deepEqual(exclusiveEditSchema.oneOf.map((branch) => branch.required), [
    ["path", "appendContent"],
    ["path", "edits"],
    ["path", "symbol", "content"],
  ]);
  const item = batchItemSchema(exclusiveEditSchema);
  assert.equal(item.oneOf.length, 2);
  assert.deepEqual(item.oneOf.map((branch) => branch.required), [
    ["oldString", "newString"],
    ["startLine", "endLine", "content"],
  ]);
  assert.ok(item.oneOf.every((branch) => branch.additionalProperties === false));
});

test("leaves payloads without an edit schema unchanged", () => {
  const payload = { tools: [{ type: "function", name: "read", parameters: { type: "object" } }] };
  assert.equal(rewriteProviderEditSchema(payload), payload);
});

test("detects Git and non-Git workspaces", async () => {
  const plain = await mkdtemp(join(tmpdir(), "pi-aft-plain-"));
  const repository = await mkdtemp(join(tmpdir(), "pi-aft-git-"));
  temporaryDirectories.push(plain, repository);
  execFileSync("git", ["init", "-q", repository]);

  assert.equal(isGitWorktree(plain), false);
  assert.equal(isGitWorktree(repository), true);
});

test("keeps grep while removing Git-only AFT tools outside a repository", async () => {
  const plain = await mkdtemp(join(tmpdir(), "pi-aft-plain-"));
  temporaryDirectories.push(plain);
  const previousSearchOverride = process.env.PI_AFT_SEARCH_ALLOW_NO_GIT;
  delete process.env.PI_AFT_SEARCH_ALLOW_NO_GIT;

  try {
    const handlers = new Map();
    let active = ["grep", "aft_search", "aft_conflicts", "aft_outline"];
    aftCompat({
      on(name, handler) {
        handlers.set(name, handler);
      },
      getActiveTools() {
        return active;
      },
      setActiveTools(next) {
        active = next;
      },
    });

    const start = await handlers.get("before_agent_start")({ systemPrompt: "base" }, { cwd: plain });
    assert.deepEqual(active, ["grep", "aft_outline"]);
    assert.match(start.systemPrompt, /aft_search, aft_conflicts/);

    const grep = await handlers.get("tool_call")({ toolName: "grep" }, { cwd: plain });
    const conflicts = await handlers.get("tool_call")({ toolName: "aft_conflicts" }, { cwd: plain });
    assert.equal(grep, undefined);
    assert.equal(conflicts.block, true);
  } finally {
    if (previousSearchOverride === undefined) delete process.env.PI_AFT_SEARCH_ALLOW_NO_GIT;
    else process.env.PI_AFT_SEARCH_ALLOW_NO_GIT = previousSearchOverride;
  }
});
