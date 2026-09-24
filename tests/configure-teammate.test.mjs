import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configureTeammate } from "../scripts/configure-teammate.mjs";

test("profile configuration preserves existing profiles, backs up and is idempotent", () => {
  const dir = mkdtempSync(join(tmpdir(), "teammate-config-"));
  const file = join(dir, "teammate-models.json");
  const previous = { version: 3, defaultProfile: "custom", profiles: { custom: { name: "Keep me" } } };
  writeFileSync(file, JSON.stringify(previous));
  configureTeammate(dir);
  const configured = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(configured.profiles.custom, previous.profiles.custom);
  assert.equal(configured.defaultProfile, "glm-flash");
  assert.ok(Object.values(configured.profiles["glm-flash"].mappings).every(model => model === "manager/glm-5.3-flash"));
  assert.equal(readdirSync(dir).filter(name => name.includes("pre-glm")).length, 1);
  configureTeammate(dir);
  assert.equal(readdirSync(dir).length, 2);
});

test("dry run writes nothing and unsupported versions remain unchanged", () => {
  const dir = mkdtempSync(join(tmpdir(), "teammate-config-dry-"));
  const file = join(dir, "teammate-models.json");
  configureTeammate(dir, { dryRun: true });
  assert.equal(existsSync(file), false);
  writeFileSync(file, '{"version":2}');
  assert.throws(() => configureTeammate(dir), /Migrate/);
  assert.equal(readFileSync(file, "utf8"), '{"version":2}');
});
