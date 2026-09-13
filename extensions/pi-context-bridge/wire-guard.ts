import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Last-mile guard for outgoing provider payloads.
 *
 * Runs in `before_provider_request`, i.e. after every message transform has been applied —
 * including Magic Context's synthetic m[0] (memory baseline) / m[1] (session history)
 * injection. When the baseline is empty, Magic Context still unshifts an m[0] user message,
 * which Pi serializes as `[{ type: "text", text: "" }]`. Anthropic-format relays answer that
 * with `400 messages.0: user messages must have non-empty content`, and OpenAI-format
 * gateways are strict about empty blocks too.
 *
 * The guard removes only content that carries no information:
 *   - text / input_text / output_text blocks whose text is the empty string
 *   - thinking blocks whose thinking text is the empty string
 *   - messages (user/developer/system/assistant) left with no content at all
 *   - an empty top-level `system` (Anthropic) field or empty blocks inside it
 *
 * Tool calls, tool results, images, and every non-empty text block are untouched, the payload
 * is never mutated in place, and an unchanged payload returns `undefined` so provider
 * serialization and prompt caching keep the exact same bytes.
 */

type RecordLike = Record<string, unknown>;

/** Payload fields that carry a message list: OpenAI/Anthropic `messages`, Responses `input`. */
const MESSAGE_LIST_KEYS = ["messages", "input"] as const;

/** Roles whose message may be dropped once it has no content left. */
const DROPPABLE_ROLES = new Set(["user", "developer", "system", "assistant"]);

const TEXT_BLOCK_TYPES = new Set(["text", "input_text", "output_text"]);

export type WireGuardStats = {
  /** Provider requests inspected. */
  requests: number;
  /** Zero-length text/thinking blocks removed. */
  droppedBlocks: number;
  /** Messages dropped because no content remained. */
  droppedMessages: number;
  /** Most recent drop, for `/wire-guard` output. */
  lastDrop: string | null;
};

const stats: WireGuardStats = {
  requests: 0,
  droppedBlocks: 0,
  droppedMessages: 0,
  lastDrop: null,
};

export function wireGuardStats(): WireGuardStats {
  return { ...stats };
}

export function resetWireGuardStats(): void {
  stats.requests = 0;
  stats.droppedBlocks = 0;
  stats.droppedMessages = 0;
  stats.lastDrop = null;
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function blockType(block: RecordLike): string {
  return typeof block.type === "string" ? block.type : "";
}

/** True for content blocks that exist but carry no text. */
export function isEmptyBlock(block: unknown): boolean {
  if (!isRecord(block)) return false;
  const type = blockType(block);
  if (TEXT_BLOCK_TYPES.has(type)) return typeof block.text === "string" && block.text.length === 0;
  // Only zero-length thinking text is dropped; a block without the field is left alone.
  if (type === "thinking") return typeof block.thinking === "string" && block.thinking.length === 0;
  return false;
}

function isDroppableRole(role: unknown): boolean {
  return typeof role === "string" && DROPPABLE_ROLES.has(role);
}

function describe(role: unknown, droppedBlocks: number): string {
  const name = typeof role === "string" && role.length > 0 ? role : "unknown";
  return droppedBlocks > 0 ? `${name} (${droppedBlocks} empty block(s))` : name;
}

type ListResult = { messages: unknown[]; droppedBlocks: number; droppedMessages: number; changed: boolean };

function sanitizeMessageList(list: readonly unknown[]): ListResult {
  const messages: unknown[] = [];
  let droppedBlocks = 0;
  let droppedMessages = 0;
  let lastDrop: string | null = null;

  for (const message of list) {
    if (!isRecord(message)) {
      messages.push(message);
      continue;
    }

    const content = message.content;
    if (Array.isArray(content)) {
      const kept = content.filter((block) => !isEmptyBlock(block));
      const removedHere = content.length - kept.length;
      droppedBlocks += removedHere;
      if (kept.length === 0 && isDroppableRole(message.role)) {
        droppedMessages += 1;
        lastDrop = describe(message.role, removedHere);
        continue;
      }
      if (removedHere > 0) {
        messages.push({ ...message, content: kept });
        lastDrop = describe(message.role, removedHere);
        continue;
      }
      messages.push(message);
      continue;
    }

    if (typeof content === "string" && content.length === 0 && isDroppableRole(message.role)) {
      droppedMessages += 1;
      lastDrop = describe(message.role, 0);
      continue;
    }
    messages.push(message);
  }

  // Never hand the provider an empty message list: fall back to the original list.
  if (messages.length === 0 && list.length > 0) {
    return { messages: [...list], droppedBlocks: 0, droppedMessages: 0, changed: false };
  }
  return {
    messages,
    droppedBlocks,
    droppedMessages,
    changed: droppedBlocks > 0 || droppedMessages > 0,
  };
}

/**
 * Returns a sanitized copy of the payload, or `undefined` when nothing needed to change.
 * Never mutates the input.
 */
export function sanitizeProviderPayload(payload: unknown): unknown | undefined {
  stats.requests += 1;
  if (!isRecord(payload)) return undefined;

  let changed = false;
  const next: RecordLike = { ...payload };
  let droppedBlocks = 0;
  let droppedMessages = 0;
  let lastDrop: string | null = null;

  for (const key of MESSAGE_LIST_KEYS) {
    const list = payload[key];
    if (!Array.isArray(list)) continue;
    const result = sanitizeMessageList(list);
    if (!result.changed) continue;
    changed = true;
    next[key] = result.messages;
    droppedBlocks += result.droppedBlocks;
    droppedMessages += result.droppedMessages;
    lastDrop = lastDrop ?? `messages[].${key}`;
  }

  const system = payload.system;
  if (Array.isArray(system)) {
    const kept = system.filter((block) => !isEmptyBlock(block));
    if (kept.length !== system.length) {
      changed = true;
      droppedBlocks += system.length - kept.length;
      if (kept.length === 0) delete next.system;
      else next.system = kept;
      lastDrop = "system blocks";
    }
  } else if (typeof system === "string" && system.length === 0) {
    changed = true;
    delete next.system;
    lastDrop = "empty system";
  }

  if (!changed) return undefined;
  stats.droppedBlocks += droppedBlocks;
  stats.droppedMessages += droppedMessages;
  stats.lastDrop = lastDrop ?? stats.lastDrop;
  return next;
}

export function registerWireGuard(pi: ExtensionAPI): void {
  pi.on("before_provider_request", (event) => {
    const sanitized = sanitizeProviderPayload(event.payload);
    // `undefined` keeps the payload byte-identical to what Pi built.
    return sanitized;
  });

  pi.registerCommand("wire-guard", {
    description: "Show empty-content guard statistics for outgoing provider payloads",
    handler: async (_args, ctx) => {
      const current = wireGuardStats();
      ctx.ui.notify(
        `wire-guard: ${current.requests} request(s) inspected, ` +
          `${current.droppedBlocks} empty block(s) and ${current.droppedMessages} empty message(s) dropped` +
          (current.lastDrop ? ` (last: ${current.lastDrop})` : ""),
        "info",
      );
    },
  });
}
