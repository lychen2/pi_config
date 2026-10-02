import test from 'node:test';
import assert from 'node:assert/strict';
import { initTheme } from '@earendil-works/pi-coding-agent';
import { visibleWidth } from '@earendil-works/pi-tui';
import brandHeader from '../brand-header.ts';
initTheme('dark');
for (const width of [40,80,120,160]) test(`original static header preserves pixel logo at ${width} columns`, () => {
 const hooks = new Map(); let factory;
 const pi = {on:(name,fn)=>hooks.set(name,fn),getThinkingLevel:()=> 'high',getCommands:()=>[],getActiveTools:()=>['read']};
 const theme={fg:(_role,text)=>text,bold:text=>text,name:'matugen'};
 const ctx={mode:'tui',cwd:'/workspace',model:{id:'example',provider:'manager'},ui:{setHeader:fn=>factory=fn}};
 brandHeader(pi); hooks.get('session_start')({},ctx);
 const component=factory({terminal:{columns:width,rows:40}},theme);
 const rows=component.render(width);
 assert.ok(rows.every(row=>visibleWidth(row)<=width));
 assert.ok(rows.some(row=>row.includes('█')));
 assert.deepEqual(rows,component.render(width));
 assert.equal(hooks.has('agent_start'),false);
});
