import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { browserManager, type BrowserManagerLike } from "./manager.ts";

type BrowserWaitUntil = "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
type BrowserDialogPolicy = "accept" | "dismiss";

export const BrowserParams = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["open", "close", "run"],
      description: "open: launch or attach a tab; close: close one or all tabs; run: execute JavaScript in a tab",
    },
    name: { type: "string", description: "Named tab id; defaults to main" },
    url: { type: "string", description: "URL to navigate on open" },
    app: {
      type: "object",
      properties: {
        path: { type: "string", description: "Chromium/Chrome/Edge executable path" },
        cdp_url: { type: "string", description: "Existing browser CDP endpoint" },
        args: { type: "array", items: { type: "string" }, description: "Extra browser launch arguments" },
        target: { type: "string", description: "Existing page URL/title substring" },
      },
      additionalProperties: false,
    },
    visible: { type: "boolean", description: "Launch a headed browser window; default is headless" },
    viewport: {
      type: "object",
      properties: {
        width: { type: "number", minimum: 1 },
        height: { type: "number", minimum: 1 },
        scale: { type: "number", minimum: 0.1, maximum: 10 },
      },
      required: ["width", "height"],
      additionalProperties: false,
    },
    wait_until: { type: "string", enum: ["load", "domcontentloaded", "networkidle0", "networkidle2"] },
    dialogs: { type: "string", enum: ["accept", "dismiss"] },
    code: { type: "string", minLength: 1, description: "Async JavaScript function body required for run" },
    timeout: { type: "number", minimum: 1, maximum: 300, description: "Timeout in seconds" },
    all: { type: "boolean", description: "Close all named tabs" },
    kill: { type: "boolean", description: "Deprecated close alias" },
  },
  required: ["action"],
  additionalProperties: false,
  if: { properties: { action: { const: "run" } }, required: ["action"] },
  then: { required: ["code"] },
} as const;

export interface BrowserToolDetails {
  action: "open" | "close" | "run";
  name?: string;
  url?: string;
  browser?: "headless" | "headed" | "connected";
  viewport?: { width: number; height: number; deviceScaleFactor?: number };
  screenshots?: Array<{ path?: string; mimeType: string; bytes: number }>;
  result?: string;
}

export function createBrowserTool(manager: BrowserManagerLike = browserManager): ToolDefinition<typeof BrowserParams, BrowserToolDetails> {
  return {
    name: "browser",
    label: "Browser",
    description: "Control Chromium through named tabs. Open or attach a browser, run trusted host-level JavaScript with page/browser/tab helpers, capture screenshots, and close one or all tabs. The run action requires non-empty code, is shell-equivalent, and is blocked in Plan mode. In run code, page is a puppeteer-core Page (page.setViewport({width,height}), page.goto, page.evaluate, page.screenshot — Puppeteer, not Playwright, so there is no page.setViewportSize), browser is a puppeteer Browser, and tab is a high-level helper (tab.setViewport, tab.observe, tab.click, tab.screenshot). Pass visible: true to open a headed (visible) browser window; the default is headless.",
    promptSnippet: "Use browser for interactive web navigation, DOM observation, form input, and screenshots. In run code page is a puppeteer-core Page (page.setViewport/page.goto/page.evaluate); tab offers tab.setViewport/tab.observe/tab.click/tab.screenshot. Pass visible:true on open for a headed (visible) window.",
    promptGuidelines: [
      "Call browser open before run, and reuse a stable tab name across related steps.",
      "run code receives page (puppeteer-core Page), browser (puppeteer Browser), and tab (high-level helper). This is Puppeteer, not Playwright.",
      "Top-level const/let/class/function in run code are scoped safely: you may declare any name, even wait, page, assert, display, etc., without a redeclaration error (a reused name shadows that helper inside your code).",
      "page.evaluate()/tab.evaluate() callbacks run in the browser page context, where Node-side variables from your run code are NOT visible. Pass them explicitly: await tab.evaluate((v) => …, v), or compute values inside the callback. tab.click()/type()/fill() return undefined, not a boolean — test existence with tab.observe(), tab.waitFor(), or page.$",
      "Set the viewport with tab.setViewport({ width, height }) or page.setViewport({ width, height }); there is no page.setViewportSize.",
      "Pass visible: true on open to launch a headed (visible) browser window for debugging or interaction; omit it for the default headless mode.",
      "Prefer tab.observe() and numeric element ids before clicking or typing; use tab.click/type/fill with those ids.",
      "Capture screenshots with tab.screenshot({ save? }) — it saves the PNG and displays it inline; page.screenshot works too but does not surface the image.",
      "Close tabs when browser work is complete.",
      "Treat run code as trusted host code: it executes with the Pi process permissions, not in a security sandbox.",
    ],
    parameters: BrowserParams,
    executionMode: "sequential",
    async execute(_id, params, signal, _onUpdate, ctx): Promise<AgentToolResult<BrowserToolDetails>> {
      const name = params.name?.trim() || "main";
      const action = params.action as BrowserToolDetails["action"];
      const timeoutMs = Math.min(300, Math.max(1, params.timeout ?? 30)) * 1_000;
      try {
        if (action === "open") {
          const info = await manager.open({
            name,
            cwd: ctx.cwd,
            url: params.url,
            executablePath: params.app?.path,
            cdpUrl: params.app?.cdp_url,
            args: params.app?.args,
            target: params.app?.target,
            visible: params.visible,
            viewport: params.viewport,
            waitUntil: parseWaitUntil(params.wait_until),
            dialogs: parseDialogPolicy(params.dialogs),
            signal,
            timeoutMs,
          });
          const text = `${info.reused ? "Reused" : "Opened"} ${info.kind} tab ${JSON.stringify(name)} at ${info.url}${info.title ? ` — ${info.title}` : ""}`;
          return success(text, { action: "open", name, url: info.url, browser: info.kind, viewport: info.viewport, result: text });
        }
        if (action === "close") {
          if (params.all) {
            const count = await manager.closeAll();
            const text = `Closed ${count} browser tab${count === 1 ? "" : "s"}.`;
            return success(text, { action: "close", result: text });
          }
          const closed = await manager.close(name);
          const text = closed ? `Closed tab ${JSON.stringify(name)}.` : `No tab named ${JSON.stringify(name)}.`;
          return success(text, { action: "close", name, result: text });
        }
        if (!params.code?.trim()) throw new Error("Browser run requires non-empty code.");
        const output = await manager.run(name, params.code, ctx.cwd, signal, timeoutMs);
        const content = [...output.displays];
        if (output.returnValue !== undefined) content.push({ type: "text" as const, text: formatValue(output.returnValue) });
        if (content.length === 0) content.push({ type: "text" as const, text: `Ran code on tab ${JSON.stringify(name)}.` });
        const text = content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
        return {
          content,
          details: { action: "run", name, url: output.url, screenshots: output.screenshots, result: text },
        } as AgentToolResult<BrowserToolDetails>;
      } catch (error) {
        if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw abortError();
        throw error instanceof Error ? error : new Error(String(error));
      }
    },
  };
}

function success(text: string, details: BrowserToolDetails): AgentToolResult<BrowserToolDetails> {
  return { content: [{ type: "text", text }], details } as AgentToolResult<BrowserToolDetails>;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  const text = JSON.stringify(value, null, 2) ?? String(value);
  return text.length > 60_000 ? `${text.slice(0, 60_000)}\n…output truncated…` : text;
}

function abortError(): Error {
  const error = new Error("Browser operation aborted.");
  error.name = "AbortError";
  return error;
}

function parseWaitUntil(value: unknown): BrowserWaitUntil | undefined {
  if (value === undefined) return undefined;
  if (value === "load" || value === "domcontentloaded" || value === "networkidle0" || value === "networkidle2") {
    return value;
  }
  throw new Error("Browser wait_until is invalid.");
}

function parseDialogPolicy(value: unknown): BrowserDialogPolicy | undefined {
  if (value === undefined) return undefined;
  if (value === "accept" || value === "dismiss") return value;
  throw new Error("Browser dialogs policy is invalid.");
}
