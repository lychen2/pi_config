import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { checkoutPath, configureManagedGit, managedGitSources } from "./configure-managed-git.mjs";

const exec = promisify(execFile);
export async function command(cwd, executable, args, { timeout = 120_000 } = {}) {
  const result = await exec(executable, args, { cwd, timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  return result.stdout;
}
const git = (cwd, args) => command(cwd, "git", args);
const hash = value => createHash("sha256").update(value).digest("hex");

async function extraFiles(directory) {
  const [untracked, ignored] = await Promise.all([
    git(directory, ["ls-files", "--others", "--exclude-standard", "-z"]),
    git(directory, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"]),
  ]);
  return [...new Set(`${untracked}${ignored}`.split("\0").filter(Boolean))]
    .filter(path => !path.split("/").includes("node_modules")).sort();
}
async function fileState(directory, paths) {
  const result = [];
  for (const path of paths) {
    const full = resolve(directory, path);
    const rel = relative(directory, full);
    if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error(`Unsafe checkout path: ${path}`);
    const info = await lstat(full);
    // Do not silently follow symlinks into private files outside the checkout.
    if (!info.isFile()) throw new Error(`Unsupported extra file (not a regular file): ${path}`);
    result.push([path, info.mode, hash(await readFile(full))]);
  }
  return result;
}
export async function snapshot(directory) {
  const [head, patch, status, paths] = await Promise.all([
    git(directory, ["rev-parse", "HEAD"]),
    git(directory, ["diff", "--binary", "--full-index", "HEAD", "--"]),
    git(directory, ["status", "--porcelain=v1", "-z"]),
    extraFiles(directory),
  ]);
  const files = await fileState(directory, paths);
  return { head: head.trim(), patch, paths, digest: hash(JSON.stringify({ head, patch, status, files })) };
}

export async function prepareUpdate({ directory, workspace, spec, validate, remote, branch = spec.branch, log = console.log }) {
  if (!(await lstat(join(directory, ".git"))).isDirectory()) throw new Error("Only standalone Git checkouts are supported");
  if ((await git(directory, ["ls-files", "--unmerged"])).trim()) throw new Error(`${spec.id}: resolve existing Git conflicts first`);
  const before = await snapshot(directory);
  const candidate = join(workspace, "candidate");
  const upstream = remote ?? `https://github.com/${spec.owner}/${spec.repository}.git`;
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  await writeFile(join(workspace, "local.patch"), before.patch, { mode: 0o600 });
  await writeFile(join(workspace, "before.json"), JSON.stringify({ head: before.head, digest: before.digest, paths: before.paths }, null, 2));
  log(`${spec.id}: staging from ${before.head.slice(0, 10)}; local patch archived`);
  // Clone local history independently. Fetching or applying never touches the live checkout.
  await git(workspace, ["clone", "--no-hardlinks", "--no-checkout", directory, candidate]);
  await git(candidate, ["remote", "set-url", "origin", upstream]);
  await git(candidate, ["fetch", "--no-tags", "origin", branch]);
  const target = (await git(candidate, ["rev-parse", "FETCH_HEAD"])).trim();
  await git(candidate, ["checkout", "--detach", target]);
  if (before.patch) {
    await git(candidate, ["apply", "--3way", "--whitespace=nowarn", join(workspace, "local.patch")]);
    // Keep patches as working-tree changes, so later updates can capture them again.
    await git(candidate, ["reset", "--mixed", target]);
  }
  for (const path of before.paths) {
    const destination = join(candidate, path);
    if ((await git(candidate, ["ls-files", "--", path])).trim()) throw new Error(`Extra file collides with upstream: ${path}`);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(directory, path), destination, { preserveTimestamps: true });
  }
  // The old HEAD is retained in candidate refs too, independently of the backup directory.
  await git(candidate, ["update-ref", "refs/pi-local/previous", before.head]);
  await validate(candidate, spec, workspace);
  const after = await snapshot(directory);
  if (after.digest !== before.digest) throw new Error(`${spec.id}: live checkout changed during validation; nothing activated`);
  const retainedPatch = await git(candidate, ["diff", "--binary", "--full-index", "HEAD", "--"]);
  await writeFile(join(workspace, "rebased.patch"), retainedPatch, { mode: 0o600 });
  await writeFile(join(workspace, "manifest.json"), JSON.stringify({ id: spec.id, directory, upstream, branch, before: before.head, target, checkedAt: new Date().toISOString() }, null, 2));
  log(`${spec.id}: validated ${target.slice(0, 10)} with local patches`);
  return { directory, workspace, candidate, before, target, spec };
}

export async function activateUpdates(prepared, { move = rename, log = console.log } = {}) {
  // Verify all originals immediately before the first switch.
  for (const entry of prepared) {
    if ((await snapshot(entry.directory)).digest !== entry.before.digest) throw new Error(`${entry.spec.id}: checkout changed before activation`);
  }
  const switched = [];
  try {
    for (const entry of prepared) {
      const backup = join(entry.workspace, "previous-checkout");
      await move(entry.directory, backup);
      try {
        await move(entry.candidate, entry.directory);
      } catch (error) {
        await move(backup, entry.directory);
        throw error;
      }
      switched.push({ ...entry, backup });
    }
  } catch (error) {
    const failures = [];
    for (const entry of switched.reverse()) {
      try {
        await move(entry.directory, entry.candidate);
        await move(entry.backup, entry.directory);
      } catch (rollbackError) { failures.push(`${entry.spec.id}: ${rollbackError.message}; backup: ${entry.backup}`); }
    }
    if (failures.length) throw new Error(`Activation failed: ${error.message}. Manual recovery required: ${failures.join("; ")}`, { cause: error });
    throw error;
  }
  for (const entry of switched) log(`${entry.spec.id}: active ${entry.target.slice(0, 10)}; original retained at ${entry.backup}`);
}

export async function validateManaged(candidate, spec, workspace) {
  if (spec.id === "pi-provider") {
    // Repair the existing local patch's missing option declaration in the staged copy only.
    const path = join(candidate, "extensions/provider/index.ts");
    const source = await readFile(path, "utf8");
    const block = source.match(/interface BgSelfCheckOpts\s*{[^}]*}/)?.[0];
    if (!block) throw new Error("Provider background-check contract changed; review the patch");
    if (!/mode\?: SelfCheckMode;/.test(block)) {
      const anchor = "  preferredReasoning?: boolean;\n  probeModelId?: string;";
      if (!block.includes(anchor)) throw new Error("Provider patch type anchor changed; manual review required");
      await writeFile(path, source.replace(block, block.replace(anchor, "  preferredReasoning?: boolean;\n  mode?: SelfCheckMode;\n  probeModelId?: string;")));
    }
  }
  const logs = join(workspace, "checks.log");
  const outputs = [];
  const check = async (executable, args, timeout = 600_000) => {
    outputs.push(`$ ${executable} ${args.join(" ")}\n`);
    try { outputs.push(await command(candidate, executable, args, { timeout })); }
    catch (error) {
      outputs.push(error.stdout ?? "", error.stderr ?? "", error.message);
      throw error;
    } finally { await writeFile(logs, outputs.join("\n"), { mode: 0o600 }); }
  };
  if (spec.id === "pi-provider") {
    const dependencies = resolve(import.meta.dirname, "../extensions/pi-context-bridge/node_modules");
    const tsconfig = join(workspace, "provider-tsconfig.json");
    const packages = ["pi-coding-agent", "pi-ai", "pi-tui", "pi-agent-core"];
    const config = {
      compilerOptions: {
        noEmit: true, strict: true, skipLibCheck: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler",
        types: ["node"], typeRoots: [join(dependencies, "@types")],
        paths: Object.fromEntries(packages.map(name => [`@earendil-works/${name}`, [join(dependencies, "@earendil-works", name, "dist/index.d.ts")]])),
      },
      files: [join(candidate, "extensions/provider/index.ts")],
    };
    await writeFile(tsconfig, JSON.stringify(config, null, 2));
    // Compare against the exact upstream revision: existing shared-helper errors
    // must remain visible, while any new diagnostic blocks activation.
    const baseline = await mkdtemp(join(workspace, "type-baseline-"));
    await git(workspace, ["clone", "--no-hardlinks", "--no-checkout", candidate, baseline]);
    await git(baseline, ["checkout", "--detach", "HEAD"]);
    const baselineConfig = join(workspace, "provider-baseline-tsconfig.json");
    await writeFile(baselineConfig, JSON.stringify({ ...config, files: [join(baseline, "extensions/provider/index.ts")] }));
    const diagnostics = async path => {
      try {
        await check(process.execPath, [join(dependencies, "typescript/bin/tsc"), "--pretty", "false", "-p", path]);
        return "";
      } catch (error) {
        if (error.code !== 1 || !/error TS\d+:/.test(error.stdout ?? "")) throw error;
        return error.stdout.trim();
      }
    };
    const baselineRelative = `${relative(candidate, baseline).replaceAll(sep, "/")}/`;
    const upstreamErrors = (await diagnostics(baselineConfig)).replaceAll(baseline, "<checkout>").replaceAll(baselineRelative, "");
    const candidateErrors = (await diagnostics(tsconfig)).replaceAll(candidate, "<checkout>");
    if (candidateErrors !== upstreamErrors) throw new Error("Provider introduces new TypeScript diagnostics; see checks.log");
    if (upstreamErrors) {
      const message = `Known upstream TypeScript diagnostics unchanged:\n${upstreamErrors}\n`;
      outputs.push(message);
      await writeFile(logs, outputs.join("\n"), { mode: 0o600 });
      console.log(message);
    }
    await check(process.execPath, ["scripts/detect-test.mjs"]);
  } else throw new Error(`No validation contract for ${spec.id}`);
  await check(process.execPath, [resolve(import.meta.dirname, "verify-managed-patches.mjs"), spec.id, candidate]);
}

export async function updateManagedGit({ agentDir, ids = managedGitSources.map(spec => spec.id), validate = validateManaged, log = console.log }) {
  const selected = managedGitSources.filter(spec => ids.includes(spec.id));
  if (!selected.length || ids.some(id => !selected.some(spec => spec.id === id))) throw new Error("Select pi-provider; SoL-Pi is maintained locally in vendor/sol-pi");
  const root = join(agentDir, "managed-updates");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const lock = join(root, ".lock");
  await mkdir(lock); // Exclusive advisory lock; never delete a pre-existing lock.
  const run = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  try {
    if (selected.some(spec => spec.id === "pi-provider")) await configureManagedGit(agentDir);
    const prepared = [];
    for (const spec of selected) {
      const workspace = join(root, run, spec.id);
      await mkdir(workspace, { recursive: true, mode: 0o700 });
      try {
        prepared.push(await prepareUpdate({ directory: checkoutPath(agentDir, spec), workspace, spec, validate, log }));
      } catch (error) {
        const failure = [error.message, error.stdout, error.stderr].filter(Boolean).join("\n");
        await writeFile(join(workspace, "failure.log"), failure, { mode: 0o600 });
        throw new Error(`${spec.id}: ${failure}\nNo checkout activated. Patch, candidate and logs retained: ${workspace}`, { cause: error });
      }
    }
    await activateUpdates(prepared, { log });
    return prepared;
  } finally { await rm(lock, { recursive: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: node scripts/update-managed-git.mjs [pi-provider]\nDefault: pi-provider. SoL-Pi is maintained locally in vendor/sol-pi. Stages upstream + local patches, validates, then activates with complete original backups.\nA failed merge/check does not activate either checkout. Reload Pi after success.");
  } else {
    try {
      await updateManagedGit({ agentDir: resolve(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent")), ...(args.length ? { ids: args } : {}) });
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
