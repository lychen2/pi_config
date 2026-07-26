import assert from "node:assert/strict";
import test from "node:test";
import type { Api, Model } from "@earendil-works/pi-ai/compat";
import { translateToEnglish } from "../src/translate.js";

const model = {
  id: "translation-small",
  name: "Translation Small",
  api: "openai-completions",
  provider: "openai",
  baseUrl: "https://api.example.test/v1",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 1_024,
} as Model<Api>;

const auth = { apiKey: "test-secret" };

function successfulResponse(content: string) {
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text: content }],
    api: "openai-completions" as const,
    provider: "openai",
    model: "translation-small",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop" as const,
    timestamp: Date.now(),
  };
}

test("uses Pi's simple-completion path without a translation thinking override", async () => {
  let reasoning: unknown = "present";
  const output = await translateToEnglish(
    "Fix `src/main.ts`.",
    model,
    auth,
    (async (_model, _context, options) => {
      reasoning = options?.reasoning;
      return successfulResponse("<translation>Fix [[PI_LITERAL_0]].</translation>");
    }) as typeof import("@earendil-works/pi-ai/compat").completeSimple,
  );

  assert.equal(output, "Fix `src/main.ts`.");
  assert.equal(reasoning, undefined);
});

test("applies manager request compatibility", async () => {
  const managerModel = {
    ...model,
    api: "openai-responses",
    provider: "manager",
  } as Model<Api>;
  let requestModel: Model<Api> | undefined;
  let requestHeaders: Record<string, string | null> | undefined;

  await translateToEnglish(
    "你好",
    managerModel,
    auth,
    (async (selectedModel, _context, options) => {
      requestModel = selectedModel;
      requestHeaders = options?.headers;
      return successfulResponse("<translation>Hello</translation>");
    }) as typeof import("@earendil-works/pi-ai/compat").completeSimple,
  );

  assert.equal(requestModel?.thinkingLevelMap?.off, null);
  assert.equal(requestHeaders?.["User-Agent"], "node");
});

test("sends a single structured masked user request", async () => {
  let receivedText = "";
  let receivedSystemPrompt: string | undefined;
  let receivedModel: Model<Api> | undefined;

  const output = await translateToEnglish(
    "请修复 `src/main.ts`，然后运行 --dry-run。",
    model,
    auth,
    (async (selectedModel, context) => {
      receivedModel = selectedModel;
      receivedSystemPrompt = context.systemPrompt;
      const message = context.messages[0];
      if (typeof message.content !== "string") {
        const textBlock = message.content.find(
          (part): part is { type: "text"; text: string } => part.type === "text",
        );
        receivedText = textBlock?.text ?? "";
      }
      return successfulResponse("<translation>Fix [[PI_LITERAL_0]], then run [[PI_LITERAL_1]].</translation>");
    }) as typeof import("@earendil-works/pi-ai/compat").completeSimple,
  );

  assert.equal(output, "Fix `src/main.ts`, then run --dry-run.");
  assert.equal(receivedModel?.id, "translation-small");
  assert.equal(receivedSystemPrompt, undefined);
  assert.doesNotMatch(receivedText, /src\/main\.ts|--dry-run/);
  assert.match(receivedText, /Translation task/);
  assert.match(receivedText, /\[\[PI_LITERAL_0\]\]/);
});

test("rejects a conversational response instead of inserting it", async () => {
  await assert.rejects(
    translateToEnglish(
      "你好",
      model,
      auth,
      (async () => successfulResponse("Hey there! I'm Kiro.")) as typeof import("@earendil-works/pi-ai/compat").completeSimple,
    ),
    /translation-only format/,
  );
});

test("rejects a response that damages protected text", async () => {
  await assert.rejects(
    translateToEnglish(
      "请修复 `src/main.ts`。",
      model,
      auth,
      (async () => successfulResponse("<translation>Fix the file.</translation>")) as typeof import("@earendil-works/pi-ai/compat").completeSimple,
    ),
    /Nothing was sent/,
  );
});
