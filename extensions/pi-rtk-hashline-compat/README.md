# pi-rtk-hashline-compat

Compatibility extension for `pi-rtk-optimizer` and `pi-hashline-edit-pro`.

`pi-rtk-optimizer@0.9.0` intentionally preserves explicit `read` ranges and does not recognize the three-character `HASH│content` format. This extension fills only that interoperability gap:

- runs as `tool_result` middleware through Pi's public extension API;
- recognizes hashline reads without replacing either plugin;
- applies RTK's configured character and smart-line limits;
- keeps every retained hash anchor and source line complete;
- rewrites `details.nextOffset` to the first omitted source line;
- skips results already compacted by RTK;
- leaves `write` and `replace` results untouched, so their hash validation and edit behavior are unchanged;

It reads RTK's runtime config from `~/.pi/agent/extensions/pi-rtk-optimizer/config.json` and becomes inactive when RTK read compaction is disabled or both truncation modes are disabled. It only changes successful `read` result text; `write` and `replace` events pass through unchanged. Set `PI_RTK_HASHLINE_COMPAT_DISABLE=1` to disable only this adapter. `PI_RTK_HASHLINE_MAX_CHARS` overrides the character limit for diagnosis.

## Development

```bash
npm install
npm run check
```
