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

test('all release skill files survive deployment and preserve user-owned files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'release-skills-test-'));
  try {
    const repoDir = fileURLToPath(new URL('../', import.meta.url));
    const agentDir = path.join(root, 'agent');
    const filesUnder = async dir => {
      const entries = await readdir(dir, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          for (const child of await filesUnder(path.join(dir, entry.name))) files.push(path.join(entry.name, child));
        } else files.push(entry.name);
      }
      return files.sort();
    };
    const custom = path.join(agentDir, 'skills', 'user-owned', 'SKILL.md');
    await mkdir(path.dirname(custom), { recursive: true });
    await writeFile(custom, 'Keep my skill unchanged.');
    const result = await deploySkills({ repoDir, agentDir, log: () => {} });
    assert.deepEqual(result.installed, installedSkills);
    for (const name of installedSkills) {
      const source = path.join(repoDir, 'skills', name);
      const target = path.join(agentDir, 'skills', name);
      const files = await filesUnder(source);
      assert.deepEqual(await filesUnder(target), files, name);
      for (const file of files) {
        assert.deepEqual(await readFile(path.join(target, file)), await readFile(path.join(source, file)), `${name}/${file}`);
      }
    }
    assert.equal(await readFile(custom, 'utf8'), 'Keep my skill unchanged.');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('optics-research metadata and references survive installation and redeployment', async () => {
  assert.ok(installedSkills.includes('optics-research'));
  const root = await mkdtemp(path.join(os.tmpdir(), 'optics-research-test-'));
  try {
    const repoDir = path.join(root, 'repo'), agentDir = path.join(root, 'agent');
    const source = fileURLToPath(new URL('../skills/optics-research/', import.meta.url));
    for (const name of installedSkills) {
      const dir = path.join(repoDir, 'skills', name);
      await mkdir(dir, { recursive: true });
      if (name === 'optics-research') await cp(source, dir, { recursive: true });
      else await writeFile(path.join(dir, 'SKILL.md'), name);
    }
    const options = { repoDir, agentDir, log: () => {} };
    await deploySkills(options);
    const target = path.join(agentDir, 'skills', 'optics-research');
    const skill = await readFile(path.join(target, 'SKILL.md'), 'utf8');
    assert.match(skill, /^---\nname: optics-research\ndescription: [^\n]+\n---\n/);
    const references = [...skill.matchAll(/\]\((references\/[^)]+\.md)\)/g)].map(match => match[1]);
    assert.deepEqual(references.sort(), ['references/literature.md', 'references/verification.md']);
    const result = await deploySkills(options);
    for (const file of ['SKILL.md', ...references]) {
      const expected = await readFile(path.join(source, file), 'utf8');
      assert.equal(await readFile(path.join(target, file), 'utf8'), expected);
      assert.equal(await readFile(path.join(result.archive, '0', 'optics-research', file), 'utf8'), expected);
    }
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
