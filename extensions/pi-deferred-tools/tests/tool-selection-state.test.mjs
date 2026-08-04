import assert from "node:assert/strict";
import test from "node:test";
import {
  enabledToolCount,
  isToolDisabled,
  packageSourceId,
  parseToolSelectionConfig,
  setExtensionEnabled,
  setToolEnabled,
} from "../extensions/tool-selection-state.ts";

test("uses portable IDs for local package paths", () => {
  assert.equal(packageSourceId("../../pi_config/extensions/pi-workflow-dag"), "local:pi-workflow-dag");
  assert.equal(packageSourceId("C:\\Users\\me\\pi-workflow-dag"), "local:pi-workflow-dag");
});

const group = {
  id: "npm:example-tools",
  tools: [{ name: "alpha" }, { name: "beta" }, { name: "gamma" }],
};

const empty = {
  disabledExtensions: [],
  disabledTools: [],
};

test("normalizes package versions and legacy extension entries", () => {
  assert.deepEqual(
    parseToolSelectionConfig({
      extensions: ["npm:@scope/example@2.4.0", "npm:plain-package@1.0.0"],
      disabledTools: ["search", "search"],
    }),
    {
      disabledExtensions: ["npm:@scope/example", "npm:plain-package"],
      disabledTools: ["search"],
    },
  );
});

test("disabling an extension creates one future-proof rule", () => {
  const config = setExtensionEnabled(empty, group, false);

  assert.deepEqual(config, {
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
    disabledExtensions: [group.id],
    disabledTools: [],
  });
});

test("enabling an extension removes its current per-tool rules", () => {
  const config = setExtensionEnabled(
    { disabledExtensions: [], disabledTools: ["alpha", "unrelated"] },
    group,
    true,
  );

  assert.deepEqual(config, {
    disabledExtensions: [],
    disabledTools: ["unrelated"],
  });
});

test("rejects malformed selector config", () => {
  assert.throws(
    () => parseToolSelectionConfig({ disabledExtensions: "npm:example-tools" }),
    /disabledExtensions must be a string array/,
  );
});
