import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { exclusiveEditSchema, rewriteProviderEditSchema } from "../index.ts";
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
