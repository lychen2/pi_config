# pi-semantic-code-local

按需加载的 LSP 语义代码工具。安装器会自动发现本地 package；启动时不会把这个工具放进主上下文。

## 激活

在 Pi 中直接描述需要语义代码能力的任务：

```text
请加载 semantic_code，查找 src/api.ts 第 42 行 handleRequest 的全部引用；只读，不要修改文件。
```

模型会先调用 `load_tools`，再调用 `semantic_code`。`load_tools` 是模型工具，不是用户需要输入的 slash command。

查看当前延迟扩展：

```text
/deferred-tools list
```

## 操作

- `status`：列出可发现的语言服务器和路由。
- `diagnostics`：读取错误和警告。
- `definition`：查找定义。
- `references`：查找引用。
- `hover`：读取符号信息。
- `symbols`：列出文件或工作区符号。
- `rename`：生成跨文件重命名预览；确认后才传 `apply: true`。

直接调用时，非 `status` 操作至少需要 `path`：

```json
{
  "action": "references",
  "path": "src/api.ts",
  "line": 42,
  "symbol": "handleRequest"
}
```

安全重命名示例：

```text
加载 semantic_code，把 src/parser.cpp 中 parse_request 重命名为 parseRequest。
先预览所有文件的 edits，不要 apply；我确认后再执行。
```

## 自动路由

| 语言 | 扩展名 | 服务器 |
| --- | --- | --- |
| C/C++ | `.c`、`.cpp`、`.h` | `clangd` |
| Python | `.py`、`.pyi` | `basedpyright-langserver`、`pyright-langserver`、`pylsp` |
| Rust | `.rs` | `rust-analyzer` |
| JavaScript/TypeScript | `.js`、`.ts`、`.tsx` | `typescript-language-server`、`vtsls`、Deno |
| C# | `.cs` | `csharp-ls`、OmniSharp |
| Go | `.go` | `gopls` |
| LaTeX | `.tex`、`.ltx`、`.bib` | `texlab` |
| Typst | `.typ` | `tinymist` |

查找顺序：当前项目 `node_modules/.bin`、`.venv/bin`、`venv/bin`，然后是 `~/.local/bin`、`~/.dotnet/tools`、`~/go/bin` 和系统 `PATH`。

扩展只负责路由，不捆绑所有语言服务器。缺少服务器时先运行 `semantic_code` 的 `status`，再安装对应运行时。项目或全局覆盖配置示例见 [`../../docs/USAGE.zh-CN.md`](../../docs/USAGE.zh-CN.md#4-语义代码工具semantic_code)。

## 开发

```bash
npm install
npm run typecheck
```
