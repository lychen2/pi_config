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
