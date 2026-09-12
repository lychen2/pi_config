import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = await mkdtemp(join(tmpdir(), "pi-slim-integration-"));
process.env.PI_CODING_AGENT_DIR = root;
const { formatSkillsForPrompt } = await import("@earendil-works/pi-coding-agent");
const { default: register } = await import("../index.ts");

test("default routes discovery without hiding fallback metadata or changing catalog", async () => {
  try {
    await writeFile(join(root, "slim-skills-whitelist.json"), JSON.stringify({ mode: "allowlist", whitelist: [], inject: [] }));
    let handler;
    let active = ["search_skill_bm25"];
    register({
      on(name, fn) { if (name === "before_agent_start") handler = fn; },
      registerCommand() {},
      getActiveTools: () => active,
    });
    const skills = [{ name: "alpha", description: "Alpha migration review", filePath: "/db/review.md" }];
    const event = { systemPrompt: `PREFIX${formatSkillsForPrompt(skills)}\nSUFFIX`, systemPromptOptions: { skills } };
    const result = await handler(event);
    assert.match(result.systemPrompt, /^PREFIX/);
    assert.match(result.systemPrompt, /SUFFIX$/);
    assert.match(result.systemPrompt, /search_skill_bm25/);
    assert.doesNotMatch(result.systemPrompt, /Alpha migration review/);
    assert.equal(event.systemPromptOptions.skills, skills);
    active = [];
    const fallback = await handler(event);
    assert.match(fallback.systemPrompt, /Alpha migration review/);
    assert.match(fallback.systemPrompt, /\/db\/review.md/);
    assert.doesNotMatch(fallback.systemPrompt, /search_skill_bm25/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
