// om grab — the product's real material into <project>/materials/, before any direction is drawn. A film about a
// product is made of the product: its logo as a file, its own colours and typefaces, its real interface. Agents that had
// to collect these by hand drew grey boxes instead; this collects them in one command.
//
//   om grab <url> [dir]        a website or a GitHub repo page: screenshots down the page (2x), the images on it, logo
//                              candidates (icons, og:image, inline SVG logos), the colours and typefaces it really uses
//   om grab <folder> [dir]     the product's own project on this machine: README images, screenshots, media, icons, and
//                              the colours and fonts its stylesheets declare
//
// Every file gets a line in materials/manifest.json and materials.md saying where it came from.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { findChrome, NO_CHROME } from './browser.js';
import { launch, newPage } from './cdp.js';
import { OmError } from './project.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MEDIA = /\.(png|jpe?g|webp|gif|svg|avif|mp4|mov|webm|icns|ico)$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.om', '_archive', '.next', 'coverage', 'vendor', 'Pods', 'DerivedData', '.cache']);

function slug(s) { return String(s).toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'source'; }

// The materials folder and its two indexes: manifest.json for tools, materials.md for people and the treatment.
function ledger(root) {
  const dir = join(root, 'materials');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'manifest.json');
  let m = { sources: [] };
  try { m = JSON.parse(readFileSync(file, 'utf8')); } catch { /* new */ }
  return { dir, add(source) { m.sources = m.sources.filter((s) => s.from !== source.from).concat(source); writeFileSync(file, JSON.stringify(m, null, 2)); } };
}

function writeMd(root, source) {
  const md = join(root, 'materials.md');
  if (!existsSync(md)) writeFileSync(md, `# Materials\n\nWhat the film is made of, and where each piece came from. Real material first: the logo as a file, the product's own colours and type, its real interface. Anything rebuilt is traced over a capture listed here.\n`);
  const rel = (f) => relative(root, f).split('\\').join('/');
  const lines = [`\n## ${source.kind === 'web' ? 'Web' : 'Local'} · ${source.from}  (${source.at.slice(0, 10)})\n`];
  const by = (k) => source.files.filter((f) => f.kind === k);
  for (const [k, label] of [['logo', 'Logo / icon'], ['screen', 'Screenshots of the page'], ['image', 'Images'], ['video', 'Video'], ['media', 'Media files']]) {
    const fs = by(k);
    if (fs.length) lines.push(`- ${label} (${fs.length}): ${fs.slice(0, 12).map((f) => `\`${rel(f.file)}\`${source.kind === 'local' ? ` ← ${f.from}` : ''}${f.note ? ` ${f.note}` : ''}`).join(', ')}${fs.length > 12 ? ', …' : ''}`);
  }
  if (source.colours?.length) lines.push(`- Colours it uses: ${source.colours.slice(0, 10).map((c) => `${c.hex} (${c.role})`).join(' · ')}`);
  if (source.fonts?.length) lines.push(`- Typefaces: ${source.fonts.slice(0, 6).map((f) => f.family).join(' · ')}`);
  if (source.missing?.length) lines.push(`- Not captured: ${source.missing.join('; ')}`);
  appendFileSync(md, lines.join('\n') + '\n');
  return md;
}

function curl(url, file, referer) {
  const r = spawnSync('curl', ['-sSL', '--max-time', '40', '--max-filesize', String(30 << 20), '-A', 'Mozilla/5.0 (huashu-motion om grab)', ...(referer ? ['-e', referer] : []), '-o', file, url], { encoding: 'utf8' });
  return r.status === 0 && existsSync(file) && statSync(file).size > 200;
}

// ---------- web ----------
const PAGE_FACTS = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const abs = (u) => { try { return new URL(u, location.href).href; } catch (e) { return null; } };
  const images = [];
  for (const im of document.images) if (im.naturalWidth >= 240 && im.naturalHeight >= 120) images.push({ src: abs(im.currentSrc || im.src), w: im.naturalWidth, h: im.naturalHeight, alt: (im.alt || '').slice(0, 80) });
  for (const el of document.querySelectorAll('*')) { const b = getComputedStyle(el).backgroundImage; const m = b && /url\\(["']?([^"')]+)["']?\\)/.exec(b); if (m && el.getBoundingClientRect().width >= 240) images.push({ src: abs(m[1]), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height), alt: 'background' }); }
  const videos = [...document.querySelectorAll('video')].map((v) => ({ src: abs(v.currentSrc || v.src || (v.querySelector('source') || {}).src), poster: abs(v.poster) })).filter((v) => v.src || v.poster);
  const logos = [];
  for (const l of document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"],link[rel="mask-icon"]')) logos.push({ src: abs(l.href), note: l.rel + (l.sizes && l.sizes.value ? ' ' + l.sizes.value : '') });
  for (const m of document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]')) logos.push({ src: abs(m.content), note: m.getAttribute('property') || m.getAttribute('name') });
  const isLogo = (el) => /logo|brand|wordmark|lockup/i.test([el.id, el.getAttribute('class'), el.getAttribute('alt'), el.getAttribute('aria-label'), el.getAttribute('src')].join(' '));
  for (const im of document.querySelectorAll('img')) if (isLogo(im) || isLogo(im.parentElement || im)) logos.push({ src: abs(im.currentSrc || im.src), note: 'img ' + (im.alt || '') });
  const svgs = [];
  for (const s of document.querySelectorAll('svg')) { if (!vis(s) || s.parentElement.closest('svg')) continue; const host = s.closest('a,header,nav,[class*=logo],[id*=logo]'); if (isLogo(s) || (host && (isLogo(host) || host.matches('header a:first-of-type, nav a:first-of-type')))) svgs.push(s.outerHTML.slice(0, 200000)); }
  // colours, weighted: grounds by area, type by characters, accents from buttons and links
  const tally = {}, add = (c, role, w) => { if (!c || /rgba?\\(0, 0, 0, 0\\)|transparent/.test(c)) return; const k = role + '|' + c; tally[k] = (tally[k] || 0) + w; };
  const all = [...document.querySelectorAll('body, body *')].slice(0, 6000);
  for (const el of all) {
    if (!vis(el)) continue;
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    add(s.backgroundColor, 'ground', Math.min(r.width * r.height, 4e6));
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('').length;
    if (own) add(s.color, 'type', own);
    if (el.matches('button, a[class*=btn], a[class*=button], [role=button], .btn, .button')) { add(s.backgroundColor, 'accent', 400); add(s.borderColor, 'accent', 100); }
    if (el.matches('a')) add(s.color, 'accent', 30);
  }
  const fonts = {};
  for (const el of all) { if (!vis(el)) continue; const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('').length; if (!own) continue; const f = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim(); fonts[f] = (fonts[f] || 0) + own; }
  const vars = {};
  for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch (e) { continue; } for (const r of rules) { if (!r.style) continue; for (const p of r.style) if (p.startsWith('--')) { const v = r.style.getPropertyValue(p).trim(); if (/^(#[0-9a-f]{3,8}|rgba?\\(|hsla?\\(|oklch\\()/i.test(v)) vars[p] = v; } } }
  return { title: document.title, description: (document.querySelector('meta[name=description]') || {}).content || '', height: document.documentElement.scrollHeight, images, videos, logos, svgs, tally, fonts, vars };
})()`;

const toHex = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return c; const [r, g, b] = m[1].split(/[\s,/]+/).map(Number); return '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join(''); };

export async function grabWeb(root, url, { maxShots = 8, maxImages = 40, onLog = () => {} } = {}) {
  const chrome = findChrome();
  if (!chrome) throw new OmError(NO_CHROME);
  const L = ledger(root);
  const host = slug(url);
  const dir = join(L.dir, `web-${host}`);
  mkdirSync(dir, { recursive: true });
  const conn = await launch(chrome, { args: ['--window-size=1440,900'] });
  const files = [], missing = [];
  let facts;
  try {
    const page = await newPage(conn);
    await Promise.all([page.send('Page.enable'), page.send('Runtime.enable')]);
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
    const loaded = new Promise((ok) => page.on('Page.loadEventFired', ok));
    const nav = await page.send('Page.navigate', { url });
    if (nav.errorText) throw new OmError(`could not open ${url}: ${nav.errorText}`);
    await Promise.race([loaded, sleep(30_000)]);
    await sleep(1500);
    // walk the page once so lazy images load, then back to the top
    const h0 = await page.evaluate('document.documentElement.scrollHeight');
    for (let y = 0; y < Math.min(h0, 900 * maxShots); y += 700) { await page.evaluate(`window.scrollTo(0, ${y})`); await sleep(150); }
    await page.evaluate('window.scrollTo(0, 0)'); await sleep(800);
    facts = await page.evaluate(PAGE_FACTS);
    const shots = Math.max(1, Math.min(maxShots, Math.ceil(facts.height / 900)));
    for (let i = 0; i < shots; i++) {
      await page.evaluate(`window.scrollTo(0, ${i * 900})`); await sleep(500);
      const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, 30_000);
      const file = join(dir, `screen-${String(i + 1).padStart(2, '0')}.png`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      files.push({ kind: 'screen', file, from: url, note: `y=${i * 900}px, 2x` });
    }
    if (facts.height > 900 * maxShots) missing.push(`page continues below ${900 * maxShots}px (raise --shots)`);
  } finally { await conn.close(); }

  // downloads: logos first, then the largest images, then video posters/sources
  const seen = new Set();
  const take = (src, kind, note, n) => {
    if (!src || seen.has(src) || src.startsWith('data:') && src.length > 2e6) return;
    seen.add(src);
    const ext = (/\.(png|jpe?g|webp|gif|svg|avif|ico|mp4|webm|mov)(\?|#|$)/i.exec(src)?.[1] || (kind === 'video' ? 'mp4' : 'png')).toLowerCase();
    const file = join(dir, `${kind}-${String(n).padStart(2, '0')}.${ext}`);
    let ok;
    if (src.startsWith('data:')) { const m = /^data:[^;,]+(;base64)?,(.*)$/s.exec(src); ok = !!m; if (m) writeFileSync(file, m[1] ? Buffer.from(m[2], 'base64') : decodeURIComponent(m[2])); }
    else ok = curl(src, file, url);
    if (ok) files.push({ kind, file, from: src, note });
    else missing.push(`${kind} ${src.slice(0, 90)}`);
  };
  let n = 0;
  for (const l of facts.logos) take(l.src, 'logo', l.note, ++n);
  facts.svgs.forEach((s, i) => { const file = join(dir, `logo-svg-${i + 1}.svg`); writeFileSync(file, s.includes('xmlns=') ? s : s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')); files.push({ kind: 'logo', file, from: url, note: 'inline SVG from the page' }); });
  n = 0;
  for (const im of facts.images.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, maxImages)) take(im.src, 'image', `${im.w}×${im.h}${im.alt ? ` "${im.alt}"` : ''}`, ++n);
  n = 0;
  for (const v of facts.videos) { if (v.src) take(v.src, 'video', 'video on the page', ++n); if (v.poster) take(v.poster, 'image', 'video poster', ++n); }

  const colours = Object.entries(facts.tally).map(([k, w]) => { const [role, c] = k.split('|'); return { role, hex: toHex(c), w }; });
  const merged = {};
  for (const c of colours) { const k = c.role + c.hex; merged[k] = merged[k] ? { ...merged[k], w: merged[k].w + c.w } : c; }
  const top = (role, n) => Object.values(merged).filter((c) => c.role === role).sort((a, b) => b.w - a.w).slice(0, n);
  const palette = [...top('ground', 4), ...top('type', 3), ...top('accent', 4)];
  for (const [k, v] of Object.entries(facts.vars).slice(0, 24)) palette.push({ role: `css ${k}`, hex: v });
  const fonts = Object.entries(facts.fonts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([family, chars]) => ({ family, chars }));
  const source = { kind: 'web', from: url, at: new Date().toISOString(), title: facts.title, description: facts.description, files: files.map((f) => ({ ...f, file: relative(root, f.file).split('\\').join('/') })), colours: palette, fonts, missing };
  L.add(source);
  const md = writeMd(root, { ...source, files });
  return { dir, files, colours: palette, fonts, missing, md, title: facts.title };
}

// ---------- local project ----------
export function grabLocal(root, folder, { maxFiles = 60, onLog = () => {} } = {}) {
  const src = resolve(folder);
  if (!existsSync(src) || !statSync(src).isDirectory()) throw new OmError(`${src} is not a folder`);
  const L = ledger(root);
  const dir = join(L.dir, `local-${slug(basename(src))}`);
  mkdirSync(dir, { recursive: true });
  const found = [], css = [];
  const walk = (d, depth) => {
    if (depth > 6) return;
    let entries; try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && resolve(p) !== resolve(root)) walk(p, depth + 1); continue; }
      if (!e.isFile()) continue;
      if ((/\.(css|scss|less)$/i.test(e.name) || (/\.html?$/i.test(e.name) && statSync(p).size < 400_000)) && css.length < 60) css.push(p);
      if (!MEDIA.test(e.name)) continue;
      const size = statSync(p).size;
      const icon = /icon|logo|favicon|appicon|brand|wordmark/i.test(p);
      if (size < (icon ? 200 : 15_000) || size > 80 << 20) continue;
      found.push({ p, size, icon });
    }
  };
  walk(src, 0);
  // what the README shows first: those images are the product as its maker presents it
  const readme = readdirSync(src).find((n) => /^readme(\.[a-z]+)?\.md$/i.test(n));
  const featured = new Set();
  if (readme) {
    const text = readFileSync(join(src, readme), 'utf8');
    for (const m of text.matchAll(/!\[[^\]]*\]\(([^)\s]+)|<img[^>]+src=["']([^"']+)["']/g)) {
      const ref = (m[1] || m[2] || '').split(/[?#]/)[0];
      if (ref && !/^https?:/.test(ref)) { const f = resolve(src, ref); if (existsSync(f)) featured.add(f); }
    }
  }
  const rank = (x) => (featured.has(x.p) ? 0 : x.icon ? 1 : /screen|shot|截屏|截图|demo|media|preview|素材|promo|banner/i.test(x.p) ? 2 : 3);
  const pick = found.sort((a, b) => rank(a) - rank(b) || b.size - a.size).slice(0, maxFiles);
  const files = [];
  const used = new Set();
  for (const x of pick) {
    let name = basename(x.p);
    while (used.has(name)) name = '_' + name;
    used.add(name);
    const file = join(dir, name);
    copyFileSync(x.p, file);
    const kind = x.icon ? 'logo' : /\.(mp4|mov|webm)$/i.test(x.p) ? 'video' : /screen|shot|截屏|截图/i.test(x.p) ? 'screen' : 'media';
    files.push({ kind, file, from: relative(src, x.p).split('\\').join('/'), note: featured.has(x.p) ? '(in the README)' : '' });
  }
  // the colours and fonts the stylesheets declare: custom properties first, then the most used values
  const counts = {}, vars = {}, fonts = {};
  for (const f of css) {
    const t = readFileSync(f, 'utf8');
    for (const m of t.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\))/g)) vars[m[1]] = m[2];
    for (const m of t.matchAll(/#[0-9a-fA-F]{6}\b/g)) counts[m[0].toLowerCase()] = (counts[m[0].toLowerCase()] || 0) + 1;
    for (const m of t.matchAll(/font-family\s*:\s*([^;}{]+)/g)) { const fam = m[1].split(',')[0].replace(/["']/g, '').trim(); if (fam && !fam.startsWith('var(')) fonts[fam] = (fonts[fam] || 0) + 1; }
  }
  const colours = [...Object.entries(vars).slice(0, 24).map(([k, v]) => ({ role: `css ${k}`, hex: v })), ...Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([hex, c]) => ({ role: `used ${c}×`, hex }))];
  const fontList = Object.entries(fonts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([family, n]) => ({ family, n }));
  const missing = [];
  if (!files.some((f) => f.kind === 'logo')) missing.push('no logo or icon file found — look in the app bundle, the site (om grab <url>) or ask the user');
  if (!files.some((f) => f.kind === 'screen' || f.kind === 'video')) missing.push('no screenshots or recordings — run the product and capture it');
  const source = { kind: 'local', from: src, at: new Date().toISOString(), files: files.map((f) => ({ ...f, file: relative(root, f.file).split('\\').join('/') })), colours, fonts: fontList, missing };
  L.add(source);
  const md = writeMd(root, { ...source, files });
  return { dir, files, colours, fonts: fontList, missing, md };
}

export async function grab(root, target, opts = {}) {
  const r = /^https?:\/\//i.test(target) ? await grabWeb(root, target, opts) : grabLocal(root, target, opts);
  const count = (k) => r.files.filter((f) => f.kind === k).length;
  const rel = (f) => relative(root, f).split('\\').join('/');
  const lines = [`grab     ${target}${r.title ? `  "${r.title}"` : ''}`,
    `  ${rel(r.dir)}/  logo ${count('logo')} · screens ${count('screen')} · images ${count('image') + count('media')} · video ${count('video')}`,
    r.colours.length ? `  colours  ${r.colours.slice(0, 8).map((c) => `${c.hex} ${c.role}`).join(' · ')}` : '  colours  none found',
    r.fonts.length ? `  type     ${r.fonts.map((f) => f.family).join(' · ')}` : '  type     none found',
    `  ${rel(r.md)}  updated — look at every file before choosing a direction (om still can't see them for you)`];
  for (const m of r.missing.slice(0, 6)) lines.push(`  ! ${m}`);
  return lines.join('\n');
}
