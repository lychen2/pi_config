import assert from "node:assert/strict";
import test from "node:test";

import { decorateTool } from "../index.ts";

const theme = {
  fg(_color, text) { return text; },
  bg(_color, text) { return text; },
  bold(text) { return text; },
};

function sourceTool(name) {
  return {
    name,
    description: `${name} fixture`,
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    async execute(_id, params) {
      return { content: [{ type: "text", text: "ok" }], details: { received: params } };
    },
  };
}

function lines(component) {
  return component.render(100).map((line) => line.trimEnd());
}

test("renders goal and concrete target in one line, then the useful result", () => {
  const tool = decorateTool(sourceTool("read"));
  const args = { reasoning: "confirm the current auth flow", path: "src/auth.ts" };
  const call = tool.renderCall(args, theme, { args });
  const result = tool.renderResult(
    { content: [{ type: "text", text: "Ab1│line one\nCd2│line two\n[Showing lines 1-2 of 2.]" }] },
    { expanded: false, isPartial: false },
    theme,
    { args, isError: false },
  );

  assert.deepEqual(lines(call), ["confirm the current auth flow → src/auth.ts"]);
  assert.deepEqual(lines(result), ["2 lines"]);
});

test("uses compact fallback goals and target text", () => {
  const tool = decorateTool(sourceTool("bash"));
  const args = { command: "npm test" };
  const call = tool.renderCall(args, theme, { args });
  const result = tool.renderResult(
    { content: [{ type: "text", text: "" }] },
    { expanded: false, isPartial: false },
    theme,
    { args, isError: false },
  );

  assert.deepEqual(lines(call), ["run command → npm test"]);
  assert.deepEqual(lines(result), ["done"]);
});

test("colors non-empty grep summaries as success", () => {
  const colorTheme = {
    ...theme,
    fg(color, text) { return `<${color}>${text}</${color}>`; },
  };
  const tool = decorateTool(sourceTool("grep"));
  const args = { pattern: "TODO", path: "." };
  const matches = tool.renderResult(
    { content: [{ type: "text", text: "src/a.ts:1:TODO\nsrc/b.ts:2:TODO" }] },
    { expanded: false, isPartial: false },
    colorTheme,
    { args, isError: false },
  );
  const empty = tool.renderResult(
    { content: [] },
    { expanded: false, isPartial: false },
    colorTheme,
    { args, isError: false },
  );

  assert.deepEqual(lines(matches), ["<success>2 matches</success>"]);
  assert.deepEqual(lines(empty), ["<toolOutput>0 matches</toolOutput>"]);
});

test("adds reasoning to the schema and strips it before execution", async () => {
  const tool = decorateTool(sourceTool("read"));
  assert.ok(tool.parameters.required.includes("reasoning"));
  assert.equal(Object.keys(tool.parameters.properties)[0], "reasoning");

  const result = await tool.execute(
    "call-1",
    { reasoning: "inspect the fixture", path: "src/auth.ts" },
    undefined,
    undefined,
    {},
  );
  assert.deepEqual(result.details.received, { path: "src/auth.ts" });
});
