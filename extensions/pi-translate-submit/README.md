# pi-translate-submit

Translates Pi editor text into English with a separately selected lightweight model and writes the result back without submitting it.

## Behavior

- Press `Ctrl+Alt+T` to translate the editor text.
- Run `/translate-model` to select any available Pi model.
- Plain Enter keeps Pi's normal submit behavior.
- Missing or unavailable saved models fall back to the current main model.
- Code blocks, inline code, URLs, paths, CLI flags, environment names, and extension placeholders are protected.
- Malformed or conversational model output is rejected without changing the editor.
- Editor changes made while translation runs are never overwritten.

## Install

```bash
pi install "$(realpath extensions/pi-translate-submit)"
```

The selected provider/model pair is stored as `translate-submit.json` in Pi's official agent directory. API keys remain in Pi's provider authentication store.

```text
/translate-model
/translate-model provider/model-id
/translate-model reset
```

## Development

```bash
npm install
npm test
npm run typecheck
npm pack --dry-run
```

Requires a Pi version that exports the extension and compatible simple-completion APIs used by this package.
