export const COMMAND_DESCRIPTIONS = Object.freeze({
  slopchop: "审查并标注代码改动",
  diff: "审查并标注代码改动",
  rtk: "配置 RTK 重写和输出压缩集成",
  plan: "进入或管理类 Codex 的计划模式",
  provider: "管理提供商：添加、复制、编辑、移除、测试、检查、状态与归档",
  ponytail: "设置 Ponytail 模式：查看状态、设置默认模式或切换运行模式",
  "ponytail-review": "运行 /skill:ponytail-review",
  "ponytail-audit": "运行 /skill:ponytail-audit",
  "ponytail-gain": "运行 /skill:ponytail-gain",
  "ponytail-debt": "运行 /skill:ponytail-debt",
  "ponytail-help": "运行 /skill:ponytail-help",
});

function commandName(value) {
  return String(value ?? "").replace(/^\/+/, "").trim().split(/\s/, 1)[0];
}

function sourceTag(description) {
  return typeof description === "string" ? description.match(/^\[[^\]]+\]\s*/)?.[0] ?? "" : "";
}

export function localizeSlashSuggestions(suggestions) {
  if (!suggestions?.prefix?.startsWith("/") || !Array.isArray(suggestions.items)) return suggestions;

  return {
    ...suggestions,
    items: suggestions.items.map((item) => {
      const description = COMMAND_DESCRIPTIONS[commandName(item.value ?? item.label)];
      return description ? { ...item, description: `${sourceTag(item.description)}${description}` } : item;
    }),
  };
}
