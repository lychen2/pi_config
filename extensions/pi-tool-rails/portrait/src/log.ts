import { appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const LOG_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "debug.log");

let debugEnabled = false;

export function setDebug(enabled: boolean) {
  debugEnabled = enabled;
}

export function log(msg: string) {
  if (!debugEnabled) return;
  appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
}
