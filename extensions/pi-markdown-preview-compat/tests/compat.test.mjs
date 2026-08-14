import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { adaptPreviewTool, validatePngPaths } from "../index.ts";

const PNG = Buffer.from("89504e470d0a1a0a00000000", "hex");

function toolWith(execute) {
  return {
    name: "preview_export",
    label: "Preview Export",
    description: "preview",
    parameters: { type: "object" },
    execute,
  };
}

test("recognizes valid and invalid PNG paths", async () => {
  const dir = await mkdtemp(join(tmpdir(), "preview-compat-"));
  const valid = join(dir, "valid.png");
  const invalid = join(dir, "invalid.png");
  await writeFile(valid, PNG);
  await writeFile(invalid, Buffer.from("not-png"));
  assert.deepEqual(await validatePngPaths({ paths: [valid, invalid] }), {
    paths: [valid, invalid],
    invalid: [invalid],
  });
  assert.deepEqual(await validatePngPaths(undefined), { paths: [], invalid: [] });
});

test("retries once and returns only the valid cached PNG", async () => {
  const dir = await mkdtemp(join(tmpdir(), "preview-compat-"));
  const path = join(dir, "preview.png");
  let calls = 0;
  const adapted = adaptPreviewTool(toolWith(async () => {
    calls += 1;
    await writeFile(path, calls === 1 ? Buffer.from("bad") : PNG);
    return { content: [], details: { paths: [path] } };
  }));
  const result = await adapted.execute("id", { format: "png" }, undefined, undefined, {});
  assert.equal(calls, 2);
  assert.deepEqual(result.details.paths, [path]);
  assert.deepEqual((await readFile(path)).subarray(0, 8), PNG.subarray(0, 8));
});

test("fails and removes artifacts after two invalid PNG renders", async () => {
  const dir = await mkdtemp(join(tmpdir(), "preview-compat-"));
  const path = join(dir, "preview.png");
  let calls = 0;
  const adapted = adaptPreviewTool(toolWith(async () => {
    calls += 1;
    await writeFile(path, Buffer.from("bad"));
    return { content: [], details: { paths: [path] } };
  }));
  await assert.rejects(
    adapted.execute("id", { format: "png" }, undefined, undefined, {}),
    /validation failed after cache retry/,
  );
  assert.equal(calls, 2);
  await assert.rejects(readFile(path), /ENOENT/);
});

test("fails and removes every page after two invalid multi-page renders", async () => {
  const dir = await mkdtemp(join(tmpdir(), "preview-compat-"));
  const validPath = join(dir, "preview-1.png");
  const invalidPath = join(dir, "preview-2.png");
  let calls = 0;
  const adapted = adaptPreviewTool(toolWith(async () => {
    calls += 1;
    await writeFile(validPath, PNG);
    await writeFile(invalidPath, Buffer.from("bad"));
    return { content: [], details: { paths: [validPath, invalidPath] } };
  }));
  await assert.rejects(
    adapted.execute("id", { format: "png" }, undefined, undefined, {}),
    /validation failed after cache retry/,
  );
  assert.equal(calls, 2);
  await assert.rejects(readFile(validPath), /ENOENT/);
  await assert.rejects(readFile(invalidPath), /ENOENT/);
});

test("validates PNG before honoring open=true", async () => {
  const dir = await mkdtemp(join(tmpdir(), "preview-compat-"));
  const path = join(dir, "preview.png");
  const opens = [];
  let calls = 0;
  const adapted = adaptPreviewTool(toolWith(async (_id, params) => {
    calls += 1;
    opens.push(params.open);
    await writeFile(path, calls === 1 ? Buffer.from("bad") : PNG);
    return { content: [], details: { paths: [path], opened: params.open === true } };
  }));
  const result = await adapted.execute("id", { format: "png", open: true }, undefined, undefined, {});
  assert.deepEqual(opens, [false, false, true]);
  assert.equal(result.details.opened, true);
});

test("passes non-PNG exports through without retry", async () => {
  let calls = 0;
  const adapted = adaptPreviewTool(toolWith(async () => {
    calls += 1;
    return { content: [], details: { paths: ["preview.html"] } };
  }));
  await adapted.execute("id", { format: "html" }, undefined, undefined, {});
  assert.equal(calls, 1);
});
