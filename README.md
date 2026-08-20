# pi_config

**English** | [简体中文](README.zh-CN.md)

A portable, understandable, and recoverable workspace configuration for the [Pi coding agent](https://github.com/badlogic/pi-mono).

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

This repository groups the resources used to build a practical Pi environment: local extensions, reusable skills, themes, public settings, and cross-platform installers. Use it as a starting point on a new machine, or reuse only the component that fits your workflow.

## Start with the Pi model

Pi is a coding agent that runs in the terminal. Start it from a project directory, describe a concrete goal, and let it inspect files, run commands, edit code, and report verification results through the tools available in that workspace.

This repository adds four kinds of resources:

- **Extensions** add commands, tools, and interface behavior such as `/tools`, `/logo`, and delegated workflows.
- **Skills** provide reusable procedures for tasks such as research, document processing, code review, and visualization.
- **Configuration** keeps public Pi settings, system guidance, tool selection examples, and the external package manifest together.
- **Themes** keep the terminal interface and status information visually consistent.

The shortest useful path is: enter a project directory, start `pi`, describe a bounded task, and ask for a verification command before the task is considered complete.

## Design principles

### Start with the shortest path

A new user needs three things to begin: install the environment, choose a model, and describe a task. Learn extensions, skills, and advanced configuration as the workflow requires them. The root README stays an entry point; detailed reference material lives in the [complete usage guide](docs/USAGE.zh-CN.md) and [quick-start Wiki](docs/WIKI.zh-CN.md).

### Keep public configuration separate from machine data

The repository stores portable public configuration. Provider credentials, API keys, tokens, model registries, session history, and runtime data remain on each machine. The installer backs up files it updates and preserves existing machine-owned skills, themes, and standalone extensions.

### Give tasks boundaries and verification

A useful request names the goal, scope, constraints, and acceptance method. Specify the directories to change, ask Pi to read existing tests before editing, and require the relevant tests before completion. This keeps changes focused and makes the result observable.

### Use capabilities when they help

Pi can work with file editing, code inspection, web access, skills, and delegation. Describe a simple task directly. Load a specialist workflow with `/skill:<name>` when the task needs one. Use `/tools` to reduce the tool set for a project that does not need every capability.

### Make every change inspectable and recoverable

Use `--dry-run` before installation, review Git diffs and test results after code changes, and use `pi-workspace-history` when you need workspace-level recovery.

## Five-minute setup

> [!WARNING]
> Pi extensions and third-party packages run with the current user's permissions. Read the installer before executing it and verify that the source is trusted.

### New machine

Linux or macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/lychen2/pi_config/main/install.sh | sh
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/lychen2/pi_config/main/install.ps1 | iex
```

The bootstrap scripts check or install Node.js, Git, and Pi, then run this repository's configuration installer.

### Existing checkout, Node.js, and Pi

Run from the repository root:

```bash
node install.mjs --dry-run --yes
node install.mjs --yes
```

The first command prints the planned actions. The second applies the recommended settings. Linux and macOS also support:

```bash
./install.sh --yes
```

Windows PowerShell:

```powershell
.\install.ps1 -Yes
```

The installer backs up the active Pi configuration, merges missing skills and themes, installs repository-local extensions, and installs external packages and RTK according to the selected options. Provider credentials and model registries stay machine-local.

### First launch

Open a new terminal after installation and start Pi from your project directory:

```bash
cd /path/to/your/project
pi
```

For a custom provider, use:

```text
/provider add
/model
```

Then send a bounded task, for example:

```text
Inspect the login callback in the current project.
Scope: change only the login module and its tests.
Read the existing implementation and tests first, then propose the smallest fix.
Run the focused tests before completion and report any remaining risk.
```

## Common entry points

| Goal | Input |
| --- | --- |
| Attach a file | `@src/auth.ts` |
| Run a command and send its output to Pi | `!git status --short` |
| Run a command while keeping output local | `!!tail -n 100 server.log` |
| Enter read-only planning mode | `/plan` |
| Load a named skill | `/skill:humanizer` |
| Adjust the current project's tools | `/tools` |
| Reload changed configuration | `/reload` |

For code tasks, ask Pi to report changed files, verification commands, and remaining risks. Start with focused tests and expand to the full suite when the change warrants it.

### Delegate independent work in parallel

The default profile provides the `teammate` tool, which launches independent Pi subprocesses with multi-task dispatch, DAG dependencies, background completion notifications, and result aggregation.

```text
Use teammate to dispatch two independent tasks that do not edit the same files, then summarize both statuses and results.
```

The main tools are `teammate`, `teammate-send`, `teammate-list`, and `observe`. The repository still keeps `extensions/pi-gsd` for users who explicitly want the sequential `/start-task`, `/finish-task`, and `/auto` session-tree workflow, but the installer no longer enables it by default.

Use `teammate` only for bounded independent or reviewable work where fresh context or parallel progress materially helps. Keep trivial, tightly coupled, and continuously context-dependent work in the parent agent. Pass a minimal brief; the parent agent owns integration and final verification.

## Repository map

| Path | Contents |
| --- | --- |
| `install.sh`, `install.ps1`, `install.mjs` | Linux, macOS, and Windows installation entry points |
| `config/` | Public settings, system guidance, tool-selection examples, and the external package manifest |
| `extensions/` | Local Pi packages and standalone extensions |
| `skills/` | Reusable task workflows and reference material |
| `themes/` | Portable Pi themes |
| `docs/` | Quick start, complete guide, and catalogs |

## Continue from here

- [Quick-start Wiki](docs/WIKI.zh-CN.md): common commands and workflows after the first installation.
- [Complete usage guide](docs/USAGE.zh-CN.md): tool selection, file/search tools, large-project workflows, task branches, web access, and research scenarios.
- [Extension catalog](docs/extensions.zh-CN.md): purpose, commands, and configuration for local and third-party extensions.
- [Skill catalog](docs/skills.zh-CN.md): skills grouped by task with invocation examples.
- [Tool catalog](docs/tools.zh-CN.md): current tools with usage examples.

## Update the configuration

Pull repository changes, preview the plan, then apply them:

```bash
cd ~/.pi_config
git pull --ff-only
node install.mjs --dry-run --yes
node install.mjs --yes
```

Run `/reload` inside Pi after configuration changes. Restart Pi when the installer, an extension, or repository configuration changed.

### Plugin reinstall

The installer always starts from a clean plugin state to eliminate stale extensions, tool schemas, and package caches. It backs up `~/.pi/agent`, removes `extensions/`, `npm/`, and the `packages` list in `settings.json`, then reinstalls plugins from this repository and `config/external-packages.txt`. Skills, themes, model configuration, provider credentials, headers, and sessions are preserved.

Preview the cleanup before applying it:

```bash
node install.mjs --yes --dry-run
```

## Security checks

This repository stores public configuration only. Check the worktree and diff before committing:

```bash
git status
git diff --check
git grep -n -I -i -E 'BEGIN (RSA|OPENSSH|PRIVATE)|api[_-]?key|token|secret|password|/home/'
```

Manage API keys, tokens, passwords, private keys, and provider configuration separately on each machine. Never commit real credentials.
