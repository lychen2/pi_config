#!/usr/bin/env node

import { cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const beautifyDir = path.join(repoRoot, "extensions", "pi-large-beautify");
const vendorDir = path.join(beautifyDir, "vendor");
const checkOnly = process.argv.includes("--check");

const TOOL_RAILS_FILES = [
  "compact-shell.ts",
  "index.ts",
  "sleep-progress.ts",
  "result-bridge.ts",
  "prompt-frame.ts",
  "plan-widget.ts",
  "teammate-panel.ts",
  "thinking-message.ts",
  "thinking-shimmer.ts",
  "user-message.ts",
  "tool-body-polish.ts",
  "prototype-patch-registry.ts",
  "tool-presentations.mjs",
  "tool-presentations.d.mts",
];

const MATUGEN_STANDALONE_FILES = [
  "matugen-chrome.ts",
  "matugen-footer-core.mjs",
  "matugen-footer-core.d.mts",
];

const mappings = [
  ...TOOL_RAILS_FILES.map((file) => [
    path.join("extensions", "pi-tool-rails", file),
    path.join("extensions", "pi-large-beautify", "vendor", "tool-rails", file),
  ]),
  [
    path.join("extensions", "pi-tool-rails", "brand-header.ts"),
    path.join("extensions", "pi-large-beautify", "vendor", "brand-header.ts"),
  ],
  ...MATUGEN_STANDALONE_FILES.map((file) => [
    path.join("extensions", file),
    path.join("extensions", "pi-large-beautify", "vendor", file),
  ]),
  [
    path.join("extensions", "matugen-footer"),
    path.join("extensions", "pi-large-beautify", "vendor", "matugen-footer"),
  ],
  [
    path.join("themes", "matugen.json"),
    path.join("extensions", "pi-large-beautify", "themes", "matugen.json"),
  ],
];

async function collectFiles(root) {
  const info = await stat(root);
  if (!info.isDirectory()) return new Map([[".", await readFile(root)]]);
  const result = new Map();
  async function visit(current, relative = ".") {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      const entryRelative = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(entryPath, entryRelative);
      else result.set(entryRelative, await readFile(entryPath));
    }
  }
  await visit(root);
  return result;
}

async function checkMapping(source, target) {
  const [sourceFiles, targetFiles] = await Promise.all([collectFiles(source), collectFiles(target)]);
  if (sourceFiles.size !== targetFiles.size) throw new Error(`Vendor file count differs: ${path.relative(repoRoot, source)} -> ${path.relative(repoRoot, target)}`);
  for (const [relative, sourceContent] of sourceFiles) {
    const targetContent = targetFiles.get(relative);
    if (!targetContent || !sourceContent.equals(targetContent)) {
      throw new Error(`Vendor content differs: ${path.relative(repoRoot, source)} -> ${path.relative(repoRoot, target)} (${relative})`);
    }
  }
}

async function sync() {
  await rm(vendorDir, { recursive: true, force: true });
  await mkdir(path.join(vendorDir, "tool-rails"), { recursive: true });
  await mkdir(path.join(vendorDir, "matugen-footer"), { recursive: true });
  await mkdir(path.join(beautifyDir, "themes"), { recursive: true });
  for (const file of TOOL_RAILS_FILES) await cp(path.join(repoRoot, "extensions", "pi-tool-rails", file), path.join(vendorDir, "tool-rails", file));
  await cp(path.join(repoRoot, "extensions", "pi-tool-rails", "brand-header.ts"), path.join(vendorDir, "brand-header.ts"));
  for (const file of MATUGEN_STANDALONE_FILES) await cp(path.join(repoRoot, "extensions", file), path.join(vendorDir, file));
  await cp(path.join(repoRoot, "extensions", "matugen-footer"), path.join(vendorDir, "matugen-footer"), { recursive: true });
  await cp(path.join(repoRoot, "themes", "matugen.json"), path.join(beautifyDir, "themes", "matugen.json"));
  console.log(`Synced beautify vendor files into ${path.relative(repoRoot, vendorDir)}`);
}

if (checkOnly) {
  for (const [source, target] of mappings) await checkMapping(path.join(repoRoot, source), path.join(repoRoot, target));
  console.log("Large vendor check passed.");
} else {
  await sync();
}
