import { readFile, open } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadConfig, hash, keys, object, type Config, type Profile, environment } from "./config.ts";
import { Store, safe, relative, validId, atomic, type Spec, type Manifest, type Check } from "./store.ts";
import { Supervisor, workerPath, workerDigest } from "./runtime.ts";
import { submitRemote, remoteOperation } from "./ssh.ts";

export interface Context { cwd:string; session:string; entry:string|null; confirm:(title:string,message:string)=>Promise<boolean>; reference:(run:string)=>void }
export class ScienceService {
  generation=0;
  kernel?:Supervisor;
  private kernelProfile="";
  private previousCell?:string;
  private jobs=new Map<string,{supervisor:Supervisor;done:Promise<any>}>();
  private grant?:{key:string;remaining:number};
  private locked=false;
  visible=new Set<string>();
  async resetLifecycle(){this.generation++;this.grant=undefined;const kernel=this.kernel;this.kernel=undefined;this.previousCell=undefined;await Promise.all([kernel?.close(),...Array.from(this.jobs.values(),j=>j.supervisor.close())]);this.jobs.clear();}
  private async exclusive<T>(fn:()=>Promise<T>){if(this.locked)throw new Error("science_operation_busy");this.locked=true;try{return await fn();}finally{this.locked=false;}}
  private async authorized(ctx:Context,c:Config,p:Profile,submission:boolean){
    const key=hash([c.digest,p,await workerDigest(),this.generation]);
    if(this.grant?.key!==key || (submission&&this.grant.remaining<=0)){
      const generation=this.generation;
      if(!await ctx.confirm("Authorize trusted-host scientific execution",`Project: ${c.root}\nPython: ${p.python}\nTransport: ${p.transport}\nCode runs with your account permissions; this is not a sandbox.\nLimits: ${JSON.stringify(c.limits)}\nEnvironment names: ${p.environmentAllowlist.join(", ")}\nLogs may contain sensitive program output.`))throw new Error("approval_required");
      if(generation!==this.generation)throw new Error("session_changed");
      this.grant={key,remaining:c.limits.maxSubmissionsPerGrant};
    }
    if(submission)this.grant!.remaining--;
  }
  async status(ctx:Context,args:any){
    const store=new Store(ctx.cwd);
    if(args.action==="kernel")return {running:!!this.kernel&&!this.kernel.closed,busy:this.kernel?.busy??false,generation:this.generation};
    if(args.action==="summary"){
      let config;try{const c=await loadConfig(ctx.cwd);config={default_profile:c.defaultProfile,profiles:Object.keys(c.profiles),limits:c.limits};}catch(e){config={error:String(e)};}
      return {config,kernel:!!this.kernel&&!this.kernel.closed,local_jobs:this.jobs.size,authorization_remaining:this.grant?.remaining??0};
    }
    if(args.action==="runs")return (await store.list()).filter(m=>args.scope==="project"||this.visible.has(m.run_id)).slice(-(args.limit??20));
    const m=await store.read(validId(args.run_id));
    if(args.action==="run")return m;
    if(args.action==="artifacts")return m.artifacts;
    if(args.action==="log"){
      const file=await safe(ctx.cwd,`.science/runs/${m.run_id}/logs/${args.stream==="stderr"?"stderr":"stdout"}.log`);
      const fd=await open(file,"r");try{const size=(await fd.stat()).size;const offset=args.offset??0;const buf=Buffer.alloc(Math.min(args.limit??4096,12000));const {bytesRead}=await fd.read(buf,0,buf.length,offset);return {text:buf.subarray(0,bytesRead).toString("utf8").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,"").replace(/[\x00-\x08\x0b-\x1f\x7f]/g,""),next_offset:offset+bytesRead,total_bytes:size};}finally{await fd.close();}
    }
    throw new Error("invalid_action");
  }
  async execute(ctx:Context,tool:string,args:any,signal?:AbortSignal){return this.exclusive(async()=>{
    if(signal?.aborted)throw new Error("cancelled");
    const generation=this.generation,c=await loadConfig(ctx.cwd),store=new Store(c.root);
    const existing=args.run_id?await store.read(validId(args.run_id)):undefined;
    const profileId=(tool==="science_artifact"?args.profile:undefined)??existing?.profile_id??args.profile??c.defaultProfile;
    const profile=c.profiles[profileId];if(!profile)throw new Error("unknown_profile");
    if(existing&&tool!=="science_artifact"&&existing.profile_digest!==hash(profile))throw new Error("profile_changed");
    if(profile.transport==="ssh"&&tool!=="science_job")throw new Error("remote_profile_requires_science_job: harvest then validate using an explicitly configured local validation profile");
    const submission=args.action==="execute"||args.action==="submit"||args.action==="verify";
    await this.authorized(ctx,c,profile,submission);
    if(generation!==this.generation||signal?.aborted)throw new Error("cancelled");
    if(tool==="science_python"&&args.action==="reset"){
      await this.kernel?.close();this.kernel=undefined;this.previousCell=undefined;return {kernel_state_lost:true};
    }
    if(tool==="science_job"&&existing){
      if(profile.transport==="ssh"){const release=await store.lock(existing.run_id);try{return await remoteOperation(c,profile,store,existing,args.action,signal);}finally{await release();}}
      const job=this.jobs.get(existing.run_id);
      if(args.action==="cancel"){if(!job)throw new Error("job_not_owned: cannot signal an unverified historical process");job.supervisor.cancel();await job.done;}
      if(args.action==="poll"||args.action==="cancel"||args.action==="harvest"){
        const m=await store.read(existing.run_id);
        if(!job&&["pending","running"].includes(m.execution_status)){m.last_known_execution_status=m.execution_status;m.execution_status="unknown";await store.save(m);}
        if(args.action==="harvest"&&m.execution_status==="succeeded")await store.integrity(m,await store.spec(m.run_id));
        return m;
      }
    }
    if(tool==="science_artifact"&&existing){const release=await store.lock(existing.run_id);try{return await this.verify(ctx,c,profile,store,existing,args,signal);}finally{await release();}}
    if(!submission)throw new Error("invalid_action");
    const spec:Spec={...args,action:tool+":"+args.action,profile:profileId};
    validId(spec.request_id);this.validateSpec(spec,c);
    if(tool==="science_python"&&this.kernel?.busy)throw new Error("kernel_busy");
    if(tool==="science_job"&&profile.transport==="local"&&this.jobs.size>=c.limits.maxLocalJobs)throw new Error("local_job_limit");
    if(tool==="science_job"&&profile.transport==="ssh"){
      const live=(await store.list()).filter(m=>c.profiles[m.profile_id]?.sshAlias===profile.sshAlias&&["pending","running","unknown"].includes(m.execution_status)&&m.request_id!==spec.request_id);
      if(live.length>=c.limits.maxRemoteJobsPerHost)throw new Error("remote_job_limit");
    }
    const {manifest:m,fresh}=await store.reserve(spec,hash(profile),ctx.session,ctx.entry);
    this.visible.add(m.run_id);ctx.reference(m.run_id);if(!fresh)return m;
    try{
      await store.stage(m,spec,c.limits.maxTransferBytesPerRun);
      if(generation!==this.generation||signal?.aborted)throw new Error("session_changed_or_cancelled");
      if(profile.transport==="ssh"){
        try{return await submitRemote(c,profile,store,m,spec,generation,signal);}catch(error){m.execution_status="unknown";m.termination_reason=String(error);await store.save(m);throw error;}
      }
      m.worker_digest=await workerDigest();m.environment={python:profile.python,variable_names:profile.environmentAllowlist,python_version:"unknown"};
      let supervisor:Supervisor;
      if(tool==="science_python"){
        if(this.kernel&&(this.kernel.closed||this.kernelProfile!==hash(profile))){await this.kernel.close();this.kernel=undefined;this.previousCell=undefined;}
        supervisor=this.kernel??=new Supervisor(profile,"kernel");this.kernelProfile=hash(profile);m.previous_cell_run_id=this.previousCell??null;this.previousCell=m.run_id;
      }else supervisor=new Supervisor(profile,"job");
      m.execution_status="running";await store.save(m);
      const request={...spec,request_id:m.request_id,generation,cwd:await store.directory(m.run_id),timeout_seconds:spec.timeout_seconds??(tool==="science_python"?c.limits.kernelCellTimeoutSeconds:c.limits.jobTimeoutSeconds),max_log_bytes:c.limits.maxLogBytesPerRun,environment:environment(profile)};
      const done=supervisor.run(request,tool==="science_python"?signal:undefined).then(async result=>{Object.assign(m,result);delete m.type;delete m.protocol_version;await store.save(m);if(m.execution_status==="succeeded")await store.integrity(m,spec);return m;}).catch(async error=>{m.execution_status="unknown";m.termination_reason=String(error);await store.save(m);throw error;}).finally(()=>{if(tool==="science_job")this.jobs.delete(m.run_id);});
      if(tool==="science_job"){this.jobs.set(m.run_id,{supervisor,done});void done.catch(()=>{});return m;}
      const result=await done;if(result.execution_status!=="succeeded")throw new Error(`${result.termination_reason??result.execution_status}: run_id=${m.run_id}`);return result;
    }catch(error){if(m.execution_status==="pending"){m.execution_status="failed";m.termination_reason=String(error);await store.save(m);}throw error;}
  });}
  private validateSpec(s:Spec,c:Config){
    const timeoutLimit=s.action==="science_python:execute"?c.limits.kernelCellTimeoutSeconds:c.limits.jobTimeoutSeconds;
    if(s.timeout_seconds!==undefined&&(!Number.isInteger(s.timeout_seconds)||s.timeout_seconds<1||s.timeout_seconds>timeoutLimit))throw new Error("invalid_timeout");
    if(s.action==="science_python:execute"&&(typeof s.code!=="string"||Buffer.byteLength(s.code)>1024*1024))throw new Error("invalid_code");
    if(s.action==="science_job:submit"&&(typeof s.executable!=="string"||!path.isAbsolute(s.executable)||!Array.isArray(s.argv)))throw new Error("absolute_executable_and_argv_required");
    const names=new Set();for(const o of s.expected_outputs??[]){relative(o.path);if(names.has(o.path))throw new Error("duplicate_output");names.add(o.path);if(!Number.isSafeInteger(o.max_bytes)||o.max_bytes<1)throw new Error("invalid_output_limit");}
    for(const check of s.required_validations??[])this.validateCheck(check);
  }
  private validateCheck(check:Check){
    object(check);keys({...check},["id","parameters"]);object(check.parameters);
    const p=check.parameters;
    const fields:Record<string,string[]>={json:["path","max_bytes","fields","equals"],csv:["path","max_bytes","columns","numeric_columns","rows","max_rows"],array:["path","max_bytes","shape","dtype","max_elements"],slit:["paths","aperture_m","wavelength_m","max_error","max_grid_difference"]};
    if(!Object.hasOwn(fields,check.id))throw new Error("unknown_validator");keys(p,fields[check.id]);
    if(check.id!=="slit")relative(p.path);
    for(const name of ["max_bytes","max_rows","max_elements","rows"]){if(p[name]!==undefined&&(!Number.isSafeInteger(p[name])||p[name]<0||(name!=="rows"&&p[name]===0)))throw new Error("invalid_validation_limit");}
    for(const name of ["fields","columns","numeric_columns"]){if(p[name]!==undefined&&(!Array.isArray(p[name])||p[name].some((x:unknown)=>typeof x!=="string")))throw new Error("invalid_validation_fields");}
    if(p.equals!==undefined)object(p.equals);
    if(p.shape!==undefined&&(!Array.isArray(p.shape)||p.shape.some((x:unknown)=>typeof x!=="number"||!Number.isSafeInteger(x)||x<0)))throw new Error("invalid_array_shape");
    if(p.dtype!==undefined&&typeof p.dtype!=="string")throw new Error("invalid_array_dtype");
    if(check.id==="slit"){
      if(!Array.isArray(p.paths)||p.paths.length!==2)throw new Error("two_grids_required");for(const file of p.paths)relative(file);
      for(const name of ["aperture_m","wavelength_m","max_error","max_grid_difference"]){if(typeof p[name]!=="number"||!Number.isFinite(p[name])||p[name]<=0)throw new Error("invalid_scientific_threshold");}
    }
  }
  private async verify(ctx:Context,c:Config,p:Profile,store:Store,m:Manifest,args:any,signal?:AbortSignal){
    if(m.execution_status!=="succeeded")throw new Error("execution_not_succeeded");
    const spec=await store.spec(m.run_id);await store.integrity(m,spec);
    const checks:Check[]=args.checks??spec.required_validations??[];if(!checks.length)throw new Error("checks_required");for(const check of checks)this.validateCheck(check);
    const id=validId(args.request_id),dir=await store.directory(m.run_id),resultPath=`validations/${id}.json`;
    const request={cwd:dir,checks,result_path:resultPath,input_artifacts:m.artifacts};const requestPath=path.join(dir,"validations",`${id}.request.json`);
    const old=await readFile(requestPath,"utf8").catch((e:any)=>{if(e.code==="ENOENT")return null;throw e;});
    if(old){if(hash(JSON.parse(old))!==hash(request))throw new Error("idempotency_conflict");return JSON.parse(await readFile(path.join(dir,resultPath),"utf8"));}
    await atomic(requestPath,request);
    const {mkdir}=await import("node:fs/promises");
    const validationDir=await safe(c.root,`.science/runs/${m.run_id}/validations/${id}.runtime`);
    await mkdir(validationDir,{mode:0o700});
    const supervisor=new Supervisor(p,"job");
    const validationKey=`validation-${randomUUID()}`;
    const execution=supervisor.run({request_id:id,generation:this.generation,cwd:validationDir,executable:p.python,argv:["-I","-B",workerPath,"validate",requestPath],environment:environment(p),timeout_seconds:Math.min(120,c.limits.jobTimeoutSeconds),max_log_bytes:c.limits.maxLogBytesPerRun},signal);
    this.jobs.set(validationKey,{supervisor,done:execution});
    try{
      const result=await execution;
      if(result.execution_status!=="succeeded")throw new Error(`validation_worker_failed: ${m.run_id}`);
      const validation=JSON.parse(await readFile(path.join(dir,resultPath),"utf8"));validation.input_artifacts=m.artifacts;validation.run_id=m.run_id;validation.validator_version=1;await atomic(path.join(dir,resultPath),validation);
      if(spec.required_validations?.length&&hash(checks)===hash(spec.required_validations)){m.validation_status=validation.observations.every((v:any)=>v.status==="passed")?"passed":"failed";await store.save(m);}
      return {run:m,validation};
    }finally{this.jobs.delete(validationKey);await supervisor.close();}
  }
}
