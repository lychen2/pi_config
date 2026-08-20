import assert from "node:assert/strict";
import test from "node:test";
import { filterTeammateContext } from "../index.ts";

const prompt = `base

<available_teammate_models>
models
</available_teammate_models>

<!-- teammate-agent-catalog:start -->
agents
<!-- teammate-agent-catalog:end -->

<!-- teammate-tasktype-routing:start -->
routing
<!-- teammate-tasktype-routing:end -->

<teammate_nesting_context>
depth
</teammate_nesting_context>

end`;

test("removes teammate prompt blocks when the tool is inactive", () => {
  assert.equal(filterTeammateContext(prompt, ["read", "search_tool_bm25"]), "base\n\nend");
});

test("preserves teammate prompt blocks when the tool is active", () => {
  assert.equal(filterTeammateContext(prompt, ["read", "teammate"]), prompt);
});
