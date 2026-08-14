# 扩展目录

本页说明 `pi_config` 中的扩展如何使用。扩展拥有与 Pi 相同的本机权限；安装未知 package 前先检查其源码和 `package.json`。

回到[完整使用手册](USAGE.zh-CN.md)或[快速上手](WIKI.zh-CN.md)。

## 本仓库 package

安装器会扫描 `extensions/` 下带 `pi-*/package.json` 的 package；默认退役清单中的兼容包（目前包括 `pi-gsd`）保留源码但不会自动安装。开发时进入对应目录运行 `npm run typecheck`；带测试的 package 还可运行 `npm test`。

| 扩展 | 解决的问题 | 使用入口 | 配置或开关 |
| --- | --- | --- | --- |
| `pi-brand-header` | 在启动栏显示模型、思考级别、目录、主题、技能和工具数量 | `/logo` 显示或隐藏 | 仅 TUI 生效；窄终端自动折叠 |
| `pi-deferred-tools` | 项目级两级工具选择器；工具不再延迟，旧包名仅为兼容 | `/tools` 两级 TUI；`/tools list` 查看状态；`/tools fast` 最小工具预设、`/tools reset` 恢复 | 受信任项目 `.pi/tool-selector.json`；`PI_TOOL_SELECTOR_DISABLE=1` 禁用 |
| `pi-manager-models` | 从 OpenAI-compatible `/models` 刷新 `manager` 模型目录 | 启动时自动刷新 | `PI_MANAGER_MODELS_PROVIDER`、`PI_MANAGER_MODELS_CONFIG` |
| `pi-slim-skills` | 压缩模型可见的技能索引，降低提示词体积 | `/slim-skills remove <名称>`、`none`、`reset`、`inject <名称>` | `slim-skills-whitelist.json`；`SLIM_SKILLS_DISABLE=1` 禁用 |
| `pi-todo-guard` | Todo 仍有未完成项目时，提醒代理继续当前任务 | 自动处理 | `PI_TODO_GUARD_DISABLE=1`；默认兼容 `todo` 工具 |
| `pi-maestro-todo` | 以 Maestro 风格显示并持久化 Todo，提供状态层级、筛选和任务明细 | 模型调用 `todo`；`/todos` 或 `/maestro-todo` 打开任务中心；`Alt+T` 展开/收起面板 | 兼容旧 `rpiv-todo` 会话快照，不加载 Maestro 的 Goal、skills 或 teammate 运行时 |
| `pi-maestro-tools` | FFF 文件/字面搜索、后台 Shell 和 Git 冲突解析 | 模型调用 `fffind`、`ffgrep`、`bash_bg`、`conflict` | 默认加载；只搜索工作区，冲突解析会重验原始 hunk |
| `pi-readseek-compat` | 作为 Readseek、Web Access、默认 teammate 和原生 `read` 的唯一注册入口，修正默认模式公开 schema | 模型调用 `readSeek_*`、联网工具、`teammate`/`observe` 和 `read` | 锁定上游实现版本；只适配 schema、错误边界和已审计的输入兼容性 |
| `pi-markdown-preview-compat` | 作为 Markdown Preview 的唯一注册入口，验证 PNG 签名并执行一次缓存重试 | `/preview`、`/preview-browser`、`/preview-pdf`，模型调用 `preview_export` | PNG 验证失败会清理 artifact 并返回错误，不再报告虚假成功 |
| `pi-large-mode` | 在当前会话的默认 package 边界与固定上游 Maestro Flow profile 之间切换 | `/large on|off|status|update` | Large 固定加载 Flow、teammate 与 Cockpit；关闭时恢复原始顺序和 `autoload` |
| `pi-tool-rails` | 提供稳定的工具标签、结果面板、diff 和输入框样式 | 自动处理 | `PI_TOOL_RAILS_DISABLE_USER_FRAME=1` 仅关闭用户消息边框 |
| `pi-gsd` | 可选的串行 session-tree subagent；安装器不再默认启用 | 手动安装后用 `push-task`、`/start-task`、`/finish-task`、`/auto` | 默认并行委派使用 `pi-maestro-teammate`；仅在明确需要同一 session tree 工作流时安装 |


### 项目工具选择

`pi-deferred-tools` 保留旧包名以兼容现有安装，但 **tools are no longer deferred**。它现在只是项目级工具选择器：扩展工具默认可用，需要减少某个项目发送给模型的工具定义时输入：

```text
/tools
```

一级列表按扩展显示启用数量。`Space` 开关整组，`Enter` 进入二级列表，再用 `Space` 或 `Enter` 切换单个工具。配置立即生效，并写入受信任项目的 `.pi/tool-selector.json`。`/tools list` 可不打开 TUI 直接查看状态。

这个选择器只控制模型可调用的工具，不会卸载扩展 package、命令或事件处理器。要禁用整个 package 资源，在终端运行 `pi config -l`。新增或更新 package 后运行 `/reload`，选择器会重新发现工具归属。



## 独立扩展

| 扩展 | 用途 | 入口 |
| --- | --- | --- |
| `adhd-mode.ts` | 将面向 ADHD 的输出规则注入每轮系统提示词，状态写入会话 | `/adhd` 开关 |
| `matugen-chrome.ts` + `matugen-footer-core.mjs` | Matugen footer：实时 Context、Git 操作状态、扩展状态清洗和 working 行 | `/matugen-chrome` 开关 |

这些文件只在 `~/.pi/agent/extensions/` 中不存在时复制；本机已有文件会保留。修改文件后在 Pi 内运行 `/reload`。

## 第三方 package

这些 package 来自 [`../config/external-packages.txt`](../config/external-packages.txt)，由安装器在选择 `--with-external` 时安装。版本以本机 `pi list` 为准。Readseek、Web Access、默认 teammate 和 Markdown Preview 不再作为独立 package 条目安装；它们是上述两个本地兼容入口的锁定 production dependencies。

| Package | 能力 | 常用入口 |
| --- | --- | --- |
| `@narumitw/pi-plan-mode` | 只读的计划协作模式 | `/plan` |
| `@juicesharp/rpiv-ask-user-question` | 有选项、可结构化回答的问题组件 | 模型在需要澄清时调用 `ask_user_question` |
| `pi-slopchop` | 终端内代码审阅与注释 | `/slopchop` 或 `/diff` |
| `pi-workspace-history` | 工作区级撤销与重做 | 在需要回退文件改动时调用其命令；先查看 `/hotkeys` 中实际注册键位 |
| `pi-rtk-optimizer` | RTK 命令改写和通用工具输出压缩 | `/rtk verify`；需要安装 `rtk` binary |
| `pi-cache-optimizer` | 稳定提示词和 provider cache，提高缓存命中 | `/cache-optimizer` 查看或调整状态 |
| `@victor-software-house/pi-curated-themes` | 额外终端主题资源 | `/settings` 中选择主题 |
| `git:github.com/BevalZ/pi-provider` | 配置与检查自定义 provider | `/provider add`，再用 `/model` 选择模型 |

## 组合建议

- **常规编码**：Pi 原生 `bash`、`pi-readseek-compat` 提供的 `read`/Readseek/Web/teammate 工具、`pi-markdown-preview-compat`、`pi-maestro-tools`、`pi-maestro-todo`、`pi-tool-rails`、`pi-rtk-optimizer`、`pi-cache-optimizer` 与 `pi-todo-guard` 构成默认基础。
- **需要深度项目编排**：在当前 Pi 会话运行 `/large on`；它加载固定版本的完整上游 Flow、teammate 和 Cockpit，包括 GUI、MCP、LSP、browser/web search、FFF、conflict、root `bash_bg`、Advisor、self-evolve、Goal、Todo、Plan、Loop、agents 和 Maestro skills。完成后用 `/large off` 恢复默认 package 边界。
- **需要联网资料**：直接要求模型搜索网页、抓取 URL 或克隆 GitHub 仓库；相关工具默认可用。

## 排障

1. 扩展更新、配置修改或新装 package 后运行 `/reload`。
2. `pi list` 检查 package 是否被当前 settings 启用。
3. `pi --no-extensions` 可临时排除扩展，定位是否为扩展冲突。
4. 只加载一个扩展时使用 `pi --no-extensions -e /绝对路径/extension.ts`。
5. 将 `PI_*_DISABLE=1` 放在启动命令前，只禁用有明确环境开关的扩展。
