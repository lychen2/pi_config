import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The footer chain value-imports @earendil-works/pi-coding-agent (getAgentDir)
// and @earendil-works/pi-tui (truncateToWidth/visibleWidth). matugen-footer is a
// copied directory, not a package with devDependencies, so this test stages a
// temp copy with symlinked runtime shims instead of touching the tree.
const sourceDir = fileURLToPath(new URL(".", import.meta.url));
const upstreamScope = join(
  fileURLToPath(new URL("../pi-tool-rails/node_modules/@earendil-works", import.meta.url)),
);

// Node strip-types needs explicit .ts extensions; Pi's loader resolves the
// extensionless relative imports directly.
async function appendTsExtensions(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await appendTsExtensions(full);
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    const text = await readFile(full, "utf8");
    const rewritten = text.replace(/(\bfrom\s*)(["'])(\.{1,2}\/[^"']+)\2/g, (match, head, quote, spec) => {
      if (/\.[a-z]+$/i.test(spec)) return match;
      return existsSync(join(dir, `${spec}.ts`)) ? `${head}${quote}${spec}.ts${quote}` : match;
    });
    if (rewritten !== text) await writeFile(full, rewritten);
  }
}

test("adaptive footer keeps useful information with portrait and custom-format animation", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });

  const root = await mkdtemp(join(tmpdir(), "matugen-pulse-test-"));
  try {
    await cp(sourceDir, root, {
      recursive: true,
      filter: (source) => !source.includes(`${join("", "node_modules")}`),
    });
    await appendTsExtensions(root);
    const scope = join(root, "node_modules", "@earendil-works");
    await mkdir(scope, { recursive: true });
    await symlink(join(upstreamScope, "pi-coding-agent"), join(scope, "pi-coding-agent"), "dir");
    await symlink(join(upstreamScope, "pi-tui"), join(scope, "pi-tui"), "dir");

    const { installFooter } = await import(
      `${pathToFileURL(join(root, "footer.ts")).href}?pulse-test=${Date.now()}`
    );

    const { defaultConfig } = await import(pathToFileURL(join(root, "config.ts")).href);
    const { createInitialState } = await import(pathToFileURL(join(root, "state.ts")).href);
    const { emptyGitStatus } = await import(pathToFileURL(join(root, "git.ts")).href);
    const { visibleWidth } = await import(
      pathToFileURL(join(upstreamScope, "pi-tui", "dist", "index.js")).href
    );

    let renders = 0;
    const tui = { requestRender: () => { renders += 1; } };
    let pulseController;
    let footer;
    let config = defaultConfig;
    let contextPercent = 25;
    const state = createInitialState(emptyGitStatus());
    state.modelLabel = "test-model";
    state.branch = "feature/显示宽度";
    state.runtime = { name: "nodejs", symbol: "node", version: "22.19.0", style: "green" };
    const colors = new Set();
    let useAnsi = false;
    const { dashboard } = await import("../pi-tool-rails/dashboard-state.ts");
    const wasActive = dashboard.active;
    t.after(() => { dashboard.active = wasActive; });
    dashboard.active = false;
    const extensionStatuses = new Map();
    installFooter(
      {
        cwd: sourceDir,
        getContextUsage: () => ({ percent: contextPercent, contextWindow: 128000 }),
        ui: { setFooter: (component) => { footer = component; } },
      },
      state,
      () => config,
      {
        setRequestRender() {},
        scheduleProjectRefresh() {},
        setPulseController(fn) { pulseController = fn; },
      },
    );
    const footerInstance = footer(tui, { fg: (color, text) => {
      colors.add(color);
      return useAnsi ? `\x1b[36m${text}\x1b[39m` : text;
    } }, {
      getExtensionStatuses: () => extensionStatuses,
      onBranchChange: () => () => {},
    });
    assert.equal(typeof pulseController, "function");

    // Idle install: no timer, no renders.
    t.mock.timers.tick(1000);
    assert.equal(renders, 0);

    // Reduced motion suppresses the decorative pulse despite active work.
    const previousMotion = process.env.PI_TOOL_RAILS_REDUCED_MOTION;
    process.env.PI_TOOL_RAILS_REDUCED_MOTION = "1";
    pulseController(true);
    const afterReducedStart = renders;
    t.mock.timers.tick(1000);
    assert.equal(renders, afterReducedStart, "reduced motion must not schedule animation");
    config = { ...defaultConfig, footerFormat: "STATE" };
    assert.match(footerInstance.render(40)[0], /=\^\.\^=~ /, "busy reduced motion holds a static cat");
    if (previousMotion === undefined) delete process.env.PI_TOOL_RAILS_REDUCED_MOTION;
    else process.env.PI_TOOL_RAILS_REDUCED_MOTION = previousMotion;

    // agent_start: pulse renders on the 250ms cadence.
    pulseController(true);
    t.mock.timers.tick(1000);
    assert.ok(renders >= 3, `expected >= 3 active renders, got ${renders}`);

    // Re-enabling while already active must not stack a second interval.
    const beforeReenable = renders;
    pulseController(true);
    t.mock.timers.tick(500);
    assert.equal(renders - beforeReenable, 2, "a second interval must not stack");

    // agent_end: timer stops; idle renders stay flat.
    pulseController(false);
    t.mock.timers.tick(250);
    const afterStop = renders;
    t.mock.timers.tick(1000);
    assert.equal(renders, afterStop);

    // The pet occupies the spare right edge without losing status content.
    config = { ...defaultConfig, footerFormat: "STATE" };
    assert.match(footerInstance.render(40)[0], /=-\.-= z $/, "idle cat sleeps at the right edge");
    assert.doesNotMatch(footerInstance.render(15)[0], /=-\.-= z/, "one column short hides the entire cat");
    assert.match(footerInstance.render(16)[0], /STATE.*=-\.-= z/, "exact-fit width keeps both status and cat");
    for (const width of [16, 20, 40, 80]) {
      pulseController(true);
      const before = footerInstance.render(width)[0];
      t.mock.timers.tick(750);
      const after = footerInstance.render(width)[0];
      assert.match(before, /=\^\.\^=~ /);
      assert.match(after, /=\^\.\^=- /);
      assert.equal(visibleWidth(before), visibleWidth(after), "animation must not change line width");
      pulseController(false);
    }
    extensionStatuses.set("test-status", "IMPORTANT");
    const crowded = footerInstance.render(24)[0];
    assert.match(crowded, /STATE/);
    assert.match(crowded, /IMPORTANT/);
    assert.doesNotMatch(crowded, /=.*= z/, "extension status takes priority over pet");
    extensionStatuses.clear();
    config = { ...defaultConfig, footerFormat: "LEFT${fill}MIDDLE${fill}RIGHT" };
    const threeSections = footerInstance.render(40)[0];
    for (const text of ["LEFT", "MIDDLE", "RIGHT", "=-.-= z"]) assert.ok(threeSections.includes(text));

    // ASCII icons and text-only context still animate the ASCII pet.
    config = { ...defaultConfig, icons: { ...defaultConfig.icons, mode: "ascii" }, contextStyle: "text", footerFormat: "STATE" };
    pulseController(true);
    const beforeAsciiTick = renders;
    t.mock.timers.tick(250);
    assert.equal(renders - beforeAsciiTick, 1);

    // Exercise the mounted footer with ANSI colors, wide text, and narrow widths.
    useAnsi = true;
    config = defaultConfig;
    pulseController(false);
    pulseController(true);
    const beforeAdaptiveTick = renders;
    t.mock.timers.tick(1000);
    assert.equal(renders, beforeAdaptiveTick, "adaptive layout has no decorative timer");
    const plain = (text) => text.replace(/\x1b\[[0-9;]*m/g, "");
    for (const portrait of [false, true]) {
      dashboard.active = portrait;
      for (const width of [1, 2, 20, 40, 80, 160]) {
        const lines = footerInstance.render(width);
        assert.equal(lines.length, 2);
        for (const line of lines) assert.ok(visibleWidth(line) <= width, `footer must fit width ${width}`);
      }
      const text = footerInstance.render(160).map(plain).join("\n");
      assert.match(text, /feature\/显示宽度/);
      assert.match(text, /22\.19\.0/);
      for (const value of ["Working", "test-model", "25%", "↑0", "$0.000", "matugen-footer", "up for"]) assert.ok(text.includes(value), value);
    }
    // A fresh session outside a project must retain useful content with portrait active.
    state.branch = undefined;
    state.runtime = undefined;
    pulseController(false);
    const fresh = footerInstance.render(80).map(plain);
    assert.match(fresh[0], /matugen-footer/);
    assert.match(fresh[1], /Ready/);
    for (const width of [20, 40, 80]) {
      for (const line of footerInstance.render(width).map(plain)) assert.ok(line.trim());
    }
    dashboard.active = false;
    extensionStatuses.set("test-status", "IMPORTANT");
    const withStatus = footerInstance.render(40).map(plain);
    assert.equal(withStatus.length, 3);
    assert.match(withStatus[2], /IMPORTANT/);
    extensionStatuses.clear();
    contextPercent = 95;
    colors.clear();
    assert.match(plain(footerInstance.render(20)[0]), /95%/);
    assert.ok(colors.has("error"), "context warning must use the active theme's semantic color");

    // dispose detaches the controller and clears the timer.
    footerInstance.dispose();
    assert.equal(pulseController, undefined);
    const afterDispose = renders;
    t.mock.timers.tick(1000);
    assert.equal(renders, afterDispose, "dispose must stop a live animation timer");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
