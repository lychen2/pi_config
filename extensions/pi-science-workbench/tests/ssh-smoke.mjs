import {remote} from '../src/ssh.ts';
import {workerPath,workerDigest} from '../src/runtime.ts';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const p={transport:'ssh',python:process.env.SCIENCE_TEST_REMOTE_PYTHON,sshAlias:process.env.SCIENCE_TEST_SSH_ALIAS,remoteRunRoot:process.env.SCIENCE_TEST_REMOTE_ROOT,executionTrust:'trusted-host',environmentAllowlist:[]};
const id=randomUUID();
await remote(p,{action:'submit',run_id:id,worker:(await readFile(workerPath)).toString('base64'),worker_digest:await workerDigest(),inputs:[],max_transfer_bytes:4096,spec:{protocol_version:1,request_id:id,generation:1,executable:p.python,argv:['-c','from pathlib import Path;Path("artifacts/check.txt").write_text("science-ssh-ok")'],environment:{},timeout_seconds:30,max_log_bytes:4096}});
let state;
for(let i=0;i<60;i++){state=await remote(p,{action:'poll',run_id:id});if(state.execution_status!=='running'&&state.execution_status!=='unknown')break;await new Promise(r=>setTimeout(r,500));}
assert.equal(state.execution_status,'succeeded');
const result=await remote(p,{action:'read',run_id:id,path:'artifacts/check.txt',offset:0});
assert.equal(Buffer.from(result.data,'base64').toString(),'science-ssh-ok');
console.log(`SSH smoke passed; retained remote evidence: ${p.remoteRunRoot}/${id}`);
