import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { enableTun, knowledgeOnly, orderSolFirst } from "./configure-default-sol.mjs";
import { createJiti } from "../extensions/pi-context-bridge/node_modules/jiti/lib/jiti.mjs";
const jiti = createJiti(import.meta.url);
const { validateRemoteUrl } = await jiti.import("../extensions/pi-context-bridge/node_modules/pi-web-access/ssrf-protection.ts");

test("TUN exception preserves policy and only allows synthetic DNS range", async () => {
  const config = enableTun({ provider: "existing", ssrf: { trustEnvProxy: false, allowRanges: [] } });
  assert.equal(config.provider, "existing");
  assert.equal(config.ssrf.trustEnvProxy, false);
  assert.deepEqual(enableTun(config), config);
  await validateRemoteUrl("https://example.com", { ...config.ssrf, lookup: async () => [{ address: "198.18.2.74", family: 4 }] });
  for (const address of ["127.0.0.1", "10.0.0.1", [192, 168, 1, 1].join("."), [169, 254, 169, 254].join(".")]) {
    await assert.rejects(validateRemoteUrl("https://example.com", { ...config.ssrf, lookup: async () => [{ address, family: 4 }] }), /Blocked internal/);
  }
});

test("SoL registers before presentation overrides without dropping packages", () => {
  const sol = "git:github.com/NVlabs/SoL-Pi";
  const packages = ["local:rails", sol, "npm:memory"];
  assert.deepEqual(orderSolFirst(packages), [sol, "local:rails", "npm:memory"]);
  assert.deepEqual(orderSolFirst(orderSolFirst(packages)), orderSolFirst(packages));
  assert.throws(() => orderSolFirst(["local:rails"]), /exactly one/);
});

test("SoL reducer remains pinned to the dedicated luna model", async () => {
  const config = JSON.parse(await readFile(new URL("../config/sol-pi.json", import.meta.url), "utf8"));
  assert.equal(config.evidencePreservingReducerProvider, "manager");
  assert.equal(config.evidencePreservingReducerModel, "gpt-6-luna");
});

test("knowledge-only migration preserves models, memories and unrelated options", () => {
  const original = { historian: { pi: { model: "existing/model" } }, memory: { enabled: true }, embedding: { provider: "local" } };
  const next = knowledgeOnly(structuredClone(original));
  assert.deepEqual(next.historian, original.historian);
  assert.deepEqual(next.memory, original.memory);
  assert.deepEqual(next.embedding, original.embedding);
  assert.equal(next.compaction.enabled, false);
  assert.equal(next.todowrite.enabled, false);
});
