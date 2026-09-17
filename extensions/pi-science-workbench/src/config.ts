import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export interface Profile { transport: "local" | "ssh"; python: string; executionTrust: "trusted-host"; environmentAllowlist: string[]; sshAlias?: string; remoteRunRoot?: string }
export interface Config { schemaVersion: 1; defaultProfile: string; profiles: Record<string, Profile>; limits: typeof defaults; root: string; digest: string }
export const defaults = { kernelCellTimeoutSeconds: 120, jobTimeoutSeconds: 3600, maxLocalJobs: 1, maxRemoteJobsPerHost: 1, maxSubmissionsPerGrant: 5, maxToolResultBytes: 16384, maxLogBytesPerRun: 67108864, maxTransferBytesPerRun: 536870912 };
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function hash(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }
export function object(value: unknown): asserts value is Record<string, any> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_object"); }
export function keys(value: Record<string, unknown>, allowed: string[]) { for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`unknown_field: ${key}`); }
function merge(a: any, b: any): any {
  if (!a || !b || Array.isArray(a) || Array.isArray(b) || typeof a !== "object" || typeof b !== "object") return b;
  const result = { ...a };
  for (const [key, value] of Object.entries(b)) { if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("unsafe_key"); result[key] = key in a ? merge(a[key],value) : value; }
  return result;
}
async function optional(file: string) { try { return JSON.parse(await readFile(file,"utf8")); } catch(error: any) { if (error.code === "ENOENT") return undefined; throw error; } }
export async function loadConfig(cwd: string): Promise<Config> {
  const root = await realpath(cwd);
  const base = await optional(path.join(root,".pi/science-workbench.json"));
  if (!base) throw new Error("configuration_required: .pi/science-workbench.json");
  const raw = merge(base, await optional(path.join(root,".pi/science-workbench.local.json")) ?? {});
  object(raw); keys(raw,["schemaVersion","defaultProfile","profiles","limits"]);
  if (raw.schemaVersion !== 1) throw new Error("unsupported_schema_version");
  object(raw.profiles);
  if (!Object.keys(raw.profiles).length) throw new Error("profiles_required");
  for (const [name, profile] of Object.entries(raw.profiles)) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) throw new Error("invalid_profile_id");
    object(profile); keys(profile,["transport","python","executionTrust","environmentAllowlist","sshAlias","remoteRunRoot"]);
    if (!["local","ssh"].includes(profile.transport) || profile.executionTrust !== "trusted-host") throw new Error("unsupported_execution_profile");
    if (typeof profile.python !== "string" || !path.isAbsolute(profile.python) || /[\x00-\x1f]/.test(profile.python)) throw new Error("absolute_python_required");
    if (!Array.isArray(profile.environmentAllowlist) || profile.environmentAllowlist.some((x: unknown)=>typeof x!=="string" || !/^[A-Z_][A-Z0-9_]*$/.test(x))) throw new Error("invalid_environment_allowlist");
    if (profile.environmentAllowlist.some((x: string)=>/TOKEN|SECRET|PASSWORD|PRIVATE|API_KEY|PYTHONPATH|PYTHONSTARTUP|LD_PRELOAD|NODE_OPTIONS/i.test(x))) throw new Error("sensitive_environment_rejected");
    if (profile.transport === "ssh") {
      if (typeof profile.sshAlias!=="string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(profile.sshAlias)) throw new Error("invalid_ssh_alias");
      if (typeof profile.remoteRunRoot!=="string" || !path.posix.isAbsolute(profile.remoteRunRoot) || /[\x00-\x1f]/.test(profile.remoteRunRoot) || profile.remoteRunRoot==="/") throw new Error("invalid_remote_root");
    } else if (profile.sshAlias || profile.remoteRunRoot) throw new Error("local_profile_has_remote_fields");
  }
  if (typeof raw.defaultProfile!=="string" || !Object.hasOwn(raw.profiles,raw.defaultProfile)) throw new Error("invalid_default_profile");
  const limits = { ...defaults, ...(raw.limits ?? {}) };
  if (raw.limits !== undefined) { object(raw.limits); keys(raw.limits,Object.keys(defaults)); }
  for (const value of Object.values(limits)) if (typeof value!=="number" || !Number.isSafeInteger(value) || value<1) throw new Error("invalid_limit");
  if (limits.maxToolResultBytes < 1024 || limits.maxToolResultBytes > 65536) throw new Error("invalid_tool_result_limit");
  return { ...raw, limits, root, digest: hash({ ...raw, limits, root }) } as Config;
}
export function environment(profile: Profile): Record<string,string> {
  const result: Record<string,string> = { PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", PYTHONDONTWRITEBYTECODE: "1" };
  for (const name of profile.environmentAllowlist) if (process.env[name] !== undefined) result[name] = process.env[name]!;
  return result;
}
