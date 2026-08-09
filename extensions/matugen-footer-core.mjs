import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { join, isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function parseGitPorcelain(output) {
  const status = { dirty: false, conflicts: false, ahead: 0, behind: 0 };
  for (const line of String(output).split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      const match = line.match(/\[(?:ahead (\d+)(?:,? behind (\d+))?|behind (\d+)(?:,? ahead (\d+))?)\]/);
      if (match) {
        status.ahead = Number(match[1] ?? match[4] ?? 0);
        status.behind = Number(match[2] ?? match[3] ?? 0);
      }
      continue;
    }
    if (line.length < 2) continue;
    const state = line.slice(0, 2);
    if (/^(UU|AA|DD|AU|UA|DU|UD)$/.test(state)) status.conflicts = true;
    status.dirty = true;
  }
  return status;
}

function readText(path) {
  try {
    return readFileSync(path, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

export function detectGitOperation(paths) {
  if (paths.rebaseMerge || paths.rebaseApply) {
    const msgnum = paths.rebaseMsgnum && readText(paths.rebaseMsgnum);
    const end = paths.rebaseEnd && readText(paths.rebaseEnd);
    return {
      operation: "REBASING",
      operationLabel: msgnum && end ? `REBASING ${msgnum}/${end}` : "REBASING",
    };
  }
  if (paths.mergeHead) return { operation: "MERGING", operationLabel: "MERGING" };
  if (paths.cherryPickHead) return { operation: "CHERRY-PICKING", operationLabel: "CHERRY-PICKING" };
  if (paths.revertHead) return { operation: "REVERTING", operationLabel: "REVERTING" };
  if (paths.bisectLog) return { operation: "BISECTING", operationLabel: "BISECTING" };
  return {};
}

export async function readGitOperation(cwd) {
  async function gitPath(spec) {
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "--git-path", spec], { cwd, timeout: 2000 });
      const path = String(stdout).trim();
      return path ? (isAbsolute(path) ? path : resolve(cwd, path)) : undefined;
    } catch {
      return undefined;
    }
  }
  const [rebaseMerge, rebaseApply, mergeHead, cherryPickHead, revertHead, bisectLog] = await Promise.all([
    gitPath("rebase-merge"),
    gitPath("rebase-apply"),
    gitPath("MERGE_HEAD"),
    gitPath("CHERRY_PICK_HEAD"),
    gitPath("REVERT_HEAD"),
    gitPath("BISECT_LOG"),
  ]);
  const rebaseDir = [rebaseMerge, rebaseApply].find((path) => path && existsSync(path));
  return detectGitOperation({
    rebaseMerge: rebaseMerge && existsSync(rebaseMerge) ? rebaseMerge : undefined,
    rebaseApply: rebaseApply && existsSync(rebaseApply) ? rebaseApply : undefined,
    mergeHead: mergeHead && existsSync(mergeHead) ? mergeHead : undefined,
    cherryPickHead: cherryPickHead && existsSync(cherryPickHead) ? cherryPickHead : undefined,
    revertHead: revertHead && existsSync(revertHead) ? revertHead : undefined,
    bisectLog: bisectLog && existsSync(bisectLog) ? bisectLog : undefined,
    rebaseMsgnum: rebaseDir ? join(rebaseDir, "msgnum") : undefined,
    rebaseEnd: rebaseDir ? join(rebaseDir, "end") : undefined,
  });
}

export class ProjectRefreshScheduler {
  generation = 0;
  inFlight = null;
  pending = false;
  lastStarted = 0;
  delayTimer = null;
  stopped = false;
  constructor(throttleMs, read, apply) {
    this.throttleMs = throttleMs;
    this.read = read;
    this.apply = apply;
  }
  request() {
    if (this.stopped) return;
    this.pending = true;
    if (this.inFlight) return;
    const delay = Math.max(0, this.throttleMs - (Date.now() - this.lastStarted));
    if (delay > 0) {
      if (this.delayTimer) return;
      this.delayTimer = setTimeout(() => {
        this.delayTimer = null;
        this.request();
      }, delay);
      this.delayTimer.unref?.();
      return;
    }
    this.pending = false;
    const generation = ++this.generation;
    this.lastStarted = Date.now();
    this.inFlight = Promise.resolve(this.read(generation))
      .then((value) => {
        if (value !== undefined && !this.stopped && generation === this.generation) this.apply(value, generation);
      })
      .finally(() => {
        this.inFlight = null;
        if (this.pending) this.request();
      });
  }
  stop() {
    this.stopped = true;
    this.generation += 1;
    this.pending = false;
    if (this.delayTimer) clearTimeout(this.delayTimer);
    this.delayTimer = null;
  }
}

export class LiveContextController {
  value;
  timer = null;
  stopped = false;
  constructor(refresh) {
    this.refresh = refresh;
  }
  update(value) {
    if (this.stopped) return;
    this.value = value;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.stopped) this.refresh();
    }, 250);
    this.timer.unref?.();
  }
  get() {
    return this.value;
  }
  clear() {
    this.value = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.refresh();
  }
  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.value = undefined;
  }
}

