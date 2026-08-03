# pi-semantic-code-local

按需加载的 LSP 语义代码工具。安装器会自动发现本地 package；启动时不会把这个工具放进主上下文。


## 怎么用

你不需要记住 `semantic_code` 这个名字。直接告诉 Pi 你想查什么：

```text
请查看 src/service.py 中 UserStore 的定义、全部引用和类型诊断。只读，不修改文件；最后告诉我最安全的修改入口。
```

模型会在需要时自动加载这个工具。`load_tools` 是模型内部动作，不是你需要输入的 slash command。

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

你不需要填写 JSON 参数。安全重命名可以这样说：

```text
请把 src/parser.cpp 中的 parse_request 改名为 parseRequest。先预览所有文件和位置，不要应用；我确认后再执行。
```

确认后再说：

```text
预览正确，现在应用这个改名并运行相关测试。
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

扩展只负责路由，不捆绑所有语言服务器。项目或全局覆盖配置示例见 [`../../docs/USAGE.zh-CN.md`](../../docs/USAGE.zh-CN.md#4-语义代码工具semantic_code)。
缺少某个服务器时，直接问：“请检查当前项目能用的代码分析服务器，并告诉我缺少什么。”
## 开发

```bash
npm install
npm run typecheck
```
