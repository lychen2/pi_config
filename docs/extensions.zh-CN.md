# 扩展目录

本页说明 `pi_config` 中的扩展如何使用。扩展拥有与 Pi 相同的本机权限；安装未知 package 前先检查其源码和 `package.json`。

回到 [快速上手](WIKI.zh-CN.md)。

## 本仓库 package

安装器会安装 `extensions/` 下带 `package.json` 的 8 个 package。开发时进入对应目录运行 `npm run typecheck`；带测试的 package 还可运行 `npm test`。

| 扩展 | 解决的问题 | 使用入口 | 配置或开关 |
| --- | --- | --- | --- |
| `pi-brand-header` | 在启动栏显示模型、思考级别、目录、主题、技能和工具数量 | `/logo` 显示或隐藏 | 仅 TUI 生效；窄终端自动折叠 |
| `pi-agent-browser-compat` | 修正部分 provider 生成的冲突 `agent_browser` 参数 | 自动处理 | `PI_AGENT_BROWSER_COMPAT_DISABLE=1` 禁用 |
| `pi-deferred-tools` | 将第三方扩展工具延迟到真正需要时再加载 | `/deferred-tools list`；也可 `add`、`remove` | `config/deferred-tools.json`；`PI_DEFERRED_TOOLS_DISABLE=1` 禁用 |
| `pi-manager-models` | 从 OpenAI-compatible `/models` 刷新 `manager` 模型目录 | 启动时自动刷新 | `PI_MANAGER_MODELS_PROVIDER`、`PI_MANAGER_MODELS_CONFIG` |
| `pi-slim-skills` | 压缩模型可见的技能索引，降低提示词体积 | `/slim-skills remove <名称>`、`none`、`reset`、`inject <名称>` | `slim-skills-whitelist.json`；`SLIM_SKILLS_DISABLE=1` 禁用 |
| `pi-todo-guard` | Todo 仍有未完成项目时，提醒代理继续当前任务 | 自动处理 | `PI_TODO_GUARD_DISABLE=1`；默认兼容 `todo` 工具 |
| `pi-tool-rails` | 提供稳定的工具标签、结果面板、diff 和输入框样式 | 自动处理 | `PI_TOOL_RAILS_DISABLE_USER_FRAME=1` 仅关闭用户消息边框 |
| `pi-translate-submit` | 把编辑器内容翻译为英文但不提交 | `Ctrl+Alt+T`；`/translate-model` 选择轻量模型 | `translate-submit.json`；保留代码、路径和环境变量 |

### 延迟工具的正确使用

`pi-deferred-tools` 不会删除能力，而是让模型通过 `load_tools` 精确启用一个工具。不要手动伪造 `load_tools` 参数；直接告诉模型所需能力，例如“用浏览器检查登录页”，它会按需加载。

使用 `/deferred-tools list` 查看当前延迟集合。新增或移除 package 后执行 `/reload`，让扩展重新发现工具归属。

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
| `pi-hashline-edit-pro` | 以哈希锚点读写，降低并行编辑冲突 | `read`、`replace`；`/toggle-replace-mode`、`/toggle-auto-read` |
| `pi-slopchop` | 终端内代码审阅与注释 | `/slopchop` 或 `/diff` |
| `pi-workspace-history` | 工作区级撤销与重做 | 在需要回退文件改动时调用其命令；先查看 `/hotkeys` 中实际注册键位 |
| `@narumitw/pi-goal` | 自主目标执行和验收 | `/goal`；仅在目标完整可验证时标记完成 |
| `@narumitw/pi-subagents` | 隔离子代理委派 | `/subagents` 配置；模型按任务调用子代理工具 |
| `@juicesharp/rpiv-todo` | 跨重载与压缩保存的任务列表 | 模型调用 `todo`；状态显示在 overlay |
| `@narumitw/pi-btw` | 不打断主任务的侧问题 | `/btw <问题>` |
| `pi-rtk-optimizer` | RTK 命令改写和工具输出压缩 | `/rtk verify`；需要安装 `rtk` binary |
| `pi-cache-optimizer` | 稳定提示词和 provider cache，提高缓存命中 | `/cache-optimizer` 查看或调整状态 |
| `pi-agent-browser-native` | `agent-browser` 浏览器自动化工具 | 直接要求模型使用浏览器；先运行 doctor 检查 runtime |
| `pi-add-dir` | 把项目外目录的文件、规则和技能加入上下文 | `/add-dir`、`/suggest-dirs`、`/dirs`、`/remove-dir` |
| `@tmustier/pi-raw-paste` | 单次原样粘贴 | `/paste` |
| `@victor-software-house/pi-curated-themes` | 额外终端主题资源 | `/settings` 中选择主题 |
| `pi-autoresearch` | 自动实验循环，保留或丢弃实验结果 | `/autoresearch` |
| `@monotykamary/pi-tps` | 显示 token 生成速度 | 自动显示状态 |
| `git:github.com/BevalZ/pi-provider` | 配置与检查自定义 provider | `/provider add`，再用 `/model` 选择模型 |

## 组合建议

- **常规编码**：`pi-hashline-edit-pro`、`pi-tool-rails`、`pi-cache-optimizer` 与 `pi-todo-guard` 已构成默认基础。
- **需要先确认方案**：`/plan`，通过后回到常规模式执行。
- **需要浏览器**：确认 `agent-browser` runtime 后，让模型按需加载 `agent_browser`；兼容扩展会处理 provider 参数问题。
- **需要外部目录**：优先 `/add-dir`，不要通过复制或软链接扩大当前项目的修改范围。
- **需要翻译输入**：`Ctrl+Alt+T` 只改编辑器，不发送；确认文本后再按 Enter。

## 排障

1. 扩展更新、配置修改或新装 package 后运行 `/reload`。
2. `pi list` 检查 package 是否被当前 settings 启用。
3. `pi --no-extensions` 可临时排除扩展，定位是否为扩展冲突。
4. 只加载一个扩展时使用 `pi --no-extensions -e /绝对路径/extension.ts`。
5. 将 `PI_*_DISABLE=1` 放在启动命令前，只禁用有明确环境开关的扩展。
