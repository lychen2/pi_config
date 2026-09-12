import assert from "node:assert/strict";
import test from "node:test";
import { compactBlock } from "../index.ts";

test("discovery-only index is a bounded router", () => {
  const prompt = compactBlock([], true);
  assert.match(prompt, /search_skill_bm25/);
  assert.ok(prompt.length < 240);
  assert.doesNotMatch(prompt, /SKILL.md/);
});

test("fallback retains descriptions and exact nonstandard locations", () => {
  const prompt = compactBlock([
    { name: "migration-review", description: "Review schema\n migrations.", filePath: "/repo/db/review.md" },
  ]);
  assert.match(prompt, /migration-review: Review schema migrations\. \(\/repo\/db\/review.md\)/);
  assert.doesNotMatch(prompt, /search_skill_bm25|<name>\/SKILL/);
});
