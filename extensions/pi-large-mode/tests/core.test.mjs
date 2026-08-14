import assert from "node:assert/strict";
import test from "node:test";
import {
  RESOURCE_BLOCK_ALL,
  buildLargeGlobalSettings,
  buildLargeProjectSettings,
  companionNameFromPath,
  flowSourceForVersion,
  flowVersionFromSource,
  isCompleteFlowSettings,
  mergeModelSettings,
  parseLargeCommand,
  pickModelSettings,
  rewriteAgentPath,
  sourceOf,
} from "../core.ts";

const controller = "/opt/pi/extensions/pi-large-mode/index.ts";
const flowSource = "npm:pi-maestro-flow@0.20.1";
const beautifyPath = "/tmp/agent/npm/node_modules/pi-large-beautify";
const companionPaths = {
  "pi-maestro-teammate": "/tmp/agent/npm/node_modules/pi-maestro-teammate",
  "pi-cockpit": "/tmp/agent/npm/node_modules/pi-cockpit",
};

function completeSettings() {
  return {
    packages: [flowSource, beautifyPath],
    extensions: [controller, RESOURCE_BLOCK_ALL, `+${controller}`],
    skills: [RESOURCE_BLOCK_ALL],
    prompts: [RESOURCE_BLOCK_ALL],
    themes: [RESOURCE_BLOCK_ALL],
  };
}

test("persists only exact Flow versions", () => {
  assert.equal(flowSourceForVersion("0.20.1"), flowSource);
  assert.equal(flowSourceForVersion("1.0.0-beta.2"), "npm:pi-maestro-flow@1.0.0-beta.2");
  assert.equal(flowVersionFromSource(flowSource), "0.20.1");
  assert.equal(flowVersionFromSource("npm:pi-maestro-flow@latest"), undefined);
  assert.equal(flowVersionFromSource("npm:other@0.20.1"), undefined);
  assert.throws(() => flowSourceForVersion("latest"), /Invalid pi-maestro-flow version/);
});

test("keeps only model and provider selection settings", () => {
  const original = {
    defaultProvider: "manager",
    defaultModel: "manager/gpt-5.6-sol",
    defaultThinkingLevel: "high",
    enabledModels: ["manager/*"],
    thinkingBudgets: { high: 32000 },
    theme: "matugen",
    quietStartup: true,
    packages: ["npm:pi-magic-context"],
  };

  assert.deepEqual(pickModelSettings(original), {
    defaultProvider: "manager",
    defaultModel: "manager/gpt-5.6-sol",
    defaultThinkingLevel: "high",
    enabledModels: ["manager/*"],
    thinkingBudgets: { high: 32000 },
  });
});

test("merges Large model changes without retaining other Large settings", () => {
  const base = {
    defaultProvider: "old-provider",
    defaultModel: "old-model",
    enabledModels: ["old/*"],
    theme: "matugen",
    packages: ["npm:pi-magic-context"],
  };
  const current = {
    defaultProvider: "manager",
    defaultModel: "manager/qwen3.8-max",
    defaultThinkingLevel: "xhigh",
    packages: [flowSource],
    theme: "large-theme",
  };

  assert.deepEqual(mergeModelSettings(base, current), {
    defaultProvider: "manager",
    defaultModel: "manager/qwen3.8-max",
    defaultThinkingLevel: "xhigh",
    theme: "matugen",
    packages: ["npm:pi-magic-context"],
  });
});

test("builds a clean global profile with only the recovery controller", () => {
  const result = buildLargeGlobalSettings({
    defaultProvider: "manager",
    defaultModel: "manager/gpt-5.6-sol",
    theme: "matugen",
    packages: ["npm:pi-magic-context", "npm:other"],
  }, controller);

  assert.deepEqual(result, {
    defaultProvider: "manager",
    defaultModel: "manager/gpt-5.6-sol",
    theme: "matugen",
    quietStartup: true,
    packages: [],
    extensions: [controller, RESOURCE_BLOCK_ALL, `+${controller}`],
    skills: [RESOURCE_BLOCK_ALL],
    prompts: [RESOURCE_BLOCK_ALL],
    themes: [RESOURCE_BLOCK_ALL],
  });
});

test("builds the same clean resource boundary for project settings", () => {
  assert.deepEqual(buildLargeProjectSettings({
    defaultModel: "manager/qwen3.8-max",
    packages: ["./project-extension"],
    skills: ["./project-skills"],
    theme: "project-theme",
  }, controller), {
    defaultModel: "manager/qwen3.8-max",
    theme: "matugen",
    quietStartup: true,
    packages: [],
    extensions: [controller, RESOURCE_BLOCK_ALL, `+${controller}`],
    skills: [RESOURCE_BLOCK_ALL],
    prompts: [RESOURCE_BLOCK_ALL],
    themes: [RESOURCE_BLOCK_ALL],
  });
});

test("recognizes only official companion installation paths", () => {
  assert.equal(companionNameFromPath(companionPaths["pi-maestro-teammate"]), "pi-maestro-teammate");
  assert.equal(companionNameFromPath(`${companionPaths["pi-cockpit"]}/`), "pi-cockpit");
  assert.equal(companionNameFromPath("npm:pi-maestro-teammate@1.12.0"), undefined);
  assert.equal(companionNameFromPath("/tmp/agent/npm/node_modules/unrelated"), undefined);
});

test("accepts only the complete official package and resource result", () => {
  const settings = completeSettings();
  assert.equal(isCompleteFlowSettings(settings, flowSource, beautifyPath, controller), true);
  assert.deepEqual(settings.packages.map(sourceOf), [flowSource, beautifyPath]);
});

test("rejects stale versions, missing beautify, extra packages, and incomplete isolation", () => {
  const base = completeSettings();
  assert.equal(isCompleteFlowSettings(base, "npm:pi-maestro-flow@0.19.0", beautifyPath, controller), false);
  assert.equal(isCompleteFlowSettings({ ...base, packages: base.packages.slice(0, 1) }, flowSource, beautifyPath, controller), false);
  assert.equal(isCompleteFlowSettings({ ...base, packages: [...base.packages, "npm:pi-magic-context"] }, flowSource, beautifyPath, controller), false);
  assert.equal(isCompleteFlowSettings({ ...base, packages: ["npm:pi-magic-context", beautifyPath] }, flowSource, beautifyPath, controller), false);
  assert.equal(isCompleteFlowSettings({ ...base, skills: [] }, flowSource, beautifyPath, controller), false);
  assert.equal(isCompleteFlowSettings({ ...base, extensions: [controller] }, flowSource, beautifyPath, controller), false);
});

test("rewrites only paths rooted at the staging directory", () => {
  const value = {
    source: "/tmp/staging/agent/npm/node_modules/pi-cockpit",
    nested: ["/tmp/staging/agent", "/tmp/staging/agent2/keep", "prefix:/tmp/staging/agent"],
  };
  assert.deepEqual(rewriteAgentPath(value, "/tmp/staging/agent", "/real/agent"), {
    source: "/real/agent/npm/node_modules/pi-cockpit",
    nested: ["/real/agent", "/tmp/staging/agent2/keep", "prefix:/tmp/staging/agent"],
  });
});

test("command parser supports the switch surface", () => {
  assert.equal(parseLargeCommand([]), "on");
  assert.equal(parseLargeCommand(["ON"]), "on");
  assert.equal(parseLargeCommand(["off"]), "off");
  assert.equal(parseLargeCommand(["status"]), "status");
  assert.equal(parseLargeCommand(["update"]), "update");
  assert.equal(parseLargeCommand(["pristine"]), "invalid");
  assert.equal(parseLargeCommand(["toggle"]), "invalid");
});
