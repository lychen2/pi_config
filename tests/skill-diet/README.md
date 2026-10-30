# Evaluate skill changes with Pi

Use these fixtures with [skill-diet](https://github.com/nicobailon/skill-diet) to compare original, revised and absent skills. Evaluation starts real model sessions. It is separate from the automatic repository tests.

## Capture the original before editing

Run from the repository root. This example evaluates `paper-lookup`; use `visualization.tasks.json` and `scientific-visualization` for the plotting skill.

```sh
EVAL_DIR="$(mktemp -d -t pi-skill-diet.XXXXXX)"
git clone https://github.com/nicobailon/skill-diet "$EVAL_DIR/upstream"
mkdir -p "$EVAL_DIR/sk/before" "$EVAL_DIR/sk/after"
cp -a skills/paper-lookup "$EVAL_DIR/sk/before/"
cp tests/skill-diet/paper.tasks.json "$EVAL_DIR/tasks.json"
cp tests/skill-diet/pi-adapter.mjs "$EVAL_DIR/adapter"
chmod u+x "$EVAL_DIR/adapter"
```

After editing the skill, capture the candidate:

```sh
cp -a skills/paper-lookup "$EVAL_DIR/sk/after/"
node "$EVAL_DIR/upstream/scripts/eval.mjs" check "$EVAL_DIR/sk/after/paper-lookup"
```

Freeze the tasks before running sessions. Keep complete skill folders: scripts and conditional references affect behavior and token use.

## Run the same tasks in three conditions

Start with two tasks to check the adapter and scoring:

```sh
node "$EVAL_DIR/upstream/scripts/eval.mjs" run "$EVAL_DIR" \
  --versions before,after,none --tasks t03-arxiv-error-feed,t05-pmc-metadata-only \
  --runs 1 --parallel 6 --model manager/deepseek-v4.1-flash
node "$EVAL_DIR/upstream/scripts/eval.mjs" score "$EVAL_DIR" --detail
```

Then fill the complete matrix. Finished sessions are reused.

```sh
node "$EVAL_DIR/upstream/scripts/eval.mjs" run "$EVAL_DIR" \
  --versions before,after,none --runs 3 --parallel 6 \
  --model manager/deepseek-v4.1-flash
node "$EVAL_DIR/upstream/scripts/eval.mjs" score "$EVAL_DIR" --detail
```

Supplement the upstream score with adapter health and the synthetic-key audit:

```sh
node tests/skill-diet/summarize.mjs "$EVAL_DIR"
```

Inspect `processFailures` and `incompleteRuns` alongside the score. Health checks include timeouts and a terminal provider error, even when Pi exits zero. Older runs derive the terminal stop reason from their original events. Compare completed counts with the intended matrix: directories absent from `runs/` have not started. `fixtureDisclosures` flags synthetic keys anywhere in recorded events, including tool results and intermediate messages.

Use one authenticated model for every condition. Before each run, upstream calibration checks skill visibility, the absent-skill control and shell execution.

## Adapter requirements and isolation

The adapter requires Linux, Bubblewrap (`bwrap`), Node and the installed Pi CLI. It preserves the evaluator environment and uses the existing Pi authentication. It does not copy credentials into evaluation output.

Bubblewrap exposes system runtimes, the Pi npm installation, read-only Pi authentication/model files, the selected skill and the writable task directory. Other home files and evaluation versions remain hidden. The adapter also hides unrelated host skill-resource directories observed during calibration.

The absent-skill condition exposes no selected skill. Extensions, MCP, context files, prompt templates and automatic skill discovery are disabled. Explicit skill loading remains enabled for the other conditions. Each session receives `read`, `bash`, `write` and `edit`.

Model inference retains network access. The prompts prohibit task network calls and software installation; Bubblewrap does not enforce a network ban. These fixtures use local synthetic responses and offline plans. Their fake keys are test data.

The adapter writes the final answer, all reported usage, model-request count, tool calls, exit code, timeout status and terminal stop reason into `result.json`. Raw Pi events and stderr remain beside it. Generated `caption.txt` and `plot.py` files are preserved under `artifacts/` for independent review. Cached tokens count at full weight in upstream token comparisons; these totals do not measure billed cost.

## Inspect failures before changing a skill

Read every failed answer. For a suspected scoring error, give a fresh reviewer only the task and answer. Accept equivalent valid outputs.

A regex correction for an independently confirmed equivalent answer can be rescored. Changes to prompts, fixtures or behavioral checks require new runs for every affected condition. Preserve superseded run directories outside `runs/` before rerunning.

The heatmap fixture executes generated plotting code through Matplotlib and checks the returned figure. Caption checks inspect the saved caption. Use a blind, randomized comparison of before/after artifacts for visual or prose quality.

Keep snapshots, frozen tasks and results together when accepting a candidate. Record entry size separately from total session tokens: reference reads can offset a shorter entry.

The [2026-10-28 results](RESULTS.md) record the accepted literature skill and the pending visualization revision, with durable evidence and resumption commands.
