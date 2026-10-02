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
test('global content contract preserves placement, safety, language, and verification guidance', async () => {
  const text = await read('config/APPEND_SYSTEM.md');
  for (const pattern of [
    /Put subject facts, sources, methods, assumptions, uncertainty, and material limitations beside the claims/,
    /Keep actionable editorial issues in useful native comments or the handoff/,
    /omit routine process residue/, /Preserve required safety information and venue disclosures/,
    /Use the conversation language for explanations and English for repository artifacts/,
    /Within trusted flows, rely on established contracts rather than repeating defensive parsing or permission gates/,
    /Confirm authorization for destructive changes, publishing, external transfer of confidential material, and hardware operation/,
    /Keep secrets out of logs and deliverables/, /Verify affected behavior in proportion to the task's risk/,
  ]) assert.match(text, pattern);
  assert.ok(text.length < 5000, 'global rules should remain concise');
});

test('global tool guidance follows loaded skills without assuming a tool inventory', async () => {
  const text = await read('config/APPEND_SYSTEM.md');
  assert.match(text, /Use available tools and existing project guidance/);
  assert.match(text, /Load a relevant skill when it would help/);
  assert.doesNotMatch(text, /multi_tool_use\.parallel|Use `codemode`|search_skill_bm25/);
  assert.doesNotMatch(text, /re-read after writes|Do not install dependencies|change configuration/);
});

test('global direct explanation guidance retains essential limits', async () => {
  const global = await read('config/APPEND_SYSTEM.md');
  for (const pattern of [
    /Describe the subject directly/, /Use contrast when requested/,
    /Preserve factual negative results, material limits, safety prohibitions/,
    /Inspect the delivered artifact/,
  ]) assert.match(global, pattern);
  const humanizer = (await read('skills/humanizer-zh/SKILL.md')).replace(/\s+/g, ' ');
  for (const pattern of [
    /直接定义与讲解/, /用户实际提出的误解/, /字幕、讲稿和配音/,
    /事实性负面结果、实质限制、安全禁令和准确引文照常保留/,
  ]) assert.match(humanizer, pattern);
  const probes = await read('docs/prompt-content-regressions.md');
  assert.match(probes, /Direct definitions in an algorithm explainer/);
  assert.match(probes, /Requested distinction and factual negative result/);
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

test('audit and statistics metadata route by task and use installed package documentation', async () => {
  const audit = await read('skills/fuck-my-shit-mountain/SKILL.md');
  assert.match(audit, /Infer audit scope from the request/);
  assert.match(audit, /Use the conversation language and stdout unless the user requests/);
  assert.match(audit, /Ask only when a missing decision materially changes the work/);
  assert.doesNotMatch(audit, /Required Inputs Before Auditing|wait for the answer before auditing/);
  const statistics = await read('skills/statistical-analysis/SKILL.md');
  const power = await read('skills/statistical-power/SKILL.md');
  const design = await read('skills/experimental-design/SKILL.md');
  for (const text of [statistics, power, design]) {
    assert.match(text, /installed (?:statsmodels )?package and its documentation/);
    assert.doesNotMatch(text, /See the `?(?:statsmodels|pymc)`? skill|\*\*pymc\*\*.*skill/i);
  }
});

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

test('manim skills have task-based, edition-specific descriptions', async () => {
  const ce = await readFile('/home/zonazcy/.agents/skills/manimce-best-practices/SKILL.md', 'utf8');
  const gl = await readFile('/home/zonazcy/.agents/skills/manimgl-best-practices/SKILL.md', 'utf8');
  const composer = await readFile('/home/zonazcy/.agents/skills/manim-composer/SKILL.md', 'utf8');
  assert.match(ce, /Apply Manim Community Edition guidance.*`from manim import`/s);
  assert.match(gl, /Apply ManimGL guidance.*`from manimlib import`/s);
  assert.match(composer, /Plan a scene-by-scene educational video.*Use before coding/);
  for (const text of [ce, gl, composer]) {
    const description = text.match(/^description: \|\n([\s\S]*?)\n---/m)?.[1];
    assert.ok(description && description.length < 320, 'Manim descriptions should be concise');
    assert.doesNotMatch(description, /Trigger when:/);
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
