import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, rename, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command, prepareUpdate, activateUpdates, snapshot, validateManaged } from "./update-managed-git.mjs";
import { configureManagedGit, managedPackages, restoreManagedPatch } from "./configure-managed-git.mjs";

const spec = { id: "fixture", branch: "main" };
const git = (cwd, args) => command(cwd, "git", args);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "safe-git-update-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const upstream = join(root, "upstream");
  const live = join(root, "live");
  await mkdir(upstream);
  await git(upstream, ["init", "-b", "main"]);
  await git(upstream, ["config", "user.name", "Test"]);
  await git(upstream, ["config", "user.email", "test@example.invalid"]);
  await writeFile(join(upstream, "local.txt"), "base\n");
  await writeFile(join(upstream, "upstream.txt"), "old\n");
  await writeFile(join(upstream, ".gitignore"), "private-cache\nnode_modules/\n");
  await git(upstream, ["add", "."]);
  await git(upstream, ["commit", "-m", "base"]);
  await git(root, ["clone", upstream, live]);
  await writeFile(join(live, "local.txt"), "patched\n");
  await git(live, ["add", "local.txt"]);
  await writeFile(join(live, "untracked.txt"), "extra\n");
  await writeFile(join(live, "private-cache"), "ignored data\n");
  await mkdir(join(live, "node_modules"));
  await writeFile(join(live, "node_modules", "old-dep"), "old dependency\n");
  return { root, upstream, live };
}
const prepare = (f, validate = async () => {}) => prepareUpdate({ directory: f.live, workspace: join(f.root, "run"), spec, remote: f.upstream, validate, log() {} });
async function advance(f, path = "upstream.txt", content = "new\n") {
  await writeFile(join(f.upstream, path), content);
  await git(f.upstream, ["add", "."]);
  await git(f.upstream, ["commit", "-m", "upstream change"]);
}

test("managed patch restores a fresh checkout and preserves an already patched installation", async t => {
  const f = await fixture(t);
  const patchPath = join(f.root, "runtime.patch");
  await writeFile(patchPath, await git(f.live, ["diff", "HEAD", "--", "local.txt"]));
  const fresh = join(f.root, "fresh");
  await git(f.root, ["clone", f.upstream, fresh]);
  restoreManagedPatch(fresh, patchPath, { dryRun: true });
  assert.equal(await readFile(join(fresh, "local.txt"), "utf8"), "base\n");
  restoreManagedPatch(fresh, patchPath);
  assert.equal(await readFile(join(fresh, "local.txt"), "utf8"), "patched\n");
  restoreManagedPatch(fresh, patchPath);
  assert.equal(await readFile(join(fresh, "local.txt"), "utf8"), "patched\n");
  await writeFile(join(fresh, "local.txt"), "incompatible user change\n");
  assert.throws(() => restoreManagedPatch(fresh, patchPath), /Cannot restore managed patch/);
  assert.equal(await readFile(join(fresh, "local.txt"), "utf8"), "incompatible user change\n");
});

test("stage and activate preserve staged patches, ignored/untracked files and original dependencies", async t => {
  const f = await fixture(t);
  const before = await snapshot(f.live);
  await advance(f);
  const entry = await prepare(f, async candidate => {
    assert.equal(await readFile(join(candidate, "local.txt"), "utf8"), "patched\n");
    assert.equal(await readFile(join(candidate, "upstream.txt"), "utf8"), "new\n");
  });
  assert.equal((await snapshot(f.live)).digest, before.digest);
  await activateUpdates([entry], { log() {} });
  assert.equal(await readFile(join(f.live, "upstream.txt"), "utf8"), "new\n");
  assert.equal(await readFile(join(f.live, "untracked.txt"), "utf8"), "extra\n");
  assert.equal(await readFile(join(f.live, "private-cache"), "utf8"), "ignored data\n");
  assert.match(await git(f.live, ["diff", "HEAD"]), /patched/);
  assert.equal(await readFile(join(entry.workspace, "previous-checkout/node_modules/old-dep"), "utf8"), "old dependency\n");
  assert.ok((await readFile(join(entry.workspace, "local.patch"), "utf8")).includes("patched"));
  assert.ok((await readFile(join(entry.workspace, "rebased.patch"), "utf8")).includes("patched"));
  assert.equal((await snapshot(join(entry.workspace, "previous-checkout"))).digest, before.digest);
});

test("three-way conflict retains the live checkout and patch archive", async t => {
  const f = await fixture(t);
  const before = await snapshot(f.live);
  await advance(f, "local.txt", "upstream conflicting edit\n");
  await assert.rejects(prepare(f), /git apply/);
  assert.equal((await snapshot(f.live)).digest, before.digest);
  assert.match(await readFile(join(f.root, "run/local.patch"), "utf8"), /patched/);
});

test("validation failure leaves the live checkout intact", async t => {
  const f = await fixture(t);
  const before = await snapshot(f.live);
  await advance(f);
  await assert.rejects(prepare(f, async () => { throw new Error("fixture check failed"); }), /fixture check failed/);
  assert.equal((await snapshot(f.live)).digest, before.digest);
});

test("edits made during validation prevent activation", async t => {
  const f = await fixture(t);
  await advance(f);
  await assert.rejects(prepare(f, async () => { await writeFile(join(f.live, "local.txt"), "new user edit\n"); }), /changed during validation/);
  assert.equal(await readFile(join(f.live, "local.txt"), "utf8"), "new user edit\n");
});

test("upstream collision with an ignored local file stops before switching", async t => {
  const f = await fixture(t);
  await writeFile(join(f.upstream, "private-cache"), "upstream version\n");
  await git(f.upstream, ["add", "-f", "private-cache"]);
  await git(f.upstream, ["commit", "-m", "collision"]);
  await assert.rejects(prepare(f), /collides with upstream/);
  assert.equal(await readFile(join(f.live, "private-cache"), "utf8"), "ignored data\n");
});

test("switch failure rolls back already switched checkouts", async t => {
  const a = await fixture(t);
  const b = await fixture(t);
  await advance(a);
  await advance(b);
  const entries = [await prepare(a), await prepare(b)];
  const before = await Promise.all(entries.map(entry => snapshot(entry.directory)));
  await assert.rejects(activateUpdates(entries, {
    log() {},
    move: (from, to) => from === entries[1].candidate ? Promise.reject(new Error("switch denied")) : rename(from, to),
  }), /switch denied/);
  for (let i = 0; i < entries.length; i++) assert.equal((await snapshot(entries[i].directory)).digest, before[i].digest);
});

test("repeat updates retain patches against the latest upstream", async t => {
  const f = await fixture(t);
  await advance(f);
  await activateUpdates([await prepare(f)], { log() {} });
  await advance(f, "upstream.txt", "newer\n");
  const next = await prepareUpdate({ directory: f.live, workspace: join(f.root, "next"), spec, remote: f.upstream, validate: async () => {}, log() {} });
  await activateUpdates([next], { log() {} });
  assert.equal(await readFile(join(f.live, "local.txt"), "utf8"), "patched\n");
  assert.equal(await readFile(join(f.live, "upstream.txt"), "utf8"), "newer\n");
});

test("provider validation blocks TypeScript diagnostics added by a local patch", async t => {
  const f = await fixture(t);
  await mkdir(join(f.upstream, "extensions/provider"), { recursive: true });
  const source = 'type SelfCheckMode = "quick" | "full";\ninterface BgSelfCheckOpts { mode?: SelfCheckMode; }\nconst value: number = 1;\n';
  await writeFile(join(f.upstream, "extensions/provider/index.ts"), source);
  await git(f.upstream, ["add", "."]);
  await git(f.upstream, ["commit", "-m", "provider contract"]);
  await git(f.live, ["fetch", "origin", "main"]);
  await git(f.live, ["checkout", "origin/main", "--", "extensions/provider/index.ts"]);
  await git(f.live, ["reset", "--mixed", "origin/main"]);
  await writeFile(join(f.live, "extensions/provider/index.ts"), source.replace("= 1", '= "wrong"'));
  const before = await snapshot(f.live);
  await assert.rejects(prepareUpdate({
    directory: f.live, workspace: join(f.root, "typecheck"), spec: { id: "pi-provider", branch: "main" },
    remote: f.upstream, validate: validateManaged, log() {},
  }), /introduces new TypeScript diagnostics/);
  assert.equal((await snapshot(f.live)).digest, before.digest);
});

test("failed fetch does not change the original", async t => {
  const f = await fixture(t);
  const before = await snapshot(f.live);
  await assert.rejects(prepareUpdate({ directory: f.live, workspace: join(f.root, "bad"), spec, remote: join(f.root, "missing"), validate: async () => {}, log() {} }));
  assert.equal((await snapshot(f.live)).digest, before.digest);
});

test("managed registrations preserve filters and leave unrelated packages unchanged", () => {
  const agent = "/tmp/test-agent";
  const source = "git:github.com/BevalZ/pi-provider";
  const converted = managedPackages(["npm:other", { source, extensions: ["extensions/provider"] }], agent);
  assert.deepEqual(converted, ["npm:other", { source: join(agent, "git/github.com/BevalZ/pi-provider"), extensions: ["extensions/provider"] }]);
  assert.deepEqual(managedPackages(converted, agent), converted);
  assert.throws(() => managedPackages([source, source], agent), /Duplicate/);
  assert.throws(() => managedPackages(["git:github.com/NVlabs/SoL-Pi"], agent), /Standalone/);
});

test("registration writes a backup, preserves unrelated settings, and is idempotent", async t => {
  const agent = await mkdtemp(join(tmpdir(), "managed-settings-"));
  t.after(() => rm(agent, { recursive: true, force: true }));
  const original = JSON.stringify({ theme: "existing", packages: ["git:github.com/BevalZ/pi-provider"] });
  await writeFile(join(agent, "settings.json"), original);
  await configureManagedGit(agent);
  const after = JSON.parse(await readFile(join(agent, "settings.json"), "utf8"));
  assert.equal(after.theme, "existing");
  assert.equal(after.packages[0], join(agent, "git/github.com/BevalZ/pi-provider"));
  await configureManagedGit(agent);
  assert.equal(JSON.parse(await readFile(join(agent, "settings.json"), "utf8")).packages.length, 1);
  const backups = (await readdir(agent)).filter(name => name.startsWith("settings.json.pre-managed-git-"));
  assert.equal(backups.length, 1);
  assert.equal(await readFile(join(agent, backups[0]), "utf8"), original);
});
