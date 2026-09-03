# Preflight and normalize

Use this when a PDF behaves "weird" (can't open, renders inconsistently, extraction fails, etc.).

## Golden path
1) Preflight:
```bash
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_preflight.py input.pdf
```

2) If it warns about corruption/xref/font embedding, normalize:
```bash
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_edit.py optimize input.pdf -o normalized.pdf --recover --optimize_streams --compress_streams
```

3) Verify visually:
```bash
python $HOME/.pi/agent/skills/pdfs/scripts/render_pdf.py normalized.pdf --out_dir ./_norm_render --dpi 200
```

## Notes
- `optimize` is a PyMuPDF rewrite that often rebuilds xref tables and garbage-collects objects.
- If preflight says "likely scanned", run OCR first (see tasks/ocr.md).
