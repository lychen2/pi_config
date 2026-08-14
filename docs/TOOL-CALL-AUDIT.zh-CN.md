# 可调用工具审计与修复指南

> 审计范围：本次 Pi 会话实际暴露给模型的 `functions.*` 工具，以及 `multi_tool_use.parallel` 对工具的包装调用。
>
> 审计目标：确认工具 metadata/schema 是否准确表达真实调用契约；确认默认调用是否会因为 metadata 缺失而失败；为第一次接触本项目的开发者提供可直接执行的修复路径。
>
> 审计时间：2026-08-12
>
> 重要边界：报告中的调用和返回值来自本次会话；本轮随后读取了相关 package 的注册、schema 和运行时代码来确认所有者与约束位置。没有修改第三方源码或 `node_modules`；为落实单一 Todo 入口，本轮显式修改了用户 Magic Context 配置，并把同一默认值固化到项目安装器。报告中的“已确认”指调用结果与源码证据共同支持的事实；“待确认”指还需要独立回归测试、重新导出或产品契约才能确定的结论。

## 1. 先看结论

### 1.1 已确认的问题（含 Large 模式）

| 编号 | 工具 | 级别 | 结论 |
| --- | --- | --- | --- |
| C-01 | `observe` + `bash_bg` | P1 | `bash_bg` 返回的 job ID 不能被 `observe(kind="bash_bg")` 观察。`observe` 的公开 schema/说明允许这种组合，但运行时返回 `No observation provider for kind "bash_bg"`。这是跨工具注册或 provider 映射断裂。 |
| C-02 | `preview_export(format="png")` | P1 | 工具返回“Exported PNG preview”，但输出文件没有 PNG 签名，`file` 识别为普通 `data`。成功消息和实际产物类型不一致。 |
| C-03 | `readSeek_digest` | P2 | `end` 与 `limit` 在 metadata 中都可以提交，但运行时拒绝同时使用：`cannot combine --end with --limit`。这是缺少互斥参数约束。 |
| C-04 | `readSeek_view` | P2 | `outline=true` 时仍传 `visionMode`/`visionLevel` 会失败：`Cannot combine outline with visionMode or visionLevel`。schema 没有表达这个条件互斥关系。 |
| C-05 | `readSeek_view` | P3（调用流程） | `node="root"`、`node="page:1"` 不是当前文档的真实节点 ID，传空 node 也会被拒绝。工具执行器行为合理；问题是说明没有给出先获取结构节点、再复制真实 node ID 的可执行流程。 |
| C-06 | `readSeek_view` | P3（调用方错误） | `page=0` 被拒绝：`Invalid page: expected a positive integer, received 0`。当前 schema 已有 `minimum: 1`，因此这次是调用方未遵守已有 metadata，不应记为已确认的 schema 缺陷。仍可改进错误提示和边界回归测试。 |
| C-07 | `readSeek_digest` / `readSeek_search` | P2 | `language="text"` 和空字符串都会在运行时失败：`unknown language 'text'` / `unknown language ''`。参数是自由字符串，但实际是受支持语言枚举。schema 没有给出枚举或自动检测语义。 |
| C-08 | `get_search_content` | P2 | 同时传 `findText` 与 `offset`/`limit` 会失败：`findText cannot be combined with offset or limit`。这是已知互斥关系，但 metadata 没有让模型在调用前无法提交冲突组合。 |
| C-09 | `conflict` | P3（状态流程） | `conflict://*` 不是合法 diff URI；`conflict://1` 只有在当前 list 结果确实存在编号 1 时才有效。工具执行器行为符合短期句柄约束，调用者必须先 `list`，再使用当前返回的具体 URI。 |
| C-10 | `read` | P2（待确认） | `offset=0` 被接受并返回了文件内容，而工具说明写的是 1-based offset。已确认 schema/运行时没有拒绝零值，但本次没有证明读取结果发生了偏移错误；需要补充 0/1/负数对照测试。 |
| C-11 | Large 模式 `maestro` CLI | P1 | Large 包内已安装 `maestro-flow@0.5.68`，且 `large/pi-maestro-large/node_modules/.bin/maestro` 存在；但 `bin/pi-large` 启动 Pi 时没有把该 bin 目录加入 `PATH`，导致技能生成的 `maestro search ... --json` 在 shell 中报 `/bin/bash: maestro: 未找到命令`。已修复 `bin/pi-large` 的 PATH 注入；验证 `maestro --version` 返回 `0.5.68`，同一 search 命令返回合法 JSON。 |
| C-12 | 默认 / Large Todo 入口 | P1（已修复） | 第二个入口 `todowrite` 实际由 Magic Context 注册，不是宿主工具。现已在 `~/.config/cortexkit/magic-context.jsonc` 关闭其工具与 overlay，并在 `install.mjs` 固化 `enabled:false`、`overlay:false`；Magic Context 的压缩、记忆、搜索和数据库继续启用。仅默认 `extensions/pi-maestro-todo` 新增 `context` hook：Magic Context 完成裁剪后，注入一份隐藏的最新活动 Todo 快照，不写 Magic Context 私有数据库、不伪造 `todowrite`、不增加模型调用。Large 源码和 Large 兼容链路未修改。验证：默认 Todo typecheck 与 `6/6` 测试、`pi-tool-rails` `58/58` 测试、40 项展示注册表检查通过；默认和 Large 的真实新进程工具表均为 `todo=true`、`todowrite=false`。 |

### 1.2 不是工具注册错误的结果（不含 C-11/C-12）

下列结果虽然是 FAILED 或异常输出，但不能直接归咎于工具注册：

1. `grep` 递归扫描 `/tmp` 时遇到 systemd-private 目录权限错误：
   `Permission denied (os error 13)`。
   这是目标扫描范围包含不可读目录，工具已经执行了搜索。缩小到明确文件或可读目录后，同一工具成功返回匹配。
2. `bash` 执行返回码为 1：这是 shell 命令本身的退出状态，不等于 `bash` 工具注册失败。
3. `bash` 在仓库外执行 `git status`：目标命令返回 Git 错误“在仓库之外”，是命令前置条件不满足。
4. `fetch_content(https://example.com)` 被 SSRF 规则拦截：
   `Blocked internal address ... configure ssrf.allowRanges ...`。
   这是网络安全策略拒绝目标地址，不是 fetch 工具缺失。
5. `read` 读取清理后的临时文件返回 `ENOENT`：文件确实已经被测试清理，工具正确报告不存在。
6. `ffgrep` 在当前 workspace 找不到位于 `/tmp` 的测试文件：FFF 的契约是 workspace 内搜索，不能把它当作任意路径搜索器。

### 1.3 本次没有证据支持的结论

以下不能仅凭本次调用断言：

- `grep` 的 `path` 是否真的在 schema 层必填。当前实际调用显式传了 `path`，没有完成真正的省略字段调用。
- `read(offset=0)` 是否会产生偏移错误。当前只观察到零值被接受且返回内容，尚未做 `offset=0/1/2` 的同一文件对照。
- `teammate-list.view` 是否可以省略。当前实际调用显式传了 `view`。
- `multi_tool_use.parallel` 是否在外层 schema 接受空数组或未知工具名。没有执行这类有意触发 dispatch 校验的调用。
- `read` 是否应该对任意二进制文件走图片附件分支。对仓库内真实 PNG 的读取成功，但不能外推到所有二进制扩展名。
- `readSeek_view` 的正确根 node ID 如何生成。当前工具返回了 node 不存在，但没有输出节点目录；需要阅读实现或先调用专门的结构摘要接口。

### 1.4 文档与当前会话工具面存在版本漂移

`docs/tools.zh-CN.md` 的“后台 shell 任务”表列出 `bash_status`、`bash_watch`、`bash_write`、`bash_kill`，但本次会话实际暴露的是统一的 `bash_bg(action=...)`，没有这些独立工具名。这个差异没有在本次调用中触发 FAILED，但会直接导致新用户或模型生成不存在的工具调用。

修复时必须二选一：

1. 文档跟随实际注册面，统一写 `bash_bg` 的 `run/status/wait/kill` action；或
2. 重新注册四个独立工具，并从 `bash_bg` schema 中移除重复 action。

不能只改文档中的名称而不检查 `/tools list` 和 model-facing schema。

### 1.5 2026-08-12 修复结果

原始复现记录保留在下文；当前默认模式已完成以下处置：

| 编号 | 当前处置 |
| --- | --- |
| C-01 | `pi-readseek-compat` 作为默认 teammate 的唯一注册入口，将 `observe.targets[].kind` 收紧为 `teammate | workspace`，并把后台任务说明统一指向 `bash_bg`。未新增 observation provider。 |
| C-02 | `pi-markdown-preview-compat` 成为 Preview 的唯一注册入口。PNG 导出先以 `open=false` 执行并校验标准 8 字节签名；失败时清理整组 artifact 并利用上游缓存重试一次；仍失败则返回错误。`open=true` 只在 PNG 已验证后执行。实测新 Pi 进程生成 22,445 字节文件，签名为 `89504e470d0a1a0a`。 |
| C-03 | `readSeek_digest` schema 用条件约束拒绝同时提交 `end` 与 `limit`。 |
| C-04 | `readSeek_view` schema 拒绝 `outline=true` 与 `visionMode`/`visionLevel` 组合；事件兼容层继续移除源文件 digest 上无意义的强制 vision 默认值。 |
| C-05 | `readSeek_view.node` 说明明确：node ID 是当前 outline 返回的短期句柄，必须先获取 outline、复制当前 ID，文档变化后重新获取。 |
| C-06 | 后续新进程实测推翻了原表中的“schema 已有 minimum: 1”：上游 `page` 实际是无最小值的 number/string union，`page=0` 在 schema 层被接受。现已收紧为正安全整数或正十进制整数字符串；拒绝 `0`/`"0"`，保留上游合法的 `"01"`。 |
| C-07 | 适配器按锁定 Readseek 0.9.13 的实际 parser ID 集合生成 `language` 枚举，并明确省略字段表示自动检测；空字符串、`text` 和扩展名不再通过 schema。 |
| C-08 | `get_search_content` schema 用 `oneOf` 分离 `findText` 查找与 `offset`/`limit` 分页；`findMode` 只能随 `findText` 使用。 |
| C-09 | `conflict` schema 按 action 收紧 URI：`diff` 只接受当前 `conflict://N`，`resolve` 接受 `conflict://N` 或 `conflict://*`；说明明确 URI 是最新 `list` 返回的短期句柄。 |
| C-10 | 本地入口复用 Pi 的 `createReadToolDefinition`，只替换 `read` schema，并在执行前再次验证 `offset`/`limit` 为 `>= 1` 的整数。直接调用也不再接受 0。 |
| C-11 | 保留既有 Large PATH 修复。 |
| C-12 | 保留既有单一 Todo 入口修复。 |

注册边界也已统一：`pi-readseek`、`pi-web-access`、`pi-maestro-teammate` 和 `pi-markdown-preview` 是本地适配入口的锁定 production dependencies，不再作为默认 settings 中的独立注册来源。安装器会物理清理旧 npm 条目，并在本地包目录安装 production dependencies。工具文档已移除不存在的 `bash_status`、`bash_watch`、`bash_write`、`bash_kill`，统一为 `bash_bg(action=...)`。

验证覆盖：两个适配包 typecheck；Readseek/schema 8 项测试；Preview 6 项测试；`pi-maestro-tools` 聚焦测试；Large 模式切换测试；两次实际安装；全新 Pi 进程中的唯一注册与 schema 矩阵；真实 PNG 魔数；`git diff --check`。

## 2. 为什么“FAILED 且是输入问题”通常说明 metadata 有问题

模型的工具调用链有四层：

```text
模型看到的 tool schema
        |
        v
模型生成 JSON 参数
        |
        v
Pi/包装器校验参数
        |
        v
工具执行器与外部目标执行
```

要区分问题，先问“失败发生在哪一层”：

| 失败位置 | 典型错误 | 结论 |
| --- | --- | --- |
| schema/入口校验 | 缺少字段、类型错误、非法枚举、互斥字段同时出现 | metadata 没表达完整约束，或调用者没有遵守已有约束 |
| 工具执行器 | provider 不存在、内部异常、输出格式与成功消息不符 | 工具注册、provider 映射或执行实现有问题 |
| 外部命令/目标 | 权限不足、文件不存在、Git 不在仓库、HTTP 被安全策略拦截 | 目标操作失败，不一定是工具注册问题 |
| 结果验证 | 命令零退出但生成文件类型错误、内容为空、路径不对 | 工具成功判定不完整，或输出契约不可信 |

因此不能只看到字符串 `FAILED` 就把所有错误归为同一种故障。但如果一个工具的公开 metadata 允许模型生成某组参数，而运行时每次都因这组参数的结构错误拒绝，那么应修 metadata，而不是要求模型“记住隐藏规则”。

## 3. 工具面与推荐调用顺序

当前文档把工具分为以下几组：

- 文件与执行：`read`、`write`、`edit`、`bash`、`grep`、`preview_export`
- Readseek/FFF：`readSeek_view`、`readSeek_digest`、`readSeek_search`、`readSeek_def`、`readSeek_refs`、`readSeek_rename`、`fffind`、`ffgrep`
- 后台与冲突：`bash_bg`、`conflict`
- Web：`web_search`、`source_check`、`fetch_content`、`get_search_content`
- 上下文与任务：`ctx_*`、`todo`、`teammate*`、`observe`
- 包装器：`multi_tool_use.parallel`

对新开发者，建议按这个顺序排查：

```text
1. 先用 list/status 类调用确认工具存在
2. 用最小成功参数验证正常路径
3. 用一个边界参数验证错误是否清楚
4. 检查错误是在 schema、执行器还是目标命令
5. 再测试跨工具的 ID、URI、文件和结果传递
```

## 4. 已确认问题逐条说明

### C-01 `bash_bg` 与 `observe` 的 provider 断裂

#### 复现

先启动一个会短暂运行的后台命令：

```json
{
  "action": "run",
  "command": "printf 'bg-start\\n'; sleep 2; printf 'bg-done\\n'",
  "cwd": "/tmp",
  "jobId": "",
  "tail": 20,
  "timeout": 1
}
```

`bash_bg` 返回：

```text
Still running after 1s. Moved to background as bg-1-msovvz8e
```

然后按 `observe` 的公开用法观察：

```json
{
  "action": "wait",
  "targets": [{"kind": "bash_bg", "id": "bg-1-msovvz8e"}],
  "waitMode": "all",
  "until": "completed",
  "timeoutMs": 10000,
  "detail": "full",
  "lines": 20
}
```

实际返回：

```text
No observation provider for kind "bash_bg"
```

但后台任务随后确实以退出码 0 完成，并输出：

```text
bg-start
bg-done
```

#### 根因判断

已确认 `bash_bg` 自己可以创建和完成任务；已确认 `observe` 的 `bash_bg` target 在当前运行时没有 provider。最可能的修复边界是：

- 本项目已决定不让 `observe` 接管 `bash_bg`；统一使用 `bash_bg(action="status"/"wait")` 管理后台 shell；或
- 若未来要改变架构，必须同时增加真实 provider、收紧 schema 并补齐生命周期测试；不能只改说明。

不能同时保留“说明支持 `kind= bash_bg`”和“运行时没有 provider”。

#### 建议修复

优先选择一种架构并保持单一来源：

**本项目采用：不让 `observe` 观察后台 shell。**

1. 保持 `bash_bg` 独立负责 `status`、`wait`、`kill` 和完成唤醒，不引入 teammate observation provider 依赖。
2. 从 `observe` 的 schema/说明中删除 `bash_bg` 示例，并把后台 shell 的状态流程指向 `bash_bg(action="status"/"wait")`。
3. 用启动、运行中、完成、失败、已终止、未知 ID 六个 `bash_bg` 生命周期测试覆盖独立接口。
4. 如将来选择共享 provider，必须作为架构变更重新评估，不能只修错误文案。

当前项目文档已经把 `observe` 写成“观察 teammate 与后台任务”，所以若没有强约束理由，方案 A 更符合现有公开契约。

### C-02 `preview_export` 的 PNG 成功消息不可信

#### 复现

调用：

```json
{
  "source": "markdown",
  "markdown": "# Tool Probe\\n\\nPNG image read test.",
  "format": "png",
  "inputFormat": "markdown",
  "fontSizePx": 12,
  "outputPath": "/tmp/pi-tool-probe.png",
  "resourcePath": "/tmp",
  "path": "",
  "open": false
}
```

工具返回：

```text
Exported PNG preview from provided markdown.
- /tmp/pi-tool-probe.png
```

随后实际检查：

```text
file /tmp/pi-tool-probe.png
=> data

xxd -l 32 /tmp/pi-tool-probe.png
=> d77e fcd3 bf3b d75d ...
```

有效 PNG 应以以下 8 字节开头：

```text
89 50 4e 47 0d 0a 1a 0a
```

因此当前“导出成功”至少没有验证文件类型。

#### 根因判断

这是工具成功判定和实际产物契约不一致。问题可能在渲染器把 PNG 压缩数据直接写成文件，也可能在导出后缀/格式路由错误。仅凭调用结果不能确定具体代码行，必须在 `preview_export` 实现中追踪 PNG 分支。

#### 建议修复

1. 找到 `preview_export` 的 `format === "png"` 分支。
2. 确认渲染库返回的是 PNG buffer，而不是原始像素、压缩流或其他中间格式。
3. 写入后立即验证：文件存在、大小大于 8 字节、前 8 字节等于 PNG signature。
4. 用图像解码库再验证宽度和高度大于 0。
5. 只有全部检查通过才返回“Exported PNG preview”。
6. 检查失败时返回明确错误，并删除损坏输出，避免留下一个看似成功的坏文件。

回归测试最少包括：Markdown 转 PNG、Markdown 转 PDF、Markdown 转 HTML、路径已存在、输出目录不存在、渲染失败。

### C-03 `readSeek_digest` 的 `end` 与 `limit` 互斥

#### 复现

调用同时传递：

```json
{
  "at": "line:1",
  "end": 5,
  "limit": 10,
  "language": "javascript",
  "path": "/tmp/pi-tool-probe.js",
  "select": ["metadata", "content", "map", "diagnostics", "identity"],
  "visionLevel": "low",
  "visionMode": "none"
}
```

实际返回：

```text
cannot combine --end with --limit
```

删除 `limit` 后，调用成功并返回 metadata、content、map、diagnostics、identity。

#### 根因

`end` 表示绝对结束行，`limit` 表示最大返回行数，两者可以表达不同定位方式，但不能同时使用。运行时有规则，metadata 没有充分表达 `oneOf`/互斥关系。

#### 推荐 schema 形状

伪 JSON Schema：

```json
{
  "oneOf": [
    {"required": ["end"], "not": {"required": ["limit"]}},
    {"required": ["limit"], "not": {"required": ["end"]}},
    {"not": {"anyOf": [{"required": ["end"]}, {"required": ["limit"]}]}}
  ]
}
```

实际项目如果使用 TypeScript schema builder，应使用该库对应的互斥/union API，不要只在 description 里写一句“不能同时传”。

#### 正确调用

```json
{
  "at": "line:1",
  "end": 5,
  "language": "javascript",
  "path": "/tmp/pi-tool-probe.js",
  "select": "content",
  "visionLevel": "low",
  "visionMode": "none"
}
```

或：

```json
{
  "at": "line:1",
  "limit": 5,
  "language": "javascript",
  "path": "/tmp/pi-tool-probe.js",
  "select": "content",
  "visionLevel": "low",
  "visionMode": "none"
}
```

### C-04 `readSeek_view` 的 outline 与视觉字段互斥

#### 复现

调用包含：

```json
{
  "depth": 3,
  "kind": "heading",
  "node": "root",
  "outline": true,
  "page": 1,
  "path": "/tmp/pi-tool-probe.pdf",
  "visionLevel": "low",
  "visionMode": "caption"
}
```

实际返回：

```text
Cannot combine outline with visionMode or visionLevel.
```

#### 推荐 schema 形状

```json
{
  "oneOf": [
    {
      "required": ["outline"],
      "properties": {"outline": {"const": true}},
      "not": {"anyOf": [
        {"required": ["visionMode"]},
        {"required": ["visionLevel"]}
      ]}
    },
    {
      "properties": {"outline": {"const": false}},
      "required": ["visionMode", "visionLevel"]
    }
  ]
}
```

如果 `visionMode` 和 `visionLevel` 实际有默认值，就应把它们从第二个分支的 `required` 中移除，并在 schema 中真实声明默认值。

#### 正确调用原则

- 只要 `outline=true`，不要传 `visionMode` 或 `visionLevel`。
- 需要视觉分析时，`outline=false`，并提供合法 node/page。
- 不要猜 `node="root"`。先获取该文档的结构节点列表，再复制返回的 node ID。

### C-05/C-06 `readSeek_view` 的 node 与 page 输入约束

#### 已观察到的错误

```text
Invalid node: expected a non-empty ID.
node root not found
node page:1 not found
Invalid page: expected a positive integer, received 0
```

这些错误说明执行器要求：

- `node` 非空；
- node 必须是当前文档真实存在的 ID；
- `page >= 1`。

#### 分类与修复边界

当前 schema 已表达 `page >= 1` 和 `node` 非空；本次 `page=0` 是调用方错误，不是已确认的 metadata 缺陷。需要补的是可用性：

1. 在 `readSeek_view` 说明中明确“不要猜 node ID”。
2. 先调用结构摘要/目录入口，复制当前返回的真实 node ID，再调用 view。
3. node 查找失败时返回结构化的 `node_not_found`，并附文档路径和有限的可用 node 摘要。
4. 回归测试空字符串、缺失、0、负数、浮点数、合法 node 和过期 node；不要把已有 `minimum: 1` 重复写成未确认缺陷。

### C-07 Readseek language 不是自由字符串

#### 复现

```text
readSeek_digest(language="text")
=> unknown language `text`

readSeek_search(language="text")
=> unknown language `text`

readSeek_digest(language="")
=> unknown language ``
```

但 `language="javascript"` 成功，并返回 `engine: tree-sitter`。

#### 修复方式

优先支持两种明确模式之一：

**模式 1：自动检测。**

- `language` 设为可选；
- 缺省时按扩展名/内容自动检测；
- schema description 写明“不要传 `text`；未知文本文件省略该字段”；
- 运行时对未知语言回退到纯文本，而不是直接报错（如果工具确实支持纯文本）。

**模式 2：严格枚举。**

- schema 使用实际支持的语言枚举；
- 不把 `text`、空字符串或任意扩展名当作合法值；
- 错误返回可用语言列表或提示省略字段自动检测。

不要在模型可见 schema 中写 `type: string`，然后在执行器里只接受隐藏枚举。

### C-08 `get_search_content` 的定位模式互斥

#### 失败调用

调用同时传：

```json
{
  "responseId": "missing-probe-id",
  "findText": "missing",
  "offset": 0,
  "limit": 1000
}
```

实际返回：

```text
findText cannot be combined with offset or limit
```

#### 正确调用

按文本定位：

```json
{
  "responseId": "<真实 responseId>",
  "findText": "rate limit",
  "findMode": "case-insensitive"
}
```

按字符区间读取：

```json
{
  "responseId": "<真实 responseId>",
  "offset": 0,
  "limit": 3000
}
```

#### 修复方式

为参数建立两个互斥分支：`findText` 分支和 `offset+limit` 分支。特别要把“不能同时使用”从 description 提升到 schema 的 `oneOf`。对空 `responseId`、不存在 responseId、既没有 findText 也没有 offset 的情况分别测试。

### C-09 `conflict` 的状态依赖

#### 失败调用

```text
conflict(action="diff", uri="conflict://*")
=> conflict diff requires one numbered URI

conflict(action="diff", uri="conflict://1")
=> conflict://1 not found. Run conflict list to refresh conflict numbering.
```

#### 正确流程

```text
1. conflict(action="list")
2. 从 list 的实际返回中复制一个当前编号，例如 conflict://2
3. conflict(action="diff", uri="conflict://2")
4. resolve 后执行 git add
```

`conflict://1` 不能作为固定测试值，因为当前仓库可能没有冲突，或冲突编号不是 1。工具说明应明确“编号是 list 结果的短期句柄”，不要让模型猜编号。

### C-10 `read` 的 offset 一基/零基矛盾

#### 观察

调用：

```json
{
  "path": "/tmp/pi-tool-probe.txt",
  "offset": 0,
  "limit": 10
}
```

工具没有在入口拒绝，并且返回了文件内容；调用说明写明 offset 是 1-based。正常调用 `offset=1` 也可以读到文件首行。因此本次只证明零值未被 schema/运行时拒绝，尚未证明发生了偏移错误。

#### 推荐修复

- 如果产品契约确实是一基，schema 对 `offset` 增加 `minimum: 1`；
- `limit` 增加 `minimum: 1`，除非项目明确支持 0 表示空片段；
- 运行时统一拒绝 0 和负数，并返回 `offset must be >= 1`；
- 先补充同一文件的 `offset=0/1/2` 对照测试，再决定是否修实现；
- 测试超过文件行数、`limit=0`、`limit=-1`。

如果底层 API 必须使用 0-based，应在工具边界转换，不要让模型同时面对两套坐标系。

## 5. 各工具的最小健康检查

以下测试不修改仓库。正式自动化测试应使用临时目录和临时文件。

### 5.1 文件工具

```text
write 临时文本文件
read offset=1, limit=2
edit 修改一行
read 验证修改
删除临时文件
```

验收：返回内容正确；锚点/行号稳定；错误文件返回清楚的 `ENOENT`；不会把二进制当文本塞进上下文。

### 5.2 Readseek

```text
创建 .js 临时文件
readSeek_digest(language="javascript", select="content")
readSeek_search(language="javascript", 使用合法 AST pattern)
readSeek_def
readSeek_refs
readSeek_rename(apply=false)
```

验收：digest 成功；结构搜索只返回真实节点；dry-run 不改文件；language 不接受隐藏未知值；互斥参数在入口就被拒绝。

### 5.3 FFF 与 grep

```text
在 workspace 内创建临时文件
fffind 按文件名搜索
ffgrep 按 literal 搜索
 grep 显式指定 workspace path 和 glob
```

验收：明确区分 workspace-only 和任意 path；权限错误不会伪装成“无匹配”；返回结果能说明扫描范围。

### 5.4 后台任务

```text
bash_bg(action="run", 短暂 sleep 命令)
bash_bg(action="status", jobId=<返回 ID>)
bash_bg(action="wait", jobId=<返回 ID>)
bash_bg(action="status"/"wait", jobId=<返回 ID>)
```

验收：`bash_bg` 独立覆盖启动、运行中、完成、失败、终止和未知 ID；不要用 `observe(kind="bash_bg")`，因为本项目不注册该 provider。

### 5.5 导出

```text
preview_export markdown -> html
preview_export markdown -> pdf
preview_export markdown -> png
```

验收：HTML 是 HTML；PDF 以 `%PDF-` 开头并能解析；PNG 以 `89 50 4e 47 0d 0a 1a 0a` 开头并能解码；失败时删除坏输出。

### 5.6 Web 与来源

```text
web_search(...)
get_search_content(responseId=<真实值>, findText=...)
get_search_content(responseId=<真实值>, offset=0, limit=...)
```

验收：responseId 来源真实且可追溯；findText 与 offset/limit 不共存；SSRF、DNS、HTTP 和内容解析错误分开报告。

## 6. 给实习生的修复路线

### 第 0 步：准备环境

```bash
cd /home/zonazcy/pi_config
node --version
pi --version
git status --short
```

不要执行 `git reset --hard`、`git checkout --` 或清理已有用户改动。当前工作区已有未提交改动，修复者只能新增或明确修改自己负责的文件。

### 第 1 步：找工具注册入口

先搜索工具名和错误文本：

```bash
rg -n "readSeek_digest|readSeek_view|bash_bg|preview_export|No observation provider|cannot combine|unknown language" \
  extensions large scripts config
```

然后确认每个工具的三处内容：

1. model-facing schema/description；
2. 参数解析和运行时校验；
3. 结果包装、错误包装和成功判定。

如果工具来自 npm package，不要修改 `node_modules` 或第三方源码。项目规则要求通过本地扩展、配置或维护的 package 升级解决。

### 第 2 步：先写失败回归测试

每个问题先写一个最小测试，测试必须验证：

- 输入 JSON；
- 期待的入口拒绝或执行结果；
- 错误类型/错误码；
- 不产生坏文件或意外副作用。

建议测试命名：

```text
rejects_digest_end_and_limit_together
rejects_view_outline_with_vision_options
rejects_view_page_zero
rejects_unknown_readseek_language
observes_bash_bg_job
rejects_invalid_png_success
```

### 第 3 步：修 schema，而不是只改提示词

优先修以下约束：

```text
整数范围：minimum
非空字符串：minLength
语言：enum 或可选自动检测
互斥参数：oneOf / not / dependentSchemas
条件参数：outline=true 与视觉字段互斥
输出：成功结果必须携带已验证的 artifact metadata
```

description 仍然要写使用流程，但 description 不能替代机器可验证约束。

### 第 4 步：修运行时错误模型

建议每个工具错误至少包含：

```json
{
  "ok": false,
  "code": "INVALID_ARGUMENT",
  "message": "page must be a positive integer",
  "field": "page",
  "retryable": false
}
```

provider 缺失应是：

```json
{
  "ok": false,
  "code": "PROVIDER_NOT_REGISTERED",
  "provider": "bash_bg",
  "message": "..."
}
```

不要让模型只能从一段自然语言 stderr 猜错误层级。

### 第 5 步：修成功判定

对文件型工具，不能只判断“子进程退出码为 0”。还要验证：

- 输出路径存在；
- 文件类型和扩展名一致；
- 内容可解析；
- 关键元数据有效；
- 失败时清理半成品。

这一步是 C-02 的核心。

### 第 6 步：重新加载并验证实际注册面

修改本地扩展或配置后：

```text
/reload
```

若修改了安装器、package 清单或本地扩展入口，直接重启 Pi 更可靠。随后检查：

```text
/tools
/tools list
pi list
```

确认模型看到的工具 schema 是新版本，不能只看源码已经改了。

### 第 7 步：运行回归矩阵

至少运行：

```text
正常路径：每个工具一个最小成功调用
边界路径：每个数值字段的 0、负数、缺失、过大值
互斥路径：每个 oneOf 分支和冲突组合
状态路径：不存在 ID、过期 ID、已完成 ID、失败 ID
输出路径：HTML、PDF、PNG 的文件签名与解析
权限路径：不可读目录、仓库外命令、SSRF 拦截
```

只有在成功路径和失败路径都符合预期时，才把修复标为完成。

## 7. 推荐的测试报告格式

以后每次工具审计都用以下格式，方便复现：

```markdown
### TOOL-XXX 工具名

- 调用时间：
- 工具版本/运行配置：
- 输入 JSON：
- 前置状态：文件、仓库、job、responseId
- 预期：
- 实际：
- 退出码/错误码：
- 输出是否完整：是/否，截断位置
- 归类：metadata 不完整 / 工具实现失败 / 目标失败 / 调用错误 / 证据不足
- 根因置信度：高/中/低
- 修复：
- 回归测试：
```

不要只写“FAILED”。必须写清楚失败发生在 schema、工具执行器、子进程、网络目标还是结果验证。

## 8. 当前建议优先级

### P1：先修，直接影响调用

1. Large 模式暴露 `maestro-flow` 的 CLI bin；本次已在 `bin/pi-large` 修复并完成命令验证。
2. `bash_bg` 与 `observe` 的 provider 契约统一。
3. `preview_export` PNG 产物验证和失败回滚。

### P2：随后修，减少模型因隐藏参数规则而失败

3. `readSeek_digest` 的 `end/limit` 互斥 schema。
4. `readSeek_view` 的 outline/vision 条件 schema。
5. `readSeek_view` 的 node/page 输入约束和节点获取流程。
6. Readseek language 的 enum 或自动检测。
7. `get_search_content` 的定位模式互斥 schema。
8. `read` 的 offset/limit 范围校验，以及 0/1 基准对照测试。

### P3：文档与可观测性

9. `conflict` 的 list -> diff -> resolve 状态流程。
10. 为所有工具统一结构化错误码和 artifact 验证字段。
11. 更新 `docs/tools.zh-CN.md` 中与实际工具名、后台管理方式不一致的条目。

## 9. 交付验收标准

修复完成必须同时满足：

- [ ] 模型-facing schema 不再允许已知的互斥参数组合。
- [ ] 所有真正属于 schema 的正整数参数在 schema 和运行时都拒绝 0/负数；对调用方违反已有约束的情况，错误信息清楚。
- [ ] 语言参数不是自由字符串，或明确支持自动检测。
- [ ] `bash_bg` 和 `observe` 要么共享真实 provider，要么从一方移除该组合，不能文档与运行时冲突。
- [ ] PNG/PDF/HTML 的成功消息经过实际 artifact 验证。
- [ ] 每个已确认问题都有失败回归测试和成功回归测试。
- [ ] 测试失败能指出错误层级，不只显示 FAILED。
- [ ] `/reload` 或重启后实际注册面与源码/schema 一致。
- [ ] `git diff --check` 通过。
- [ ] 没有删除或覆盖与本修复无关的用户改动。

## 附录：本次关键原始错误

```text
No observation provider for kind "bash_bg"
cannot combine --end with --limit
Cannot combine outline with visionMode or visionLevel.
Invalid node: expected a non-empty ID.
node root not found
node page:1 not found
Invalid page: expected a positive integer, received 0
unknown language `text`
unknown language ``
findText cannot be combined with offset or limit
conflict diff requires one numbered URI
conflict://1 not found. Run conflict list to refresh conflict numbering.
Permission denied (os error 13)
Blocked internal address ... configure ssrf.allowRanges ...
ENOENT: no such file or directory
```

这些错误必须与调用 JSON 一起保存；单独保存错误文本无法判断是 metadata、执行器、提示注入、PATH、子进程还是目标环境问题。

### 附录：Large 模式 CLI 快速验收

```bash
# 依赖应已由 Large package 安装；这里只验证，不重复盲目安装
bash -n bin/pi-large
PATH="$PWD/large/pi-maestro-large/node_modules/.bin:$PATH" maestro --version
PATH="$PWD/large/pi-maestro-large/node_modules/.bin:$PATH" \\
  maestro search "pi-large update 0.19.0 conflicts" --json

# 真实 Large 启动器会把同一路径注入 Pi 子进程
bin/pi-large --version
```

预期：版本命令返回 `0.5.68`（或当前 package 实际版本），search 返回 JSON；search 结果为空可以是知识库没有条目，但不能出现 `command not found`。
