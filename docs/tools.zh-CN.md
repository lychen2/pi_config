# 工具目录与使用示例

本页按当前 agent-facing `functions.*` 工具面统计 **35 个工具**。示例都可以直接复制到 Pi 的普通请求中；模型会根据目标选择工具，通常不需要用户手写 JSON 参数。

## 先分清三个数量

| 数字 | 含义 |
| ---: | --- |
| 35 | 本页逐项解释的当前 `functions.*` 工具接口。 |
| 46 | `pi-tool-rails` 的显示 registry，包含兼容、可选和非当前 active 的名称；不是当前工具数量。 |
| 项目实际工具数 | 会随 `pi list`、`/tools`、`--tools`、`--exclude-tools`、信任状态和已安装 package 变化；用 `/tools list` 或 `pi --help` 核对。 |

`multi_tool_use.parallel` 是外层并行调用包装器，不计入下面 35 个 `functions.*` 条目。旧的 `load_tools`、`semantic_code` 以及 AFT 的 `aft_callgraph`、`aft_delete`、`aft_move`、`aft_refactor` 不属于本页当前工具面。`pi-deferred-tools` 也不负责延迟这些工具；它只是项目级开关面板，详见[使用手册](USAGE.zh-CN.md#2-工具默认启用与项目开关)。

## 文件、搜索与执行（8）

| 工具 | 用途 | 使用示例 |
| --- | --- | --- |
| `read` | 读取文件内容、行号范围或带上下文的文本 | `读取 src/api.ts 第 40 到 90 行，只读，不要修改。` |
| `write` | 创建文件或完整写入一个新文件 | `创建 docs/decision.md，写入这次 API 决策和验证命令；不要覆盖已有文件。` |
| `edit` | 以精确匹配、行范围或符号替换修改文件 | `把 config.ts 中的超时时间从 30 改为 60，只修改这个字段，并显示 diff。` |
| `bash` | 执行 shell 命令，可按配置改写、压缩或后台运行 | `运行 npm test -- auth.spec.ts，等待完成；失败时保留首个失败堆栈。` |
| `grep` | 在指定路径按正则搜索文本 | `在 src/ 中搜索 handleRequest 的所有引用，排除 test/，只返回文件和行号。` |
| `ffgrep` | 使用模糊匹配查找相关内容 | `用模糊搜索找出项目里所有与 token refresh 失败相关的错误信息。` |
| `fffind` | 按路径和名称模糊查找文件 | `找出所有与 auth、session 或 token 相关的配置文件，排除 node_modules。` |
| `preview_export` | 将 Markdown、LaTeX 或本地文件导出为 PDF、HTML 或 PNG | `把 docs/report.md 导出为 PDF，输出到 artifacts/report.pdf，并确认标题和图片都能渲染。` |

## 提问、任务与工作流（4）

| 工具 | 用途 | 使用示例 |
| --- | --- | --- |
| `ask_user_question` | 在存在真实决策分支时给出 2 到 4 个结构化选项 | `数据库迁移方案有多个互斥选择时，先用结构化问题询问我，并把推荐方案放第一项。` |
| `todo` | 创建、更新、查询、删除或清空持久任务项 | `把这个任务拆成检查、实现、测试三个 Todo；每次只保留一个 in_progress。` |
| `todowrite` | 一次性替换当前会话的完整 Todo 列表 | `用 todowrite 建立完整清单：核对配置、更新文档、运行检查；完成一项就立即标记。` |
| `workflow_dag` | 执行最多 8 个有依赖的只读检查、写入实现和复核节点 | `把任务拆成 inspect → implement → review 三个有依赖节点，inspect 和 review 只读，最后返回每个节点的改动和验证结果。` |

`todo` 适合主代理持续跟踪任务；`workflow_dag` 适合把隔离 worker 组织成依赖波次。两者不是同一个状态系统。

## Web、来源与内容提取（4）

| 工具 | 用途 | 使用示例 |
| --- | --- | --- |
| `web_search` | 搜索最新网页、文档、论文或产品资料 | `搜索 2025 年 TypeScript 装饰器规范变化，只使用 typescriptlang.org 和 GitHub，并附来源链接。` |
| `source_check` | 对一个明确断言做有边界的来源核验 | `核验“该 API 在 3.0 版本加入”这一断言，只接受官方 changelog，并返回原文摘录。` |
| `fetch_content` | 抓取网页、PDF、GitHub 仓库、视频或直接 URL 内容 | `抓取这个 PDF，提取方法、表格和结论，所有结论标出页码。` |
| `get_search_content` | 从先前搜索或抓取结果中定位和读取指定来源片段 | `在刚才的搜索结果中定位包含“rate limit”的原文段落，并返回上下文。` |

需要最新事实时先说清时间范围、可信域名和证据要求；不要让模型把未经核验的搜索摘要当成结论。

## 上下文、记忆与会话记录（5）

| 工具 | 用途 | 使用示例 |
| --- | --- | --- |
| `ctx_search` | 搜索项目长期记忆、旧消息、提交和工作笔记 | `回忆这个项目为什么保留 RTK；搜索记忆、提交和旧讨论，返回决定和证据。` |
| `ctx_memory` | 读取、写入、更新、合并或归档长期项目事实 | `把“配置源文件是 ~/.config/matugen/templates/pi-theme.json”写成一条项目架构记忆。` |
| `ctx_note` | 写入以后再处理的普通或条件提醒 | `记录一条普通笔记：发布后重新跑完整工具显示验证；不要把当前 Todo 放进 note。` |
| `ctx_expand` | 从压缩历史中恢复指定消息或消息区间的原文 | `恢复第 138 条消息的完整工具输出，确认当时的错误文本。` |
| `ctx_reduce` | 将已处理的大型工具输出标记为可回收内容 | `已经提取测试失败原因后，把对应的大段日志标记为可回收；保留用户要求和未解决错误。` |

`ctx_memory` 记录稳定事实；`ctx_note` 记录以后处理的事项；当前任务不要用 note 代替 Todo。

## 任务分支（1）

| 工具 | 用途 | 使用示例 |
| --- | --- | --- |
| `push-task` | 将任务放入 Pi session tree 的新上下文分支，等待用户启动；可选 `role` 和 `model` | `用 push-task 建立一个 role=explore、model=manager/gpt-5.6-luna 的只读 review 任务。` |

使用 `/start-task` 启动分支，完成后用 `/finish-task` 将最后一条助手结果带回主分支；不需要执行时用 `/discard-task`。多个任务按顺序执行可使用 `/auto`。

## 后台 shell 任务（4）

这些工具只在 `bash` 已返回后台任务 ID 后使用。

| 工具 | 用途 | 使用示例 |
| --- | --- | --- |
| `bash_status` | 快速查看后台 shell 的当前输出和状态，不等待 | `查看任务 ID 为 abc 的后台构建当前输出；只看一次，不要循环轮询。` |
| `bash_watch` | 等待后台任务退出、匹配指定输出或达到超时 | `等待构建任务退出，最多 10 分钟；如果出现“FAIL”就立即返回相关输出。` |
| `bash_write` | 向后台 PTY 进程写入文本或按键 | `向正在运行的交互式测试发送 Enter，然后读取下一屏输出。` |
| `bash_kill` | 终止一个仍在运行的后台任务 | `停止已经确认失控的开发服务器任务，并返回任务 ID。` |

普通短命令优先直接同步执行；只有确实需要并行工作或交互输入时才使用后台任务。

## AFT 代码导航与安全检查（7）

AFT 的 `read`、`write`、`edit` 和 `grep` 仍是文件操作入口；下面是 AFT 的分析、冲突和恢复能力。

| 工具 | 用途 | 使用示例 |
| --- | --- | --- |
| `aft_search` | 使用索引、语义或精确查询查找概念、标识符、字符串和文件 | `用 AFT 搜索“watcher invalidation 如何处理”，只读并返回最相关的实现和测试路径。` |
| `aft_outline` | 查看文件、目录或 URL 的结构、符号和标题层级 | `列出 src/ 里与 auth 相关文件的结构，先给符号范围，不要读取整份大文件。` |
| `aft_zoom` | 读取指定符号或文档标题的完整内容，可附一层调用图 | `读取 src/service.ts 的 UserStore 符号和一层 calls-out，说明最安全的修改入口。` |
| `aft_inspect` | 汇总诊断、TODO、指标、死代码、未使用导出、重复和循环 | `检查 src/auth/ 的诊断、死代码和重复；测试前先报告未完成的扫描类别。` |
| `aft_conflicts` | 一次列出仓库所有 Git merge conflict 区域及上下文 | `检查当前仓库的所有 merge conflict，只读返回文件、行号和冲突双方。` |
| `aft_import` | 语言感知地添加、移除或整理 import | `整理 src/index.ts 的 TypeScript imports，只做 organize 并运行语法校验。` |
| `aft_safety` | 创建、恢复、列出或撤销 AFT 命名检查点 | `在编辑 config/ 前创建名为 before-docs 的检查点；验证失败时恢复它。` |

AFT `edit` 通过字段存在性判断模式：一次调用只能传一种编辑模式。跨文件安全重命名不要把 AFT 当作 LSP rename；先使用项目的重构工具，再让 AFT 检查 diff。

## AST 结构化搜索与改写（2）

| 工具 | 用途 | 使用示例 |
| --- | --- | --- |
| `ast_grep_search` | 按 AST 模式查找语法结构，`$VAR` 匹配单节点、`$$$` 匹配多节点 | `用 AST 搜索所有把 fetch(url) 放在 try 之外的 TypeScript 调用；不要按纯文本猜测。` |
| `ast_grep_replace` | 按 AST 模式预览或执行结构化代码改写 | `先 dry-run：把所有 console.log($MSG) 改成 logger.info($MSG)，只限 src/，确认结果后再应用。` |

AST 改写前先用 `dryRun`，确认捕获范围、文件范围和测试命令；不要把正则替换当成语义等价的代码迁移。

## 常见组合

```text
先用 aft_outline 和 aft_zoom 理解 UserStore，再用 aft_inspect 检查诊断；只读返回最安全的修改入口。
```

```text
用 workflow_dag 拆成 inspect、implement、review 三个有依赖节点；implement 完成后运行最窄测试，review 只读审查 diff。
```

```text
搜索最新官方资料并核验：先 web_search，再用 source_check 验证关键断言，最后用 get_search_content 返回原文片段。
```

工具是否当前可用取决于项目选择、package 安装和 Pi 的启动参数。发现工具缺失时先运行 `pi list`、`/tools list`、`/reload`，再检查项目是否受信任。
