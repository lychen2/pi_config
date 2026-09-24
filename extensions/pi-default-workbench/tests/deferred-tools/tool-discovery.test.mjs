import assert from "node:assert/strict";
import test from "node:test";

import { createSearchToolBm25 } from "../../deferred-tools/search-tool-bm25.ts";
import {
  buildToolSearchIndex,
  searchTools,
  toDiscoverableTool,
} from "../../deferred-tools/tool-discovery.ts";

function tool(name, description, properties = {}) {
  return {
    name,
    description,
    parameters: { type: "object", properties },
  };
}

test("BM25 ranks exact tool names above description-only matches", () => {
  const catalog = [
    tool("web_search", "Search the web for current information", { query: {} }),
    tool("fetch_content", "Fetch content returned by web search", { url: {} }),
    tool("project_search", "Search code by structure", { pattern: {} }),
  ].map(toDiscoverableTool);

  const results = searchTools(buildToolSearchIndex(catalog), "web search", 3);
  assert.equal(results[0].tool.name, "web_search");
  assert.ok(results[0].score > results[1].score);
});

test("BM25 searches schema keys and uses stable name tie-breaking", () => {
  const catalog = [
    tool("beta_tool", "Run a tool", { workspace: {} }),
    tool("alpha_tool", "Run a tool", { workspace: {} }),
  ].map(toDiscoverableTool);

  const results = searchTools(buildToolSearchIndex(catalog), "workspace", 2);
  assert.deepEqual(results.map((result) => result.tool.name), ["alpha_tool", "beta_tool"]);
});

test("BM25 rejects empty queries and invalid limits", () => {
  const index = buildToolSearchIndex([toDiscoverableTool(tool("alpha", "Alpha tool"))]);
  assert.throws(() => searchTools(index, "---", 1), /at least one letter or number/);
  assert.throws(() => searchTools(index, "alpha", 0), /positive integer/);
});

test("search tool activates only allowed inactive matches", async () => {
  const tools = [
    tool("web_search", "Search the web for current information", { query: {} }),
    tool("fetch_content", "Fetch a web page by URL", { url: {} }),
    tool("conflict", "Resolve git merge conflicts", { action: {} }),
  ];
  let active = ["read", "search_tool_bm25"];
  const activated = [];
  const pi = {
    getAllTools: () => tools,
    getActiveTools: () => active,
    setActiveTools: (names) => { active = names; },
  };
  const search = createSearchToolBm25(pi, {
    canDiscover: (name) => name !== "fetch_content",
    canActivate: (name) => name === "web_search",
    onActivated: (names) => activated.push(...names),
  });

  const result = await search.execute("id", { query: "web search", limit: 8 });
  assert.deepEqual(result.details.activatedTools, ["web_search"]);
  assert.deepEqual(activated, ["web_search"]);
  assert.deepEqual(active, ["read", "search_tool_bm25", "web_search"]);
  assert.equal(result.details.tools.some((entry) => entry.name === "fetch_content"), false);

  const repeated = await search.execute("id", { query: "web search", limit: 8 });
  assert.deepEqual(repeated.details.activatedTools, []);
});

test("default discovery is bounded and keeps verbose metadata outside model content", async () => {
  const tools = Array.from({ length: 6 }, (_, i) => tool(`tool_${i}`, "Review workspace records", { workspace: {} }));
  let active = ["read"];
  const search = createSearchToolBm25({
    getAllTools: () => tools,
    getActiveTools: () => active,
    setActiveTools: (names) => { active = names; },
  });
  const result = await search.execute("id", { query: "workspace records" });
  assert.equal(result.details.tools.length, 3);
  const receipt = JSON.parse(result.content[0].text);
  assert.equal(receipt.tools.length, 3);
  assert.deepEqual(Object.keys(receipt.tools[0]), ["name", "summary", "score"]);
  assert.equal(active.length, 4);
});

test("concurrent searches merge activations without dropping earlier tools", async () => {
  const tools = [
    tool("web_search", "Search the web for current information", { query: {} }),
    tool("conflict", "Resolve git merge conflicts", { action: {} }),
  ];
  let active = ["read", "search_tool_bm25"];
  const pi = {
    getAllTools: () => tools,
    getActiveTools: () => active,
    setActiveTools: (names) => { active = [...names]; },
  };
  const search = createSearchToolBm25(pi);

  const [web, conflict] = await Promise.all([
    search.execute("web", { query: "web_search", limit: 1 }),
    search.execute("conflict", { query: "conflict", limit: 1 }),
  ]);

  assert.deepEqual(web.details.activatedTools, ["web_search"]);
  assert.deepEqual(conflict.details.activatedTools, ["conflict"]);
  // Concurrent embedding searches can finish in either order; neither activation may be lost.
  assert.equal(active.length, 4);
  assert.deepEqual(new Set(active), new Set(["read", "search_tool_bm25", "web_search", "conflict"]));
});
