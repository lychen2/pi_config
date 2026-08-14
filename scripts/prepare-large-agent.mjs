#!/usr/bin/env node

import { mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const largePackagePath = path.join(repoRoot, "large", "pi-maestro-large");
const teammatePackagePath = path.join(largePackagePath, "node_modules", "pi-maestro-teammate");
const cockpitPackagePath = path.join(largePackagePath, "node_modules", "pi-cockpit");
const home = os.homedir();
const sourceAgentDir = path.join(home, ".pi", "agent");
const largeAgentDir = path.join(home, ".pi", "agent-large");
const excludedPackages = new Set([
  "npm:@narumitw/pi-plan-mode",
  "npm:@juicesharp/rpiv-ask-user-question",
  "npm:pi-maestro-teammate",
  "npm:@juicesharp/rpiv-todo",
  "npm:pi-readseek",
  "../../pi_config/extensions/pi-readseek-compat",
  "../../pi_config/extensions/pi-maestro-todo",
]);
const sharedResources = [
  "auth.json",
  "models-store.json",
  "models.json",
  "skill-packs.json",
  "slim-skills-whitelist.json",
  "themes",
  "skills",
  "trust.json",
];

async function replaceWithSymlink(target, linkPath) {
  const relativeTarget = path.relative(path.dirname(linkPath), target);
  const tempPath = `${linkPath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await symlink(relativeTarget, tempPath);
    await rename(tempPath, linkPath);
  } finally {
    await rm(tempPath, { recursive: true, force: true });
  }
}

const settingsPath = path.join(sourceAgentDir, "settings.json");
const settings = JSON.parse(await readFile(settingsPath, "utf8"));
settings.packages = (settings.packages ?? []).filter((entry) => {
  const source = typeof entry === "string" ? entry : entry?.source;
  return typeof source !== "string"
    || (![...excludedPackages].some((excluded) => source === excluded || source.startsWith(`${excluded}@`))
      && source !== "../../pi_config/large/pi-maestro-large"
      && source !== largePackagePath);
});
settings.packages.push(
  largePackagePath,
  { source: teammatePackagePath, autoload: true },
  { source: cockpitPackagePath, autoload: true },
);

await mkdir(largeAgentDir, { recursive: true });
await writeFile(
  path.join(largeAgentDir, "settings.json"),
  `${JSON.stringify(settings, null, 2)}\n`,
);

for (const resource of sharedResources) {
  await replaceWithSymlink(
    path.join(sourceAgentDir, resource),
    path.join(largeAgentDir, resource),
  );
}
