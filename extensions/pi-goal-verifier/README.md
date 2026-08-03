# pi-goal-verifier-local

在 Goal 完成前执行用户明确声明的验收命令。没有配置文件时完全不介入，也不注册工具 schema。

## 启用

项目级配置放在项目根目录 `.pi/goal-verification.json`；全局配置放在 `~/.pi/agent/goal-verification.json`。项目必须已被 Pi 信任，且项目配置优先于全局配置。

```json
{
  "commands": [
    { "command": "npm", "args": ["run", "typecheck"], "timeoutSeconds": 60 },
    { "command": "npm", "args": ["test"], "timeoutSeconds": 120 }
  ]
}
```

限制：最多 5 条命令，每条 1 到 120 秒；`cwd` 必须位于项目根目录内。命令失败、超时、配置无效或越界都会阻止 `goal_complete`。

## 使用

运行配置但不完成 Goal：

```text
/goal-verify
```

配置存在时，普通 Goal 会自动验收：

```text
/goal
实现用户资料页的邮箱校验。完成前运行全部验收命令，任何失败都不要标记完成。
```

完整配置说明和示例见 [`../../docs/USAGE.zh-CN.md`](../../docs/USAGE.zh-CN.md#5-goal-验收门pi-goal-verifier)。

## 开发

```bash
npm install
npm run typecheck
```
