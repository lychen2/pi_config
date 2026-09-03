import { createHash } from "node:crypto";
import { access, appendFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Hybrid ranking helper: local bge-base-zh-v1.5 (102M, 768-dim, int8 ONNX via
 * transformers.js) cosine ranking fused with an existing lexical BM25 ranking
 * by weighted reciprocal-rank fusion.
 *
 * Searches never wait on the network: `loadExtractor` is local-only, so a
 * missing model means an immediate BM25 fallback. `ensureEmbeddingModel`
 * fetches the weights in the background once per machine; the next search
 * after it lands picks the semantic arm up automatically.
 */
export const EMBEDDING_MODEL = "Xenova/bge-base-zh-v1.5";
const MODEL_CACHE_ROOT = process.env.PI_WORKBENCH_MODEL_DIR
  ?? join(homedir(), ".cache", "pi-workbench");
const MODEL_CACHE_DIR = join(MODEL_CACHE_ROOT, "models");
const MODEL_WEIGHTS = join(MODEL_CACHE_DIR, ...EMBEDDING_MODEL.split("/"), "onnx", "model_quantized.onnx");
const DOWNLOAD_LOCK = join(MODEL_CACHE_ROOT, "download.lock");
const VECTORS_FILE = join(MODEL_CACHE_ROOT, "vectors.json");
const MAX_EMBED_CHARS = 400;
const RRF_K = 60;
const BM25_WEIGHT = 1.5;

type Extractor = (
  texts: string | string[],
  options: { pooling: "mean"; normalize: true },
) => Promise<{ data: Float32Array }>;

let extractorPromise: Promise<Extractor | null> | null = null;
let vectorCache: Map<string, number[]> | null = null;
let vectorCacheDirty = false;

function hashText(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

async function logNote(message: string): Promise<void> {
  try {
    await mkdir(MODEL_CACHE_ROOT, { recursive: true });
    await appendFile(join(MODEL_CACHE_ROOT, "embedding.log"), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // diagnostics only
  }
}

async function loadExtractor(): Promise<Extractor | null> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = MODEL_CACHE_DIR;
      env.localModelPath = MODEL_CACHE_DIR;
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      return pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8" }) as unknown as Extractor;
    })().catch((error: unknown) => {
      extractorPromise = null;
      void logNote(`disabled: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
  }
  return extractorPromise;
}

/**
 * Kick off a one-time background weight download. Never awaited by a search and
 * never throws — a machine without the model just keeps using BM25.
 */
export function ensureEmbeddingModel(): void {
  if (process.env.NODE_TEST_CONTEXT) return; // no network from tests
  void (async () => {
    try {
      await access(MODEL_WEIGHTS);
      return;
    } catch {
      // not downloaded yet
    }
    if (await lockIsStale()) await rm(DOWNLOAD_LOCK, { recursive: true, force: true });
    try {
      await mkdir(DOWNLOAD_LOCK); // atomic: a second pi instance loses the race
    } catch {
      return;
    }

    // Spawned, not awaited, and in its own process: the downloader needs
    // remote access enabled while every in-process search stays local-only.
    const { spawn } = await import("node:child_process");
    const script = fileURLToPath(new URL("scripts/fetch-embedding-model.mjs", import.meta.url));
    const child = spawn(process.execPath, [script], { detached: true, stdio: "ignore" });
    const unlock = () => rm(DOWNLOAD_LOCK, { recursive: true, force: true });
    child.once("error", unlock);
    child.once("exit", (code) => {
      if (code !== 0) void unlock(); // retry next session
    });
    child.unref();
  })().catch(() => undefined);
}

/** A lock left behind by a killed download must not block retries forever. */
async function lockIsStale(): Promise<boolean> {
  try {
    return (await stat(DOWNLOAD_LOCK)).mtimeMs < Date.now() - 30 * 60 * 1000;
  } catch {
    return false;
  }
}

async function loadVectorCache(): Promise<Map<string, number[]>> {
  if (vectorCache) return vectorCache;
  vectorCache = new Map();
  try {
    const raw = JSON.parse(await readFile(VECTORS_FILE, "utf8")) as Record<string, number[]>;
    for (const [key, value] of Object.entries(raw)) vectorCache.set(key, value);
  } catch {
    // first run
  }
  return vectorCache;
}

async function flushVectorCache(): Promise<void> {
  if (!vectorCacheDirty || !vectorCache) return;
  vectorCacheDirty = false;
  try {
    await mkdir(MODEL_CACHE_ROOT, { recursive: true });
    await writeFile(VECTORS_FILE, JSON.stringify(Object.fromEntries(vectorCache)));
  } catch {
    // cache is best-effort
  }
}

/** Cosine vectors for `texts`, served from an on-disk cache keyed by text hash. */
export async function embedTexts(texts: readonly string[]): Promise<(number[] | null)[]> {
  const cache = await loadVectorCache();
  const keys = texts.map((text) => hashText(text.slice(0, MAX_EMBED_CHARS)));
  const missing = new Map<string, string>();
  keys.forEach((key, index) => {
    if (!cache.has(key)) missing.set(key, texts[index].slice(0, MAX_EMBED_CHARS));
  });

  if (missing.size > 0) {
    const extractor = await loadExtractor();
    if (!extractor) return keys.map((key) => cache.get(key) ?? null);
    const entries = [...missing.entries()];
    for (const [key, text] of entries) {
      const { data } = await extractor(text, { pooling: "mean", normalize: true });
      cache.set(key, Array.from(data, (value) => Math.round(value * 1e5) / 1e5));
      vectorCacheDirty = true;
    }
    await flushVectorCache();
  }

  return keys.map((key) => cache.get(key) ?? null);
}

export function cosine(left: readonly number[], right: readonly number[]): number {
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return score;
}

/**
 * Fuse a lexical BM25 ordering with a semantic cosine ordering over the WHOLE
 * catalog, so queries with zero lexical overlap still surface candidates. An
 * item absent from one ranking simply gets no contribution from it, and a model
 * that cannot load falls back to the BM25 ordering unchanged.
 */
export async function fuseWithSemanticRanking<T>(
  catalog: readonly T[],
  bm25Ranked: readonly T[],
  getEmbedText: (item: T) => string,
  query: string,
  limit: number,
): Promise<Array<{ item: T; score: number }>> {
  if (catalog.length === 0) return [];

  const bm25Rank = new Map<T, number>();
  bm25Ranked.forEach((item, rank) => bm25Rank.set(item, rank));

  const fallback = () => bm25Ranked
    .slice(0, limit)
    .map((item) => ({ item, score: rrfScore(BM25_WEIGHT, bm25Rank.get(item) ?? 0) }));

  const [queryVector, ...itemVectors] = await embedTexts([
    query,
    ...catalog.map(getEmbedText),
  ]);
  if (!queryVector) return fallback();

  const semanticRank = new Map<number, number>();
  itemVectors
    .map((vector, index) => ({ index, similarity: vector ? cosine(queryVector, vector) : null }))
    .filter((entry): entry is { index: number; similarity: number } => entry.similarity !== null)
    .sort((left, right) => right.similarity - left.similarity)
    .forEach((entry, rank) => semanticRank.set(entry.index, rank));

  if (semanticRank.size === 0) return fallback();

  // The semantic list is untruncated, so give BM25-only losers a nominal rank
  // beyond it instead of an absent one.
  const lastSemanticRank = semanticRank.size;
  return catalog
    .map((item, index) => {
      const semantic = semanticRank.get(index);
      const lexical = bm25Rank.get(item);
      return {
        item,
        score: (lexical === undefined
          ? 0
          : rrfScore(BM25_WEIGHT, lexical))
          + (semantic === undefined
            ? (lexical === undefined ? 0 : rrfScore(1, lastSemanticRank))
            : rrfScore(1, semantic)),
      };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function rrfScore(weight: number, rank: number): number {
  return weight / (RRF_K + rank + 1);
}

/** Pre-warms the ONNX session so the first search does not pay the load cost. */
export async function warmEmbeddingModel(): Promise<boolean> {
  return (await loadExtractor()) !== null;
}
