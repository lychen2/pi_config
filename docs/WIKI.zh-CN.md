# Pi 配置快速上手

本页面向第一次使用此仓库的人。先完成下面 5 步；需要查看延迟工具、验收、DAG 和完整基础场景时，直接打开[完整使用手册](USAGE.zh-CN.md)。

- [完整使用手册](USAGE.zh-CN.md)：安装、激活、全部能力和六个基础场景
- [扩展目录](extensions.zh-CN.md)：本地 package、第三方 package、命令与工具
- [技能目录](skills.zh-CN.md)：58 个随仓库分发的技能及调用场景
- [公开设置](../config/settings-public.json)：可选的默认模型、主题与技能设置
- [外部 package 清单](../config/external-packages.txt)：安装器会安装的第三方资源

## 五分钟开始

1. 在仓库根目录运行 `./install.sh --yes`，或已安装 Pi 时运行 `node install.mjs --yes`。
2. 运行 `pi`，输入 `/provider add` 配置本机提供方，再用 `/model` 选择可用模型。
3. 输入一个具体任务，例如“检查当前项目的测试失败原因并修复”。需要浏览器、subagent、语义代码或 DAG 时，在任务中直接说出能力，模型会调用 `load_tools`。
4. 需要明确工作流时，输入 `/skill:<名称>`，例如 `/skill:karpathy-guidelines`、`/skill:mineru-file-processing` 或 `/skill:scientific-visualization`。
5. 修改 `~/.pi/agent/settings.json`、扩展或主题后，在 Pi 中运行 `/reload`。

## Pi 的工作方式

Pi 是终端编码代理。它将当前目录、`AGENTS.md`、已启用技能和工具放进上下文，然后由模型决定何时读文件、执行命令或编辑代码。

| 组件 | 用途 | 何时使用 |
| --- | --- | --- |
| 普通提示 | 描述目标和验收条件 | 默认入口 |
| `@文件` | 将文件附在本次消息中 | 指定需要审阅或比较的文件 |
| `!命令` | 运行本地 shell 并把输出发送给模型 | 先运行测试、查看 Git 状态、检查构建 |
| `!!命令` | 运行本地 shell 但不把输出放进模型上下文 | 本地检查、打开日志或调试环境 |
| `/skill:名称` | 强制载入某个技能 | 任务需要明确的专业流程 |
| `/plan` | 切换为只读规划模式 | 先确认方案、范围和风险 |
| `load_tools` | 由模型按需启用一个延迟工具，不是用户输入的 slash command | 在提示词中要求语义代码、浏览器、subagent 或 DAG 时 |

`@`、`!` 与 `!!` 都是输入前缀，不是 shell 的通用语法。文件引用用 `@README.md`，shell 命令用 `!git status`。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `/model` | 选择模型；`Ctrl+L` 是快捷入口 |
| `/settings` | 调整思考级别、主题、消息投递和传输设置 |
| `/resume` | 打开历史会话 |
| `/new` | 新建会话 |
| `/session` | 查看当前会话文件、ID、token 和费用 |
| `/tree` | 浏览会话分支、回到任意历史节点 |
| `/compact [说明]` | 压缩上下文；可补充摘要要求 |
| `/reload` | 重载设置、扩展、技能、提示词和主题 |
| `/hotkeys` | 在终端内查看完整快捷键表 |
| `/export [文件]` | 导出 HTML 或 JSONL 会话记录 |
| `/trust` | 保存项目资源信任决定；重启后生效 |

## 新增能力的最短路径

| 目标 | 直接输入给 Pi 的提示 |
| --- | --- |
| 跨文件找定义、引用或诊断 | `检查 src/api.ts 第 42 行 handleRequest 的定义、引用和诊断；只读，不要修改文件。` |
| 安全重命名 | `把 handleRequest 改名为 handleRequestV2，先预览将修改的文件；我确认后才应用。` |
| 长任务必须验证 | 创建 `.pi/goal-verification.json`，然后用 `/goal` 执行任务；完成前用 `/goal-verify` 检查。 |
| 小型并行工作流 | `把任务拆成检查现状、实现修改、复核测试三个有依赖的步骤；每步只返回结论和验证结果。` |
| 普通并行调查 | `使用 subagent 并行查实现、测试和最近提交；子代理只读。` |

详细参数、配置 JSON 和六个完整场景在[完整使用手册](USAGE.zh-CN.md)。

## 必记快捷键

| 快捷键 | 动作 | 使用时机 |
| --- | --- | --- |
| `Enter` | 发送消息；工作中则排入 steering 队列 | 让代理优先处理补充要求 |
| `Alt+Enter` | 排入 follow-up 队列 | 当前任务结束后再做下一件事 |
| `Esc` | 取消当前执行 | 停止错误方向的工作 |
| `Esc Esc` | 打开会话树（默认设置） | 回到早先分支或查看历史 |
| `Ctrl+C` | 清空编辑器；连续两次退出 | 放弃当前输入或退出 Pi |
| `Ctrl+D` | 编辑器为空时退出 | 正常结束会话 |
| `Ctrl+L` | 打开模型选择器 | 临时切换模型 |
| `Ctrl+P` / `Ctrl+Shift+P` | 在已启用模型间前进/后退切换 | 快速试用不同模型 |
| `Shift+Tab` | 切换思考级别 | 简单任务用低级别，复杂推理用高级别 |
| `Ctrl+O` | 展开或收起工具输出 | 长工具结果影响阅读时 |
| `Ctrl+T` | 展开或收起思考块 | 需要检查推理过程时 |
| `Ctrl+G` | 在外部编辑器中编辑输入 | 撰写长提示词或多段任务说明 |
| `Ctrl+V` | 粘贴文本或图片 | 将截图交给支持视觉的模型 |
| `Alt+Up` | 将排队消息取回编辑器 | 修改尚未发送的 follow-up |
| `Ctrl+X` | 复制最后一条助手消息 | 复制结论、代码或命令 |

完整键位和自定义格式见 Pi 官方 [keybindings 文档](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/keybindings.md)。本机自定义文件为 `~/.pi/agent/keybindings.json`；修改后执行 `/reload`。

## 四种高频流程

### 编码与修复

1. 说明目标、相关路径和验收条件。
2. 要求模型先读取相关文件和测试。
3. 让模型修改后运行最窄的相关测试。
4. 需要完整方案时先用 `/plan`，确认后退出规划模式并执行。

示例：`修复 packages/api 的登录回调错误。先定位现有测试，修改后运行相关测试；不要改动其他模块。`

### 代码审阅

1. 提供范围，例如 `审阅当前分支相对 main 的改动`。
2. 指明优先级：错误、安全、回归和测试缺口。
3. 使用 `pi-slopchop` 的 `/slopchop` 或 `/diff` 获得终端内审阅视图。
4. 让模型按严重程度输出带文件路径和行号的发现。

### 科研与文献

1. PDF、表格和公式抽取：`/skill:mineru-file-processing`；任务中说明是否需要页码和 OCR。
2. 科学图表：先加载 `/skill:figure-style`，再加载 `/skill:scientific-visualization`，只用已有数据。
3. 中文或英文润色：`/skill:humanizer-zh` 或 `/skill:humanizer`，保留术语和引用。
4. 其他已同步但默认未发现的技能，先查[技能目录](skills.zh-CN.md)，再用 `/slim-skills inject <名称>` 显式注入。

### 浏览器与外部目录

1. 浏览器自动化先确认已安装 `agent-browser` runtime，然后直接要求模型使用浏览器；按需工具加载会启用 `agent_browser`。
2. 需要仓库外代码或文档时用 `/add-dir /绝对路径`，不要把大型目录直接复制进项目。
3. 结束后用 `/remove-dir` 清理不再需要的外部上下文。

## 使用技巧

- 提示词先写结果，再写边界。例如“把 X 改成 Y；不修改 API；测试必须通过”。
- 用 `/name 发布检查` 给重要会话命名，后续用 `/resume` 更容易找到。
- 长任务开始前要求模型使用 Todo；`pi-todo-guard` 会在仍有未完成任务时提醒代理继续。
- 不需要完整工具集时无需手动启用。`pi-deferred-tools` 会保留 `load_tools`，模型可按任务精确加载工具。
- 通过 `/tree` 分支试验。实验失败时回到旧节点继续，避免把试验性改动混入主分支。
- 不要将 API key、token 或私钥贴进提示词和仓库。provider 凭据保存在本机 Pi 配置中，不属于此仓库。

## 更新与排障

| 目标 | 操作 |
| --- | --- |
| 更新 Pi 和已安装 package | `pi update --all` |
| 同步此仓库并重新应用公开配置 | `git pull --ff-only && node install.mjs --yes` |
| 预览安装器影响 | `node install.mjs --dry-run --yes` |
| 检查已安装 package | `pi list` |
| 重载当前会话资源 | `/reload` |
| 查看浏览器运行时 | `npm exec --prefix "$HOME/.pi/agent/npm" -- pi-agent-browser-doctor` |
| 检查 RTK | `rtk --version` 与 `/rtk verify` |

仓库只备份 `skills/` 中的技能。额外放在 `~/.agents/skills/`、`~/.claude/` 或其他目录的本机技能不会由安装器恢复；要迁移它们，应单独审查后纳入仓库或在 `settings.json` 中显式配置路径。
