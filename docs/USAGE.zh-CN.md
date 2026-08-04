# pi_config 完整使用手册

这份手册回答三个问题：如何安装、如何让 Pi 加载某项能力、如何把整套配置用于真实任务。

- [根 README](../README.zh-CN.md)：项目概览和安装入口
- [扩展目录](extensions.zh-CN.md)：所有本地和第三方扩展
- [Skill 目录](skills.zh-CN.md)：58 个有效 skill 定义及逐项示例
- [工具目录](tools.zh-CN.md)：41 个当前 `functions.*` 工具及逐项示例

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
3. 备份现有 `~/.pi/agent`。
4. 恢复 skills、themes、公开配置和独立扩展。
5. 自动扫描 `extensions/pi-*/package.json`，逐个运行 `pi install`。
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

安装器不会写入 provider 凭据、API key、session 或模型注册表。安装前仍应审查脚本，因为 Pi package 以当前用户权限运行。

### 安装后检查

打开新终端，运行：

```bash
pi --version
pi list
```

确认以下本地 package 出现在 `pi list` 中：

```text
pi-workflow-dag-local
```
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

`pi-deferred-tools` 的旧包名容易误导，但 **tools are no longer deferred**：它现在只是项目级工具选择器。扩展工具默认跟随 Pi 的正常启用状态，不会在运行时通过 `load_tools` 动态加载或卸载。需要联网、subagent 或 DAG 时，直接描述任务即可：

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

> AFT 的用户配置在 `~/.config/cortexkit/aft.jsonc`；本配置关闭其 Bash 接管，保留 `pi-rtk-optimizer` 的命令改写和输出压缩。

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


## 5. 轻量 DAG：`workflow_dag`

`workflow_dag` 适合小型的“检查 -> 实现 -> 复核”流程。普通单任务委派仍优先使用 `@narumitw/pi-subagents`。

不需要记住 `workflow_dag` 的名字。直接说明步骤之间的依赖关系：

```text
把这个任务拆成三个有依赖的步骤：先只读检查现状，再实现最小修改，最后只读复核 diff 和测试。每一步只返回结论、改动文件和验证结果。
```

模型会在适合时调用并组织这个流程。
### 经典例子：检查、实现、复核

```text
把登录回调修复拆成一个有依赖的工作流：

1. inspect：只读检查登录回调、现有测试和失败原因。
2. implement：在 inspect 通过后实现修复，mode=write。
3. review：在 implement 通过后只读审查 diff 和测试缺口。

每个节点只返回结论、改动文件和验证结果，不要把无关日志带回主上下文。
```

模型会组织成类似这样的调用：

```json
{
  "action": "run",
  "workflowId": "auth-fix",
  "nodes": [
    {
      "id": "inspect",
      "prompt": "检查登录回调、现有测试和失败原因；不要修改文件。",
      "mode": "readonly"
    },
    {
      "id": "implement",
      "prompt": "根据 inspect 的证据实现修复并运行窄测试。",
      "dependsOn": ["inspect"],
      "mode": "write"
    },
    {
      "id": "review",
      "prompt": "审查实现节点的 diff、测试和剩余风险；不要修改文件。",
      "dependsOn": ["implement"],
      "mode": "readonly"
    }
  ]
}
```

规则：最多 8 个节点；没有未完成依赖的只读节点最多并行 3 个；写节点会单独执行；失败节点的下游会跳过；worker 使用独立、无扩展、无技能的 Pi 进程。状态会写入当前 session，可要求模型调用：

```text
请用 workflow_dag 查看 auth-fix 的 status。
```

清理状态：

```text
请用 workflow_dag clear 清理 auth-fix 的状态。
```

## 6. Subagent 和自动续跑

`@narumitw/pi-subagents` 用于普通的隔离委派。例子：

```text
请使用 subagent 并行完成三项只读工作：
1. 找出相关实现文件；
2. 找出已有测试和测试缺口；
3. 检查最近的相关提交。
最后由主代理综合结果，不要让子代理修改文件。
```

当前配置让 stateful subagent 完成后自动唤醒主代理综合结果，不必再手动发送一条“继续”的消息。可以用：

```text
/subagents status
```

查看配置和运行状态。

## 7. Skills、外部 package 和其他能力

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

`pi-web-access` 默认提供 `web_search`、`source_check`、`fetch_content` 和 `get_search_content`。用自然语言说明检索目标、时间范围或可信域名；需要具体网页、PDF、GitHub 仓库或视频内容时，提供 URL 并说明要提取的证据。GitHub URL 会克隆为本地目录供后续检查，而不是只抓取渲染后的网页。项目通过 `/tools` 禁用这些工具后，它们才会从模型工具集中移除。完整的 41 个当前工具示例见[工具目录](tools.zh-CN.md)。

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

## 8. 六个基础场景

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
请先使用 subagent 并行调查：现有 API、测试覆盖、最近提交。
主代理综合证据后，给出最小修改并运行测试。
子代理只读，不要重复把完整日志带回主上下文。
```

### 场景 F：研究、PDF 和图表

```text
/skill:mineru-file-processing
读取这个 PDF，提取方法、表格和公式，保留页码。
然后使用 scientific-visualization 设计一张能表达主要结果的图，先给出数据和图形方案，不要编造缺失数据。
```

## 9. 更新和排障

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
