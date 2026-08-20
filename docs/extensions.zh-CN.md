# 扩展目录

本页说明 `pi_config` 中的扩展如何使用。扩展拥有与 Pi 相同的本机权限；安装未知 package 前先检查其源码和 `package.json`。

回到[完整使用手册](USAGE.zh-CN.md)或[快速上手](WIKI.zh-CN.md)。

## 本仓库 package

安装器会扫描 `extensions/` 下带 `pi-*/package.json` 的 package；默认退役清单中的兼容包（目前包括 `pi-gsd` 和 Large 专用的 `pi-large-beautify`）保留源码但不会自动安装。开发时进入对应目录运行 `npm run typecheck`；带测试的 package 还可运行 `npm test`。

| 扩展 | 解决的问题 | 使用入口 | 配置或开关 |
| --- | --- | --- | --- |
| `pi-brand-header` | 在启动栏显示模型、思考级别、目录、主题、技能和工具数量 | `/logo` 显示或隐藏 | 仅 TUI 生效；窄终端自动折叠 |
| `pi-deepseek-anchored-standard` | DeepSeek V4 Pro/Flash 的 Minimal bootstrap、锚点和渐进式上下文恢复 | `/dsh-anchor` 查看、`promote` 或 `rearm` 管理 | 仅匹配目标模型；`PI_DEEPSEEK_ANCHORED_STANDARD_DISABLE=1` 禁用 |
| `pi-default-workbench` | Default 功能工作台：adaptive/fast/full 工具模式、Puppeteer 浏览器、Todo、FFF/后台 Shell/冲突处理和 Markdown Preview | `/tools`、`/todos`、模型调用 `browser`、`todo`、`fffind`、`ffgrep`、`bash_bg`、`conflict`、`preview_export` | 五类功能共用一个根 `index.ts`；项目 `.pi/tool-selector.json` 仍可按工具管理 |
| `pi-manager-models` | 从 OpenAI-compatible `/models` 刷新 `manager` 模型目录 | 启动时自动刷新 | `PI_MANAGER_MODELS_PROVIDER`、`PI_MANAGER_MODELS_CONFIG` |
| `pi-slim-skills` | 压缩模型可见的技能索引，降低提示词体积 | `/slim-skills remove <名称>`、`none`、`reset`、`inject <名称>` | `slim-skills-whitelist.json`；`SLIM_SKILLS_DISABLE=1` 禁用 |
| `pi-todo-guard` | Todo 仍有未完成项目时，提醒代理继续当前任务 | 自动处理 | `PI_TODO_GUARD_DISABLE=1`；默认兼容 `todo` 工具 |
| `pi-context-bridge` | 将锁定的 Web Access 与 teammate 实现统一接入 Default profile | 模型调用 `web_search`、联网工具、`teammate`/`observe` | 不替换 Pi 原生文件工具；统一管理 Default 侧的联网和协作入口 |
| `pi-large-mode` | 在当前会话的默认 package 边界与固定上游 Maestro Flow profile 之间切换 | `/large on|off|status|update` | Large 固定加载 Flow、teammate 与 Cockpit；关闭时恢复原始顺序和 `autoload` |
| `pi-tool-rails` | 提供稳定的工具标签、结果面板、diff、输入框样式和步骤化思考轨迹 | 自动处理；`Ctrl+T` 显示或隐藏思考轨迹 | `PI_TOOL_RAILS_DISABLE_USER_FRAME=1` 仅关闭用户消息边框 |
| `pi-large-beautify` | Large profile 专用的工具栏、消息/输入框框架、品牌头和 Matugen 主题 | 由 Large profile 复制并加载 | Default 安装器跳过；与 `pi-tool-rails`、`pi-brand-header` 保持 profile 隔离 |
| `pi-gsd` | 可选的串行 session-tree subagent；安装器不再默认启用 | 手动安装后用 `push-task`、`/start-task`、`/finish-task`、`/auto` | 默认并行委派使用 `pi-maestro-teammate`；仅在明确需要同一 session tree 工作流时安装 |


### 项目工具选择

`pi-default-workbench` 是 Default profile 的统一功能入口，保留 `/tools`、`/deferred-tools`、`/todos` 等命令以及所有原工具名。默认模式是 `adaptive`：首轮只暴露 canonical 文件/执行工具、FFF、Todo、结构化提问和 `search_tool_bm25`；BM25 命中后按能力组追加工具。`fast` 固定保持最小集合，`full` 恢复所有未被显式禁用的注册工具：

```text
/tools
```

一级列表按扩展显示允许数量。`Space` 开关整组，`Enter` 进入二级列表，再用 `Space` 或 `Enter` 切换单个工具。配置立即生效，并写入受信任项目的 `.pi/tool-selector.json`。`/tools adaptive|fast|full` 切换模式，`/tools reset` 清除显式禁用规则并进入 full；`/tools list` 可不打开 TUI 直接查看状态。

这个选择器只控制模型可调用的工具，不会卸载扩展 package、命令或事件处理器。默认配置保留 Pi 原生 `read`、`write`、`edit`、`grep` 和 `bash`；统一工作台还提供 FFF、后台 Shell、冲突处理、浏览器、Todo 和预览；独立的 `execute_command` 扩展负责命令/消息调度。模式只改变模型可见的工具集合。要禁用整个 package 资源，在终端运行 `pi config -l`。新增或更新 package 后运行 `/reload`，选择器会重新发现工具归属。



## 独立扩展

| 扩展 | 用途 | 入口 |
| --- | --- | --- |
| `adhd-mode.ts` | 面向 ADHD 的输出规则、sticky notes、side-chat 和提醒 | `/adhd`、`/note`、`/btw` | `pi-adhd.reminderTurns` 配置提醒回合数 |
| `matugen-chrome.ts` + `matugen-footer-core.mjs` | Matugen footer：实时 Context、Git 操作状态、扩展状态清洗和 working 行 | `/matugen-chrome` 开关 |

这些文件只在 `~/.pi/agent/extensions/` 中不存在时复制；本机已有文件会保留。修改文件后在 Pi 内运行 `/reload`。

## 第三方 package

这些 package 来自 [`../config/external-packages.txt`](../config/external-packages.txt)，由安装器在选择 `--with-external` 时安装。版本以本机 `pi list` 为准。Web Access、默认 teammate 和 Markdown Preview 不再作为独立 package 条目安装；前两者由 `pi-context-bridge` 统一接入，Preview 由本地兼容入口锁定依赖。

| Package | 能力 | 常用入口 |
| --- | --- | --- |
| `@narumitw/pi-plan-mode` | 只读的计划协作模式 | `/plan` |
| `@juicesharp/rpiv-ask-user-question` | 有选项、可结构化回答的问题组件 | 模型在需要澄清时调用 `ask_user_question` |
| `pi-slopchop` | 终端内代码审阅与注释 | `/slopchop` 或 `/diff` |
| `pi-workspace-history` | 工作区级撤销与重做 | 在需要回退文件改动时调用其命令；先查看 `/hotkeys` 中实际注册键位 |
| `pi-rtk-optimizer` | RTK 命令改写和通用工具输出压缩 | `/rtk verify`；需要安装 `rtk` binary |
| `@victor-software-house/pi-curated-themes` | 额外终端主题资源 | `/settings` 中选择主题 |
| `git:github.com/BevalZ/pi-provider` | 配置与检查自定义 provider | `/provider add`，再用 `/model` 选择模型 |

## 组合建议

- **常规编码**：Pi 原生 `bash`、`pi-context-bridge` 提供的 Web/teammate 工具、`pi-markdown-preview-compat`、`pi-maestro-tools`、`pi-maestro-todo`、`pi-tool-rails`、`pi-rtk-optimizer` 与 `pi-todo-guard` 构成默认基础。
- **需要深度项目编排**：在当前 Pi 会话运行 `/large on`；它加载固定版本的完整上游 Flow、teammate 和 Cockpit，包括 GUI、MCP、LSP、browser/web search、FFF、conflict、root `bash_bg`、Advisor、self-evolve、Goal、Todo、Plan、Loop、agents 和 Maestro skills。完成后用 `/large off` 恢复默认 package 边界。
- **需要联网资料**：直接要求模型搜索网页、抓取 URL 或克隆 GitHub 仓库；相关工具默认可用。

## 排障

1. 扩展更新、配置修改或新装 package 后运行 `/reload`。
2. `pi list` 检查 package 是否被当前 settings 启用。
3. `pi --no-extensions` 可临时排除扩展，定位是否为扩展冲突。
4. 只加载一个扩展时使用 `pi --no-extensions -e /绝对路径/extension.ts`。
5. 将 `PI_*_DISABLE=1` 放在启动命令前，只禁用有明确环境开关的扩展。
