import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { outlineSource, outlineFile, MAX_FILE_BYTES, MAX_OUTPUT_CHARS } from "../../code-outline/outline.ts";
import register from "../../code-outline/index.ts";
import { activeToolsForMode } from "../../deferred-tools/tool-selection-state.ts";

test("outline activates through discovery or full mode only", () => {
  const groups = [{ id: "local:pi-default-workbench", tools: [{ name: "code_outline" }] }];
  const config = { toolMode: "adaptive", disabledExtensions: [], disabledTools: [] };
  const select = (mode, activated = new Set()) => activeToolsForMode(["read"], groups, { ...config, toolMode: mode }, activated, ["read", "code_outline"]);
  assert.ok(!select("adaptive").includes("code_outline"));
  assert.ok(!select("fast").includes("code_outline"));
  assert.ok(select("full").includes("code_outline"));
  assert.ok(select("adaptive", new Set(["code_outline"])).includes("code_outline"));
});

const source = `export interface Options { enabled: boolean; run(x: string): void; }
export type Result = string | number;
export class Worker {
  constructor(private n: number) {}
  run(x: string): string { const hidden = 'DO_NOT_SHOW'; return x; }
  callback = (x: number) => x + 1;
}
export const calculate = (x: number): number => { return x * 2; };
export async function fetchData(): Promise<void> { const hidden = 42; }
`;

test("outlines declarations and qualified members without function bodies", () => {
  const result = outlineSource(source, "sample.ts");
  for (const expected of ["interface Options", "Options.run", "type Result", "class Worker", "Worker.constructor", "Worker.callback", "function calculate", "function fetchData", "4-4 method Worker.constructor"]) assert.ok(result.text.includes(expected), expected);
  assert.ok(!result.text.includes("DO_NOT_SHOW"));
  assert.ok(!result.text.includes("hidden"));
  assert.ok(!result.text.includes("return x"));
  assert.equal(result.syntaxErrors, 0);
});

test("supports JSX and JS, bounded pages and syntax warnings", () => {
  assert.match(outlineSource("export const View = () => <main>Hello</main>;", "view.tsx").text, /function View/);
  assert.match(outlineSource("function main(x) { return x; }", "main.js").text, /function main/);
  assert.ok(outlineSource("function broken( {", "bad.ts").syntaxErrors > 0);
  const first = outlineSource(source, "sample.ts", 0, 2);
  const second = outlineSource(source, "sample.ts", first.nextOffset, 2);
  assert.equal(first.returned, 2); assert.equal(second.nextOffset, 4);
  const large = outlineSource(Array.from({ length: 300 }, (_, i) => `export type A${i} = ${JSON.stringify("x".repeat(1000))};`).join("\n"), "big.ts", 0, 200);
  assert.ok(large.text.length <= MAX_OUTPUT_CHARS); assert.ok(large.nextOffset < 200);
  assert.throws(() => outlineSource(source, "x.ts", -1));
});

test("reads current disk content, validates files and respects abort", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-outline-"));
  try {
    await writeFile(join(cwd, "test.ts"), source);
    assert.match((await outlineFile({ path: "test.ts" }, cwd)).text, /Worker/);
    await writeFile(join(cwd, "test.ts"), "export const changed = 1;");
    assert.match((await outlineFile({ path: "test.ts" }, cwd)).text, /changed/);
    await assert.rejects(outlineFile({ path: "bad.py" }, cwd), /Supported files/);
    await assert.rejects(outlineFile({ path: "missing.ts" }, cwd), /ENOENT/);
    await writeFile(join(cwd, "large.ts"), Buffer.alloc(MAX_FILE_BYTES + 1));
    await assert.rejects(outlineFile({ path: "large.ts" }, cwd), /2 MiB/);
    await assert.rejects(outlineFile({ path: "test.ts" }, cwd, AbortSignal.abort()), /abort/i);
    let tool;
    register({ registerTool: (value) => { tool = value; } });
    assert.equal(tool.name, "code_outline");
    const result = await tool.execute("id", { path: "test.ts" }, undefined, undefined, { cwd });
    assert.match(result.content[0].text, /changed/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
