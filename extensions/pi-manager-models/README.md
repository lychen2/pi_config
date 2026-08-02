# pi-manager-models

Refreshes an OpenAI-compatible provider's model catalog from its `/models` endpoint while preserving model overrides from Pi's `models.json`.

The extension defaults to provider `manager` in Pi's official agent-directory `models.json`. If the file or provider is absent, it safely does nothing.

## Install

```bash
pi install npm:pi-manager-models
```

## Configuration

Configure a provider in `models.json` with at least `baseUrl`. Optional seed models let Pi start without a network request. Discovered IDs inherit matching seed metadata; unknown IDs receive conservative defaults.

Environment overrides:

- `PI_MANAGER_MODELS_PROVIDER`: provider ID, default `manager`
- `PI_MANAGER_MODELS_CONFIG`: alternate models JSON path

The extension supports literal, environment-variable, and `!command` API keys during startup. Provider refresh honors Pi's network policy and abort signal.

For `manager` DeepSeek models over `openai-responses`, the extension preserves max-effort reasoning during tool-call replay when the gateway returns only a reasoning summary. The fallback is scoped to that provider/model transport and leaves already-preserved reasoning untouched.

## Development

```bash
npm install
npm run typecheck
npm pack --dry-run
```
