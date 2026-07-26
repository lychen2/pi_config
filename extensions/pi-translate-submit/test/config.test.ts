import assert from "node:assert/strict";
import test from "node:test";
import { parseSettings } from "../src/config.js";

test("parses an independent translation model", () => {
  const settings = parseSettings({
    model: {
      provider: "manager",
      id: "deepseek-v4-flash",
    },
  });

  assert.deepEqual(settings, {
    model: {
      provider: "manager",
      id: "deepseek-v4-flash",
    },
  });
});

test("migrates a single legacy provider mapping", () => {
  assert.deepEqual(
    parseSettings({
      models: {
        manager: "deepseek-v4-flash",
      },
    }),
    {
      model: {
        provider: "manager",
        id: "deepseek-v4-flash",
      },
    },
  );
});

test("defaults missing model settings to no saved model", () => {
  assert.deepEqual(parseSettings({}), {});
});

test("rejects invalid or ambiguous legacy settings", () => {
  assert.throws(
    () => parseSettings({ model: { provider: "manager", id: 42 } }),
    /must contain non-empty provider and id strings/,
  );
  assert.throws(
    () => parseSettings({ models: { openai: 42 } }),
    /must map provider names to model IDs/,
  );
  assert.throws(
    () => parseSettings({ models: { openai: "gpt-4.1-nano", anthropic: "claude-haiku" } }),
    /has multiple entries/,
  );
});
