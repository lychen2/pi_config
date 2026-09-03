# End-to-end smoke test (optional)

This is a quick checklist to validate the environment and the helper scripts.

## 1) Render check
```bash
python $HOME/.pi/agent/skills/docx/render_docx.py ./some.docx --output_dir ./out
```

## 2) Add header date, page numbers, hyperlink
```bash
python $HOME/.pi/agent/skills/docx/scripts/docx_ooxml_patch.py ./some.docx \
  --header-date "Date: 01/05/2026" \
  --add-page-numbers \
  --hyperlink-first "https://example.com"
```

## 3) Add comment (structural)
```bash
python $HOME/.pi/agent/skills/docx/scripts/docx_ooxml_patch.py ./some.docx \
  --add-comment --comment-text "Hello comment"  # optionally add --contains "..." to anchor elsewhere
```

## 4) Tracked replace
If you already have a `<w:ins w:id="102">` in the doc:
```bash
python $HOME/.pi/agent/skills/docx/scripts/docx_ooxml_patch.py ./some.docx \
  --enable-track --tracked-replace-ins-id 102 --new-text " HELLO"
```

## 5) Verify visually
Use `tasks/verify_render.md` (DOCX → PNG) and inspect.
