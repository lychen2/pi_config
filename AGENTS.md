# Project coding rules

## Minimal scope

- Deliver the smallest complete change, including necessary callers, data, tests, and documentation. Reuse existing patterns and installed functionality. Do not add speculative abstractions or design-pattern scaffolding; introduce compatibility layers or dependencies only when the task requires them.
- Preserve unrelated working-tree changes. Apply cleanup to the current task's changes, not untouched code.

## Trust boundaries

- Internal calls, validated inputs, and established type contracts are trusted. Do not add defensive try/catch, null checks, defaults, retries, fallbacks, or repeated parameter validation on those paths.
- Validate external inputs once at the owning boundary: user input, network, filesystem, or third-party APIs. Add handling only for a concrete failure required by that boundary's contract; retries and fallbacks must be bounded and contract-required. Never turn failure into silent success.
- Preserve authorization, resource cleanup, required boundary checks, and branches for genuinely optional domain states. Fix broken internal invariants at their producer instead of masking them. If a new defensive guard has no identifiable external boundary and failure case, remove it.

## Test discipline

- Inspect the nearest tests first. Extend existing suites using their runner and fixtures. Create a test file only when repository convention requires one or no existing file fits the behavior.
- Test observable contracts, not implementation details. Name cases as subject + behavior + triggering condition, for example: "tool card hides source when collapsed".
- Mock external boundaries only when needed for deterministic tests. Do not mock private methods, assert internal call sequences, expose private APIs for tests, or assert implementation source text. Source text is testable only when it is itself the delivered contract.
- Each added case needs a distinct contract or regression and an expectation derived independently of the implementation. Reject duplicate scenarios, coverage-only cases, and self-validating test scaffolding. Removing a redundant test does not authorize removing its production behavior; preserve distinct success, rejection, security, persistence, and supported compatibility guarantees.
- Use existing script tests in `scripts/*.test.mjs` and each extension's existing layout and runner. Do not add a framework or parallel suite. Fix causes; do not hardcode fixtures, add test-only branches, or weaken valid assertions to get a pass.

## Required finishing pass

- During authorized code changes, run [.pi/prompts/deslop.md](.pi/prompts/deslop.md) once in apply mode before handoff or a requested commit, without another prompt. Remove unjustified task-added defenses and tests. This does not authorize edits during a read-only review.
- Run focused existing checks, all mandatory acceptance checks, and the owning package's typecheck for changed TypeScript. For prose-only edits, verify content, paths, and the diff without inventing tests.
- Reuse verification that remains valid for the final state. Stop when the requested behavior is complete, required checks support it, and no known in-scope blocker remains; do not add another audit loop or proof artifact.
- Report changed paths, checks actually run, and unresolved risks. Do not stage or commit unless requested.
