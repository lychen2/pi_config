import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, rm, cp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

test('pi-learn ships its references and license and survives redeployment', async () => {
  assert.ok(installedSkills.includes('pi-learn'));
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-learn-test-'));
  try {
    const repoDir = path.join(root, 'repo'), agentDir = path.join(root, 'agent');
    const source = fileURLToPath(new URL('../skills/pi-learn/', import.meta.url));
    for (const name of installedSkills) {
      const dir = path.join(repoDir, 'skills', name);
      await mkdir(dir, { recursive: true });
      if (name === 'pi-learn') await cp(source, dir, { recursive: true });
      else await writeFile(path.join(dir, 'SKILL.md'), name);
    }
    const options = { repoDir, agentDir, log: () => {} };
    await deploySkills(options);
    const result = await deploySkills(options);
    const target = path.join(agentDir, 'skills', 'pi-learn');
    const files = ['SKILL.md', 'LICENSE', 'SOURCES.md',
      ...(await readdir(path.join(source, 'references'))).map(name => `references/${name}`)];
    for (const file of files) {
      const expected = await readFile(path.join(source, file), 'utf8');
      assert.equal(await readFile(path.join(target, file), 'utf8'), expected);
      assert.equal(await readFile(path.join(result.archive, '0', 'pi-learn', file), 'utf8'), expected);
    }
    const skill = await readFile(path.join(target, 'SKILL.md'), 'utf8');
    for (const match of skill.matchAll(/\]\(([^)]+\.md)\)/g)) {
      await access(path.join(target, match[1]));
    }
    assert.deepEqual((await readdir(target)).sort(), ['LICENSE', 'SKILL.md', 'SOURCES.md', 'references']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
