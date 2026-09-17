import test from 'node:test';
import assert from 'node:assert/strict';
import extension from '../index.ts';
import {shellQuote} from '../src/ssh.ts';
import {Store} from '../src/store.ts';
import {mkdtemp,mkdir,symlink,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('registration owns only scientific tools and read-only command',()=>{
 const tools=[],commands=[],events=[];
 const pi={registerTool:t=>tools.push(t),registerCommand:(name,c)=>commands.push(name),on:(event,fn)=>events.push(event),setActiveTools:()=>{throw new Error('must not change active tools');}};
 extension(pi);
 assert.deepEqual(tools.map(t=>t.name),['science_python','science_job','science_artifact','science_status']);
 assert.deepEqual(commands,['science']);
 assert.deepEqual(events,['session_start','session_tree','session_shutdown']);
 assert.equal(tools.find(t=>t.name==='science_status').parameters.properties.action.enum.includes('execute'),false);
});
test('remote shell quoting rejects controls and escapes quotes',()=>{
 assert.equal(shellQuote("/a b/'python"),"'/a b/'\\''python'");
 assert.throws(()=>shellQuote('/bad\npython'),/unsafe_remote_argument/);
});
test('runtime symlink is rejected',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'science-safe-'));
 try{await symlink('/tmp',path.join(root,'.science'));await assert.rejects(new Store(root).initialize(),/symlink_rejected/);}finally{await rm(root,{recursive:true,force:true});}
});
