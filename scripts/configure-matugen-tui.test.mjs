import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repo = new URL("..", import.meta.url).pathname;
const script = join(repo, "scripts/configure-matugen-tui.mjs");
const nativeThemeColors = {
  accent: "primary", border: "primary", borderAccent: "primary", borderMuted: "primary",
  success: "primary", error: "primary", warning: "primary", muted: "primary", dim: "primary", text: "primary", thinkingText: "primary",
  selectedBg: "primary", userMessageBg: "primary", userMessageText: "primary", customMessageBg: "primary", customMessageText: "primary", customMessageLabel: "primary",
  toolPendingBg: "primary", toolSuccessBg: "primary", toolErrorBg: "primary", toolTitle: "primary", toolOutput: "primary",
  mdHeading: "primary", mdLink: "primary", mdLinkUrl: "primary", mdCode: "primary", mdCodeBlock: "primary", mdCodeBlockBorder: "primary", mdQuote: "primary", mdQuoteBorder: "primary", mdHr: "primary", mdListBullet: "primary",
  toolDiffAdded: "primary", toolDiffRemoved: "primary", toolDiffContext: "primary",
  syntaxComment: "primary", syntaxKeyword: "primary", syntaxFunction: "primary", syntaxVariable: "primary", syntaxString: "primary", syntaxNumber: "primary", syntaxType: "primary", syntaxOperator: "primary", syntaxPunctuation: "primary",
  thinkingOff: "primary", thinkingMinimal: "primary", thinkingLow: "primary", thinkingMedium: "primary", thinkingHigh: "primary", thinkingXhigh: "primary", bashMode: "primary",
};
const templateBaseline = {
  name: "matugen",
  vars: { primary: "{{colors.primary.default.hex}}", primaryBright: "{{colors.primary_fixed.default.hex}}", diffRemoved: "{{colors.diff_removed.default.hex}}", surfaceLow: "{{colors.surface_container_low.default.hex}}", surfaceContainer: "{{colors.surface_container.default.hex}}", surfaceHigh: "{{colors.surface_container_high.default.hex}}", surfaceHighest: "{{colors.surface_container_highest.default.hex}}", surfaceBright: "{{colors.surface_bright.default.hex}}", surfaceVariant: "{{colors.surface_variant.default.hex}}", secondaryContainer: "{{colors.secondary_container.default.hex}}", errorColor: "{{colors.error.default.hex}}", warningColor: "{{colors.warning.default.hex}}", diffAdded: "{{colors.diff_added.default.hex}}" },
  colors: { ...nativeThemeColors, success: "diffAdded", error: "diffRemoved", warning: "warningColor", selectedBg: "surfaceHighest", userMessageBg: "secondaryContainer", toolPendingBg: "surfaceBright", toolSuccessBg: "surfaceVariant", toolErrorBg: "surfaceVariant", toolDiffRemoved: "diffRemoved", thinkingMax: "diffRemoved" },
};
const generatedBaseline = {
  name: "matugen",
  vars: { primary: "#ffb3ac", primaryBright: "#ffdad6", diffRemoved: "#ffb3ad", surfaceLow: "#231918", surfaceContainer: "#271d1c", surfaceHigh: "#322826", surfaceHighest: "#3d3231", surfaceBright: "#423735", surfaceVariant: "#534342", secondaryContainer: "#5d3f3c", errorColor: "#ffb4ab", warningColor: "#ffb782", diffAdded: "#acd28f" },
  colors: { ...nativeThemeColors, success: "diffAdded", error: "diffRemoved", warning: "warningColor", selectedBg: "surfaceHighest", userMessageBg: "secondaryContainer", toolPendingBg: "surfaceBright", toolSuccessBg: "surfaceVariant", toolErrorBg: "surfaceVariant", toolDiffRemoved: "diffRemoved", thinkingMax: "diffRemoved" },
};
async function fixture(t, edits = {}) {
  const home = await mkdtemp(join(tmpdir(), "matugen-tui-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const xdg = join(home, ".config");
  const agent = join(home, ".pi", "agent");
  const templatePath = join(xdg, "matugen", "templates", "pi-theme.json");
  const generatedPath = join(agent, "themes", "matugen.json");
  await mkdir(join(xdg, "matugen", "templates"), { recursive: true });
  await mkdir(join(agent, "themes"), { recursive: true });
  await writeFile(templatePath, `${JSON.stringify({ ...templateBaseline, ...edits.template }, null, 2)}\n`);
  await writeFile(generatedPath, `${JSON.stringify({ ...generatedBaseline, ...edits.generated }, null, 2)}\n`);
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: xdg, PI_CODING_AGENT_DIR: agent };
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env });
  return { home, xdg, agent, templatePath, generatedPath, run };
}

test("--check is non-mutating and apply is idempotent with preserved wallpaper/source fields", async (t) => {
  const f = await fixture(t, { template: { extra: { keep: true }, vars: { ...templateBaseline.vars, wallpaperVar: "{{colors.secondary.default.hex}}" } } });
  const beforeTemplate = await readFile(f.templatePath);
  const beforeGenerated = await readFile(f.generatedPath);
  const check = f.run("--check");
  assert.equal(check.status, 0, check.stderr);
  assert.deepEqual(await readFile(f.templatePath), beforeTemplate);
  assert.deepEqual(await readFile(f.generatedPath), beforeGenerated);
  const apply = f.run("--apply");
  assert.equal(apply.status, 0, apply.stderr);
  const migrated = JSON.parse(await readFile(f.templatePath, "utf8"));
  assert.equal(migrated.vars.wallpaperDiffRemoved, "{{colors.diff_removed.default.hex}}");
  assert.equal(migrated.vars.diffRemoved, "#DE9EAC");
  assert.equal(migrated.vars.wallpaperVar, "{{colors.secondary.default.hex}}");
  assert.deepEqual(migrated.extra, { keep: true });
  assert.equal(migrated.colors.error, "error");
  assert.equal(migrated.colors.toolErrorBg, "errorSurface");
  const afterTemplate = await readFile(f.templatePath);
  const afterGenerated = await readFile(f.generatedPath);
  const second = f.run("--apply");
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /already match/);
  assert.deepEqual(await readFile(f.templatePath), afterTemplate);
  assert.deepEqual(await readFile(f.generatedPath), afterGenerated);
});

test("invalid native theme schema stops before any file write", async (t) => {
  const f = await fixture(t, { generated: { colors: { ...generatedBaseline.colors, ...nativeThemeColors, accent: 256 } } });
  const beforeTemplate = await readFile(f.templatePath);
  const beforeGenerated = await readFile(f.generatedPath);
  const result = f.run("--apply");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /colors\.accent/);
  assert.deepEqual(await readFile(f.templatePath), beforeTemplate);
  assert.deepEqual(await readFile(f.generatedPath), beforeGenerated);
});

test("unknown overlapping edits stop before any file write", async (t) => {
  const f = await fixture(t, { generated: { colors: { ...generatedBaseline.colors, error: "my-error-choice" } } });
  const beforeTemplate = await readFile(f.templatePath);
  const beforeGenerated = await readFile(f.generatedPath);
  const result = f.run("--apply");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown overlapping edit/);
  assert.deepEqual(await readFile(f.templatePath), beforeTemplate);
  assert.deepEqual(await readFile(f.generatedPath), beforeGenerated);
});

test("backup manifest rollback restores originals and guards changed post-apply files", async (t) => {
  const f = await fixture(t);
  const originalTemplate = await readFile(f.templatePath);
  const originalGenerated = await readFile(f.generatedPath);
  const apply = f.run("--apply");
  assert.equal(apply.status, 0, apply.stderr);
  const backupDir = apply.stdout.match(/Backup manifest: (.+)\/manifest\.json/)[1];
  const appliedTemplate = await readFile(f.templatePath);
  const appliedGenerated = await readFile(f.generatedPath);
  const manifest = JSON.parse(await readFile(join(backupDir, "manifest.json"), "utf8"));
  assert.equal(manifest.files.length, 2);
  await writeFile(f.generatedPath, `${appliedGenerated.toString("utf8")}\n`);
  const refused = f.run("--rollback", backupDir);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /post-apply hash mismatch/);
  await writeFile(f.generatedPath, appliedGenerated);
  const rollback = f.run("--rollback", backupDir);
  assert.equal(rollback.status, 0, rollback.stderr);
  assert.deepEqual(await readFile(f.templatePath), originalTemplate);
  assert.deepEqual(await readFile(f.generatedPath), originalGenerated);
});

test("semantic mapping and wallpaper colors hold across five wallpaper hues", async (t) => {
  const hues = ["#D46A80", "#6A8ED4", "#5FAE8A", "#D49D5A", "#9A6AD4"];
  for (const [index, hue] of hues.entries()) {
    const f = await fixture(t, {
      template: { vars: { ...templateBaseline.vars, diffRemoved: hue } },
      generated: { vars: { ...generatedBaseline.vars, diffRemoved: hue } },
    });
    const applied = f.run("--apply");
    assert.equal(applied.status, 0, `hue ${index + 1}: ${applied.stderr}`);
    for (const path of [f.templatePath, f.generatedPath]) {
      const theme = JSON.parse(await readFile(path, "utf8"));
      assert.equal(theme.vars.wallpaperDiffRemoved, hue);
      assert.equal(theme.vars.diffRemoved, "#DE9EAC");
      assert.equal(theme.vars.error, "#FF6B81");
      assert.equal(theme.vars.errorSurface, "#301C24");
      assert.equal(theme.vars.errorInk, "#241217");
      assert.equal(theme.vars.success, "#A6DFB5");
      assert.equal(theme.vars.warning, "#F2C879");
      assert.equal(theme.colors.error, "error");
      assert.equal(theme.colors.toolDiffRemoved, "diffRemoved");
      assert.equal(theme.colors.thinkingMax, "primaryBright");
      assert.equal(theme.colors.toolSuccessBg, "surfaceLow");
      assert.equal(theme.colors.toolPendingBg, "surfaceContainer");
      assert.equal(theme.colors.toolErrorBg, "errorSurface");
      assert.equal(theme.colors.userMessageBg, "surfaceLow");
    }
  }
});
