#!/usr/bin/env node
// Regression checks for installer audit fixes F-01/F-02/F-03/F-05:
// - F-01: install.mjs completes a non-TTY dry run without the upstream wizard.
// - F-02: run() enforces its deadline and reports "Timed out".
// - F-03: no remote curl|bash / irm|iex pipelines remain; pi.dev/RTK go through
//   hash- or checksum-verified installers, and the Linux bootstrap pins commits.
// - F-05: installation verifies active tool presentations.
// - Retired workspace history and Large features stay out of the default install.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { configurePortable } from "./configure-portable.mjs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const installMjs = path.join(repoRoot, "install.mjs");
const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");
const readmeZh = await readFile(path.join(repoRoot, "README.zh-CN.md"), "utf8");
for (const [label, content] of [["README.md", readme], ["README.zh-CN.md", readmeZh]]) {
  assert.match(content, /incremental|增量更新/i, `${label} must describe the default incremental update`);
  assert.match(content, /--clean-plugins/, `${label} must identify explicit clean install semantics`);
  assert.match(content, /--clean-plugins --dry-run/, `${label} must show how to preview cleanup`);
}
assert.doesNotMatch(readme, /installer always starts from a clean plugin state/i);
assert.doesNotMatch(readmeZh, /每次都会从干净的插件状态开始/);

const tempRoot = await mkdtemp(path.join(tmpdir(), "pi-install-regression-"));
try {
  // F-01: stdio pipes simulate a non-TTY environment.
  const f01 = spawnSync(
    process.execPath,
    [installMjs, "--yes", "--dry-run", "--with-external", "--skip-rtk", "--skip-model-defaults"],
    {
      cwd: repoRoot,
      env: { ...process.env, PI_CODING_AGENT_DIR: path.join(tempRoot, "agent") },
      encoding: "utf8",
      timeout: 120_000,
    },
  );
  assert.equal(f01.status, 0, `non-TTY dry run failed:\n${f01.stderr}`);
  assert.match(f01.stdout, /Dry run complete\. No changes were made\./);
  assert.doesNotMatch(f01.stdout, /upstream setup wizard/);
  assert.doesNotMatch(f01.stdout, /raw\.githubusercontent\.com\/cortexkit/);
  assert.doesNotMatch(f01.stdout, /sync-large-beautify|pi-large-mode|pi-workspace-history/i);
  assert.match(f01.stdout, /verify active tool presentations/);
  assert.match(f01.stdout, /i-have-adhd\.json/);
  const adhdConfig = JSON.parse(await readFile(path.join(repoRoot, "config", "i-have-adhd.json"), "utf8"));
  assert.deepEqual(adhdConfig, { alwaysOn: true, hideStatus: false });
  const installMjsSource = await readFile(installMjs, "utf8");
  console.log("  package all external Pi dependencies from config/external-packages.txt with unversioned npm sources");
  assert.match(installMjsSource, /installRuntimeGitSources/);
  assert.match(installMjsSource, /config", "sol-pi\.json"/);
  assert.match(installMjsSource, /\["merge", "--ff-only", defaultRef\]/);
  assert.match(installMjsSource, /\["update", "--extension", packageSource\]/);
  const externalPackages = (await readFile(path.join(repoRoot, "config", "external-packages.txt"), "utf8"))
    .split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  assert.deepEqual(externalPackages, [
    "npm:@pi-lab/notify",
    "npm:@cortexkit/pi-magic-context", "npm:@narumitw/pi-plan-mode",
    "npm:@juicesharp/rpiv-ask-user-question", "npm:pi-slopchop", "npm:pi-btw",
    "npm:@victor-software-house/pi-curated-themes",
    "git:github.com/ayghri/i-have-adhd",
  ]);
  assert.ok(!externalPackages.some(entry => /^npm:.*@\d/.test(entry)), "npm sources must not pin a version");
  const runtimeSources = (await readFile(path.join(repoRoot, "config", "runtime-git-sources.txt"), "utf8"))
    .split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#"));
  assert.deepEqual(runtimeSources, ["git:github.com/NVlabs/SoL-Pi", "git:github.com/BevalZ/pi-provider"]);
  assert.match(installMjsSource, /await configureManagedGit\(agentDir\)/);
  assert.doesNotMatch(f01.stdout, /pi-workspace-history/i, "retired workspace history package must not be offered by the installer");

  // Public templates restore a fresh host without embedding secrets or starting optional services.
  const portableHome = path.join(tempRoot, "portable-home");
  const portableAgent = path.join(portableHome, ".pi", "agent");
  configurePortable({ repoDir: repoRoot, agentDir: portableAgent, homeDir: portableHome, customAgentDir: false, xdgConfigHome: undefined });
  const restoredMcp = JSON.parse(await readFile(path.join(portableAgent, "mcp.json"), "utf8"));
  assert.ok(Object.values(restoredMcp.mcpServers).every(server => server.enabled === false));
  assert.equal(restoredMcp.mcpServers.github.headers.Authorization, "Bearer ${GITHUB_TOKEN}");
  assert.equal(restoredMcp.mcpServers.jupyter.env.JUPYTER_TOKEN, "${JUPYTER_TOKEN}");
  assert.equal(restoredMcp.mcpServers["obsidian-files"].args.at(-1), path.join(portableHome, "Documents", "文献阅读", "obsidian", "note"));
  const restoredModels = JSON.parse(await readFile(path.join(portableAgent, "models.json"), "utf8"));
  assert.equal(restoredModels.providers.manager.apiKey, "MANAGER_API_KEY");
  assert.equal(restoredModels.providers["111"].apiKey, "PROVIDER_111_API_KEY");
  const restoredWeb = JSON.parse(await readFile(path.join(portableHome, ".pi", "web-search.json"), "utf8"));
  assert.deepEqual(restoredWeb.ssrf.allowRanges, ["198.18.0.0/15"]);
  assert.deepEqual(JSON.parse(await readFile(path.join(portableHome, ".pi", "tool-selector.json"), "utf8")).disabledTools, ["todowrite"]);

  // Incremental restoration keeps credentials, machine paths, and explicit /mcp choices.
  const customAgent = path.join(tempRoot, "custom-agent");
  await mkdir(customAgent);
  await writeFile(path.join(customAgent, "models.json"), JSON.stringify({ providers: { manager: { apiKey: "local-model-secret", baseUrl: "https://local.example/v1" } } }));
  await writeFile(path.join(customAgent, "mcp.json"), JSON.stringify({ mcpServers: { zotero: { enabled: true, command: "custom-uvx" }, github: { headers: { Authorization: "Bearer local-secret" } } } }));
  await writeFile(path.join(customAgent, "web-search.json"), JSON.stringify({ exaApiKey: "local-web-secret" }));
  configurePortable({ repoDir: repoRoot, agentDir: customAgent, homeDir: portableHome, customAgentDir: true });
  const incrementalModels = JSON.parse(await readFile(path.join(customAgent, "models.json"), "utf8"));
  assert.equal(incrementalModels.providers.manager.apiKey, "local-model-secret");
  assert.equal(incrementalModels.providers.manager.baseUrl, "https://local.example/v1");
  const incrementalMcp = JSON.parse(await readFile(path.join(customAgent, "mcp.json"), "utf8"));
  assert.equal(incrementalMcp.mcpServers.zotero.enabled, true);
  assert.equal(incrementalMcp.mcpServers.zotero.command, "custom-uvx");
  assert.equal(incrementalMcp.mcpServers.github.headers.Authorization, "Bearer local-secret");
  assert.equal(JSON.parse(await readFile(path.join(customAgent, "web-search.json"), "utf8")).exaApiKey, "local-web-secret");
  const xdgRoot = path.join(tempRoot, "xdg");
  configurePortable({ repoDir: repoRoot, agentDir: portableAgent, homeDir: portableHome, customAgentDir: false, xdgConfigHome: xdgRoot });
  assert.deepEqual(JSON.parse(await readFile(path.join(xdgRoot, "pi", "web-search.json"), "utf8")).ssrf, restoredWeb.ssrf);

  // F-02: a hanging command must fail on deadline instead of blocking.
  const { run } = await import(pathToFileURL(installMjs).href);
  const startedAt = Date.now();
  await assert.rejects(
    async () => run(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { timeout: 400 }),
    /Timed out after/,
  );
  assert.ok(Date.now() - startedAt < 10_000, "the timeout did not take effect");

  // F-03/F-04 surface: no remote-exec pipelines, verified installers only.
  const installSh = await readFile(path.join(repoRoot, "install.sh"), "utf8");
  assert.doesNotMatch(installSh, /\|\s*sh\b/, "install.sh still pipes a remote script into sh");
  assert.doesNotMatch(installSh, /\|\s*bash\b/, "install.sh still pipes a remote script into bash");
  assert.match(installSh, /sha256_of/);
  assert.match(installSh, /integrity check failed/);
  assert.match(installSh, /commits\/main/);
  assert.match(installSh, /PI_INSTALL_SHA256/);

  assert.doesNotMatch(installMjsSource, /raw\.githubusercontent\.com\/cortexkit\/magic-context/);
  const workbenchEntry = await readFile(path.join(repoRoot, "extensions", "pi-default-workbench", "index.ts"), "utf8");
  assert.doesNotMatch(workbenchEntry, /large-mode|registerLazyLargeCommand/);
  const lazyTools = await readFile(path.join(repoRoot, "extensions", "pi-default-workbench", "lazy-tools.ts"), "utf8");
  assert.doesNotMatch(lazyTools, /registerCommand\("large"|large-mode\.ts/);
  const workbenchManifest = JSON.parse(await readFile(path.join(repoRoot, "extensions", "pi-default-workbench", "package.json"), "utf8"));
  assert.ok(!workbenchManifest.files.includes("large-mode.ts") && !workbenchManifest.files.includes("large-mode-core.ts"));

  console.log("installer regression checks passed (F-01/F-02/F-03/F-04/F-05 surface; retired features absent).");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
