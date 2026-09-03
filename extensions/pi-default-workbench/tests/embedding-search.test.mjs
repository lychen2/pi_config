import assert from "node:assert/strict";
import test from "node:test";

import { cosine, fuseWithSemanticRanking } from "../embedding-search.ts";

const catalog = [
  { name: "grep", blurb: "grep file contents for a pattern" },
  { name: "web_search", blurb: "research questions on the internet" },
];

// BM25 alone returns nothing here: no query token appears in either
// description. The semantic arm is what still ranks the catalog.
test("fusion returns candidates when BM25 has zero lexical overlap", async () => {
  const ranked = await fuseWithSemanticRanking(
    catalog,
    [],
    (item) => item.blurb,
    "look something up online",
    2,
  );
  assert.equal(ranked[0].item.name, "web_search");
});

test("cosine of normalized vectors is the dot product", () => {
  assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 1e-9);
});
