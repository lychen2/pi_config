import { access, cp, mkdir, readdir, rename } from 'node:fs/promises';
import path from 'node:path';

export const installedSkills = [
  'uncertainty-and-units', 'lab-hardware-cad', 'experimental-design',
  'statistical-analysis', 'statistical-power', 'scientific-visualization',
  'sympy', 'paper-lookup', 'citation-management', 'scientific-writing',
  'venue-templates', 'scientific-slides', 'agents-progressive-disclosure',
  'find-skills', 'humanizer-zh', 'mineru-file-processing', 'workflow-skill-creator',
];
// Only known legacy distribution directories are retired; user skills are preserved.
export const retiredSkills = [
  'academic-plotting', 'air.academic-plotting', 'sa.citation-management', 'sa.sympy',
  'academic-paper', 'academic-paper-reviewer', 'deep-research',
  'literature-search-openalex', 'nature-skills', 'pubmed-database', 'docx', 'pdfs',
  'claude-science/figure-style', 'mineru', 'humanizer',
];
const exists = async p => { try { await access(p); return true; } catch { return false; } };

export async function deploySkills({ repoDir, agentDir, otherRoots = [], dryRun = false, log = console.log }) {
  const source = path.join(repoDir, 'skills');
  // Fail before changing anything if a release is incomplete.
  for (const name of installedSkills) {
    if (!await exists(path.join(source, name, 'SKILL.md'))) throw new Error(`Missing release skill: ${name}`);
  }
  const target = path.join(agentDir, 'skills');
  const roots = [...new Set([target, ...otherRoots].map(p => path.resolve(p)))];
  const archive = path.join(agentDir, 'skill-archives', new Date().toISOString().replaceAll(':', '-') + '-' + process.pid);
  const moved = [];
  for (const [index, root] of roots.entries()) {
    for (const name of [...retiredSkills, ...installedSkills]) {
      const from = path.join(root, name);
      if (!await exists(from)) continue;
      const to = path.join(archive, String(index), name);
      log(`  archive skill ${from} -> ${to}`);
      if (!dryRun) { await mkdir(path.dirname(to), { recursive: true }); await rename(from, to); }
      moved.push({ from, to });
    }
  }
  for (const name of installedSkills) {
    log(`  deploy skill ${name}`);
    if (!dryRun) { await mkdir(target, { recursive: true }); await cp(path.join(source, name), path.join(target, name), { recursive: true }); }
  }
  return { installed: installedSkills, moved, archive };
}
