# pi_config

**English** | [简体中文](README.zh-CN.md)

A portable backup of extensions, skills, themes, and public configuration for the [Pi coding agent](https://github.com/badlogic/pi-mono). Use it to reproduce this Pi workspace on another machine or selectively reuse individual components.

> [!IMPORTANT]
> This repository contains public configuration only. API keys, tokens, passwords, private keys, provider registries, sessions, and local runtime data are intentionally excluded.

## Preview
<table>
<tr>
<td width="50%" align="center"><strong>Themed Pi workspace</strong><br><img src="docs/images/pi-tui-overview.png" alt="Themed Pi workspace" width="100%"></td>
<td width="50%" align="center"><strong>Tool rails</strong><br><img src="docs/images/pi-tui-replace.png" alt="Pi tool rails" width="100%"></td>
</tr>
<tr>
<td width="50%" align="center"><strong>Structured results</strong><br><img src="docs/images/pi-tui-tools.png" alt="Structured Pi results" width="100%"></td>
<td width="50%" align="center"><strong>Session layout</strong><br><img src="docs/images/pi-tui-session.png" alt="Pi session layout" width="100%"></td>
</tr>
</table>

## Repository contents

| Path | Contents | How to restore |
| --- | --- | --- |
| `install.sh`, `install.ps1`, `install.mjs` | Cross-platform bootstrap and configuration installer | Run the entry point for your operating system |
| `scripts/` | Cross-platform post-install checks for local integrations | Run the relevant Node script from the repository root |
| `extensions/` | All installable local `pi-*/package.json` packages and 2 standalone extensions | Install packages with `pi install`; copy standalone files |
| `config/` | Public Pi settings, system guidance, extension state, and the external package manifest | Review, then copy or merge individual files |
| `themes/` | 2 Matugen themes | Copy to `~/.pi/agent/themes/` |
| `docs/` | Onboarding Wiki, extension and skill catalogs, plus README screenshots | Open [`docs/WIKI.zh-CN.md`](docs/WIKI.zh-CN.md) |

## Documentation

- [Complete usage guide (Simplified Chinese)](docs/USAGE.zh-CN.md)
- [Quick-start Wiki (Simplified Chinese)](docs/WIKI.zh-CN.md)
- [Extension catalog (Simplified Chinese)](docs/extensions.zh-CN.md)
- [Skill catalog (Simplified Chinese)](docs/skills.zh-CN.md)

## Install

The bootstrap installers support a new machine without Node.js, Git, or Pi. Review the scripts before running them because Pi extensions and third-party packages execute with full user permissions.

### Linux and macOS

```bash
curl -fsSL https://raw.githubusercontent.com/lychen2/pi_config/main/install.sh | sh
```

The script uses Pi's official installer for Node.js and Pi. On Linux, it can install Git with `apt`, `dnf`, `yum`, `apk`, `pacman`, or `zypper`. On macOS without Homebrew or Git, the system may open Apple's Command Line Tools installer.

### Windows

Run in PowerShell:

```powershell
irm https://raw.githubusercontent.com/lychen2/pi_config/main/install.ps1 | iex
```

The Windows bootstrap uses WinGet to install Node.js LTS and Git for Windows. Git Bash is required by Pi on native Windows. It also installs the checksum-verified RTK release binary to `~/.local/bin/rtk.exe`.

### From an existing clone

```bash
# Linux or macOS
./install.sh

# Any platform with Node.js and Pi already installed
node install.mjs
```

```powershell
# Windows PowerShell
.\install.ps1
```

### Installer behavior

The installer performs these steps in order:

1. Installs Node.js 22.19.0 or newer, Git, and Pi when the platform bootstrap is used.
2. Downloads this repository to `~/.pi_config` when it is not already available.
3. Backs up the existing Pi directory to `~/.pi-backup-<timestamp>/agent`.
4. Restores skills, themes, standalone extensions, and public configuration.
5. Installs every local `extensions/pi-*/package.json` package, rewrites local deferred-tool IDs for the target machine, then installs the reviewed external package manifest.
6. Runs the upstream Magic Context setup script, preserves its JSONC comments, sets the repository default execution threshold to `55%`, and disables Pi's built-in auto-compaction.
7. Installs optional browser and RTK command-line tools when selected.
Provider credentials, model registries, API keys, sessions, and environment variables remain local to each machine.

Recommended defaults are designed for a clean installation:

| Component | Default | Reason |
| --- | --- | --- |
| External Pi packages | Install | Reproduces the tools listed in `config/external-packages.txt` |
| Magic Context | Install | Runs the upstream setup wizard and disables Pi's built-in auto-compaction |
| Browser runtime | Install | Required by the default `pi-agent-browser-native` package; reuses an existing Chrome runtime when available |
| RTK binary | Install | Required by `pi-rtk-optimizer` for command rewriting; prebuilt releases support Windows, Linux, and macOS |
| Provider/model defaults | Keep current | The repository's `manager` provider requires machine-local configuration |

### Options

Pass options to a local script or directly to `install.mjs`:

| Option | Effect |
| --- | --- |
| `--yes`, `-y` | Accept the recommended defaults without prompts |
| `--dry-run` | Print planned actions without changing files or installing packages |
| `--with-magic-context` / `--skip-magic-context` | Run or skip the upstream Magic Context setup |
| `--with-external` / `--skip-external` | Enable or skip the external package manifest |
| `--with-browser` / `--skip-browser` | Enable or skip `agent-browser` installation |
| `--with-rtk` / `--skip-rtk` | Enable or skip the RTK binary used by `pi-rtk-optimizer` |
| `--with-model-defaults` / `--skip-model-defaults` | Apply or preserve provider/model defaults |

Examples:

```bash
# Inspect every action without changing the machine
./install.sh --dry-run --yes

# Apply the repository's provider/model defaults too
./install.sh --yes --with-model-defaults

# Skip Magic Context setup, external packages, and optional command-line runtimes
./install.sh --yes --skip-magic-context --skip-external --skip-browser --skip-rtk
```

PowerShell uses matching switch names:

```powershell
.\install.ps1 -Yes -WithModelDefaults
```

### Verify

Start a new terminal after installation if `pi` is not yet on `PATH`, then run:

```bash
pi --version
pi list
```

Start Pi, configure a custom provider with `pi-provider`, then select its model:

```text
pi
/provider add
/model
```

When browser automation or RTK is enabled, run the corresponding check:

```bash
npm exec --prefix "$HOME/.pi/agent/npm" -- pi-agent-browser-doctor
```

On Windows PowerShell:

```powershell
npm exec --prefix (Join-Path $HOME ".pi\agent\npm") -- pi-agent-browser-doctor
```

```text
rtk --version
/rtk verify
/sensitive-guard status
```

From the repository root, verify the local hashline adapter and its installed dependencies:

```bash
node scripts/verify-rtk-hashline-compat.mjs
```

The initial tool set should include `load_tools`. It is a model tool, not a slash command: ask Pi to use a capability such as semantic code intelligence or browser automation, and it activates exactly one matching deferred tool. See the [complete usage guide](docs/USAGE.zh-CN.md) for activation and end-to-end examples.

## Local extensions

| Extension | Purpose | Main control |
| --- | --- | --- |
| [`pi-brand-header`](extensions/pi-brand-header/) | Responsive startup header with model, theme, workspace, skill, and tool information | `/logo` |
| [`pi-agent-browser-compat`](extensions/pi-agent-browser-compat/) | Normalizes provider-generated `agent_browser` arguments | `PI_AGENT_BROWSER_COMPAT_DISABLE=1` |
| [`pi-deferred-tools`](extensions/pi-deferred-tools/) | Groups tools by extension and activates them on demand | `/deferred-tools` |
| [`pi-manager-models`](extensions/pi-manager-models/) | Refreshes an OpenAI-compatible model catalog while preserving local overrides | Provider `baseUrl` and environment variables |
| [`pi-slim-skills`](extensions/pi-slim-skills/) | Compresses the skill index and injects selected skill content once per prompt | `/slim-skills` |
| [`pi-todo-guard`](extensions/pi-todo-guard/) | Continues runs while Todo contains unfinished tasks | `PI_TODO_GUARD_DISABLE=1` |
| [`pi-semantic-code`](extensions/pi-semantic-code/) | Deferred code-structure navigation, diagnostics, and safe rename across C/C++, Python, Rust, JS/TS, C#, Go, LaTeX, and Typst | Describe the definition, references, errors, or rename you need; Pi loads it when needed |
| [`pi-goal-verifier`](extensions/pi-goal-verifier/) | Runs configured commands before Goal completion | `.pi/goal-verification.json`, `~/.pi/agent/goal-verification.json`, `/goal-verify` |
| [`pi-workflow-dag`](extensions/pi-workflow-dag/) | Deferred dependency-aware inspect/implement/review workers | Describe the dependent phases; Pi loads it when needed |
| [`pi-rtk-hashline-compat`](extensions/pi-rtk-hashline-compat/) | Applies RTK read limits to hashline output while leaving `write` and `replace` results untouched | `PI_RTK_HASHLINE_COMPAT_DISABLE=1` |
| [`pi-tool-rails`](extensions/pi-tool-rails/) | Adds themed tool labels, result panels, and prompt framing | `PI_TOOL_RAILS_DISABLE_USER_FRAME=1` |
| [`adhd-mode.ts`](extensions/adhd-mode.ts) | Adds session-persistent ADHD response rules | `/adhd` |
| [`matugen-chrome.ts`](extensions/matugen-chrome.ts) | Renders a Cometix-style footer with the active Pi theme | `/matugen-chrome` |

## First use

1. Start Pi from the project directory: `pi`.
2. Give a bounded request with the intended verification, for example: `Fix the login callback; run its focused tests; do not change other modules.`
3. For code-structure questions, describe what you want in plain language; for example: `Find the definition, all references, and type diagnostics for UserStore in src/service.py. Read-only; tell me the safest modification entry point.`
4. Use `/goal` with a `goal-verification.json` file for a verified long task. For a small dependency graph, describe the inspect, implement, and review phases in plain language.

The [complete usage guide](docs/USAGE.zh-CN.md) explains every installed capability and includes coding, review, semantic navigation, Goal, delegation, browser, PDF, and visualization examples.

A typical package check looks like this:

```bash
cd extensions/pi-brand-header
npm install
npm run typecheck
npm pack --dry-run

cd ../pi-rtk-hashline-compat
npm install
npm run check
npm pack --dry-run
```

## Skills

The repository includes skills for writing, scientific visualization, literature research, file processing, and coding workflows. Invoke a discoverable skill by its directory name:

```text
/skill:humanizer
/skill:scientific-visualization
/skill:mineru-file-processing
```

Some directories are reference collections without a top-level `SKILL.md`. Pi does not register those directories as slash commands, but their files remain available for manual use.

## External packages

[`config/external-packages.txt`](config/external-packages.txt) is the source of truth for third-party npm and Git packages. It covers:

- file search, browser automation, previews, and external-directory access
- planning, goals, Todo management, structured questions, and subagents
- hash-anchored editing, output compaction, caching, and research workflows
- sensitive-file protection, themes, token speed, and raw-paste support

`pi-rtk-optimizer` remains an external package. The local `pi-rtk-hashline-compat` package bridges its read-output limits to `pi-hashline-edit-pro`'s `HASH│content` format. It only compacts successful `read` results; `write` and `replace` remain untouched. Run `/reload` after installation or updates.

## Update this backup

Pull repository changes, review them, then reapply the portable configuration:

```bash
cd ~/.pi_config
git pull --ff-only
git status
node install.mjs --dry-run --yes
node install.mjs --yes
```

The installer creates a fresh backup of the active Pi directory. It updates skills, settings, local packages, deferred IDs, Magic Context defaults, and public extension configuration; it does not copy credentials or session data.

## Security

[`.gitignore`](.gitignore) excludes credentials, model and authentication registries, sessions, caches, databases, logs, dependencies, generated assets, backups, and environment files.

Run these checks before every commit:

```bash
git status
git diff --check
git grep -n -I -i -E 'BEGIN (RSA|OPENSSH|PRIVATE)|api[_-]?key|token|secret|password|/home/'
```

Configure providers, model registries, API keys, and environment variables separately on each machine. Never commit real credentials.
