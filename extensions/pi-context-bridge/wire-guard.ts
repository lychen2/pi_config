import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Last-mile guard for outgoing provider payloads.
 *
 * Runs in `before_provider_request`, i.e. after every message transform has been applied —
 * including Magic Context's synthetic m[0] (memory baseline) / m[1] (session history)
 * injection. Two jobs:
 *
 * 1. Empty-content cleanup. When the baseline is empty, Magic Context still unshifts an m[0]
 *    user message, which Pi serializes as `[{ type: "text", text: "" }]`. Anthropic-format
 *    relays answer that with `400 messages.0: user messages must have non-empty content`, and
 *    OpenAI-format gateways are strict about empty blocks too. The guard removes only content
 *    that carries no information: text/thinking blocks of length 0, messages left with no
 *    content at all, and an empty top-level `system`.
 *
 * 2. Image budget. Base64 images stay in the transcript, so every later request resends all of
 *    them. Pi budgets context in tokens and counts an image as a fixed ~1.2k tokens, while the
 *    same image is 2-3 MB of base64 on the wire; a screenshot-heavy session therefore fits
 *    comfortably in the context window and still grows past the provider's body limit. A real
 *    session reached 39 MB of images and died with `413 request_too_large` (32 MiB cap).
 *    The guard keeps the newest images that fit the request budget, in encounter order, and
 *    replaces older ones with a short text placeholder. Dropping oldest-first matches Magic
 *    Context's own reconciliation (`piRemainingImages` / `trimPreparedImageRows`).
 *
 * Tool calls, tool results, text, and images inside the budget are untouched, the payload is
 * never mutated in place, and an unchanged payload returns `undefined` so provider
 * serialization keeps the exact same bytes.
 */

type RecordLike = Record<string, unknown>;

/** Payload fields that carry a message list: OpenAI/Anthropic `messages`, Responses `input`. */
const MESSAGE_LIST_KEYS = ["messages", "input"] as const;

/** Roles whose message may be dropped once it has no content left. */
const DROPPABLE_ROLES = new Set(["user", "developer", "system", "assistant"]);

const TEXT_BLOCK_TYPES = new Set(["text", "input_text", "output_text"]);

const IMAGE_BLOCK_TYPES = new Set(["image", "image_url", "input_image"]);

/** Blocks that carry a nested content array: Anthropic / Bedrock tool results. */
const NESTED_CONTENT_BLOCK_TYPES = new Set(["tool_result", "toolResult"]);

/** Content keys whose arrays hold blocks that may contain images. */
const CONTENT_KEYS = ["content", "parts"] as const;

/**
 * Target body size for a single provider request. The cap that failed a real session was
 * 32 MiB; 20 MiB keeps a third of it free for tool schemas, the system prompt and JSON escaping.
 */
export const DEFAULT_REQUEST_BYTES = 20 * 1024 * 1024;

/** JSON escaping (`\n`, quotes) inflates non-image strings; keep a margin. */
const NON_IMAGE_INFLATION = 1.35;

/** System prompt, tool schemas and envelope fields that the message scan does not measure. */
const FIXED_OVERHEAD_BYTES = 128 * 1024;

/** Environment override for the request budget, in bytes. */
const REQUEST_BYTES_ENV = "PI_WIRE_GUARD_REQUEST_BYTES";

export type WireGuardStats = {
  /** Provider requests inspected. */
  requests: number;
  /** Zero-length text/thinking blocks removed. */
  droppedBlocks: number;
  /** Messages dropped because no content remained. */
  droppedMessages: number;
  /** Images replaced by a placeholder to fit the request budget. */
  droppedImages: number;
  /** Base64 bytes those images carried. */
  droppedImageBytes: number;
  /** Most recent drop, for `/wire-guard` output. */
  lastDrop: string | null;
};

export type WireGuardOptions = {
  /** Body size target for this request, in bytes. Defaults to the env override or 20 MiB. */
  requestBytes?: number;
};

/** How an image reaches the wire, which decides its placeholder shape. */
type ImageKind =
  | "base64" // Anthropic / Bedrock `{ type: "image", source: { type: "base64" } }`
  | "data-url" // OpenAI `image_url` / `input_image` data URL
  | "inline" // Google `{ inlineData: { data } }`
  | "raw"; // Ollama `message.images[]` base64 strings

type ImageRef = { kind: ImageKind; bytes: number; label: string };

const stats: WireGuardStats = {
  requests: 0,
  droppedBlocks: 0,
  droppedMessages: 0,
  droppedImages: 0,
  droppedImageBytes: 0,
  lastDrop: null,
};

export function wireGuardStats(): WireGuardStats {
  return { ...stats };
}

export function resetWireGuardStats(): void {
  stats.requests = 0;
  stats.droppedBlocks = 0;
  stats.droppedMessages = 0;
  stats.droppedImages = 0;
  stats.droppedImageBytes = 0;
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

// ---------------------------------------------------------------------------
// Image budget
// ---------------------------------------------------------------------------

function mimeLabel(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "image";
}

function dataUrlLabel(url: string): string {
  const head = url.slice(5, url.search(/[;,]/) === -1 ? undefined : url.search(/[;,]/));
  return mimeLabel(head);
}

/**
 * Returns the image a block carries, with the number of bytes it puts on the wire, or `null`
 * when the block is not an image or the image costs no body bytes (remote URL, provider file id).
 */
function readImageBlock(block: RecordLike): ImageRef | null {
  const inline = isRecord(block.inlineData) ? block.inlineData : undefined;
  if (inline && typeof inline.data === "string") {
    return { kind: "inline", bytes: inline.data.length, label: mimeLabel(inline.mimeType) };
  }
  if (!IMAGE_BLOCK_TYPES.has(blockType(block))) return null;

  const source = isRecord(block.source) ? block.source : undefined;
  if (source && typeof source.data === "string") {
    const label = mimeLabel(source.media_type ?? source.mimeType);
    return { kind: "base64", bytes: source.data.length, label };
  }
  if (typeof block.data === "string" && block.data.length > 0) {
    return { kind: "base64", bytes: block.data.length, label: mimeLabel(block.mimeType) };
  }
  const candidate = isRecord(block.image_url) ? block.image_url.url : block.image_url;
  const url = typeof candidate === "string" ? candidate : typeof block.url === "string" ? block.url : "";
  if (!url.startsWith("data:")) return null;
  return { kind: "data-url", bytes: url.length, label: dataUrlLabel(url) };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** Stable text that replaces a dropped image, so repeated requests keep identical bytes. */
function placeholderText(image: ImageRef): string {
  return `[image omitted: ${image.label}, ${formatBytes(image.bytes)} of base64, dropped from earlier history to keep this request under the provider body limit]`;
}

function placeholderBlock(image: ImageRef, text: (text: string) => unknown): unknown {
  const body = placeholderText(image);
  // Ollama carries images as bare base64 strings, so the placeholder is a plain string.
  return image.kind === "raw" ? body : text(body);
}

/**
 * Placeholder shape for one content array. Text blocks are typed differently per API: the
 * Responses API wants `input_text`, chat/Anthropic want `text`, Google parts have no type.
 */
function placeholderFactory(list: unknown[]): (text: string) => unknown {
  const types = new Set(list.map((block) => (isRecord(block) ? blockType(block) : "")));
  if (types.has("input_text") || types.has("input_image")) return (text) => ({ type: "input_text", text });
  if (types.has("text") || types.has("image_url") || types.has("image")) return (text) => ({ type: "text", text });
  return (text) => ({ text });
}

type ScanResult = { refs: ImageRef[]; nonImageBytes: number };

/** Walks the payload in wire order, collecting images and the size of everything else. */
function scanPayload(payload: RecordLike): ScanResult {
  const refs: ImageRef[] = [];
  let nonImageBytes = 0;

  const scanBlocks = (list: unknown[]): void => {
    for (const block of list) {
      if (typeof block === "string") {
        nonImageBytes += block.length;
        continue;
      }
      if (!isRecord(block)) continue;
      const image = readImageBlock(block);
      if (image) {
        refs.push(image);
        continue;
      }
      if (NESTED_CONTENT_BLOCK_TYPES.has(blockType(block)) && Array.isArray(block.content)) {
        scanBlocks(block.content);
        continue;
      }
      for (const value of Object.values(block)) {
        if (typeof value === "string") nonImageBytes += value.length;
      }
    }
  };

  for (const key of MESSAGE_LIST_KEYS) {
    const list = payload[key];
    if (!Array.isArray(list)) continue;
    for (const message of list) {
      if (!isRecord(message)) continue;
      for (const [field, value] of Object.entries(message)) {
        if (CONTENT_KEYS.includes(field as (typeof CONTENT_KEYS)[number])) continue;
        if (field === "images") continue;
        if (typeof value === "string") nonImageBytes += value.length;
      }
      for (const field of CONTENT_KEYS) {
        const content = message[field];
        if (Array.isArray(content)) scanBlocks(content);
      }
      const images = message.images;
      if (Array.isArray(images)) {
        for (const value of images) {
          if (typeof value === "string" && value.length > 0) {
            refs.push({ kind: "raw", bytes: value.length, label: "image" });
          }
        }
      }
    }
  }

  return { refs, nonImageBytes };
}

type BudgetPlan = { dropBefore: number; dropped: ImageRef[]; droppedBytes: number };

/**
 * Keeps the newest images that fit, drops the rest. `dropBefore` is the position in encounter
 * order before which images are replaced by placeholders.
 */
export function planImageBudget(scan: ScanResult, requestBytes: number): BudgetPlan {
  const others = Math.ceil(scan.nonImageBytes * NON_IMAGE_INFLATION) + FIXED_OVERHEAD_BYTES;
  let room = Math.max(0, requestBytes - others);
  let dropBefore = 0;
  for (let index = scan.refs.length - 1; index >= 0; index -= 1) {
    const image = scan.refs[index];
    if (image.bytes > room) {
      dropBefore = index + 1;
      break;
    }
    room -= image.bytes;
  }
  const dropped = scan.refs.slice(0, dropBefore);
  return { dropBefore, dropped, droppedBytes: dropped.reduce((sum, image) => sum + image.bytes, 0) };
}

type Cursor = { next: number; dropBefore: number };

function rewriteBlock(block: unknown, cursor: Cursor, placeholder: (image: ImageRef) => unknown): unknown {
  if (!isRecord(block)) return block;
  const image = readImageBlock(block);
  if (image) {
    const index = cursor.next;
    cursor.next += 1;
    return index < cursor.dropBefore ? placeholder(image) : block;
  }
  if (NESTED_CONTENT_BLOCK_TYPES.has(blockType(block)) && Array.isArray(block.content)) {
    const content = rewriteBlocks(block.content, cursor);
    return content ? { ...block, content } : block;
  }
  return block;
}

function rewriteBlocks(list: unknown[], cursor: Cursor): unknown[] | null {
  const text = placeholderFactory(list);
  let changed = false;
  const next = list.map((block) => {
    const value = rewriteBlock(block, cursor, (image) => placeholderBlock(image, text));
    if (value !== block) changed = true;
    return value;
  });
  return changed ? next : null;
}

function rewriteMessage(message: unknown, cursor: Cursor): unknown {
  if (!isRecord(message)) return message;
  let changed = false;
  const next: RecordLike = { ...message };

  for (const field of CONTENT_KEYS) {
    const content = message[field];
    if (!Array.isArray(content)) continue;
    const blocks = rewriteBlocks(content, cursor);
    if (blocks) {
      next[field] = blocks;
      changed = true;
    }
  }

  const images = message.images;
  if (Array.isArray(images)) {
    let imagesChanged = false;
    const replaced = images.map((value) => {
      if (typeof value !== "string" || value.length === 0) return value;
      const index = cursor.next;
      cursor.next += 1;
      if (index >= cursor.dropBefore) return value;
      imagesChanged = true;
      return placeholderText({ kind: "raw", bytes: value.length, label: "image" });
    });
    if (imagesChanged) {
      next.images = replaced;
      changed = true;
    }
  }

  return changed ? next : message;
}

function applyImageBudget(
  payload: RecordLike,
  requestBytes: number,
): { payload: RecordLike; plan: BudgetPlan } | undefined {
  const scan = scanPayload(payload);
  if (scan.refs.length === 0) return undefined;
  const plan = planImageBudget(scan, requestBytes);
  if (plan.dropBefore === 0) return undefined;

  const cursor: Cursor = { next: 0, dropBefore: plan.dropBefore };
  let changed = false;
  const next: RecordLike = { ...payload };
  for (const key of MESSAGE_LIST_KEYS) {
    const list = payload[key];
    if (!Array.isArray(list)) continue;
    const rewritten = list.map((message) => rewriteMessage(message, cursor));
    if (rewritten.some((message, index) => message !== list[index])) {
      next[key] = rewritten;
      changed = true;
    }
  }
  return changed ? { payload: next, plan } : undefined;
}

function resolveRequestBytes(options: WireGuardOptions): number {
  if (typeof options.requestBytes === "number" && Number.isFinite(options.requestBytes) && options.requestBytes > 0) {
    return options.requestBytes;
  }
  const configured = Number(process.env[REQUEST_BYTES_ENV]);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return DEFAULT_REQUEST_BYTES;
}

// ---------------------------------------------------------------------------
// Empty-content cleanup
// ---------------------------------------------------------------------------

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
        continue;
      }
      if (removedHere > 0) {
        messages.push({ ...message, content: kept });
        continue;
      }
      messages.push(message);
      continue;
    }

    if (typeof content === "string" && content.length === 0 && isDroppableRole(message.role)) {
      droppedMessages += 1;
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

type CleanupResult = {
  payload: RecordLike;
  droppedBlocks: number;
  droppedMessages: number;
  lastDrop: string | null;
};

function sanitizeEmptyContent(payload: RecordLike): CleanupResult | undefined {
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
  return { payload: next, droppedBlocks, droppedMessages, lastDrop };
}

/**
 * Returns a sanitized copy of the payload, or `undefined` when nothing needed to change.
 * Never mutates the input.
 */
export function sanitizeProviderPayload(payload: unknown, options: WireGuardOptions = {}): unknown | undefined {
  stats.requests += 1;
  if (!isRecord(payload)) return undefined;

  let current: RecordLike = payload;
  let lastDrop: string | null = null;

  const budgeted = applyImageBudget(current, resolveRequestBytes(options));
  if (budgeted) {
    current = budgeted.payload;
    stats.droppedImages += budgeted.plan.dropped.length;
    stats.droppedImageBytes += budgeted.plan.droppedBytes;
    lastDrop = `${budgeted.plan.dropped.length} earlier image(s)`;
  }

  const cleaned = sanitizeEmptyContent(current);
  if (cleaned) {
    current = cleaned.payload;
    stats.droppedBlocks += cleaned.droppedBlocks;
    stats.droppedMessages += cleaned.droppedMessages;
    lastDrop = lastDrop ?? cleaned.lastDrop;
  }

  if (current === payload) return undefined;
  stats.lastDrop = lastDrop ?? stats.lastDrop;
  return current;
}

export function registerWireGuard(pi: ExtensionAPI): void {
  let notified = false;

  pi.on("session_start", () => {
    notified = false;
  });

  pi.on("before_provider_request", (event, ctx) => {
    const before = stats.droppedImages;
    const sanitized = sanitizeProviderPayload(event.payload);
    const dropped = stats.droppedImages - before;
    if (dropped > 0 && !notified) {
      notified = true;
      try {
        ctx.ui.notify(
          `wire-guard: dropped ${dropped} earlier image(s) (${formatBytes(stats.droppedImageBytes)}) ` +
            "to keep this request under the provider body limit",
          "warning",
        );
      } catch {
        // A UI failure must never break the request.
      }
    }
    // `undefined` keeps the payload byte-identical to what Pi built.
    return sanitized;
  });

  pi.registerCommand("wire-guard", {
    description: "Show empty-content and image-budget statistics for outgoing provider payloads",
    handler: async (_args, ctx) => {
      const current = wireGuardStats();
      const parts = [
        `${current.requests} request(s) inspected`,
        `${current.droppedBlocks} empty block(s) and ${current.droppedMessages} empty message(s) dropped`,
        `${current.droppedImages} image(s) dropped (${formatBytes(current.droppedImageBytes)})`,
      ];
      ctx.ui.notify(
        `wire-guard: ${parts.join(", ")}` + (current.lastDrop ? ` (last: ${current.lastDrop})` : ""),
        "info",
      );
    },
  });
}
