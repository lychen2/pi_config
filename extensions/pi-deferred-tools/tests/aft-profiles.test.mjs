import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAftProfile,
  currentAftProfile,
  parseAftProfile,
} from "../extensions/aft-profiles.ts";

test("balanced profile preserves unrelated AFT configuration", () => {
  const config = applyAftProfile(
    {
      tool_surface: "recommended",
      bash: { rewrite: true, compress: true, background: true },
      semantic_search: true,
    },
    "balanced",
  );

  assert.deepEqual(config, {
    tool_surface: "recommended",
    bash: { rewrite: true, compress: true, background: true },
    search_index: true,
    semantic_search: false,
    callgraph_store: false,
  });
  assert.equal(currentAftProfile(config), "balanced");
});

test("profiles classify all LSP-affecting settings", () => {
  assert.equal(currentAftProfile(applyAftProfile({}, "minimal")), "minimal");
  assert.equal(currentAftProfile(applyAftProfile({}, "full")), "full");
  assert.equal(currentAftProfile({ search_index: true }), "custom");
});

test("only named profiles are accepted", () => {
  assert.equal(parseAftProfile("balanced"), "balanced");
  assert.equal(parseAftProfile("off"), undefined);
});
