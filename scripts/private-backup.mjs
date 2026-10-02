import { access, chmod, cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function secureTree(root) {
  if (!(await exists(root))) return;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await secureTree(target);
      await chmod(target, 0o700);
    } else if (entry.isFile()) {
      await chmod(target, 0o600);
    }
  }
  await chmod(root, 0o700);
}

export async function createPrivateBackup({ source, target, copy = cp, platform = process.platform }) {
  await mkdir(target, { recursive: true, mode: 0o700 });
  if (platform !== "win32") await chmod(target, 0o700);
  const agentTarget = path.join(target, "agent");
  try {
    await copy(source, agentTarget, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  } finally {
    if (platform !== "win32") await secureTree(agentTarget);
  }
  return target;
}
