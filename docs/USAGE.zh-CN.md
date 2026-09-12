# pi_config 完整使用手册

这份手册回答三个问题：如何安装、如何让 Pi 加载某项能力、如何把整套配置用于真实任务。

- [根 README](../README.zh-CN.md)：项目概览和安装入口
- [扩展目录](extensions.zh-CN.md)：所有本地和第三方扩展
- [Skill 目录](skills.zh-CN.md)：仓库 34 个 skill 及本机外部 skill 的逐项调用示例
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
3. 备份现有 `~/.pi/agent`。
4. 合并缺失的 skills 和 themes，保留本机已有文件；仅在独立扩展不存在时复制它们。
5. 覆盖仓库维护的公开配置，合并公开 settings，并自动扫描 `extensions/pi-*/package.json` 逐个运行 `pi install`。
6. 默认安装四个本地聚合 package；每个项目仍可用 `/tools` 保存自己的工具禁用项。
7. 按选择安装外部 package 和 RTK。

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

确认 `pi list` 输出包含四个仓库聚合入口：

```text
extensions/pi-context-bridge
extensions/pi-default-workbench
extensions/pi-slim-skills
extensions/pi-tool-rails
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

## 2. adaptive、fast 与 full 工具模式

`pi-default-workbench` 默认使用 `adaptive`：首轮暴露 canonical `read/write/edit/grep`、`bash`、FFF、Todo、结构化提问与 `search_tool_bm25`；缺少其他能力时，模型通过 BM25 按组追加注册工具。扩展 package、命令和事件处理器始终保持加载，模式只改变模型可见的工具集合。

```text
搜索 2025 年 C++ sender/receiver 规范的变化，只引用 WG21 和 cppreference，并给出来源链接。
```

只想减少某个项目发送给模型的工具定义时，在该项目内打开：

```text
/tools
```

一级列表按扩展显示启用数量：`Space` 整组开关，`Enter` 进入二级工具列表，二级用 `Space` 或 `Enter` 切换单个工具。选择立即生效，并写入受信任项目的 `.pi/tool-selector.json`；没有该文件时默认不禁用任何扩展工具。

三个模式子命令：

```text
/tools adaptive # fast core + search_tool_bm25，按需成组追加能力
/tools fast     # 固定最小集合，不提供 BM25 动态追加
/tools full     # 全部注册工具，但仍服从显式禁用规则
/tools reset    # 清空显式禁用规则并进入 full
```

adaptive/fast 的严格 core 是 `read`、`bash`、`write`、`edit`、`grep`、`fffind`、`ffgrep`、`todo`、`ask_user_question`、`bash_bg`；原生 `ls/find` 和其他能力工具只在 adaptive 按需激活或 full 中出现。

```json
{
  "toolMode": "adaptive",
    "disabledExtensions": ["local:pi-default-workbench"],
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
| `/skill:名称` | 显式加载某个技能 | `/skill:grill-with-docs`
| `/plan` | 进入只读规划模式 | 先规划大型重构 |
| `/reload` | 重载设置、扩展、技能和主题 | 配置更新后 |

提示词最好包含四项：目标、范围、禁止事项、验收命令。例如：

```text
修复 packages/api 的登录回调错误。
范围：只修改 packages/api 和它的测试。
先读取现有测试，再实现修复。
完成前运行 packages/api 的相关测试；不要把失败测试标记为完成。
```

## 4. 文件、搜索与执行

默认模式保留 Pi 原生 `read`、`write`、`edit`、`grep` 和 `bash`。`pi-context-bridge` 统一加载 Web Access、manager 模型目录和 continuity；`pi-default-workbench` 提供 `fffind`、`ffgrep`、`bash_bg`、`conflict`、`browser`、`todo` 和 Preview；独立的 `execute_command` 扩展负责命令/消息调度。对大文件优先要求读取相关符号或范围，不要无边界读取整份文件。跨文件重命名前先预览范围，再运行项目编译或相关测试。

```text
读取 src/service.py 中 UserStore 的定义和全部引用；只读返回最安全的修改入口。
```

## 5. 大型项目模式与 Skills

默认 `pi` 不加载并行委派。需要 GUI、MCP、LSP、browser/web search、FFF、conflict、root `bash_bg`、Goal、Todo、Plan、Loop、Advisor、self-evolve、Maestro skills 和 teammate 时，在当前 Pi 会话输入：

```text
/large on
```

`/large on` 会把当前默认 package 边界切换为固定上游 profile：Flow 版本在首次 `/large on` 时从 npm registry 解析并固定，teammate 与 Cockpit 版本由该 Flow 版本的依赖解析固定；用 `/large status` 查看当前固定的版本。然后调用 Pi 的公开 `ctx.reload()`。认证、模型、主题、session 和当前会话都不变，不再创建 `~/.pi/agent-large`。

使用 `/large status` 检查状态，使用 `/large off` 恢复切换前受管 package 的原始顺序与 `autoload`，同时保留 Large 期间新增的无关 package。`/large update` 只注入固定版本检查工作流；需要实际应用通过隔离兼容性验证的新版本时使用 `/large update apply`，不会自动跟随 `latest`。

### Skills

当前有效清单以仓库 34 个唯一 `SKILL.md` 名称为基线；本机外部 package 还可能提供额外 skill。安装器递归同步完整 skill 树。默认 slim-skills allowlist 使用 [`../config/slim-skills-whitelist.json`](../config/slim-skills-whitelist.json) 中的入口：

```text
humanizer
humanizer-zh
mineru
mineru-file-processing
literature-search-openalex
academic-paper
academic-paper-reviewer
deep-research
scientific-visualization
docx
pdfs
```

调用例子：

```text
/skill:grill-with-docs
```

```text
/skill:mineru-file-processing
读取这个 PDF，提取表格和公式，并保留页码证据。
```

技能不适合当前任务时不要强行加载；加载技能会增加本轮上下文。

### 联网资料访问

`pi-context-bridge` 默认加载锁定的 Web Access 实现，提供 `web_search`、`source_check`、`fetch_content` 和 `get_search_content`。用自然语言说明检索目标、时间范围或可信域名；需要具体网页、PDF、GitHub 仓库或视频内容时，提供 URL 并说明要提取的证据。GitHub URL 会克隆为本地目录供后续检查，而不是只抓取渲染后的网页。项目通过 `/tools` 禁用这些工具后，它们才会从模型工具集中移除。完整的工具示例见[工具目录](tools.zh-CN.md)。

```text
搜索 2025 年 TypeScript 装饰器规范的变化，只引用 typescriptlang.org 和 GitHub 讨论，并给出来源链接。
```

```text
抓取 https://example.com/report.pdf，提取方法、表格和结论，并标出页码。
```

### RTK

```text
/rtk verify
```

RTK 压缩通用工具结果；长命令由原生 `bash` 或 `bash_bg` 返回。用 `/rtk verify` 检查 RTK binary。

### 上下文压缩

Pi 原生自动压缩已启用。它只使用当前 provider 的请求，不额外调用独立模型；需要减少未缓存输入时，保持系统提示词和会话前缀稳定，并要求工具输出先摘要再继续。
长工具输出即使最终被压缩，也应先要求模型只保留与任务相关的摘要：

```text
只保留失败原因、相关文件、下一步和验证命令；不要复制完整日志。
```

## 6. 五个基础场景

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

### 场景 E：研究、PDF 和图表

```text
/skill:mineru-file-processing
读取这个 PDF，提取方法、表格和公式，保留页码。
然后使用 scientific-visualization 设计一张能表达主要结果的图，先给出数据和图形方案，不要编造缺失数据。
```

## 7. 更新和排障

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

Large profile 使用固定版本，不通过独立 profile 更新。先在 Pi 中运行 `/large update` 检查；只有隔离兼容性验证通过后才运行 `/large update apply`。

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
