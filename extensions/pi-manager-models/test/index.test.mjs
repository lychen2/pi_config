import assert from "node:assert/strict";
import test from "node:test";

import { patchDeepSeekResponsesReasoningPayload } from "../index.ts";

test("fills missing preserved reasoning for every DeepSeek model", () => {
  for (const model of ["deepseek-v4-flash", "deepseek-v4-pro", "DeepSeek-R1"]) {
    const payload = {
      model,
      input: [
        {
          type: "reasoning",
          id: "item_reasoning",
          summary: [
            { type: "summary_text", text: "first" },
            { type: "summary_text", text: "second" },
          ],
        },
        { type: "function_call", call_id: "call_1" },
      ],
    };

    assert.deepEqual(patchDeepSeekResponsesReasoningPayload(payload), {
      ...payload,
      input: [
        { ...payload.input[0], encrypted_content: "first\nsecond" },
        payload.input[1],
      ],
    });
  }
});

test("preserves reasoning content already returned by the gateway", () => {
  const payload = {
    model: "deepseek-v4-flash",
    input: [{ type: "reasoning", summary: [{ text: "summary" }], encrypted_content: "opaque" }],
  };

  assert.equal(patchDeepSeekResponsesReasoningPayload(payload), undefined);
});

test("does not modify other models or payloads without reasoning summaries", () => {
  assert.equal(patchDeepSeekResponsesReasoningPayload({
    model: "gemini-3.6-flash",
    input: [{ type: "reasoning", summary: [{ text: "summary" }] }],
  }), undefined);
  assert.equal(patchDeepSeekResponsesReasoningPayload({
    model: "deepseek-v4-flash",
    input: [{ type: "message", content: [] }],
  }), undefined);
});
