import test from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { loadThemeFromPath } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { fileURLToPath } from "node:url";
import { renderSoftFrame, renderSoftLabel } from "../visual-style.ts";

const plain = value => value.replace(/\x1b\][^\x07]*(?:\x07)/g, "").replace(/\x1b\[[0-9;]*m/g, "");
const theme = loadThemeFromPath(fileURLToPath(new URL("../../../themes/matugen.json", import.meta.url)), "truecolor");
for (const width of [40, 80, 120, 160]) {
  test(`soft frames preserve Unicode, links, and failure labels at ${width} columns`, () => {
    const content = "中文🌸/".repeat(25);
    const rows = renderSoftFrame({theme, width, title:"🧵 工具编排", status:"× 失败", state:"error", surface:"toolErrorBg", lines:[content, "\x1b]8;;https://example.org\x07link\x1b]8;;\x07"]});
    assert.ok(rows.every(row => visibleWidth(row) <= width));
    assert.match(plain(rows[0]), /× 失败/);
    assert.ok(rows.join("\n").includes("https://example.org"));
    assert.equal((plain(rows.join("\n")).match(/中/g) ?? []).length, 25);
    assert.equal((plain(rows.join("\n")).match(/文/g) ?? []).length, 25);
    assert.equal(plain(rows[0]).startsWith("╭"), width >= 48);
  });
}
test("card bodies keep terminal backgrounds and frames use bright theme accents", () => {
  for (const surface of ["userMessageBg", "toolPendingBg", "toolSuccessBg", "toolErrorBg"]) {
    const rows = renderSoftFrame({ theme, width: 80, title: "读取", lines: ["内容"], surface });
    assert.ok(rows[0].includes(theme.getFgAnsi("borderAccent")));
    assert.ok(rows[1].includes(theme.getFgAnsi("borderAccent")));
    assert.ok(rows.at(-1).includes(theme.getFgAnsi("borderAccent")));
    assert.doesNotMatch(rows.join("\n"), /\x1b\[(?:48[;:]|4[0-7]m|10[0-7]m)/);
  }
});

test("error labels use an independent solid badge and theme-native color encoding", () => {
  const error = renderSoftLabel(theme, "× 失败", "error");
  assert.match(error, /48;2;255;107;129/);
  assert.match(error, /38;2;36;18;23/);
  assert.equal(plain(error).trim(), "× 失败");
  assert.doesNotMatch(renderSoftLabel(theme, "已取消", "cancelled"), /48;/);
});
test("all frame states fit narrow terminals", () => {
  for (const width of [1, 2, 3, 4, 16, 47, 48]) {
    for (const state of ["idle", "running", "success", "warning", "error", "cancelled"]) {
      const rows = renderSoftFrame({theme, width, title:"中文 tool", status:state, state, lines:["body"]});
      assert.ok(rows.every(row => visibleWidth(row) <= width), `${state}/${width}`);
    }
  }
});
