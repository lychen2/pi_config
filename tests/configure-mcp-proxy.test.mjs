import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configureMcpProxy, proxyBrowser } from "../scripts/configure-mcp-proxy.mjs";

test("proxy migration preserves memory-independent server configuration", () => {
  const original = { settings: { outputLimit: 123 }, mcpServers: {
    "zen-browser": { command: "browser-mcp", env: { TOKEN: "test-only" }, directTools: true, lifecycle: "eager" },
    other: { command: "other", directTools: true },
  } };
  const next = proxyBrowser(original);
  assert.equal(original.mcpServers["zen-browser"].directTools, true);
  assert.deepEqual(next.mcpServers["zen-browser"], { ...original.mcpServers["zen-browser"], directTools: false, lifecycle: "lazy-keep-alive" });
  assert.deepEqual(next.mcpServers.other, original.mcpServers.other);
  assert.deepEqual(next.settings, original.settings);
  assert.deepEqual(proxyBrowser({}), {});
});

test("migration backs up exactly once, supports dry-run and is idempotent", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-mcp-proxy-"));
  try {
    assert.equal(configureMcpProxy(dir), false);
    const path = join(dir, "mcp.json");
    const original = JSON.stringify({ mcpServers: { "zen-browser": { command: "test", directTools: true } } });
    writeFileSync(path, original);
    assert.equal(configureMcpProxy(dir, { dryRun: true }), true);
    assert.equal(readFileSync(path, "utf8"), original);
    assert.deepEqual(readdirSync(dir), ["mcp.json"]);
    assert.equal(configureMcpProxy(dir), true);
    const backup = readdirSync(dir).find(name => name.startsWith("mcp.json.pre-proxy-"));
    assert.equal(readFileSync(join(dir, backup), "utf8"), original);
    assert.equal(configureMcpProxy(dir), false);
    assert.equal(readdirSync(dir).length, 2);
    writeFileSync(path, "broken json");
    assert.throws(() => configureMcpProxy(dir), SyntaxError);
    assert.equal(readFileSync(path, "utf8"), "broken json");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
