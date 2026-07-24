# pi configuration

Reusable pi extensions, skills, and non-sensitive configuration.

## Contents

- `extensions/`: custom extension source and package metadata
- `skills/`: installed skill source and documentation, excluding caches and large generated assets
- `config/`: portable configuration snippets without providers, API keys, local paths, or session state

## Install

Copy the selected directories into the corresponding pi configuration directories, or install an extension package from its directory with the normal pi package workflow. Review each skill before enabling it.

## Excluded intentionally

Credentials, provider/model registries, auth files, sessions, caches, backups, subagent state, local settings, machine-specific paths, dependency directories, and generated assets are not tracked.
