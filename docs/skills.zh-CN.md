# 技能目录

技能是按需加载的工作流说明，不是常驻插件。Pi 启动时只读取技能名称和描述；模型判断任务匹配后可自行读取完整 `SKILL.md`。需要确定使用时，直接输入 `/skill:<名称>`。

回到 [快速上手](WIKI.zh-CN.md)。

## 使用规则

1. 任务没有明确专业流程时，直接描述目标即可，模型会选择工具。
2. 任务有严格步骤、外部服务或质量标准时，用 `/skill:<名称>` 强制载入。
3. 同一任务只加载必要的技能。多个重型科研技能同时注入会增加上下文并互相干扰。
4. 技能中的外部命令、凭据和网络要求需要先在本机满足；技能不会替你保存 token。
5. `/slim-skills inject <名称>` 会让一个技能每轮都注入提示词，仅适合长期固定规则，例如 `i-have-adhd`。完成后使用 `uninject`。

## 本配置的技能来源

安装器将仓库 `skills/` 复制到 `~/.pi/agent/skills/`。Pi 还会扫描 `~/.agents/skills/`、项目 `.pi/skills/` 与 `.agents/skills/`；这些本机或项目资源不一定属于本仓库，也不会被此安装器备份。

> `mineru` 在仓库中有两个同名定义。Pi 对同名技能只保留先发现的一个，因此需要稳定 PDF/文档处理流程时使用 `/skill:mineru-file-processing`，避免依赖同名 `mineru` 的发现顺序。

## 编码、设计与工作流

| 技能 | 何时调用 | 用法 |
| --- | --- | --- |
| `agents-progressive-disclosure` | `AGENTS.md`、`CLAUDE.md` 或规则文件过大 | `/skill:agents-progressive-disclosure`，拆成路由入口和按需参考文档 |
| `karpathy-guidelines` | 编写、重构或审阅代码 | `/skill:karpathy-guidelines`，强调小范围修改、验证和明确假设 |
| `workflow-skill-creator` | 新建或维护 Agent Skill | `/skill:workflow-skill-creator` |
| `find-skills` | 不确定是否已有适合的技能 | `/skill:find-skills <任务>` |
| `uv` | Python 项目依赖、环境或脚本工作流 | `/skill:uv` |
| `impeccable` | 前端或界面质量改进 | `/skill:impeccable` |
| `baoyu-design` | 设计与视觉交付 | `/skill:baoyu-design` |
| `cavecrew` | 需要该技能定义的协作式工作流 | `/skill:cavecrew` 后按其步骤执行 |
| `i-have-adhd` | 希望输出适合 ADHD 阅读 | `/skill:i-have-adhd`；本配置的 `adhd-mode` 还可用 `/adhd` 跨会话开关 |
| `humanizer` | 润色英文表达 | `/skill:humanizer` |
| `humanizer-zh` | 润色中文表达 | `/skill:humanizer-zh` |
| `scientific-visualization` | 科研数据可视化和图表检查 | `/skill:scientific-visualization` |
| `scienceskillscommon` | 需要科学技能通用规则和术语 | `/skill:scienceskillscommon` |

## 文献、论文与研究管理

| 技能 | 何时调用 | 用法 |
| --- | --- | --- |
| `academic-paper` | 写作、改写或整理学术论文 | `/skill:academic-paper`，按模式选择全文、提纲、修订、摘要或引文检查 |
| `academic-paper-reviewer` | 模拟同行评审或审阅稿件 | `/skill:academic-paper-reviewer` |
| `academic-plotting` | 从实验数据生成论文图表或架构图 | `/skill:academic-plotting` |
| `ara-research-manager` | 在研究或编码会话结束后记录决策与证据来源 | `/skill:ara-research-manager`，只在收尾阶段使用 |
| `deep-research` | 长链路调研与多来源综合 | `/skill:deep-research` |
| `literature-review` | 发现、核验并综合科学文献 | `/skill:literature-review` |
| `literature-search-openalex` | 通过 OpenAlex 搜索文献 | `/skill:literature-search-openalex` |
| `pubmed-database` | 通过 PubMed 检索生物医学文献 | `/skill:pubmed-database` |
| `citation-management` | 管理引用、文献库或引文格式 | `/skill:citation-management` |
| `sympy` | 需要符号推导、代数验证或公式处理 | `/skill:sympy` |
| `mineru-file-processing` | PDF、Office 文档、OCR 或表格提取 | `/skill:mineru-file-processing`；注意其文件大小与批处理限制 |
| `mineru` | 使用 MinerU 的基础文档处理能力 | `/skill:mineru`；同名冲突见上方说明 |

## 图表、论文叙事与 Claude Science

这些技能位于 `skills/claude-science/`。多数依赖其自身运行环境或工具连接器；在本机未配置时，不应假设可直接执行远程算力操作。

| 技能 | 任务 |
| --- | --- |
| `algorithmic-art` | 生成算法艺术或创意视觉内容 |
| `compute-env-setup` | 配置远程计算环境、容器、Slurm 或托管 provider |
| `customize` | 创建或维护自定义 agent profile 与技能 |
| `figure-style` | 任何论文图表的样式、可读性和 QA；多面板图前应先载入 |
| `figure-composer` | 组合多面板、出图并做迭代复核 |
| `paper-narrative` | 评估和重排论文整套图表叙事 |
| `literature-review` | 科学文献发现、核验与综合 |
| `pdf-explore` | 从 PDF 多处抽取、检索和理解内容 |
| `learn` | 使用该集合定义的学习流程 |
| `managed-model-endpoints` | 注册或管理本地和远程模型服务 |
| `using-model-endpoint` | 调用已注册的模型端点 |
| `remote-compute-modal` | 通过 Modal 使用远程计算 |
| `remote-compute-ssh` | 通过 SSH 使用远程计算 |
| `product-self-knowledge` | 回答该产品族的特定事实前进行核验 |
| `self-awareness` | 使用该集合的运行状态和能力边界说明 |

## Nature 论文工作流

这些技能位于 `skills/nature-skills/skills/`，适合研究资料、论文和投稿流程。按任务选择一个入口，不要在没有数据或文献来源时要求其生成结论。

| 技能 | 任务 |
| --- | --- |
| `nature-academic-search` | 学术检索与候选文献发现 |
| `nature-citation` | 引文核验与引用处理 |
| `nature-data` | 数据分析与研究数据处理 |
| `nature-downloader` | 下载论文或研究资料 |
| `nature-experiment-log` | 记录实验过程和结果 |
| `nature-figure` | 论文图表设计与制作 |
| `nature-literature-pipeline` | 端到端文献研究流程 |
| `nature-paper-to-patent` | 从论文整理到专利相关工作 |
| `nature-paper2ppt` | 从论文生成演示文稿 |
| `nature-polishing` | 学术语言润色 |
| `researchwrite` | 研究计划或 proposal 写作 |
| `nature-reader` | 深度阅读论文 |
| `nature-ref-verifier` | 参考文献真实性与一致性核验 |
| `nature-response` | 回复审稿意见或编辑沟通 |
| `nature-reviewer` | 论文审阅与评审报告 |
| `nature-statistics` | 统计设计、分析与报告 |
| `nature-writing` | 论文正文写作与改写 |

## 其他研究交付

| 技能 | 任务 |
| --- | --- |
| `make-poster` | 研究海报或展示材料 |

## 选择示例

| 目标 | 建议技能组合 |
| --- | --- |
| 审阅一篇 PDF 论文并核对引用 | `pdf-explore` -> `literature-review` -> `nature-ref-verifier` |
| 从实验结果生成会议图 | `figure-style` -> `academic-plotting`；多面板时再加 `figure-composer` |
| 写作后接受模拟评审 | `academic-paper` -> `academic-paper-reviewer` -> `nature-response` |
| 将臃肿项目规则拆开 | `agents-progressive-disclosure` -> `workflow-skill-creator` |
| 对现有代码做稳健改动 | `karpathy-guidelines`；需要计划时先 `/plan` |

技能的可见列表可以通过 Pi 启动栏和 `/skill:` 自动补全查看。名称冲突、缺少依赖或不可信项目资源会由 Pi 提示；先解决提示，再依赖技能执行任务。
