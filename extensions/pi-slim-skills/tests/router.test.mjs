import assert from "node:assert/strict";
import test from "node:test";
import { compactBlock } from "../index.ts";

test("discovery router delegates mechanics without repeating mandatory workflows", () => {
  const prompt = compactBlock([], true);
  assert.match(prompt, /search_skill_bm25/);
  assert.match(prompt, /when specialized guidance helps/);
  assert.match(prompt, /tool description covers search and load/);
  assert.match(prompt, /reuse loaded guidance/i);
  assert.match(prompt, /\/skill:<name>/);
  assert.doesNotMatch(prompt, /first call|must|always|shell-scanning/i);
});

test("fallback retains descriptions and exact nonstandard locations", () => {
  const prompt = compactBlock([
    { name: "migration-review", description: "Review schema\n migrations.", filePath: "/repo/db/review.md" },
  ]);
  assert.match(prompt, /migration-review: Review schema migrations\. \(\/repo\/db\/review.md\)/);
  assert.doesNotMatch(prompt, /search_skill_bm25|<name>\/SKILL/);
});
