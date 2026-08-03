# 扩展目录

本页说明 `pi_config` 中的扩展如何使用。扩展拥有与 Pi 相同的本机权限；安装未知 package 前先检查其源码和 `package.json`。

回到[完整使用手册](USAGE.zh-CN.md)或[快速上手](WIKI.zh-CN.md)。

## 本仓库 package

安装器会扫描并安装 `extensions/` 下全部带 `pi-*/package.json` 的 package。开发时进入对应目录运行 `npm run typecheck`；带测试的 package 还可运行 `npm test`。

| 扩展 | 解决的问题 | 使用入口 | 配置或开关 |
| --- | --- | --- | --- |
| `pi-brand-header` | 在启动栏显示模型、思考级别、目录、主题、技能和工具数量 | `/logo` 显示或隐藏 | 仅 TUI 生效；窄终端自动折叠 |
| `pi-agent-browser-compat` | 修正部分 provider 生成的冲突 `agent_browser` 参数 | 自动处理 | `PI_AGENT_BROWSER_COMPAT_DISABLE=1` 禁用 |
| `pi-deferred-tools` | 将第三方扩展工具延迟到真正需要时再加载 | `/deferred-tools list`；也可 `add`、`remove` | `config/deferred-tools.json`；`PI_DEFERRED_TOOLS_DISABLE=1` 禁用 |
| `pi-manager-models` | 从 OpenAI-compatible `/models` 刷新 `manager` 模型目录 | 启动时自动刷新 | `PI_MANAGER_MODELS_PROVIDER`、`PI_MANAGER_MODELS_CONFIG` |
| `pi-slim-skills` | 压缩模型可见的技能索引，降低提示词体积 | `/slim-skills remove <名称>`、`none`、`reset`、`inject <名称>` | `slim-skills-whitelist.json`；`SLIM_SKILLS_DISABLE=1` 禁用 |
| `pi-todo-guard` | Todo 仍有未完成项目时，提醒代理继续当前任务 | 自动处理 | `PI_TODO_GUARD_DISABLE=1`；默认兼容 `todo` 工具 |
| `pi-tool-rails` | 提供稳定的工具标签、结果面板、diff 和输入框样式 | 自动处理 | `PI_TOOL_RAILS_DISABLE_USER_FRAME=1` 仅关闭用户消息边框 |
| `pi-semantic-code` | 在需要时按文件类型选择语言服务器，提供代码结构导航、诊断、hover、引用和 rename | 直接描述要查的定义、引用或错误；需要时自动加载 | 全局或项目 `.pi/semantic-code.json`；见下文 |
| `pi-goal-verifier` | Goal 完成前执行显式声明的验收命令 | 自动监听 `goal_complete`；`/goal-verify` 可单独运行 | 全局或可信项目的 `goal-verification.json` |
| `pi-workflow-dag` | 用依赖波次运行小型检查、实现、复核 worker | 直接描述需要拆开的依赖任务；需要时自动加载 | session 中保存 `status` 和 `clear` 状态 |
| `pi-rtk-hashline-compat` | 将 `pi-rtk-optimizer` 的 read 预算适配到 `pi-hashline-edit-pro` 的 `HASH│内容`，保留完整锚点 | `PI_RTK_HASHLINE_COMPAT_DISABLE=1`；见下文 |

### `pi-rtk-hashline-compat`

`pi-rtk-optimizer` 仍是外部 package。本地兼容扩展只处理 `pi-hashline-edit-pro` 成功的 `read` 结果：

- 保留原始 `HASH│内容` 行格式，不重新计算或改写锚点；
- 只在 RTK 配置的字符或智能行数预算内保留完整锚点行；
- 将 `nextOffset` 改为第一条被省略的源文件行；
- 不拦截 `write` 或 `replace`，hash 校验和实际编辑仍由 `pi-hashline-edit-pro` 负责。

安装或更新后运行 `/reload`。设置 `PI_RTK_HASHLINE_COMPAT_DISABLE=1` 可只禁用这个适配层，两个第三方 package 仍会保留。

### 延迟工具的正确使用

`pi-deferred-tools` 不会删除能力，而是让模型在真正需要时启用一个工具。`load_tools` 是模型内部动作，不是需要用户手输的 slash command。你只需说明想完成的任务，例如：

```text
请查看 src/main.rs 的类型诊断，告诉我问题原因；不要修改文件。
```

模型会根据这句话自动选择合适的延迟工具。查看当前延迟集合：

```text
/deferred-tools list
```

新增或移除 package 后执行 `/reload`，让扩展重新发现工具归属。除非在调试 loader，否则不要手写本地 extension ID 或路径；安装器会为目标机生成它们。

### `semantic_code`

它是“懂代码关系”的工具：普通文本搜索只能找相同文字，它还能判断定义、真实引用、类型诊断和跨文件改名。按文件类型自动尝试 C/C++、Python、Rust、JS/TS、C#、Go、LaTeX、Typst 的可执行服务器。

你可以直接这样说：

```text
请查找 src/api.ts 第 42 行 handleRequest 的全部引用，说明最安全的修改入口；只读，不要修改文件。
```

`rename` 默认只预览；用户确认后才要求模型使用 `apply=true`。项目可用 `.pi/semantic-code.json` 覆盖服务器。完整路由、安装语言服务器和重命名示例见[完整使用手册](USAGE.zh-CN.md#4-语义代码工具semantic_code)。

### `pi-goal-verifier`

它没有工具 schema。没有 `~/.pi/agent/goal-verification.json` 或可信项目 `.pi/goal-verification.json` 时不执行任何命令；有配置时会在 `goal_complete` 前运行最多 5 条验收命令。失败、超时、无效配置和越界 `cwd` 都会阻断完成。

```text
/goal-verify
```

单独运行当前配置的验收。JSON 格式、受信任项目规则和例子见[完整使用手册](USAGE.zh-CN.md#5-goal-验收门pi-goal-verifier)。

### `workflow_dag`

这是延迟的轻量 DAG 工具，适合少量 `readonly` 检查节点、一个显式 `write` 实现节点和最后的复核节点。最多 8 个节点；只读节点最多 3 个并行；失败下游会跳过。普通独立委派仍优先使用 `@narumitw/pi-subagents`。

```text
把这个任务拆成三个有依赖的步骤：先检查现状，再实现修改，最后复核测试。每一步只返回结论、改动文件和验证结果。
```

工具的 `status` 和 `clear` 由模型调用；完整节点 JSON 例子见[完整使用手册](USAGE.zh-CN.md#6-轻量-dagworkflow_dag)。

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
| `@narumitw/pi-subagents` | 隔离子代理委派；stateful agent 完成后会自动续跑主代理 | `/subagents status`；模型按任务调用子代理工具；由 `pi-subagents.json` 配置 |
| `@juicesharp/rpiv-todo` | 跨重载与压缩保存的任务列表 | 模型调用 `todo`；状态显示在 overlay |
| `@narumitw/pi-btw` | 不打断主任务的侧问题 | `/btw <问题>` |
| `pi-rtk-optimizer` | RTK 命令改写和通用工具输出压缩；hashline read 由本地 `pi-rtk-hashline-compat` 补齐 | `/rtk verify`；需要安装 `rtk` binary |
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
