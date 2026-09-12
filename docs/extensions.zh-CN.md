# 扩展目录

本页说明 `pi_config` 中的扩展如何使用。扩展拥有与 Pi 相同的本机权限；安装未知 package 前先检查其源码和 `package.json`。

回到[完整使用手册](USAGE.zh-CN.md)或[快速上手](WIKI.zh-CN.md)。

## 本仓库 package

安装器会扫描 `extensions/` 下带 `pi-*/package.json` 的 package，但默认只安装四个聚合入口：`pi-context-bridge`、`pi-default-workbench`、`pi-slim-skills` 和 `pi-tool-rails`。其他 package 保留源码，供 Large profile 或明确的手动安装使用；`pi-zh-localizer` 只作为安装器补丁脚本运行。

| 扩展 | 解决的问题 | 使用入口 | 配置或开关 |
| --- | --- | --- | --- |
| `pi-brand-header` | 品牌标题栏实现，已并入 `pi-tool-rails` | `/logo` | 默认不单独安装 |
| `pi-deepseek-anchored-standard` | DeepSeek V4 Pro/Flash 的 Minimal bootstrap、锚点和渐进式上下文恢复 | `/dsh-anchor` 查看、`promote` 或 `rearm` 管理 | 仅匹配目标模型；`PI_DEEPSEEK_ANCHORED_STANDARD_DISABLE=1` 禁用 |
| `pi-default-workbench` | Default 功能工作台：adaptive/fast/full 工具模式、Puppeteer 浏览器、Todo、Todo guard、FFF/后台 Shell/冲突处理、Markdown Preview 和 `/large` | `/tools`、`/todos`、模型调用工具、`/large on|off|status|update` | 四类工作流共用一个根入口 |
| `pi-manager-models` | 从 OpenAI-compatible `/models` 刷新 `manager` 模型目录 | 启动时自动刷新 | `PI_MANAGER_MODELS_PROVIDER`、`PI_MANAGER_MODELS_CONFIG` |
| `pi-slim-skills` | 压缩模型可见的技能索引，降低提示词体积 | `/slim-skills remove <名称>`、`none`、`reset`、`inject <名称>` | `slim-skills-whitelist.json`；`SLIM_SKILLS_DISABLE=1` 禁用 |
| `pi-todo-guard` | Todo 仍有未完成项目时，提醒代理继续当前任务 | 自动处理 | `PI_TODO_GUARD_DISABLE=1`；默认兼容 `todo` 工具 |
| `pi-context-bridge` | 将锁定的 Web Access、manager 模型目录和 continuity 统一接入 Default profile | 模型调用联网工具；启动时注册 manager provider | 不替换 Pi 原生文件工具 |
| `pi-large-mode` | Large profile 的实现源码，已由 `pi-default-workbench` 聚合；默认不单独安装 | `/large on|off|status|update` | 手动安装旧入口时不要与工作台重复加载 |
| `pi-tool-rails` | 提供稳定的工具标签、结果面板、diff、输入框样式、步骤化思考轨迹和品牌标题栏 | 自动处理；折叠的思考轨迹显示 `✦ 思考 · N 步 · 18s`，`Ctrl+T` 显示或展开全部步骤；`/logo` 切换标题栏 | Default 与 Large 共用 UI 聚合入口 |
| `pi-large-beautify` | Large profile 专用的工具栏、消息/输入框框架、品牌头和 Matugen 主题 | 由 Large profile 复制并加载 | Default 安装器跳过；与 `pi-tool-rails`、`pi-brand-header` 保持 profile 隔离 |


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
| `matugen-chrome.ts` + `matugen-footer-core.mjs` | Matugen footer：实时 Context、Git 操作状态、扩展状态清洗和 working 行 | `/matugen-chrome` 开关 |

这些文件只在 `~/.pi/agent/extensions/` 中不存在时复制；本机已有文件会保留。修改文件后在 Pi 内运行 `/reload`。

## 第三方 package

这些 package 来自 [`../config/external-packages.txt`](../config/external-packages.txt)，由安装器在选择 `--with-external` 时安装。版本以本机 `pi list` 为准。Web Access 和 Markdown Preview 不再作为独立 package 条目安装；前者由 `pi-context-bridge` 统一接入，Preview 由本地兼容入口锁定依赖。

| Package | 能力 | 常用入口 |
| --- | --- | --- |
| `@cortexkit/pi-magic-context` | 持久记忆、历史搜索与上下文回收 | `ctx_search`、`ctx_memory`、`ctx_note`、`ctx_expand`、`ctx_reduce` |
| `@narumitw/pi-plan-mode` | 只读的计划协作模式 | `/plan` |
| `@juicesharp/rpiv-ask-user-question` | 有选项、可结构化回答的问题组件 | 模型在需要澄清时调用 `ask_user_question` |
| `pi-slopchop` | 终端内代码审阅与注释 | `/slopchop` 或 `/diff` |
| `pi-workspace-history` | 工作区级撤销与重做 | 在需要回退文件改动时调用其命令；先查看 `/hotkeys` 中实际注册键位 |
| `pi-rtk-optimizer` | RTK 命令改写和通用工具输出压缩 | `/rtk verify`；需要安装 `rtk` binary |
| `@victor-software-house/pi-curated-themes` | 额外终端主题资源 | `/settings` 中选择主题 |
| `git:github.com/BevalZ/pi-provider` | 配置与检查自定义 provider | `/provider add`，再用 `/model` 选择模型 |

## 组合建议

- **常规编码**：Pi 原生 `bash`、`pi-context-bridge` 提供的 Web/manager 能力、Magic Context 的 `ctx_*` 工具、`pi-default-workbench`、`pi-tool-rails`、`pi-slim-skills`、`pi-rtk-optimizer` 与结构化提问 package 构成默认基础。
- **需要深度项目编排**：在当前 Pi 会话运行 `/large on`；它加载固定版本的完整上游 Flow、teammate 和 Cockpit，包括 GUI、MCP、LSP、browser/web search、FFF、conflict、root `bash_bg`、Advisor、self-evolve、Goal、Todo、Plan、Loop、agents 和 Maestro skills。完成后用 `/large off` 恢复默认 package 边界。
- **需要联网资料**：直接要求模型搜索网页、抓取 URL 或克隆 GitHub 仓库；相关工具默认可用。

## 排障

1. 扩展更新、配置修改或新装 package 后运行 `/reload`。
2. `pi list` 检查 package 是否被当前 settings 启用。
3. `pi --no-extensions` 可临时排除扩展，定位是否为扩展冲突。
4. 只加载一个扩展时使用 `pi --no-extensions -e /绝对路径/extension.ts`。
5. 将 `PI_*_DISABLE=1` 放在启动命令前，只禁用有明确环境开关的扩展。
