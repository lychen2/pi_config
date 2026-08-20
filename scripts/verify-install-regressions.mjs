#!/usr/bin/env node
// Regression checks for installer audit fixes F-01/F-02/F-03/F-05:
// - F-01: install.mjs completes a non-TTY dry run without the upstream wizard.
// - F-02: run() enforces its deadline and reports "Timed out".
// - F-03: no remote curl|bash / irm|iex pipelines remain; pi.dev/RTK go through
//   hash- or checksum-verified installers, and the Linux bootstrap pins commits.
// - F-05: installation verifies Default/Large presentation sync and packages
//   both thinking-trail implementations.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const installMjs = path.join(repoRoot, "install.mjs");

const tempRoot = await mkdtemp(path.join(tmpdir(), "pi-install-regression-"));
try {
  // F-01: stdio pipes simulate a non-TTY environment.
  const f01 = spawnSync(
    process.execPath,
    [installMjs, "--yes", "--dry-run", "--skip-external", "--skip-rtk", "--skip-model-defaults"],
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
  assert.match(f01.stdout, /sync-large-beautify\.mjs --check/);

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

  const installMjsSource = await readFile(installMjs, "utf8");
  assert.doesNotMatch(installMjsSource, /raw\.githubusercontent\.com\/cortexkit\/magic-context/);
  assert.doesNotMatch(installMjsSource, /rtk-ai\/rtk\/refs\/heads\/master\/install\.sh/);
  assert.match(installMjsSource, /path\.join\(repoDir, "scripts", "install-rtk\.mjs"\)/);
  assert.match(installMjsSource, /path\.join\(repoDir, "scripts", "sync-large-beautify\.mjs"\), "--check"/);

  const toolRailsManifest = JSON.parse(await readFile(path.join(repoRoot, "extensions", "pi-tool-rails", "package.json"), "utf8"));
  assert.ok(toolRailsManifest.files.includes("thinking-message.ts"), "pi-tool-rails omits thinking-message.ts from its package");
  const largeBeautifyManifest = JSON.parse(await readFile(path.join(repoRoot, "extensions", "pi-large-beautify", "package.json"), "utf8"));
  assert.ok(largeBeautifyManifest.files.includes("vendor"), "pi-large-beautify omits its vendored thinking implementation");

  console.log("installer regression checks passed (F-01/F-02/F-03/F-04/F-05 surface).");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
