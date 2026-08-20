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

test("footer pulse timer runs only while the agent is active", async (t) => {
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

    let renders = 0;
    const tui = { requestRender: () => { renders += 1; } };
    let pulseController;
    let footer;
    const config = {
      icons: { mode: "nerd" },
      contextStyle: "percent",
      footerSegments: { context: true },
    };
    installFooter(
      { ui: { setFooter: (component) => { footer = component; } } },
      {},
      () => config,
      {
        setRequestRender() {},
        scheduleProjectRefresh() {},
        setPulseController(fn) { pulseController = fn; },
      },
    );
    const footerInstance = footer(tui, {}, {
      getExtensionStatuses: () => new Map(),
      onBranchChange: () => () => {},
    });
    assert.equal(typeof pulseController, "function");

    // Idle install: no timer, no renders.
    t.mock.timers.tick(1000);
    assert.equal(renders, 0);

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

    // dispose detaches the controller and clears the timer.
    footerInstance.dispose();
    assert.equal(pulseController, undefined);
    t.mock.timers.tick(1000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
