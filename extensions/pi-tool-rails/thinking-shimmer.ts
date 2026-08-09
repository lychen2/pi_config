import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";

type SpinnerMode = "requesting" | "thinking" | "responding" | "tool-input" | "tool-use";
type ThemeColor = "accent" | "dim" | "error" | "muted" | "success" | "thinkingHigh" | "thinkingLow" | "thinkingMax" | "thinkingMedium" | "thinkingMinimal" | "thinkingOff" | "thinkingXhigh" | "toolOutput" | "toolTitle" | "warning";
type AssistantTokenMessage = {
  content?: Array<{
    type?: string;
    text?: string;
    thinking?: string;
    name?: string;
    arguments?: unknown;
  }>;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
  };
};
type StreamEvent = {
  type: string;
  contentIndex?: number;
  delta?: string;
  content?: string;
  toolCall?: { name?: string; arguments?: unknown };
};

const GLYPHS = ["·", "✢", "✳", "✶", "✻", "✽"] as const;
const SPINNER_FRAMES = [...GLYPHS, ...[...GLYPHS].reverse()];
const SHIMMER_MS_REQUESTING = 45;
const SHIMMER_MS_WORKING = 120;
const TOKEN_COUNTER_MS = 40;
const SHIMMER_BAND = 5;
const STALL_TIMEOUT_MS = 3_000;
const STALL_TRANSITION_FRAMES = 28;
const THINKING_GLOW_DELAY_MS = 1_800;
const THINKING_GLOW_PERIOD_MS = 1_600;
const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const EMOJI_CHAR = /\p{Extended_Pictographic}/u;
const WORKING_WIDGET_KEY = "pi-tool-rails-working";

export function formatTokenCount(n: number): string {
  const value = Math.max(0, Math.round(n));
  const number = value < 1_000
    ? new Intl.NumberFormat("en-US").format(value)
    : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
      .format(value)
      .replace("K", "k");
  return `${number} ${value === 1 ? "token" : "tokens"}`;
}

export function animatedDots(frame: number): string {
  const cycle = [".  ", ".. ", "..."] as const;
  return cycle[Math.floor(frame / 8) % cycle.length]!;
}

export function reportedOutputTokens(message: AssistantTokenMessage | undefined, final = false): number | null {
  const usage = message?.usage;
  const output = usage?.output;
  if (typeof output !== "number" || !Number.isFinite(output) || output < 0) return null;
  if (output > 0) return Math.round(output);
  const hasFinalUsage = final && [usage?.input, usage?.cacheRead, usage?.cacheWrite, usage?.totalTokens]
    .some((value) => typeof value === "number" && value > 0);
  return hasFinalUsage ? 0 : null;
}

function estimateTextTokenUnits(text: string): number {
  let units = 0;
  for (const char of text) {
    if (char.codePointAt(0)! <= 0x7f) units += 1;
    else if (EMOJI_CHAR.test(char)) units += 8;
    else if (CJK_CHAR.test(char)) units += 4;
    else units += 2;
  }
  return units;
}

export function estimateTextTokens(text: string): number {
  return Math.max(0, Math.ceil(estimateTextTokenUnits(text) / 4));
}

function estimateBlockTokenUnits(block: NonNullable<AssistantTokenMessage["content"]>[number]): number {
  if (block.type === "text" && typeof block.text === "string") return estimateTextTokenUnits(block.text);
  if (block.type === "thinking" && typeof block.thinking === "string") return estimateTextTokenUnits(block.thinking);
  if (block.type === "toolCall") {
    let text = block.name ?? "";
    try { text += JSON.stringify(block.arguments ?? {}); } catch { /* provider data can be cyclic */ }
    return estimateTextTokenUnits(text);
  }
  return 0;
}

export function estimateOutputTokens(message: AssistantTokenMessage | undefined): number {
  const units = message?.content?.reduce((sum, block) => sum + estimateBlockTokenUnits(block), 0) ?? 0;
  return Math.max(0, Math.ceil(units / 4));
}

function formatDigital(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h <= 0) return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function effortInfo(pi: ExtensionAPI): { tag: string; color: ThemeColor } | undefined {
  try {
    const level = (pi.getThinkingLevel() || "").toLowerCase();
    if (!level || level === "off") return undefined;
    const map: Record<string, { tag: string; color: ThemeColor }> = {
      minimal: { tag: "MINIMAL", color: "thinkingMinimal" },
      low: { tag: "LOW", color: "thinkingLow" },
      medium: { tag: "MEDIUM", color: "thinkingMedium" },
      high: { tag: "HIGH", color: "thinkingHigh" },
      xhigh: { tag: "XHIGH", color: "thinkingXhigh" },
      max: { tag: "MAX", color: "thinkingMax" },
    };
    return map[level] ?? { tag: level.toUpperCase(), color: "thinkingXhigh" };
  } catch {
    return undefined;
  }
}

function colorSweep(theme: Theme, text: string, frame: number, reverse: boolean, stalled: boolean): string {
  const colors: ThemeColor[] = stalled
    ? ["warning", "error", "warning"]
    : ["accent", "toolTitle", "thinkingXhigh", "accent"];
  const total = text.length + SHIMMER_BAND * 2;
  const rawPosition = frame % total;
  const position = reverse ? total - 1 - rawPosition : rawPosition;
  let output = "";
  for (let index = 0; index < text.length; index++) {
    const distance = Math.abs(index - position);
    const highlighted = distance < SHIMMER_BAND;
    const color = highlighted
      ? colors[(frame + index) % colors.length]!
      : colors[index % colors.length]!;
    output += theme.fg(color, text[index]!);
  }
  return output;
}

function modeLabel(mode: SpinnerMode): string {
  switch (mode) {
    case "requesting": return "Preparing";
    case "thinking": return "Thinking";
    case "responding": return "Responding";
    case "tool-input": return "Preparing tool";
    case "tool-use": return "Using tool";
  }
}

function installShimmer(pi: ExtensionAPI): void {
  let mode: SpinnerMode = "requesting";
  let agentStart = 0;
  let turnStart = 0;
  let thinkingStart = 0;
  let completedOutputTokens = 0;
  let currentEstimatedTokens = 0;
  let currentReportedTokens: number | null = null;
  const currentBlockTokenUnits = new Map<number, number>();
  let currentEstimatedTokenUnits = 0;
  let lastTokenTime = 0;
  let turnActive = false;
  let activeToolCount = 0;
  let stallFrame = 0;
  let displayedTokens = 0;
  let tokensMoving = false;
  let shimmerTimer: ReturnType<typeof setInterval> | null = null;
  let tokenTimer: ReturnType<typeof setInterval> | null = null;
  let shimmerFrame = 0;
  let ctx: ExtensionContext | null = null;
  let widgetTui: TUI | null = null;
  let widgetMounted = false;
  let widgetText = "";
  let widgetMountTimer: ReturnType<typeof setTimeout> | null = null;
  let nativeWorkingHideTimer: ReturnType<typeof setTimeout> | null = null;

  const themeFg = (color: ThemeColor, text: string): string => {
    try { return ctx?.ui.theme.fg(color, text) ?? text; } catch { return text; }
  };

  function thinkingTag(): string | undefined {
    const info = effortInfo(pi);
    const tag = info?.tag ?? (mode === "thinking" ? "THINK" : "");
    if (!tag) return undefined;
    if (mode !== "thinking" || Date.now() - thinkingStart <= THINKING_GLOW_DELAY_MS) {
      return themeFg(info?.color ?? "thinkingXhigh", tag);
    }
    const elapsed = Date.now() - thinkingStart - THINKING_GLOW_DELAY_MS;
    const phase = (elapsed / THINKING_GLOW_PERIOD_MS) * Math.PI * 2;
    return themeFg(Math.sin(phase) >= 0 ? info?.color ?? "thinkingXhigh" : "thinkingXhigh", tag);
  }

  function buildStatusParts(): string[] {
    const elapsed = Date.now() - (agentStart || turnStart);
    const tokens = Math.round(Math.max(0, displayedTokens));
    const estimated = currentReportedTokens === null && currentEstimatedTokens > 0;
    const parts: string[] = [];
    const effort = thinkingTag();
    if (effort) parts.push(effort);
    if (turnActive || tokens > 0) {
      parts.push(`${themeFg("muted", mode === "requesting" ? "↑" : "↓")} ${themeFg("toolOutput", `${estimated ? "~" : ""}${formatTokenCount(tokens)}`)}`);
    }
    if (turnActive || elapsed > 0) parts.push(themeFg("dim", formatDigital(elapsed)));
    return parts;
  }

  function isStalled(): boolean {
    return mode !== "tool-use" && mode !== "tool-input" && activeToolCount === 0 && turnActive &&
      lastTokenTime > 0 && Date.now() - lastTokenTime > STALL_TIMEOUT_MS;
  }

  function updateDisplay(): void {
    if (!ctx?.ui) return;
    const dots = animatedDots(shimmerFrame);
    const hudParts = buildStatusParts();
    const hud = hudParts.length > 0 ? themeFg("dim", `( ${hudParts.join(" · ")} )`) : "";
    const message = colorSweep(ctx.ui.theme, `${modeLabel(mode)}${dots}`, shimmerFrame, mode !== "requesting", stallFrame > 0);
    const glyphColor: ThemeColor = mode === "thinking" ? effortInfo(pi)?.color ?? "thinkingXhigh" : "accent";
    const glyph = widgetMounted ? `${themeFg(glyphColor, SPINNER_FRAMES[shimmerFrame % SPINNER_FRAMES.length]!)} ` : "";
    widgetText = glyph + (hud ? `${message} ${hud}` : message);
    if (widgetMounted) widgetTui?.requestRender();
    else ctx.ui.setWorkingMessage(widgetText);
  }

  function mountWorkingWidget(sessionContext: ExtensionContext): void {
    if (typeof sessionContext.ui.setWidget !== "function") return;
    if (widgetMountTimer) clearTimeout(widgetMountTimer);
    widgetMountTimer = null;
    widgetMounted = true;
    const hideNativeWorking = (): void => {
      nativeWorkingHideTimer = null;
      if (widgetMounted && ctx === sessionContext) sessionContext.ui.setWorkingVisible(false);
    };
    hideNativeWorking();
    if (nativeWorkingHideTimer) clearTimeout(nativeWorkingHideTimer);
    nativeWorkingHideTimer = setTimeout(hideNativeWorking, 0);
    nativeWorkingHideTimer.unref?.();
    sessionContext.ui.setWidget(WORKING_WIDGET_KEY, (tui) => {
      widgetTui = tui;
      return {
        render: () => (turnActive && widgetText ? [widgetText] : []),
        invalidate: () => {},
        dispose: () => {
          if (widgetTui === tui) widgetTui = null;
        },
      };
    });
  }

  function scheduleWorkingWidget(sessionContext: ExtensionContext): void {
    if (typeof sessionContext.ui.setWidget !== "function") return;
    if (widgetMountTimer) clearTimeout(widgetMountTimer);
    widgetMountTimer = setTimeout(() => mountWorkingWidget(sessionContext), 0);
    widgetMountTimer.unref?.();
  }

  function unmountWorkingWidget(): void {
    if (widgetMountTimer) {
      clearTimeout(widgetMountTimer);
      widgetMountTimer = null;
    }
    if (nativeWorkingHideTimer) {
      clearTimeout(nativeWorkingHideTimer);
      nativeWorkingHideTimer = null;
    }
    if (!widgetMounted) return;
    ctx?.ui.setWidget(WORKING_WIDGET_KEY, undefined);
    ctx?.ui.setWorkingVisible(true);
    widgetMounted = false;
    widgetTui = null;
  }

  function setGlyphs(): void {
    if (!ctx?.ui) return;
    const color: ThemeColor = mode === "thinking"
      ? effortInfo(pi)?.color ?? "thinkingXhigh"
      : "accent";
    ctx.ui.setWorkingIndicator({
      frames: SPINNER_FRAMES.map((glyph) => themeFg(color, glyph)),
      intervalMs: 120,
    });
  }

  function stopTokenCounter(): void {
    if (tokenTimer) {
      clearInterval(tokenTimer);
      tokenTimer = null;
    }
  }

  function startTokenCounter(): void {
    if (tokenTimer) return;
    tokenTimer = setInterval(() => {
      const current = currentReportedTokens ?? currentEstimatedTokens;
      const target = Math.max(0, completedOutputTokens + current);
      const gap = target - displayedTokens;
      if (gap !== 0) {
        const distance = Math.abs(gap);
        const step = distance < 8 ? distance : distance < 40 ? Math.max(2, Math.ceil(distance * 0.28)) :
          distance < 200 ? Math.max(8, Math.ceil(distance * 0.2)) : Math.max(24, Math.ceil(distance * 0.14));
        displayedTokens += Math.sign(gap) * Math.min(distance, step);
        tokensMoving = true;
        updateDisplay();
      } else if (tokensMoving) {
        tokensMoving = false;
        updateDisplay();
      }
    }, TOKEN_COUNTER_MS);
  }

  function stopShimmer(): void {
    if (shimmerTimer) {
      clearInterval(shimmerTimer);
      shimmerTimer = null;
    }
    stopTokenCounter();
  }

  function startShimmer(): void {
    stopShimmer();
    shimmerFrame = 0;
    updateDisplay();
    shimmerTimer = setInterval(() => {
      shimmerFrame++;
      const stalled = isStalled();
      if (stalled && stallFrame < STALL_TRANSITION_FRAMES) stallFrame++;
      else if (!stalled && stallFrame > 0) stallFrame--;
      updateDisplay();
    }, mode === "requesting" ? SHIMMER_MS_REQUESTING : SHIMMER_MS_WORKING);
    startTokenCounter();
  }

  function setMode(next: SpinnerMode): void {
    if (mode === next) return;
    mode = next;
    setGlyphs();
    if (shimmerTimer) startShimmer();
  }

  function setEstimatedBlock(index: number, units: number): void {
    const next = Math.max(0, units);
    const previous = currentBlockTokenUnits.get(index) ?? 0;
    currentBlockTokenUnits.set(index, next);
    currentEstimatedTokenUnits += next - previous;
    currentEstimatedTokens = Math.ceil(currentEstimatedTokenUnits / 4);
  }

  function appendEstimatedBlock(index: number, text: string): void {
    setEstimatedBlock(index, (currentBlockTokenUnits.get(index) ?? 0) + estimateTextTokenUnits(text));
  }

  function resetTurn(resetOutput = false): void {
    stopShimmer();
    widgetText = "";
    if (!widgetMounted) ctx?.ui.setWorkingMessage();
    mode = "requesting";
    currentBlockTokenUnits.clear();
    currentEstimatedTokenUnits = 0;
    currentEstimatedTokens = 0;
    currentReportedTokens = null;
    if (resetOutput) {
      completedOutputTokens = 0;
      displayedTokens = 0;
      tokensMoving = false;
    }
    stallFrame = 0;
    lastTokenTime = 0;
    activeToolCount = 0;
    setGlyphs();
  }

  function initTurn(resetOutput = false): void {
    turnActive = true;
    turnStart = Date.now();
    if (!agentStart) agentStart = turnStart;
    resetTurn(resetOutput);
    setMode("requesting");
    startShimmer();
  }

  pi.on("session_start", async (_event, sessionContext) => {
    if (sessionContext.mode === "tui") {
      ctx = sessionContext;
      scheduleWorkingWidget(sessionContext);
    }
  });

  pi.on("agent_start", async (_event, sessionContext) => {
    if (sessionContext.mode !== "tui") return;
    ctx = sessionContext;
    mountWorkingWidget(sessionContext);
    if (!agentStart) agentStart = Date.now();
    if (!turnActive) initTurn(true);
  });

  pi.on("turn_start", async (_event, sessionContext) => {
    if (sessionContext.mode !== "tui") return;
    ctx = sessionContext;
    if (!turnActive) initTurn();
  });

  pi.on("message_update", async (event, sessionContext) => {
    if (sessionContext.mode !== "tui") return;
    ctx = sessionContext;
    const evt = event.assistantMessageEvent as StreamEvent;
    const tokenMessage = event.message as AssistantTokenMessage;
    const reported = reportedOutputTokens(tokenMessage);
    if (reported !== null) currentReportedTokens = reported;
    const index = evt.contentIndex ?? 0;

    switch (evt.type) {
      case "start":
        currentBlockTokenUnits.clear();
        currentEstimatedTokenUnits = 0;
        currentEstimatedTokens = 0;
        break;
      case "text_start":
      case "thinking_start":
        setEstimatedBlock(index, 0);
        break;
      case "text_delta":
      case "thinking_delta":
      case "toolcall_delta":
        appendEstimatedBlock(index, evt.delta ?? "");
        break;
      case "text_end":
      case "thinking_end":
        setEstimatedBlock(index, estimateTextTokenUnits(evt.content ?? ""));
        break;
      case "toolcall_start": {
        const block = tokenMessage.content?.[index];
        setEstimatedBlock(index, block ? estimateBlockTokenUnits(block) : 0);
        break;
      }
      case "toolcall_end": {
        let text = evt.toolCall?.name ?? "";
        try { text += JSON.stringify(evt.toolCall?.arguments ?? {}); } catch { /* provider data can be cyclic */ }
        setEstimatedBlock(index, estimateTextTokenUnits(text));
        break;
      }
    }

    switch (evt.type) {
      case "thinking_start":
        thinkingStart = Date.now();
        setMode("thinking");
        break;
      case "thinking_delta":
        setMode("thinking");
        lastTokenTime = Date.now();
        break;
      case "text_start":
      case "text_delta":
        setMode("responding");
        lastTokenTime = Date.now();
        break;
      case "toolcall_start":
        setMode("tool-input");
        break;
    }
  });

  pi.on("message_end", async (event, sessionContext) => {
    if (sessionContext.mode !== "tui" || event.message.role !== "assistant") return;
    ctx = sessionContext;
    const finalMessage = event.message as AssistantTokenMessage;
    completedOutputTokens += reportedOutputTokens(finalMessage, true) ?? estimateOutputTokens(finalMessage);
    currentBlockTokenUnits.clear();
    currentEstimatedTokenUnits = 0;
    currentEstimatedTokens = 0;
    currentReportedTokens = null;
    displayedTokens = completedOutputTokens;
    tokensMoving = false;
    updateDisplay();
  });

  pi.on("tool_execution_start", async (_event, sessionContext) => {
    if (sessionContext.mode !== "tui") return;
    ctx = sessionContext;
    activeToolCount++;
  });

  pi.on("tool_execution_end", async (_event, sessionContext) => {
    if (sessionContext.mode !== "tui") return;
    ctx = sessionContext;
    activeToolCount = Math.max(0, activeToolCount - 1);
    if (activeToolCount === 0 && (mode === "tool-use" || mode === "tool-input") && turnActive) setMode("responding");
  });

  pi.on("turn_end", async (_event, sessionContext) => {
    if (sessionContext.mode !== "tui") return;
    ctx = sessionContext;
    turnActive = false;
    stopShimmer();
    activeToolCount = 0;
  });

  pi.on("agent_end", async (_event, sessionContext) => {
    if (sessionContext.mode !== "tui") return;
    ctx = sessionContext;
    turnActive = false;
    stopShimmer();
    widgetText = "";
    if (widgetMounted) widgetTui?.requestRender();
    else ctx.ui.setWorkingMessage();
    agentStart = 0;
  });

  pi.on("session_shutdown", async () => {
    turnActive = false;
    stopShimmer();
    widgetText = "";
    unmountWorkingWidget();
    ctx?.ui.setWorkingMessage();
    ctx?.ui.setWorkingIndicator();
    ctx = null;
  });
}

export function installThinkingShimmer(pi: ExtensionAPI): void {
  installShimmer(pi);
}
