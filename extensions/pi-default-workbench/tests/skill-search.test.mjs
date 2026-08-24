import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import registerSkillSearch from "../skill-search.ts";

function fakePi() {
  const tools = new Map();
  const handlers = new Map();
  return {
    tools,
    handlers,
    registerTool(tool) { tools.set(tool.name, tool); },
    on(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
  };
}

function randomSample(items, count) {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool.slice(0, count);
}

test("search_skill_bm25 returns metadata before explicitly loading a candidate", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-skill-search-"));
  const catalog = [
    ["alpha-workflow", "alpha orchestration workflow"],
    ["beta-research", "beta evidence research"],
    ["gamma-docs", "gamma document generation"],
    ["delta-figures", "delta scientific figure design"],
    ["epsilon-math", "epsilon symbolic mathematics"],
    ["zeta-review", "zeta manuscript review"],
  ];
  const skills = await Promise.all(catalog.map(async ([name, description]) => {
    const filePath = join(root, `${name}.md`);
    await writeFile(filePath, `---\ndescription: ${description}\n---\nINSTRUCTIONS FOR ${name}`, "utf8");
    return { name, description, filePath };
  }));

  const pi = fakePi();
  registerSkillSearch(pi);
  const beforeAgentStart = pi.handlers.get("before_agent_start")[0];
  await beforeAgentStart({ systemPromptOptions: { skills } });

  const search = pi.tools.get("search_skill_bm25");
  assert.match(search.promptSnippet, /action=search/);
  await assert.rejects(
    search.execute("test", { action: "load", name: skills[0].name }),
    /must be returned by search/,
  );

  const broad = await search.execute("test", {
    action: "search",
    query: "workflow research document scientific symbolic manuscript",
  });
  assert.equal(broad.details.skills.length, 3);
  assert.doesNotMatch(broad.content[0].text, /INSTRUCTIONS FOR/);

  const selected = randomSample(skills, 3);
  for (const skill of selected) {
    const result = await search.execute("test", {
      action: "search",
      query: `${skill.name} ${skill.description}`,
      limit: 1,
    });
    assert.equal(result.details.skills[0].name, skill.name);
    assert.doesNotMatch(result.content[0].text, new RegExp(`INSTRUCTIONS FOR ${skill.name}`));

    const loaded = await search.execute("test", { action: "load", name: skill.name });
    assert.match(loaded.content[0].text, new RegExp(`INSTRUCTIONS FOR ${skill.name}`));
  }

  const repeated = await search.execute("test", { action: "load", name: selected[0].name });
  assert.doesNotMatch(repeated.content[0].text, new RegExp(`INSTRUCTIONS FOR ${selected[0].name}`));
  assert.equal(repeated.details.alreadyLoaded, true);

  await writeFile(selected[0].filePath, `---\ndescription: ${selected[0].description}\n---\nUPDATED INSTRUCTIONS FOR ${selected[0].name}`, "utf8");
  const refreshed = await search.execute("test", { action: "load", name: selected[0].name });
  assert.match(refreshed.content[0].text, new RegExp(`UPDATED INSTRUCTIONS FOR ${selected[0].name}`));
});
