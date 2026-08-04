# 扩展目录

本页说明 `pi_config` 中的扩展如何使用。扩展拥有与 Pi 相同的本机权限；安装未知 package 前先检查其源码和 `package.json`。

回到[完整使用手册](USAGE.zh-CN.md)或[快速上手](WIKI.zh-CN.md)。

## 本仓库 package

安装器会扫描并安装 `extensions/` 下全部带 `pi-*/package.json` 的 package。开发时进入对应目录运行 `npm run typecheck`；带测试的 package 还可运行 `npm test`。

| 扩展 | 解决的问题 | 使用入口 | 配置或开关 |
| --- | --- | --- | --- |
| `pi-aft-compat` | 将模型可见的 AFT edit schema 改为互斥分支，并在非 Git 目录关闭 `aft_search` | 自动处理；执行和渲染仍由 AFT 原生 `edit` 完成 | 不注册工具，不修改 AFT 源码 |
| `pi-brand-header` | 在启动栏显示模型、思考级别、目录、主题、技能和工具数量 | `/logo` 显示或隐藏 | 仅 TUI 生效；窄终端自动折叠 |
| `pi-deferred-tools` | 项目级两级工具选择器；工具不再延迟，旧包名仅为兼容 | `/tools` 两级 TUI；`/tools list` 查看状态 | 受信任项目 `.pi/tool-selector.json`；`PI_TOOL_SELECTOR_DISABLE=1` 禁用 |
| `pi-manager-models` | 从 OpenAI-compatible `/models` 刷新 `manager` 模型目录 | 启动时自动刷新 | `PI_MANAGER_MODELS_PROVIDER`、`PI_MANAGER_MODELS_CONFIG` |
| `pi-slim-skills` | 压缩模型可见的技能索引，降低提示词体积 | `/slim-skills remove <名称>`、`none`、`reset`、`inject <名称>` | `slim-skills-whitelist.json`；`SLIM_SKILLS_DISABLE=1` 禁用 |
| `pi-todo-guard` | Todo 仍有未完成项目时，提醒代理继续当前任务 | 自动处理 | `PI_TODO_GUARD_DISABLE=1`；默认兼容 `todo` 工具 |
| `pi-tool-rails` | 提供稳定的工具标签、结果面板、diff 和输入框样式；保留 AFT 原生 edit 路径/结果渲染，不注册 `find`/`ls` | 自动处理 | `PI_TOOL_RAILS_DISABLE_USER_FRAME=1` 仅关闭用户消息边框 |
| `pi-workflow-dag` | 用依赖波次运行小型检查、实现、复核 worker | 直接描述需要拆开的依赖任务；工具默认可用 | session 中保存 `status` 和 `clear` 状态 |


### 项目工具选择

`pi-deferred-tools` 保留旧包名以兼容现有安装，但 **tools are no longer deferred**。它现在只是项目级工具选择器：扩展工具默认可用，需要减少某个项目发送给模型的工具定义时输入：

```text
/tools
```

一级列表按扩展显示启用数量。`Space` 开关整组，`Enter` 进入二级列表，再用 `Space` 或 `Enter` 切换单个工具。配置立即生效，并写入受信任项目的 `.pi/tool-selector.json`。`/tools list` 可不打开 TUI 直接查看状态。

这个选择器只控制模型可调用的工具，不会卸载扩展 package、命令或事件处理器。要禁用整个 package 资源，在终端运行 `pi config -l`。新增或更新 package 后运行 `/reload`，选择器会重新发现工具归属。



### `workflow_dag`

这是轻量 DAG 工具，适合少量 `readonly` 检查节点、一个显式 `write` 实现节点和最后的复核节点。最多 8 个节点；只读节点最多 3 个并行；失败下游会跳过。普通独立委派仍优先使用 `@narumitw/pi-subagents`。

```text
把这个任务拆成三个有依赖的步骤：先检查现状，再实现修改，最后复核测试。每一步只返回结论、改动文件和验证结果。
```

工具的 `status` 和 `clear` 由模型调用；完整节点 JSON 例子见[完整使用手册](USAGE.zh-CN.md#5-轻量-dagworkflow_dag)。

## 独立扩展

| 扩展 | 用途 | 入口 |
| --- | --- | --- |
| `adhd-mode.ts` | 将面向 ADHD 的输出规则注入每轮系统提示词，状态写入会话 | `/adhd` 开关 |
| `matugen-chrome.ts` | 使用当前主题绘制 footer 和工作动画 | `/matugen-chrome` 开关 |

这两个文件复制到 `~/.pi/agent/extensions/` 后自动发现。修改文件后在 Pi 内运行 `/reload`。

## 第三方 package

这些 package 来自 [`../config/external-packages.txt`](../config/external-packages.txt)，由安装器在选择 `--with-external` 时安装。版本以本机 `pi list` 为准。

| Package | 能力 | 常用入口 |
| --- | --- | --- |
| `pi-markdown-preview` | Markdown、LaTeX、浏览器和 PDF 预览 | `/preview`、`/preview-browser`、`/preview-pdf` |
| `@ff-labs/pi-fff` | 模糊文件与内容搜索 | 工具 `fffind`、`ffgrep`；`/fff-mode`、`/fff-health`、`/fff-rescan` |
| `@narumitw/pi-plan-mode` | 只读的计划协作模式 | `/plan` |
| `@juicesharp/rpiv-ask-user-question` | 有选项、可结构化回答的问题组件 | 模型在需要澄清时调用 `ask_user_question` |
| `@cortexkit/aft-pi` | 原生文件读写、检查点恢复、代码分析与索引搜索；Bash 接管提供 rewrite、压缩和后台任务；本地兼容层只调整模型可见的 `edit` schema | `read`、`write`、`edit`、`grep`、`bash`、`aft_outline`、`aft_zoom`、`aft_safety`；配置 `~/.config/cortexkit/aft.jsonc` |
| `pi-slopchop` | 终端内代码审阅与注释 | `/slopchop` 或 `/diff` |
| `pi-workspace-history` | 工作区级撤销与重做 | 在需要回退文件改动时调用其命令；先查看 `/hotkeys` 中实际注册键位 |
| `@narumitw/pi-subagents` | 隔离子代理委派；stateful agent 完成后会自动续跑主代理 | `/subagents status`；模型按任务调用子代理工具；由 `pi-subagents.json` 配置 |
| `@juicesharp/rpiv-todo` | 跨重载与压缩保存的任务列表 | 模型调用 `todo`；状态显示在 overlay |
| `pi-rtk-optimizer` | RTK 命令改写和通用工具输出压缩；AFT 的 `read` 使用普通行号输出，长输出仍走 RTK 通用截断 | `/rtk verify`；需要安装 `rtk` binary |
| `pi-cache-optimizer` | 稳定提示词和 provider cache，提高缓存命中 | `/cache-optimizer` 查看或调整状态 |
| `pi-web-access` | 网络搜索、网页/PDF/GitHub 内容抓取和视频理解 | 直接要求模型搜索或抓取网页；项目可用 `/tools` 关闭 |
| `@victor-software-house/pi-curated-themes` | 额外终端主题资源 | `/settings` 中选择主题 |
| `git:github.com/BevalZ/pi-provider` | 配置与检查自定义 provider | `/provider add`，再用 `/model` 选择模型 |

## 组合建议

- **常规编码**：`@cortexkit/aft-pi`、`pi-tool-rails`、`pi-rtk-optimizer`、`pi-cache-optimizer` 与 `pi-todo-guard` 构成默认基础。
- **需要先确认方案**：`/plan`，通过后回到常规模式执行。
- **需要联网资料**：直接要求模型搜索网页、抓取 URL 或克隆 GitHub 仓库；相关工具默认可用。

## 排障

1. 扩展更新、配置修改或新装 package 后运行 `/reload`。
2. `pi list` 检查 package 是否被当前 settings 启用。
3. `pi --no-extensions` 可临时排除扩展，定位是否为扩展冲突。
4. 只加载一个扩展时使用 `pi --no-extensions -e /绝对路径/extension.ts`。
5. 将 `PI_*_DISABLE=1` 放在启动命令前，只禁用有明确环境开关的扩展。
