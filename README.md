# pi 配置备份与恢复

这个仓库保存可复用的 pi extensions、skills 和不含隐私的配置片段。它**不包含** API key、token、密码、私钥、模型注册表、会话记录或本机运行状态。

## 快速恢复

在一台新机器上执行：

```bash
git clone https://github.com/lychen2/pi_config.git ~/.pi_config
cd ~/.pi_config

# 先备份当前 pi 配置，避免覆盖现有内容
backup="$HOME/.pi-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
cp -a "$HOME/.pi/agent" "$backup/agent" 2>/dev/null || true

# 恢复 skills 和无敏感配置
mkdir -p "$HOME/.pi/agent/skills" "$HOME/.pi/agent"
rsync -a skills/ "$HOME/.pi/agent/skills/"
cp config/slim-skills-whitelist.json "$HOME/.pi/agent/slim-skills-whitelist.json"
cp config/deferred-tools.json "$HOME/.pi/agent/deferred-tools.json"

# 从本地源码安装仓库内的扩展
for dir in extensions/pi-*/; do
  [ -f "$dir/package.json" ] && pi install "$(realpath "$dir")"
done
# 安装独立的 Matugen 扩展

echo "恢复完成。重新启动 pi 后检查：pi list"
```

`matugen-chrome.ts` 是单文件扩展。若希望它每次启动都自动加载，请将它复制到 pi 的 extensions 目录：

```bash
cp extensions/matugen-chrome.ts "$HOME/.pi/agent/extensions/matugen-chrome.ts"
```

## 分步恢复

只恢复 skills：

```bash
mkdir -p "$HOME/.pi/agent/skills"
rsync -a skills/ "$HOME/.pi/agent/skills/"
```

只恢复扩展：

```bash
for dir in extensions/pi-*/; do
  [ -f "$dir/package.json" ] && pi install "$(realpath "$dir")"
done
cp extensions/matugen-chrome.ts "$HOME/.pi/agent/extensions/"
```

只恢复配置片段：

```bash
cp config/slim-skills-whitelist.json "$HOME/.pi/agent/"
cp config/deferred-tools.json "$HOME/.pi/agent/"
```

## 恢复模型和密钥

本仓库不会恢复 `models.json`、`auth.json` 或其他凭据。恢复后需要在目标机器上单独配置 provider 和环境变量，例如：

```bash
pi
```

然后按当前环境重新配置模型和 API key。不要把包含真实 key 的文件提交到 Git。

## 更新备份

以后在原机器上更新仓库内容：

```bash
cd ~/.pi_config
git pull --ff-only
```

## 仓库内容

- `extensions/`：自定义扩展源码和 package metadata
- `skills/`：技能源码与文档，已排除缓存、大型生成素材和本机符号链接
- `config/`：不含 provider、API key、本机路径和会话状态的配置片段
- `.gitignore`：阻止凭据和运行时隐私数据进入仓库
