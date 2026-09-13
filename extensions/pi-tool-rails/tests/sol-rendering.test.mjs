import assert from "node:assert/strict";
import test from "node:test";
import { initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth } from "@earendil-works/pi-tui";
import labeledToolShell, { withoutBackground } from "../compact-shell.ts";

const theme = { fg: (_color, text) => text, bg: (_color, text) => text, bold: text => text };

test("real tool component enforces mutation previews and renders SoL plan goals", () => {
  initTheme("dark");
  const handlers = new Map();
  labeledToolShell({ on: (name, handler) => handlers.set(name, handler) });
  handlers.get("session_start")({}, { mode: "tui", ui: { theme } });
  const ui = { requestRender() {} };
  try {
    for (const name of ["edit", "write"]) {
      const definition = {
        name,
        renderCall: () => new Text("file.ts", 0, 0),
        renderResult: () => new Text(Array.from({ length: 30 }, (_, i) => `\x1b[48;2;10;20;30m\x1b[38;2;40;49;100mline ${i}\x1b[0m`).join("\n"), 0, 0),
      };
      const component = new ToolExecutionComponent(name, "call", { path: "file.ts", then_run: { command: "npm test" } }, {}, definition, ui, process.cwd());
      component.result = { content: [{ type: "text", text: "untouched evidence" }], isError: false };
      component.isPartial = false;
      component.updateDisplay();
      const lines = component.render(60);
      assert.equal(lines.length, 15);
      assert.ok(lines.some(line => line.includes("+19 行")));
      assert.ok(lines.every(line => !line.includes("\x1b[48;")));
      assert.ok(lines.some(line => line.includes("\x1b[38;2;40;49;100m")));
      assert.ok(lines.every(line => visibleWidth(line) <= 60));
      assert.deepEqual(component.render(60), lines);
      component.setExpanded(true);
      assert.ok(component.render(60).some(line => line.includes("line 29")));
      assert.equal(component.result.content[0].text, "untouched evidence");
    }
    const steps = [{ goal: "Inspect", status: "completed" }, { goal: "Verify", status: "in_progress" }];
    const plan = new ToolExecutionComponent("update_plan", "plan", { steps }, {}, {
      renderShell: "self",
      renderCall: () => new Text("Plan: 2 steps", 0, 0),
      renderResult: () => new Text("Plan recorded", 0, 0),
    }, ui, process.cwd());
    const lines = plan.render(60);
    assert.ok(lines.some(line => line.includes("✓ Inspect")));
    assert.ok(lines.some(line => line.includes("◐ Verify")));
    assert.equal(withoutBackground("\x1b[38;2;40;49;100mtext"), "\x1b[38;2;40;49;100mtext");
  } finally {
    handlers.get("session_shutdown")();
  }
});
