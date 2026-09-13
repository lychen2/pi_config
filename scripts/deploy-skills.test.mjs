import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deploySkills, installedSkills } from './deploy-skills.mjs';

test('fresh install, migration, second install and dry run preserve user skills', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skills-test-'));
  try {
    const repoDir = path.join(root, 'repo'), agentDir = path.join(root, 'agent'), shared = path.join(root, 'shared');
    const put = async (p, text) => { await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, text); };
    for (const name of installedSkills) await put(path.join(repoDir, 'skills', name, 'SKILL.md'), name);
    await put(path.join(agentDir, 'skills', 'litho-paper-radar', 'SKILL.md'), 'protected facts');
    await put(path.join(agentDir, 'skills', 'air.academic-plotting', 'SKILL.md'), 'legacy facts');
    await put(path.join(shared, 'sympy', 'SKILL.md'), 'old');
    const options = { repoDir, agentDir, otherRoots: [shared], log: () => {} };
    await deploySkills({ ...options, dryRun: true });
    await access(path.join(shared, 'sympy', 'SKILL.md'));
    const result = await deploySkills(options);
    assert.equal(await readFile(path.join(result.archive, '0', 'air.academic-plotting', 'SKILL.md'), 'utf8'), 'legacy facts');
    await assert.rejects(access(path.join(shared, 'sympy')));
    await deploySkills(options);
    for (const name of installedSkills) assert.equal(await readFile(path.join(agentDir, 'skills', name, 'SKILL.md'), 'utf8'), name);
    assert.equal(await readFile(path.join(agentDir, 'skills', 'litho-paper-radar', 'SKILL.md'), 'utf8'), 'protected facts');
  } finally { await rm(root, { recursive: true, force: true }); }
});
