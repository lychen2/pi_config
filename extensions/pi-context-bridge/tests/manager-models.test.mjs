import assert from "node:assert/strict";
import test from "node:test";
import { configuredModels, discoverModels } from "../manager-models.ts";

const config = {
  baseUrl: "https://example.invalid/v1",
  compat: { supportsDeveloperRole: false, supportsStore: false },
  models: [
    { id: "glm-5.3-flash", reasoning: true },
    { id: "override", compat: { supportsStore: true } },
  ],
};

test("configured non-chat models keep their discriminants and operation-specific metadata", () => {
  const models = configuredModels({
    baseUrl: config.baseUrl,
    models: [
      { type: "image", id: "image-model", output: ["image", "text"], input: ["text"] },
      { type: "classifier", id: "classifier-model", contextWindow: 32_000 },
    ],
  });

  assert.deepEqual(models.map((model) => model.type), ["image", "classifier"]);
  assert.deepEqual(models[0], {
    type: "image",
    id: "image-model",
    name: "image-model",
    input: ["text"],
    output: ["image", "text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  });
  assert.deepEqual(models[1], {
    type: "classifier",
    id: "classifier-model",
    name: "classifier-model",
    input: ["text"],
    contextWindow: 32_000,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  });
  assert.equal("reasoning" in models[0], false);
  assert.equal("maxTokens" in models[1], false);
});

test("discovery preserves configured non-chat models instead of converting them to chat", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    data: [{ id: "image-model" }, { id: "classifier-model" }, { id: "chat-model" }],
  }), { status: 200 }));
  const models = await discoverModels({
    baseUrl: config.baseUrl,
    models: [
      { type: "image", id: "image-model", output: ["image"] },
      { type: "classifier", id: "classifier-model" },
    ],
  });

  assert.deepEqual(models.map((model) => model.type ?? "chat"), ["image", "classifier", "chat"]);
  assert.equal("reasoning" in models[0], false);
  assert.equal("reasoning" in models[1], false);
  assert.equal(models[2].type, undefined);
});

test("configured models inherit provider compatibility with model overrides", () => {
  const models = configuredModels(config);
  assert.deepEqual(models[0].compat, config.compat);
  assert.deepEqual(models[1].compat, {
    supportsDeveloperRole: false,
    supportsStore: true,
  });
  assert.deepEqual(config.models[1].compat, { supportsStore: true });
  assert.equal(configuredModels({ baseUrl: config.baseUrl, models: [{ id: "plain" }] })[0].compat, undefined);
});

test("discovered models retain compatibility including unconfigured models", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    data: [{ id: "glm-5.3-flash" }, { id: "override" }, { id: "new-model" }],
  }), { status: 200 }));
  const models = await discoverModels(config);
  assert.equal(models.length, 3);
  for (const model of models) assert.equal(model.compat.supportsDeveloperRole, false);
  assert.equal(models[1].compat.supportsStore, true);
  assert.equal(models[2].compat.supportsStore, false);
});
