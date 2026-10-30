// What a score sounds like at a glance — its tempo, key and band — so `om sound` can say when a film's music is
// the same music as the bundled example scores or as the films made recently on this machine.
// 2026-10-22: ten test films in a row (two products, four skill versions) all played Signal's band — synpluck,
// supersaw, violins, piano, synbass, an 808 and a pop kit, same gains — at 120 BPM in E/A/D minor: the agent
// copied the closest example score's header every time, and every film sounded the same.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAbc } from './composer.js';

const CASES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'references', 'scores');
export const historyFile = () => join(process.env.OM_HOME || join(homedir(), '.huashu-motion'), 'soundtracks.jsonl');

// tempo (first Q:), key (K:), meter, and the band: each voice's instrument (drum voices by kit)
export function soundprint(text) {
  const s = parseAbc(text);
  const q = /^Q:\s*(?:\d+\/\d+\s*=\s*)?(\d+(?:\.\d+)?)/m.exec(text), k = /^K:\s*([^\s%]+)/m.exec(text);
  const key = k ? k[1] : 'C';
  const minor = /^[A-Ga-g][#b]?(m|min|aeo|dor|phr|loc)/i.test(key) && !/^[A-Ga-g][#b]?(maj|mix|lyd)/i.test(key);
  const band = [...new Set(Object.values(s.voices).map((v) => (v.inst === 'drums' ? `drums:${v.kit || 'pop'}` : v.inst || 'piano')))].sort();
  return { title: s.title || '', bpm: q ? Number(q[1]) : 120, key, minor, meter: (s.meter || [4, 4]).join('/'), band };
}

const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n || 1); };

// Two soundtracks are "the same music" when they share most of the band, or half of it at a nearby tempo.
// (A live film, 2026-10-22, answered the warning by swapping two of Signal's seven instruments at 120 BPM:
// 56 % shared, 8 BPM apart — still the same film to the ear.)
export function alike(a, b) {
  const band = jaccard(a.band, b.band), tempo = Math.abs(a.bpm - b.bpm);
  return { band: +band.toFixed(2), tempo, same: band >= 0.7 || (band >= 0.5 && tempo <= 12) };
}

export function cases() {
  if (!existsSync(CASES)) return [];
  return readdirSync(CASES).filter((f) => f.endsWith('.abc')).map((f) => ({ name: f, print: soundprint(readFileSync(join(CASES, f), 'utf8')) }));
}

export function recent(root, limit = 12) {
  let rows = [];
  try { rows = readFileSync(historyFile(), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
  const here = resolve(root);
  const latest = new Map();
  for (const r of rows) if (r && r.root && r.print) latest.set(r.root, r); // the last entry per film
  return [...latest.values()].filter((r) => r.root !== here).slice(-limit);
}

export function remember(root, print) {
  try {
    const f = historyFile();
    mkdirSync(dirname(f), { recursive: true });
    const line = JSON.stringify({ date: new Date().toISOString().slice(0, 10), root: resolve(root), print });
    const prev = existsSync(f) ? readFileSync(f, 'utf8') : '';
    writeFileSync(f, prev + line + '\n');
  } catch { /* a read-only home: the check still ran */ }
}

const fmt = (p) => `${p.bpm} BPM ${p.key} · ${p.band.join(' ')}`;

// Lines for the om sound report: this film's soundprint, and what it repeats.
export function soundprintReport(root, text) {
  const print = soundprint(text), lines = [`print    ${fmt(print)}`];
  for (const c of cases()) {
    const m = alike(print, c.print);
    if (m.same) lines.push(`warning  this is the band of the example score ${c.name} (${fmt(c.print)}; ${Math.round(m.band * 100)} % of the instruments shared) — the examples teach structure, not a sound. Choose the band, tempo and key from the film's music direction (music.md)`);
  }
  const twins = recent(root).filter((r) => alike(print, r.print).same);
  if (twins.length) lines.push(`warning  the same music as ${twins.length} recent film${twins.length > 1 ? 's' : ''} on this machine (${twins.slice(-3).map((r) => `${r.root.split(/[\\/]/).slice(-2).join('/')}: ${fmt(r.print)}`).join(' | ')}) — every film so far has sounded alike; pick another world from music.md`);
  remember(root, print);
  return { print, lines };
}
