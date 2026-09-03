import assert from "node:assert/strict";
import test from "node:test";
import {
  activeToolsForMode,
  assertCoreToolsRegistered,
  capabilityToolsForMatches,
  enabledToolCount,
  fastSelectionConfig,
  isToolDisabled,
  packageSourceId,
  parseToolSelectionConfig,
  SEARCH_TOOL_NAME,
  setExtensionEnabled,
  setToolEnabled,
  setToolMode,
} from "../../deferred-tools/tool-selection-state.ts";

const empty = {
  toolMode: "adaptive",
  disabledExtensions: [],
  disabledTools: [],
};

const group = {
  id: "npm:example-tools",
  tools: [{ name: "alpha" }, { name: "beta" }, { name: "gamma" }],
};

test("uses portable IDs for local package paths", () => {
  assert.equal(packageSourceId("C:\\Users\\me\\example-tools"), "local:example-tools");
});

test("migrates legacy configs to adaptive and normalizes entries", () => {
  assert.deepEqual(
    parseToolSelectionConfig({
      extensions: ["npm:@scope/example@2.4.0", "npm:plain-package@1.0.0"],
      disabledTools: ["search", "search"],
    }),
    {
      toolMode: "adaptive",
      disabledExtensions: ["npm:@scope/example", "npm:plain-package"],
      disabledTools: ["search"],
    },
  );
});

test("rejects invalid tool modes and malformed selector config", () => {
  assert.throws(
    () => parseToolSelectionConfig({ toolMode: "automatic" }),
    /toolMode must be adaptive, fast, or full/,
  );
  assert.throws(
    () => parseToolSelectionConfig({ disabledExtensions: "npm:example-tools" }),
    /disabledExtensions must be a string array/,
  );
});

test("mode changes preserve explicit disable rules", () => {
  assert.deepEqual(setToolMode({ ...empty, disabledTools: ["web_search"] }, "full"), {
    toolMode: "full",
    disabledExtensions: [],
    disabledTools: ["web_search"],
  });
});

test("disabling an extension creates one future-proof rule", () => {
  const config = setExtensionEnabled(empty, group, false);
  assert.deepEqual(config, {
    toolMode: "adaptive",
    disabledExtensions: [group.id],
    disabledTools: [],
  });
  assert.equal(enabledToolCount(config, group), 0);
  assert.equal(isToolDisabled(config, group.id, "future-tool"), true);
});

test("enabling one tool expands an extension rule into tool rules", () => {
  const disabled = setExtensionEnabled(empty, group, false);
  const config = setToolEnabled(disabled, group, "beta", true);
  assert.deepEqual(config, {
    toolMode: "adaptive",
    disabledExtensions: [],
    disabledTools: ["alpha", "gamma"],
  });
  assert.equal(enabledToolCount(config, group), 1);
});

test("disabling every individual tool collapses back to an extension rule", () => {
  let config = setToolEnabled(empty, group, "alpha", false);
  config = setToolEnabled(config, group, "beta", false);
  config = setToolEnabled(config, group, "gamma", false);
  assert.deepEqual(config, {
    toolMode: "adaptive",
    disabledExtensions: [group.id],
    disabledTools: [],
  });
});

test("enabling an extension removes its current per-tool rules", () => {
  const config = setExtensionEnabled(
    { ...empty, disabledTools: ["alpha", "unrelated"] },
    group,
    true,
  );
  assert.deepEqual(config, {
    toolMode: "adaptive",
    disabledExtensions: [],
    disabledTools: ["unrelated"],
  });
});

test("fast preset keeps core tools including default web search", () => {
  const groups = [
    {
      id: "local:pi-context-bridge",
      tools: [
        { name: "read" },
        { name: "write" },
        { name: "edit" },
        { name: "grep" },
        { name: "web_search" },
      ],
    },
    { id: "local:pi-maestro-tools", tools: [{ name: "fffind" }, { name: "ffgrep" }, { name: "bash_bg" }, { name: "conflict" }] },
    { id: "local:pi-maestro-todo", tools: [{ name: "todo" }] },
  ];

  const config = fastSelectionConfig(groups);
  assert.deepEqual(config, {
    toolMode: "fast",
    disabledExtensions: [],
    disabledTools: ["bash_bg", "conflict"],
  });
  for (const name of ["write", "edit", "grep", "fffind", "web_search"]) {
    assert.equal(isToolDisabled(config, "local:pi-context-bridge", name), false);
    assert.equal(config.disabledTools.includes(name), false);
  }
});

test("fast core registration rejects silent tool-name drift", () => {
  const registered = [
    "read",
    "bash",
    "write",
    "edit",
    "grep",
    "fffind",
    "web_search",
    "ffgrep",
    "todo",
    "ask_user_question",
    "search_skill_bm25",
  ];
  assert.doesNotThrow(() => assertCoreToolsRegistered(registered));
  assert.throws(
    () => assertCoreToolsRegistered(registered.filter((name) => name !== "fffind")),
    /unregistered tools: fffind/,
  );
});

test("adaptive selects only the matched additional tool", () => {
  const registered = [
    "write",
    "edit",
    "grep",
    "project_search",
    "web_search",
  ];

  assert.deepEqual(capabilityToolsForMatches(["project_search"], registered), ["project_search"]);
  assert.deepEqual(
    capabilityToolsForMatches(["edit"], registered),
    ["write", "edit", "grep", "web_search"],
  );
});

test("adaptive starts with core and loader, then preserves activated tools", () => {
  const groups = [
    { id: "local:files", tools: [{ name: "read" }, { name: "fffind" }] },
    { id: "sdk:web", tools: [{ name: "web_search" }] },
    { id: "local:selector", tools: [{ name: SEARCH_TOOL_NAME }] },
  ];
  const initial = activeToolsForMode(["bash"], groups, empty);
  assert.deepEqual(initial, ["bash", "read", "fffind", "web_search", SEARCH_TOOL_NAME]);

  const expanded = activeToolsForMode(["bash"], groups, empty, new Set(["web_search"]));
  assert.deepEqual(expanded, ["bash", "read", "fffind", "web_search", SEARCH_TOOL_NAME]);
});

test("adaptive includes memory tools while fast excludes them", () => {
  const memoryTools = ["ctx_search", "ctx_memory", "ctx_note", "ctx_expand", "ctx_reduce"];
  const groups = [
    { id: "npm:@cortexkit/pi-magic-context", tools: memoryTools.map((name) => ({ name })) },
  ];

  const adaptive = activeToolsForMode(["bash"], groups, empty);
  assert.deepEqual(adaptive, ["bash", ...memoryTools]);

  const fast = activeToolsForMode(["bash"], groups, { ...empty, toolMode: "fast" });
  assert.deepEqual(fast, ["bash"]);
});

test("fast is fixed and full respects global disabled tools", () => {
  const groups = [
    { id: "local:files", tools: [{ name: "read" }] },
    { id: "sdk:web", tools: [{ name: "web_search" }] },
  ];
  const fast = activeToolsForMode(["bash", "todowrite"], groups, {
    toolMode: "fast",
    disabledExtensions: [],
    disabledTools: ["todowrite"],
  }, new Set(["web_search"]));
  assert.deepEqual(fast, ["bash", "read", "web_search"]);

  const full = activeToolsForMode(["bash"], groups, {
    toolMode: "full",
    disabledExtensions: [],
    disabledTools: ["web_search"],
  });
  assert.deepEqual(full, ["bash", "read"]);
});


test("full preserves existing active tools while adding the registered set", () => {
  const groups = [
    { id: "local:files", tools: [{ name: "read" }, { name: "project_search" }] },
    { id: "sdk:web", tools: [{ name: "web_search" }] },
  ];
  const full = activeToolsForMode(
    ["read", "bash"],
    groups,
    { toolMode: "full", disabledExtensions: [], disabledTools: [] },
    new Set(),
    ["read", "project_search", "web_search"],
    ["legacy_host_tool", "web_search"],
  );
  assert.deepEqual(full, ["read", "project_search", "web_search", "legacy_host_tool"]);
});

test("disabling an extension does not remove same-named core tools", () => {
  const groups = [
    { id: "local:files", tools: [{ name: "read" }, { name: "project_search" }] },
  ];
  const config = { toolMode: "full", disabledExtensions: ["local:files"], disabledTools: [] };
  const full = activeToolsForMode(["read"], groups, config);
  assert.deepEqual(full, ["read"]);
  assert.equal(isToolDisabled(config, "local:files", "read"), false);
  assert.equal(isToolDisabled(config, "local:files", "project_search"), true);
});
