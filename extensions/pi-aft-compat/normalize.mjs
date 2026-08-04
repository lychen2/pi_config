import { spawnSync } from "node:child_process";

export function isGitWorktree(cwd) {
  const result = spawnSync("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 && result.stdout.trim() === "true";
}
