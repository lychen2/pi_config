import assert from "node:assert/strict";
import test from "node:test";

import { isStandaloneToolNameLine, labelLines, labelPadding } from "../compact-shell.ts";

test("splits underscore-separated tool names across rail lines", () => {
  assert.deepEqual(labelLines("add_directory"), ["ADD", "DIRECTORY"]);
  assert.deepEqual(labelLines("agent_browser"), ["AGENT", "BROWSER"]);
  assert.deepEqual(labelLines("undo_last_replace"), ["UNDO", "LAST", "REPLACE"]);
});

test("keeps a single overlong tool word compact", () => {
  assert.deepEqual(labelLines("verylongtool"), ["VERYLONGT…"]);
});

test("recognizes the default tool-name-only header", () => {
  assert.equal(isStandaloneToolNameLine("undo_last_replace", "undo_last_replace"), true);
  assert.equal(isStandaloneToolNameLine("undo_last_replace /tmp/file", "undo_last_replace"), false);
});

test("places an odd padding cell on the right", () => {
  assert.deepEqual(labelPadding("REPLACE"), { left: 1, right: 2 });
});
