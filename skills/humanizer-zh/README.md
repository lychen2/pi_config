# Humanizer-zh

中英文语言编辑、中文成稿诊断和 Markdown 前后对比的统一入口。
当前安装在 `~/.omp/agent/skills/humanizer-zh/`，发行源在
`~/pi_config/skills/humanizer-zh/`，Pi 副本保持相同资源。

## 使用

- “用 humanizer-zh 直接润色这段文字，保留我的语气。”
- “检查这篇文章的套话和重复，先给诊断与具体改法。”
- “按这份风格样本直接改稿，并给前后对照。”
- “润色英文说明，保留全部数值、术语和引用。”

短文直接润色默认只交最终稿。整篇成稿清理默认先给诊断，接受方案后再改；
明确要求直接改稿时同轮完成，不额外确认。作者风格参考优先于通用偏好，
不添加数据、经历或观点，不为节奏强改句长，不清空破折号。

非虚构长文新写和大幅扩写先判断材料能否支撑论证。可由已有材料展开的定义、
推导和机制直接写；缺失的私人经历或实验结果单独提出，不靠重复和虚构凑篇幅。
编辑问题与成稿分开，只有实质性的意义、证据或范围问题才需要另附说明。

## 内容分工

| 文件 | 用途 |
| --- | --- |
| `SKILL.md` | 路由、交互模式与交付 |
| `references/editing-principles.md` | 中英文及图文共用的保真、风格、材料充分性与最小改动原则 |
| `references/chinese-diagnostics.md` | 文件诊断、逐条处置与前后复核 |
| `references/semantic-criteria.md` | 重命名、衔接、冒号和三句结构的语义分类 |
| `references/english-editing.md` | 英文句法、用词和排版补充 |
| `references/gemini-polish.md` | 可选的 Gemini 单次纯文本润色 |
| `scripts/detect.py` | 只读检测、正文计数与语义候选 |
| `scripts/report.py` | Markdown 指标变化、候选处置与文字对照 |

学术写作、技术说明和图文技能引用共享原则，各自保留领域专用要求。
`anatomy` 的图注、读数和交互标签也使用这些原则。
独立英文 `humanizer` 已合并；英文任务读取本入口的英文参考。

## 离线工具

从本技能目录运行：

```bash
python3 scripts/detect.py 原文.md --json --out /tmp/before.json
python3 scripts/detect.py 原文.md --candidates --out /tmp/candidates.json
python3 scripts/detect.py 改后.md --json --out /tmp/after.json
python3 scripts/report.py 原文.md 改后.md /tmp/before.json /tmp/after.json \
  --semantic /tmp/candidates-labeled.json --out 修改对比.md
```

按语义判据给候选补充标签、处置与理由，再生成报告。`--semantic` 可省略，
此时语义候选没有复核结果。计数变化只描述实际变化，不代表质量分数。

命令只需 Python 3 标准库。统计区分正文与代码、引文、清单、表格等保护区域，
短文仍可定位局部问题。完整口径见中文诊断参考。

## 维护与许可

更新发行源后将整个技能目录同步到 OMP 与 Pi，避免只复制入口导致参考或脚本缺失。
现有会话重新加载技能后使用新资源；刷新技能目录描述和全局上下文需要新会话。

来源及适用文件见 [SOURCES.md](SOURCES.md)。原 Humanizer-zh 与 humanizer 的
MIT 声明保留；Lieflat 衍生的共享原则、中文诊断、语义判据与脚本为
CC BY-NC 4.0，整个组合不能按纯 MIT 分发，商业使用相关材料需取得许可。
