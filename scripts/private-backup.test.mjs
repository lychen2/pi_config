import assert from "node:assert/strict";
import { chmod, lstat, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPrivateBackup } from "./private-backup.mjs";

if (process.platform !== "win32") {
  const root = await mkdtemp(path.join(os.tmpdir(), "pi-private-backup-test-"));
  const originalUmask = process.umask(0);
  try {
    const source = path.join(root, "source");
    const target = path.join(root, "backup");
    await mkdir(path.join(source, "nested"), { recursive: true, mode: 0o777 });
    await writeFile(path.join(source, "nested", "auth.json"), "fixture-token-only", { mode: 0o666 });
    await chmod(source, 0o777);
    await chmod(path.join(source, "nested"), 0o777);
    await chmod(path.join(source, "nested", "auth.json"), 0o666);

    let backupModeDuringCopy;
    await createPrivateBackup({
      source,
      target,
      copy: async (...args) => {
        backupModeDuringCopy = (await lstat(target)).mode & 0o777;
        const { cp } = await import("node:fs/promises");
        await cp(...args);
      },
    });
    assert.equal(backupModeDuringCopy, 0o700, "backup directory must be private before copy starts");
    assert.equal((await lstat(target)).mode & 0o777, 0o700);
    assert.equal((await lstat(path.join(target, "agent"))).mode & 0o777, 0o700);
    assert.equal((await lstat(path.join(target, "agent", "nested"))).mode & 0o777, 0o700);
    assert.equal((await lstat(path.join(target, "agent", "nested", "auth.json"))).mode & 0o777, 0o600);
    assert.equal(await readFile(path.join(target, "agent", "nested", "auth.json"), "utf8"), "fixture-token-only");

    const failedTarget = path.join(root, "failed-backup");
    await assert.rejects(createPrivateBackup({
      source,
      target: failedTarget,
      copy: async (_source, destination) => {
        await mkdir(path.join(destination, "nested"), { recursive: true });
        await writeFile(path.join(destination, "nested", "partial.json"), "fixture-only", { mode: 0o666 });
        throw new Error("injected copy failure");
      },
    }), /injected copy failure/);
    assert.equal((await lstat(failedTarget)).mode & 0o777, 0o700);
    assert.equal((await lstat(path.join(failedTarget, "agent"))).mode & 0o777, 0o700);
    assert.equal((await lstat(path.join(failedTarget, "agent", "nested"))).mode & 0o777, 0o700);
    assert.equal((await lstat(path.join(failedTarget, "agent", "nested", "partial.json"))).mode & 0o777, 0o600);
  } finally {
    process.umask(originalUmask);
    await rm(root, { recursive: true, force: true });
  }
}

console.log("private backup permission and failure-path tests passed");
