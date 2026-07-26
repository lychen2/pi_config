# pi_config

[English](README.md) | **简体中文**

这是一个面向 [Pi coding agent](https://github.com/badlogic/pi-mono) 的可迁移配置备份，包含扩展、技能、主题和公开配置。你可以用它在新机器上复现当前工作环境，也可以只取用其中的单个组件。

> [!IMPORTANT]
> 本仓库只保存可公开的配置。API key、token、密码、私钥、provider 注册表、会话记录和本机运行数据均已排除。

## 界面预览

| 工作区与主题化 TUI | 哈希锚点编辑 | 工具结果面板 |
| --- | --- | --- |
| ![带主题 header 和 footer 的 Pi 工作区](docs/images/pi-tui-overview.png) | ![Pi replace 工具执行结果](docs/images/pi-tui-replace.png) | ![Pi 并行工具调用和结果面板](docs/images/pi-tui-tools.png) |

## 仓库内容

| 路径 | 内容 | 恢复方式 |
| --- | --- | --- |
| `install.sh`、`install.ps1`、`install.mjs` | 跨平台环境引导和配置安装器 | 运行对应操作系统的入口脚本 |
| `extensions/` | 8 个可安装的本地 package 和 2 个独立扩展 | 使用 `pi install` 安装 package；直接复制独立扩展 |
| `skills/` | 58 个 `SKILL.md` 定义，包含嵌套技能集合 | 同步到 `~/.pi/agent/skills/` |
| `config/` | Pi 公开设置、系统规则、扩展状态和外部 package 清单 | 检查后按需复制或合并 |
| `themes/` | 2 个 Matugen 主题 | 复制到 `~/.pi/agent/themes/` |
| `docs/images/` | README 截图 | 无需安装 |

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

Windows 引导脚本使用 WinGet 安装 Node.js LTS 和 Git for Windows。Pi 在原生 Windows 上需要 Git Bash。

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
3. 将现有 Pi 目录备份到 `~/.pi-backup-<timestamp>/agent`。
4. 恢复技能、主题、独立扩展和公开配置。
5. 安装仓库内 package 和已检查的外部 package 清单。

升级时，安装器会移除旧版 `pi-cometix-footer` package。它使用固定 ANSI 颜色，并会与支持主题联动的 `matugen-chrome` footer 争夺渲染控制权。

provider 凭据、模型注册表、API key、会话和环境变量继续保留在各台机器上。

推荐默认值适合全新安装：

| 组件 | 默认行为 | 原因 |
| --- | --- | --- |
| 外部 Pi package | 安装 | 恢复 `config/external-packages.txt` 中记录的工具 |
| 浏览器运行时 | 跳过 | 需要额外下载浏览器和系统依赖 |
| RTK | 跳过 | 属于可选优化器，原生 Windows 暂不支持 |
| provider/model 默认值 | 保留本机值 | 仓库中的 `manager` provider 依赖本机配置 |

### 安装选项

以下选项可以传给本地入口脚本或直接传给 `install.mjs`：

| 选项 | 作用 |
| --- | --- |
| `--yes`、`-y` | 不询问并采用推荐默认值 |
| `--dry-run` | 只显示计划，不修改文件或安装 package |
| `--with-external` / `--skip-external` | 安装或跳过外部 package 清单 |
| `--with-browser` / `--skip-browser` | 安装或跳过 `agent-browser` |
| `--with-rtk` / `--skip-rtk` | 在 Linux 和 macOS 上安装或跳过 RTK |
| `--with-model-defaults` / `--skip-model-defaults` | 应用仓库值或保留本机 provider/model 默认值 |

示例：

```bash
# 查看全部操作，不修改当前机器
./install.sh --dry-run --yes

# 在 Linux 或 macOS 上安装所有受支持组件
./install.sh --yes --with-browser --with-rtk --with-model-defaults

# 只恢复仓库文件和本地 package
./install.sh --yes --skip-external
```

PowerShell 使用对应的 switch 名称：

```powershell
.\install.ps1 -Yes -WithBrowser -WithModelDefaults
```

### 验证安装

安装后若 `pi` 尚未加入 `PATH`，先打开一个新终端，然后运行：

```bash
pi --version
pi list
```

启动 Pi 并登录 provider：

```text
pi
/login
```

启用浏览器自动化或 RTK 后，运行对应检查：

```bash
npm exec --prefix "$HOME/.pi/agent/npm" -- pi-agent-browser-doctor
```

Windows PowerShell 使用：

```powershell
npm exec --prefix (Join-Path $HOME ".pi\agent\npm") -- pi-agent-browser-doctor
```

```text
/rtk verify
/sensitive-guard status
```

初始工具集中应包含 `load_tools`。由延迟扩展管理的工具会保持隐藏，直到 `load_tools` 激活指定工具。

## 本地扩展

| 扩展 | 作用 | 主要控制方式 |
| --- | --- | --- |
| [`pi-brand-header`](extensions/pi-brand-header/) | 显示模型、主题、工作区、技能和工具信息，并适配窄终端 | `/logo` |
| [`pi-agent-browser-compat`](extensions/pi-agent-browser-compat/) | 归一化 provider 生成的 `agent_browser` 参数 | `PI_AGENT_BROWSER_COMPAT_DISABLE=1` |
| [`pi-deferred-tools`](extensions/pi-deferred-tools/) | 按扩展归组工具，并按需激活 | `/deferred-tools` |
| [`pi-manager-models`](extensions/pi-manager-models/) | 刷新 OpenAI-compatible 模型目录，同时保留本地覆盖项 | provider `baseUrl` 和环境变量 |
| [`pi-slim-skills`](extensions/pi-slim-skills/) | 压缩技能索引，并在每个 prompt 中注入一次指定技能内容 | `/slim-skills` |
| [`pi-todo-guard`](extensions/pi-todo-guard/) | Todo 存在未完成任务时继续当前运行 | `PI_TODO_GUARD_DISABLE=1` |
| [`pi-tool-rails`](extensions/pi-tool-rails/) | 添加主题化工具标签、结果面板和输入框样式 | `PI_TOOL_RAILS_DISABLE_USER_FRAME=1` |
| [`adhd-mode.ts`](extensions/adhd-mode.ts) | 添加可跨会话保持的 ADHD 响应规则 | `/adhd` |
| [`matugen-chrome.ts`](extensions/matugen-chrome.ts) | 在 footer 显示模型、Git、上下文和 token 状态 | `/matugen-chrome` |

常用的 package 检查命令如下：

```bash
cd extensions/pi-brand-header
npm install
npm run typecheck
npm pack --dry-run
```

## 技能

仓库包含写作、科研可视化、文献研究、文件处理和编码工作流等技能。使用目录名调用可发现技能：

```text
/skill:humanizer
/skill:scientific-visualization
/skill:mineru-file-processing
```

部分目录属于参考资料集合，没有顶层 `SKILL.md`。Pi 不会将这些目录注册为 slash command，但其中的文件仍可手动使用。

## 外部 package

[`config/external-packages.txt`](config/external-packages.txt) 是第三方 npm 和 Git package 的安装清单，覆盖以下能力：

- 文件搜索、浏览器自动化、预览和外部目录访问
- 计划、目标、Todo、结构化提问和 subagent
- 哈希锚点编辑、输出压缩、缓存和研究工作流
- 敏感文件保护、主题、footer 状态、token 速度和 raw paste

package 凭据和各 package 自己维护的设置会保留在目标机器上。

## 更新备份

拉取仓库变更，不直接修改正在使用的 Pi 目录：

```bash
cd ~/.pi_config
git pull --ff-only
git status
```

将更新后的文件复制到 `~/.pi/agent/` 前，先检查变更内容。

## 安全

[`.gitignore`](.gitignore) 会排除凭据、模型与认证注册表、会话、缓存、数据库、日志、依赖目录、生成文件、备份和环境文件。

每次提交前运行：

```bash
git status
git diff --check
git grep -n -I -i -E 'BEGIN (RSA|OPENSSH|PRIVATE)|api[_-]?key|token|secret|password|/home/'
```

provider、模型注册表、API key 和环境变量需要在每台机器上单独配置。禁止提交真实凭据。
