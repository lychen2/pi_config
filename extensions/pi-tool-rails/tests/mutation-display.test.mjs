import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initTheme, ToolExecutionComponent, createEditToolDefinition, createWriteToolDefinition } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import resultBridge, { renderAftEditResult } from "../result-bridge.ts";
import labeledToolShell from "../compact-shell.ts";

const plain = text => text.replace(/\x1b\[[0-9;]*m/g, "");
const theme = { fg: (_color, text) => text, bg: (_color, text) => text, bold: text => text };

test("native mutation calls show two collapsed rows and one expanded diff", async () => {
  initTheme("dark");
  const dir = await mkdtemp(join(tmpdir(), "mutation-display-"));
  const handlers = new Map();
  const pi = { on(name, handler) { const list = handlers.get(name) ?? []; list.push(handler); handlers.set(name, list); } };
  resultBridge(pi);
  labeledToolShell(pi);
  const ctx = { cwd: dir, mode: "tui", ui: { theme } };
  for (const fn of handlers.get("session_start") ?? []) await fn({}, ctx);
  try {
    for (const name of ["edit", "write"]) {
      for (const fused of [false, true]) {
        await writeFile(join(dir, "file.txt"), "unchanged\nold value\n");
        const args = { path: "file.txt", ...(name === "edit" ? { edits: [{ oldText: "old value", newText: "new value" }] } : { content: "unchanged\nnew value\n" }), ...(fused ? { then_run: { command: "check" } } : {}) };
        const definition = name === "edit" ? createEditToolDefinition(dir) : createWriteToolDefinition(dir);
        const event = { toolName: name, toolCallId: `${name}-${fused}`, input: args };
        for (const fn of handlers.get("tool_call") ?? []) await fn(event, ctx);
        const result = await definition.execute(event.toolCallId, args, undefined, undefined, ctx);
        if (fused) result.content.push({ type: "text", text: "[then_run:succeeded]\nverified command output" });
        for (const fn of handlers.get("tool_result") ?? []) {
          const update = await fn({ ...event, ...result, isError: false }, ctx);
          if (update) Object.assign(result, update);
        }
        const component = new ToolExecutionComponent(name, event.toolCallId, args, {}, definition, { requestRender() {} }, dir);
        component.result = { ...result, isError: false };
        component.isPartial = false;
        component.updateDisplay();
        for (const width of [40, 100]) {
          component.setExpanded(false);
          const collapsed = component.render(width).map(plain);
          assert.equal(collapsed.length, 4, collapsed.join("\n"));
          assert.match(collapsed[1], /file.txt/);
          assert.match(collapsed[2], /\+1 -1/);
          assert.ok(collapsed.every(line => visibleWidth(line) <= width));
          component.setExpanded(true);
          const expanded = component.render(width).map(plain).join("\n");
          assert.equal(expanded.split("old value").length - 1, 1, expanded);
          assert.equal(expanded.split("new value").length - 1, 1, expanded);
          assert.equal(expanded.split("verified command output").length - 1, fused ? 1 : 0);
        }
      }
    }
  } finally {
    for (const fn of handlers.get("session_shutdown") ?? []) await fn();
    await rm(dir, { recursive: true, force: true });
  }
});

test("deletion-only changes retain a zero addition count", () => {
  const lines = renderAftEditResult({ details: { diff: "-1 removed" } }, { expanded: false }, theme, {}).render(80);
  assert.deepEqual(lines.map(line => plain(line).trim()), ["+0 -1 [━━━━━━━━]"]);
});
