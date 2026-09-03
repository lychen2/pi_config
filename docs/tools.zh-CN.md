# 工具目录与使用示例

本页说明默认模式当前可用的主要 agent-facing 工具。示例都可以直接复制到 Pi 的普通请求中；模型会根据目标选择工具，通常不需要用户手写 JSON 参数。

## 先分清三个数量

| 数字 | 含义 |
| ---: | --- |
| 默认模式 | Web Access、FFF、后台 Shell、冲突处理和本地工作台。 |
| 大型模式 | `/large on` 在当前会话加载固定上游 Flow、teammate 与 Cockpit，恢复 GUI、MCP、LSP、browser/web search、FFF、conflict、root `bash_bg`、Goal、Todo、Plan、Loop 与 Maestro skills。 |
| 项目实际工具数 | 会随 `pi list`、`/tools`、启动参数、信任状态和已安装 package 变化；用 `/tools list` 核对。 |

`multi_tool_use.parallel` 是外层并行调用包装器。`pi-default-workbench` 默认使用 `adaptive`：首轮严格保留 read/bash/write/edit/grep/fffind/ffgrep/todo/ask_user_question 和 `search_tool_bm25`，不包含原生 `ls/find`；缺少能力时按 capability group 追加注册工具。`/tools fast` 固定最小集合，`/tools full` 恢复全部未显式禁用的注册工具，`/tools reset` 清空禁用规则后进入 full。

## 文件、搜索与执行（6）

| 工具 | 用途 | 使用示例 |
| --- | --- | --- |
| `read` | 读取文件内容、行号范围或带上下文的文本 | `读取 src/api.ts 第 40 到 90 行，只读，不要修改。` |
| `write` | 创建文件或完整写入一个新文件 | `创建 docs/decision.md，写入这次 API 决策和验证命令；不要覆盖已有文件。` |
| `edit` | 以精确匹配、行范围或符号替换修改文件 | `把 config.ts 中的超时时间从 30 改为 60，只修改这个字段，并显示 diff。` |
| `bash` | 执行 shell 命令，可按配置改写、压缩或后台运行 | `运行 npm test -- auth.spec.ts，等待完成；失败时保留首个失败堆栈。` |
| `grep` | 在指定路径按正则搜索文本 | `在 src/ 中搜索 handleRequest 的所有引用，排除 test/，只返回文件和行号。` |
| `preview_export` | 将 Markdown、LaTeX 或本地文件导出为 PDF、HTML 或 PNG | `把 docs/report.md 导出为 PDF，输出到 artifacts/report.pdf，并确认标题和图片都能渲染。` |

## 提问与任务（2）

| 工具 | 用途 | 使用示例 |
| --- | --- | --- |
| `ask_user_question` | 在存在真实决策分支时给出 2 到 4 个结构化选项 | `数据库迁移方案有多个互斥选择时，先用结构化问题询问我，并把推荐方案放第一项。` |
| `todo` | 默认模式唯一的 Pi Todo 入口；创建、更新、查询、删除或清空持久任务项，使用 `todo-panel` 与 `Alt+T` 折叠 | `把这个任务拆成检查、实现、测试三个 Todo；每次只保留一个 in_progress。` |

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

## 后台 shell 任务（1）

`bash_bg` 自主管理其任务 ID。

| 工具 | 用途 | 使用示例 |
| --- | --- | --- |
| `bash_bg` | 通过 `run`/`start` 启动任务，通过 `status`/`wait`/`kill`/`list` 管理任务 | `启动构建；若转入后台，使用返回的任务 ID 调用 bash_bg(action="wait")，不要轮询 observe。` |

普通短命令优先直接同步执行；服务器、watcher 或耗时不确定的命令才使用 `bash_bg`。

## FFF、后台 Shell 与冲突处理

Pi 原生 `read` 读取普通文件和图片，`bash` 负责命令执行；`write`、`edit`、`grep` 保持 Pi 原生实现。`fffind` 只查找当前工作区的模糊路径，`ffgrep` 做字面内容搜索，`bash_bg` 管理长任务，`conflict` 读取并解析 Git 冲突。

| 工具 | 用途 | 使用示例 |
| --- | --- | --- |
| `fffind` / `ffgrep` | 模糊文件发现和快速字面内容搜索 | `在当前工作区找名称接近 auth callback 的文件，并搜索 literal “redirect_uri”。` |
| `bash_bg` | 管理长时间运行的 Shell 任务 | `启动测试命令；若转入后台，使用 bash_bg(action="wait") 等待。` |
| `conflict` | 读取并解析 Git 冲突；编号是 `list` 返回的短期句柄，解析前重验原始 hunk | `先 list，再复制当前 conflict://N 调用 diff；不要猜固定编号。` |

跨文件重命名前先预览范围，应用后运行项目的编译或相关测试。


## 常见组合

```text
先用 `read`、`grep` 和 `fffind` 理解 UserStore；只读返回最安全的修改入口。
```

```text
搜索最新官方资料并核验：先 web_search，再用 source_check 验证关键断言，最后用 get_search_content 返回原文片段。
```

工具是否当前可用取决于项目选择、package 安装和 Pi 的启动参数。发现工具缺失时先运行 `pi list`、`/tools list`、`/reload`，再检查项目是否受信任。
