import assert from "node:assert/strict";
import test from "node:test";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = "/home/zonazcy/pi_config";
const controllerFile = join(repoRoot, "extensions/pi-large-mode/index.ts");
const controllerPackage = join(repoRoot, "extensions/pi-large-mode");
const flowSource = "npm:pi-maestro-flow@0.19.0";

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function createFlowCache(root, agentDir, maestroDir) {
  const inactiveRoot = join(root, ".pi-large-mode", "inactive");
  const inactiveAgent = join(inactiveRoot, "agent");
  const inactiveNpm = join(inactiveAgent, "npm");
  const inactiveMaestro = join(inactiveRoot, "maestro");
  const teammatePath = join(agentDir, "npm", "node_modules", "pi-maestro-teammate");
  const cockpitPath = join(agentDir, "npm", "node_modules", "pi-cockpit");
  const beautifyPath = join(agentDir, "npm", "node_modules", "pi-large-beautify");

  await writeJson(join(inactiveNpm, "package.json"), {
    name: "pi-extensions",
    private: true,
    dependencies: { "pi-maestro-flow": "^0.19.0" },
  });
  await writeJson(join(inactiveNpm, "package-lock.json"), {
    name: "pi-extensions",
    lockfileVersion: 3,
    packages: {
      "": { name: "pi-extensions", dependencies: { "pi-maestro-flow": "^0.19.0" } },
      "node_modules/pi-maestro-flow": {
        version: "0.19.0",
        dependencies: {
          "pi-maestro-teammate": "1.12.0",
          "pi-cockpit": "0.14.0",
        },
      },
      "node_modules/pi-maestro-teammate": { version: "1.12.0" },
      "node_modules/pi-cockpit": { version: "0.14.0" },
    },
  });
  await writeJson(join(inactiveNpm, "node_modules", "pi-maestro-flow", "package.json"), {
    name: "pi-maestro-flow",
    version: "0.19.0",
    dependencies: {
      "pi-maestro-teammate": "1.12.0",
      "pi-cockpit": "0.14.0",
    },
  });
  await writeJson(join(inactiveNpm, "node_modules", "pi-maestro-teammate", "package.json"), {
    name: "pi-maestro-teammate",
    version: "1.12.0",
  });
  await writeJson(join(inactiveNpm, "node_modules", "pi-cockpit", "package.json"), {
    name: "pi-cockpit",
    version: "0.14.0",
  });
  await writeJson(join(inactiveNpm, "node_modules", "pi-large-beautify", "package.json"), {
    name: "pi-large-beautify",
    version: "0.1.0",
    pi: {
      extensions: [
        "./index.ts",
        "../pi-maestro-teammate/src/extension/index.ts",
        "../pi-cockpit/src/extension/index.ts",
      ],
      themes: ["./themes"],
    },
  });
  await writeFile(join(inactiveNpm, "node_modules", "pi-large-beautify", "index.ts"), "export default () => {};\n");
  await writeJson(join(inactiveNpm, "node_modules", "pi-large-beautify", "themes", "matugen.json"), { name: "matugen" });
  await writeJson(join(inactiveAgent, "settings.json"), {
    defaultProvider: "manager",
    defaultModel: "manager/gpt-5.6-sol",
    packages: [flowSource, beautifyPath],
    extensions: [controllerFile, "!**/*", `+${controllerFile}`],
    skills: ["!**/*"],
    prompts: ["!**/*"],
    themes: ["!**/*"],
  });
  await writeJson(join(inactiveAgent, "keybindings.json"), {
    "app.thinking.cycle": ["ctrl+shift+e"],
  });
  await writeJson(join(inactiveAgent, "pi-maestro-flow-companions.json"), {
    version: 1,
    companions: {
      "pi-maestro-teammate": {
        source: teammatePath,
        canonicalSource: teammatePath,
        version: "1.12.0",
      },
      "pi-cockpit": {
        source: cockpitPath,
        canonicalSource: cockpitPath,
        version: "0.14.0",
      },
    },
  });

  for (const name of ["workflows", "arch-kb", "prepare", "ref", "manifests"]) {
    await mkdir(join(inactiveMaestro, name), { recursive: true });
  }
  for (const name of ["workflows", "arch-kb", "prepare", "ref"]) {
    await writeFile(join(inactiveMaestro, name, "fixture.txt"), `${name}\n`);
  }
  await writeJson(join(inactiveMaestro, "manifests", "fixture.json"), { installed: true });
  const marker = {
    kind: "pi-large-flow",
    flowSource,
    profileVersion: 3,
    createdAt: new Date().toISOString(),
  };
  await writeJson(join(inactiveNpm, "pi-large-profile.json"), marker);
  await writeJson(join(inactiveMaestro, "pi-large-profile.json"), marker);
  await writeJson(join(root, ".pi-large-mode", "state.json"), {
    version: 5,
    mode: "default",
    phase: "stable",
    flowSource,
    reloadPending: false,
    updatedAt: new Date().toISOString(),
  });
}

test("switches complete npm and Maestro roots and recovers interrupted reloads", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-large-transaction-test-"));
  const agentDir = join(root, "agent");
  const projectDir = join(root, "project");
  const maestroDir = join(root, "maestro");
  const statePath = join(root, ".pi-large-mode", "state.json");
  const settingsPath = join(agentDir, "settings.json");
  const projectSettingsPath = join(projectDir, ".pi", "settings.json");
  const keybindingsPath = join(agentDir, "keybindings.json");
  const companionsPath = join(agentDir, "pi-maestro-flow-companions.json");
  const originalSettings = `${JSON.stringify({
    defaultProvider: "manager",
    defaultModel: "manager/gpt-5.6-sol",
    defaultThinkingLevel: "high",
    enabledModels: ["manager/*"],
    theme: "sentinel",
    quietStartup: true,
    packages: [controllerPackage, join(repoRoot, "extensions/pi-brand-header")],
  }, null, 2)}\n`;
  const originalProjectSettings = `${JSON.stringify({
    packages: [join(repoRoot, "extensions/pi-brand-header")],
    theme: "project-sentinel",
  }, null, 2)}\n`;
  const originalKeybindings = `${JSON.stringify({
    "app.thinking.cycle": ["shift+tab", "alt+t"],
    "app.quit": "ctrl+q",
  }, null, 2)}\n`;
  const originalCompanions = `${JSON.stringify({
    version: 1,
    companions: { sentinel: { source: "/sentinel" } },
  }, null, 2)}\n`;
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const previousMaestroHome = process.env.MAESTRO_HOME;

  try {
    await mkdir(agentDir, { recursive: true });
    await mkdir(join(projectDir, ".pi"), { recursive: true });
    await mkdir(join(maestroDir, "sentinel"), { recursive: true });
    await writeFile(settingsPath, originalSettings);
    await writeFile(projectSettingsPath, originalProjectSettings);
    await writeFile(keybindingsPath, originalKeybindings);
    await writeFile(companionsPath, originalCompanions);
    await writeFile(join(maestroDir, "sentinel", "keep.txt"), "keep\n");
    await createFlowCache(root, agentDir, maestroDir);

    process.env.PI_CODING_AGENT_DIR = agentDir;
    process.env.MAESTRO_HOME = maestroDir;
    const { default: register } = await import(`${controllerFile}?transaction-test=${Date.now()}`);
    let handler;
    register({
      registerCommand(name, definition) {
        assert.equal(name, "large");
        handler = definition.handler;
      },
    });
    assert.equal(typeof handler, "function");

    let reloadShouldFail = false;
    let reloadCount = 0;
    const notifications = [];
    const context = {
      cwd: projectDir,
      ui: {
        notify(message, level) {
          notifications.push({ message, level });
        },
        setWidget() {},
      },
      async reload() {
        reloadCount += 1;
        if (reloadShouldFail) throw new Error("synthetic reload failure");
      },
    };
    const run = async (args) => {
      await handler(args, context);
      return await readJson(statePath);
    };

    let state = await run("on");
    assert.equal(state.mode, "active");
    assert.equal(state.phase, "stable");
    assert.equal(state.reloadPending, false);
    assert.equal((await readJson(settingsPath)).packages.length, 2);
    assert.equal(await exists(join(agentDir, "npm", "node_modules", "pi-maestro-flow", "package.json")), true);

    state = await run("off");
    assert.equal(state.mode, "default");
    assert.equal(await readFile(settingsPath, "utf8"), originalSettings);
    assert.equal(await readFile(projectSettingsPath, "utf8"), originalProjectSettings);
    assert.equal(await readFile(keybindingsPath, "utf8"), originalKeybindings);
    assert.equal(await readFile(companionsPath, "utf8"), originalCompanions);
    assert.equal(await exists(join(agentDir, "npm")), false);
    assert.deepEqual(await readdir(maestroDir), ["sentinel"]);

    reloadShouldFail = true;
    state = await run("on");
    assert.equal(state.mode, "active");
    assert.equal(state.reloadPending, true);
    reloadShouldFail = false;
    state = await run("on");
    assert.equal(state.reloadPending, false);

    const largeSettings = await readJson(settingsPath);
    largeSettings.defaultModel = "manager/claude-opus-5";
    largeSettings.theme = "must-not-leak";
    await writeJson(settingsPath, largeSettings);
    state = await run("off");
    const restoredSettings = await readJson(settingsPath);
    assert.equal(restoredSettings.defaultModel, "manager/claude-opus-5");
    assert.equal(restoredSettings.theme, "sentinel");
    assert.equal(restoredSettings.quietStartup, true);

    state.phase = "activating";
    state.mode = "default";
    await writeJson(statePath, state);
    state = await run("on");
    assert.equal(state.mode, "active");
    state.phase = "deactivating";
    await writeJson(statePath, state);
    state = await run("off");
    assert.equal(state.mode, "default");
    assert.equal(await exists(join(agentDir, "npm")), false);
    assert.deepEqual(await readdir(maestroDir), ["sentinel"]);

    assert.equal(reloadCount >= 7, true);
    assert.equal(notifications.some((entry) => String(entry.message).includes("reload 失败")), true);
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    if (previousMaestroHome === undefined) delete process.env.MAESTRO_HOME;
    else process.env.MAESTRO_HOME = previousMaestroHome;
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
