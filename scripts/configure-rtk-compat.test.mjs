import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compatibleRtkPackages, configureRtkCompat } from "./configure-rtk-compat.mjs";

const bridge = "../../pi_config/extensions/pi-context-bridge";
test("deduplicates strings and versioned package objects without touching unrelated choices", () => {
  assert.deepEqual(compatibleRtkPackages(["git:github.com/NVlabs/SoL-Pi", bridge, "npm:pi-rtk-optimizer", { source: "npm:pi-rtk-optimizer@0.9.0" }, "npm:other"]), ["git:github.com/NVlabs/SoL-Pi", bridge, "npm:other"]);
  assert.deepEqual(compatibleRtkPackages(["npm:pi-rtk-optimizer"]), ["npm:pi-rtk-optimizer"]);
  assert.throws(() => compatibleRtkPackages([{ source: bridge, extensions: [] }, "npm:pi-rtk-optimizer"]), /custom extension filters/);
});

test("migration backs up once, preserves other settings and supports dry-run", async () => {
  const agent = await mkdtemp(join(tmpdir(), "rtk-compat-"));
  try {
    const original = JSON.stringify({ packages: [bridge, "npm:pi-rtk-optimizer"], theme: "existing" });
    await writeFile(join(agent, "settings.json"), original);
    await configureRtkCompat(agent, { dryRun: true });
    assert.equal(await readFile(join(agent, "settings.json"), "utf8"), original);
    await configureRtkCompat(agent);
    await configureRtkCompat(agent);
    const files = await readdir(agent);
    assert.equal(files.length, 2);
    assert.equal(await readFile(join(agent, files.find(name => name.includes("pre-rtk"))), "utf8"), original);
    assert.deepEqual(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")), { packages: [bridge], theme: "existing" });
  } finally { await rm(agent, { recursive: true, force: true }); }
});
