import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { installedSkills } from './deploy-skills.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFile(path.join(root, file), 'utf8');
// Structural regression guards, not proof of model instruction-following.
test('global content contract separates science, editorial issues and process residue', async () => {
  const text = await read('config/APPEND_SYSTEM.md');
  for (const pattern of [
    /Subject matter → artifact/, /Editorial issue → comment or handoff/,
    /Process residue → omit/, /Do not hide material limitations in comments/,
    /Remove or narrow unsupported claims/, /required safety information and venue disclosures/,
    /requested comparison/, /tooltips, collapsible panels/, /without printing a checklist/,
  ]) assert.match(text, pattern);
});

test('optics guidance distinguishes demos from reproductions and keeps model facts visible', async () => {
  const text = await read('skills/optics-research/SKILL.md');
  for (const pattern of [
    /educational demo into a reproduction audit/, /paper-reported values from chosen example inputs/,
    /One-dimensional scalar angular-spectrum propagation in air/,
    /Do not introduce a .*panel by default/, /Scientific limitations remain visible/,
  ]) assert.match(text, pattern);
  const verification = await read('skills/optics-research/references/verification.md');
  assert.match(verification, /not a mandatory section outline/);
  assert.match(verification, /Never hide a known scientific defect/);
});

test('authoring skills check audience surfaces without hiding scientific limitations', async () => {
  for (const name of ['scientific-writing', 'scientific-slides', 'scientific-visualization', 'venue-templates']) {
    const text = await read(`skills/${name}/SKILL.md`);
    assert.match(text, /(?:audience|reader).view check/i, name);
    assert.match(text.replace(/\s+/g, ' '), /native [^.]{0,50}comments/i, name);
    assert.match(text, /limitations/i, name);
  }
  const humanizer = await read('skills/humanizer-zh/SKILL.md');
  assert.match(humanizer, /不能藏进注释/);
  assert.match(humanizer, /工具提示、折叠面板/);
  const creator = await read('skills/workflow-skill-creator/SKILL.md');
  assert.match(creator, /Audit the examples and templates/);
  assert.match(creator, /routine process residue nowhere/);
});

test('release skill entrypoints have matching names and existing local Markdown references', async () => {
  for (const name of installedSkills) {
    const base = `skills/${name}`;
    const text = await read(`${base}/SKILL.md`);
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    assert.ok(frontmatter, `${name}: missing frontmatter`);
    assert.match(frontmatter, new RegExp(`^name: ${name}$`, 'm'), name);
    for (const [, target] of text.matchAll(/\]\(([^\s)]+\.md)(?:#[^)]*)?\)/g)) {
      if (/^(?:https?:|\/|#)/.test(target)) continue;
      await access(path.resolve(root, base, target));
    }
  }
});

test('reviewed templates are distributable and LaTeX environments remain balanced', async () => {
  const files = [
    'skills/scientific-writing/assets/REPORT_FORMATTING_GUIDE.md',
    ...['conference', 'seminar', 'defense'].map(name => `skills/scientific-slides/assets/beamer_template_${name}.tex`),
    ...['plos_one', 'nature_article', 'neurips_article'].map(name => `skills/venue-templates/assets/journals/${name}.tex`),
  ];
  const ignored = spawnSync('git', ['check-ignore', '--no-index', ...files], { cwd: root, encoding: 'utf8' });
  assert.equal(ignored.status, 1, `Reviewed source assets must not be ignored: ${ignored.stdout}\n${ignored.stderr}`);
  for (const file of files) {
    const text = await read(file);
    assert.ok(text.endsWith('\n'), file);
    if (!file.endsWith('.tex')) continue;
    const stack = [];
    const uncommented = text.split('\n').map(line => line.replace(/(?<!\\)%.*/, '')).join('\n');
    for (const [, operation, environment] of uncommented.matchAll(/\\(begin|end)\{([^}]+)\}/g)) {
      if (operation === 'begin') stack.push(environment);
      else assert.equal(stack.pop(), environment, `${file}: unbalanced ${environment}`);
    }
    assert.deepEqual(stack, [], file);
  }
});
