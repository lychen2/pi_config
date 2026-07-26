import assert from "node:assert/strict";
import test from "node:test";

import agentBrowserCompat, { normalizeAgentBrowserInput } from "../index.ts";

test("removes unsupported empty stdin from direct args", () => {
  const input = {
    args: ["open", "https://example.com"],
    stdin: "",
    outputPath: "x",
    timeoutMs: 1000,
    sessionMode: "auto",
  };

  assert.equal(normalizeAgentBrowserInput(input), true);
  assert.deepEqual(input, { args: ["open", "https://example.com"] });
});

test("removes provider filler when args is the primary mode", () => {
  const input = {
    args: ["open", "https://example.com"],
    semanticAction: { action: "click", selector: "x" },
    job: { steps: [] },
    qa: { attached: true },
    sourceLookup: { selector: "x" },
    networkSourceLookup: { url: "x" },
    electron: { action: "list" },
    stdin: "x",
    outputPath: "x",
    timeoutMs: 1000,
    sessionMode: "auto",
  };

  assert.equal(normalizeAgentBrowserInput(input), true);
  assert.deepEqual(input, { args: ["open", "https://example.com"] });
});

test("preserves non-empty batch stdin", () => {
  const stdin = '[["open","https://example.com"]]';
  const input = { args: ["batch"], stdin };

  assert.equal(normalizeAgentBrowserInput(input), false);
  assert.deepEqual(input, { args: ["batch"], stdin });
});

test("preserves explicit eval and auth stdin", () => {
  const evalInput = { args: ["eval", "--stdin"], stdin: "document.title" };
  const authInput = { args: ["auth", "save", "profile", "--password-stdin"], stdin: "secret" };

  assert.equal(normalizeAgentBrowserInput(evalInput), false);
  assert.equal(normalizeAgentBrowserInput(authInput), false);
});

test("ignores inputs without a valid args mode", () => {
  const input = { job: { steps: [] }, stdin: "" };

  assert.equal(normalizeAgentBrowserInput(input), false);
  assert.deepEqual(input, { job: { steps: [] }, stdin: "" });
  assert.equal(normalizeAgentBrowserInput(null), false);
  assert.equal(normalizeAgentBrowserInput([]), false);
});

test("wires the mutation only to agent_browser tool calls", () => {
  let toolCallHandler;
  const pi = {
    on(event, handler) {
      if (event === "tool_call") toolCallHandler = handler;
    },
  };

  agentBrowserCompat(pi);
  assert.equal(typeof toolCallHandler, "function");

  const browserInput = { args: ["open", "https://example.com"], stdin: "" };
  toolCallHandler({ toolName: "agent_browser", input: browserInput });
  assert.deepEqual(browserInput, { args: ["open", "https://example.com"] });

  const otherInput = { args: ["open", "https://example.com"], stdin: "" };
  toolCallHandler({ toolName: "other_tool", input: otherInput });
  assert.deepEqual(otherInput, { args: ["open", "https://example.com"], stdin: "" });
});
