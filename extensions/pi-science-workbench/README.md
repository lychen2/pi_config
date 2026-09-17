# pi-science-workbench

Opt-in scientific execution for Pi 0.85 on Linux. This package does not modify global settings, the default installer, active-tool selection, SoL, Magic Context, or existing tools.

## Status

Local persistent Python, process jobs, records, integrity checks, scientific validators, and the SSH helper are implemented. Automated local and helper tests exist. Real SSH and interactive Default/Large/Plan-mode acceptance require an authorized test profile; passing helper tests is not real SSH acceptance. The full design's release gate has not yet been met.

## Project configuration

Add this package's absolute directory to the existing project `.pi/settings.json` packages array, preserving all existing entries. This is a manual opt-in; no installer runs automatically.

Create `.pi/science-workbench.json`:

```json
{
  "schemaVersion": 1,
  "defaultProfile": "local",
  "profiles": {
    "local": {
      "transport": "local",
      "python": "/absolute/path/to/.venv/bin/python",
      "executionTrust": "trusted-host",
      "environmentAllowlist": []
    }
  }
}
```

Optional `.pi/science-workbench.local.json` overrides object keys; arrays replace. Start Pi from this project directory. Python 3.11+ is required. The worker uses only the standard library; the optics example needs an existing NumPy installation. No packages are installed by the extension.

SSH profiles use `transport: "ssh"`, absolute remote `python`, `sshAlias`, `remoteRunRoot`, `executionTrust: "trusted-host"`, and `environmentAllowlist: []`. Use existing SSH aliases and verified host keys. No agent forwarding or automatic host-key acceptance occurs. SSH inputs are staged in 256 KiB chunks with declared hashes and a cumulative transfer limit. Explicitly allowlisted local environment values are transferred over SSH for the launched job. Only variable names are persisted in manifests and remote request records. Confirm that forwarding any license-related values is permitted.

## Tools

- `science_python`: `execute` or `reset`. Requires `request_id`; execute takes `code`, optional `profile`, `timeout_seconds`, `inputs`, `expected_outputs`, and `required_validations`. Variables persist until reset, navigation, shutdown, profile change, or interruption. Ordinary exceptions can leave partial state.
- `science_job`: `submit`, `poll`, `harvest`, `cancel`. All calls require `request_id`; non-submit actions require `run_id`. Submit uses absolute `executable` and an explicit `argv` array. Local jobs stop with Pi; remote jobs remain supervised remotely.
- `science_artifact`: `verify`, `request_id`, `run_id`, optional `checks`. For harvested SSH artifacts choose an explicit local `profile` for validation.
- `science_status`: cached, read-only `summary`, `runs`, `run`, `kernel`, `artifacts`, `log`. `runs` defaults to current branch references; `scope: "project"` shows all project runs. Logs support byte `offset` and `limit`.
- `/science`: read-only configuration/runtime summary.

Inputs are `{ "source": "project-relative-file", "path": "staged-name" }`, staged under `inputs/`. Outputs are `{ "path": "result.json", "required": true, "format": "json", "max_bytes": 4096 }`, expected under `artifacts/`. Paths must not escape the project or traverse symlinks. Files and logs remain in `.science/runs/<run-id>/`; add this directory and machine-specific configuration to your project's ignore rules yourself if needed.

Validators: `json` (fields, equals), `csv` (columns, numeric_columns, rows), `array` (NumPy shape/dtype/finite values, no pickle), and `slit` (analytic/reference and grid checks). Declare `required_validations` before executing. Unchecked scientific results remain `unverified`; execution success does not mean scientific success. Changed request contents cannot reuse an existing request ID.

## Security and lifecycle

This is **trusted-host execution, not a sandbox**. Code has the account's permissions; path checks restrict extension-managed copying, not arbitrary Python. Do not run untrusted scripts. Logs may contain secrets printed by code. The worker does not inherit Pi tokens or the full environment. Non-interactive execution is denied without a confirmation channel.

The package registers independent tools and never calls `setActiveTools`. Plan mode retains its own admission policy; do not opt execution tools into a read-only plan. Only `science_status` is a read-only query tool.

Local interruption invalidates the kernel. Session navigation clears grants and stops managed local jobs. No historical code is replayed. Remote query failures remain unknown; they never trigger automatic resubmission. Remove the project package entry and reload to disable; remote tasks and historical records are retained.

## Checks

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm pack --dry-run
```

Real SSH smoke (creates and retains a small remote run): set `SCIENCE_TEST_SSH_ALIAS`, `SCIENCE_TEST_REMOTE_PYTHON`, and `SCIENCE_TEST_REMOTE_ROOT` to an explicitly authorized disposable endpoint, then run `npm run test:ssh`. Missing endpoint variables produce an explicit skip.

## Remaining release work

- Real SSH interruption/recovery and host-policy acceptance; interactive Default/Large/Plan-mode matrix.
- Harden verification request recovery after crashes. Exclusive run locks reject concurrent verification/remote mutation; a stale lock requires manual inspection, not automatic deletion.
- Broader multi-process execution tests; avoid concurrent local-job ownership across Pi instances.
- Full resource/disk-failure and process-identity fault injection from the design plan.

Do not treat this package as meeting every gate in `docs/pi-science-workbench-plan.md` until these checks and implementation gaps are resolved.
