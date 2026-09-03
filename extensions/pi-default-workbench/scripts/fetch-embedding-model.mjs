#!/usr/bin/env node
// One-time weight download for hybrid search: node scripts/fetch-embedding-model.mjs
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const root = process.env.PI_WORKBENCH_MODEL_DIR ?? join(homedir(), ".cache", "pi-workbench");
const modelDir = join(root, "models");
const modelId = "Xenova/bge-base-zh-v1.5";

await mkdir(modelDir, { recursive: true });
const { env, pipeline } = await import("@huggingface/transformers");
env.cacheDir = modelDir;
env.allowRemoteModels = true;
env.allowLocalModels = false;
env.logLevel = "info";

const started = Date.now();
await pipeline("feature-extraction", modelId, { dtype: "q8" });
console.log(`${modelId} (q8) ready in ${((Date.now() - started) / 1000).toFixed(1)}s -> ${modelDir}`);
