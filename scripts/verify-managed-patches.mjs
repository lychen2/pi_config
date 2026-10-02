import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [id, directory] = process.argv.slice(2);
assert.ok(directory, "A candidate checkout is required");
assert.ok(["sol-pi", "pi-provider"].includes(id), "Unknown managed checkout");
// Use the installed bridge's Pi loader, rather than a checkout's stale peer installation.
const loaderPath = resolve(import.meta.dirname, "../extensions/pi-context-bridge/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js");
const isolated = await mkdtemp(join(tmpdir(), "managed-pi-load-"));
const originalHome = process.env.HOME;
const originalProfile = process.env.USERPROFILE;
const originalFetch = globalThis.fetch;
try {
  // The provider derives models.json from os.homedir(). Isolate it before module loading.
  process.env.HOME = isolated;
  process.env.USERPROFILE = isolated;
  assert.equal(homedir(), isolated);
  globalThis.fetch = async () => { throw new Error("Unexpected network access during load verification"); };
  const { loadExtensions } = await import(pathToFileURL(loaderPath).href);
  const entrypoint = id === "sol-pi" ? "src/sol-pi/index.ts" : "extensions/provider/index.ts";
  const result = await loadExtensions([join(resolve(directory), entrypoint)], isolated);
  assert.deepEqual(result.errors, [], "Pi extension load errors");
  assert.equal(result.extensions.length, 1);
  if (id === "sol-pi") {
    assert.ok(result.extensions[0].handlers.has("session_start"));
    // Its deferred-continuation regression runs in the complete upstream suite.
  } else {
    const provider = result.extensions[0].commands.get("provider");
    assert.ok(provider);
    const models = [{ id: "first" }, { id: "sparse-test" }, { id: "named", name: "Named", contextWindow: 42, maxTokens: 8 }];
    const fixture = { providers: { fixture: { baseUrl: "https://fixture.invalid/v1", apiKey: "fixture-key", api: "anthropic-messages", models } } };
    const configPath = join(isolated, ".pi/agent/models.json");
    await mkdir(join(isolated, ".pi/agent"), { recursive: true });
    await writeFile(configPath, JSON.stringify(fixture));
    const requests = [];
    globalThis.fetch = async (url, options) => {
      assert.ok(String(url).startsWith("https://fixture.invalid/v1/"), "Only fixture requests allowed");
      if (options.body) requests.push(JSON.parse(options.body));
      return new Response("{}", { status: 200 });
    };
    const views = [];
    const context = {
      hasUI: false,
      model: { provider: "fixture", id: "sparse-test" },
      ui: {
        notify() {},
        select: async (title, items) => {
          if (title === "View provider status") return "fixture";
          if (title === "Status: fixture") views.push(items.join("\n"));
          return undefined;
        },
      },
    };
    await provider.handler("status", context);
    assert.equal(requests[0].model, "sparse-test", "Status probe uses the active model");
    assert.equal(views.length, 1);
    assert.match(views[0], /sparse-test\n\s+Reasoning\s+: No\n\s+Input\s+: text\n\s+Context\s+: 128K tokens\n\s+Max output\s+: 16384 tokens/);
    assert.match(views[0], /Named \(named\)[\s\S]*Context\s+: 42 tokens\n\s+Max output\s+: 8 tokens/);
    assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")), fixture, "Status leaves sparse config unchanged");
    context.model.id = "missing";
    await provider.handler("status", context);
    assert.equal(requests.at(-1).model, "first", "Unknown active model preserves configured priority");
    console.log("PASS: public provider status handles sparse defaults, explicit metadata and active-model probes offline");
  }
  console.log("PASS: actual Pi 1.0 extension load/registration in isolated HOME");
} finally {
  globalThis.fetch = originalFetch;
  if (originalHome === undefined) delete process.env.HOME; else process.env.HOME = originalHome;
  if (originalProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = originalProfile;
  await rm(isolated, { recursive: true, force: true });
}
