# pi 配置备份与恢复

这个仓库保存可复用的 pi extensions、skills 和不含隐私的配置片段。它**不包含** API key、token、密码、私钥、模型注册表、会话记录或本机运行状态。

## 快速恢复

在一台新机器上执行：

```bash
git clone https://github.com/lychen2/pi_config.git ~/.pi_config
cd ~/.pi_config

# 先备份当前 pi 配置，避免覆盖现有内容
backup="$HOME/.pi-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
cp -a "$HOME/.pi/agent" "$backup/agent" 2>/dev/null || true

# 恢复 skills 和无敏感配置
mkdir -p "$HOME/.pi/agent/skills" "$HOME/.pi/agent"
rsync -a skills/ "$HOME/.pi/agent/skills/"
cp config/slim-skills-whitelist.json "$HOME/.pi/agent/slim-skills-whitelist.json"
cp config/deferred-tools.json "$HOME/.pi/agent/deferred-tools.json"

# 从本地源码安装仓库内的扩展
for dir in extensions/pi-*/; do
  [ -f "$dir/package.json" ] && pi install "$(realpath "$dir")"
done

# 恢复 npm/Git 扩展
while IFS= read -r package; do
  case "$package" in
    ""|\#*) continue ;;
    *) pi install "$package" ;;
  esac
done < config/external-packages.txt
echo "恢复完成。重新启动 pi 后检查：pi list"
```

`matugen-chrome.ts` 是单文件扩展。若希望它每次启动都自动加载，请将它复制到 pi 的 extensions 目录：

```bash
mkdir -p "$HOME/.pi/agent/extensions"
cp extensions/matugen-chrome.ts "$HOME/.pi/agent/extensions/"
```

## Extensions

扩展位于 `extensions/`。带有 `package.json` 的目录可以通过 `pi install` 安装；安装后由 pi 写入自己的扩展设置。

### 可安装扩展

| 扩展 | 作用 | 常用命令/配置 |
| --- | --- | --- |
| `pi-brand-header` | 在 TUI 启动区域显示模型、思考级别、工作目录、主题、技能数和工具数；窄终端会自动切换为堆叠布局。 | `/logo` 显示或隐藏 header。 |
| `pi-manager-models` | 从 OpenAI-compatible provider 的 `/models` 接口刷新模型目录，同时保留 `models.json` 中的模型覆盖项。 | 配置 `baseUrl`；可用 `PI_MANAGER_MODELS_PROVIDER` 和 `PI_MANAGER_MODELS_CONFIG` 指定 provider/配置路径。需要用户自己配置 provider 凭据。 |
| `pi-slim-skills` | 压缩模型可见的技能索引，降低 prompt 占用；技能仍可通过 `/skill:<name>` 调用。 | `/slim-skills`、`/slim-skills remove <name>`、`/slim-skills none`、`/slim-skills reset`；可设置 `SLIM_SKILLS_DISABLE=1` 临时关闭。 |
| `pi-todo-guard` | 一次运行结束时，如果 Todo 中仍有 `pending` 或 `in_progress` 任务，提醒继续处理。 | 可用 `PI_TODO_GUARD_TOOL` 更换工具名，或 `PI_TODO_GUARD_DISABLE=1` 关闭。 |
| `pi-tool-rails` | 为 TUI 提供工具标签、结果背景、shell/search 摘要、prompt 框和用户消息框；保留原生工具执行逻辑。 | 设置 `PI_TOOL_RAILS_DISABLE_USER_FRAME=1` 仅关闭用户消息框。 |

### 独立扩展

- `matugen-chrome.ts`：使用当前主题颜色重绘 footer 和 working indicator，显示模型、思考级别、Git 分支、上下文占用和 token 统计。复制到 `~/.pi/agent/extensions/` 后会被自动发现。命令 `/matugen-chrome` 可切换开关。

### 安装、检查和卸载

```bash
# 从仓库目录安装一个扩展
pi install "$(realpath extensions/pi-brand-header)"

# 查看已安装扩展
pi list

# 删除一个已安装的扩展
pi remove "$(realpath extensions/pi-brand-header)"
```

每个扩展目录的 README 还包含开发命令。开发或修改扩展时，可在对应目录执行：

```bash
npm install
npm run typecheck
npm pack --dry-run
```
## 外部 npm/Git Extensions

除了仓库内的自定义扩展，原 pi 配置还安装了外部 package。完整、可编辑的安装清单位于 [`config/external-packages.txt`](config/external-packages.txt)。它只记录包名和版本，不包含 npm/Git 凭据。

| 类别 | Package | 用途 |
| --- | --- | --- |
| TUI 与显示 | `pi-markdown-preview`、`@victor-software-house/pi-curated-themes`、`@monotykamary/pi-tps`、`pi-cometix-footer` | Markdown 预览、主题、TUI 状态和 footer。 |
| 工具与搜索 | `@ff-labs/pi-fff`、`pi-agent-browser-native`、`pi-add-dir`、`@tmustier/pi-raw-paste` | 文件/搜索增强、浏览器、添加目录和原始粘贴。 |
| 计划与任务 | `@narumitw/pi-plan-mode`、`@narumitw/pi-goal`、`@juicesharp/rpiv-todo`、`@narumitw/pi-subagents` | 计划、目标、Todo 和子 agent 工作流。 |
| 交互辅助 | `@juicesharp/rpiv-ask-user-question`、`@narumitw/pi-btw`、`pi-slopchop` | 结构化提问、补充信息和输出整理。 |
| 性能与上下文 | `pi-hashline-edit-pro`、`pi-rtk-optimizer`、`pi-cache-optimizer` | 哈希行编辑、工具结果压缩和缓存优化。 |
| 研究与其他 | `pi-autoresearch` | 实验初始化、运行和记录。 |

### 批量安装外部 package

恢复到新机器并完成基础恢复后，在仓库根目录执行：

```bash
while IFS= read -r package; do
  case "$package" in
    ""|\#*) continue ;;
    *) pi install "$package" ;;
  esac
done < config/external-packages.txt
```

这会从 npm 或 GitHub 重新下载外部扩展。安装前可以编辑 `config/external-packages.txt` 删除不需要的包。包的实际配置仍由 pi 写入自己的 settings；如果某个包需要 API key 或环境变量，请只在目标机器单独配置。

原配置中的两个本地引用没有放入清单的可执行部分：`../../Projects/pi-deferred-tools` 和 `../../pi-translate-submit`。它们依赖原机器上的本地源码；需要时先恢复对应项目，再分别执行 `pi install /absolute/path/to/project`。

### 外部 package 的检查和卸载

```bash
# 查看已安装扩展，包括 npm/Git package
pi list

# 卸载一个外部 package
pi remove npm:pi-markdown-preview@0.10.0

# 更新已安装 package
pi update
```

## Skills

技能位于 `skills/`，pi 默认会扫描 `~/.pi/agent/skills/`。恢复后，先重启 pi，再按技能名称调用：

```text
/skill:humanizer
/skill:scientific-visualization
/skill:mineru-file-processing
```

技能的调用名通常是目录名，不是 README 标题。可以在 pi 中用 `/skill:<name>` 直接调用，也可以在提示中描述任务，让 pi 根据技能说明自动选择。

### 写作与交互

| 技能 | 用途 | 使用方法 |
| --- | --- | --- |
| `humanizer` | 删除英文 AI 写作痕迹，保留原意并匹配目标语气。 | `/skill:humanizer`，随后粘贴或引用需要润色的文本。 |
| `humanizer-zh` | 去除中文文本的 AI 写作痕迹，减少宣传腔、模板化连接词和不自然排比。 | `/skill:humanizer-zh`。 |
| `i-have-adhd` | 将输出组织成可执行的小步骤，先给下一步动作，减少上下文负担。 | `/skill:i-have-adhd` 开启；输入 `stop adhd mode` 或 `normal mode` 关闭。 |
| `paper-polish-workflow-skill` | 论文润色、反 AI 写作痕迹和双语写作的参考资料集合。 | 当前快照没有顶层 `SKILL.md`，不会自动注册为 `/skill:`；按其中 references 手动引用。 |
| `posterskill` | 海报制作相关的参考目录和占位结构。 | 当前快照没有可自动发现的顶层 `SKILL.md`，不能直接作为 `/skill:posterskill` 使用。 |

### 科学计算与可视化

| 技能 | 用途 | 使用方法 |
| --- | --- | --- |
| `scientific-visualization` | 科研绘图、配色、期刊规范、Matplotlib 示例和图形导出。 | `/skill:scientific-visualization`；适合先确定图表规范，再编写绘图代码。 |
| `sa.matplotlib` | Matplotlib 图表类型、样式和常见问题参考，以及绘图脚本。 | 当前快照只有 references/scripts，没有顶层 `SKILL.md`；作为参考资料使用。 |
| `sa.sympy` | SymPy 符号计算、矩阵、物理和代码生成参考。 | `/skill:sa.sympy`。 |
| `air.academic-plotting` | 为 ML/AI 论文生成架构图、流程图和数据图；数值坐标图使用 Matplotlib，框图/箭头图使用 Gemini 流程。 | `/skill:air.academic-plotting`；使用 Gemini 图像流程时，在目标机器通过环境变量配置 `GEMINI_API_KEY`，不要写入文件。 |
| `sa.pptx` | PowerPoint 生成和编辑脚本、Office schema 与参考文档。 | 当前 `SKILL.md` 为禁用文件，不会自动发现；需手动使用 `scripts/` 和参考文档。 |

### 文献与研究

| 技能 | 用途 | 使用方法 |
| --- | --- | --- |
| `sa.citation-management` | DOI、PubMed/Scholar 检索、BibTeX 转换、去重、格式化和引用验证。 | `/skill:sa.citation-management`；运行脚本前检查其依赖和网络要求。 |
| `air.research-manager` | 在任务结束后记录研究决策、实验、死路、主张和 provenance 到 `ara/`。 | `/skill:air.research-manager` 只在任务完成后调用，不要在执行任务中间调用。 |
| `nature-skills` | Nature 风格科研工作流集合，包含文献、统计、写作、审稿、图表、实验记录、论文转 PPT 等子技能。 | 使用具体子技能，例如 `/skill:nature-literature-pipeline`、`/skill:nature-statistics`、`/skill:nature-writing`。 |

`nature-skills` 当前包含这些主要子技能：`nature-academic-search`、`nature-citation`、`nature-data`、`nature-downloader`、`nature-experiment-log`、`nature-figure`、`nature-literature-pipeline`、`nature-paper2ppt`、`nature-paper-to-patent`、`nature-polishing`、`nature-proposal-writer`、`nature-reader`、`nature-ref-verifier`、`nature-response`、`nature-reviewer`、`nature-statistics`、`nature-writing`。

### 文件处理

| 技能 | 用途 | 使用方法 |
| --- | --- | --- |
| `mineru-file-processing` | 处理 PDF、图片、Word、PowerPoint、Excel 等文件，提取 Markdown、OCR、结构、表格、公式或可供 agent 阅读的文本。 | `/skill:mineru-file-processing`；根据文件类型和大小按本地 MinerU 配置执行。 |

### Claude Science 技能集合

`claude-science` 是一组生物信息学、科研计算和模型端点技能。需要按具体子技能调用，不要把集合目录名当成单个技能：

- 科研与图形：`algorithmic-art`、`figure-composer`、`figure-style`、`literature-review`、`paper-narrative`、`pdf-explore`。
- 计算环境与远程执行：`compute-env-setup`、`remote-compute-modal`、`remote-compute-ssh`。
- 模型端点：`managed-model-endpoints`、`using-model-endpoint`。这些技能可能需要 `BASE_URL`、`INFER_API_KEY`、云服务凭据或远程环境；凭据必须在目标机器单独配置。
- 生物信息学模型：`alphafold2`、`boltz`、`borzoi`、`chai1`、`diffdock`、`esmfold2`、`evo2`、`fair-esm2`、`ligandmpnn`、`openfold3`、`proteinmpnn`、`scgpt`、`scvi-tools`、`solublempnn`。部分子技能在当前快照中处于禁用状态。
- 其他：`customize`、`learn`、`product-self-knowledge`、`self-awareness`。

示例：

```text
/skill:figure-style
/skill:literature-review
/skill:remote-compute-ssh
```

### 其他技能

- `andrej-karpathy-skills/karpathy-guidelines`：Karpathy 风格的编码和 agent 工作原则，调用 `/skill:karpathy-guidelines`。

## 配置片段

`config/` 中的文件可以直接复制：

```bash
cp config/slim-skills-whitelist.json "$HOME/.pi/agent/slim-skills-whitelist.json"
cp config/deferred-tools.json "$HOME/.pi/agent/deferred-tools.json"
```

- `slim-skills-whitelist.json`：`pi-slim-skills` 的 allowlist 示例。
- `deferred-tools.json`：browser、subagent 和 research 工具组的延迟加载定义。

## 分步恢复

只恢复 skills：

```bash
mkdir -p "$HOME/.pi/agent/skills"
rsync -a skills/ "$HOME/.pi/agent/skills/"
```

只恢复扩展：

```bash
for dir in extensions/pi-*/; do
  [ -f "$dir/package.json" ] && pi install "$(realpath "$dir")"
done
mkdir -p "$HOME/.pi/agent/extensions"
cp extensions/matugen-chrome.ts "$HOME/.pi/agent/extensions/"
```

## 恢复模型和密钥

本仓库不会恢复 `models.json`、`auth.json` 或其他凭据。恢复后需要在目标机器上单独配置 provider 和环境变量：

```bash
pi
```

然后按当前环境重新配置模型和 API key。不要把包含真实 key 的文件提交到 Git。

## 更新备份

以后在原机器上更新仓库内容：

```bash
cd ~/.pi_config
git pull --ff-only
```

## 隐私边界

仓库不会跟踪 credentials、provider/model registry、auth 文件、sessions、cache、backups、subagent 状态、本机路径、依赖目录、生成素材或本机符号链接。提交新内容前检查：

```bash
git status
git diff --check
git grep -n -I -i -E 'BEGIN (RSA|OPENSSH|PRIVATE)|api[_-]?key|token|secret|password|/home/'
```

## 仓库内容

- `extensions/`：自定义扩展源码和 package metadata
- `skills/`：技能源码与文档，已排除缓存、大型生成素材和本机符号链接
- `config/`：不含 provider、API key、本机路径和会话状态的配置片段
- `.gitignore`：阻止凭据和运行时隐私数据进入仓库
