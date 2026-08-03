# pi-workflow-dag-local

延迟加载的轻量 DAG 工具，用于小型的“检查 -> 实现 -> 复核”流程。普通独立委派仍优先使用 `@narumitw/pi-subagents`。

## 激活

在 Pi 中说明要使用依赖工作流：

```text
请加载 workflow_dag，把任务拆成 inspect（只读）、implement（write）、review（只读）三个依赖节点。
每个节点只返回结论、改动文件和验证结果。
```

模型会先调用 `load_tools`，再调用 `workflow_dag`。工具不是 slash command。

## 最小调用

```json
{
  "action": "run",
  "workflowId": "auth-fix",
  "nodes": [
    {
      "id": "inspect",
      "prompt": "检查登录回调和现有测试；不要修改文件。",
      "mode": "readonly"
    },
    {
      "id": "implement",
      "prompt": "根据检查结果实现最小修复并运行窄测试。",
      "dependsOn": ["inspect"],
      "mode": "write"
    },
    {
      "id": "review",
      "prompt": "审查 diff、测试结果和剩余风险；不要修改文件。",
      "dependsOn": ["implement"],
      "mode": "readonly"
    }
  ]
}
```

支持的 action：

- `run`：执行依赖波次。
- `status`：查看当前 session 中保存的结果。
- `clear`：清理保存的状态。

最多 8 个节点；没有未完成依赖的只读节点最多并行 3 个；写节点单独执行；失败节点的下游会跳过。worker 使用独立、无扩展、无技能的 Pi 进程，结果只返回有上限的摘要。

完整说明见 [`../../docs/USAGE.zh-CN.md`](../../docs/USAGE.zh-CN.md#6-轻量-dagworkflow_dag)。

## 开发

```bash
npm install
npm run typecheck
```
