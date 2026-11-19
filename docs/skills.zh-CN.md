# Skill 目录与使用示例

本页提供技能使用示例。仓库管理的安装清单以 `scripts/deploy-skills.mjs` 的 `installedSkills` 为准。Skill 是按需加载的工作流说明；使用 `/skill:<名称> <任务>` 时，给出目标、输入文件和验收条件。

UI 任务统一从 `/skill:design-ui <任务>` 进入。入口先读取项目设计系统，再按任务读一份参考：视觉方向、质感规格或动效反馈。界面动效审查也在 `design-ui` 内完成，不再单独加载技能。动效、产品发布片和解说视频使用 `/skill:huashu-motion <任务>`。安装、搜索和验收方式见 [UI design workflow](ui-design-skills.md)。

科研工作统一从 [`research`](../skills/research/SKILL.md) 进入；数据图和示意图使用 [`scientific-visualization`](../skills/scientific-visualization/SKILL.md)。文献、实验、统计、光学和写作方法按任务加载，不再各占一个技能入口。见 [科研工作流](research-skills.md)。

## 统计口径

Pi 会发现 `~/.pi/agent/skills`、`~/.agents/skills`、项目目录和已配置 package 中的技能。活动目录以当前会话的实际发现结果为准；下方示例也包含历史或按需安装的技能。

`config/slim-skills-whitelist.json` 的 `whitelist` 和 `inject` 当前均为空。默认通过 `search_skill_bm25` 搜索候选，再显式加载正文。空白名单保留按需检索能力。

Pi 会递归发现嵌套目录中的 `SKILL.md`；安装器复制完整技能目录。安装后执行 `/reload`，输入 `/skill:` 即可查看技能及简短中文用途，再使用 `/skill:<名称> <任务>`。菜单用途来自各技能 `SKILL.md` 的 `description`。技能所需的 Python、浏览器、远程计算、网络服务和凭据按任务配置。

## 编码、设计与技能维护

| Skill | 用途 | 使用示例 |
| --- | --- | --- |
| [`design-ui`](../skills/design-ui/SKILL.md) | UI 统一入口，先读取项目设计系统，再选方向、写规格或打磨动效 | `/skill:design-ui`；改进设置页，沿用现有 token 和组件，并检查桌面及手机布局。 |
| [`ui-ux-pro-max`](../skills/ui-ux-pro-max/SKILL.md) | 检索本地设计建议或生成设计系统草稿 | `/skill:ui-ux-pro-max`；检索表单键盘焦点建议，按项目规范筛选。 |
| [`huashu-motion`](../skills/huashu-motion/SKILL.md) | 可编辑动效、产品发布片与解说视频 | `/skill:huashu-motion`；用现有产品截图制作 30 秒发布片，在本地预览、批注修改并导出。 |
| [`agents-progressive-disclosure`](../skills/agents-progressive-disclosure/SKILL.md) | 拆分过大的 `AGENTS.md`、`CLAUDE.md` 或规则文件 | `/skill:agents-progressive-disclosure`；把 900 行项目规则拆成入口、路由和按需参考文档，保持规则语义不变。 |
| [`fuck-my-shit-mountain`](../skills/fuck-my-shit-mountain/SKILL.md) | 对代码库进行跨质量维度的证据化审计 | `/skill:fuck-my-shit-mountain`；先选择审计维度、语言、输出格式和范围，再生成结构化报告。 |
| `grill-with-docs`（本机安装） | 在需求边界不清时进行访谈，并随过程维护决策文档 | `/skill:grill-with-docs`；先确认目标、约束、验收标准和不可接受的方案，再确定实现边界。 |
| [`find-skills`](../skills/find-skills/SKILL.md) | 查找适合当前任务的已有 skill | `/skill:find-skills`；查找一个能把论文 PDF 转成带页码证据的 Markdown reader。 |
| [`humanizer-zh`](../skills/humanizer-zh/SKILL.md) | 中英文润色、中文成稿诊断与前后对比，保留事实和作者风格 | `/skill:humanizer-zh`；按作者样本润色中文说明或英文 cover letter；整篇先给诊断，明确要求直接改稿时同轮完成。 |
| [`workflow-skill-creator`](../skills/workflow-skill-creator/SKILL.md) | 把完成过的工作流程整理成可复用 Agent Skill | `/skill:workflow-skill-creator`；根据本次 PDF 审阅流程生成新的 `SKILL.md`，包含触发条件、步骤、失败路径和验收。 |

## 科研、绘图和文件处理

| 入口 | 使用示例 |
| --- | --- |
| [`research`](../skills/research/SKILL.md) | `/skill:research`；根据现有 FDTD 数据选择下一组实验，分析结果并起草论文。也可直接要求检索文献、处理统计问题或修改稿件。 |
| [`scientific-visualization`](../skills/scientific-visualization/SKILL.md) | `/skill:scientific-visualization`；把结果画成多面板 PDF，沿用现有配色与尺寸；或绘制可编辑 SVG 方法流程图。 |
| [`sympy`](../skills/sympy/SKILL.md) | `/skill:sympy`；推导方程的闭式解并代回原式。 |
| [`scientific-slides`](../skills/scientific-slides/SKILL.md) | `/skill:scientific-slides`；根据论文制作组会报告。 |
| [`mineru-file-processing`](../skills/mineru-file-processing/SKILL.md) | `/skill:mineru-file-processing`；从扫描 PDF 提取正文、表格和公式。 |

旧的科研入口不再部署，原安装保存在 `~/.pi/agent/skill-archives/`。需要统计、单位、文献或投稿方法时，直接描述任务即可，由 `research` 加载对应参考。
