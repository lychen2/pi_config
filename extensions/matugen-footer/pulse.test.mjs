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

test("footer stays on one row and pulses only while the agent is active", async (t) => {
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
    const extensionStatuses = new Map();
    installFooter(
      {
        cwd: sourceDir,
        getContextUsage: () => ({ percent: 25, contextWindow: 128000 }),
        ui: { setFooter: (component) => { footer = component; } },
      },
      createInitialState(emptyGitStatus()),
      () => config,
      {
        setRequestRender() {},
        scheduleProjectRefresh() {},
        setPulseController(fn) { pulseController = fn; },
      },
    );
    const footerInstance = footer(tui, { fg: (_color, text) => text }, {
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

    // The real footer must occupy one row at both narrow and wide widths.
    config = defaultConfig;
    for (const width of [1, 2, 20, 80, 160]) {
      const lines = footerInstance.render(width);
      assert.equal(lines.length, 1, `footer at width ${width} must not add a bottom gutter`);
      assert.ok(visibleWidth(lines[0]) <= width, `footer must fit width ${width}`);
      if (width >= 20) assert.ok(lines[0].trim(), "footer content must remain visible");
    }

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
