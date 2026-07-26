import assert from "node:assert/strict";
import test from "node:test";
import { maskLiterals } from "../src/literals.js";

test("masks and restores code, URLs, paths, flags, and environment variables", () => {
  const source = [
    "请修复 `src/main.ts`，访问 https://example.com/a，运行 --dry-run。",
    "配置 API_TOKEN，并检查：",
    "```sh",
    "npm run test -- --watch",
    "```",
  ].join("\n");
  const masked = maskLiterals(source);

  assert.doesNotMatch(masked.text, /src\/main\.ts|https:\/\/example\.com|API_TOKEN/);
  assert.match(masked.text, /\[\[PI_LITERAL_0\]\]/);

  const restored = masked.restore(
    "Fix [[PI_LITERAL_1]], visit [[PI_LITERAL_2]], and run [[PI_LITERAL_3]]. Configure [[PI_LITERAL_4]] and check:\n[[PI_LITERAL_0]]",
  );
  assert.match(restored, /`src\/main\.ts`/);
  assert.match(restored, /https:\/\/example\.com\/a/);
  assert.match(restored, /API_TOKEN/);
  assert.match(restored, /npm run test -- --watch/);
});

test("fails closed when the model drops a protected placeholder", () => {
  const masked = maskLiterals("修复 `src/main.ts`");

  assert.throws(
    () => masked.restore("Fix the source file."),
    /Nothing was sent/,
  );
});

test("protects a placeholder-looking string supplied by the user", () => {
  const masked = maskLiterals("请保留 [[PI_LITERAL_0]] 这个文本");
  const restored = masked.restore("Keep [[PI_LITERAL_0]].");

  assert.equal(restored, "Keep [[PI_LITERAL_0]].");
});
