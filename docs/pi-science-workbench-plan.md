# pi-science-workbench：科研扩展详细设计与实施计划

状态：设计草案，尚未实现或授权安装。目标是在科研项目中增加持久 Python、仿真作业、产物验证和实验记录，同时保持当前 Pi 默认配置与 Large 模式的既有行为。

本文的实现对象是一个可选包 `extensions/pi-science-workbench/`。示例配置、工具名称和数据格式是拟定接口，不代表当前 Pi 已提供这些功能。

## 1. 目标、范围与完成条件

### 1.1 目标

1. 在同一 Pi 会话中连续使用 Python 变量和大型数组，避免反复初始化科学计算环境。
2. 用统一记录管理本地和 SSH 仿真任务，包括输入、运行状态、取消、日志和产物取回。
3. 分别报告进程执行、文件完整性和科学校验的结果，禁止凭退出码判断实验正确。
4. 让每个结果能够关联到明确登记的参数、代码、输入、环境和上游实验。
5. 复用已有工具发现、技能搜索、SoL 和知识记忆，不引入第二套上下文管理。
6. 不启用包时保持现状；启用后不自动启动计算、提交作业或修改环境。

### 1.2 v1 的明确范围

| 项目 | v1 范围 |
| --- | --- |
| 宿主 | Linux；沿用仓库 Node `>=22.19.0`、Pi `>=0.85.0 <0.86.0` 的依赖约束 |
| 科学运行时 | 用户指定的 Python 3.11+ 环境；内核管理代码只依赖 Python 标准库 |
| 数值库 | 用户预先安装；衍射验收示例需要 NumPy，不由扩展安装 |
| 执行后端 | 本地 Linux、通过 OpenSSH 访问的 Linux 主机 |
| 任务形式 | Python 单元执行；明确 executable、argv、输入和输出的独立进程任务 |
| 作业查询 | 显式调用查询工具；不在 Pi 空闲时后台轮询 SSH |
| 科学验证 | 内置完整性校验、结构校验、一个解析解可验证的衍射示例 |
| 交互授权 | 交互模式确认，授权按会话和明确范围保存；无交互授权通道时拒绝新计算 |
| 分发 | 仓库内独立可选包，只在科研项目中加载 |

以下能力不计入 v1：商业求解器专用接口、SLURM/PBS、Windows、任意用户插件执行框架、Jupyter 协议、自动安装依赖、环境事务回滚、全项目文件来源追踪、容器沙箱和自动优化实验循环。

这些排除项影响使用边界：例如 SSH 后端不能宣称具有调度器资源配额；可信宿主执行不能用于防范恶意 Python。若实际项目要求这些能力，应在启用该项目之前扩展设计与验收要求。

### 1.3 完成条件

v1 完成需要同时满足：

- 持久内核、本地作业、SSH 作业、实验记录、校验和技能均完成各自的自动测试。
- 固定的单缝衍射示例完成计算、验证、读取记录和重启后查询。
- 缺输出、不收敛、日志超限、进程中断、SSH 提交回执丢失等故障不会报告成功或重复提交。
- Default、Large、Adaptive、Full、Fast 的相关兼容性检查通过。
- 包未启用和移除包后的回归检查通过，已有用户配置没有被自动改写。
- 有测试证据支持上述结论；未经真实 SSH 测试时，只能声明本地后端完成。

## 2. 必须保留的现有行为

| 现有组件 | 当前职责 | 新包的约束 |
| --- | --- | --- |
| `pi-context-bridge` | 上下文相关集成、RTK 兼容 | 不接管命令改写或结果压缩 |
| `pi-default-workbench` | 工具选择、技能搜索、普通后台任务等 | 注册独立工具，由现有选择器管理可见性 |
| `pi-slim-skills` | 元数据优先的技能发现 | 只提供标准技能资源，不主动注入完整技能正文 |
| `pi-tool-rails` | 工具与 TUI 展示 | 只使用工具自己的 `renderCall`/`renderResult`，不修改全局 UI |
| SoL-Pi | `edit/write then_run`、`obs_recall`、`update_plan`、上下文压缩 | 不注册同名工具、不改变包顺序、不增加压缩机制 |
| Magic Context | 知识和历史 | 不改数据库或 `compaction.enabled=false` 设置 |
| Plan mode | 只读规划和工具允许策略 | 科研执行必须经过现有 `tool_call` 策略，不自动放行 |
| `bash_bg` | 普通后台命令 | 保留原用途；科研作业管理仅处理需要实验契约的任务 |
| Large profile | 独立加载与模式切换 | 不改切换实现，不修改 beautify 的 vendor 副本 |

实施禁止事项：

- 不修改默认安装器的四个本地聚合包清单。
- 不从科研包调用 `setActiveTools()`。
- 不覆盖 `read`、`edit`、`write`、`bash`、`update_plan` 或技能搜索工具。
- 不修改全局 system prompt、思考展示、编辑器、状态容器、快捷键或 Plan 面板。
- 不读取 Pi、Magic Context、SoL 的私有内部状态作为科研执行依赖。
- 不运行安装脚本去迁移用户全局配置。

当前选择器通过已注册工具发现新能力。Adaptive 按需激活，Full 展示未被明确禁用的工具，Fast 保持最小集合；不为科研包追加特殊激活分支。

## 3. 总体架构与代码布局

```text
Pi tool_call policy / existing tool selector
                    |
     +--------------+---------------+
     |              |               |
science_python  science_job  science_artifact   science_status
     |              |               |               |
     +---------- policy + approval + RunStore -------+
                    |
          +---------+----------+
          |                    |
   Local supervisor        SSH adapter
     |          |              |
 Python kernel  CLI job    Remote supervisor
          |                    |
          +--- manifests, logs, artifacts ---+
```

拟定目录：

```text
extensions/pi-science-workbench/
├── package.json
├── package-lock.json
├── tsconfig.json
├── index.ts
├── src/
│   ├── config.ts
│   ├── policy.ts
│   ├── approval.ts
│   ├── session-runtime.ts
│   ├── run-store.ts
│   ├── schemas.ts
│   ├── tools/
│   │   ├── science-python.ts
│   │   ├── science-job.ts
│   │   ├── science-artifact.ts
│   │   └── science-status.ts
│   ├── runtime/
│   │   ├── supervisor-client.ts
│   │   ├── local-jobs.ts
│   │   └── ssh-jobs.ts
│   └── validation/
│       ├── integrity.ts
│       ├── structured-data.ts
│       └── registry.ts
├── python/science_workbench/
│   ├── supervisor.py
│   ├── kernel.py
│   ├── remote_helper.py
│   ├── protocol.py
│   └── validators.py
├── skills/
│   ├── science-run-contract/SKILL.md
│   └── optics-diffraction-check/
│       ├── SKILL.md
│       ├── scripts/rectangular_slit.py
│       └── references/validation.md
├── schemas/
│   ├── config.schema.json
│   ├── run.schema.json
│   └── artifact.schema.json
├── tests/
├── README.md
└── LICENSE
```

依赖决策：

- TypeScript 端使用 Node 标准库、Pi 公开 API、仓库现有 TypeBox 方式。
- Python 管理代码使用标准库；不引入 Jupyter server、IPython 或远程常驻服务。
- SSH 使用系统 OpenSSH，不增加账户、密钥管理或云 SDK。
- 不复制 OpenAI4S 的执行框架；借鉴契约与流程。需要移植实际代码时另行检查许可证和来源。
- `package.json` 声明 `pi.extensions` 和 `pi.skills`；`files` 必须包含 Python、技能和 schema 资源。打包后单独验证资源完整性，不能只测试源码目录。

## 4. 项目配置与环境选择

### 4.1 配置位置

- 项目配置：`<cwd>/.pi/science-workbench.json`。
- 本机覆盖：`<cwd>/.pi/science-workbench.local.json`，建议加入项目忽略规则。
- 运行数据：`<cwd>/.science/`，固定在项目内，不允许配置为项目外目录。
- v1 从明确的项目根目录启动 Pi，不向祖先目录隐式寻找科研配置。
- 没有配置时仍可显示工具说明，但计算调用返回 `configuration_required`，不创建运行目录。

基础配置可以进入版本控制；机器相关 Python 路径、SSH alias 放在本机覆盖文件中。任何配置文件都不能携带密码、私钥或 API token。

拟定基础配置：

```json
{
  "schemaVersion": 1,
  "defaultProfile": "local-python",
  "profiles": {
    "local-python": {
      "transport": "local",
      "python": "/absolute/path/to/project/.venv/bin/python",
      "executionTrust": "trusted-host",
      "environmentAllowlist": []
    }
  },
  "limits": {
    "kernelCellTimeoutSeconds": 120,
    "jobTimeoutSeconds": 3600,
    "maxLocalJobs": 1,
    "maxRemoteJobsPerHost": 1,
    "maxSubmissionsPerGrant": 5,
    "maxToolResultBytes": 16384,
    "maxLogBytesPerRun": 67108864,
    "maxTransferBytesPerRun": 536870912
  }
}
```

SSH profile 的拟定形式：

```json
{
  "transport": "ssh",
  "sshAlias": "lab-optics",
  "python": "/absolute/path/to/venv/bin/python",
  "remoteRunRoot": "/absolute/path/to/user-owned/pi-science-runs",
  "executionTrust": "trusted-host",
  "environmentAllowlist": []
}
```

这些值是资源上限，不是执行许可，也不是操作系统的 CPU/内存配额。提高上限需要重新授权；降低上限只约束后续提交，不暗中取消已运行任务。

### 4.2 加载与验证规则

1. 使用 JSON parser 和 schema 验证，拒绝未知字段、负数、非法路径和重复标识。
2. 基础与本机配置按对象键合并，数组整体替换；验证合并后的完整配置。
3. 解析和固定项目根目录的真实路径。执行前重新检查配置摘要，禁止静默切换 Python 或远程主机。
4. Python 路径必须为明确的绝对路径；不在运行时搜索、创建或切换 Conda 环境。
5. v1 只接受 `executionTrust: "trusted-host"`；不接受未实现的隔离配置，也不静默降级。
6. 工具默认使用当前 profile；调用可以选择已配置 profile，不能临时提供任意主机或 Python 路径。
7. 仅透传经过批准的环境变量名。Pi 的模型凭据和完整宿主环境不继承给 worker。
8. 内核使用无用户站点、无字节码写入的启动选项；环境中的包仍属于用户信任范围。
9. 缺少依赖时返回明确错误及环境位置，不执行 pip、uv 或 conda 安装。

### 4.3 授权

首次有副作用的调用需确认项目、profile、执行能力、超时、提交数量和远程传输范围。

- 授权存在当前扩展实例的内存中；不写入可被模型编辑的配置作为永久许可。
- 同一范围内复用授权，不逐条重复确认 Python 单元。
- trusted-host 授权明确表示代码具有该账户权限。运行目录约束只限制扩展自身的文件操作，不能限制任意 Python。
- 配置摘要、执行器、远程主机或权限范围变化时，原授权失效。同一批准工作流程中的新 Python 单元不逐条重新确认；首次引入外部下载脚本等新来源时重新确认。
- `/tree`、新会话、fork、恢复和 `/reload` 清除执行授权；正常压缩不清除。
- 无可用交互确认通道时，返回 `approval_required`；v1 不提供默认自动批准模式。
- 取消同一会话中已获授权的任务可复用原授权；取消历史远程任务必须重新确认其准确身份。
- 新提交达到授权计数上限后必须再次确认，失败和超时的提交也计入次数。

Plan mode 的工具策略先于这些授权生效。科研包的授权不能放行被 Plan mode 阻止的工具。

## 5. 工具接口

### 5.1 四个工具的分工

| 工具 | 操作 | 是否有副作用 | 主要输入 |
| --- | --- | --- | --- |
| `science_python` | `execute`、`reset` | 是 | `request_id`、`profile`、代码、输入声明、预期输出、超时 |
| `science_job` | `submit`、`poll`、`harvest`、`cancel` | 是；poll 可以联网并更新记录 | `request_id`、`run_id` 或作业规格 |
| `science_artifact` | `verify` | 是；执行验证并写入验证记录 | `request_id`、`run_id`、校验器和参数 |
| `science_status` | `summary`、`runs`、`run`、`kernel`、`artifacts`、`log` | 只读本地 | `run_id`、范围、偏移、返回上限 |

将只读查询独立成工具，避免 Plan mode 按工具名允许查询时同时放行执行。

`science_status` 不创建目录、不启动 Python、不重新计算哈希、不连接 SSH、不更新任务状态。它返回已记录状态和 `last_observed_at`，明确标注远程状态可能过期。

默认只列出当前会话分支关联的实验；通过明确的 `scope: "project"` 或 `run_id` 可以查看同一项目的其他记录。查询其他分支记录不会恢复其内核或执行权限。

### 5.2 请求契约

有副作用的操作都带 `request_id`。以项目、操作类型、profile、`request_id` 形成幂等键，再记录规范化输入摘要。

- 相同键、相同输入：返回原有记录或当前状态，不再次执行。
- 相同键、不同输入：返回 `idempotency_conflict`。
- 调用超时或连接中断：先查询已有请求，禁止更换 ID 自动重试提交。
- 在发送远程提交或启动进程之前，必须先持久化请求保留记录。
- `request_id` 与程序生成的 `run_id` 不同；模型不能通过自选 `run_id` 决定磁盘路径。

Python 执行规格示例：

```json
{
  "action": "execute",
  "request_id": "slit-demo-cell-001",
  "profile": "local-python",
  "code": "from pathlib import Path\nresult = 1 + 1\nprint(result)",
  "inputs": [],
  "expected_outputs": [],
  "timeout_seconds": 30
}
```

独立作业使用 `executable` 和字符串数组 `argv`，不提供拼接后的 shell 命令参数。输入文件由扩展复制到本次运行的 `inputs/`，工作目录固定为本次运行目录。

输出契约至少包含相对路径、是否必需、格式和体积上限。v1 不接受任意 glob，也不自动把整个项目复制到远端。

作业与单元规格还可以声明 `required_validations`，固定必须通过的校验器、参数和阈值。它与输入、输出契约一同保存在不可变的 `spec.json` 中；未声明科学校验的运行不能在执行结束时直接变为 verified。

### 5.3 返回契约

工具结果由有限文本摘要和小型结构化 `details` 组成；不把数组或整份日志放入 `details` 绕过限制。

```json
{
  "schema_version": 1,
  "run_id": "generated-run-id",
  "execution_status": "succeeded",
  "artifact_status": "complete",
  "validation_status": "not_checked",
  "completion_status": "unverified",
  "last_observed_at": "2030-01-01T00:00:00Z",
  "summary": "Execution finished; scientific validation has not run.",
  "manifest_path": ".science/runs/generated-run-id/manifest.json",
  "stdout_path": ".science/runs/generated-run-id/logs/stdout.log"
}
```

示例时间仅展示字段格式。实际时间使用 UTC ISO 8601，不生成固定假时间。

- 执行失败、参数错误、权限拒绝和协议错误按 Pi 工具错误接口抛出错误；错误文本包含稳定错误码及已生成的 `run_id`。
- 科学校验未通过属于已完成验证操作的业务结果，返回 `validation_status: "failed"` 和具体证据，不伪装成工具异常。
- 错误发生前已产生的实验记录、日志和有效产物保留，不因抛出异常而删除。
- 流式更新只报有限进度，不逐条输出仿真器日志；完整日志在受限文件中查询。
- 面向 TUI 的日志摘要移除 ANSI、终端控制序列和非预期超链接；原始日志仍按字节保留。字节分页提供下一偏移，并处理 UTF-8 字符边界。
- 若结果被 SoL 压缩，仍可通过 `run_id` 查询。实验记录不依赖 SoL 的归档 ID。

### 5.4 命令与呈现

仅提供只读 `/science` 命令，显示配置、授权范围、内核状态和作业摘要。不通过命令执行、重置、取消、联网或安装依赖，以免绕过工具调用策略。

科研工具只渲染自己的调用和结果：折叠态展示实验 ID 与必要状态，展开态展示验证摘要及日志位置。初版使用 Pi 的标准组件，不增加快捷键、常驻状态栏或自定义全局布局。

## 6. 持久 Python 与会话生命周期

### 6.1 进程结构与协议

每个 Pi 扩展实例最多运行一个持久内核。v1 的 `science_python` 仅支持 `transport: "local"`；SSH 计算通过独立作业执行，不提供远程持久交互内核。不同本地 profile 之间不同时保留内核；切换前明确关闭原内核，并报告变量已丢失。

采用独立 Python supervisor 管理 kernel 子进程：

- Pi 与 supervisor 使用专用控制管道；kernel 的 stdout/stderr 使用独立管道。
- 控制消息采用带长度限制的 JSON 帧，包含 `protocol_version`、`request_id`、`generation` 和消息类型。
- 输出代码不能通过 `print()` 注入控制协议；不反序列化 pickle，不从 Python 接收可执行对象。
- supervisor 能在 kernel 的本地库阻塞时继续计时和发送终止信号。
- 同一内核一次只执行一个单元；并发第二次执行返回 `kernel_busy`，不建立无界等待队列。
- 每次执行记录代码、输入引用、单元序号、前一单元 ID、时间、日志和错误。
- 工作目录切换到本次运行目录；跨单元文件使用明确的绝对路径或产物引用，避免依赖前一单元的相对路径。
- worker 不支持顶层 await、Jupyter magic 或后台 daemon；这些输入返回明确的不支持错误。

内核以共享 globals 执行 Python，保留导入和变量。工具默认返回 stdout 摘要；数组概览由用户代码显式计算，不自动调用任意对象的 `repr()`。

普通 Python 异常不回滚已修改的变量。记录 `state_may_be_partial: true`、异常位置和代码，禁止自动重试；下一次调用必须根据该状态选择继续检查或显式重置。中断和超时的处理更严格，见下一节。

输入序列与环境记录只能帮助复现。随机数、线程行为、未登记文件、网络和隐藏状态仍可能导致差异；文档不得宣称任意单元都可完全复现。

### 6.2 超时、中断与退出

- 使用单调时钟计时，接受 Pi 的 `AbortSignal`。
- 停止计算先发送 SIGINT，等待 2 秒；未退出则 SIGTERM，再等待 3 秒；最后 SIGKILL。
- 作业子进程使用独立进程组，清理针对本扩展创建并验证身份的进程组。
- 被中断或超时的持久内核直接失效并关闭，不能把部分执行后的变量标记为可继续使用。
- 下一次执行可在原有效授权范围内新建内核，但必须报告新 `kernel_instance_id` 与状态丢失。
- 本地 supervisor 监测 Pi 控制通道 EOF；Pi 意外退出时也清理其受管进程组。
- 任意用户代码主动脱离进程组、启动服务或修改系统不在可信宿主清理保证内；需要此类代码时必须另行设计隔离。

### 6.3 生命周期矩阵

| Pi 事件或操作 | 内核 | 本地作业 | 远程作业 | 授权与引用 |
| --- | --- | --- | --- | --- |
| 首次加载、`session_start` | 不启动 | 不启动 | 不查询 | 读取分支引用，等待授权 |
| 正常对话 | 保留 | 继续 | 继续 | 保留 |
| 正常上下文压缩 | 保留 | 继续 | 继续 | 保留，磁盘记录不依赖压缩摘要 |
| `/tree` 导航 | 关闭并失效 | 取消受管本地任务 | 不取消 | 提升 generation，清除授权，重建分支引用 |
| 新会话、切换、fork、恢复、`/reload` | 旧实例清理，新实例按需创建 | 旧实例清理 | 不取消 | 不继承可执行授权 |
| `session_shutdown` | 幂等清理 | 幂等取消 | 不取消 | 刷新本地记录，保留远程身份 |
| Pi 意外退出 | supervisor 处理 EOF | supervisor 处理 EOF | 继续直到终止或超时 | 恢复时只读取记录 |

`session_tree` 处理先增加 generation，再清理进程；迟到的响应可以写入原实验日志，不能更新新分支的当前内核、结果或状态栏。

使用 `pi.appendEntry()` 保存小型实验引用，使用 `ctx.sessionManager.getBranch()` 重建当前分支可见集合。运行文件是主要记录，session entries 不承载大数组、全部日志或秘密。

不会根据历史代码自动重放内核，也不会因为恢复会话而重新提交任务。

## 7. 本地与 SSH 作业

### 7.1 本地提交

1. 校验配置、授权、输入和输出契约，检查并发与提交预算。
2. 生成 run ID，原子保留幂等请求；复制明确登记的输入并计算哈希。
3. 保存不可变规格和环境说明，再启动 supervisor。
4. supervisor 创建进程组，记录进程身份、开始时间和执行器摘要。
5. 返回作业回执，后续通过 `science_job.poll` 查询。
6. 进程结束后自动进行声明产物的基本完整性检查；科学校验由明确请求触发。
7. 超时和日志超限在 supervisor 中执行，不能依赖模型继续调用工具。

本地作业随所属扩展实例退出而取消，v1 不提供脱离 Pi 的本地常驻任务。长时间脱离终端运行使用已授权的 SSH 后端。

### 7.2 SSH 的 stage → submit → poll → harvest

**连接前提**：用户已配置 SSH alias 和 host key；禁止自动接受未知主机密钥、关闭严格校验、转发 agent 或复制私钥。

**Stage**：

- 将规格、批准的输入和包内 remote helper 写入用户拥有的远程运行根目录。
- 使用版本化 helper 与源文件哈希；不安装系统包，不修改 shell 启动文件。
- staging 目录写完并校验后再原子转换为可提交状态。
- 拒绝 `..`、绝对输入路径、符号链接、重复路径和超限文件；不使用不受限制的 tar 解包。

**Submit**：

- 远程 supervisor 在启动程序前原子保留 `request_id`。
- 使用 Linux 标准的双 fork 和 `setsid` 脱离 SSH，关闭继承的控制描述符，重新设置 stdin/stdout/stderr；作业另建进程组。只有 supervisor 写入 ready 回执后才报告提交成功。
- 返回远程 run ID、主机 alias、supervisor 版本和作业身份。
- supervisor 独立管理超时、日志限额和进程组，正常 SSH 断开不影响这些限制。若远端策略禁止脱离登录会话运行，则提交失败，不退回不受监督的后台命令。
- 提交回执丢失时，本地标记 `unknown`，下次按同一请求 ID 查找；禁止自动再次启动。

**Poll**：

- 只在明确的 `science_job.poll` 调用中联网，记录观察时间。
- 单次查询失败不覆盖已经确认的终态，也不把任务误判为失败。
- 对非终态任务，连接中断显示 `unknown`，同时保留 `last_known_execution_status`。
- 不启动常驻轮询器，不因会话启动、只读查询或 UI 渲染而访问远端。

**Harvest**：

- 只取回已声明的输出和受限日志，使用分块传输与显式体积上限。
- 下载到本地临时文件，计算哈希，通过后原子移动到产物目录。
- 中断后保留未完成标记；重复 harvest 不覆盖已经验证的同内容产物。
- 大型输出可以留在远端，记录 location、大小、远端哈希和取回状态。
- 未取回的文件不能标记为本地已验证；远端报告与本地验证分字段表示。

**Cancel**：

- 根据 run ID 和 supervisor 保存的进程身份取消，不能接受模型提供的任意 PID。
- Linux 下校验启动时间和进程组身份，避免 PID 重用误杀。
- 远程联系失败时返回取消未确认；只有 supervisor 确认终止后才记录 `cancelled`。

### 7.3 SSH 命令构造

本地以参数数组启动 OpenSSH；远程 shell 仍需单独处理，不能误认为本地 argv 已消除远程注入风险。

固定、审阅过的 bootstrap/helper 接收 stdin 上的结构化协议。运行参数、输入清单与用户代码通过协议发送，不拼接进远程 shell 命令。远程 Python 路径只来自已批准配置，使用统一转义函数并拒绝控制字符。为路径中的空格、引号、换行及恶意 alias 编写注入测试。

文件传输同样经过 helper 的受限路径接口；不引入任意远程路径读写接口。

## 8. 实验记录与产物格式

### 8.1 存储结构

```text
.science/
├── requests/<request-key-hash>.json
└── runs/<run-id>/
    ├── spec.json
    ├── manifest.json
    ├── events.jsonl
    ├── code/
    ├── inputs/
    ├── logs/
    │   ├── stdout.log
    │   └── stderr.log
    ├── artifacts/
    └── validations/<validation-id>.json
```

- `spec.json` 保存不可变规格，不能在执行后修改参数使记录符合结果。
- `manifest.json` 是当前快照；临时文件与目标同目录，写完同步后原子替换。
- `events.jsonl` 追加保存状态变化与来源；同一运行由唯一 owner 写入。
- supervisor 的原始状态记录与 Pi 的本地观察分开，防止两个进程竞争写同一事件文件。
- 请求保留使用排他创建；发现半写入记录时返回待恢复状态，不能覆盖后重新执行。
- 独立会话使用不同 run ID 和 owner；历史实验不会因同名参数被覆盖。
- 目录默认只供当前用户访问；不自动清理、不删除失败记录、不自动上传。
- 忽略规则和磁盘清理策略由用户选择，扩展不自动改写 `.gitignore`。

JSONL 最后一条被崩溃截断时可作为未完成尾项处理；中间损坏、版本不支持和缺少必需字段必须报告，不跳过后继续推断成功。

### 8.2 最小 manifest 字段

| 字段 | 用途 |
| --- | --- |
| `schema_version`、`run_id`、`request_id` | 版本、身份和幂等查询 |
| `project_realpath`、`session_id`、`origin_entry_id` | 来源会话与分支；不能仅用当前 cwd 字符串识别 |
| `profile_id`、`profile_digest`、`worker_digest` | 配置与执行器身份 |
| `kernel_instance_id`、`execution_index`、`previous_cell_run_id` | 持久内核的顺序依赖 |
| `parent_run_ids`、`input_artifact_ids` | 明确登记的实验关系 |
| `parameters`、`units`、`random_seed` | 参数、单位、已声明随机种子 |
| `code`、`inputs` | 路径、大小、哈希和快照位置 |
| `environment` | Python、平台、指定依赖、求解器版本；不保存凭据值 |
| `remote_identity` | SSH alias、远程 run ID、已验证的作业身份 |
| `started_at`、`ended_at`、`duration_ms` | UTC 时间与单调计时耗时 |
| `execution_status`、`artifact_status`、`validation_status` | 三类独立状态 |
| `completion_status`、`termination_reason` | 完成判定及失败或中断原因 |
| `last_observed_at`、`last_known_execution_status` | 区分缓存与真实最新状态 |
| `artifacts`、`validations`、`log_limits` | 产物、验证和日志是否完整 |

无法可靠获取的环境字段记录 `unknown` 及原因。版本查询也可能执行程序，不能在未经授权的启动阶段运行求解器探测。

### 8.3 产物记录

每个产物至少包含：`artifact_id`、`role`、`format`、`relative_path`、`location`、`size_bytes`、`sha256`、`hash_source`、`verification_state`。

表格或数组额外记录适用的 shape、dtype、列名、单位和坐标约定。依赖专门解析器的格式必须先检查依赖，不把扩展名当作格式验证。

不主动加载 pickle 或允许对象反序列化的 NumPy 数据。解析过程有体积、元素数量和超时上限。

来源关系只覆盖显式登记内容。任意代码读取的未声明文件、网络内容与系统状态无法由这个方案完整追踪。

## 9. 状态机与校验契约

### 9.1 状态

- `execution_status`：`pending | running | succeeded | failed | timed_out | cancelled | unknown`。
- `artifact_status`：`not_checked | complete | incomplete | invalid | unknown`。
- `validation_status`：`not_checked | passed | failed | unknown`。
- `completion_status`：`pending | verified | rejected | unverified`。

执行阶段另存 `phase`，例如 staging、submitting、running、harvesting；不使用它代替执行结果。

完成判定按下表从上到下匹配；已确认的失败优先于待执行状态：

| 条件 | `completion_status` |
| --- | --- |
| 已确认执行失败、超时、取消、必需产物缺失或无效、科学校验失败 | `rejected` |
| 执行已成功、必需产物完整、要求的科学校验全部通过 | `verified` |
| 明确处于 pending 或 running，且尚无已确认失败 | `pending` |
| 输出尚未验证、没有科学校验、联系丢失或证据不足 | `unverified` |

无科学校验的普通计算即使退出码为 0，也保留 `unverified`。摘要可以准确报告“执行成功、产物完整”，不能写“科学结果已验证”。

缺少必需输出时保留真实 `execution_status: "succeeded"`，同时报告 `artifact_status: "incomplete"`、`completion_status: "rejected"` 和 `termination_reason: "outputs_unverified"`。

### 9.2 校验层级

| 层级 | 检查 | 能证明什么 |
| --- | --- | --- |
| 完整性 | 文件存在、普通文件、大小、哈希、传输完成 | 指定产物存在且传输内容一致 |
| 结构 | 可解析、字段、dtype、shape、单位、有限数、扫描点数量 | 满足约定的数据格式 |
| 科学 | 解析解、守恒、收敛、基准比较、适用范围 | 满足这次明确声明的科学检验 |

科学校验必须包含校验器 ID/版本、参数、阈值、输入哈希、观测值、结论和失败原因。`completion_status` 只使用与原规格中 `required_validations` 完全匹配且基于当前产物哈希的结果。

额外校验可以生成新记录，但不能靠降低阈值覆盖原契约的失败。修改必需阈值需要新的实验规格与 run ID，并记录其父实验；原结果与失败记录保留。没有预先声明科学校验的历史运行可以补充检查证据，仍保持原契约的 unverified 标记。

v1 内置校验器：

- 必需文件、大小限制与 SHA-256。
- JSON/CSV 的字段、行数和有限数检查。
- 数值数组的 shape/dtype/有限数检查；NumPy 数据禁止 `allow_pickle=True`。
- 单缝衍射解析解误差、网格加密差异和适用采样区间检查。

RCWA/FDTD 能量守恒、网格收敛、CD/EPE 等列为后续项目适配的校验契约，不在没有实际求解器和定义时提供伪通用通过结果。

科学校验器可以执行计算，必须使用科研执行权限和相同的超时、日志限制。`science_status` 只读取已保存的校验结论。

## 10. 安全、资源与数据边界

### 10.1 可信宿主执行

Pi 的项目可信状态、工具调用批准和子进程不是沙箱。配置中的路径限制只保护扩展管理的复制、记录、取回等操作；Python 和用户程序仍可能访问账户可访问的其他资源。

v1 不执行不可信来源的脚本，不提供“禁止网络”或“只能写实验目录”的虚假保证。需要这些保证时，必须增加容器或等效隔离后端，并验证网络、挂载、资源和进程退出行为；不能只增加配置字段。

### 10.2 秘密与隐私

- 不读取或传输 Pi provider token，不复制完整环境变量，不将 SSH 私钥写入项目。
- 环境清单只记录批准的变量名；许可证变量值不写入 manifest。
- 不自动同步实验数据到云端或其他知识库；SSH 输入清单在批准范围内明确展示。
- stdout/stderr 可能包含程序主动打印的秘密。只允许可信程序，展示明确警告；输出过滤不能作为防泄密保证。
- 不为存储敏感数据承诺加密。项目确有保密要求时，需要用户提供满足要求的目录与主机。

### 10.3 限额与错误处理

- 16 KiB 是默认单次模型可见结果上限；长日志通过字节偏移分页，标注截断和总大小。
- 日志达到 64 MiB 默认上限时停止任务并报告 `log_limit_exceeded`，不无限占用磁盘。
- 传输默认累计不超过 512 MiB；超过时保持远端产物引用，要求明确扩大范围。
- 超时、并发数和提交预算独立检查；未知远程任务在澄清前继续占用对应提交额度。
- 磁盘写入失败时停止启动新任务，并尽力停止本地在运行任务；不得只在内存中假装已持久化。
- 日志和取回限额不限制任意程序在宿主上产生的全部文件。总磁盘、CPU 和内存硬配额需要操作系统或隔离后端支持，不计入 v1 保证。
- 远程 supervisor 自身崩溃或主机重启时，作业可能失去监督。查询必须返回 unknown 并显示需要检查的身份；v1 不具备调度系统的高可用与自动恢复保证。
- 文件系统检查不能防止同账户恶意进程的所有竞态；此方案假设项目与运行账户可信。

## 11. 技能与光学验收示例

### 11.1 技能资源

`science-run-contract` 描述参数单位、输入快照、输出契约、校验规则和失败报告。`optics-diffraction-check` 提供固定的可验证计算，用于检验科研扩展工作流程。

两者使用标准 `SKILL.md` frontmatter，保持默认搜索允许列表不变，通过 `search_skill_bm25` 搜索后加载。技能正文不自动执行脚本或启动内核。

不增加自定义网络权限字段并声称 Pi 会执行这些字段。项目输入中的指令、日志和远端消息均作为数据处理。

### 11.2 单缝 Fraunhofer 衍射验收

模型限定为一维、标量、均匀照明的矩形孔径。它用于验证运行与证据流程，不模拟完整光刻成像、偏振、掩模三维效应或光刻胶。

固定输入：

- 真空波长 `lambda = 193e-9 m`。
- 孔径宽度 `a = 2e-6 m`。
- 计算窗口 `L = 32e-6 m`。
- 两个采样规模 `N = 4096`、`8192`，使用像素中心采样：`dx = L/N`、`x_j = (j - N/2 + 0.5) * dx`，孔径条件为 `|x_j| < a/2`。
- 只评价 `|f| <= 3/a` 且 `|lambda * f| <= 1` 的频率范围。
- 失败用例固定为同一窗口下 `N = 64`，沿用相同解析误差阈值。

解析参考为归一化强度 `I(f) = sinc(a * f)^2`，其中 `sinc(x) = sin(pi*x)/(pi*x)`。数值结果来自孔径离散 FFT，使用一致的坐标、移位和归一化约定。

预先固定的验收阈值：

- 所有数值有限，中心归一化强度在数值精度范围内为 1。
- 评价范围内相对解析参考的最大绝对强度误差不超过 `1e-3`。
- 两个网格在共同频率点上的最大绝对强度差不超过 `5e-4`。
- 零强度附近使用绝对误差，不使用不稳定的相对误差。

计算阶段预期产物为 `parameters.json` 和两组数值 CSV；验证阶段另行生成 `validations/<validation-id>.json`，不能把尚未执行验证视为计算缺输出。图像为可选，不作为通过条件。

实施时将独立解析参考和上述通过/失败参数固定为回归测试。不得为了通过测试自动放宽阈值；若公式、采样或阈值本身有问题，记录原因并修订契约。

### 11.3 完整工作流程

1. 在临时科研项目启用包，通过现有搜索加载衍射技能。
2. 用户批准明确的本地 profile；第一单元创建孔径和参数。
3. 第二单元复用内核变量，执行两个网格的计算并保存产物。
4. 校验完整性、结构和科学误差，生成 `verified` 记录。
5. 重复同一请求，确认没有新增执行；改变输入并复用 ID，确认被拒绝。
6. `/reload` 后仅查询历史记录，确认不会自动重放且内存变量不可用。
7. 删除一个必需产物的测试副本，确认返回 incomplete/rejected。
8. 使用预先指定的粗网格失败用例，确认科学校验失败并保留证据。
9. 在独立 SSH 测试主机重复作业流程，覆盖取回和断线恢复。

## 12. 分阶段实施计划

阶段顺序用于减少依赖风险；v1 的范围不会因只完成前几阶段而被宣称全部完成。

| 阶段 | 实施内容 | 主要文件 | 完成门槛 |
| --- | --- | --- | --- |
| P0：包与契约 | 包 manifest、锁文件、schema、配置解析、空闲注册、只读状态工具 | `package.json`、`schemas/`、`src/config.ts`、`index.ts` | 未启用与启用空闲状态均无进程、网络和运行目录写入；包可独立打包 |
| P1：记录与权限 | RunStore、幂等保留、原子快照、事件记录、授权和路径策略 | `src/run-store.ts`、`policy.ts`、`approval.ts` | 并发请求、崩溃残留、路径穿越和授权失效测试通过 |
| P2：持久内核 | Python 协议、supervisor、顺序执行、日志、取消、生命周期 | `python/`、`session-runtime.ts`、`science-python.ts` | 变量复用、超时、原生阻塞、会话切换和 Pi 崩溃清理通过 |
| P3：本地任务与校验 | 进程任务、输入快照、产物完整性、验证记录 | `local-jobs.ts`、`validation/`、`science-artifact.ts` | 正常、缺输出、坏数据、日志超限、取消都返回准确状态 |
| P4：SSH 任务 | stage/submit/poll/harvest/cancel、远程 supervisor、注入防护 | `ssh-jobs.ts`、`remote_helper.py` | 在真实 SSH 测试端点完成断线、幂等提交、身份校验和传输完整性测试 |
| P5：科研技能 | 两个技能、衍射示例、解析参考与记录查询 | `skills/`、示例测试 | 本地和 SSH 的完整示例通过；失败用例结论正确 |
| P6：兼容与发布 | 模式矩阵、隔离配置启动、打包安装、移除与使用文档 | `tests/`、`README.md`、包内验证脚本 | 第 13 节验收完成，默认配置与安装器不变 |

每阶段交付实现代码、测试和简短使用说明。失败时修复当前阶段，不通过更改全局配置、覆盖现有工具或关闭安全检查绕过问题。

## 13. 测试与回归矩阵

### 13.1 自动测试

| 范围 | 必测案例 |
| --- | --- |
| 配置 | 缺文件、非法 JSON、未知字段、错误版本、路径变化、缺 Python、缺 NumPy、未支持的 isolation 请求 |
| 工具协议 | 必需字段、非法 action、结果大小、错误码、request ID 冲突、AbortSignal |
| 幂等 | 同请求并发、保留后崩溃、提交后回执丢失、重复 harvest、不能重复执行 |
| 文件安全 | `..`、绝对产物路径、符号链接、重复文件名、超大文件、半写入快照、JSONL 损坏 |
| 内核 | 变量复用、异常后记录、单元中断、超时、原生代码阻塞、stdout 控制字符、错误协议帧 |
| 生命周期 | session start/tree/shutdown、fork/reload、迟到响应、generation 切换、Pi 意外退出 |
| 作业 | 并发上限、提交预算、日志限额、磁盘失败、取消确认、PID 重用保护 |
| SSH | 不可达、主机密钥不匹配、路径转义、stage 中断、提交回执丢失、远程超时、传输哈希不一致 |
| 科学验证 | 正确结果、缺输出、NaN/Inf、列缺失、单位错误、粗网格、阈值变更留下新记录 |
| 数据声明 | 未取回输出不能标为本地验证；未运行科学验证不能标为 verified |

Python 测试优先使用 `unittest`；TypeScript 测试沿用仓库 Node 测试风格。科学示例测试明确依赖 NumPy，与标准库协议测试分开。

### 13.2 Pi 兼容性

| 场景 | 验收要求 |
| --- | --- |
| 包未加载 | 当前工具清单、提示词和启动行为不变 |
| 包已加载但无科研调用 | 不启动 worker、不连接 SSH、不写 `.science/` |
| Adaptive | 一次工具搜索可匹配并按已有规则激活，不扩大匹配集合 |
| Full | 已启用科研工具直接可用，不重新添加 `search_tool_bm25` |
| Fast | 科研工具不加入最小集合 |
| 明确禁用 | 搜索和生命周期刷新都不能重新启用被禁用工具 |
| Plan mode 默认 | 科研执行工具保持未获允许；被拦截调用不产生文件或进程 |
| Plan mode 允许查询 | 用户只选择 `science_status` 时仍不能执行、重置或联网 |
| SoL | `edit/write` 保持 `then_run`，`update_plan`/`obs_recall` 保持原作用，科研结果被压缩后仍能查询 |
| Magic Context | 原配置、数据库和工具不变；不产生另一套压缩机制 |
| `bash_bg` | 普通后台任务的工具接口和结果不变 |
| TUI | 科研工具展开/折叠正常；思考显示、Plan 位置、比例条、状态栏没有变化 |
| Large | 使用独立测试配置验证可选加载；不改变 Large 切换和 vendor 校验结果 |
| 无交互模式 | 查询可用；未经批准的执行返回 approval_required，不等待无限确认 |
| 移除包 | 重启后无科研工具或残留本地进程，历史实验仍可读 |

Plan mode 对第三方工具有独立允许策略。不得通过修改其配置把所有科研工具默认加入；手工批准执行工具属于明确的用户操作，不计为默认只读保证。

### 13.3 拟定检查命令

以下命令在实现后执行，当前文档交付不代表它们已经运行：

```bash
npm --prefix extensions/pi-science-workbench ci --ignore-scripts
npm --prefix extensions/pi-science-workbench test
npm --prefix extensions/pi-science-workbench run typecheck
npm --prefix extensions/pi-science-workbench pack --dry-run
python3 -m unittest discover -s extensions/pi-science-workbench/tests/python
node scripts/sync-large-beautify.mjs --check
node scripts/verify-install-regressions.mjs
```

另在临时项目和临时 Pi 配置中执行真实工具加载、交互授权及 SSH 测试，不对用户当前设置做原地实验。测试 SSH 端点必须由用户指定或在批准的本地测试设施中创建。

仓库完整校验可以使用 `node scripts/verify-repository.mjs`，但它会遍历其他 `extensions/pi-*` 包。若无关目录缺锁文件或依赖，先报告阻碍并运行受影响包的独立检查；`--skip-install` 仅跳过安装，不保证这些目录能通过测试或类型检查。

仓库根没有被追踪的 `package-lock.json`，CI 不使用默认根目录 npm cache。新增包应具有自己的锁文件。若实际修改了 `pi-tool-rails`，必须同步 Large vendor；本计划不需要这项修改。

## 14. 启用、禁用与恢复

### 14.1 启用流程

1. 完成 P0–P6，在临时配置验证打包内容。
2. 用户确认实际项目根目录、Python 环境和可信宿主执行边界。
3. 在项目级 `.pi/settings.json` 的既有 packages 数组追加该包，保留其他字段和顺序；操作前备份。
4. 不把包加入全局 packages，不修改默认安装器，不改变 SoL 的位置。
5. 编写项目科研配置；必要时由用户将运行目录和本机配置加入忽略规则。
6. 重启或 `/reload` 后检查工具发现与只读状态；首次计算再单独授权。

package source 使用 Pi 支持的本地包路径或后续正式发布的固定版本。具体路径按项目部署位置填写，不把本机绝对路径硬编码到可共享配置中。

### 14.2 正常禁用

- 先查看远程任务列表，明确选择保留运行或通过工具逐个取消。
- 从项目包配置中移除该包并 `/reload`；本地 supervisor 清理受管进程。
- 保留 `.science/` 与远程产物，不自动清理实验数据。
- 远程任务继续由其 supervisor 管理超时；禁用包不等于取消远程任务。

### 14.3 异常恢复

- 本地崩溃：核对 supervisor 已退出；恢复界面显示旧内核不可用，未确认作业状态为 unknown。
- SSH 中断：按主机和请求 ID 查询，不以新 ID 重提。
- 记录损坏：只读展示错误与文件位置，不自动重建可能导致重复执行的请求保留记录。
- 新版 schema：旧版拒绝不支持的写入；迁移必须显式执行、备份原文件，并有回滚测试。
- 不执行 `git reset --hard`、`git clean` 或覆盖用户配置来恢复扩展。

## 15. 实施前提与决策边界

本计划已确定包结构、四个工具、存储格式、授权策略、可信宿主模式、Linux 与 SSH 范围、超时处理和验收方法，通用实现不需要先决定商业仿真器。

实施启动前需要确认的外部条件只有：

1. 批准创建和测试独立包；本次文档请求不等于安装授权。
2. 提供或批准创建独立测试 Python 环境；不能修改用户现有研究环境来凑齐依赖。
3. 提供或批准 SSH 测试端点，否则 P4 与远程验收保持未完成。
4. 实际科研项目启用时接受可信宿主边界；若要求不可信代码隔离，先完成隔离后端设计。

接入真正的光刻工作流程时，再针对所用工具确定求解器调用接口、许可证变量、参数单位、产物格式与科学验收阈值。不得在这些条件未知时声称已经支持某个 RCWA/FDTD/OPC/ILT 工作流程。

## 16. 接口依据与阅读入口

以下资料用于实施时复核，不替代测试。

### 本仓库

- [Default profile](default-profile.md)：SoL、Magic Context、工具与技能发现的职责。
- [扩展清单](../extensions/EXTENSION_INVENTORY.md)：包清单与兼容基线。
- [工具选择实现](../extensions/pi-default-workbench/deferred-tools/tool-selection-state.ts)：模式与工具激活规则。
- [工具搜索实现](../extensions/pi-default-workbench/deferred-tools/search-tool-bm25.ts)：搜索匹配与激活。
- [技能搜索实现](../extensions/pi-default-workbench/skill-search.ts)：技能来源和会话状态。
- [工具结果呈现](../extensions/pi-tool-rails/result-bridge.ts)：现有结果增强的接入边界。
- [仓库校验脚本](../scripts/verify-repository.mjs)：包依赖、测试、打包与 vendor 检查。

### Pi 公开文档与已安装扩展

以当前安装的 `@earendil-works/pi-coding-agent` 包为基准：

- `docs/extensions.md`：工具注册、错误、生命周期、会话 entry 和命令。
- `docs/skills.md`、`docs/packages.md`：技能资源、包声明和项目加载。
- `docs/security.md`、`docs/containerization.md`：项目可信与运行隔离的边界。
- `examples/extensions/dynamic-tools.ts`：动态工具注册。
- `examples/extensions/todo.ts`：分支状态恢复示例，仅借鉴状态存储方式，不增加 Todo 功能。
- 已安装 `@narumitw/pi-plan-mode/src/plan-mode.ts` 的 `tool_call` 处理：注册工具、活跃工具及允许策略的独立检查。

### OpenAI4S 的相关设计

- [架构](https://github.com/PKU-YuanGroup/OpenAI4S/blob/main/docs/architecture.md)
- [技能](https://github.com/PKU-YuanGroup/OpenAI4S/blob/main/docs/skills.md)
- [远程计算](https://github.com/PKU-YuanGroup/OpenAI4S/blob/main/docs/compute.md)
- [包结构](https://github.com/PKU-YuanGroup/OpenAI4S/blob/main/docs/package-architecture.md)

借鉴持久科学执行、文档化技能、显式产物契约和 stage/run/harvest。上述链接随上游变化；若开始移植实现代码，需记录实际读取的 commit 与许可证。本文没有把上游文档描述当作本项目已经通过验证的能力。
