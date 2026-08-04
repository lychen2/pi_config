# pi_config

[English](README.md) | **简体中文**

这是一个面向 [Pi coding agent](https://github.com/badlogic/pi-mono) 的可迁移配置备份，包含扩展、技能、主题和公开配置。你可以用它在新机器上复现当前工作环境，也可以只取用其中的单个组件。

> [!IMPORTANT]
> 本仓库只保存可公开的配置。API key、token、密码、私钥、provider 注册表、会话记录和本机运行数据均已排除。

## 界面预览

<table>
<tr>
<td width="50%" align="center"><strong>主题化 Pi 工作区</strong><br><img src="docs/images/pi-tui-overview.png" alt="主题化 Pi 工作区" width="100%"></td>
<td width="50%" align="center"><strong>工具 rail</strong><br><img src="docs/images/pi-tui-replace.png" alt="Pi 工具 rail" width="100%"></td>
</tr>
<tr>
<td width="50%" align="center"><strong>结构化结果</strong><br><img src="docs/images/pi-tui-tools.png" alt="Pi 结构化结果" width="100%"></td>
<td width="50%" align="center"><strong>会话布局</strong><br><img src="docs/images/pi-tui-session.png" alt="Pi 会话布局" width="100%"></td>
</tr>
</table>

## 仓库内容

| 路径 | 内容 | 恢复方式 |
| --- | --- | --- |
| `install.sh`、`install.ps1`、`install.mjs` | 跨平台环境引导和配置安装器 | 运行对应操作系统的入口脚本 |
| `scripts/` | 本地集成与工具显示 registry 的跨平台安装后检查脚本 | 在仓库根目录运行对应 Node 脚本 |
| `extensions/` | 全部带 `pi-*/package.json` 的本地 package 和 2 个独立扩展 | 使用 `pi install` 安装 package；直接复制独立扩展 |
| `skills/` | 仓库跟踪 57 个 `SKILL.md` 定义；当前有效清单另包含本机保留的 `batch-grill-me`，合计 58 个定义 | 合并缺失项到 `~/.pi/agent/skills/`；本机已有 skill 会保留 |
| `config/` | Pi 公开设置、系统规则、扩展状态和外部 package 清单 | 检查后按需复制或合并 |
| `themes/` | 2 个 Matugen 主题 | 复制到 `~/.pi/agent/themes/` |
| `docs/` | 上手 Wiki、58 个 skill 和 41 个工具目录，以及 README 截图 | 打开 [`docs/WIKI.zh-CN.md`](docs/WIKI.zh-CN.md) |

## Wiki

- [完整使用手册：安装、激活与基础场景](docs/USAGE.zh-CN.md)
- [快速上手](docs/WIKI.zh-CN.md)
- [扩展目录](docs/extensions.zh-CN.md)
- [技能目录与 58 个使用示例](docs/skills.zh-CN.md)
- [工具目录与 41 个使用示例](docs/tools.zh-CN.md)

## 安装

引导脚本支持在没有 Node.js、Git 和 Pi 的新机器上运行。Pi 扩展和第三方 package 拥有当前用户的完整权限，请在执行前检查脚本内容。

### Linux 和 macOS

```bash
curl -fsSL https://raw.githubusercontent.com/lychen2/pi_config/main/install.sh | sh
```

脚本会使用 Pi 官方安装器配置 Node.js 和 Pi。Linux 支持通过 `apt`、`dnf`、`yum`、`apk`、`pacman` 或 `zypper` 安装 Git。macOS 没有 Homebrew 和 Git 时，系统可能会打开 Apple Command Line Tools 安装程序。

### Windows

在 PowerShell 中运行：

```powershell
irm https://raw.githubusercontent.com/lychen2/pi_config/main/install.ps1 | iex
```

Windows 引导脚本使用 WinGet 安装 Node.js LTS 和 Git for Windows。Pi 在原生 Windows 上需要 Git Bash。脚本还会把经过 SHA-256 校验的 RTK release binary 安装到 `~/.local/bin/rtk.exe`。

### 从本地仓库安装

```bash
# Linux 或 macOS
./install.sh

# 已安装 Node.js 和 Pi 的任意系统
node install.mjs
```

```powershell
# Windows PowerShell
.\install.ps1
```

### 安装流程

安装器会依次执行：

1. 使用系统引导脚本时，安装 Node.js 22.19.0 或更高版本、Git 和 Pi。
2. 本地没有仓库时，将其下载到 `~/.pi_config`。
3. 备份现有 `~/.pi/agent`，以及会被更新的 `~/.config/cortexkit/aft.jsonc` 和 `magic-context.jsonc`。
4. 合并缺失的 skills 和 themes，保留本机已有文件；仅在独立扩展不存在时复制它们。
5. 覆盖仓库维护的公开配置，合并公开 settings，并按选项安装全部本地和外部 package。校验 52 项兼容显示 registry 的短名与 emoji；52 项不是当前 active 工具数量。
6. 运行上游 Magic Context 官方安装脚本，保留已有 JSONC 内容，只将执行阈值设为 `55%`，并关闭 Pi 原生自动压缩。
7. 根据选择安装 RTK 命令行工具。
provider 凭据、模型注册表、API key、会话和环境变量继续保留在各台机器上。

推荐默认值适合全新安装：

| 组件 | 默认行为 | 原因 |
| --- | --- | --- |
| 外部 Pi package | 安装 | 恢复 `config/external-packages.txt` 中记录的工具 |
| Magic Context | 安装 | 运行上游向导并关闭 Pi 原生自动压缩 |
| RTK binary | 安装 | `pi-rtk-optimizer` 的命令改写依赖该 binary；Windows、Linux 和 macOS 均有预编译 release |
| provider/model 默认值 | 保留本机值 | 仓库中的 `manager` provider 依赖本机配置 |

### 安装选项

以下选项可以传给本地入口脚本或直接传给 `install.mjs`：

| 选项 | 作用 |
| --- | --- |
| `--yes`、`-y` | 不询问并采用推荐默认值 |
| `--dry-run` | 只显示计划，不修改文件或安装 package |
| `--with-magic-context` / `--skip-magic-context` | 安装或跳过上游 Magic Context 向导 |
| `--with-external` / `--skip-external` | 安装或跳过外部 package 清单 |
| `--with-rtk` / `--skip-rtk` | 安装或跳过 `pi-rtk-optimizer` 使用的 RTK binary |
| `--with-model-defaults` / `--skip-model-defaults` | 应用仓库值或保留本机 provider/model 默认值 |

示例：

```bash
# 查看全部操作，不修改当前机器
./install.sh --dry-run --yes

# 同时应用仓库中的 provider/model 默认值
./install.sh --yes --with-model-defaults

# 跳过 Magic Context、外部 package 和 RTK binary
./install.sh --yes --skip-magic-context --skip-external --skip-rtk
```

PowerShell 使用对应的 switch 名称：

```powershell
.\install.ps1 -Yes -WithModelDefaults
```

### 验证安装

安装后若 `pi` 尚未加入 `PATH`，先打开一个新终端，然后运行：

```bash
pi --version
pi list
cd ~/.pi_config
node scripts/verify-tool-presentations.mjs
```

显示检查会校验 52 个已知名称的短名和专属 emoji；其中包含兼容项和可选项，不代表当前 active 工具数量。当前 41 个 `functions.*` 工具的逐项示例见 [`docs/tools.zh-CN.md`](docs/tools.zh-CN.md)。

启动 Pi，使用 `pi-provider` 配置自定义 provider，然后选择对应模型：

```text
pi
/provider add
/model
```

启用 RTK 后运行：

```text
rtk --version
/rtk verify
/cache-optimizer
```

扩展工具默认启用。工具现在不再运行时延迟；只有需要减少当前项目发送给模型的工具定义时，才运行 `/tools`：一级按扩展开关，`Enter` 进入二级逐工具选择，结果保存在受信任项目 `.pi/tool-selector.json`。完整用法见[使用手册](docs/USAGE.zh-CN.md)。

### 本机配置快速理解

| 仓库来源 | 安装目标 | 恢复行为 |
| --- | --- | --- |
| `config/settings-public.json` | `~/.pi/agent/settings.json` | 合并公开设置；默认保留本机 provider/model，使用 `--with-model-defaults` 才应用仓库默认值 |
| `config/aft.jsonc` | `~/.config/cortexkit/aft.jsonc` | 安装前备份，然后覆盖为仓库维护的 AFT 配置 |
| `config/APPEND_SYSTEM.md`、三个 JSON 配置 | `~/.pi/agent/` | 覆盖仓库维护的公开配置 |
| `skills/`、`themes/` | `~/.pi/agent/` | 只补齐缺失文件，保留本机已有内容 |
| `extensions/adhd-mode.ts`、`matugen-chrome.ts` | `~/.pi/agent/extensions/` | 只在目标不存在时复制 |
| `config/external-packages.txt` | Pi package registry | 按选项运行 `pi install` |
| 项目 `.pi/tool-selector.json` | 当前项目目录 | 不由安装器复制；每个项目独立保存工具开关 |

## 本地扩展

| 扩展 | 作用 | 主要控制方式 |
| --- | --- | --- |
| [`pi-brand-header`](extensions/pi-brand-header/) | 显示模型、主题、工作区、技能和工具信息，并适配窄终端 | `/logo` |
| [`pi-deferred-tools`](extensions/pi-deferred-tools/) | 项目级两级工具选择器；工具已不再延迟，旧包名仅为兼容 | `/tools` |
| [`pi-manager-models`](extensions/pi-manager-models/) | 刷新 OpenAI-compatible 模型目录，同时保留本地覆盖项 | provider `baseUrl` 和环境变量 |
| [`pi-slim-skills`](extensions/pi-slim-skills/) | 压缩技能索引，并在每个 prompt 中注入一次指定技能内容 | `/slim-skills` |
| [`pi-todo-guard`](extensions/pi-todo-guard/) | Todo 存在未完成项目时继续当前运行 | `PI_TODO_GUARD_DISABLE=1` |
| [`pi-workflow-dag`](extensions/pi-workflow-dag/) | 按依赖分波执行检查、实现、复核 worker | 直接描述有依赖的步骤；需要时自动加载 |
| [`pi-tool-rails`](extensions/pi-tool-rails/) | 添加主题化结果面板、输入框样式，以及经过校验、范围大于当前 41 个工具面的 52 项名称 registry | `PI_TOOL_RAILS_DISABLE_USER_FRAME=1` |
| [`adhd-mode.ts`](extensions/adhd-mode.ts) | 添加可跨会话保持的 ADHD 响应规则 | `/adhd` |
| [`matugen-chrome.ts`](extensions/matugen-chrome.ts) | 使用当前 Pi theme 渲染 Cometix 风格 footer | `/matugen-chrome` |

## 首次使用

1. 在项目目录启动 Pi：`pi`。
2. 用目标、范围和验收命令描述任务，例如：`修复登录回调；运行相关测试；不要改其他模块。`
3. 需要代码探索时，不用记工具名，直接说明目标文件或符号；AFT 提供 outline、zoom、索引搜索、inspect 与 conflict analysis。需要时要求给出最安全的修改入口。
4. 长任务直接写明范围、验收命令和停止条件；小型依赖任务直接说明“先检查、再实现、最后复核”的步骤即可。

[完整使用手册](docs/USAGE.zh-CN.md) 说明全部能力的激活方式，并提供编码、审阅、AFT 代码探索、联网资料、委派、PDF 和可视化示例。58 个 skill 和 41 个工具的逐项示例分别见 [`docs/skills.zh-CN.md`](docs/skills.zh-CN.md) 与 [`docs/tools.zh-CN.md`](docs/tools.zh-CN.md)。

常用的 package 检查命令如下：

```bash
cd extensions/pi-brand-header
npm install
npm run typecheck
npm pack --dry-run
```

## 技能

当前有效 skill 清单有 58 个定义：仓库跟踪 57 个 `SKILL.md` 定义，另保留本机的 `batch-grill-me`；仓库内有两个同名 `mineru` 定义。完整路径、发现限制和每项示例见[技能目录](docs/skills.zh-CN.md)。使用目录名调用可发现技能：

```text
/skill:humanizer
/skill:scientific-visualization
/skill:mineru-file-processing
```

部分目录属于参考资料集合，没有顶层 `SKILL.md`。Pi 不会将这些目录注册为 slash command，但其中的文件仍可手动使用。

## 外部 package

[`config/external-packages.txt`](config/external-packages.txt) 是第三方 npm 和 Git package 的安装清单，覆盖以下能力：

- 文件搜索、联网资料搜索与内容抓取、预览
- 计划、Todo、结构化提问和 subagent
- AFT 文件编辑、输出压缩、缓存和研究工作流
- 敏感文件保护、主题和 provider 管理

`pi-rtk-optimizer` 仍作为外部 package 安装。它压缩 AFT 的 `read`、`grep` 与其他通用工具输出；AFT 自己负责 Bash rewrite、压缩和后台执行。安装或更新后运行 `/reload`。

## 更新备份

拉取仓库变更、检查差异后，再重新应用可迁移配置：

```bash
cd ~/.pi_config
git pull --ff-only
git status
node install.mjs --dry-run --yes
node install.mjs --yes
```

安装器会为正在使用的 Pi 目录和被更新的 Cortex 配置创建新备份，补齐缺失的 skills/themes，更新公开设置、本地 package、Magic Context 阈值和 AFT 配置；它不会复制凭据、项目工具选择或会话数据。

## 安全

[`.gitignore`](.gitignore) 会排除凭据、模型与认证注册表、会话、缓存、数据库、日志、依赖目录、生成文件、备份和环境文件。

每次提交前运行：

```bash
git status
git diff --check
git grep -n -I -i -E 'BEGIN (RSA|OPENSSH|PRIVATE)|api[_-]?key|token|secret|password|/home/'
```

provider、模型注册表、API key 和环境变量需要在每台机器上单独配置。禁止提交真实凭据。
