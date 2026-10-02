import { readFile, writeFile, copyFile, rename } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const managedGitSources = [
  { id: "sol-pi", source: "git:github.com/NVlabs/SoL-Pi", owner: "NVlabs", repository: "SoL-Pi", branch: "main" },
  { id: "pi-provider", source: "git:github.com/BevalZ/pi-provider", owner: "BevalZ", repository: "pi-provider", branch: "master" },
];
export const checkoutPath = (agentDir, spec) => join(agentDir, "git", "github.com", spec.owner, spec.repository);

export function managedPackages(packages, agentDir) {
  const provider = managedGitSources.find(spec => spec.id === "pi-provider");
  const local = checkoutPath(agentDir, provider);
  const sources = new Set(managedGitSources.map(spec => spec.source));
  let registered = false;
  const result = [];
  for (const entry of packages) {
    const source = typeof entry === "string" ? entry : entry.source;
    if (typeof source !== "string") throw new Error("Invalid package entry");
    const remote = [...sources].find(value => source === value || source.startsWith(`${value}@`));
    const isLocalProvider = !source.startsWith("npm:") && !source.startsWith("git:") && resolve(agentDir, source) === local;
    if (remote === provider.source || isLocalProvider) {
      if (registered) throw new Error("Duplicate pi-provider registrations; resolve them before updating");
      result.push(typeof entry === "string" ? local : { ...entry, source: local });
      registered = true;
    } else if (remote) {
      // SoL-Pi is loaded through the bridge, not registered as a second package.
      throw new Error("Standalone SoL-Pi registration found; run configure-default-sol.mjs first");
    } else result.push(entry);
  }
  if (!registered) result.push(local);
  return result;
}

export function restoreManagedPatch(directory, patchPath, { dryRun = false } = {}) {
  const git = args => spawnSync("git", args, { cwd: directory, encoding: "utf8" });
  if (git(["apply", "--reverse", "--check", patchPath]).status === 0) return;
  const check = git(["apply", "--check", patchPath]);
  if (check.error || check.status !== 0) throw new Error(`Cannot restore managed patch ${patchPath}: ${check.error?.message ?? check.stderr}`);
  if (dryRun) {
    console.log(`  would restore managed patch: ${patchPath}`);
    return;
  }
  const applied = git(["apply", patchPath]);
  if (applied.error || applied.status !== 0) throw new Error(`Failed to restore managed patch ${patchPath}: ${applied.error?.message ?? applied.stderr}`);
  console.log(`  restored managed patch: ${patchPath}`);
}

export async function configureManagedGit(agentDir, { dryRun = false } = {}) {
  const path = join(agentDir, "settings.json");
  const before = await readFile(path, "utf8");
  const settings = JSON.parse(before);
  const packages = managedPackages(settings.packages ?? [], agentDir);
  if (JSON.stringify(packages) === JSON.stringify(settings.packages)) return;
  if (dryRun) {
    console.log(`Would protect pi-provider from native Git resets: ${path}`);
    return;
  }
  const backup = `${path}.pre-managed-git-${Date.now()}`;
  await copyFile(path, backup);
  const temp = `${path}.managed-git-${process.pid}`;
  await writeFile(temp, `${JSON.stringify({ ...settings, packages }, null, 2)}\n`, { mode: 0o600 });
  if (await readFile(path, "utf8") !== before) throw new Error("settings.json changed while configuring; retry");
  await rename(temp, path);
  console.log(`Protected pi-provider as a local package. Settings backup: ${backup}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  await configureManagedGit(agentDir, { dryRun: process.argv.includes("--dry-run") });
}
