import assert from "node:assert/strict";
import test from "node:test";
import { initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth } from "@earendil-works/pi-tui";
import labeledToolShell, { withoutBackground } from "../compact-shell.ts";

const theme = { fg: (_color, text) => text, bg: (_color, text) => text, bold: text => text };

test("renders codemode and SoL recall from execution args/results in the shared shell", () => {
  const handlers = new Map();
  labeledToolShell({ on: (name, handler) => handlers.set(name, handler) });
  handlers.get("session_start")({}, { mode: "tui", ui: { theme } });
  const ui = { requestRender() {} };
  const make = (name, args, result, partial = false) => {
    const component = new ToolExecutionComponent(name, `${name}-call`, args, {}, {
      renderShell: "self",
      renderCall: () => new Text(name, 0, 0),
      renderResult: () => new Text("nested tool output should not leak", 0, 0),
    }, ui, process.cwd());
    component.result = result;
    component.isPartial = partial;
    component.updateDisplay();
    return component;
  };
  try {
    const code = "const a = await tools.read(\"a.ts\");\nconst b = await tools.read(\"b.ts\");\nconst c = await tools.grep(\"needle\");\nreturn a + b + c;";
    const running = make("codemode", { code, reasoning: "compare source files" }, undefined, true);
    const runningLines = running.render(38);
    assert.ok(runningLines.some(line => line.includes("执行中")));
    assert.ok(!runningLines.some(line => line.includes("tools.read")));
    assert.ok(runningLines.every(line => visibleWidth(line) <= 38));

    const settled = make("codemode", { code, reasoning: "compare source files" }, {
      isError: false,
      content: [{ type: "text", text: "Script completed\nWall time 1.2 seconds\nOutput:\nCombined result ready" }],
      details: { calls: [
        { id: "call/1", name: "read", args: "{\"path\":\"a.ts\"}", status: "ok", durationMs: 950 },
        { id: "call/2", name: "models.classify", args: "provider/model", status: "ok", durationMs: 300, cost: 0.0042 },
      ] },
    });
    const collapsed = settled.render(60);
    assert.ok(collapsed.some(line => line.includes("2/2")));
    assert.ok(collapsed.some(line => line.includes("读取") && line.includes("a.ts")));
    assert.ok(collapsed.some(line => line.includes("├─")));
    assert.ok(collapsed.some(line => line.includes("└─")));
    assert.ok(!collapsed.some(line => line.includes("\"path\"")));
    assert.ok(collapsed.some(line => line.includes("1.2s")));
    assert.ok(collapsed.some(line => line.includes("Combined result ready")));
    assert.ok(!collapsed.some(line => line.includes("Script completed")));
    assert.ok(!collapsed.some(line => line.includes("静态引用")));
    assert.ok(!collapsed.some(line => line.includes("const a =")));
    settled.setExpanded(true);
    const expanded = settled.render(60);
    assert.ok(expanded.some(line => line.includes("源代码")));
    assert.ok(expanded.some(line => line.includes("tools.read")));
    assert.ok(expanded.some(line => line.includes("结果")));
    assert.ok(expanded.some(line => line.includes("models.classify")));
    assert.ok(expanded.some(line => line.includes("$0.0042")));
    assert.ok(expanded.every(line => visibleWidth(line) <= 60));

    const nestedFailure = make("codemode", { code: "await Promise.allSettled([tools.read('a'), tools.read('b')]);" }, {
      isError: false,
      content: [{ type: "text", text: "Script completed\nWall time 0.5 seconds\nOutput:\nDone despite nested error" }],
      details: { calls: [
        { id: "call/1", name: "read", args: "a", status: "error", durationMs: 12, error: "permission denied" },
        { id: "call/2", name: "read", args: "b", status: "ok", durationMs: 20 },
      ] },
    });
    const nestedFailurePreview = nestedFailure.render(60);
    assert.ok(nestedFailurePreview.some(line => line.includes("1 失败")));
    assert.ok(nestedFailurePreview.some(line => line.includes("permission denied")));
    assert.ok(nestedFailurePreview.some(line => line.includes("Done despite nested error")));

    const cancelled = make("codemode", { code }, {
      isError: false,
      content: [{ type: "text", text: "Script completed\nWall time 0.1 seconds\nOutput:\n" }],
      details: { calls: [{ id: "call/1", name: "grep", args: "needle", status: "cancelled" }] },
    });
    assert.ok(cancelled.render(60).some(line => line.includes("⊘")));
    assert.ok(cancelled.render(60).some(line => line.includes("取消")));

    const truncated = make("codemode", { code: Array.from({ length: 90 }, (_, i) => `// source ${i}`).join("\n") }, {
      isError: false,
      content: [{ type: "text", text: "Script completed\nWall time 2.5 seconds\nOutput:\nWarning: truncated output\nfirst output chunk\nlast output chunk" }],
      details: { calls: [], fullOutputPath: "/tmp/codemode-full.txt" },
    });
    truncated.setExpanded(true);
    const truncatedExpanded = truncated.render(60);
    assert.ok(truncatedExpanded.some(line => line.includes("first output chunk")));
    assert.ok(truncatedExpanded.some(line => line.includes("完整输出: /tmp/codemode-full.txt")));
    assert.ok(truncatedExpanded.findIndex(line => line.includes("结果")) < truncatedExpanded.findIndex(line => line.includes("源代码")));
    assert.ok(truncatedExpanded.some(line => line.includes("source 79")));
    assert.ok(!truncatedExpanded.some(line => line.includes("source 89")));
    assert.ok(!truncatedExpanded.some(line => line.includes("Script completed")));

    const noOutput = make("codemode", { code: "void 0" }, {
      isError: false,
      content: [{ type: "text", text: "Script completed\nWall time 0.2 seconds\nOutput:\n" }],
      details: { calls: [] },
    });
    assert.ok(noOutput.render(60).some(line => line.includes("无输出")));

    const failed = make("codemode", { code }, {
      isError: true,
      content: [{ type: "text", text: "Error: sandbox denied" }],
    });
    assert.ok(failed.render(60).some(line => line.includes("Error: sandbox denied")));
    assert.ok(failed.render(60).some(line => line.includes("失败")));

    const recall = make("obs_recall", { id: "obs-42", offset: 120 }, {
      isError: false,
      details: { id: "obs-42", offset: 120, nextOffset: 240, eof: false, bytes: 120, lines: 2 },
      content: [{ type: "text", text: "[obs_recall id=obs-42 offset=120 next_offset=240 eof=false]\n[chunk_bytes=120 chunk_lines=2; use next_offset to continue]\nRecovered observation with useful evidence\nMoney saved · full observation replay avoided" }],
    });
    const recalled = recall.render(42);
    assert.ok(recalled.some(line => line.includes("#obs-42")));
    assert.ok(recalled.some(line => line.includes("偏移 120") && line.includes("下次 240")));
    assert.ok(recalled.some(line => line.includes("已读取 2 行")));
    assert.ok(!recalled.some(line => line.includes("Recovered observation")));
    assert.ok(!recalled.some(line => line.includes("Money saved")));
    assert.ok(!recalled.some(line => line.includes("chunk_bytes")));
    assert.ok(recalled.every(line => visibleWidth(line) <= 42));
    recall.setExpanded(true);
    assert.ok(recall.render(80).some(line => line.includes("useful evidence")));
  } finally {
    handlers.get("session_shutdown")();
  }
});

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
      assert.equal(lines.length, 4);
      assert.ok(!lines.some(line => /line \d+/.test(line)));
      assert.ok(lines.every(line => !line.includes("\x1b[48;")));
      assert.ok(lines.every(line => visibleWidth(line) <= 60));
      assert.deepEqual(component.render(60), lines);
      component.setExpanded(true);
      assert.ok(component.render(60).some(line => line.includes("line 29")));
      assert.ok(component.render(60).some(line => line.includes("\x1b[38;2;40;49;100m")));
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
