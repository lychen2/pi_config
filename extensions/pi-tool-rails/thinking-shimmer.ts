import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { shortToolName } from "./tool-presentations.mjs";

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
const SHIMMER_MS_REQUESTING = 80;
const SHIMMER_MS_WORKING = 80;
const TOKEN_COUNTER_MS = 40;
const WAVE_LENGTH = 7;
const WAVE_SPEED = 0.42;
const STALL_TIMEOUT_MS = 3_000;
const STALL_TRANSITION_FRAMES = 28;
const THINKING_GLOW_DELAY_MS = 1_800;
const THINKING_GLOW_PERIOD_MS = 1_600;
const PHASE_ROTATION_MS = 4_500;
const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const EMOJI_CHAR = /\p{Extended_Pictographic}/u;

export function formatTokenCount(n: number): string {
  const value = Math.max(0, Math.round(n));
  const number = value < 1_000
    ? new Intl.NumberFormat("en-US").format(value)
    : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
      .format(value)
      .replace("K", "k");
  return `${number} 词元`;
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
      minimal: { tag: "极简", color: "thinkingMinimal" },
      low: { tag: "低", color: "thinkingLow" },
      medium: { tag: "中", color: "thinkingMedium" },
      high: { tag: "高", color: "thinkingHigh" },
      xhigh: { tag: "很高", color: "thinkingXhigh" },
      max: { tag: "最大", color: "thinkingMax" },
    };
    return map[level] ?? { tag: level.toUpperCase(), color: "thinkingXhigh" };
  } catch {
    return undefined;
  }
}

export function colorSweep(theme: Theme, text: string, frame: number, _reverse: boolean, stalled: boolean): string {
  const characters = [...text];
  if (characters.length === 0) return "";
  let output = "";
  for (let index = 0; index < characters.length; index++) {
    const intensity = (Math.sin(index * (Math.PI * 2 / WAVE_LENGTH) - frame * WAVE_SPEED) + 1) / 2;
    const color: ThemeColor = stalled
      ? intensity > 0.82 ? "toolTitle" : intensity > 0.48 ? "accent" : "dim"
      : intensity > 0.82 ? "toolTitle" : intensity > 0.52 ? "accent" : intensity > 0.24 ? "muted" : "dim";
    output += theme.fg(color, characters[index]!);
  }
  return output;
}

export const PHASE_LINES_HUMOR = {
  requesting: [
    "正在敲模型家的门",
    "正在把任务塞进上下文",
    "正在给问题找个好角度",
    "正在等灵感排队进场",
    "正在翻开这次对话的地图",
    "正在给你的要求打聚光灯",
    "正在整理出发前的行李",
    "正在把问题递上思考台",
    "正在给推理确认目的地",
    "正在给答案热热身",
    "正在让上下文互相认识",
    "正在把线索请到候场区",
  ],
  thinking: [
    "正在摊开线索",
    "正在给思路排队",
    "正在拆解这只复杂问题",
    "正在给逻辑拧紧螺丝",
    "正在把零散线索串起来",
    "正在和复杂度讨价还价",
    "正在把疑点拉到灯下",
    "正在给关键路径清清场",
    "正在让推理先试跑一圈",
    "正在检查结论有没有漏风",
    "正在把思路里的杂音请出去",
    "正在给答案寻找近道",
  ],
  responding: [
    "正在把结论捏成句子",
    "正在给重点排队入场",
    "正在落笔，墨水已就位",
    "正在把人话装进答案",
    "正在给思路打个漂亮的包",
    "正在把多余弯路折起来",
    "正在给重点擦亮边角",
    "正在把结论放到该在的位置",
    "正在给答案缝上最后一针",
    "正在把信息摆得顺眼些",
    "正在把技术黑话翻译成人话",
    "正在把收尾抚平",
  ],
  "tool-input": [
    "正在和参数对口供",
    "正在给工具塞小纸条",
    "正在检查参数有没有穿帮",
    "正在给调用系好安全带",
    "正在让字段各就各位",
    "正在把意图翻译给工具听",
    "正在给工具准备不迷路的说明",
    "正在把调用细节逐个扣上",
    "正在把输入拧到刚刚好",
    "正在核对工具的出发清单",
    "正在给参数做最后一次体检",
    "正在照看好小数点和边界",
  ],
  "tool-use": [
    "工具正在认真办事",
    "正在等工具回话",
    "正在接收执行结果",
    "正在等现场报告送达",
    "工具已出发，请保持淡定",
    "正在核对工具带回的线索",
    "正在给执行现场留盏灯",
    "正在等结果穿过终端",
    "正在听工具那边的动静",
    "正在准备接住返回的数据",
    "正在等现场消息落地",
    "正在核验这趟调用的回执",
  ],
} as const;

export const PHASE_LINES_MEME = {
  requesting: [
    "正在敲AI工位的门喊它上班",
    "正在往内存塞任务大礼包",
    "正在挖这个问题的重点瓜",
    "蹲一个灵感从天而降",
    "打开本次闯关任务地图",
    "把你的需求拉满曝光buff",
    "检查装备防止中途掉链子",
    "把问题放上审判工作台",
    "标记好本次答题终点打卡点",
    "给答案引擎热车打火",
    "催促上下文群聊开始对接",
  ],
  thinking: [
    "线索摊一地开始地毯式搜索",
    "疯狂排查容易踩坑的岔路",
    "拽回跑偏放飞自我的思路",
    "逻辑螺丝必须拧到最紧",
    "碎片线索紧急绑定成串",
    "和难缠问题极限battle",
    "把隐藏坑点揪出来示众",
    "清理思路路上各种障碍物",
    "先跑一遍模拟测试防翻车",
    "摇一摇答案牢不牢固",
    "一键屏蔽脑子里无效噪音",
  ],
  responding: [
    "疯狂码字组装最终答案",
    "抓回到处乱跑的核心要点",
    "正式开启码字输出模式",
    "努力从机器语转人类语言",
    "安排知识点出场先后顺序",
    "答案快递打包准备出库",
    "大刀砍掉没用水字数部分",
    "给重点打上高光特效",
    "防止答案飘到外太空",
    "紧急补上答案最后的漏洞",
    "调整版式提升阅读体验",
  ],
  "tool-input": [
    "正在跟参数疯狂对剧本",
    "往工具包里塞任务便签",
    "排查参数会不会当场报错",
    "给本次调用买好保险",
    "全体字段各就各位不许乱动",
    "翻译成人畜无害工具指令",
    "写一份保姆级行动说明书",
    "挨个把调用细节锁死",
    "精细调到参数黄金数值",
    "清点工具出门必备清单",
    "全身体检防止参数炸锅",
  ],
  "tool-use": [
    "工具打工人正在全力肝任务",
    "搓手手等工具打工返图",
    "已经摆好盘子接返回数据",
    "外勤工具正在实地探查",
    "工具已发车请勿中途打断",
    "仔细翻看工具带回来情报",
    "远程盯紧工具工作进度条",
    "数据包正在网线狂飙中",
    "在线吃瓜监听工具反馈",
    "张开双手准备接收结果",
    "扫码核验工具任务小票",
  ],
} as const;

export const PHASE_LINES_DREAMY = {
  requesting: [
    "轻轻叩响思考小屋的门扉",
    "将任务温柔放进随身行囊",
    "慢慢看清问题藏起来的模样",
    "静静等候灵感悄悄浮上来",
    "铺开属于这次旅途的地图",
    "把你的心愿放到灯光之下",
    "整理好即将出发的随身物品",
    "将问题轻轻放置思考台面",
    "确定好本次航行停靠彼岸",
    "慢慢温热生成答案的引擎",
    "邀请上下文彼此打个招呼",
  ],
  thinking: [
    "缓缓摊开散落一地的线索",
    "仔细辨认每一条分叉小路",
    "让飘散思绪慢慢回归正轨",
    "一点点加固答案逻辑框架",
    "把细碎光点连成完整丝线",
    "耐心和复杂难题慢慢和解",
    "将藏在暗处疑点带到光亮处",
    "清理道路上多余的小阻碍",
    "先完整走过一遍思考旅途",
    "轻轻晃动检查答案稳不稳",
    "拂去思绪里细碎嘈杂杂音",
  ],
  responding: [
    "慢慢将思绪编织成温柔文字",
    "收拢四处飘散的核心要点",
    "拿起笔，开始书写回复",
    "转换成好读懂的温柔语言",
    "为每一个知识点排好队伍",
    "打包好全部想法准备寄出",
    "舍弃旅途里面多余弯路",
    "擦亮最关键的星光要点",
    "让答案安稳落到现实地面",
    "补上最后一小块拼图碎片",
    "把文字摆放成舒服模样",
  ],
  "tool-input": [
    "轻声和工具核对行动清单",
    "递过去一张手写任务便条",
    "仔细检查每一项输入信息",
    "系好工具远行的安全带",
    "让每个字段找到自己位置",
    "把想法翻译成工具的语言",
    "写下一份清晰的导航指引",
    "一点点完善每一处细节",
    "微调输入到刚刚好的状态",
    "清点工具远行所需物资",
    "做一次出发前最后的检查",
  ],
  "tool-use": [
    "工具正在认真完成它的工作",
    "安静等候远方传来消息",
    "做好接收结果的准备",
    "等待外勤带回远方见闻",
    "工具已经踏上它的旅程",
    "细细品读收集回来的线索",
    "留一盏灯等候它平安归来",
    "数据正在穿过夜色奔赴这里",
    "安静聆听远处传来的动静",
    "准备稳稳接住归来的消息",
    "确认本次旅程顺利完成",
  ],
} as const;

export const PHASE_LINES = {
  requesting: [...PHASE_LINES_HUMOR.requesting, ...PHASE_LINES_MEME.requesting, ...PHASE_LINES_DREAMY.requesting],
  thinking: [...PHASE_LINES_HUMOR.thinking, ...PHASE_LINES_MEME.thinking, ...PHASE_LINES_DREAMY.thinking],
  responding: [...PHASE_LINES_HUMOR.responding, ...PHASE_LINES_MEME.responding, ...PHASE_LINES_DREAMY.responding],
  "tool-input": [...PHASE_LINES_HUMOR["tool-input"], ...PHASE_LINES_MEME["tool-input"], ...PHASE_LINES_DREAMY["tool-input"]],
  "tool-use": [...PHASE_LINES_HUMOR["tool-use"], ...PHASE_LINES_MEME["tool-use"], ...PHASE_LINES_DREAMY["tool-use"]],
} as const;

export function shuffledPhaseOrder(length: number, random: () => number = Math.random): number[] {
  const order = Array.from({ length: Math.max(0, length) }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [order[index], order[swapIndex]] = [order[swapIndex]!, order[index]!];
  }
  return order;
}

function modeLabel(
  mode: SpinnerMode,
  activeTools: readonly string[],
  aside: string,
): string {
  if (mode !== "tool-use") return aside;
  if (activeTools.length > 1) return `正在并行执行 ${activeTools.length} 项工具 · ${aside}`;
  return activeTools[0] ? `正在执行：${shortToolName(activeTools[0])} · ${aside}` : aside;
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
  const activeTools = new Map<string, string>();
  let stallFrame = 0;
  let displayedTokens = 0;
  let tokensMoving = false;
  let shimmerTimer: ReturnType<typeof setInterval> | null = null;
  let tokenTimer: ReturnType<typeof setInterval> | null = null;
  let shimmerFrame = 0;
  let phaseStartedAt = Date.now();
  const phaseOrder: number[] = [];
  let phaseCycle = -1;
  let previousPhaseIndex: number | undefined;
  let ctx: ExtensionContext | null = null;
  let sessionGeneration = 0;
  let resizeListening = false;
  let widgetText = "";

  function currentPhaseLine(): string {
    const lines = PHASE_LINES[mode];
    const slot = Math.floor(Math.max(0, Date.now() - phaseStartedAt) / PHASE_ROTATION_MS);
    const cycle = Math.floor(slot / lines.length);
    if (cycle !== phaseCycle) {
      const next = shuffledPhaseOrder(lines.length);
      if (next.length > 1 && next[0] === previousPhaseIndex) [next[0], next[1]] = [next[1]!, next[0]!];
      phaseOrder.splice(0, phaseOrder.length, ...next);
      phaseCycle = cycle;
    }
    const index = phaseOrder[slot % lines.length] ?? 0;
    previousPhaseIndex = index;
    return lines[index]!;
  }

  function resetPhaseRotation(): void {
    phaseStartedAt = Date.now();
    phaseCycle = -1;
    phaseOrder.splice(0, phaseOrder.length);
  }

  function themeFg(color: ThemeColor, text: string): string {
    try { return ctx?.ui.theme.fg(color, text) ?? text; } catch { return text; }
  }

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
    const sessionContext = ctx;
    if (!sessionContext) return;
    try {
      const dots = animatedDots(shimmerFrame);
      const hudParts = buildStatusParts();
      const hud = hudParts.length > 0 ? themeFg("dim", `( ${hudParts.join(" · ")} )`) : "";
      const message = colorSweep(
        sessionContext.ui.theme,
        `${modeLabel(mode, [...activeTools.values()], currentPhaseLine())}${dots}`,
        shimmerFrame,
        mode !== "requesting",
        stallFrame > 0,
      );
      widgetText = hud ? `${message} ${hud}` : message;
      // Native Loader owns the animation clock and terminal redraw cycle.
      sessionContext.ui.setWorkingMessage(widgetText);
    } catch {
      // A teardown can invalidate the context while a UI interval is winding down.
    }
  }

  function setGlyphs(): void {
    const sessionContext = ctx;
    if (!sessionContext) return;
    const color: ThemeColor = mode === "thinking"
      ? effortInfo(pi)?.color ?? "thinkingXhigh"
      : "accent";
    try {
      sessionContext.ui.setWorkingIndicator({
        frames: SPINNER_FRAMES.map((glyph) => themeFg(color, glyph)),
        intervalMs: 80,
      });
    } catch {
      // A session replacement can invalidate its UI between event dispatches.
    }
  }

  function stopTokenCounter(): void {
    if (tokenTimer) {
      clearInterval(tokenTimer);
      tokenTimer = null;
    }
  }

  function startTokenCounter(): void {
    if (tokenTimer) return;
    const generation = sessionGeneration;
    tokenTimer = setInterval(() => {
      if (generation !== sessionGeneration) return;
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
    const generation = sessionGeneration;
    shimmerTimer = setInterval(() => {
      if (generation !== sessionGeneration) return;
      shimmerFrame++;
      const stalled = isStalled();
      if (stalled && stallFrame < STALL_TRANSITION_FRAMES) stallFrame++;
      else if (!stalled && stallFrame > 0) stallFrame--;
      updateDisplay();
    }, mode === "requesting" ? SHIMMER_MS_REQUESTING : SHIMMER_MS_WORKING);
    startTokenCounter();
  }

  function ensureShimmer(): void {
    if (turnActive && !shimmerTimer) startShimmer();
  }

  function setMode(next: SpinnerMode): void {
    if (mode === next) return;
    mode = next;
    resetPhaseRotation();
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
    try { ctx?.ui.setWorkingMessage(); } catch { /* session context retired */ }
    phaseStartedAt = Date.now();
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
    activeToolCount = 0;
    activeTools.clear();
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

  function handleTerminalResize(): void {
    if (!ctx || !turnActive) return;
    startShimmer();
  }

  function setResizeListening(enabled: boolean): void {
    if (enabled === resizeListening) return;
    resizeListening = enabled;
    if (enabled) process.stdout.on("resize", handleTerminalResize);
    else process.stdout.off("resize", handleTerminalResize);
  }

  function disposeSession(): void {
    setResizeListening(false);
    sessionGeneration++;
    turnActive = false;
    stopShimmer();
    widgetText = "";
    try {
      ctx?.ui.setWorkingMessage();
      ctx?.ui.setWorkingIndicator();
    } catch {
      // A defensive second start may arrive after the prior context retired.
    }
    ctx = null;
    agentStart = 0;
    turnStart = 0;
  }

  pi.on("session_start", async (_event, sessionContext) => {
    disposeSession();
    if (sessionContext.mode !== "tui") return;
    ctx = sessionContext;
    sessionGeneration++;
    setResizeListening(true);
  });

  pi.on("agent_start", async (_event, sessionContext) => {
    if (sessionContext.mode !== "tui" || !ctx) return;
    ctx.ui.setWorkingVisible?.(true);
    if (!agentStart) agentStart = Date.now();
    if (!turnActive) initTurn(true);
  });

  pi.on("turn_start", async (_event, sessionContext) => {
    if (sessionContext.mode !== "tui" || !ctx) return;
    if (!turnActive) initTurn();
  });

  pi.on("message_update", async (event, sessionContext) => {
    if (sessionContext.mode !== "tui") return;
    if (!ctx) return;
    ensureShimmer();
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
    if (!ctx) return;
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

  pi.on("tool_execution_start", async (event, sessionContext) => {
    if (sessionContext.mode !== "tui") return;
    if (!ctx) return;
    ensureShimmer();
    activeTools.set(event.toolCallId, event.toolName);
    activeToolCount = activeTools.size;
    setMode("tool-use");
    if (!shimmerTimer) startShimmer();
  });

  pi.on("tool_execution_end", async (event, sessionContext) => {
    if (sessionContext.mode !== "tui") return;
    if (!ctx) return;
    ensureShimmer();
    activeTools.delete(event.toolCallId);
    activeToolCount = activeTools.size;
    if (activeToolCount === 0 && (mode === "tool-use" || mode === "tool-input") && turnActive) setMode("responding");
  });

  pi.on("turn_end", async (_event, sessionContext) => {
    if (sessionContext.mode !== "tui") return;
    if (!ctx) return;
    ensureShimmer();
    activeToolCount = 0;
    activeTools.clear();
  });

  pi.on("agent_end", async (_event, sessionContext) => {
    const sessionContextAtStart = ctx;
    if (sessionContext.mode !== "tui" || !sessionContextAtStart) return;
    turnActive = false;
    stopShimmer();
    widgetText = "";
    try {
      sessionContextAtStart.ui.setWorkingMessage();
      sessionContextAtStart.ui.setWorkingIndicator();
      sessionContextAtStart.ui.setWorkingVisible?.(true);
    } catch {
      // The session context can retire during the final repaint.
    }
    agentStart = 0;
  });

  pi.on("session_shutdown", disposeSession);
}

export function installThinkingShimmer(pi: ExtensionAPI): void {
  installShimmer(pi);
}
