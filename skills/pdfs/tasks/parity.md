# Renderer parity

Use this when a PDF looks correct in one renderer/viewer but broken in another.

## Golden path
Render the same input with poppler (pdftoppm) and pdfium and diff the PNGs:
```bash
python renderer_parity.py input.pdf --out_dir ./_parity --dpi 200
```

Open:
- `./_parity/render_pdftoppm/page-*.png`
- `./_parity/render_pdfium/page-*.png`
- `./_parity/diff/page-*.png` (only for pages with changes)

## Notes
- Parity diffs can be noisy if the PDF contains randomized rendering (rare). If diffs are tiny, spot-check visually.
