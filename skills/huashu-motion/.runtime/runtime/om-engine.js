// huashu-motion engine — the page side of rendering. The renderer injects this file before the
// composition's own scripts run (Page.addScriptToEvaluateOnNewDocument); the composition never
// references it; the studio and exported pages inject it the same way. One engine serves rendering,
// screenshots and the preview (window.__omConfig.video === 'live', driven by runtime/om-player.js).
//
// What it provides, from the composition contract (skills/huashu-motion/references/contract.md):
//   window.__timelines           registry of paused GSAP timelines (created here if missing)
//   OM.vars()                    the variables — defaults from <html data-composition-variables>, overridden by
//                                window.__omVariables, typed as declared (window.__hyperframes.getVariables(): older alias)
//   [data-var-text] [data-var-src]   bound to the variables on DOMContentLoaded and for elements added later
//   --<id>                       every variable is a CSS custom property on the root (a colour variable "clay" is var(--clay))
//   OM.ready(promise)            a promise the page wants awaited before the first frame (fonts, an engine's boot);
//                                window.__hf.buildReady[key] = promise is the older form and still works
//   window.__omEngine            the renderer's handle: seek(t), duration(), media(), setFrames(), …
//   window.__omReady / __omBootFailed   the start-up handshake the renderer waits for
(function () {
  if (window.__omEngine) return;
  const cfg = window.__omConfig || {};
  const SETTLE_MS = cfg.settleTimeout || 15000;

  const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  // Wait for the browser to have laid out and painted what the seek changed: `paintWaits` animation frames (default 2).
  const PAINT = cfg.paintWaits == null ? 2 : cfg.paintWaits;
  const raf2 = (ms = 5000) => new Promise((ok, fail) => {
    if (PAINT === 0) { void document.body.offsetHeight; return ok(); } // force style + layout, nothing more
    const timer = setTimeout(() => fail(new Error('the page did not paint (requestAnimationFrame never fired)')), ms);
    const step = (k) => requestAnimationFrame(() => (k > 1 ? step(k - 1) : (clearTimeout(timer), ok())));
    step(PAINT);
  });
  const within = (p, ms, what) => new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error(`${what} did not finish within ${ms} ms`)), ms);
    Promise.resolve(p).then((v) => { clearTimeout(timer); ok(v); }, (e) => { clearTimeout(timer); fail(e); });
  });

  // ---------- variables ----------
  const declared = () => {
    try { const d = JSON.parse(document.documentElement.getAttribute('data-composition-variables') || '[]'); return Array.isArray(d) ? d : []; } catch (e) { return []; }
  };
  function variables() {
    const v = {};
    const decl = declared();
    for (const d of decl) if (d && d.id != null && 'default' in d) v[d.id] = d.default;
    Object.assign(v, window.__omVariables || {});
    for (const d of decl) {
      if (!d || !(d.id in v)) continue;
      if (d.type === 'number' && typeof v[d.id] === 'string' && v[d.id].trim() !== '' && isFinite(Number(v[d.id]))) v[d.id] = Number(v[d.id]);
      if (d.type === 'boolean' && typeof v[d.id] === 'string') v[d.id] = v[d.id] === 'true';
    }
    return v;
  }
  // OM.vars() is the supported way to read them; window.__hyperframes.getVariables() is the name films written
  // before the engine had its own still use, so it stays as an alias.
  window.OM = window.OM || {};
  if (!window.OM.vars) window.OM.vars = variables;
  window.__hyperframes = window.__hyperframes || {};
  if (!window.__hyperframes.getVariables) window.__hyperframes.getVariables = variables;

  function bind(root) {
    if (!root || root.nodeType !== 1) return;
    const v = variables();
    const nodes = [...(root.matches('[data-var-text],[data-var-src]') ? [root] : []), ...root.querySelectorAll('[data-var-text],[data-var-src]')];
    for (const el of nodes) {
      const t = el.getAttribute('data-var-text'), s = el.getAttribute('data-var-src');
      if (t != null && t in v && el.textContent !== String(v[t])) el.textContent = String(v[t]);
      if (s != null && s in v && v[s] != null && el.getAttribute('src') !== String(v[s])) el.setAttribute('src', String(v[s]));
    }
  }
  // Every variable is also a CSS custom property on the root: a colour variable "clay" is var(--clay) in the stylesheet,
  // and the studio's colour pickers rely on it. Compositions use this without declaring the property themselves.
  function cssVars() {
    const v = variables(), st = document.documentElement.style;
    for (const [k, val] of Object.entries(v)) if (val != null && typeof val !== 'object' && /^[\w-]+$/.test(k)) st.setProperty('--' + k, String(val));
  }
  document.addEventListener('DOMContentLoaded', () => {
    cssVars();
    bind(document.documentElement);
    new MutationObserver((list) => { for (const m of list) m.addedNodes.forEach(bind); }).observe(document.documentElement, { childList: true, subtree: true });
  });

  // ---------- ready promises ----------
  window.__timelines = window.__timelines || {};
  window.__hf = window.__hf || {};
  window.__hf.buildReady = window.__hf.buildReady || {};
  let readyN = 0;
  window.OM = window.OM || {};
  window.OM.ready = (p) => { window.__hf.buildReady['om:' + readyN++] = Promise.resolve(p); return p; };

  const timelines = () => Object.values(window.__timelines).filter((t) => t && typeof t.seek === 'function');
  const root = () => document.querySelector('[data-composition-id]');

  // ---------- media ----------
  const state = { mode: cfg.video === 'seek' || cfg.video === 'live' ? cfg.video : 'extract', muted: false, fps: 30, frames: new Map(), prepared: new WeakSet(), warnings: [], maxSeekError: 0, seeks: 0, rvfcMissed: 0 };
  let mediaN = 0;
  const videos = () => [...document.querySelectorAll('video')];
  function describe(el) {
    if (!el.id) el.id = 'om-media-' + (++mediaN);
    const start = num(el.getAttribute('data-start'), 0);
    const duration = num(el.getAttribute('data-duration'), Infinity);
    return {
      id: el.id, tag: el.tagName.toLowerCase(), src: el.currentSrc || el.getAttribute('src') || el.getAttribute('data-om-src') || '',
      start, duration, mediaStart: num(el.getAttribute('data-media-start') ?? el.getAttribute('data-playback-start'), 0),
      rate: Math.min(10, Math.max(0.1, num(el.getAttribute('data-playback-rate'), 1))), volume: num(el.getAttribute('data-volume'), 1),
      // as the film wrote it: the engine mutes every video it takes over, which must not drop a clip's own sound from the mix
      muted: el.dataset.omMuted != null ? el.dataset.omMuted === '1' : el.muted || el.hasAttribute('muted'),
    };
  }
  const media = () => [...document.querySelectorAll('video,audio')].map(describe);

  // The frame a player would show at media time m: the last one at or before it.
  function frameIndex(table, m) {
    const p = table.pts;
    let lo = 0, hi = p.length - 1;
    if (m <= p[0] + 1e-3) return 0;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (p[mid] <= m + 1e-3) lo = mid; else hi = mid - 1; }
    return lo;
  }
  const frameUrl = (table, i) => table.base + String(i + 1).padStart(8, '0') + '.' + table.ext;
  const loadImage = async (url, id) => {
    const im = new Image();
    im.src = url;
    try { await im.decode(); } catch (e) { throw new Error(`missing video frame for #${id}: ${url}`); }
  };

  async function prepareVideo(el) {
    // Render mode never plays the file: the element stays where it is (layout, class, transform, filter all
    // untouched) and shows the frame we hand it as its poster.
    if (el.dataset.omMuted == null) el.dataset.omMuted = el.muted || el.hasAttribute('muted') ? '1' : '0';
    el.muted = true;
    el.removeAttribute('autoplay'); el.removeAttribute('loop'); el.removeAttribute('controls');
    try { el.pause(); } catch (e) { /* not loaded */ }
    if (state.mode === 'extract') {
      if (el.hasAttribute('src')) { el.setAttribute('data-om-src', el.getAttribute('src')); el.removeAttribute('src'); }
      for (const s of el.querySelectorAll('source')) s.remove();
      el.preload = 'none';
      el.load();
    } else if (el.readyState < 1) {
      await within(new Promise((ok, fail) => { el.addEventListener('loadedmetadata', ok, { once: true }); el.addEventListener('error', () => fail(new Error(`video #${el.id} failed to load: ${el.currentSrc}`)), { once: true }); el.preload = 'auto'; el.load(); }), SETTLE_MS, `video #${el.id}`);
    }
    state.prepared.add(el);
  }

  async function syncVideo(el, t) {
    const d = describe(el);
    const active = t >= d.start - 1e-6 && t < d.start + d.duration - 1e-6;
    if (!active) { if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'; return; }
    if (el.style.visibility === 'hidden') el.style.visibility = '';
    if (!state.prepared.has(el)) await prepareVideo(el);
    const m = (t - d.start) * d.rate + d.mediaStart;
    if (state.mode === 'extract') {
      const table = state.frames.get(d.id);
      if (!table) throw new Error(`video #${d.id} (${d.src}) has no extracted frames — it appeared after the renderer looked for media`);
      const i = frameIndex(table, m);
      const span = table.pts.length > 1 ? (table.pts[table.pts.length - 1] - table.pts[0]) / (table.pts.length - 1) : 0.1;
      if (i === table.pts.length - 1 && m > table.pts[i] + 2 * span + 0.05 && !state.warnings.includes(`#${d.id} ended`)) state.warnings.push(`#${d.id} ended`);
      const url = frameUrl(table, i);
      if (el.getAttribute('poster') !== url) { await loadImage(url, d.id); el.setAttribute('poster', url); }
      return;
    }
    const target = Math.max(0, Math.min(m, (el.duration || Infinity) - 1e-3));
    if (Math.abs(el.currentTime - target) > 1e-4 || !el.dataset.omSeeked) {
      const done = new Promise((ok) => el.addEventListener('seeked', ok, { once: true }));
      el.currentTime = target;
      await within(done, SETTLE_MS, `seeking video #${d.id}`);
      el.dataset.omSeeked = '1';
      state.seeks++;
      if ('requestVideoFrameCallback' in el) {
        // which frame was actually presented (its media time) — a measure of how exact the browser's seek was
        const shown = await within(new Promise((ok) => el.requestVideoFrameCallback((_, md) => ok(md.mediaTime))), 300, 'presenting').catch(() => null);
        if (shown != null) state.maxSeekError = Math.max(state.maxSeekError, Math.abs(shown - target));
        else state.rvfcMissed++;
      }
    }
  }

  // ---------- signature ----------
  // "Made with huashu-motion" in a corner for the last SIG_SHOW seconds, so a film that travels says where it came from.
  // It is part of the picture everywhere the engine runs (render, still, check, studio, share page), drawn in the film's
  // own typeface and text colour, in the first corner where it covers no text or picture. A pure function of t and the
  // page at t, like everything else. Off with data-om-signature="off" on <html> or the root; a corner name pins it
  // (bottom-right, bottom-left, top-right, top-left). Never on an overlay render or a film shorter than SIG_MIN seconds.
  const SIG_SHOW = 1.2, SIG_FADE = 0.3, SIG_MIN = 4, SIG_ALPHA = 0.78;
  const CORNERS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
  let sig = null, sigCorner = null;
  function signatureSetting() {
    const r = root();
    const v = ((r && r.getAttribute('data-om-signature')) || document.documentElement.getAttribute('data-om-signature') || 'auto').trim().toLowerCase();
    if (cfg.transparent) return { on: false, why: 'overlay render' };
    if (/^(off|none|false|no|0)$/.test(v)) return { on: false, why: 'data-om-signature="off"' };
    if (!r) return { on: false, why: 'not a composition' };
    const d = duration();
    if (d < SIG_MIN) return { on: false, why: `shorter than ${SIG_MIN}s` };
    return { on: true, corner: CORNERS.includes(v) ? v : 'auto', from: d - SIG_SHOW };
  }
  const rgba = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const seen = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return 0; o *= Number(s.opacity); } return o; };
  // What the film shows in the frame, as boxes: visible text, and pictures smaller than most of the frame (a logo, a phone).
  function contentBoxes(W, H) {
    const boxes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      const el = n.parentElement;
      if (!el || sig.contains(el) || !n.textContent.trim() || /^(SCRIPT|STYLE|NOSCRIPT|TITLE)$/.test(el.tagName) || seen(el) < 0.05) continue;
      // SVG text has no client rects through a Range: its element's box stands in (the badge or label it belongs to)
      if (el.namespaceURI === 'http://www.w3.org/2000/svg') { const g = el.closest('g') || el, r = g.getBoundingClientRect(); boxes.push(r.width * r.height < 0.6 * W * H ? r : el.getBoundingClientRect()); continue; }
      const range = document.createRange(); range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 1 && r.height > 1) boxes.push(r);
    }
    for (const el of document.querySelectorAll('img,svg,video,canvas')) {
      if (sig.contains(el) || (el.tagName.toLowerCase() === 'svg' && el.parentElement && el.parentElement.closest('svg'))) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 1 && r.height > 1 && r.width * r.height < 0.6 * W * H && seen(el) >= 0.05) boxes.push(r);
    }
    return boxes;
  }
  // What a canvas shows inside a rect, read through a small copy (drawImage never touches the film's own context):
  // busy = something drawn there (text, a line, a logo), colour = its mean when it is opaque. A canvas the browser
  // will not let us read (tainted, a cleared WebGL buffer) reports nothing.
  function canvasAt(a, w, h) {
    let busy = false, color = null;
    for (const cv of document.querySelectorAll('canvas')) {
      if (!cv.width || !cv.height || seen(cv) < 0.05) continue;
      const cr = cv.getBoundingClientRect();
      if (cr.right <= a.left || cr.left >= a.left + w || cr.bottom <= a.top || cr.top >= a.top + h) continue;
      try {
        const sx = cv.width / cr.width, sy = cv.height / cr.height, n = 48, m = Math.max(4, Math.round(n * h / w));
        const tmp = document.createElement('canvas'); tmp.width = n; tmp.height = m;
        const g = tmp.getContext('2d');
        g.drawImage(cv, (a.left - cr.left) * sx, (a.top - cr.top) * sy, w * sx, h * sy, 0, 0, n, m);
        const d = g.getImageData(0, 0, n, m).data;
        let k = 0, sum = [0, 0, 0], l1 = 0, l2 = 0, cover = 0;
        for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; k++; const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; l1 += y; l2 += y * y; sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; if (d[i + 3] > 240) cover++; }
        if (!k) continue;
        const sd = Math.sqrt(Math.max(0, l2 / k - (l1 / k) ** 2));
        if (sd > 14 || (k < n * m * 0.9 && k > n * m * 0.02)) busy = true; // edges, or shapes on a clear canvas
        if (cover > n * m * 0.9) color = sum.map((x) => x / k);
      } catch (e) { /* unreadable */ }
    }
    return { busy, color };
  }
  // The colour behind a point. CSS colours and opaque gradients count; a translucent gradient (grain, vignette) is skipped;
  // under a picture (image, canvas, video) we take the colour the film declares beneath it and say we are not sure.
  const stops = (img) => (img.match(/rgba?\([^)]*\)/g) || []).map(rgba);
  function backdrop(x, y) {
    let sure = true;
    for (const el of document.elementsFromPoint(x, y)) {
      if (sig.contains(el)) continue;
      const o = seen(el);
      if (o < 0.5) continue;
      if (el.tagName === 'CANVAS') { const k = canvasAt({ left: x - 2, top: y - 2 }, 4, 4).color; if (k) return { c: k, sure }; sure = false; continue; }
      if (/^(img|video|svg|iframe|picture)$/.test(el.tagName.toLowerCase())) { sure = false; continue; }
      const s = getComputedStyle(el);
      const c = rgba(s.backgroundColor);
      if (c && c[3] >= 0.9) return { c, sure };
      if (s.backgroundImage && s.backgroundImage !== 'none') {
        if (/url\(/.test(s.backgroundImage)) { sure = false; continue; }
        const st = stops(s.backgroundImage);
        if (st.length && o >= 0.9 && st.every((x) => x[3] >= 0.9)) return { c: [0, 1, 2].map((i) => st.reduce((a, x) => a + x[i], 0) / st.length), sure };
      }
    }
    return { c: [255, 255, 255], sure };
  }
  function updateSignature(t) {
    const set = signatureSetting();
    const show = set.on && t >= set.from - 1e-6;
    if (!show) { if (sig && sig.style.display !== 'none') sig.style.display = 'none'; sigCorner = null; return; }
    const r = root(), W = window.innerWidth, H = window.innerHeight, u = Math.min(W, H);
    if (!sig) {
      sig = document.createElement('div');
      sig.id = 'om-signature';
      sig.setAttribute('aria-hidden', 'true');
      sig.innerHTML = 'Made with <b>huashu-motion</b>';
      document.body.appendChild(sig);
    }
    const rs = getComputedStyle(r);
    Object.assign(sig.style, { display: 'block', position: 'fixed', zIndex: '2147483647', pointerEvents: 'none', whiteSpace: 'nowrap', margin: '0', padding: '0', fontFamily: rs.fontFamily, fontSize: Math.max(10, Math.round(u * 0.02)) + 'px', fontWeight: '400', lineHeight: '1', letterSpacing: '0.02em', fontStyle: 'normal', textTransform: 'none', top: 'auto', right: 'auto', bottom: 'auto', left: 'auto', opacity: '0', transform: 'none' });
    sig.firstElementChild.style.fontWeight = '700';
    // measure in place, then choose the corner (pointer-events forced on so layers that ignore the mouse still count as backdrop)
    const pad = Math.round(u * 0.035), w = sig.offsetWidth, h = sig.offsetHeight;
    const rect = (c) => ({ left: c.endsWith('left') ? pad : W - pad - w, top: c.startsWith('top') ? pad : H - pad - h });
    const hits = (c, boxes) => { const a = rect(c), m = u * 0.01; return boxes.some((b) => b.left < a.left + w + m && b.right > a.left - m && b.top < a.top + h + m && b.bottom > a.top - m) || canvasAt({ left: a.left - m, top: a.top - m }, w + 2 * m, h + 2 * m).busy; };
    const force = document.createElement('style'); force.textContent = '*{pointer-events:auto!important}#om-signature{pointer-events:none!important}';
    document.head.appendChild(force);
    let corner = set.corner, clear = true;
    if (corner === 'auto') { const boxes = contentBoxes(W, H); corner = CORNERS.find((c) => !hits(c, boxes)) || CORNERS[0]; clear = !hits(corner, boxes); }
    const at = rect(corner);
    const { c: bg, sure } = backdrop(at.left + w / 2, at.top + h / 2);
    force.remove();
    const own = rgba(rs.color);
    const fg = own && contrast(own, bg) >= 3 ? own : contrast([245, 245, 245], bg) >= contrast([20, 20, 20], bg) ? [245, 245, 245] : [20, 20, 20];
    sig.style.color = `rgb(${fg[0]}, ${fg[1]}, ${fg[2]})`;
    // over a picture the colour is a guess: a soft halo of the opposite tone keeps it legible
    sig.style.textShadow = sure ? 'none' : lum(fg) > 0.4 ? '0 0 0.5em rgba(0, 0, 0, 0.45)' : '0 0 0.5em rgba(255, 255, 255, 0.5)';
    const p = Math.min(1, Math.max(0, (t - set.from) / SIG_FADE)), e = p * p * (3 - 2 * p);
    Object.assign(sig.style, { left: at.left + 'px', top: at.top + 'px', opacity: String(SIG_ALPHA * e), transform: `translateY(${((1 - e) * h * 0.4).toFixed(2)}px)` });
    sigCorner = { corner, clear };
  }
  function signatureInfo() { const s = signatureSetting(); return { ...s, shown: sigCorner }; }

  // ---------- settle ----------
  async function settled() {
    const start = performance.now();
    for (;;) {
      await within(document.fonts.ready, SETTLE_MS, 'loading fonts');
      const waiting = Object.values(window.__hf.buildReady).filter(Boolean);
      await within(Promise.all(waiting), SETTLE_MS, 'the composition\'s ready promises (window.__hf.buildReady)');
      await Promise.all([...document.images].filter((i) => !i.complete).map((i) => within(new Promise((ok) => { i.addEventListener('load', ok, { once: true }); i.addEventListener('error', ok, { once: true }); }), SETTLE_MS, `image ${i.currentSrc}`)));
      if (document.fonts.status !== 'loading') break;
      if (performance.now() - start > SETTLE_MS) throw new Error(`fonts did not finish loading within ${SETTLE_MS} ms`);
    }
  }

  function duration() {
    const r = root();
    const fromRoot = r && num(r.getAttribute('data-duration'), 0);
    if (fromRoot > 0) return fromRoot;
    return timelines().reduce((m, t) => Math.max(m, t.duration()), 0);
  }

  async function seek(t) {
    state.t = t;
    for (const tl of timelines()) { tl.pause(); tl.seek(t, false); }
    for (const a of document.getAnimations()) {
      if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) continue;
      try { a.pause(); a.currentTime = t * 1000; } catch (e) { /* finished or detached */ }
    }
    for (const el of videos()) await syncVideo(el, t);
    for (const el of document.querySelectorAll('audio')) { el.muted = true; try { el.pause(); } catch (e) { /* ignore */ } }
    updateSignature(t);
    await settled();
    await raf2();
  }

  // The preview (om-player): the timelines jump to t at once, and footage and sound play natively, nudged back when they
  // drift. While paused, media sits on the exact frame of t. Nothing here waits — it runs on every animation frame.
  function preview(t, playing) {
    state.t = t;
    for (const tl of timelines()) { tl.pause(); tl.seek(t, false); }
    for (const a of document.getAnimations()) {
      if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) continue;
      try { a.pause(); a.currentTime = t * 1000; } catch (e) { /* finished or detached */ }
    }
    for (const el of document.querySelectorAll('video,audio')) {
      const d = describe(el);
      const active = t >= d.start - 1e-6 && t < d.start + d.duration - 1e-6;
      if (el.tagName === 'VIDEO') { const v = active ? '' : 'hidden'; if (el.style.visibility !== v) el.style.visibility = v; }
      if (!active) { if (!el.paused) el.pause(); continue; }
      const m = (t - d.start) * d.rate + d.mediaStart;
      el.muted = state.muted || d.muted;
      el.volume = Math.max(0, Math.min(1, d.volume));
      if (el.playbackRate !== d.rate) el.playbackRate = d.rate;
      if (playing) {
        if (el.paused) { el.currentTime = m; const p = el.play(); if (p && p.catch) p.catch(() => {}); }
        else if (Math.abs(el.currentTime - m) > 0.12) el.currentTime = m;
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - m) > 0.004) el.currentTime = m;
      }
    }
    updateSignature(t);
  }

  // Move the timelines through a list of times without painting or waiting: a worker that skipped frames catches up on
  // everything a timeline remembers (callbacks, onUpdate state) so it renders what a render from frame 0 would.
  function advance(times) {
    for (const t of times) for (const tl of timelines()) { tl.pause(); tl.seek(t, false); }
  }

  window.__omEngine = {
    duration, seek, advance, settled, media, variables, preview, signature: signatureInfo,
    setMuted(m) { state.muted = !!m; for (const el of document.querySelectorAll('video,audio')) el.muted = state.muted || el.hasAttribute('muted'); },
    setMode(m) { state.mode = m === 'seek' ? 'seek' : 'extract'; },
    setFrames(id, table) { state.frames.set(id, table); },
    stats: () => ({ mode: state.mode, warnings: state.warnings.slice(), maxSeekError: state.maxSeekError, seeks: state.seeks, rvfcMissed: state.rvfcMissed }),
    info() {
      const r = root();
      return {
        id: r && r.getAttribute('data-composition-id'),
        width: r ? num(r.getAttribute('data-width'), 1920) : 1920, height: r ? num(r.getAttribute('data-height'), 1080) : 1080,
        fps: r ? num(r.getAttribute('data-fps'), 30) : 30, duration: duration(),
        timelines: Object.keys(window.__timelines), labels: (timelines()[0] && timelines()[0].labels) || {},
      };
    },
  };

  // ---------- start-up handshake ----------
  // The renderer waits for __omReady (or __omBootFailed) before it asks for a single frame.
  window.addEventListener('load', async () => {
    try {
      await settled();
      for (const el of videos()) { describe(el); if (state.mode === 'extract') await prepareVideo(el); else if (state.mode === 'live') { el.removeAttribute('autoplay'); try { el.pause(); } catch (e) { /* not loaded */ } } } // frames come from disk: stop the file loading
      if (!cfg.lenient && !(duration() > 0)) throw new Error('the composition has no timeline: register a paused GSAP timeline in window.__timelines');
      window.__omReady = true;
    } catch (e) { window.__omBootFailed = String((e && e.message) || e); }
  });
})();
