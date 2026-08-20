#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyDependencyChanges,
  classifyContent,
  dependencyChanges,
  upstreamMetadata,
} from "./large-update-core.mjs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const largeDir = path.join(repoRoot, "large", "pi-maestro-large");
const metadataPath = path.join(largeDir, ".upstream.json");
const packageName = "pi-maestro-flow";
const mirroredRoots = ["src", "scripts", "schemas", "templates", ".pi", "optional", "AGENTS.md"];
const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const targetArg = argv.find((arg) => arg.startsWith("--target="))?.slice("--target=".length) ?? "latest";
const baselineArg = argv.find((arg) => arg.startsWith("--baseline="))?.slice("--baseline=".length);

if (argv.some((arg) => !["--apply"].includes(arg) && !arg.startsWith("--target=") && !arg.startsWith("--baseline="))) {
  console.error("Usage: node scripts/update-large.mjs [--target=<version>] [--baseline=<version>] [--apply]");
  process.exit(2);
}

const NPM_QUERY_TIMEOUT_MS = 2 * 60 * 1000;
const RUN_TIMEOUT_MS = 20 * 60 * 1000;

function npmView(spec, field) {
  return execFileSync("npm", ["view", spec, field, "--json"], {
    encoding: "utf8",
    timeout: NPM_QUERY_TIMEOUT_MS,
  }).trim();
}

function npmScalar(spec, field) {
  const value = JSON.parse(npmView(spec, field));
  return Array.isArray(value) ? value.at(-1) : value;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", timeout: RUN_TIMEOUT_MS });
  if (result.error) {
    if (result.error.code === "ETIMEDOUT") {
      throw new Error(`Timed out after ${Math.round(RUN_TIMEOUT_MS / 1000)}s running ${command}: check your network or proxy and retry`);
    }
    throw result.error;
  }
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function packAndExtract(version, tempRoot) {
  const packDir = path.join(tempRoot, version);
  await import("node:fs/promises").then(({ mkdir }) => mkdir(packDir, { recursive: true }));
  const filename = execFileSync("npm", ["pack", `${packageName}@${version}`, "--pack-destination", packDir, "--silent"], {
    encoding: "utf8",
    timeout: NPM_QUERY_TIMEOUT_MS,
  }).trim().split(/\r?\n/).at(-1);
  const tarball = path.join(packDir, filename);
  run("tar", ["-xzf", tarball, "-C", packDir], repoRoot);
  return { root: path.join(packDir, "package"), tarball: npmScalar(`${packageName}@${version}`, "dist.tarball") };
}

async function collectFiles(root, relative = "") {
  const full = path.join(root, relative);
  let info;
  try { info = await stat(full); } catch { return []; }
  if (info.isFile()) return [relative];
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(full, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === "node_modules" || entry.name === ".upstream.json") continue;
    files.push(...await collectFiles(root, path.join(relative, entry.name)));
  }
  return files;
}

async function readOptional(file) {
  try { return await readFile(file); } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function compareRoots(baseRoot, localRoot, targetRoot) {
  const filesByRoot = await Promise.all([baseRoot, localRoot, targetRoot].map(async (root) =>
    (await Promise.all(mirroredRoots.map((entry) => collectFiles(root, entry)))).flat()
  ));
  const results = [];
  for (const relative of [...new Set(filesByRoot.flat())].sort()) {
    const base = await readOptional(path.join(baseRoot, relative));
    const local = await readOptional(path.join(localRoot, relative));
    const target = await readOptional(path.join(targetRoot, relative));
    results.push({ path: relative, ...classifyContent(base, local, target) });
  }
  return results;
}

function report(label, values) {
  console.log(`${label}: ${values.length}`);
  for (const value of values.slice(0, 30)) console.log(`  ${value.path ?? `${value.section}.${value.name}`}`);
  if (values.length > 30) console.log(`  ... ${values.length - 30} more`);
}

const currentMetadata = await readJson(metadataPath, null);
const baselineVersion = baselineArg ?? currentMetadata?.version ?? "0.18.0";
const targetVersion = npmScalar(`${packageName}@${targetArg}`, "version");
if (targetVersion === baselineVersion) {
  console.log(`pi-large is already based on ${packageName}@${targetVersion}`);
  process.exit(0);
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), "pi-large-update-"));
try {
  const [base, target] = await Promise.all([
    packAndExtract(baselineVersion, tempRoot),
    packAndExtract(targetVersion, tempRoot),
  ]);
  const fileChanges = await compareRoots(base.root, largeDir, target.root);
  const localPackage = await readJson(path.join(largeDir, "package.json"));
  const basePackage = await readJson(path.join(base.root, "package.json"));
  const targetPackage = await readJson(path.join(target.root, "package.json"));
  const packageChanges = dependencyChanges(basePackage, localPackage, targetPackage);
  const conflicts = [
    ...fileChanges.filter((entry) => entry.kind === "conflict"),
    ...packageChanges.filter((entry) => entry.kind === "conflict"),
  ];
  const updates = fileChanges.filter((entry) => entry.kind === "update" || entry.kind === "delete");
  const dependencyUpdates = packageChanges.filter((entry) => entry.kind !== "conflict");
  const localOnly = fileChanges.filter((entry) => entry.kind === "local-only");

  console.log(`Baseline: ${packageName}@${baselineVersion}`);
  console.log(`Target:   ${packageName}@${targetVersion}`);
  report("Conflicts", conflicts);
  report("Mirror updates", updates);
  report("Dependency updates", dependencyUpdates);
  report("Local-only files", localOnly);

  if (conflicts.length > 0) {
    console.error("Update blocked: local and upstream changed the same mirrored content.");
    process.exitCode = 1;
  } else if (!apply) {
    console.log("Dry run complete. Re-run with --apply to stage, verify, and replace atomically.");
  } else {
    const staged = `${largeDir}.update-${process.pid}`;
    await rm(staged, { recursive: true, force: true });
    await cp(largeDir, staged, { recursive: true, filter: (source) => !source.includes(`${path.sep}node_modules`) });
    for (const change of updates) {
      const destination = path.join(staged, change.path);
      if (change.kind === "delete") await rm(destination, { force: true });
      else {
        const { mkdir } = await import("node:fs/promises");
        await mkdir(path.dirname(destination), { recursive: true });
        await cp(path.join(target.root, change.path), destination, { force: true });
      }
    }
    const nextPackage = applyDependencyChanges(localPackage, dependencyUpdates);
    await writeFile(path.join(staged, "package.json"), `${JSON.stringify(nextPackage, null, 2)}\n`);
    await writeFile(path.join(staged, ".upstream.json"), `${JSON.stringify(upstreamMetadata({ packageName, version: targetVersion, tarball: target.tarball, mirroredRoots, result: "applied", previousVersion: baselineVersion }), null, 2)}\n`);
    run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], staged);
    run("npm", ["run", "typecheck"], staged);
    const capability = path.join(staged, "scripts", "verify-maestro-run-capabilities.mjs");
    if (await exists(capability)) run(process.execPath, [capability], staged);
    const backup = `${largeDir}.previous-${process.pid}`;
    await rename(largeDir, backup);
    try {
      await rename(staged, largeDir);
      await rm(backup, { recursive: true, force: true });
    } catch (error) {
      await rename(backup, largeDir).catch(() => {});
      throw error;
    }
    console.log(`Updated pi-large to ${packageName}@${targetVersion}`);
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
