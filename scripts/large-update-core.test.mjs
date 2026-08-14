import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDependencyChanges,
  classifyContent,
  classifyVersion,
  dependencyChanges,
} from "./large-update-core.mjs";

test("classifies upstream-only changes as updates", () => {
  assert.deepEqual(classifyVersion("base", "base", "target"), { kind: "update" });
  assert.deepEqual(classifyContent("same", "same", "changed"), { kind: "update" });
});

test("classifies local-only changes without blocking upstream updates", () => {
  assert.deepEqual(classifyVersion(undefined, "local", "target"), { kind: "conflict" });
  assert.deepEqual(classifyVersion("base", "local", "base"), { kind: "local-only" });
});

test("detects dependency conflicts and applies safe changes", () => {
  const base = { dependencies: { keep: "1", changed: "1", removed: "1" } };
  const local = { dependencies: { keep: "1", changed: "local", removed: "1" } };
  const target = { dependencies: { keep: "1", changed: "2", added: "1" } };
  const changes = dependencyChanges(base, local, target);
  assert.deepEqual(changes.map(({ name, kind }) => ({ name, kind })), [
    { name: "changed", kind: "conflict" },
    { name: "removed", kind: "delete" },
    { name: "added", kind: "update" },
  ]);
  assert.deepEqual(applyDependencyChanges(local, changes), {
    dependencies: { keep: "1", changed: "local", added: "1" },
  });
});
