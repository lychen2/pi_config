# pi_config 完整使用手册

这份手册回答三个问题：如何安装、如何让 Pi 加载某项能力、如何把整套配置用于真实任务。

- [根 README](../README.zh-CN.md)：项目概览和安装入口
- [扩展目录](extensions.zh-CN.md)：所有本地和第三方扩展
- [技能目录](skills.zh-CN.md)：仓库内技能索引

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
6. 根据 `config/deferred-tools.json` 重新生成本机路径，保证本地 package 的延迟加载在新机器上可用。
7. 按选择安装 Magic Context、浏览器 runtime 和 RTK。

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
pi-semantic-code-local
pi-goal-verifier-local
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

## 2. 先理解“激活”

这套配置有两种能力：

- **常驻能力**：Pi 启动时直接可用，例如 `read`、`bash`、`replace`、`todo`、skills 索引和主题。
- **延迟能力**：启动时隐藏，真正需要时才加载，例如浏览器、subagent、语义代码和 DAG。

`load_tools` 是模型内部的按需加载开关，不是你需要输入的命令。你不必记住 `load_tools` 或 `semantic_code` 的名字，只要用日常语言描述你想知道的事情：

```text
请查看 src/parser.cpp 中 parse_request 的定义和全部引用，告诉我修改风险；不要修改文件。
```

模型会根据任务自动加载合适的工具。只有在它没有自动使用代码结构分析时，才补充一句“请使用能查定义、引用和类型错误的代码工具”；不需要手写 JSON。

查看哪些扩展被延迟、哪些工具可加载：

```text
/deferred-tools list
```

临时把某个扩展改为延迟或恢复常驻：

```text
/deferred-tools add <extension-id>
/deferred-tools remove <extension-id>
```

修改后执行 `/reload`。不要手写当前机器的本地路径；安装器会根据目标机路径生成它们。

如果 `load_tools` 不在初始工具列表中，先检查：

```bash
pi list
```

并确认没有设置：

```bash
PI_DEFERRED_TOOLS_DISABLE=1
```

## 3. 最常用的 Pi 输入方式

| 输入 | 作用 | 示例 |
| --- | --- | --- |
| 普通文字 | 描述目标、边界和验收条件 | `修复登录回调，并运行相关测试` |
| `@文件` | 把文件附加到当前消息 | `审阅 @src/auth.ts` |
| `!命令` | 执行 shell，并把输出交给模型 | `!git status --short` |
| `!!命令` | 执行 shell，但不把输出放进上下文 | `!!tail -n 100 server.log` |
| `/skill:名称` | 显式加载某个技能 | `/skill:karpathy-guidelines` |
| `/plan` | 进入只读规划模式 | 先规划大型重构 |
| `/goal` | 启动可持续执行的目标 | 长任务、跨多个文件的修改 |
| `/reload` | 重载设置、扩展、技能和主题 | 配置更新后 |

提示词最好包含四项：目标、范围、禁止事项、验收命令。例如：

```text
修复 packages/api 的登录回调错误。
范围：只修改 packages/api 和它的测试。
先读取现有测试，再实现修复。
完成前运行 packages/api 的相关测试；不要把失败测试标记为完成。
```

## 4. 语义代码工具：`semantic_code`

### 能做什么

`semantic_code` 只是这个工具的内部名称。你不需要学习这个词。它可以理解为一把“看得懂代码关系的放大镜”：普通搜索只能找相同文字，它还能判断一个名字在哪里定义、哪些地方真正引用它、某行的类型是否不对。

| 语言 | 文件 | 首选服务器 |
| --- | --- | --- |
| C/C++ | `.c`、`.cpp`、`.h` 等 | `clangd` |
| Python | `.py`、`.pyi` | `basedpyright-langserver`、`pyright-langserver`、`pylsp` |
| Rust | `.rs` | `rust-analyzer` |
| JavaScript/TypeScript | `.js`、`.ts`、`.tsx` 等 | `typescript-language-server`、`vtsls`、Deno |
| C# | `.cs` | `csharp-ls`、OmniSharp |
| Go | `.go` | `gopls` |
| LaTeX | `.tex`、`.ltx`、`.bib` | `texlab` |
| Typst | `.typ` | `tinymist` |

它能帮你做这些事：

- `status`：显示可用服务器和当前路由。
- `diagnostics`：读取错误、警告和类型诊断。
- `definition`：跳到定义。
- `references`：查找全部引用。
- `hover`：读取符号类型和文档。
- `symbols`：列出文件或工作区符号。
- `rename`：预览或应用跨文件重命名。

所有结果都有大小限制，不会把整个项目或整份文件塞回上下文。

### 你可以这样说

不需要使用工具名，也不需要填写参数：

```text
请查看 src/service.py 中 UserStore 的定义、全部引用和类型诊断。只读，不修改文件；最后告诉我最安全的修改入口。
```

```text
请检查 src/main.rs 第 88 行附近的类型或借用错误，并解释原因。不要修改文件。
```

```text
请告诉我 src/api.ts 中 handleRequest 的定义位置、调用它的文件，以及它接收的参数类型。
```

路径、文件名和行号越具体，结果越准确；缺少行号时，模型会先查文件中的相关符号。

### Rename 的安全用法

默认只预览，不会改文件：

```text
请把 src/parser.cpp 中的 parse_request 改名为 parseRequest。先列出所有将被修改的文件和位置，不要应用。
```

确认预览无误后：

```text
刚才的改名范围正确。现在应用这个改名，并运行相关测试。
```
如果工具报告找不到代码分析服务器，直接这样问：

```text
请检查当前项目能用的代码分析服务器，并告诉我缺少什么；不要修改项目。
```

工具搜索顺序是：当前项目的 `node_modules/.bin`、`.venv/bin` 或 `venv/bin`，用户目录下的 `.local/bin`、`.dotnet/tools`、`go/bin`，最后是系统 `PATH`。

语义扩展本身不捆绑所有语言服务器。缺少某个服务器时，安装对应运行时即可，例如：

```bash
# Python 和 JavaScript/TypeScript
npm install -g basedpyright typescript typescript-language-server

# Rust
rustup component add rust-analyzer

# Go
go install golang.org/x/tools/gopls@latest

# C#
dotnet tool install --global csharp-ls
```

C/C++、LaTeX 和 Typst 的 `clangd`、`texlab`、`tinymist` 可使用系统包管理器或各项目 release 安装。安装后重启 Pi 或运行 `/reload`。

项目需要特殊服务器时，在项目的 `.pi/semantic-code.json` 或全局 `~/.pi/agent/semantic-code.json` 添加覆盖：

```json
{
  "servers": {
    "my-python": {
      "command": ["my-language-server", "--stdio"],
      "extensions": [".py"],
      "languageIds": {".py": "python"},
      "actions": ["diagnostics", "definition"]
    }
  }
}
```

受信任项目的 `.pi/semantic-code.json` 优先于全局文件。`enabled: false` 可关闭内置或自定义服务器。

## 5. Goal 验收门：`pi-goal-verifier`

Goal 验收默认关闭，避免无意中执行命令。启用方式是创建配置文件。

### 项目级配置

在项目根目录创建 `.pi/goal-verification.json`：

```json
{
  "commands": [
    {
      "command": "npm",
      "args": ["run", "typecheck"],
      "timeoutSeconds": 60
    },
    {
      "command": "npm",
      "args": ["test", "--", "--runInBand"],
      "timeoutSeconds": 120
    }
  ]
}
```

项目必须先被 Pi 信任；需要时在 Pi 中运行 `/trust`。也可以创建全局配置：

```text
~/.pi/agent/goal-verification.json
```

项目级配置只在受信任时使用，并优先于全局配置。

限制：最多 5 条命令，每条 1 到 120 秒；`cwd` 必须位于项目根目录内。命令失败、超时、配置无效或工作目录越界都会阻止 `goal_complete`。

### 使用

不需要额外加载工具。配置文件存在时，下面的流程会自动验收：

```text
/goal
实现用户资料页的邮箱校验。
先读取现有测试，修改前端和后端相关代码。
完成前运行配置中的验收命令，只有全部通过才标记 Goal 完成。
```

只想单独跑验收，不完成 Goal：

```text
/goal-verify
```

没有配置时，`/goal-verify` 会提示配置路径，Goal 行为保持原样。

## 6. 轻量 DAG：`workflow_dag`

`workflow_dag` 也是延迟工具，适合小型的“检查 -> 实现 -> 复核”流程。普通单任务委派仍优先使用 `@narumitw/pi-subagents`。

不需要记住 `workflow_dag` 的名字。直接说明步骤之间的依赖关系：

```text
把这个任务拆成三个有依赖的步骤：先只读检查现状，再实现最小修改，最后只读复核 diff 和测试。每一步只返回结论、改动文件和验证结果。
```

模型会在适合时自动加载并组织这个流程。
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

## 7. Subagent 和自动续跑

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

## 8. Skills、外部 package 和其他能力

### Skills

安装器会把仓库的 `skills/` 同步到 `~/.pi/agent/skills/`。默认 slim-skills allowlist 只让以下 7 个技能进入发现索引：

```text
figure-style
humanizer
humanizer-zh
karpathy-guidelines
mineru
mineru-file-processing
scientific-visualization
```

调用例子：

```text
/skill:karpathy-guidelines
```

```text
/skill:mineru-file-processing
读取这个 PDF，提取表格和公式，并保留页码证据。
```

技能不适合当前任务时不要强行加载；加载技能会增加本轮上下文。

### 浏览器和项目外目录

浏览器：

```text
请打开登录页，检查表单提交失败的网络请求和控制台错误。
```

模型会按需加载 `agent_browser`。先检查 runtime：

```bash
npm exec --prefix "$HOME/.pi/agent/npm" -- pi-agent-browser-doctor
```

项目外文件：

```text
/add-dir /absolute/path/to/shared-docs
```

完成后清理：

```text
/remove-dir /absolute/path/to/shared-docs
```

不要把外部大目录复制进当前项目。

### RTK 和缓存

```text
/rtk verify
/cache-optimizer
```

RTK 压缩命令输出；cache optimizer 尽量保持稳定的提示词前缀以提高 provider cache 命中。两者都不是代码正确性的替代品，测试仍要运行。

### Magic Context

安装器会运行 Magic Context 官方安装流程，并把触发阈值设为当前配置的 `55%`。Pi 原生自动压缩在公开设置中关闭，由 Magic Context 负责压缩、历史恢复和长期记忆。

长工具输出即使最终被压缩，也应先要求模型只保留与任务相关的摘要：

```text
只保留失败原因、相关文件、下一步和验证命令；不要复制完整日志。
```

## 9. 六个基础场景

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

### 场景 D：可验证长任务

```text
/goal
把 CLI 的配置读取改为支持环境变量覆盖。
范围只限 cli/ 和对应测试。
完成前运行 .pi/goal-verification.json 中的全部命令；任何失败都不要标记完成。
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

## 10. 更新和排障

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

检查延迟工具：

```text
/deferred-tools list
```

如果新工具没有出现：

1. 重启 Pi，或运行 `/reload`。
2. 检查 `pi list` 是否有对应 package。
3. 检查 `PI_DEFERRED_TOOLS_DISABLE` 是否为 `1`。
4. 让 Pi 检查当前项目能用的代码分析服务器，确认所需服务器可执行。
5. 用 `pi --no-extensions` 判断是否为扩展冲突。

如果 Goal 验收没有执行：

1. 检查配置文件名必须是 `goal-verification.json`。
2. 检查文件位于 `~/.pi/agent/` 或受信任项目的 `.pi/`。
3. 运行 `/goal-verify` 查看实际使用的配置路径。
4. 检查命令、参数、timeout 和 `cwd` 是否有效。

不要提交 API key、token、密码、私钥、session 或 provider 注册表。
