import assert from "node:assert/strict";
import test from "node:test";
import { localizeSlashSuggestions } from "../command-descriptions.mjs";

test("localizes configured third-party slash command descriptions", () => {
  const suggestions = {
    prefix: "/",
    items: [
      { value: "provider", label: "provider", description: "[user:git] Manage providers" },
      { value: "/ponytail-review", label: "ponytail-review", description: "Run /skill:ponytail-review" },
      { value: "unknown", label: "unknown", description: "Keep this" },
    ],
  };

  assert.deepEqual(localizeSlashSuggestions(suggestions), {
    prefix: "/",
    items: [
      { value: "provider", label: "provider", description: "[user:git] 管理提供商：添加、复制、编辑、移除、测试、检查、状态与归档" },
      { value: "/ponytail-review", label: "ponytail-review", description: "运行 /skill:ponytail-review" },
      { value: "unknown", label: "unknown", description: "Keep this" },
    ],
  });
});

test("leaves incomplete slash suggestions unchanged", () => {
  const suggestions = { prefix: "/", items: undefined };
  assert.equal(localizeSlashSuggestions(suggestions), suggestions);
});

test("leaves non-slash completion results unchanged", () => {
  const suggestions = { prefix: "read", items: [{ value: "read", label: "read" }] };
  assert.equal(localizeSlashSuggestions(suggestions), suggestions);
});
