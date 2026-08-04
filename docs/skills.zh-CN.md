# Skill 目录与使用示例

本页给出当前有效 skill 的完整目录和可直接复制的请求示例。Skill 是按需加载的工作流说明，不是常驻工具；先输入 `/skill:<名称>`，再给出目标、输入文件和验收条件。

## 统计口径

当前有效目录包含 **58 个 skill 定义**：

- 仓库中有 57 个文件名严格为 `SKILL.md` 的定义，对应 56 个唯一名称。
- `skills/mineru/SKILL.md` 与 `skills/mineru/skills/mineru/SKILL.md` 都叫 `mineru`，所以同名定义计两项。
- 本机现有的 `batch-grill-me` 由 slim-skills allowlist 保留，但不属于本仓库文件；安装器不会覆盖它。它是第 58 项有效定义。
- 这意味着目录是 58 个定义、57 个唯一名称，不应把它写成“仓库里有 58 个独立目录”。

默认发现索引只保留以下 7 个轻量入口；`i-have-adhd` 由配置单独注入：

```text
figure-style
humanizer
humanizer-zh
batch-grill-me
mineru
mineru-file-processing
scientific-visualization
```

其他 skill 仍会被同步，但如果 `/skill:` 补全中没有出现，可显式运行 `/slim-skills inject <名称>`，或直接提供对应 `SKILL.md` 路径。技能所需的 Python、浏览器、远程计算、网络服务和凭据必须先在本机配置。

## 编码、设计与技能维护（13）

| Skill | 用途 | 使用示例 |
| --- | --- | --- |
| [`agents-progressive-disclosure`](../skills/agents-progressive-disclosure/SKILL.md) | 拆分过大的 `AGENTS.md`、`CLAUDE.md` 或规则文件 | `/skill:agents-progressive-disclosure`；把 900 行项目规则拆成入口、路由和按需参考文档，保持规则语义不变。 |
| `batch-grill-me`（本机保留） | 对复杂需求进行分轮澄清和设计决策 | `/skill:batch-grill-me`；先确认用户、约束、验收标准和不可接受的方案，再输出实现边界。 |
| [`baoyu-design`](../skills/baoyu-design/SKILL.md) | 生成自包含 HTML 的界面、原型、设计系统和演示稿 | `/skill:baoyu-design`；为研究管理工具做一个可交互 HTML 原型，先问清受众、视觉参考和验收方式。 |
| [`cavecrew`](../skills/cavecrew/SKILL.md) | 使用该技能定义的协作式分工流程 | `/skill:cavecrew`；把资料整理拆成角色分工，每个角色只返回证据和结论。 |
| [`find-skills`](../skills/find-skills/SKILL.md) | 查找适合当前任务的已有 skill | `/skill:find-skills`；查找一个能把论文 PDF 转成带页码证据的 Markdown reader。 |
| [`humanizer`](../skills/humanizer/SKILL.md) | 去除英文文本的 AI 写作痕迹，同时保留事实和术语 | `/skill:humanizer`；润色这封英文 cover letter，使语气自然但不要改变数字、引用和承诺。 |
| [`humanizer-zh`](../skills/humanizer-zh/SKILL.md) | 去除中文文本的 AI 写作痕迹 | `/skill:humanizer-zh`；把这段产品说明改成自然、具体、少套话的中文，保留 API 名称。 |
| [`i-have-adhd`](../skills/i-have-adhd/SKILL.md) | 将输出组织成可立即执行的短步骤 | `/skill:i-have-adhd`；以后每轮先给下一步，长任务使用编号，并在结尾只保留一个具体动作。配置也支持 `/adhd`。 |
| [`impeccable`](../skills/impeccable/SKILL.md) | 评估和改进前端界面、交互与 UX 文案 | `/skill:impeccable`；检查这个 dashboard 的层级、间距、可读性和移动端溢出，并直接修改后截图验证。 |
| [`make-poster`](../skills/posterskill/.claude/skills/make-poster/SKILL.md) | 从论文和项目网站生成可打印 HTML 学术海报 | `/skill:make-poster`；读取 `overleaf/main.tex` 和 `references/` 中的海报，按指定尺寸生成 `poster/index.html`。该隐藏目录不一定被 Pi 自动发现。 |
| [`scienceskillscommon`](../skills/scienceskillscommon/SKILL.md) | Science Skills 共用的 Python 客户端和基础规则 | 作为科学 skill 的依赖使用；例如加载 `nature-academic-search` 时让它复用统一的请求、重试和限流规则，不把它当成独立写作流程。 |
| [`uv`](../skills/uv/SKILL.md) | 检查、安装和配置 Python 的 `uv` 工作流 | `/skill:uv`；检查当前项目是否有 uv，为脚本建立隔离环境，并给出可复现的运行命令。 |
| [`workflow-skill-creator`](../skills/workflow-skill-creator/SKILL.md) | 把完成过的工作流程整理成可复用 Agent Skill | `/skill:workflow-skill-creator`；根据本次 PDF 审阅流程生成新的 `SKILL.md`，包含触发条件、步骤、失败路径和验收。 |

## 论文、文献、数学和文件处理（13）

| Skill | 用途 | 使用示例 |
| --- | --- | --- |
| [`academic-paper`](../skills/academic-paper/SKILL.md) | 以多代理流程规划、起草、修订和检查学术论文 | `/skill:academic-paper`；根据给定 claims、结果和参考文献先建立论证结构，再起草方法和结果，最后运行引文一致性检查。 |
| [`academic-paper-reviewer`](../skills/academic-paper-reviewer/SKILL.md) | 从多个评审角色审阅论文并综合编辑决定 | `/skill:academic-paper-reviewer`；审阅这篇稿件，分别检查新颖性、方法、统计、写作和引用，按严重程度给出可执行意见。 |
| [`academic-plotting`](../skills/air.academic-plotting/SKILL.md) | 根据论文语境选择图型并生成论文图或架构图 | `/skill:academic-plotting`；读取实验结果 CSV 和方法段，选择图型，生成一张带图注草稿的论文图。 |
| [`ara-research-manager`](../skills/air.research-manager/SKILL.md) | 在会话结束时记录决策、证据、实验和死路 | `/skill:ara-research-manager`；只在任务收尾时扫描本次会话，把关键决定和证据来源写入 `ara/`，不要在执行中调用。 |
| [`citation-management`](../skills/sa.citation-management/SKILL.md) | 搜索文献、提取元数据、校验引用并生成 BibTeX | `/skill:citation-management`；核对这些 DOI 的作者、年份和期刊信息，输出经过验证的 APA7 BibTeX。 |
| [`deep-research`](../skills/deep-research/SKILL.md) | 进行多来源、带证据和风险控制的深度研究 | `/skill:deep-research`；研究某技术的近五年进展，只使用可追溯来源，标注冲突证据和结论置信度。 |
| [`literature-search-openalex`](../skills/literature-search-openalex/SKILL.md) | 通过 OpenAlex 检索论文、作者和引用关系 | `/skill:literature-search-openalex`；按主题、年份和领域筛选 OpenAlex 论文，输出 DOI、引用数和候选阅读顺序。 |
| [`mineru`](../skills/mineru/SKILL.md)（根定义） | 使用 MinerU 解析 PDF、Office、图片、表格和公式 | `/skill:mineru`；解析 `paper.pdf`，输出带表格、公式和页码的 Markdown；大文件先说明 token 和页数限制。 |
| [`mineru`](../skills/mineru/skills/mineru/SKILL.md)（嵌套定义） | 同名 MinerU 打包定义，功能入口相近 | 需要稳定命中时使用 `/skill:mineru-file-processing`；不要依赖两个同名 `mineru` 的发现顺序。 |
| [`mineru-file-processing`](../skills/mineru-file-processing/SKILL.md) | 将 PDF、Office、图片和 OCR 任务路由到适当解析流程 | `/skill:mineru-file-processing`；读取这个扫描 PDF，提取正文、表格、公式和页码证据，并说明是否需要 OCR。 |
| [`pubmed-database`](../skills/pubmed-database/SKILL.md) | 检索 PubMed/PMC 生物医学文献和数据库关联 | `/skill:pubmed-database`；检索过去五年关于某疾病的随机对照试验，返回 PMID、DOI 和纳入理由。 |
| [`scientific-visualization`](../skills/scientific-visualization/SKILL.md) | 生成可投稿的 matplotlib、seaborn 或 plotly 科学图 | `/skill:scientific-visualization`；用现有数据做一张色盲友好多面板图，包含误差线、显著性标记，并导出 PDF/TIFF。 |
| [`sympy`](../skills/sa.sympy/SKILL.md) | 做精确符号代数、微积分、方程求解和 LaTeX 生成 | `/skill:sympy`；用 SymPy 推导这个方程的闭式解，并用代入检查结果，不要用浮点近似替代符号推导。 |

## Claude Science 工作流（15）

这些 skill 多数依赖其自身的 Python 环境、connector 或远程服务。未配置运行环境时只要求它检查前置条件，不要假设远程作业已经执行。

| Skill | 用途 | 使用示例 |
| --- | --- | --- |
| [`algorithmic-art`](../skills/claude-science/algorithmic-art/SKILL.md) | 用 p5.js 和可复现随机种子生成算法艺术 | `/skill:algorithmic-art`；用固定 seed 生成一个可调参数的 flow-field 粒子作品，并输出独立 HTML。 |
| [`compute-env-setup`](../skills/claude-science/compute-env-setup/SKILL.md) | 配置 SSH、Slurm、容器、Modal、GCP 或 RunPod 计算环境 | `/skill:compute-env-setup`；为一个需要 CUDA 的任务配置 Slurm provider、权重缓存和幂等启动脚本，先列出缺失依赖。 |
| [`customize`](../skills/claude-science/customize/SKILL.md) | 创建 agent profile、维护 skill 和 connector 配置 | `/skill:customize`；创建一个只读文献分析 profile，说明它可用的 skill、connector 和工具边界。 |
| [`figure-composer`](../skills/claude-science/figure-composer/SKILL.md) | 将多个 panel 组合成一张论文级图并做复核 | `/skill:figure-composer`；根据一条核心 claim 和多个数据文件规划 12 列布局、逐 panel 绘图、拼图并进行对抗式 QA。 |
| [`figure-style`](../skills/claude-science/figure-style/SKILL.md) | 执行科研图可读性、数据忠实性和投稿样式检查 | `/skill:figure-style`；绘图前加载规则，检查标题是否与数据一致、字体和 bbox 是否可读，再渲染后复核。 |
| [`learn`](../skills/claude-science/learn/SKILL.md) | 用教学流程解释概念和原理 | `/skill:learn`；教我理解 transformer 的 attention，从直觉、公式、最小例子到练习逐步推进。 |
| [`literature-review`](../skills/claude-science/literature-review/SKILL.md) | 查找、核验和综合科学文献 | `/skill:literature-review`；围绕一个研究问题检索多来源论文，排除撤稿和不可核验引用，按证据强度写综合结论。 |
| [`managed-model-endpoints`](../skills/claude-science/managed-model-endpoints/SKILL.md) | 注册由 managed family 管理的本地或远程模型服务 | `/skill:managed-model-endpoints`；注册一个本地推理服务，设计可重复的启动/停止脚本，并先检查端口和模型权重。 |
| [`paper-narrative`](../skills/claude-science/paper-narrative/SKILL.md) | 根据整篇论文和 figure deck 重构图表叙事 | `/skill:paper-narrative`；读取摘要、正文和全部图，判断 Fig. 1 是否能形成 hook，并给出 hook→mechanism→evidence→application 的调整建议。 |
| [`pdf-explore`](../skills/claude-science/pdf-explore/SKILL.md) | 跨 PDF 多处检索、比较、读取图表和附录 | `/skill:pdf-explore`；在这份 PDF 中找出所有 benchmark、数据集和图表数值，保留页码和原文锚点。 |
| [`product-self-knowledge`](../skills/claude-science/product-self-knowledge/SKILL.md) | 回答 Anthropic 产品事实前先核验产品知识 | `/skill:product-self-knowledge`；回答 Claude API 的 batch、流式和限流问题前，先列出需要核验的官方事实。 |
| [`remote-compute-modal`](../skills/claude-science/remote-compute-modal/SKILL.md) | 将已准备的 GPU 任务提交到用户的 Modal 账户 | `/skill:remote-compute-modal`；环境已确认后创建 Modal compute，提交任务，等待通知并收集结果，不要跳过审批。 |
| [`remote-compute-ssh`](../skills/claude-science/remote-compute-ssh/SKILL.md) | 在 SSH/SLURM 主机执行提交、等待和收集流程 | `/skill:remote-compute-ssh`；把训练任务提交到指定 Slurm 队列，等待完成通知，再收集日志和输出文件。 |
| [`self-awareness`](../skills/claude-science/self-awareness/SKILL.md) | 查询 Claude Science 会话数据库、token、成本和产物记录 | `/skill:self-awareness`；查询本次会话的 token、费用、工具调用和已写入文件，并说明查询字段来源。 |
| [`using-model-endpoint`](../skills/claude-science/using-model-endpoint/SKILL.md) | 调用已经注册的模型 endpoint 做推理 | `/skill:using-model-endpoint`；使用已注册的 endpoint 对这批输入做预测，返回请求参数、响应状态和输出文件位置。 |

## Nature 论文工作流（17）

| Skill | 用途 | 使用示例 |
| --- | --- | --- |
| [`nature-academic-search`](../skills/nature-skills/skills/nature-academic-search/SKILL.md) | 多源学术检索、候选筛选和引文核验 | `/skill:nature-academic-search`；围绕研究问题检索多个数据库，去重候选文献，输出可核验 DOI 和纳入理由。 |
| [`nature-citation`](../skills/nature-skills/skills/nature-citation/SKILL.md) | 为长段落逐句匹配严格的 Nature/CNS 引用 | `/skill:nature-citation`；给这段 Results 文本逐个可证实主张添加引用，不能用一篇综述覆盖所有句子。 |
| [`nature-data`](../skills/nature-skills/skills/nature-data/SKILL.md) | 起草和审计 Data Availability、数据仓库与 FAIR 说明 | `/skill:nature-data`；根据现有数据、代码和仓库链接写 Data Availability 声明，并列出缺失的 accession。 |
| [`nature-downloader`](../skills/nature-skills/skills/nature-downloader/SKILL.md) | 通过开放或机构授权渠道下载合法全文和补充材料 | `/skill:nature-downloader`；使用已登录的机构会话下载 DOI 对应全文和 supporting information，遇到权限失败先报告原因。 |
| [`nature-experiment-log`](../skills/nature-skills/skills/nature-experiment-log/SKILL.md) | 将原始图、语音或文字整理为 Obsidian 实验日志 | `/skill:nature-experiment-log`；把今天的实验记录整理成带 YAML frontmatter 的日志，保留原始文件链接、参数和结果。 |
| [`nature-figure`](../skills/nature-skills/skills/nature-figure/SKILL.md) | 制作、审计和导出 Nature 风格科研图 | `/skill:nature-figure`；根据数据和一个明确结论制作多面板图，检查标签、图例、分辨率和 SVG/PDF/TIFF 输出。 |
| [`nature-literature-pipeline`](../skills/nature-skills/skills/nature-literature-pipeline/SKILL.md) | 执行检索、六维评分、精读、交付和归档的文献流水线 | `/skill:nature-literature-pipeline`；从研究问题开始，完成候选发现、评分、精读和带格式引用的归档报告。 |
| [`nature-paper-to-patent`](../skills/nature-skills/skills/nature-paper-to-patent/SKILL.md) | 将论文或技术报告转成有证据链的中文发明专利草案 | `/skill:nature-paper-to-patent`；从论文提取可专利技术特征，逐项映射原文证据，生成权利要求、流程图和支持性审计。 |
| [`nature-paper2ppt`](../skills/nature-skills/skills/nature-paper2ppt/SKILL.md) | 将论文制作成 Nature 风格中文 PPTX | `/skill:nature-paper2ppt`；把这篇论文做成组会 PPT，按证据重建故事，挑选关键图，并为每页生成 speaker notes。 |
| [`nature-polishing`](../skills/nature-skills/skills/nature-polishing/SKILL.md) | 以 Nature 取向润色、重构或翻译学术英文及 LaTeX 排版 | `/skill:nature-polishing`；润色这段 Discussion，保留统计数字和引用，减少空泛过渡，并修复 LaTeX 排版问题。 |
| [`researchwrite`](../skills/nature-skills/skills/nature-proposal-writer/SKILL.md) | 以证据、论证地图和 section contract 为核心写 proposal | `/skill:researchwrite`；先建立研究问题、证据表和论证地图，再按 compose/revise/hybrid 模式生成 proposal。 |
| [`nature-reader`](../skills/nature-skills/skills/nature-reader/SKILL.md) | 生成中英对照、图表就位、带来源锚点的全文 reader | `/skill:nature-reader`；读取这篇 PDF，生成中英对照 Markdown，把图表放在相关段落附近，并为每个区块保留来源锚点。 |
| [`nature-ref-verifier`](../skills/nature-skills/skills/nature-ref-verifier/SKILL.md) | 多源逐字段核验参考文献真实性和一致性 | `/skill:nature-ref-verifier`；逐条检查作者、题目、年份、卷期、页码和 DOI，标出冲突字段，不要猜缺失信息。 |
| [`nature-response`](../skills/nature-skills/skills/nature-response/SKILL.md) | 起草、审计和修订审稿回复与返修信 | `/skill:nature-response`；根据 reviewer comments 和修订证据写逐点回复，区分已修改、无法修改和新增实验。 |
| [`nature-reviewer`](../skills/nature-skills/skills/nature-reviewer/SKILL.md) | 模拟 Nature 风格审稿并给出编辑建议 | `/skill:nature-reviewer`；从审稿人角度评估主张、方法、统计、图表和可重复性，最后给出 major/minor decision。 |
| [`nature-statistics`](../skills/nature-skills/skills/nature-statistics/SKILL.md) | 审计统计设计、报告、图例和显著性表述 | `/skill:nature-statistics`；检查样本量、重复、随机化、盲法、多重比较、置信区间和图例中的统计信息。 |
| [`nature-writing`](../skills/nature-skills/skills/nature-writing/SKILL.md) | 从 claims、结果、图表或中文草稿起草 Nature 风格段落 | `/skill:nature-writing`；根据结果和图注重写 Introduction 与 Results，先建立段落目的和论证顺序，再写正文。 |

## 组合示例

| 目标 | 推荐顺序 |
| --- | --- |
| PDF 论文阅读并核对引用 | `pdf-explore` → `nature-reader` → `nature-ref-verifier` |
| 实验数据制作投稿级多面板图 | `figure-style` → `scientific-visualization` → `figure-composer` |
| 论文写作后模拟评审并回复 | `academic-paper` → `academic-paper-reviewer` → `nature-response` |
| 复杂需求先澄清再实现 | `batch-grill-me` → 普通编码工具 → `todo`/`todowrite` |
| 论文转专利或汇报 | `nature-reader` → `nature-paper-to-patent` 或 `nature-paper2ppt` |

同名 `mineru` 的发现顺序不稳定；PDF、Office、OCR 和表格任务优先使用 `mineru-file-processing`。技能不会替代工具：需要读取文件、联网、执行脚本或验证输出时，仍要在请求中写清输入、权限和验收命令。
