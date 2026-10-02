# Fuck My Shit Mountain Audit Report

**Project:** pi_config
**Audit mode:** full
**Date:** 2026-10-02
**Reviewer:** AI assistant

---

## 1. Executive Summary

本报告记录修复前的当前工作树，基线提交为 `501624ae6c619e00f4186df6705b55426b106908`；现有未提交修改均属于审查输入。主机实际安装 Pi 1.0.0。默认 profile 验证命令成功退出；真实伪终端启动成功，官方 TOTAL 为 2079ms，其中 bridge factory 为 810ms。当前没有复现正常启动被阻塞，已确认若干会在失败条件下影响启动或升级的路径。

Pi 原生提供工具 BM25 检索、延迟声明和 MCP 后台连接；技能正文原生按需加载。本地 workbench 仍提供技能检索、工程工具模式、模块动态 import 等独立功能。建议保留这些职责，精简重复提示、启动副作用和失效兼容目标；不因为名称相近而删除整个插件。相关证据来自已安装 1.0.0 的 `docs/codemode.md:32`、`docs/cli.md:172`、`docs/extensions.md:155-160`、`docs/mcp.md:90`、`docs/skills.md:43-45`。

审查采用 612 个候选首方文本文件的目录清单、关键边界追踪、针对性搜索和三组只读审查。覆盖重点是五个默认运行包、安装与发布、全局规则和技能目录。依赖、vendor、虚拟环境、构建产物和锁文件正文不作逐行审计；全部适用维度的覆盖等级见矩阵。评分是风险判断：发布/稳定性/安全权重高于纯风格，未评估维度不计入总分。

### Score Dashboard

```
Security          7.8/10  A  F05 的暴露取决于本机权限；Medium 覆盖不构成安全背书。
Stability         7.0/10  A  正常 TTY 启动成功，但 F02/F04 故障路径未隔离；Medium 覆盖。
Performance       7.2/10  A  约 2.08 秒启动有实测，F03 有可移除下载副作用；Medium 覆盖。
Testing           7.5/10  A  完整基线通过；缺 Pi 1.0 发布与 Windows 故障执行证据。
Maintainability   6.8/10  B  F07/F08 集中在指令与技能所有权，主体模块边界仍清晰；Medium 覆盖。
Design            7.0/10  A  按模块聚合合理，F02/F04 的初始化状态耦合需局部修正；Medium 覆盖。
Release           6.2/10  B  F01/F06/F09 影响升级可靠性；Windows 尚未运行。
Overall           7.0/10  A  局部修复可解决已确认问题，无证据支持整体重写。
```

分数越高越好；10.0 最佳。以上为修复前判断分，不按发现数量机械扣分。

### Finding Statistics

| Severity | Count | Confirmed | Suspected |
|---|---:|---:|---:|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 6 | 6 | 0 |
| Low | 4 | 4 | 0 |
| Info | 1 | 1 | 0 |
| **Total** | **11** | **11** | **0** |

## 2. Project Map

| 组件 | 入口/数据流 | 边界 |
|---|---|---|
| 安装与发布 | install.sh / install.ps1 → install.mjs → packages / settings / skills | 文件写入、备份、外部包更新 |
| context bridge | index.ts、rtk.ts、teammate.ts | 外部模块、协议适配、模型发现、工具权限 |
| workbench | index.ts → deferred-tools / lazy-tools / skill-search | 工具可见性、技能索引、本地模型下载 |
| slim skills | index.ts → 系统提示目录/显式注入 | 元数据压缩与正文注入 |
| tool rails | compact-shell / index / prompt-frame / result-bridge | TUI 生命周期、原生渲染证据、状态面板 |
| 指令与技能 | config/APPEND_SYSTEM.md、skills、deploy-skills | 源与 live 同步、触发范围、参考资料路由 |

未发现全局 `AGENTS.md`；实际全局内容入口为 `~/.pi/agent/APPEND_SYSTEM.md`，来源是仓库 `config/APPEND_SYSTEM.md`。两个 Manim 根路径 resolve 到相同 `.agents/skills` 文件，属于符号链接，不能按重复内容直接删除。仓库有 22 个技能入口，部署名单为 19；active roots 有 24 个唯一名称（不含包自带技能）。

重要命令：`node scripts/verify-repository.mjs --default-profile --skip-install --skip-pack` 通过；`PI_TIMING=1 PI_STARTUP_BENCHMARK=1 pi --no-session` 在伪终端通过。直接重定向版本因无 TTY 被 Pi 拒绝，属于基准调用条件，不计为启动故障。主机没有 `pwsh`。

### Coverage Matrix

| Dimension | Coverage | Evidence inspected | Exclusions / limits |
|---|---|---|---|
| architecture | Medium | 四个聚合包入口、注册顺序、默认/full/adaptive 选择器、真实启动日志 | 独立外部扩展内部架构未逐一审计 |
| security | Medium | 备份权限路径、teammate-contract、bash guard、安装脚本 | 未读取真实凭据；没有外部渗透测试 |
| stability | Medium | 延迟工具初始化、SoL factory、完整基线测试和 TTY 启动 | 未模拟全部网络和系统故障 |
| performance | Medium | embedding 预热、lazy-tools、启动 timing | 单机单次基准；未做长期堆内存分析 |
| testing | High | scripts/verify-repository.mjs --default-profile --skip-install --skip-pack；各包测试 | 没有真实 Windows 运行，跳过安装和 npm pack |
| maintainability | Medium | 全局提示、技能元数据、部署名单、首方包边界 | 大体积科学参考资料只检查触发与入口 |
| design | Medium | factories、loader 状态和全局/局部规则职责 | 不评价纯风格偏好 |
| release | Medium | CI、peer、lock 根元数据、双平台安装入口 | 尚未执行 Windows 和干净安装 |
| documentation | High | 双语 README、default profile、技能入口和官方本地文档 | 不全面校对科学参考资料正文 |
| observability | Medium | PI_TIMING、原始错误、bridge 初始化告警、回归日志 | 没有监控服务或生产告警系统 |
| configuration | High | settings-public、.pi/tool-selector.json、公开 live 配置键、部署源 | 真实密钥值未审计 |
| data-integrity | Medium | 安装备份、archive 覆盖、managed skill 归档 | 没有持久数据库迁移压力测试 |
| privacy | Medium | 备份路径、凭据文件名、全局外部输入规则 | 未打开 auth/models 中真实秘密；外部服务保留政策未审核 |
| accessibility | Medium | tool-rails 键盘、thinking mouse wrapper、plan/widget 测试、窄宽度渲染 | 未做屏幕阅读器与所有终端实机测试 |
| supply-chain | Low | external-packages、包 manifests、CI 和升级策略 | 没有依赖 CVE 数据库扫描，也未逐个审计第三方代码 |
| cost | Medium | embedding 自动下载、提示重复、lazy imports | 没有计费 API 调用或费用账单 |
| ai-safety | Medium | teammate 合同验证、真实工具错误展示、外部内容与授权规则 | 未执行攻击性 eval 或调用远端模型 |
| fallback | Medium | embedding BM25 fallback、可选导入、bridge 错误路径 | 供应商内部回退路径排除 |
| testing-authenticity | Medium | 真实 SDK 集成、filesystem fixture、source 文本断言、dry-run | 现有测试绿不等于覆盖安装失败和 Windows |
| type-safety | Medium | 包 typecheck、Pi API imports、teammate schema | 旧 peer 下的通过不代表 1.0 类型兼容 |
| frontend-state | Medium | TUI 状态归属、session hooks、plan 和 thinking 回归 | 项目无 React/DOM；不套用浏览器指标 |
| backend-api | Not assessed | 项目为 CLI 配置与扩展，未提供独立 HTTP 后端 | 模型客户端和工具输入已在安全/配置维度检查 |
| dependency-weight | Medium | 动态 imports、embedding 模型、bridge startup timing | 没有全量安装大小/传递依赖统计 |
| code-consistency | Medium | 首方入口、相邻测试、错误处理与版本声明 | 不逐字统一第三方来源风格 |
| comment-coverage | Low | 入口注释、安装文档、技能说明抽样 | 未对全部 612 个候选文件逐行计算注释比例 |
| concurrency | Medium | Todo 初始化标志、lazy wrapper promises、会话重载 | 没有长时间并发压力测试 |


### 原生能力与插件保留决策

| 能力 | 现有来源 | 决策 |
|---|---|---|
| 工具 BM25 / deferred schemas | Pi tool_search / codemode | 原生优先；full 模式已隐藏多余本地搜索入口 |
| 工程工具模式与允许/禁用策略 | workbench selector | 保留；原生搜索不承担工程策略 |
| 技能元数据 search/load | workbench skill-search | 保留；与工具索引的检索对象不同 |
| 技能目录压缩与显式正文注入 | slim-skills | 保留压缩，默认空注入名单；合并重复提示 |
| 模块动态 import | workbench lazy-tools | 保留；schema 延迟与代码导入不同 |
| SoL / RTK / TUI | bridge / rails | 保留已有配置；隔离初始化失败，不动用户的原始证据与比例条偏好 |

## 3. Top Risks

| 优先级 | 发现 | Severity | 影响 |
|---|---|---|
| 1 | F01 | Medium | 当前安装版本与发布验证版本脱节 |
| 2 | F05 | Medium | 安装失败留下权限过宽备份 |
| 3 | F02 | Medium | 可选依赖失败扩散到独立 bridge 功能 |
| 4 | F03 | Medium | 离线启动仍可下载模型 |
| 5 | F06 | Medium | Windows 无 Git 更新保留退休包 |

## 4. Detailed Findings

### Finding: F01 Pi 1.0 与包声明、验证目标不一致

- Severity: Medium
- Confidence: High
- Category: Release
- Status: Confirmed
- Affected area: peerDependencies / DEFAULT_PI_COMPAT_VERSION
- Evidence:
  - File: `extensions/pi-context-bridge/package.json:48-50；extensions/pi-default-workbench/package.json:52-56；extensions/pi-slim-skills/package.json:13；scripts/verify-repository.mjs:13；.github/workflows/verify-repository.yml:25-26`
  - Function / Module: `peerDependencies / DEFAULT_PI_COMPAT_VERSION`
  - Relevant behavior: 本机为 Pi 1.0.0，而默认聚合包声明 >=0.99.2 <0.100.0，CI 验证 0.99.2。
- Problem: 本机为 Pi 1.0.0，而默认聚合包声明 >=0.99.2 <0.100.0，CI 验证 0.99.2。
- Why it matters: 新安装严格解析 peer 时版本不匹配；现有启动成功不能证明打包安装和编译声明匹配。
- Realistic failure scenario: 新安装严格解析 peer 时版本不匹配；现有启动成功不能证明打包安装和编译声明匹配。
- Minimal fix: 用本机 1.0.0 验证默认包，再同步 peer、开发依赖、锁文件根元数据和 CI 目标。
- Better long-term fix: 保持当前架构；先验证上述局部修复，不扩大重构范围。
- Regression test suggestion: 1.0.0 SDK 类型检查、实际 ResourceLoader 加载及包内容检查；不只检查版本字符串。
- Estimated effort: 30–60 分钟

### Finding: F02 SoL 加载失败会阻断独立桥接功能注册

- Severity: Medium
- Confidence: High
- Category: Stability
- Status: Confirmed
- Affected area: contextBridge / loadSolPiExtension
- Evidence:
  - File: `extensions/pi-context-bridge/index.ts:21-23；extensions/pi-context-bridge/sol-pi-compat.ts:23-37`
  - Function / Module: `contextBridge / loadSolPiExtension`
  - Relevant behavior: 异步 factory 在安装其他会话钩子之前等待外部 SoL 模块，外层没有故障隔离。
- Problem: 异步 factory 在安装其他会话钩子之前等待外部 SoL 模块，外层没有故障隔离。
- Why it matters: SoL checkout 缺失或导入失败时，同包中的模型发现、Web Access 和协议兼容初始化也被跳过。
- Realistic failure scenario: SoL checkout 缺失或导入失败时，同包中的模型发现、Web Access 和协议兼容初始化也被跳过。
- Minimal fix: 隔离 SoL 初始化错误并保留可见告警；继续注册独立功能；正常启动路径保持原顺序。
- Better long-term fix: 保持当前架构；先验证上述局部修复，不扩大重构范围。
- Regression test suggestion: 注入失败的 SoL loader，断言独立初始化仍可用且告警只针对真实失败。
- Estimated effort: 30–45 分钟

### Finding: F03 Embedding 预热绕过离线约定并在启动时主动下载

- Severity: Medium
- Confidence: High
- Category: Performance
- Status: Confirmed
- Affected area: ensureEmbeddingModel / hybridRank
- Evidence:
  - File: `extensions/pi-default-workbench/index.ts:22-24；extensions/pi-default-workbench/embedding-search.ts:72-102,146-155`
  - Function / Module: `ensureEmbeddingModel / hybridRank`
  - Relevant behavior: session_start 默认启动 detached 模型下载；仅检查自定义禁用变量，没有遵循 PI_OFFLINE。
- Problem: session_start 默认启动 detached 模型下载；仅检查自定义禁用变量，没有遵循 PI_OFFLINE。
- Why it matters: 用户 --offline 启动且本地模型未缓存时，仍可能启动联网下载进程；没有使用搜索也产生启动副作用。
- Realistic failure scenario: 用户 --offline 启动且本地模型未缓存时，仍可能启动联网下载进程；没有使用搜索也产生启动副作用。
- Minimal fix: 移除无条件启动预热；搜索时按需使用已缓存模型；下载要求明确开启并遵守 PI_OFFLINE，缺少模型使用 BM25。
- Better long-term fix: 保持当前架构；先验证上述局部修复，不扩大重构范围。
- Regression test suggestion: 离线及默认模式不得启动 downloader；显式允许且非离线时允许；失败后词法搜索仍有结果。
- Estimated effort: 45–60 分钟

### Finding: F04 Todo 延迟加载在首次失败后失去重试机会

- Severity: Low
- Confidence: High
- Category: Stability
- Status: Confirmed
- Affected area: session_start / todoLoaded
- Evidence:
  - File: `extensions/pi-default-workbench/index.ts:21-31`
  - Function / Module: `session_start / todoLoaded`
  - Relevant behavior: 标记 todoLoaded 在 import 成功和注册完成前设为 true。
- Problem: 标记 todoLoaded 在 import 成功和注册完成前设为 true。
- Why it matters: 第一次动态导入失败后，同一扩展实例后续 session_start 直接返回，Todo 一直不可用。
- Realistic failure scenario: 第一次动态导入失败后，同一扩展实例后续 session_start 直接返回，Todo 一直不可用。
- Minimal fix: 成功完成后再置完成标记；并发初始化共用 in-flight promise，失败清除它。
- Better long-term fix: 保持当前架构；先验证上述局部修复，不扩大重构范围。
- Regression test suggestion: 首次导入失败后第二次成功；并发调用只初始化一次。
- Estimated effort: 20–40 分钟

### Finding: F05 安装失败可能遗留权限过宽的配置备份

- Severity: Medium
- Confidence: High
- Category: Security
- Status: Confirmed
- Affected area: backupExistingConfig / securePrivateFiles
- Evidence:
  - File: `install.mjs:433-438,711-733,779`
  - Function / Module: `backupExistingConfig / securePrivateFiles`
  - Relevant behavior: 含私人配置的备份创建与权限收紧分隔在安装流程两端。
- Problem: 含私人配置的备份创建与权限收紧分隔在安装流程两端。
- Why it matters: 父目录允许其他本地用户遍历、源文件权限宽松且安装中途退出时，备份中的令牌文件可能被读取；未发现或输出实际密钥。
- Realistic failure scenario: 父目录允许其他本地用户遍历、源文件权限宽松且安装中途退出时，备份中的令牌文件可能被读取；未发现或输出实际密钥。
- Minimal fix: 在创建备份目录时设置 0700，并在复制前确保权限；敏感文件保护与后续安装成功解耦。
- Better long-term fix: 保持当前架构；先验证上述局部修复，不扩大重构范围。
- Regression test suggestion: 使用宽松 umask 和含伪凭据的临时 fixture，注入后续失败，检查目录和文件权限。
- Estimated effort: 20–40 分钟

### Finding: F06 Windows archive 更新保留新版本已删除的插件

- Severity: Medium
- Confidence: High
- Category: Release
- Status: Confirmed
- Affected area: Copy-RepositoryFromArchive / local package discovery
- Evidence:
  - File: `install.ps1:234-236,259-261；install.mjs:591-605`
  - Function / Module: `Copy-RepositoryFromArchive / local package discovery`
  - Relevant behavior: Copy-Item 覆盖已有目录，未处理新 archive 中消失的文件。
- Problem: Copy-Item 覆盖已有目录，未处理新 archive 中消失的文件。
- Why it matters: 无 Git 的 Windows 安装目录含已退休 pi-* 包时，升级后旧包仍存在，后续扫描可能继续发现它。
- Realistic failure scenario: 无 Git 的 Windows 安装目录含已退休 pi-* 包时，升级后旧包仍存在，后续扫描可能继续发现它。
- Minimal fix: 先完整解压到同盘 staging，验证入口，再保留旧目录备份并切换；失败恢复旧目录，不删除用户数据。
- Better long-term fix: 保持当前架构；先验证上述局部修复，不扩大重构范围。
- Regression test suggestion: fixture 中旧版本含 retired 包，新 archive 不含；验证新目录消失、旧备份保留、切换失败可恢复。
- Estimated effort: 45–90 分钟；本机无 PowerShell，Windows 执行待 CI

### Finding: F07 全局规则与两个技能入口重复叠加工作流约束

- Severity: Low
- Confidence: High
- Category: Maintainability
- Status: Confirmed
- Affected area: global prompt / compactSkillsSection / skill search prompt
- Evidence:
  - File: `config/APPEND_SYSTEM.md:9-21,33-39,50-55；extensions/pi-default-workbench/skill-search.ts:170；extensions/pi-slim-skills/index.ts:85-87`
  - Function / Module: `global prompt / compactSkillsSection / skill search prompt`
  - Relevant behavior: 内容归属、直接定义、复核和 search→load 方法在多个层次重复出现；一律性工具指令增加每轮无关上下文。
- Problem: 内容归属、直接定义、复核和 search→load 方法在多个层次重复出现；一律性工具指令增加每轮无关上下文。
- Why it matters: 一次简单文件修复被引导成额外技能搜索、重复校验或流程说明；修改一处后其他副本仍可冲突。
- Realistic failure scenario: 一次简单文件修复被引导成额外技能搜索、重复校验或流程说明；修改一处后其他副本仍可冲突。
- Minimal fix: 保留授权、安全、事实和交付要求，合并重复风格说明；工具描述承担具体调用方式，全局只给任务相关原则。
- Better long-term fix: 保持当前架构；先验证上述局部修复，不扩大重构范围。
- Regression test suggestion: 检查关键安全规则保留、无强制发现所有技能或递归全文阅读；源与 live 文件内容一致。
- Estimated effort: 30–60 分钟

### Finding: F08 部分技能描述、路由与部署所有权不够准确

- Severity: Low
- Confidence: High
- Category: Maintainability
- Status: Confirmed
- Affected area: skill metadata / required intake / deployManagedSkills
- Evidence:
  - File: `skills/fuck-my-shit-mountain/SKILL.md:2-39；skills/statistical-analysis/SKILL.md:56；skills/statistical-power/SKILL.md:199-201；scripts/deploy-skills.mjs:4-17；~/.agents/skills/manimce-best-practices/SKILL.md:3-9`
  - Function / Module: `skill metadata / required intake / deployManagedSkills`
  - Relevant behavior: 审计描述枚举大量维度且强制询问已可推断的语言和输出；统计技能路由到未安装的 statsmodels/pymc 技能；Manim 描述使用广泛提及触发；审计源没有纳入 managed 部署。
- Problem: 审计描述枚举大量维度且强制询问已可推断的语言和输出；统计技能路由到未安装的 statsmodels/pymc 技能；Manim 描述使用广泛提及触发；审计源没有纳入 managed 部署。
- Why it matters: 常规问题误触发完整审计或用户被额外问答阻塞；无关检索失败；源修复不能同步到 live。
- Realistic failure scenario: 常规问题误触发完整审计或用户被额外问答阻塞；无关检索失败；源修复不能同步到 live。
- Minimal fix: 缩短为任务型描述；推断安全默认值；将统计库引用标为库或文档；明确 owned skills 并同步已授权的实际文件。
- Better long-term fix: 保持当前架构；先验证上述局部修复，不扩大重构范围。
- Regression test suggestion: 解析所有 frontmatter，核对唯一 name、描述长度、路由目标和部署名单；保留必要数学/安全检查。
- Estimated effort: 45–90 分钟

### Finding: F09 README 将可选清理描述为默认行为

- Severity: Low
- Confidence: High
- Category: Release
- Status: Confirmed
- Affected area: installation documentation / cleanPlugins
- Evidence:
  - File: `README.md:178；README.zh-CN.md:178；install.mjs:108,444-464,765-767`
  - Function / Module: `installation documentation / cleanPlugins`
  - Relevant behavior: 文档说每次安装总会删除插件目录和 settings.packages，实际默认为增量更新，只有 --clean-plugins 才清理。
- Problem: 文档说每次安装总会删除插件目录和 settings.packages，实际默认为增量更新，只有 --clean-plugins 才清理。
- Why it matters: 用户依照默认命令排查残留插件时误以为已经清理；也无法准确评估显式清理参数的影响。
- Realistic failure scenario: 用户依照默认命令排查残留插件时误以为已经清理；也无法准确评估显式清理参数的影响。
- Minimal fix: 双语文档写明增量默认、清理参数及备份行为。
- Better long-term fix: 保持当前架构；先验证上述局部修复，不扩大重构范围。
- Regression test suggestion: 对照真实默认参数验证文档；保留 non-TTY dry-run 的回归测试。
- Estimated effort: 15–25 分钟

### Finding: F10 外部包按滚动版本更新，重装结果不完全可复现

- Severity: Info
- Confidence: High
- Category: Release
- Status: Confirmed
- Affected area: external package policy
- Evidence:
  - File: `config/external-packages.txt:3-16；install.mjs:635-684；scripts/verify-install-regressions.mjs:42-56`
  - Function / Module: `external package policy`
  - Relevant behavior: npm 包未钉版本，Git 包追踪上游默认分支，测试也明确保留此策略。
- Problem: npm 包未钉版本，Git 包追踪上游默认分支，测试也明确保留此策略。
- Why it matters: 两次不同日期安装可能获得不同的扩展实现；本次没有建立第三方供应链或 CVE 无风险结论。
- Realistic failure scenario: 两次不同日期安装可能获得不同的扩展实现；本次没有建立第三方供应链或 CVE 无风险结论。
- Minimal fix: 保留已选择的滚动更新策略，说明边界并在升级前保留快照；未经用户决策不擅自改为固定旧版本。
- Better long-term fix: 保持当前架构；先验证上述局部修复，不扩大重构范围。
- Regression test suggestion: 验证安装前备份和恢复说明；记录实际安装版本用于对照。
- Estimated effort: 15 分钟文档核对；更改更新策略需另行决定

### Finding: F11 旧 SoL 配置迁移拒绝当前 bridge 注册方式

- Severity: Medium
- Confidence: High
- Category: Configuration
- Status: Confirmed
- Affected area: orderSolFirst
- Evidence:
  - File: `scripts/configure-default-sol.mjs:15-19；extensions/pi-context-bridge/index.ts:21-23`
  - Function / Module: `orderSolFirst`
  - Relevant behavior: 迁移函数要求 settings.packages 中恰好有一个独立 SoL-Pi Git 注册；当前默认由 bridge 从 checkout 注册，没有独立包条目。
- Problem: 迁移函数要求 settings.packages 中恰好有一个独立 SoL-Pi Git 注册；当前默认由 bridge 从 checkout 注册，没有独立包条目。
- Why it matters: 按默认配置运行文档中的迁移命令会直接报 Expected exactly one standalone，用户可能为绕过错误而重复注册 SoL。
- Realistic failure scenario: 按默认配置运行文档中的迁移命令会直接报 Expected exactly one standalone，用户可能为绕过错误而重复注册 SoL。
- Minimal fix: 接受一个 bridge 或一个 standalone 注册，拒绝重复来源，保持排序函数幂等及无输入变更。
- Better long-term fix: 保持当前架构；先验证上述局部修复，不扩大重构范围。
- Regression test suggestion: 覆盖本地路径、npm 名称、Windows 路径对象、重复来源和近似名称；原 standalone fixture 继续通过。
- Estimated effort: 20–30 分钟

## 5. Architecture Concerns

- Coverage: Medium
- Inspected evidence: 四个聚合包入口、注册顺序、默认/full/adaptive 选择器、真实启动日志
- Exclusions / limits: 独立外部扩展内部架构未逐一审计

| 检查面 | 结论 |
|---|---|
| architecture | F02、F07；保留按模块分离的职责。 |

## 6. Security Concerns

- Coverage: Medium
- Inspected evidence: 备份权限路径、teammate-contract、bash guard、安装脚本
- Exclusions / limits: 未读取真实凭据；没有外部渗透测试

| 检查面 | 结论 |
|---|---|
| security | F05；路径声明属于调度约束，不能作为操作系统沙箱。 |

## 7. Stability Concerns

- Coverage: Medium
- Inspected evidence: 延迟工具初始化、SoL factory、完整基线测试和 TTY 启动
- Exclusions / limits: 未模拟全部网络和系统故障

| 检查面 | 结论 |
|---|---|
| stability | F02、F04；正常启动未复现阻塞。 |

## 8. Performance Concerns

- Coverage: Medium
- Inspected evidence: embedding 预热、lazy-tools、启动 timing
- Exclusions / limits: 单机单次基准；未做长期堆内存分析

| 检查面 | 结论 |
|---|---|
| performance | F03；总启动 2079ms，context-bridge factory 810ms。 |

## 9. Testing Gaps

- Coverage: High
- Inspected evidence: scripts/verify-repository.mjs --default-profile --skip-install --skip-pack；各包测试
- Exclusions / limits: 没有真实 Windows 运行，跳过安装和 npm pack

| 检查面 | 结论 |
|---|---|
| testing | F01、F06；既有测试全部通过，故障注入仍有缺口。 |

## 10. Maintainability Concerns

- Coverage: Medium
- Inspected evidence: 全局提示、技能元数据、部署名单、首方包边界
- Exclusions / limits: 大体积科学参考资料只检查触发与入口

| 检查面 | 结论 |
|---|---|
| maintainability | F07、F08；按职责消除重复，避免重写。 |

## 11. Design / Principles Concerns

- Coverage: Medium
- Inspected evidence: factories、loader 状态和全局/局部规则职责
- Exclusions / limits: 不评价纯风格偏好

| 检查面 | 结论 |
|---|---|
| design | F02、F04、F07；初始化独立性和状态提交点需修正。 |

## 12. Release Concerns

- Coverage: Medium
- Inspected evidence: CI、peer、lock 根元数据、双平台安装入口
- Exclusions / limits: 尚未执行 Windows 和干净安装

| 检查面 | 结论 |
|---|---|
| release | F01、F06、F09；升级验证目标应与实际版本一致。 |

## 13. Documentation Analysis

- Coverage: High
- Inspected evidence: 双语 README、default profile、技能入口和官方本地文档
- Exclusions / limits: 不全面校对科学参考资料正文

| 检查面 | 结论 |
|---|---|
| documentation | F08、F09；对照代码修正行为描述。 |

## 14. Observability / Operability Analysis

- Coverage: Medium
- Inspected evidence: PI_TIMING、原始错误、bridge 初始化告警、回归日志
- Exclusions / limits: 没有监控服务或生产告警系统

| 检查面 | 结论 |
|---|---|
| observability | F02；隔离故障仍须可见，保持用户选择的静默装饰策略。 |

## 15. Configuration Safety Analysis

- Coverage: High
- Inspected evidence: settings-public、.pi/tool-selector.json、公开 live 配置键、部署源
- Exclusions / limits: 真实密钥值未审计

| 检查面 | 结论 |
|---|---|
| configuration | F01、F03、F08、F11；代码与实际部署必须一致。 |

## 16. Data Integrity Analysis

- Coverage: Medium
- Inspected evidence: 安装备份、archive 覆盖、managed skill 归档
- Exclusions / limits: 没有持久数据库迁移压力测试

| 检查面 | 结论 |
|---|---|
| data-integrity | F05、F06；可恢复切换优于就地覆盖。 |

## 17. Privacy / Data Governance Analysis

- Coverage: Medium
- Inspected evidence: 备份路径、凭据文件名、全局外部输入规则
- Exclusions / limits: 未打开 auth/models 中真实秘密；外部服务保留政策未审核

| 检查面 | 结论 |
|---|---|
| privacy | F05；未发现可证实的外传事件。 |

## 18. Accessibility / UX Correctness Analysis

- Coverage: Medium
- Inspected evidence: tool-rails 键盘、thinking mouse wrapper、plan/widget 测试、窄宽度渲染
- Exclusions / limits: 未做屏幕阅读器与所有终端实机测试

| 检查面 | 结论 |
|---|---|
| accessibility | 现有回归覆盖折叠、焦点/布局与窄宽度；未新增确认缺陷。 |

## 19. Supply Chain / Reproducibility Analysis

- Coverage: Low
- Inspected evidence: external-packages、包 manifests、CI 和升级策略
- Exclusions / limits: 没有依赖 CVE 数据库扫描，也未逐个审计第三方代码

| 检查面 | 结论 |
|---|---|
| supply-chain | F10 属已选择的滚动策略风险；不报告未核实漏洞。 |

## 20. Cost / Resource Economics Analysis

- Coverage: Medium
- Inspected evidence: embedding 自动下载、提示重复、lazy imports
- Exclusions / limits: 没有计费 API 调用或费用账单

| 检查面 | 结论 |
|---|---|
| cost | F03、F07；避免未使用功能的下载和重复提示。 |

## 21. AI / LLM Safety Analysis

- Coverage: Medium
- Inspected evidence: teammate 合同验证、真实工具错误展示、外部内容与授权规则
- Exclusions / limits: 未执行攻击性 eval 或调用远端模型

| 检查面 | 结论 |
|---|---|
| ai-safety | 保留工具权限和不可信输入边界；未新增确认漏洞。 |

## 22. Fallback / Defensive Code Analysis

- Coverage: Medium
- Inspected evidence: embedding BM25 fallback、可选导入、bridge 错误路径
- Exclusions / limits: 供应商内部回退路径排除

| 检查面 | 结论 |
|---|---|
| fallback | F02、F03；能力降级应限定在故障组件。 |

## 23. Testing Authenticity Analysis

- Coverage: Medium
- Inspected evidence: 真实 SDK 集成、filesystem fixture、source 文本断言、dry-run
- Exclusions / limits: 现有测试绿不等于覆盖安装失败和 Windows

| 检查面 | 结论 |
|---|---|
| testing-authenticity | F01、F05、F06；补故障注入而非只匹配源码字符串。 |

## 24. Type Safety Analysis

- Coverage: Medium
- Inspected evidence: 包 typecheck、Pi API imports、teammate schema
- Exclusions / limits: 旧 peer 下的通过不代表 1.0 类型兼容

| 检查面 | 结论 |
|---|---|
| type-safety | F01；需真实 1.0 SDK typecheck。 |

## 25. Frontend State Analysis

- Coverage: Medium
- Inspected evidence: TUI 状态归属、session hooks、plan 和 thinking 回归
- Exclusions / limits: 项目无 React/DOM；不套用浏览器指标

| 检查面 | 结论 |
|---|---|
| frontend-state | F04；未新增确认的 TUI 状态缺陷。 |

## 26. Backend API Analysis

- Coverage: Not assessed
- Inspected evidence: 项目为 CLI 配置与扩展，未提供独立 HTTP 后端
- Exclusions / limits: 模型客户端和工具输入已在安全/配置维度检查

| 检查面 | 结论 |
|---|---|
| backend-api | 不计分。 |

## 27. Dependency Weight Analysis

- Coverage: Medium
- Inspected evidence: 动态 imports、embedding 模型、bridge startup timing
- Exclusions / limits: 没有全量安装大小/传递依赖统计

| 检查面 | 结论 |
|---|---|
| dependency-weight | F03；保留 schema 延迟以外的模块延迟加载。 |

## 28. Code Consistency Analysis

- Coverage: Medium
- Inspected evidence: 首方入口、相邻测试、错误处理与版本声明
- Exclusions / limits: 不逐字统一第三方来源风格

| 检查面 | 结论 |
|---|---|
| code-consistency | F01、F07；只修产生冲突的重复。 |

## 29. Comment Coverage Analysis

- Coverage: Low
- Inspected evidence: 入口注释、安装文档、技能说明抽样
- Exclusions / limits: 未对全部 612 个候选文件逐行计算注释比例

| 检查面 | 结论 |
|---|---|
| comment-coverage | F09；可验证的旧行为描述优先。 |

## 30. Concurrency Analysis

- Coverage: Medium
- Inspected evidence: Todo 初始化标志、lazy wrapper promises、会话重载
- Exclusions / limits: 没有长时间并发压力测试

| 检查面 | 结论 |
|---|---|
| concurrency | F04；成功标志应与实际完成一致。 |

## 31. Principles Compliance

### Principles Violated

| Principle | Violations | Severity | Affected Areas |
|---|---:|---|---|
| 独立失败域 | 1 | Medium | F02 bridge factory |
| 成功后提交状态 | 1 | Low | F04 Todo 初始化 |
| 单一事实来源 / DRY | 3 | Low | F07、F08、F09 |
| 边界权限 | 1 | Medium | F05 备份 |

### Principles Respected

按职责聚合扩展；工具输入使用结构化合同；保留原始错误证据；技能正文与元数据分离；动态 import 延迟较重功能。文件长度和风格差异不单独作为缺陷。

## 32. Architecture Analysis

### Architecture Summary

| Subtype | Count | Affected Areas | Recommended Action |
|---|---:|---|---|
| ModuleBoundary | 1 | F02 | 隔离可选依赖失败 |
| DependencyDirection | 0 | 聚合包入口 | 保留职责边界 |
| StateOwnership | 1 | F04 | 完成后提交状态 |
| BoundaryContract | 1 | F01 | 对齐 Pi 1.0 |
| EvolutionRisk | 1 | F07 | 减少重复规则 |

## 33. Recommended Fix Order

### Fix Immediately

| 顺序 | 项目 | 完成条件 |
|---|---|---|
| 1 | F05 | 复制任何私人配置之前已限制备份目录 |
| 2 | F01、F02、F03 | Pi 1.0 类型检查通过；可选失败隔离；离线不下载 |

### Fix Before Stable Release

F04 初始化恢复、F06 archive 切换和 F09 安装说明。Windows 切换必须保留原目录备份；本机无法运行 PowerShell 的限制应在交付时保留。

### Schedule Later

F07/F08 与本次请求直接相关，纳入本次局部修复；科学正文和第三方插件整体重写不在修复范围。

### Ignore for Now

F10 的滚动更新是已明确选择的策略，不擅自钉住旧版本；不将 Manim 符号链接当成重复安装删除。

## 34. Quick Wins

| 改动 | 预计工作量 | 收益 |
|---|---|---|
| 精简全局规则和重复工具提示 | 30–60 分钟 | 降低无关常驻上下文 |
| 修正技能触发及不存在路由 | 45–90 分钟 | 减少误触发和多余问答 |
| 同步 Pi 1.0 兼容声明 | 30–60 分钟 | 验证目标与实际主机一致 |
| 纠正安装文档 | 15–25 分钟 | 消除默认清理误解 |

## 35. Long-term Refactor Plan

现有证据支持局部修复。暂不引入新的规则框架、技能路由器或工具注册抽象。原生工具发现与项目模式之间若进一步合并，应先加入 disabled-tool、session 分支和 reload 的真实 SDK 回归，再减少本地实现。

## 36. 修复结果与复测

以下为 2026-10-02 的修复后状态；前文评分和行号保留为审查基线，恢复原始证据可使用下方备份。

| 发现 | 修复后状态 | 实际检查 |
|---|---|---|
| F01 | 五个运行包的 peer、开发依赖和锁文件已同步 Pi 1.0；CI 基线 1.0.0 | 已安装 SDK 均为 1.0.0；六包 tests/typecheck/package dry-run 通过 |
| F02 | 可选 SoL loader 和异步 factory 失败隔离，保留告警 | loader 失败、异步 factory 失败和正常注册回归通过 |
| F03 | 默认不下载 embedding；显式 `PI_WORKBENCH_DOWNLOAD_EMBEDDINGS=1` 仍遵守离线条件 | 下载策略、词法回退及 workbench 回归通过；未触发模型下载 |
| F04 | 并发共用初始化；仅成功注册后提交状态；失败组件可重试 | 导入失败、并发和部分注册失败用例通过 |
| F05 | 复制前限制备份目录权限；复制失败仍保护已写入内容 | 宽松 umask 和失败注入 fixture 通过，不使用真实凭据 |
| F06 | Windows 更新改为同盘 staging、保留旧目录和失败恢复 | 静态检查通过；实际 PowerShell 行为本机跳过，已增加 Windows CI job，未取得远端运行结果 |
| F07 | 合并常驻规则；工具描述承担调用细节，目录仅给短提示 | 全局源和 live 一致；规则与路由测试通过 |
| F08 | 技能描述缩短、按任务触发；移除缺失技能路由和不必要问答门槛；审计技能加入 managed 部署 | 22 个源入口元数据与本地引用检查；20 个 managed 技能部署后逐一与源比对一致 |
| F09 | 双语 README、默认配置与扩展清单同步当前行为 | 安装回归、版本声明和文本检查通过 |
| F10 | 保留明确选择的滚动更新策略；补充重现性与恢复说明 | 未擅自钉住旧版本；升级前源码和全局规则已保存快照 |
| F11 | SoL 迁移接受唯一 bridge 或 standalone 来源，拒绝双重注册 | 本地路径、npm、Windows 路径、幂等和重复来源测试通过 |

### 验证结果

- `node scripts/verify-repository.mjs --default-profile --skip-install`：329 个测试通过，0 失败，1 个 Windows 行为测试明确跳过；六包类型检查及 `npm pack --dry-run` 通过。统一入口现包含全部 `scripts/*.test.mjs`。
- `PI_TEAMMATE_CHILD=1 node --test extensions/pi-context-bridge/tests/teammate.test.mjs`：6 个通过；根注册 fixture 已隔离调用者环境，未放宽实际子任务权限。
- `git diff --check` 与报告 linter 通过。Windows CI 配置已添加，本次未发布或运行远端工作流，也未在真实用户配置上执行完整安装器。
- 真实 TTY 启动三次均正常退出，无提取到的启动错误。TOTAL 分别为 2400、1859、1985ms；中位数 1985ms。修复前单次为 2079ms。样本与缓存状态不足以支持“显著提速”的判断。

### 规则与加载

全局 `APPEND_SYSTEM.md` 从仓库源的 9436 字节缩为 2718 字节、27 行；原 live 文件为 8492 字节，live 常驻内容减少约 68%。安全、授权、科学证据和相关验证要求保留。没有创建多余的全局 `AGENTS.md`。

原生工具检索优先承担工具 schema 发现。项目工具策略、技能搜索和实现模块 lazy import 保留各自职责；本次没有以名称相似为由整包删除插件。Manim 的两个入口为同源符号链接，已改 canonical 描述，保留链接关系。

### 生效与恢复

本地扩展以源码路径加载；全局规则和 20 个 managed 技能已同步 live 文件。重启 Pi 后重新加载全部资源。当前对话已载入的旧指令不会被改写。

- 源码与原有未提交改动快照：`/home/zonazcy/.pi/backups/pi-1-audit-20261002-105044/`。
- 旧 managed 技能：`/home/zonazcy/.pi/agent/skill-archives/2026-10-02T03-11-28.932Z-611116/`。
- Canonical Manim 描述的原文件也在上述源码快照目录的 `live-skills/` 中。

恢复时只取回需要的文件，保留本次之前就存在的其他未提交改动；无需清空插件或模型凭据。
