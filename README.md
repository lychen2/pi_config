# pi_config

**English** | [简体中文](README.zh-CN.md)

A public backup of reusable extensions, skills, and configuration snippets for the [pi coding agent](https://github.com/badlogic/pi-mono). It contains the files needed to reproduce this setup on another machine.

> The repository does not store API keys, tokens, passwords, private keys, model registries, sessions, or local runtime state.

## Preview

### Workspace and themed TUI

![pi workspace with themed header and footer](docs/images/pi-tui-overview.png)

### Hash-anchored editing

![pi replace tool result](docs/images/pi-tui-replace.png)

### Tool calls and result panels

![pi parallel tool calls and result panels](docs/images/pi-tui-tools.png)

## What is included

| Path | Contents | Restore method |
| --- | --- | --- |
| `extensions/` | Seven installable local extensions, two standalone extensions, and package-specific configuration | Install local packages with `pi install`; copy the standalone files |
| `skills/` | 57 discoverable skills plus reference-only skill collections | Sync into `~/.pi/agent/skills/` |
| `config/` | Public runtime preferences, system guidance, deferred/slim/translation state, and the external-package manifest | Copy or merge the documented files |
| `themes/` | Two current Matugen themes | Copy into `~/.pi/agent/themes/` |
| `docs/images/` | README screenshots | Documentation only |

## Restore on a new machine

### Prerequisites

Install pi, Git, Node.js 22 or newer, npm, and `rsync` before continuing. Browser automation also needs the upstream `agent-browser` CLI. The optional `pi-rtk-optimizer` package requires the official `rtk` binary.

### 1. Clone and back up the current setup

```bash
git clone https://github.com/lychen2/pi_config.git ~/.pi_config
cd ~/.pi_config

backup="$HOME/.pi-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
cp -a "$HOME/.pi/agent" "$backup/agent" 2>/dev/null || true
```

### 2. Restore skills and safe configuration

```bash
mkdir -p "$HOME/.pi/agent/skills" "$HOME/.pi/agent/extensions" "$HOME/.pi/agent/themes"
rsync -a skills/ "$HOME/.pi/agent/skills/"
cp config/APPEND_SYSTEM.md "$HOME/.pi/agent/APPEND_SYSTEM.md"
cp config/slim-skills-whitelist.json "$HOME/.pi/agent/slim-skills-whitelist.json"
cp config/translate-submit.json "$HOME/.pi/agent/translate-submit.json"
cp themes/*.json "$HOME/.pi/agent/themes/"

settings="$HOME/.pi/agent/settings.json"
test -f "$settings" || printf '{}\n' > "$settings"
tmp=$(mktemp)
jq -s '.[0] * .[1]' "$settings" config/settings-public.json > "$tmp"
mv "$tmp" "$settings"
```

### 3. Install the repository extensions

```bash
for dir in extensions/pi-*/; do
  [ -f "$dir/package.json" ] && pi install "$(realpath "$dir")"
done

mkdir -p "$HOME/.pi/agent/extensions"
cp extensions/adhd-mode.ts extensions/matugen-chrome.ts "$HOME/.pi/agent/extensions/"
```

### 4. Install command-line dependencies

#### Browser automation

`agent-browser` is the upstream browser automation CLI. Install it manually before the Pi wrapper:

```bash
npm install -g agent-browser
agent-browser install
agent-browser --version
```

On a fresh Linux machine, run `agent-browser install --with-deps` if Chrome system libraries are also missing.

The external package list installs `pi-agent-browser-native`. That package wraps the `agent-browser` CLI and exposes it inside Pi as the `agent_browser` tool. These three names refer to different layers.

The repository's `pi-agent-browser-compat` extension treats a valid `args` array as the primary mode, removes conflicting provider-filled mode fields, and strips unsupported stdin before the wrapper executes. Non-empty stdin for batch, eval, and auth workflows is preserved.

#### RTK

Install RTK if you are restoring `pi-rtk-optimizer`:

```bash
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
rtk --version
```

### 5. Install external Pi packages

Install the packages recorded in [`config/external-packages.txt`](config/external-packages.txt):

```bash
while IFS= read -r package; do
  case "$package" in
    ""|\#*) continue ;;
    *) pi install "$package" ;;
  esac
done < config/external-packages.txt
```

The package list now includes `pi-sensitive-guard`. It protects sensitive files and scans writes, commits, and pushes for common credential patterns. Its default mode blocks protected reads; redacted reads are opt-in through `/sensitive-guard`.

Review the package list first if you only need part of the setup. The commented local package depends on a source directory that is not included in this repository.

### 6. Restart and verify

```bash
pi list
npm exec --prefix "$HOME/.pi/agent/npm" -- pi-agent-browser-doctor
```

Start a new Pi session after installation. Run `/rtk verify` if RTK support is enabled and `/sensitive-guard status` to inspect protection. The initial tool set should include `load_tools`; tools owned by configured deferred extensions stay hidden until `load_tools` activates one exact tool.

## Local extensions

| Extension | Purpose | Main control |
| --- | --- | --- |
| [`pi-brand-header`](extensions/pi-brand-header/) | Responsive startup header with model, theme, workspace, skill, and tool information | `/logo` |
| [`pi-agent-browser-compat`](extensions/pi-agent-browser-compat/) | Normalizes provider-filled `agent_browser` fields without modifying the third-party wrapper | `PI_AGENT_BROWSER_COMPAT_DISABLE=1` |
| [`pi-deferred-tools`](extensions/pi-deferred-tools/) | Auto-groups tools by extension and activates one deferred tool per loader call | `/deferred-tools` |
| [`pi-manager-models`](extensions/pi-manager-models/) | Refreshes an OpenAI-compatible provider's model catalog while preserving local overrides | Provider `baseUrl` and optional environment variables |
| [`pi-slim-skills`](extensions/pi-slim-skills/) | Compresses the skill index and can inject selected skill bodies once per prompt | `/slim-skills` |
| [`pi-todo-guard`](extensions/pi-todo-guard/) | Continues a run when Todo still contains unfinished tasks | `PI_TODO_GUARD_DISABLE=1` |
| [`pi-tool-rails`](extensions/pi-tool-rails/) | Adds themed tool labels, result panels, and message/prompt framing | `PI_TOOL_RAILS_DISABLE_USER_FRAME=1` |
| [`adhd-mode.ts`](extensions/adhd-mode.ts) | Injects the ADHD response rules and provides a session-persistent toggle | `/adhd` |
| [`matugen-chrome.ts`](extensions/matugen-chrome.ts) | Draws a themed footer and working indicator with model, Git, context, and token status | `/matugen-chrome` |

Each package directory contains its own development and configuration notes. Typical checks are:

```bash
cd extensions/pi-brand-header
npm install
npm run typecheck
npm pack --dry-run
```

## Skills

Skills are grouped by the work they support:

| Area | Examples |
| --- | --- |
| Writing and interaction | `humanizer`, `humanizer-zh`, `i-have-adhd`, `academic-paper` |
| Scientific work and visualization | `scientific-visualization`, `sa.sympy`, `air.academic-plotting`, `mineru` |
| Literature and research | `sa.citation-management`, `air.research-manager`, `nature-skills`, `deep-research` |
| File processing | `mineru-file-processing`, `pubmed-database`, `literature-search-openalex` |
| Agent and coding guidance | `karpathy-guidelines`, `agents-progressive-disclosure`, `workflow-skill-creator` |

Call a discoverable skill by directory name:

```text
/skill:humanizer
/skill:scientific-visualization
/skill:mineru-file-processing
```

Some collections contain reference material without a top-level `SKILL.md`; pi will not register those directories as slash commands. Their files remain available for manual use.

## External packages

[`config/external-packages.txt`](config/external-packages.txt) is the editable source of truth for third-party npm and Git extensions. It covers:

- file search, `agent-browser` automation, previews, and external-directory loading
- planning, goals, Todo management, structured questions, and subagents
- hash-anchored editing, output compaction, caching, and research workflows
- sensitive-file protection, themes, footer status, token speed, and raw-paste support

Package credentials and package-owned settings stay on the target machine.

## Sensitive data protection

`pi-sensitive-guard` is part of the external package manifest and requires Node.js 22 or newer. It runs automatically after Pi loads it.

Its default policy blocks reads and writes involving `.env` files, private keys, credential files, and detected secret patterns. It also checks Git commit and push diffs. Open its TUI menu to review the policy or enable redacted read and shell output:

```text
/sensitive-guard
/sensitive-guard status
```

Keep debug logging disabled unless you are diagnosing the extension. The guard reduces accidental exposure; repository review and the pre-commit scans below are still required.

## Updating this backup

```bash
cd ~/.pi_config
git pull --ff-only
git status
```

Review changes before copying them into `~/.pi/agent/`. This keeps repository updates separate from active local state.

## Security boundary

This repository is designed to remain safe to publish. [`.gitignore`](.gitignore) excludes credentials, model and auth registries, sessions, caches, databases, logs, dependency directories, generated assets, backups, and environment files.

Run these checks before committing:

```bash
git status
git diff --check
git grep -n -I -i -E 'BEGIN (RSA|OPENSSH|PRIVATE)|api[_-]?key|token|secret|password|/home/'
```

Configure providers, model registries, API keys, and environment variables directly on each target machine. Never commit real credentials.
