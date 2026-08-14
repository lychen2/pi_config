import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createJiti } from "jiti";

const beautifyDir = dirname(dirname(fileURLToPath(import.meta.url)));
const indexTs = join(beautifyDir, "index.ts");

function createMockPi() {
  const events = {};
  const tools = [];
  const commands = [];
  return {
    calls: { events, tools, commands },
    on(event, handler) {
      (events[event] ??= []).push(handler);
    },
    registerTool(def) {
      tools.push(def);
    },
    registerCommand(name, def) {
      commands.push([name, def]);
    },
    getActiveTools() {
      return [];
    },
    getAllTools() {
      return [];
    },
    getCommands() {
      return [];
    },
    getThinkingLevel() {
      return "off";
    },
    registerShortcut() {},
    registerFlag() {},
  };
}

test("beautify entry loads and composes the beautification modules", async () => {
  const jiti = createJiti(import.meta.url, { moduleCache: false, interopDefault: true });
  const factory = await jiti.import(indexTs, { default: true });
  assert.equal(typeof factory, "function", "default export must be a factory function");

  const pi = createMockPi();
  await factory(pi);

  assert.ok(pi.calls.events.session_start?.length > 0, "expected session_start handlers");
  assert.ok(pi.calls.events.session_shutdown?.length > 0, "expected session_shutdown handlers");
  assert.ok(
    pi.calls.commands.some(([name]) => name === "logo"),
    "expected the /logo command from the brand header",
  );
});
