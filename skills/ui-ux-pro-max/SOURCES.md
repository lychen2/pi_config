# Source and local changes

Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

Pinned commit: 56ea9cf174ed86786187daa9de0e6247cb0747e4.
License: MIT, copyright 2024 Next Level Builder; retained in LICENSE.

The data directory and four runtime scripts come from .claude/skills/ui-ux-pro-max at that commit.
Scripts: search.py, core.py, design_system.py, and reasoning_contract.py. These files are unchanged.
SKILL.md is a local Pi entry with skill-relative paths, focused queries, project-first guidance, and explicit persistence instructions.
Upstream Claude plugin paths, installation steps, tests, and redundant reference guides are omitted.
Python 3 standard-library execution requires no package installation, network calls, or credentials.
Search reads bundled CSV files. --persist writes under the selected --output-dir; --force permits replacement.
Generated recommendations require review before adoption as project guidance.
