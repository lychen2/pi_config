import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { installedSkills } from './deploy-skills.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFile(path.join(root, file), 'utf8');
test('release skill entrypoints have matching names, concise metadata, and local references', async () => {
  assert.ok(installedSkills.includes('fuck-my-shit-mountain'), 'audit skill is managed for deployment');
  for (const name of installedSkills) {
    const base = `skills/${name}`;
    const text = await read(`${base}/SKILL.md`);
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    assert.ok(frontmatter, `${name}: missing frontmatter`);
    assert.match(frontmatter, new RegExp(`^name: ${name}$`, 'm'), name);
    const description = frontmatter.match(/^description:\s*(?:\|\s*\n((?:[ \t].*\n)+)|>\s*\n((?:[ \t].*\n)+)|([^\n]+))/m);
    assert.ok(description, `${name}: missing description`);
    const descriptionText = (description[1] || description[2] || description[3]).split(/\r?\n/).map(line => line.trim()).filter(Boolean).join(' ');
    assert.ok(descriptionText.length <= 450, `${name}: description should be a concise task trigger (${descriptionText.length} chars)`);
    for (const [, target] of text.matchAll(/\]\(([^\s)]+\.md)(?:#[^)]*)?\)/g)) {
      if (/^(?:https?:|\/|#)/.test(target)) continue;
      await access(path.resolve(root, base, target));
    }
  }
});

test('reviewed templates are distributable and LaTeX environments remain balanced', async () => {
  const files = [
    'skills/manimgx/assets/quickstart.py',
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
