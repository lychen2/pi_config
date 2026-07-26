# pi_config

[English](README.md) | **简体中文**

这个仓库备份可复用的 [pi coding agent](https://github.com/badlogic/pi-mono) 扩展、技能和配置片段，用于在新机器上复现当前工作环境。仓库只保存可跨机器迁移的文件。

> API key、token、密码、私钥、模型注册表、会话记录和本机运行数据不会存入本仓库。

## 界面预览

### 工作区与主题化 TUI

![带主题 header 和 footer 的 pi 工作区](docs/images/pi-tui-overview.png)

### 基于哈希锚点的编辑

![pi replace 工具执行结果](docs/images/pi-tui-replace.png)

### 工具调用与结果面板

![pi 并行工具调用和结果面板](docs/images/pi-tui-tools.png)

## 仓库内容

| 路径 | 内容 | 恢复方式 |
| --- | --- | --- |
| `extensions/` | 7 个可安装的本地扩展、2 个独立扩展，以及扩展专用配置 | 使用 `pi install` 安装本地 package，并复制独立扩展文件 |
| `skills/` | 57 个可发现技能和若干纯参考技能集合 | 同步到 `~/.pi/agent/skills/` |
| `config/` | 公开运行偏好、系统指导、deferred/slim/翻译状态和外部 package 清单 | 按文档复制或合并 |
| `themes/` | 当前使用的 2 个 Matugen 主题 | 复制到 `~/.pi/agent/themes/` |
| `docs/images/` | README 截图 | 仅用于文档 |

## 在新机器上恢复

### 前置条件

请先安装 pi、Git、Node.js 22 或更高版本、npm 和 `rsync`。浏览器自动化还需要上游 `agent-browser` CLI。可选扩展 `pi-rtk-optimizer` 需要官方 `rtk` 二进制。

### 1. 克隆仓库并备份当前配置

```bash
git clone https://github.com/lychen2/pi_config.git ~/.pi_config
cd ~/.pi_config

backup="$HOME/.pi-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
cp -a "$HOME/.pi/agent" "$backup/agent" 2>/dev/null || true
```

### 2. 恢复技能与无敏感配置

```bash
mkdir -p "$HOME/.pi/agent/skills" "$HOME/.pi/agent/extensions" "$HOME/.pi/agent/themes"
rsync -a skills/ "$HOME/.pi/agent/skills/"
cp config/APPEND_SYSTEM.md "$HOME/.pi/agent/APPEND_SYSTEM.md"
cp config/slim-skills-whitelist.json "$HOME/.pi/agent/slim-skills-whitelist.json"
cp config/translate-submit.json "$HOME/.pi/agent/translate-submit.json"
cp themes/*.json "$HOME/.pi/agent/themes/"

settings="$HOME/.pi/agent/settings.json"
test -f "$settings" || printf '{}\n' > "$settings"
tmp=$(mktemp)
jq -s '.[0] * .[1]' "$settings" config/settings-public.json > "$tmp"
mv "$tmp" "$settings"
```

### 3. 安装仓库内扩展

```bash
for dir in extensions/pi-*/; do
  [ -f "$dir/package.json" ] && pi install "$(realpath "$dir")"
done

mkdir -p "$HOME/.pi/agent/extensions"
cp extensions/adhd-mode.ts extensions/matugen-chrome.ts "$HOME/.pi/agent/extensions/"
```

### 4. 安装命令行依赖

#### 浏览器自动化

`agent-browser` 是上游浏览器自动化 CLI，需要在安装 Pi 桥接扩展前手动安装：

```bash
npm install -g agent-browser
agent-browser install
agent-browser --version
```

全新 Linux 系统缺少 Chrome 系统库时，改用 `agent-browser install --with-deps`。

外部 package 清单会安装 `pi-agent-browser-native`。它负责调用 `agent-browser` CLI，并在 Pi 中提供名为 `agent_browser` 的工具。这三个名称对应不同层级。

仓库内的 `pi-agent-browser-compat` 扩展会把合法 `args` 数组视为主模式，在 wrapper 执行前删除 provider 填充的冲突 mode 字段和不受支持的 stdin；batch、eval 和 auth 使用的非空 stdin 保持不变。

#### RTK

需要恢复 `pi-rtk-optimizer` 时安装 RTK：

```bash
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
rtk --version
```

### 5. 安装外部 Pi package

安装 [`config/external-packages.txt`](config/external-packages.txt) 中记录的 package：

```bash
while IFS= read -r package; do
  case "$package" in
    ""|\#*) continue ;;
    *) pi install "$package" ;;
  esac
done < config/external-packages.txt
```

package 清单已加入 `pi-sensitive-guard`。它会保护敏感文件，并扫描写入、commit 和 push 中常见的凭据模式。默认策略直接阻止受保护的读取；如需返回脱敏内容，可通过 `/sensitive-guard` 手动开启。

只需要部分功能时，请先编辑 package 清单。清单中被注释的本地 package 依赖仓库未包含的源码目录。

### 6. 重启并验证

```bash
pi list
npm exec --prefix "$HOME/.pi/agent/npm" -- pi-agent-browser-doctor
```

安装后启动新的 Pi 会话。启用 RTK 时运行 `/rtk verify`，并用 `/sensitive-guard status` 查看保护策略。初始工具集应包含 `load_tools`；已配置 extension 的工具保持隐藏，直到 `load_tools` 精确激活其中一个工具。

## 本地扩展

| 扩展 | 作用 | 主要控制方式 |
| --- | --- | --- |
| [`pi-brand-header`](extensions/pi-brand-header/) | 显示模型、主题、工作区、技能数和工具数，并适配窄终端 | `/logo` |
| [`pi-agent-browser-compat`](extensions/pi-agent-browser-compat/) | 归一化 provider 填充的 `agent_browser` 字段，不修改第三方 wrapper | `PI_AGENT_BROWSER_COMPAT_DISABLE=1` |
| [`pi-deferred-tools`](extensions/pi-deferred-tools/) | 按 extension 自动归组，每次 loader 调用只激活一个延迟工具 | `/deferred-tools` |
| [`pi-manager-models`](extensions/pi-manager-models/) | 刷新 OpenAI-compatible provider 的模型目录，同时保留本地覆盖项 | provider `baseUrl` 与可选环境变量 |
| [`pi-slim-skills`](extensions/pi-slim-skills/) | 压缩技能索引，并可在每个 prompt 中去重注入指定技能正文 | `/slim-skills` |
| [`pi-todo-guard`](extensions/pi-todo-guard/) | Todo 中仍有未完成任务时自动继续当前运行 | `PI_TODO_GUARD_DISABLE=1` |
| [`pi-tool-rails`](extensions/pi-tool-rails/) | 添加主题化工具标签、结果面板以及消息和输入框样式 | `PI_TOOL_RAILS_DISABLE_USER_FRAME=1` |
| [`adhd-mode.ts`](extensions/adhd-mode.ts) | 注入 ADHD 响应规则，并提供会话持久化开关 | `/adhd` |
| [`matugen-chrome.ts`](extensions/matugen-chrome.ts) | 绘制主题化 footer 和 working indicator，显示模型、Git、上下文和 token 状态 | `/matugen-chrome` |

每个 package 目录都包含独立的配置和开发说明。常用检查命令：

```bash
cd extensions/pi-brand-header
npm install
npm run typecheck
npm pack --dry-run
```

## 技能

技能按支持的工作类型分组：

| 类别 | 示例 |
| --- | --- |
| 写作与交互 | `humanizer`、`humanizer-zh`、`i-have-adhd`、`academic-paper` |
| 科研与可视化 | `scientific-visualization`、`sa.sympy`、`air.academic-plotting`、`mineru` |
| 文献与研究 | `sa.citation-management`、`air.research-manager`、`nature-skills`、`deep-research` |
| 文件处理 | `mineru-file-processing`、`pubmed-database`、`literature-search-openalex` |
| Agent 与编码指导 | `karpathy-guidelines`、`agents-progressive-disclosure`、`workflow-skill-creator` |

按目录名调用可发现技能：

```text
/skill:humanizer
/skill:scientific-visualization
/skill:mineru-file-processing
```

部分集合只有参考资料，没有顶层 `SKILL.md`，因此 pi 不会将其注册为 slash command；其中的文件仍可手动引用。

## 外部 package

[`config/external-packages.txt`](config/external-packages.txt) 是第三方 npm 与 Git 扩展的可编辑安装清单，覆盖以下能力：

- 文件搜索、`agent-browser` 自动化、预览和外部目录加载
- 计划、目标、Todo、结构化提问与 subagent
- 哈希锚点编辑、输出压缩、缓存与研究工作流
- 敏感文件保护、主题、footer 状态、token 速度和 raw paste

package 凭据和各 package 自己维护的设置保留在目标机器上。

## 敏感数据保护

`pi-sensitive-guard` 已加入外部 package 清单，需要 Node.js 22 或更高版本。Pi 加载扩展后会自动启用。

默认策略会阻止涉及 `.env`、私钥、凭据文件和已识别密钥模式的读取与写入，同时检查 Git commit 和 push diff。通过 TUI 菜单可查看策略，或开启读取结果与 shell 输出脱敏：

```text
/sensitive-guard
/sensitive-guard status
```

除非正在排查扩展问题，否则保持 debug 日志关闭。该扩展用于降低意外泄露风险；提交前仍需人工检查仓库并运行下方扫描命令。

## 更新备份

```bash
cd ~/.pi_config
git pull --ff-only
git status
```

将变更复制到 `~/.pi/agent/` 前先查看差异，使仓库更新与正在使用的本机状态保持独立。

## 安全边界

本仓库按可公开发布的边界设计。[`.gitignore`](.gitignore) 会排除凭据、模型与认证注册表、会话、缓存、数据库、日志、依赖目录、生成素材、备份和环境文件。

提交前运行：

```bash
git status
git diff --check
git grep -n -I -i -E 'BEGIN (RSA|OPENSSH|PRIVATE)|api[_-]?key|token|secret|password|/home/'
```

provider、模型注册表、API key 和环境变量需要在每台目标机器上单独配置。禁止提交真实凭据。
