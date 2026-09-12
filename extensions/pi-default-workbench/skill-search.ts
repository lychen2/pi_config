import { readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fuseWithSemanticRanking } from "./embedding-search.ts";

type SkillLike = {
  name: string;
  description: string;
  filePath: string;
  disableModelInvocation?: boolean;
  searchText?: string;
};

const SEARCH_SKILL_PARAMS = Type.Object({
  action: Type.String({ enum: ["search", "load"] }),
  query: Type.Optional(Type.String({ minLength: 1, description: "Natural-language description of the skill needed" })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 3, description: "Maximum metadata candidates; default 3" })),
  name: Type.Optional(Type.String({ minLength: 1, description: "Exact name of a skill returned by an earlier search" })),
}, { additionalProperties: false });

type SearchDocument = {
  skill: SkillLike;
  length: number;
  termFrequency: Map<string, number>;
};

type SearchIndex = {
  documents: SearchDocument[];
  documentFrequency: Map<string, number>;
  averageLength: number;
};

type SkillSearchDetails = {
  action: "search" | "load";
  query?: string;
  totalSkills?: number;
  skills?: Array<{
    name: string;
    description: string;
    score: number;
    loaded: boolean;
  }>;
  name?: string;
  loaded?: boolean;
  alreadyLoaded?: boolean;
};

type CachedSkillBody = {
  mtimeMs: number;
  size: number;
  body: string;
};

const SEARCH_SKILL_DEFAULT_LIMIT = 3;
const skillBodyCache = new Map<string, Promise<CachedSkillBody>>();

async function loadSkillBody(filePath: string): Promise<string> {
  const metadata = await stat(filePath);
  const cached = skillBodyCache.get(filePath);
  if (cached) {
    const value = await cached;
    if (value.mtimeMs === metadata.mtimeMs && value.size === metadata.size) return value.body;
  }

  const loading = readFile(filePath, "utf8").then((raw) => ({
    mtimeMs: metadata.mtimeMs,
    size: metadata.size,
    body: raw.replace(/^---[\s\S]*?---\s*/, "").trim(),
  }));
  skillBodyCache.set(filePath, loading);
  try {
    return (await loading).body;
  } catch (error) {
    if (skillBodyCache.get(filePath) === loading) skillBodyCache.delete(filePath);
    throw error;
  }
}

function skillCatalogSignature(skills: SkillLike[]): string {
  return skills
    .map((skill) => [skill.name, skill.description, skill.filePath, skill.searchText ?? ""].join("\u0000"))
    .sort()
    .join("\u0001");
}

function tokenize(text: string): string[] {
  const tokens: string[] = text.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
  const han = /[\u3400-\u9fff]/;
  let previous = "";
  for (const character of text.toLowerCase()) {
    if (han.test(character)) {
      tokens.push(character);
      if (previous) tokens.push(previous + character);
      previous = character;
    } else {
      previous = "";
    }
  }
  return tokens;
}

function buildSearchIndex(skills: SkillLike[]): SearchIndex {
  const orderedSkills = [...skills].sort((left, right) => left.name.localeCompare(right.name));
  const documents = orderedSkills.map((skill) => {
    const terms = tokenize([skill.name, skill.description, skill.searchText ?? ""].join(" "));
    const termFrequency = new Map<string, number>();
    for (const term of terms) termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);
    return { skill, length: terms.length, termFrequency };
  });
  const documentFrequency = new Map<string, number>();
  for (const { termFrequency } of documents) {
    for (const term of termFrequency.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  return {
    documents,
    documentFrequency,
    averageLength: documents.reduce((sum, document) => sum + document.length, 0) / documents.length || 1,
  };
}

function bm25Search(
  query: string,
  index: SearchIndex,
  limit: number,
): Array<{ skill: SkillLike; score: number }> {
  const queryTerms = [...new Set(tokenize(query))];
  if (!queryTerms.length || !index.documents.length) return [];

  const k1 = 1.2;
  const b = 0.75;
  const totalDocuments = index.documents.length;

  return index.documents
    .map((document) => {
      let score = 0;
      for (const term of queryTerms) {
        const frequency = document.termFrequency.get(term) ?? 0;
        const frequencyAcrossDocuments = index.documentFrequency.get(term) ?? 0;
        if (!frequency || !frequencyAcrossDocuments) continue;
        const idf = Math.log(1 + (totalDocuments - frequencyAcrossDocuments + 0.5) / (frequencyAcrossDocuments + 0.5));
        score += idf * (frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * document.length / index.averageLength));
      }
      return { skill: document.skill, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name))
    .slice(0, limit);
}

function abortError(): Error {
  const error = new Error("Tool execution aborted.");
  error.name = "AbortError";
  return error;
}

export default function registerSkillSearch(pi: ExtensionAPI): void {
  let knownSkills: SkillLike[] = [];
  let searchIndex: SearchIndex | undefined;
  let searchIndexSignature = "";
  const loadedSkillBodies = new Map<string, string>();
  const candidateSkillNames = new Set<string>();

  pi.registerTool({
    name: "search_skill_bm25",
    label: "Search Skills",
    description: "Search skill metadata with BM25 fused with local semantic embeddings, then explicitly load one previously returned candidate.",
    promptSnippet: "Use action=search when specialized guidance would help and the matching skill is unknown, then action=load for a relevant candidate. Reuse guidance already in context.",
    parameters: SEARCH_SKILL_PARAMS,
    async execute(_id, params, signal) {
      if (signal?.aborted) throw abortError();

      if (params.action === "load") {
        const name = params.name?.trim();
        if (!name) throw new Error("Skill name is required and must not be empty.");
        if (!candidateSkillNames.has(name)) {
          throw new Error(`Skill ${name} must be returned by search before it can be loaded.`);
        }
        const skill = knownSkills.find((candidate) => candidate.name === name);
        if (!skill) throw new Error(`Skill ${name} is no longer available.`);

        const body = await loadSkillBody(skill.filePath);
        const alreadyLoaded = loadedSkillBodies.get(skill.filePath) === body;
        if (!alreadyLoaded) loadedSkillBodies.set(skill.filePath, body);
        const details: SkillSearchDetails = { action: "load", name, loaded: true, alreadyLoaded };
        const text = alreadyLoaded
          ? JSON.stringify({ name, loaded: true, already_loaded: true })
          : `## Loaded skill: ${name}\nSource: ${skill.filePath}\nResolve relative references from: ${dirname(skill.filePath)}\n\n${body}`;
        return { content: [{ type: "text", text }], details };
      }

      const query = params.query?.trim();
      if (!query) throw new Error("Query is required and must not be empty.");

      const limit = params.limit ?? SEARCH_SKILL_DEFAULT_LIMIT;
      const signature = skillCatalogSignature(knownSkills);
      if (!searchIndex || searchIndexSignature !== signature) {
        searchIndex = buildSearchIndex(knownSkills);
        searchIndexSignature = signature;
      }
      const catalog = searchIndex.documents.map(({ skill }) => skill);
      const bm25Ranked = bm25Search(query, searchIndex, catalog.length).map(({ skill }) => skill);
      const ranked = await fuseWithSemanticRanking(
        catalog,
        bm25Ranked,
        (skill) => `${skill.name}. ${skill.description}`,
        query,
        limit,
      );
      for (const { item: skill } of ranked) candidateSkillNames.add(skill.name);

      const skills = ranked.map(({ item: skill, score }) => ({
        name: skill.name,
        description: skill.description,
        score: Number(score.toFixed(6)),
        loaded: loadedSkillBodies.has(skill.filePath),
      }));
      const details: SkillSearchDetails = { action: "search", query, totalSkills: knownSkills.length, skills };
      const text = JSON.stringify({
        query,
        match_count: skills.length,
        total_skills: knownSkills.length,
        skills,
      });
      return { content: [{ type: "text", text }], details };
    },
  });

  const resetLoaded = () => {
    loadedSkillBodies.clear();
    candidateSkillNames.clear();
  };
  pi.on("session_start", resetLoaded);
  pi.on("session_tree", resetLoaded);
  pi.on("session_compact", resetLoaded);

  pi.on("before_agent_start", (event) => {
    const skills = (event.systemPromptOptions?.skills ?? []) as SkillLike[];
    knownSkills = skills.filter((skill) => !skill.disableModelInvocation);
    const signature = skillCatalogSignature(knownSkills);
    if (signature !== searchIndexSignature) {
      searchIndex = undefined;
      searchIndexSignature = signature;
      candidateSkillNames.clear();
      loadedSkillBodies.clear();
    }
  });
}
