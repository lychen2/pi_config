#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageDir = dirname(fileURLToPath(import.meta.url));
const packageName = "@earendil-works/pi-coding-agent";

function optionValue(argv, name) {
  const index = argv.indexOf(name);
  return index < 0 ? undefined : argv[index + 1];
}

function globalNodeModules() {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  return execFileSync(npm, ["root", "-g"], { encoding: "utf8" }).trim();
}

export function resolvePiDist(requestedDist) {
  const dist = requestedDist
    ? resolve(requestedDist)
    : join(globalNodeModules(), packageName, "dist");
  if (!existsSync(dist)) {
    throw new Error(`Pi dist directory was not found: ${dist}`);
  }
  return dist;
}

export function applyLocalization({ dist, patches, check = false }) {
  let changedFiles = 0;
  let replacements = 0;
  const unmatched = [];

  for (const [relativePath, entries] of Object.entries(patches)) {
    const filePath = join(dist, relativePath.replaceAll("\\", "/"));
    if (!existsSync(filePath)) {
      unmatched.push(`${relativePath} (missing file)`);
      continue;
    }

    let source = readFileSync(filePath, "utf8");
    const original = source;
    // Later patches can refine text emitted by an earlier patch. Once this file
    // is known to be localized, those intentionally overlapping pairs are not drift.
    const isKnownLocalizedFile = entries.some(([, after]) => source.includes(after));
    for (const [before, after] of entries) {
      if (source.includes(before)) {
        const count = source.split(before).length - 1;
        source = source.replaceAll(before, after);
        replacements += count;
      } else if (!source.includes(after) && !isKnownLocalizedFile) {
        unmatched.push(relativePath);
      }
    }

    if (source !== original) {
      changedFiles += 1;
      if (!check) writeFileSync(filePath, source);
    }
  }

  return { changedFiles, replacements, unmatched };
}

export function localize(argv = process.argv.slice(2)) {
  const check = argv.includes("--check");
  const quiet = argv.includes("--quiet");
  const dist = resolvePiDist(optionValue(argv, "--dist"));
  const patches = JSON.parse(readFileSync(join(packageDir, "patches.json"), "utf8"));
  const result = applyLocalization({ dist, patches, check });

  if (!quiet) {
    const action = check ? "检查" : "汉化";
    console.log(`${action}完成：${result.replacements} 处替换，${result.changedFiles} 个文件${check ? "将被" : "已被"}更新。`);
    if (result.unmatched.length) {
      console.warn(`未匹配 ${result.unmatched.length} 条补丁，Pi 版本可能已变更。`);
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  localize();
}
