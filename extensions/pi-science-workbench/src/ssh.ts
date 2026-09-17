import { spawn } from "node:child_process";
import { readFile, open, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { environment, type Config, type Profile } from "./config.ts";
import { Store, safe, sha, type Manifest, type Spec } from "./store.ts";
import { workerPath, workerDigest } from "./runtime.ts";

const helperPath=fileURLToPath(new URL("../python/science_workbench/remote_helper.py",import.meta.url));
export function shellQuote(s:string){if(/[\x00-\x1f]/.test(s))throw new Error("unsafe_remote_argument");return `'${s.replaceAll("'","'\\''")}'`;}
export async function remote(profile:Profile,request:any,signal?:AbortSignal):Promise<any>{
  const helper=(await readFile(helperPath)).toString("base64");
  const command=`${shellQuote(profile.python)} -I -B -c ${shellQuote(`import base64;exec(compile(base64.b64decode('${helper}'),'<science-helper>','exec'))`)}`;
  const data=JSON.stringify({...request,root:profile.remoteRunRoot});if(Buffer.byteLength(data)>4*1024*1024)throw new Error("ssh_request_too_large");
  if(signal?.aborted)throw new Error("cancelled");
  return new Promise((resolve,reject)=>{
    const child=spawn("ssh",["-o","BatchMode=yes","-o","StrictHostKeyChecking=yes","-o","ForwardAgent=no","-o","ClearAllForwardings=yes","-o","ConnectTimeout=10","--",profile.sshAlias!,command],{stdio:["pipe","pipe","pipe"]});
    let output=Buffer.alloc(0),error="";const abort=()=>child.kill("SIGTERM");const timer=setTimeout(abort,30000);signal?.addEventListener("abort",abort,{once:true});
    child.stdout.on("data",(chunk:Buffer)=>{output=Buffer.concat([output,chunk]);if(output.length>2*1024*1024)abort();});
    child.stderr.on("data",(chunk:Buffer)=>{error=(error+chunk.toString()).slice(-2048);});
    const clean=()=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);};
    child.on("error",e=>{clean();reject(e);});child.stdin.on("error",()=>{});
    child.on("close",code=>{clean();try{const value=JSON.parse(output.toString());if(code!==0||value.error)throw new Error(`ssh_failed: ${value.error??error}`);resolve(value);}catch(e){reject(new Error(`ssh_unconfirmed: ${String(e)} ${error}`));}});
    child.stdin.end(data);
  });
}
export async function submitRemote(c:Config,p:Profile,store:Store,m:Manifest,spec:Spec,generation:number,signal?:AbortSignal){
  const inputs=[];let total=0;
  for(const item of m.inputs??[]){
    const file=await safe(c.root,`.science/runs/${m.run_id}/${item.path}`);total+=item.size_bytes;if(total>c.limits.maxTransferBytesPerRun)throw new Error("ssh_stage_limit_exceeded");
    const fd=await open(file,"r");try{let offset=0;do{const buffer=Buffer.alloc(Math.min(256*1024,item.size_bytes-offset));const {bytesRead}=await fd.read(buffer,0,buffer.length,offset);if(!bytesRead&&offset<item.size_bytes)throw new Error("input_changed_during_stage");const reply=await remote(p,{action:"stage",run_id:m.run_id,path:item.path,data:buffer.subarray(0,bytesRead).toString("base64"),offset,size:item.size_bytes,max_transfer_bytes:c.limits.maxTransferBytesPerRun},signal);if(reply.next_offset!==offset+bytesRead)throw new Error("invalid_stage_reply");offset+=bytesRead;}while(offset<item.size_bytes);}finally{await fd.close();}
    inputs.push(item);
  }
  const result=await remote(p,{action:"submit",run_id:m.run_id,worker:(await readFile(workerPath)).toString("base64"),worker_digest:await workerDigest(),inputs,max_transfer_bytes:c.limits.maxTransferBytesPerRun,spec:{protocol_version:1,request_id:m.request_id,generation,executable:spec.executable,argv:spec.argv,environment:environment(p),timeout_seconds:spec.timeout_seconds??c.limits.jobTimeoutSeconds,max_log_bytes:c.limits.maxLogBytesPerRun}},signal);
  m.remote_identity={ssh_alias:p.sshAlias,run_id:m.run_id};m.execution_status=result.status==="submitted"?"running":"unknown";await store.save(m);return m;
}
export async function remoteOperation(c:Config,p:Profile,store:Store,m:Manifest,action:string,signal?:AbortSignal){
  if(action==="poll"||action==="cancel"){
    try{const result=await remote(p,{action,run_id:m.run_id},signal);Object.assign(m,result);}
    catch(e){if(["pending","running","unknown"].includes(m.execution_status)){m.last_known_execution_status=m.execution_status;m.execution_status="unknown";}m.observation_error=String(e);}
    await store.save(m);return m;
  }
  if(action!=="harvest")throw new Error("invalid_remote_action");
  if(m.execution_status!=="succeeded")throw new Error("poll_success_before_harvest");
  const spec=await store.spec(m.run_id);let total=0;
  const names=[...(spec.expected_outputs??[]).map(o=>`artifacts/${o.path}`),"logs/stdout.log","logs/stderr.log"];
  for(const name of names){
    const file=await safe(c.root,`.science/runs/${m.run_id}/${name}`,true);const temp=`${file}.${randomUUID()}.tmp`;let offset=0,expectedHash:string|undefined;const fd=await open(temp,"wx",0o600);let missing=false;
    try{while(true){const result=await remote(p,{action:"read",run_id:m.run_id,path:name,offset},signal);if(result.missing){missing=true;break;}const output=spec.expected_outputs?.find(o=>`artifacts/${o.path}`===name);const limit=output?.max_bytes??c.limits.maxLogBytesPerRun;if(result.size>limit||total+result.size-offset>c.limits.maxTransferBytesPerRun)throw new Error("transfer_limit_exceeded");if(expectedHash&&expectedHash!==result.sha256)throw new Error("remote_artifact_changed");expectedHash=result.sha256;const bytes=Buffer.from(result.data,"base64");if(result.next_offset!==offset+bytes.length||(!bytes.length&&offset<result.size))throw new Error("invalid_transfer_chunk");await fd.write(bytes);offset+=bytes.length;total+=bytes.length;if(offset===result.size)break;}}
    finally{await fd.close();}
    if(missing){const {unlink}=await import("node:fs/promises");await unlink(temp);continue;}
    if(await sha(temp)!==expectedHash)throw new Error("transfer_hash_mismatch");await rename(temp,file);
  }
  await store.integrity(m,spec);return m;
}
