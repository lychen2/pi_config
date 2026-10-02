import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const installer = path.join(repoRoot, "install.ps1");

test("Windows archive updater stages and preserves a rollback copy", async () => {
  const source = await readFile(installer, "utf8");
  assert.match(source, /\.pc-stage-/);
  assert.match(source, /Switch-Repository -Source \$source\.FullName -Destination \$Destination/);
  assert.match(source, /Previous repository preserved at \$backup/);
  assert.match(source, /Move-Item -Path \$backup -Destination \$Destination/);
  assert.match(source, /TestArchiveUpdate/);
});

test("Windows archive replacement removes stale files and restores a failed switch", {
  skip: process.platform !== "win32" ? "Requires Windows PowerShell; static checks do not verify switching behavior" : false,
}, () => {
  const shell = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", installer, "-TestArchiveUpdate"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(shell.status, 0, `PowerShell archive regression failed:\n${shell.stdout}\n${shell.stderr}`);
  assert.match(shell.stdout, /Windows archive update regression tests passed/);
});
