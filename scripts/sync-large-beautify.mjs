#!/usr/bin/env node

import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const beautifyDir = path.join(repoRoot, "extensions", "pi-large-beautify");
const vendorDir = path.join(beautifyDir, "vendor");

const TOOL_RAILS_FILES = [
  "compact-shell.ts",
  "index.ts",
  "result-bridge.ts",
  "prompt-frame.ts",
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

await rm(vendorDir, { recursive: true, force: true });
await mkdir(path.join(vendorDir, "tool-rails"), { recursive: true });
await mkdir(path.join(vendorDir, "matugen-footer"), { recursive: true });
await mkdir(path.join(beautifyDir, "themes"), { recursive: true });

for (const file of TOOL_RAILS_FILES) {
  await cp(
    path.join(repoRoot, "extensions", "pi-tool-rails", file),
    path.join(vendorDir, "tool-rails", file),
  );
}

await cp(
  path.join(repoRoot, "extensions", "pi-brand-header", "index.ts"),
  path.join(vendorDir, "brand-header.ts"),
);

for (const file of MATUGEN_STANDALONE_FILES) {
  await cp(
    path.join(repoRoot, "extensions", file),
    path.join(vendorDir, file),
  );
}

await cp(
  path.join(repoRoot, "extensions", "matugen-footer"),
  path.join(vendorDir, "matugen-footer"),
  { recursive: true },
);

await cp(
  path.join(repoRoot, "themes", "matugen.json"),
  path.join(beautifyDir, "themes", "matugen.json"),
);

console.log(`Synced beautify vendor files into ${path.relative(repoRoot, vendorDir)}`);
