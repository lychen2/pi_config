# pi_config 完整使用手册

这份手册回答三个问题：如何安装、如何让 Pi 加载某项能力、如何把整套配置用于真实任务。

- [根 README](../README.zh-CN.md)：项目概览和安装入口
- [扩展目录](extensions.zh-CN.md)：所有本地和第三方扩展
- [Skill 目录](skills.zh-CN.md)：58 个有效 skill 定义及逐项示例
- [工具目录](tools.zh-CN.md)：35 个当前 `functions.*` 工具及逐项示例

## 1. 安装

### 新机器

Linux 或 macOS：

```bash
curl -fsSL https://raw.githubusercontent.com/lychen2/pi_config/main/install.sh | sh
```

Windows PowerShell：

```powershell
irm https://raw.githubusercontent.com/lychen2/pi_config/main/install.ps1 | iex
```

安装器会：

1. 安装或检查 Node.js、Git 和 Pi。
2. 将仓库放到 `~/.pi_config`，或使用已有 checkout。
3. 备份现有 `~/.pi/agent`，以及会被更新的 `~/.config/cortexkit/aft.jsonc` 和 `magic-context.jsonc`。
4. 合并缺失的 skills 和 themes，保留本机已有文件；仅在独立扩展不存在时复制它们。
5. 覆盖仓库维护的公开配置，合并公开 settings，并自动扫描 `extensions/pi-*/package.json` 逐个运行 `pi install`。
6. 工具扩展默认全部启用；每个项目可用 `/tools` 保存自己的禁用项。
7. 按选择安装 Magic Context 和 RTK。

已有 Pi 和 Node.js 时，在仓库根目录运行：

```bash
node install.mjs --yes
```

先查看将要执行的操作：

```bash
node install.mjs --dry-run --yes
```

安装器不会写入 provider 凭据、API key、session 或模型注册表。它会补齐缺失的仓库 skills，不会覆盖已有 skill、theme 或独立扩展文件；安装前仍应审查脚本，因为 Pi package 以当前用户权限运行。

### 安装后检查

打开新终端，运行：

```bash
pi --version
pi list
```

确认 `pi list` 输出包含仓库本地 package 路径（名称可能显示为相对路径）：

```text
extensions/pi-aft-compat
extensions/pi-brand-header
extensions/pi-deferred-tools
extensions/pi-manager-models
extensions/pi-rtk-aft-capture
extensions/pi-rtk-aft-restore
extensions/pi-slim-skills
extensions/pi-todo-guard
extensions/pi-tool-rails
```

还应看到 `npm:@cortexkit/aft-pi@0.49.0`、本地 `pi-gsd` 和 `npm:pi-web-access`。
启动 Pi：

```bash
cd /path/to/your/project
pi
```

第一次修改设置、安装 package 或修改扩展后，在当前 Pi 会话输入：

```text
/reload
```

如果修改了安装器、仓库配置或本地扩展，重新启动 Pi 更可靠。

## 2. 工具默认启用与项目开关

`pi-deferred-tools` 的旧包名容易误导，但 **tools are no longer deferred**：它现在只是项目级工具选择器。扩展工具默认跟随 Pi 的正常启用状态，不会在运行时通过 `load_tools` 动态加载或卸载。需要联网、任务分支或 DAG 时，直接描述任务即可：

```text
搜索 2025 年 C++ sender/receiver 规范的变化，只引用 WG21 和 cppreference，并给出来源链接。
```

只想减少某个项目发送给模型的工具定义时，在该项目内打开：

```text
/tools
```

一级列表按扩展显示启用数量：`Space` 整组开关，`Enter` 进入二级工具列表，二级用 `Space` 或 `Enter` 切换单个工具。选择立即生效，并写入受信任项目的 `.pi/tool-selector.json`；没有该文件时默认不禁用任何扩展工具。

```json
{
  "disabledExtensions": ["npm:pi-markdown-preview"],
  "disabledTools": ["web_search"]
}
```

`/tools list` 可直接查看当前项目选择。这个开关只改变模型可调用的工具；需要禁用整个扩展、命令或主题资源时，在终端运行 `pi config -l`。修改 package 安装状态后再执行 `/reload`。

## 3. 最常用的 Pi 输入方式

| 输入 | 作用 | 示例 |
| --- | --- | --- |
| 普通文字 | 描述目标、边界和验收条件 | `修复登录回调，并运行相关测试` |
| `@文件` | 把文件附加到当前消息 | `审阅 @src/auth.ts` |
| `!命令` | 执行 shell，并把输出交给模型 | `!git status --short` |
| `!!命令` | 执行 shell，但不把输出放进上下文 | `!!tail -n 100 server.log` |
| `/skill:名称` | 显式加载某个技能 | `/skill:batch-grill-me`
| `/plan` | 进入只读规划模式 | 先规划大型重构 |
| `/reload` | 重载设置、扩展、技能和主题 | 配置更新后 |

提示词最好包含四项：目标、范围、禁止事项、验收命令。例如：

```text
修复 packages/api 的登录回调错误。
范围：只修改 packages/api 和它的测试。
先读取现有测试，再实现修复。
完成前运行 packages/api 的相关测试；不要把失败测试标记为完成。
```

## 4. AFT 代码导航与文件编辑

> [!IMPORTANT]
> AFT 已替代默认的 `read`、`write` 和 `edit`。它不提供 LSP 的诊断、定义/引用、hover 或确认式跨文件 rename。

> AFT 的用户配置在 `~/.config/cortexkit/aft.jsonc`；本配置启用 AFT Bash 的 rewrite、压缩和后台执行，RTK 继续处理 `read`、`grep` 与其他通用结果。安装器会先备份再覆盖这份公开 AFT 配置。

> `read` 使用普通行号输出；超过 80 行的结果仍由 RTK 的通用 smart-truncate 和字符上限控制。

> 对大文件优先要求读取相关符号或范围，不要无边界读取整份文件。

### 能做什么

- `aft_outline`：读取文件的结构、符号与范围。
- `aft_zoom`：读取指定符号及其邻近上下文。
- `aft_inspect`：汇总 TODO、诊断、死代码、未使用导出、重复和导入循环。
- `aft_safety`：为显式指定文件创建检查点、恢复或撤销。

你可以直接这样说：

```text
请查看 src/service.py 中 UserStore 的结构和调用邻近上下文，说明最安全的修改入口；只读，不修改文件。
```

AFT 的编辑先按文本匹配；匹配的旧内容已变化时会拒绝写入。跨文件重命名仍应先使用项目自己的重构工具或语言服务器，不要把 AFT 视为等价的 LSP rename。

## 5. Session-tree subagent 任务

`pi-gsd` 将任务放入新的 Pi session-tree 上下文。`push-task` 已注册为默认的 session-tree subagent 入口；对于边界清楚、可独立执行或审查，且新上下文、并行推进或独立视角确实有收益的子任务，模型可以主动使用它。简单任务、强串行任务和持续依赖主会话上下文的任务留在主 agent。它不启动后台 worker，不注入 Superpowers 方法论，也不把任务过程藏在另一个 agent 运行时中。传给子任务最小的自包含简报，不要复制完整对话和无关探索日志。主 agent 负责集成和最终验证。例子：

```text
启动一个只读 review subagent：检查实现、测试和最近提交，返回文件、行号和风险，不要修改文件。
```

需要角色和便宜模型时，直接在工具调用中提供：

```json
{"title":"Explore auth changes","role":"explore","model":"manager/gpt-5.6-luna","prompt":"只读检查 auth 改动、相关测试和风险，返回文件与行号。"}
```

推荐角色 profile：

| `role` | 参考方向 | 默认边界建议 |
| --- | --- | --- |
| `explore` / `scout` | 探索入口、符号、依赖和历史 | 只读，返回路径和证据 |
| `map` | 绘制模块、导入和数据流地图 | 只读，不做架构改造 |
| `analyze` | 比较方案、约束和技术取舍 | 只读，明确假设和反例 |
| `research` / `external-research` | 查文档、上游实现、标准和 API | 返回来源、版本和不确定性 |
| `synthesize` | 合并多个研究或审查结果 | 不隐藏冲突，返回共识和缺口 |
| `plan` / `planner` | 拆解任务、依赖和验收条件 | 只规划，不修改实现文件 |
| `roadmap` | 规划阶段、里程碑和收敛标准 | 不虚构时间和需求 |
| `plan-check` | 检查计划是否完整、可执行、可验证 | 只报告缺口，不静默改计划 |
| `implement` / `builder` | 完成边界清楚的功能或修复 | 只改指定范围并验证 |
| `execute` / `executor` | 原子执行一个已定义任务 | 不扩展范围，缺前提就停止 |
| `debug` / `debugger` | 复现、验证假设、定位根因和修复 | 先保留复现，再改代码 |
| `migrate` | API、依赖、配置或数据迁移 | 明确兼容窗口和回滚方式 |
| `integrate` | 检查跨模块接口和集成行为 | 优先验证和最小修复 |
| `review` / `reviewer` | 审查正确性、回归和测试缺口 | 只读，发现必须有行号证据 |
| `audit` / `security` | 安全、架构、维护性或合规审计 | 只读，按风险分级 |
| `performance` | 找瓶颈、基准和资源问题 | 先测量，再优化和复测 |
| `test` / `tester` | 补测试、运行测试、找覆盖缺口 | 不削弱断言来通过测试 |
| `verify` / `verifier` | 做最终构建、诊断、测试和 diff 检查 | 默认只读，报告精确命令 |
| `design` / `ui-design` | 设计 API、架构、UI 或交互 | 先输出方案，再实现 |
| `docs` | 更新 README、API 文档和示例 | 检查链接、命令和版本一致性 |
| `release` | 版本、变更记录、打包和发布前检查 | 未明确授权时不发布 |

这些 profile 提取了 `pi-maestro-flow` Agent 目录里可用于单任务分支的职责语义，但没有复制它依赖 Maestro team bus、共享 artifact、schema 或 MCP 的运行时。`team-supervisor`、`team-worker`、`cross-role-reviewer` 等协调角色不在 `pi-gsd` 中伪装实现。`role` 不是强制枚举，也不赋予权限；真正的范围、禁止事项、输出格式和验收命令必须写进 `prompt`。`model` 是可选模型匹配式，适合让探索、审查、测试、文档和验证等低风险任务使用更便宜的模型。

然后按顺序操作：

```text
/start-task
```

在新上下文中完成任务；检查结果后：

```text
/finish-task
```

不需要执行时用 `/discard-task`；需要按队列连续执行时用 `/auto`。折叠视图只显示 queued、running 或 completed 状态、任务标题与真实耗时；使用 `Ctrl+O` 展开任务 prompt 或完整结果。

## 6. Skills、外部 package 和其他能力

### Skills

当前有效清单为 58 个定义：仓库 57 个 `SKILL.md` 加上本机保留的 `batch-grill-me`，其中两个定义同名为 `mineru`。安装器首次创建 `~/.pi/agent/skills/`；目标已存在时会保留本机 skills。默认 slim-skills allowlist 只让以下 7 个技能进入发现索引；完整路径和逐项示例见[Skill 目录](skills.zh-CN.md)：

```text
figure-style
humanizer
humanizer-zh
batch-grill-me
mineru
mineru-file-processing
scientific-visualization
```

调用例子：

```text
/skill:batch-grill-me
```

```text
/skill:mineru-file-processing
读取这个 PDF，提取表格和公式，并保留页码证据。
```

技能不适合当前任务时不要强行加载；加载技能会增加本轮上下文。

### 联网资料访问

`pi-web-access` 默认提供 `web_search`、`source_check`、`fetch_content` 和 `get_search_content`。用自然语言说明检索目标、时间范围或可信域名；需要具体网页、PDF、GitHub 仓库或视频内容时，提供 URL 并说明要提取的证据。GitHub URL 会克隆为本地目录供后续检查，而不是只抓取渲染后的网页。项目通过 `/tools` 禁用这些工具后，它们才会从模型工具集中移除。完整的 35 个当前工具示例见[工具目录](tools.zh-CN.md)。

```text
搜索 2025 年 TypeScript 装饰器规范的变化，只引用 typescriptlang.org 和 GitHub 讨论，并给出来源链接。
```

```text
抓取 https://example.com/report.pdf，提取方法、表格和结论，并标出页码。
```

### RTK 和缓存

```text
/rtk verify
/cache-optimizer
```

RTK 压缩 AFT 的 `read`、`grep` 和其他通用工具结果。AFT 自己负责 Bash rewrite、压缩与后台任务；本地桥接会阻止 RTK 二次压缩 AFT Bash，避免丢失失败诊断。

用 `/rtk verify` 检查 RTK binary；AFT 的运行配置位于 `~/.config/cortexkit/aft.jsonc`。

### Magic Context

安装器会运行 Magic Context 官方安装流程，并把触发阈值设为当前配置的 `55%`。Pi 原生自动压缩在公开设置中关闭，由 Magic Context 负责压缩、历史恢复和长期记忆。

长工具输出即使最终被压缩，也应先要求模型只保留与任务相关的摘要：

```text
只保留失败原因、相关文件、下一步和验证命令；不要复制完整日志。
```

## 7. 六个基础场景

### 场景 A：普通修复

```text
修复当前项目的登录回调错误。
先读取相关实现和测试，只修改必要文件。
完成后运行最窄的相关测试，并报告测试命令和结果。
```

### 场景 B：跨文件语义定位

```text
请查找 src/service.py 中 UserStore 的定义、全部引用和类型诊断。
只读，不修改文件；最后告诉我最安全的修改入口。
```

### 场景 C：安全重命名

```text
请把 src/api.ts 中的 handleRequest 重命名为 handleRequestV2。
先预览所有将修改的文件和位置；我确认后再应用，并运行 TypeScript 测试。
```

### 场景 D：长任务

```text
把 CLI 的配置读取改为支持环境变量覆盖。
范围只限 cli/ 和对应测试。
完成前运行 `npm run typecheck` 和相关测试；任何失败都不要宣布完成。
```

### 场景 E：并行研究后实现

```text
请先用 push-task 建立一个只读调查任务：检查现有 API、测试覆盖和最近提交。
使用 /start-task 执行，完成后用 /finish-task 返回主分支。
不要修改文件，也不要重复带回完整日志。
```

### 场景 F：研究、PDF 和图表

```text
/skill:mineru-file-processing
读取这个 PDF，提取方法、表格和公式，保留页码。
然后使用 scientific-visualization 设计一张能表达主要结果的图，先给出数据和图形方案，不要编造缺失数据。
```

## 8. 更新和排障

更新仓库配置：

```bash
cd ~/.pi_config
git pull --ff-only
node install.mjs --yes
```

更新已安装的第三方 package：

```bash
pi update --all
```

检查 package：

```bash
pi list
```

检查项目工具选择：

```text
/tools list
```

如果新工具没有出现：

1. 运行 `/tools`，确认对应扩展或工具没有在当前项目中关闭。
2. 检查 `pi list` 是否有对应 package。
3. 修改 package 或扩展后运行 `/reload`，必要时重启 Pi。
4. 用 `pi config -l` 检查项目级 package 资源是否被禁用。
5. 用 `pi --no-extensions` 判断是否为扩展冲突。

不要提交 API key、token、密码、私钥、session 或 provider 注册表。
