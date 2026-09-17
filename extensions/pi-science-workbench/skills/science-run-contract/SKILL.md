---
name: science-run-contract
description: Plan and run trusted scientific calculations with explicit inputs, units, outputs, required validation, provenance, and honest failure reporting.
---

# Scientific run contract

1. Confirm the configured environment and trusted-host execution permission. A subprocess is not a sandbox. Never install or upgrade packages without separate authorization.
2. Declare input paths relative to the project, staged destinations, units, parameters, output paths relative to `artifacts/`, size limits, and required validators before executing.
3. Use stable request IDs. A lost response requires querying the same request/run, not a new submission. Changed input with the same ID must fail.
4. Keep arrays in `science_python`; summarize explicitly or save artifacts. Do not print full arrays. Ordinary exceptions can leave partial state; interruption invalidates the kernel. Session navigation does not restore variables.
5. Use `science_job` for independently managed local/SSH processes. Its executable must be absolute and arguments explicit. SSH is not a scheduler. Query only when needed; `science_status` is cached and offline.
6. Check execution, artifact integrity, and scientific validation separately. Exit zero and matching hashes do not establish physical correctness. Unperformed checks remain `not_checked`.
7. Keep original failures. Lowered thresholds require a new experimental contract; do not overwrite a failing validation.
8. Report the run ID, relevant measurements, tolerances, and provenance limitations. Only explicitly registered inputs and outputs are tracked. Logs may expose secrets printed by user code.
9. Remote results must be harvested and locally verified before claiming local availability. Unknown remote state is not failure or cancellation confirmation.
