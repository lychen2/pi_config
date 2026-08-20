#!/usr/bin/env node

import { access, cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const extensionsDir = path.join(repoRoot, "extensions");
const skipInstall = process.argv.includes("--skip-install");
const skipPack = process.argv.includes("--skip-pack");
const piRange = ">=0.82.0 <0.85.0";
const nodeRange = ">=22.19.0";
const piVersion = process.argv.find((argument) => argument.startsWith("--pi-version="))?.slice("--pi-version=".length);

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      // Avoid npm audit/update network side effects during verification.
      npm_config_audit: "false",
      npm_config_fund: "false",
    },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed in ${path.relative(repoRoot, cwd)}`);
}

function checkManifest(name, manifest) {
  if (manifest.engines?.node !== nodeRange) throw new Error(`${name}: engines.node must be ${nodeRange}`);
  for (const dependency of Object.keys(manifest.peerDependencies ?? {}).filter((name) => name.startsWith("@earendil-works/pi-"))) {
    if (manifest.peerDependencies[dependency] !== piRange) {
      throw new Error(`${name}: peerDependencies.${dependency} must be ${piRange}`);
    }
  }
}

async function stageRepositoryForPiVersion(packages, version) {
  const stagingRoot = await mkdtemp(path.join(os.tmpdir(), "pi-config-compat-"));
  const stagedRepo = path.join(stagingRoot, "repo");
  await cp(repoRoot, stagedRepo, {
    recursive: true,
    filter: (source) => path.basename(source) !== "node_modules" && path.basename(source) !== ".git",
  });
  for (const { dir, manifest } of packages) {
    const stagedDir = path.join(stagedRepo, path.relative(repoRoot, dir));
    const stagedManifest = {
      ...manifest,
      devDependencies: Object.fromEntries(Object.entries(manifest.devDependencies ?? {}).map(([name, range]) => [
        name,
        name.startsWith("@earendil-works/pi-") ? version : range,
      ])),
    };
    await writeFile(path.join(stagedDir, "package.json"), `${JSON.stringify(stagedManifest, null, 2)}\n`);
  }
  return { stagingRoot, stagedRepo };
}

const names = await readdir(extensionsDir, { withFileTypes: true });
const packages = [];
for (const entry of names) {
  if (!entry.isDirectory() || !entry.name.startsWith("pi-")) continue;
  const packageDir = path.join(extensionsDir, entry.name);
  const manifestPath = path.join(packageDir, "package.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw new Error(`${entry.name}: invalid package.json (${error instanceof Error ? error.message : String(error)})`);
    }
    try {
      await access(path.join(packageDir, "package-lock.json"));
    } catch {
      continue;
    }
    throw new Error(`${entry.name}: package-lock.json exists but package.json is missing`);
  }
  checkManifest(entry.name, manifest);
  packages.push({ name: entry.name, dir: packageDir, manifest });
}

let stagingRoot;
let stagedRepo;
if (piVersion) ({ stagingRoot, stagedRepo } = await stageRepositoryForPiVersion(packages, piVersion));
try {
  for (const { name, dir, manifest } of packages) {
    console.log(`\n== ${name}${piVersion ? ` (Pi ${piVersion})` : ""} ==`);
    const cwd = stagedRepo ? path.join(stagedRepo, path.relative(repoRoot, dir)) : dir;
    if (piVersion) run("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], cwd);
    if (!skipInstall || piVersion) run("npm", ["ci", "--ignore-scripts"], cwd);
    if (manifest.scripts?.test) run("npm", ["run", "test"], cwd);
    if (manifest.scripts?.typecheck) run("npm", ["run", "typecheck"], cwd);
    if (!skipPack) run("npm", ["pack", "--dry-run"], cwd);
  }
} finally {
  if (stagingRoot) await rm(stagingRoot, { recursive: true, force: true });
}

run(process.execPath, [path.join(repoRoot, "scripts", "sync-large-beautify.mjs"), "--check"], repoRoot);
run(process.execPath, [path.join(repoRoot, "scripts", "verify-install-regressions.mjs")], repoRoot);
console.log(`\nRepository verification passed for ${packages.length} extension packages${piVersion ? ` on Pi ${piVersion}` : ""}.`);
