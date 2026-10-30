import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { enableTun, magicOwnsCompaction } from "./configure-default-context.mjs";
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

test("Magic Context owns compaction while memories and unrelated options are preserved", () => {
  const original = { historian: { pi: { model: "existing/model" } }, memory: { enabled: true }, embedding: { provider: "local" } };
  const next = magicOwnsCompaction(original);
  assert.deepEqual(next.historian, original.historian);
  assert.deepEqual(next.memory, original.memory);
  assert.deepEqual(next.embedding, original.embedding);
  assert.equal(next.enabled, true);
  assert.equal(next.compaction.enabled, true);
  assert.equal(next.todowrite.enabled, false);
  assert.equal(next.todowrite.overlay, false);
  assert.deepEqual(magicOwnsCompaction(next), next);
  assert.equal(original.compaction, undefined);
  const rerun = magicOwnsCompaction({ enabled: false, compaction: { enabled: false }, todowrite: { enabled: true, overlay: true } });
  assert.equal(rerun.enabled, true);
  assert.equal(rerun.compaction.enabled, true);
  assert.equal(rerun.todowrite.enabled, false);
});

test("configurator preserves packages, Pi retained tail and memories without restoring SoL", async () => {
  const root = await mkdtemp(join(tmpdir(), "context-config-"));
  try {
    const agent = join(root, "agent"), xdg = join(root, "xdg"), project = join(root, "project");
    const put = async (path, text) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, text); };
    await put(join(agent, "npm", "node_modules", "comment-json", "index.js"), "module.exports = { parse: text => JSON.parse(text), stringify: value => JSON.stringify(value, null, 2) };\n");
    await put(join(agent, "npm", "node_modules", "comment-json", "package.json"), JSON.stringify({ name: "comment-json", version: "0.0.0", main: "index.js" }));
    const packages = ["local:rails", "/repo/extensions/pi-context-bridge", "/repo/extensions/pi-default-workbench", "npm:@cortexkit/pi-magic-context"];
    await put(join(agent, "settings.json"), JSON.stringify({ packages, compaction: { enabled: false, keepRecentTokens: 48500 } }));
    await put(join(xdg, "cortexkit", "magic-context.jsonc"), JSON.stringify({ compaction: { enabled: false }, historian: { pi: { model: "keep/model" } } }));
    await mkdir(project);
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("./configure-default-context.mjs", import.meta.url)), "--approve-shared-memory",
    ], { cwd: project, encoding: "utf8", env: { ...process.env, PI_CODING_AGENT_DIR: agent, XDG_CONFIG_HOME: xdg } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Magic Context owns session compaction/);
    const settings = JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
    assert.deepEqual(settings.compaction, { enabled: true, keepRecentTokens: 48500 });
    assert.deepEqual(settings.packages, packages);
    await assert.rejects(access(join(agent, "sol-pi.json")), { code: "ENOENT" });
    const magic = JSON.parse(await readFile(join(xdg, "cortexkit", "magic-context.jsonc"), "utf8"));
    assert.equal(magic.compaction.enabled, true);
    assert.deepEqual(magic.historian, { pi: { model: "keep/model" } });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
