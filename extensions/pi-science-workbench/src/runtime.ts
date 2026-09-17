import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { environment, type Profile } from "./config.ts";

export const workerPath = fileURLToPath(new URL("../python/science_workbench/worker.py",import.meta.url));
const MAX = 2*1024*1024;
export function frame(value: unknown) { const data=Buffer.from(JSON.stringify(value)); if(data.length>MAX) throw new Error("protocol_frame_too_large"); const head=Buffer.alloc(4); head.writeUInt32BE(data.length); return Buffer.concat([head,data]); }
export class Supervisor {
  child: ChildProcess;
  busy=false;
  closed=false;
  private buffer=Buffer.alloc(0);
  private pending?: {request: any; started: (v:any)=>void; resolve:(v:any)=>void; reject:(e:Error)=>void};
  private stderr="";
  private exit: Promise<void>;
  constructor(profile: Profile, mode: "kernel"|"job") {
    this.child=spawn(profile.python,["-I","-B",workerPath,`${mode}-supervisor`],{env:environment(profile),stdio:["pipe","pipe","pipe"]});
    this.child.stdout!.on("data",(chunk:Buffer)=>{try{this.parse(chunk);}catch(e){this.fail(e as Error);this.child.stdin?.destroy();}});
    this.child.stderr!.on("data",(chunk:Buffer)=>{this.stderr=(this.stderr+chunk.toString()).slice(-4096);});
    this.exit=new Promise(resolve=>{
      this.child.on("error",(e)=>{this.closed=true;this.fail(e);resolve();});
      this.child.on("close",()=>{this.closed=true;this.fail(new Error(`supervisor_exited: ${this.stderr}`));resolve();});
    });
    this.child.stdin!.on("error",(e)=>this.fail(e));
  }
  private fail(e:Error){if(this.pending){this.pending.reject(e);this.pending=undefined;}this.busy=false;}
  private parse(chunk:Buffer){
    this.buffer=Buffer.concat([this.buffer,chunk]);
    while(this.buffer.length>=4){
      const n=this.buffer.readUInt32BE(0);if(n>MAX)throw new Error("protocol_frame_too_large");if(this.buffer.length<4+n)return;
      const value=JSON.parse(this.buffer.subarray(4,4+n).toString());this.buffer=this.buffer.subarray(4+n);
      const p=this.pending;if(!p)throw new Error("unexpected_worker_response");
      if(value.protocol_version!==1 || value.request_id!==p.request.request_id || value.generation!==p.request.generation)throw new Error("worker_response_mismatch");
      if(value.type==="started")p.started(value);
      else if(value.type==="finished"){this.pending=undefined;this.busy=false;p.resolve(value);}
      else throw new Error("unknown_worker_response");
    }
  }
  run(request:any,signal?:AbortSignal,onStarted:(v:any)=>void=()=>{}):Promise<any>{
    if(this.closed)throw new Error("kernel_state_lost");if(this.busy)throw new Error("kernel_busy");if(signal?.aborted)throw new Error("cancelled");
    this.busy=true;
    return new Promise((resolve,reject)=>{
      const cancel=()=>this.cancel();
      const watchdog=setTimeout(()=>{this.child.stdin?.destroy();},(request.timeout_seconds+10)*1000);
      const cleanup=()=>{clearTimeout(watchdog);signal?.removeEventListener("abort",cancel);};
      this.pending={request,started:onStarted,resolve:v=>{cleanup();resolve(v);},reject:e=>{cleanup();reject(e);}};
      signal?.addEventListener("abort",cancel,{once:true});
      this.child.stdin!.write(frame({...request,protocol_version:1}));
    });
  }
  cancel(){if(!this.closed)this.child.stdin?.write(frame({action:"cancel",protocol_version:1}));}
  async close(){if(!this.closed){this.child.stdin?.end(frame({action:"shutdown",protocol_version:1}));await this.exit;}}
}
export async function workerDigest(){const {createHash}=await import("node:crypto");return createHash("sha256").update(await readFile(workerPath)).digest("hex");}
