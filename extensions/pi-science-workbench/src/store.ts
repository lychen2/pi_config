import { constants, createReadStream } from "node:fs";
import { open, mkdir, lstat, readFile, rename, readdir, copyFile, chmod, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { hash } from "./config.ts";

export interface Output { path: string; required: boolean; format: "json" | "csv" | "npy" | "binary"; max_bytes: number }
export interface Check { id: "json" | "csv" | "array" | "slit"; parameters: Record<string,any> }
export interface Spec { action: string; request_id: string; profile: string; code?: string; executable?: string; argv?: string[]; inputs?: { source: string; path: string }[]; expected_outputs?: Output[]; required_validations?: Check[]; timeout_seconds?: number; [key: string]: unknown }
export interface Manifest { schema_version: 1; run_id: string; request_id: string; profile_id: string; profile_digest: string; session_id: string; origin_entry_id: string | null; execution_status: string; artifact_status: string; validation_status: string; completion_status: string; last_observed_at: string; artifacts: any[]; [key: string]: any }
const idPattern = /^[a-zA-Z0-9_-]{1,128}$/;
export function validId(value: string) { if (typeof value!=="string" || !idPattern.test(value)) throw new Error("invalid_id"); return value; }
export function relative(value: string) { if (typeof value!=="string" || !value || path.isAbsolute(value) || value.split("/").some(x=>!x || x==="." || x==="..") || /[\\\x00-\x1f]/.test(value)) throw new Error("unsafe_path"); return value; }
export async function safe(root: string, name: string, parents=false): Promise<string> {
  relative(name); let current = root;
  const rootStat = await lstat(root).catch((e: any)=>{ if(e.code!=="ENOENT") throw e; return null; });
  if (rootStat?.isSymbolicLink()) throw new Error("symlink_rejected");
  const parts=name.split("/");
  for (let i=0;i<parts.length;i++) {
    current=path.join(current,parts[i]);
    const st=await lstat(current).catch((e: any)=>{ if(e.code!=="ENOENT") throw e; return null; });
    if (st?.isSymbolicLink()) throw new Error("symlink_rejected");
    if (i<parts.length-1 && st && !st.isDirectory()) throw new Error("directory_required");
    if (parents && i<parts.length-1 && !st) await mkdir(current,{mode:0o700});
  }
  return current;
}
export async function atomic(file: string, value: unknown) {
  const temp = `${file}.${randomUUID()}.tmp`; const fd=await open(temp,"wx",0o600);
  try { await fd.writeFile(JSON.stringify(value,null,2)+"\n"); await fd.sync(); } finally { await fd.close(); }
  await rename(temp,file);
}
export async function sha(file: string) { const h=createHash("sha256"); for await(const chunk of createReadStream(file)) h.update(chunk); return h.digest("hex"); }
export function completion(m: Manifest) {
  if (["failed","timed_out","cancelled"].includes(m.execution_status) || ["incomplete","invalid"].includes(m.artifact_status) || m.validation_status==="failed") return "rejected";
  if (m.execution_status==="succeeded" && m.artifact_status==="complete" && m.validation_status==="passed") return "verified";
  if (["pending","running"].includes(m.execution_status)) return "pending";
  return "unverified";
}
export class Store {
  root: string;
  readonly project: string;
  constructor(project: string) { this.project=project; this.root=path.join(project,".science"); }
  async initialize() { await safe(this.project,".science/requests/placeholder",true); await safe(this.project,".science/runs/placeholder",true); }
  async directory(id: string) { return safe(this.project,`.science/runs/${validId(id)}`); }
  async read(id: string): Promise<Manifest> {
    const file=await safe(this.project,`.science/runs/${validId(id)}/manifest.json`);
    const st=await lstat(file); if (!st.isFile() || st.size>2*1024*1024) throw new Error("invalid_manifest");
    const m=JSON.parse(await readFile(file,"utf8"));
    if (m.schema_version!==1 || m.run_id!==id || !Array.isArray(m.artifacts)) throw new Error("invalid_manifest");
    return m;
  }
  async spec(id: string): Promise<Spec> { return JSON.parse(await readFile(await safe(this.project,`.science/runs/${validId(id)}/spec.json`),"utf8")); }
  async list(): Promise<Manifest[]> {
    const root=await safe(this.project,".science/runs");
    const ids=await readdir(root).catch((e: any)=>{ if(e.code==="ENOENT") return []; throw e; });
    return Promise.all(ids.filter(x=>idPattern.test(x)).map(x=>this.read(x)));
  }
  async reserve(spec: Spec, profileDigest: string, session: string, entry: string|null): Promise<{ manifest: Manifest; fresh: boolean }> {
    validId(spec.request_id); await this.initialize();
    const key=hash([spec.action,spec.profile,spec.request_id]);
    const file=await safe(this.project,`.science/requests/${key}.json`);
    const digest=hash(spec); const runId=randomUUID();
    let fd;
    try { fd=await open(file,"wx",0o600); }
    catch(e: any) {
      if(e.code!=="EEXIST") throw e;
      let record; try { record=JSON.parse(await readFile(file,"utf8")); } catch { throw new Error("request_recovery_required"); }
      if(record.digest!==digest || record.profile_digest!==profileDigest) throw new Error("idempotency_conflict");
      try { return {manifest:await this.read(record.run_id),fresh:false}; } catch { throw new Error(`request_recovery_required: ${record.run_id}`); }
    }
    try { await fd.writeFile(JSON.stringify({digest,profile_digest:profileDigest,run_id:runId})); await fd.sync(); } finally { await fd.close(); }
    const dir=await this.directory(runId); await mkdir(dir,{mode:0o700});
    for(const name of ["inputs","logs","code","artifacts","validations"]) await mkdir(path.join(dir,name),{mode:0o700});
    await atomic(path.join(dir,"spec.json"),spec);
    const m: Manifest={schema_version:1,run_id:runId,request_id:spec.request_id,profile_id:spec.profile,profile_digest:profileDigest,session_id:session,origin_entry_id:entry,project_realpath:this.project,execution_status:"pending",artifact_status:"not_checked",validation_status:"not_checked",completion_status:"pending",last_observed_at:new Date().toISOString(),artifacts:[]};
    await this.save(m);
    return {manifest:m,fresh:true};
  }
  async lock(id:string):Promise<()=>Promise<void>> {
    const file=await safe(this.project,`.science/runs/${validId(id)}/operation.lock`);
    const fd=await open(file,"wx",0o600).catch((e:any)=>{if(e.code==="EEXIST")throw new Error("run_locked_or_recovery_required");throw e;});
    await fd.writeFile(JSON.stringify({pid:process.pid,created_at:new Date().toISOString()}));await fd.close();
    return async()=>{await unlink(file);};
  }
  async save(m: Manifest) {
    m.last_observed_at=new Date().toISOString(); m.completion_status=completion(m);
    const file=await safe(this.project,`.science/runs/${validId(m.run_id)}/manifest.json`);
    await atomic(file,m);
    const eventFile=await safe(this.project,`.science/runs/${m.run_id}/events.jsonl`);
    const fd=await open(eventFile,constants.O_WRONLY|constants.O_CREAT|constants.O_APPEND|constants.O_NOFOLLOW,0o600);
    try { await fd.writeFile(JSON.stringify({at:m.last_observed_at,execution_status:m.execution_status,artifact_status:m.artifact_status,validation_status:m.validation_status})+"\n"); } finally { await fd.close(); }
  }
  async stage(m: Manifest,spec: Spec,maxBytes: number) {
    const names=new Set<string>(); let bytes=0; const inputs=[];
    for(const input of spec.inputs??[]) {
      relative(input.path); if(names.has(input.path)) throw new Error("duplicate_input"); names.add(input.path);
      const src=await safe(this.project,input.source); const st=await lstat(src);
      if(!st.isFile()) throw new Error("regular_input_required"); bytes+=st.size; if(bytes>maxBytes) throw new Error("input_limit_exceeded");
      const dest=await safe(this.project,`.science/runs/${m.run_id}/inputs/${input.path}`,true);
      await copyFile(src,dest,constants.COPYFILE_EXCL); await chmod(dest,0o600);
      inputs.push({path:`inputs/${input.path}`,size_bytes:st.size,sha256:await sha(dest)});
    }
    m.inputs=inputs;
    if(spec.code!==undefined) { const file=await safe(this.project,`.science/runs/${m.run_id}/code/cell.py`); const fd=await open(file,"wx",0o600); try { await fd.writeFile(spec.code); } finally { await fd.close(); } m.code={path:"code/cell.py",sha256:await sha(file)}; }
    await this.save(m);
  }
  async integrity(m: Manifest,spec: Spec) {
    const records=[]; let status="complete";
    for(const output of spec.expected_outputs??[]) {
      try {
        const file=await safe(this.project,`.science/runs/${m.run_id}/artifacts/${relative(output.path)}`);
        const st=await lstat(file); if(!st.isFile() || st.size>output.max_bytes) throw new Error("invalid_output");
        records.push({artifact_id:hash([m.run_id,output.path]),relative_path:`artifacts/${output.path}`,format:output.format,size_bytes:st.size,sha256:await sha(file),location:"local",hash_source:"local",verification_state:"verified"});
      } catch(e: any) {
        if(e.code==="ENOENT") { if(output.required && status!=="invalid") status="incomplete"; records.push({relative_path:`artifacts/${output.path}`,verification_state:output.required?"missing":"optional_absent"}); }
        else { status="invalid"; records.push({relative_path:`artifacts/${output.path}`,verification_state:"invalid",reason:String(e)}); }
      }
    }
    if(hash(m.artifacts)!==hash(records))m.validation_status="not_checked";
    m.artifacts=records; m.artifact_status=status;
    if(status!=="complete") m.termination_reason="outputs_unverified";
    await this.save(m);
  }
}
