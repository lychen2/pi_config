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
| `extensions/` | Five installable local extensions, one standalone TUI extension, and package-specific configuration | Install local packages with `pi install`; copy the standalone file |
| `skills/` | 43 discoverable skills plus reference-only skill collections | Sync into `~/.pi/agent/skills/` |
| `config/` | Slim-skill, deferred-tool, and external-package manifests | Copy the JSON files and install the package list |
| `docs/images/` | README screenshots | Documentation only |

## Restore on a new machine

### Prerequisites

Install pi, Git, Node.js/npm, and `rsync` before continuing. The optional `pi-rtk-optimizer` package also requires the official `rtk` binary.

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
mkdir -p "$HOME/.pi/agent/skills" "$HOME/.pi/agent"
rsync -a skills/ "$HOME/.pi/agent/skills/"
cp config/slim-skills-whitelist.json "$HOME/.pi/agent/slim-skills-whitelist.json"
cp config/deferred-tools.json "$HOME/.pi/agent/deferred-tools.json"
```

### 3. Install the repository extensions

```bash
for dir in extensions/pi-*/; do
  [ -f "$dir/package.json" ] && pi install "$(realpath "$dir")"
done

mkdir -p "$HOME/.pi/agent/extensions"
cp extensions/matugen-chrome.ts "$HOME/.pi/agent/extensions/"
```

### 4. Install external packages

Install RTK first if you are restoring `pi-rtk-optimizer`:

```bash
curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
rtk --version
```

Then install the packages recorded in [`config/external-packages.txt`](config/external-packages.txt):

```bash
while IFS= read -r package; do
  case "$package" in
    ""|\#*) continue ;;
    *) pi install "$package" ;;
  esac
done < config/external-packages.txt
```

Review the package list first if you only need part of the setup. The commented local packages depend on source directories that are not included in this repository.

### 5. Restart and verify

```bash
pi list
```

Start a new pi session after installation. Run `/rtk verify` inside the TUI if RTK support is enabled.

## Local extensions

| Extension | Purpose | Main control |
| --- | --- | --- |
| [`pi-brand-header`](extensions/pi-brand-header/) | Responsive startup header with model, theme, workspace, skill, and tool information | `/logo` |
| [`pi-manager-models`](extensions/pi-manager-models/) | Refreshes an OpenAI-compatible provider's model catalog while preserving local overrides | Provider `baseUrl` and optional environment variables |
| [`pi-slim-skills`](extensions/pi-slim-skills/) | Reduces the model-visible skill index while keeping skills callable | `/slim-skills` |
| [`pi-todo-guard`](extensions/pi-todo-guard/) | Continues a run when Todo still contains unfinished tasks | `PI_TODO_GUARD_DISABLE=1` |
| [`pi-tool-rails`](extensions/pi-tool-rails/) | Adds themed tool labels, result panels, and message/prompt framing | `PI_TOOL_RAILS_DISABLE_USER_FRAME=1` |
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
| Writing and interaction | `humanizer`, `humanizer-zh`, `i-have-adhd` |
| Scientific work and visualization | `scientific-visualization`, `sa.sympy`, `air.academic-plotting` |
| Literature and research | `sa.citation-management`, `air.research-manager`, `nature-skills` |
| File processing | `mineru-file-processing` |
| Agent and coding guidance | `karpathy-guidelines` and selected Claude Science skills |

Call a discoverable skill by directory name:

```text
/skill:humanizer
/skill:scientific-visualization
/skill:mineru-file-processing
```

Some collections contain reference material without a top-level `SKILL.md`; pi will not register those directories as slash commands. Their files remain available for manual use.

## External packages

[`config/external-packages.txt`](config/external-packages.txt) is the editable source of truth for third-party npm and Git extensions. It covers:

- file search, browser automation, previews, and external-directory loading
- planning, goals, Todo management, structured questions, and subagents
- hash-anchored editing, output compaction, caching, and research workflows
- themes, footer status, token speed, and raw-paste support

Package credentials and package-owned settings stay on the target machine.

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
