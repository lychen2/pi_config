// om share — after the render, the things a person needs to post the film: a GIF small enough for a README, X or a
// chat (≤ 10 MB: the opening plus the end frame with its signature), and share.md with where each file goes, a slot for
// the post the agent writes in the user's language, the line that says where the film came from, and a README snippet.
// Nothing is uploaded or posted: the user decides where it goes.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { OmError } from './project.js';
import { REPO_URL } from './export.js';

const LIMIT = 10 * 1024 * 1024; // GitHub's limit for an image in a README; X and most chats take more
const END = 1.6; // the end frame and its signature (the engine shows it for the last 1.2 s)
const run = (args) => spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });

function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new OmError(`cannot read ${file}: ${(r.stderr || '').trim()}`);
  const j = JSON.parse(r.stdout);
  return { width: j.streams[0].width, height: j.streams[0].height, duration: Number(j.format.duration) };
}

// The newest video in <project>/out (the share folder itself is skipped).
export function newestRender(project) {
  const dir = join(project.root, 'out');
  const vids = existsSync(dir) ? readdirSync(dir).filter((n) => /\.(mp4|mov|webm)$/i.test(n) && statSync(join(dir, n)).size > 0).map((n) => join(dir, n)) : [];
  if (!vids.length) throw new OmError('nothing rendered yet — run `om render` first');
  return vids.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

// The GIF: [from, to] of the film, then its last END seconds when those are not already in it. Tried at falling sizes
// (then frame rates) until it fits under LIMIT; each try makes its own palette.
export function makeShareGif(video, target, { from = 0, to = null, limit = LIMIT } = {}) {
  const info = probe(video);
  const d = info.duration;
  to = Math.min(d, to == null ? Math.max(from + 1, Math.min(d, from + 10)) : Number(to));
  from = Math.max(0, Math.min(Number(from) || 0, to - 0.5));
  const withEnd = to < d - END - 0.3;
  const parts = withEnd ? [[from, to], [d - END, d]] : [[from, d - to < 0.3 ? d : to]];
  const landscape = info.width >= info.height;
  const sizes = [960, 800, 640, 540, 480, 400].filter((s) => s <= (landscape ? info.width : info.height));
  if (!sizes.length) sizes.push(landscape ? info.width : info.height);
  const tries = [...sizes.map((s) => [s, 15]), [sizes[sizes.length - 1], 12], [sizes[sizes.length - 1], 10]];
  const palette = target.replace(/\.gif$/i, '.palette.png');
  let last = null;
  try {
    for (const [s, fps] of tries) {
      const scale = landscape ? `scale=${s}:-2:flags=lanczos` : `scale=-2:${s}:flags=lanczos`;
      const cut = parts.map(([a, b], i) => `[0:v]trim=${a.toFixed(3)}:${b.toFixed(3)},setpts=PTS-STARTPTS,fps=${fps},${scale}[p${i}]`).join(';');
      const joined = parts.length > 1 ? `${cut};${parts.map((_, i) => `[p${i}]`).join('')}concat=n=${parts.length}:v=1:a=0[v]` : `${cut};[p0]null[v]`;
      let r = run(['-i', video, '-filter_complex', `${joined};[v]palettegen=max_colors=256:stats_mode=diff[pal]`, '-map', '[pal]', '-frames:v', '1', '-update', '1', palette]);
      if (r.status !== 0) throw new OmError(`could not make the GIF palette: ${(r.stderr || '').trim().split('\n').pop()}`);
      r = run(['-i', video, '-i', palette, '-filter_complex', `${joined};[v][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, '-loop', '0', target]);
      if (r.status !== 0) throw new OmError(`could not write the GIF: ${(r.stderr || '').trim().split('\n').pop()}`);
      last = { size: statSync(target).size, px: s, fps };
      if (last.size <= limit) break;
    }
  } finally { rmSync(palette, { force: true }); }
  return { ...last, parts, fits: last.size <= limit, landscape, source: info };
}

const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';
const t = (s) => s.toFixed(1) + 's';

export function share(project, { from = 0, to = null, video = null } = {}) {
  const src = video || newestRender(project);
  const index = join(project.root, 'index.html');
  const stale = existsSync(index) && statSync(index).mtimeMs > statSync(src).mtimeMs + 1000;
  const dir = join(project.root, 'out', 'share');
  mkdirSync(dir, { recursive: true });
  const name = basename(src).replace(/\.[^.]+$/, '');
  const gif = join(dir, `${name}.gif`);
  const g = makeShareGif(src, gif, { from, to });
  const rel = (f) => relative(project.root, f).split('\\').join('/');
  const span = g.parts.map(([a, b]) => `${t(a)}–${t(b)}`).join(' + ');
  const md = `# 分享包 · Share kit

| 文件 File | 用途 Use |
|---|---|
| \`${rel(src)}\` | 完整成片（${t(g.source.duration)}，${g.source.width}×${g.source.height}）：X、视频号、B站、小红书、抖音 |
| \`${rel(gif)}\` | 动图（${span}，${g.px}px，${g.fps} fps，${mb(g.size)}）：GitHub README 头图、X、即刻、群聊 |

## 发帖文案 · Post

<!-- agent: write 2–3 sentences in the user's language: what the film is about and one concrete detail of how it was made
(the one-line request, a note given in the studio, the music it composed). Keep the last line as it is. -->

Made with huashu-motion · ${REPO_URL} #huashumotion

## README 头图 · README header

\`\`\`html
<a href="${REPO_URL}"><img src="${rel(gif)}" alt="" width="100%"></a>
<sub>Made with <a href="${REPO_URL}">huashu-motion</a></sub>
\`\`\`
`;
  const mdFile = join(dir, 'share.md');
  writeFileSync(mdFile, md);
  const lines = [`share    ${dir}`, `  ${rel(gif).padEnd(34)} ${span}, ${g.px}px ${g.fps} fps, ${mb(g.size)}${g.fits ? '' : `  — still over ${mb(LIMIT)}: pass a shorter --from/--to`}`, `  ${rel(mdFile).padEnd(34)} write the post into it (the user's language), then show the user`];
  if (stale) lines.push(`  ! ${rel(src)} is older than index.html — run om render first if the film changed since`);
  return lines.join('\n');
}
