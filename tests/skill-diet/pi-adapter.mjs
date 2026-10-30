#!/usr/bin/env node
// Run with the upstream skill-diet evaluator, not the automatic test suite.
import { spawn } from 'node:child_process';
import { access, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const [skillDir, prompt, outDir, workDir] = process.argv.slice(2);
if (workDir === undefined) throw new Error('Usage: adapter <skill-dir> <prompt> <out-dir> <work-dir>');
await mkdir(outDir, { recursive: true });
const model = process.env.EVAL_MODEL || 'manager/deepseek-v4.1-flash';
const system = 'You are a careful task assistant. Follow the user request. Use available skills when relevant: read the entire SKILL.md before applying it, then read conditional references when their case applies. Resolve relative links from the skill directory. Keep responses concise and concrete. Do not install software or use the network. Do not seek other skills outside those listed for this session.' + (skillDir ? '' : ' No skills are installed for this session. Report a requested unavailable skill or script as unavailable; do not search the filesystem for it.');
const args = ['--print', '--mode', 'json', '--no-session', '--no-extensions', '--no-mcp', '--no-skills', '--no-context-files', '--no-prompt-templates', '--no-themes', '--offline', '--tools', 'read,bash,write,edit', '--model', model, '--thinking', 'off', '--system-prompt', system];
if (skillDir) args.push('--skill', skillDir);
args.push('--', prompt);
// Hide installed skills and other evaluator versions from every tool call.
// Inference retains network access; task instructions prohibit other network use.
const home = homedir();
const agentDir = process.env.PI_CODING_AGENT_DIR || path.join(home, '.pi', 'agent');
const sandbox = ['--die-with-parent', '--new-session', '--unshare-pid'];
const exists = async target => { try { await access(target); return true; } catch { return false; } };
for (const root of ['/usr', '/bin', '/sbin', '/lib', '/lib64', '/etc']) {
  if (await exists(root)) sandbox.push('--ro-bind', root, root);
}
// These host resource trees contain unrelated bundled skills.
for (const root of ['/usr/share/miyu/personas', '/lib/chatgpt/resources/skills', '/usr/lib/chatgpt/resources/skills']) {
  if (await exists(root)) sandbox.push('--tmpfs', root);
}
sandbox.push('--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--dir', home, '--dir', agentDir);
for (const runtime of [path.join(home, '.npm-global'), path.join(agentDir, 'bin'), path.join(agentDir, 'auth.json'), path.join(agentDir, 'models.json')]) {
  if (await exists(runtime)) sandbox.push('--ro-bind', runtime, runtime);
}
if (skillDir) sandbox.push('--ro-bind', path.resolve(skillDir), path.resolve(skillDir));
sandbox.push('--bind', workDir, workDir, '--chdir', workDir, '--setenv', 'HOME', home, '--setenv', 'PI_CODING_AGENT_DIR', agentDir, '--', 'pi', ...args);
const child = spawn('bwrap', sandbox, { cwd: workDir, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '', stderr = '';
child.stdout.on('data', chunk => { stdout += chunk; });
child.stderr.on('data', chunk => { stderr += chunk; });
let timedOut = false;
const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 150000);
process.on('SIGTERM', () => { child.kill('SIGTERM'); });
const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
clearTimeout(timeout);
await writeFile(path.join(outDir, 'session.jsonl'), stdout);
await writeFile(path.join(outDir, 'stderr.txt'), stderr);
const messages = new Map();
let stopReason = null;
for (const line of stdout.split('\n')) {
  let event;
  try { event = JSON.parse(line); } catch { continue; }
  if (event.type !== 'message_end' || event.message?.role !== 'assistant') continue;
  const message = event.message;
  stopReason = message.stopReason ?? null;
  messages.set(message.id || JSON.stringify(message), message);
}
const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const calls = [];
let answer = '', turns = 0;
for (const message of messages.values()) {
  if (message.usage) {
    for (const key of Object.keys(tokens)) tokens[key] += message.usage[key] || 0;
    turns++;
  }
  const parts = Array.isArray(message.content) ? message.content : [];
  const text = parts.filter(part => part.type === 'text').map(part => part.text).join('\n');
  if (text) answer = text;
  for (const part of parts) {
    if (part.type !== 'toolCall') continue;
    const call = { name: part.name };
    const args = part.arguments || {};
    if (typeof args.path === 'string') call.path = path.resolve(workDir, args.path);
    if (typeof args.command === 'string') call.command = args.command;
    calls.push(call);
  }
}
if (!turns || !Object.values(tokens).some(Boolean)) {
  console.error(`Pi returned no usage (exit ${code}, timeout=${timedOut}); inspect ${outDir}`);
  process.exit(1);
}
const artifacts = [];
for (const name of ['caption.txt', 'plot.py']) {
  const source = path.join(workDir, name);
  if (!await exists(source) || !(await lstat(source)).isFile()) continue;
  await mkdir(path.join(outDir, 'artifacts'), { recursive: true });
  await writeFile(path.join(outDir, 'artifacts', name), await readFile(source));
  artifacts.push(name);
}
await writeFile(path.join(outDir, 'result.json'), JSON.stringify({ answer, tokens, turns, calls, artifacts, exitCode: code, timedOut, stopReason }, null, 2));
