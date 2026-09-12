import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { buildToolSearchIndex, searchTools, toDiscoverableTool } from "./tool-discovery.ts";
import { fuseWithSemanticRanking } from "../embedding-search.ts";
import { capabilityToolsForMatches } from "./tool-selection-state.ts";

const DEFAULT_LIMIT = 3;

export const SearchToolBm25Params = Type.Object({
  query: Type.String({ minLength: 1, description: "Natural-language tool capability query" }),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, description: "Maximum matches" })),
});

export interface SearchToolBm25Details {
  query: string;
  limit: number;
  totalTools: number;
  activatedTools: string[];
  tools: Array<{
    name: string;
    label: string;
    summary: string;
    description: string;
    schemaKeys: string[];
    score: number;
  }>;
}

export function createSearchToolBm25(
  pi: Pick<ExtensionAPI, "getAllTools" | "getActiveTools" | "setActiveTools">,
  options: {
    canDiscover?: (name: string) => boolean;
    canActivate?: (name: string) => boolean;
    onActivated?: (names: readonly string[]) => void;
  } = {},
): ToolDefinition<typeof SearchToolBm25Params, SearchToolBm25Details> {
  let activationQueue: Promise<void> = Promise.resolve();

  const activateMatches = async (
    names: readonly string[],
    signal?: AbortSignal,
  ): Promise<string[]> => {
    let activated: string[] = [];
    const operation = activationQueue.then(() => {
      if (signal?.aborted) throw abortError();
      const active = pi.getActiveTools();
      const activeSet = new Set(active);
      activated = names.filter(
        (name) => !activeSet.has(name) && (options.canActivate?.(name) ?? true),
      );
      if (activated.length === 0) return;
      pi.setActiveTools([...active, ...activated]);
      options.onActivated?.(activated);
    });
    activationQueue = operation.catch(() => undefined);
    await operation;
    return activated;
  };

  return {
    name: "search_tool_bm25",
    label: "Search Tools",
    description: "Search registered tools by capability using weighted BM25 ranking fused with local semantic embeddings. Describe the missing capability in natural language; matching inactive tools become callable on the next request.",
    promptSnippet: "Use active tools directly. When a needed capability is missing, call search_tool_bm25 once to discover and activate a match before declaring it unavailable.",
    parameters: SearchToolBm25Params,
    async execute(_id, params, signal) {
      if (signal?.aborted) throw abortError();
      const query = params.query.trim();
      if (!query) throw new Error("Query is required and must not be empty.");

      const limit = params.limit ?? DEFAULT_LIMIT;
      const catalog = pi.getAllTools()
        .filter((tool) => tool.name !== "search_tool_bm25" && (options.canDiscover?.(tool.name) ?? true))
        .map(toDiscoverableTool);
      const index = buildToolSearchIndex(catalog);
      const bm25Ranked = searchTools(index, query, catalog.length).map((result) => result.tool);
      const ranked = await fuseWithSemanticRanking(
        catalog,
        bm25Ranked,
        (tool) => `${tool.name}. ${tool.description}`,
        query,
        limit,
      );
      if (signal?.aborted) throw abortError();

      const matchedNames = ranked.map((result) => result.item.name);
      const activationCandidates = capabilityToolsForMatches(
        matchedNames,
        catalog.map((tool) => tool.name),
      );
      const activated = await activateMatches(activationCandidates, signal);

      const details: SearchToolBm25Details = {
        query,
        limit,
        totalTools: catalog.length,
        activatedTools: activated,
        tools: ranked.map(({ item, score }) => ({
          name: item.name,
          label: item.label,
          summary: item.summary,
          description: item.description,
          schemaKeys: item.schemaKeys,
          score: Number(score.toFixed(6)),
        })),
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            query,
            activated_tools: activated,
            match_count: details.tools.length,
            total_tools: catalog.length,
            tools: details.tools.map(({ name, summary, score }) => ({ name, summary, score })),
          }),
        }],
        details,
      };
    },
  };
}

function abortError(): Error {
  const error = new Error("Tool execution aborted.");
  error.name = "AbortError";
  return error;
}
