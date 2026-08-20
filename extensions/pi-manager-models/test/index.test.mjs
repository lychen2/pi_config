import assert from "node:assert/strict";
import test from "node:test";

import { discoverModels, loadModels, patchDeepSeekResponsesReasoningPayload, sanitizeProviderHeaders } from "../index.ts";

test("drops static session IDs and blank request IDs without changing other headers", () => {
  assert.deepEqual(sanitizeProviderHeaders({
    "x-client-request-id": "  ",
    "X-Opencode-Session": "ses_rh_fix",
    "X-Opencode-Client": "cli",
    Accept: "application/json",
  }), {
    "X-Opencode-Client": "cli",
    Accept: "application/json",
  });
  assert.equal(sanitizeProviderHeaders({ "x-client-request-id": "" }), undefined);
});

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

test("reports a provider and sanitized endpoint when discovery is aborted", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    discoverModels({ baseUrl: "https://user:secret@example.invalid/api", modelsEndpoint: "models?token=hidden" }, undefined, controller.signal),
    (error) => {
      assert.match(String(error), /manager model discovery failed/);
      assert.match(String(error), /https:\/\/example.invalid\/api\/models/);
      assert.doesNotMatch(String(error), /secret|hidden/);
      return true;
    },
  );
});

test("prefers the live catalog over stale seed models", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ id: "gemini-3.7-flash" }] }), { status: 200 });
  try {
    const models = await loadModels({
      baseUrl: "https://models.example.invalid/v1",
      models: [{ id: "removed-model" }],
    });
    assert.deepEqual(models.map((model) => model.id), ["gemini-3.7-flash"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("discovery rejects empty model responses with endpoint context", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [] }), { status: 200 });
  try {
    await assert.rejects(
      discoverModels({ baseUrl: "https://models.example.invalid/v1" }),
      /manager returned an empty model list \(endpoint https:\/\/models.example.invalid\/v1\/models\)/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not expose an HTTP failure response body", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("token=secret", { status: 502 });
  try {
    await assert.rejects(
      discoverModels({ baseUrl: "https://models.example.invalid/v1" }),
      (error) => {
        assert.match(String(error), /HTTP 502/);
        assert.doesNotMatch(String(error), /secret/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
