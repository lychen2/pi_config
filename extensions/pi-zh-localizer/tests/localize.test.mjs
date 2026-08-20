import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyLocalization } from "../localize.mjs";

test("applies patches idempotently and reports drift only before localization", () => {
  const dist = mkdtempSync(join(tmpdir(), "pi-zh-localizer-"));
  try {
    mkdirSync(join(dist, "core"));
    writeFileSync(join(dist, "core", "ui.js"), "Preparing...\nKeep this\n", "utf8");
    const patches = {
      "core/ui.js": [["Preparing...", "正在准备"], ["Missing", "缺失"]],
    };

    const first = applyLocalization({ dist, patches });
    assert.equal(readFileSync(join(dist, "core", "ui.js"), "utf8"), "正在准备\nKeep this\n");
    assert.deepEqual(first, { changedFiles: 1, replacements: 1, unmatched: ["core/ui.js"] });

    const second = applyLocalization({ dist, patches });
    assert.deepEqual(second, { changedFiles: 0, replacements: 0, unmatched: [] });
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});
