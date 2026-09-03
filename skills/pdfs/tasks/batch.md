# Batch processing

If you need to run the same operation on many PDFs, prefer a batch pattern with a clean output root.

## Golden paths

### Render a corpus
```bash
python batch_pdf.py render \
  --in_glob "./in/**/*.pdf" \
  --out_root ./_renders \
  --dpi 200 --engine pdftoppm
```

### Inspect a corpus (JSON per file)
```bash
python batch_pdf.py inspect \
  --in_glob "./in/**/*.pdf" \
  --out_root ./_inspect
```

### Normalize/repair a corpus
```bash
python batch_pdf.py normalize \
  --in_glob "./in/**/*.pdf" \
  --out_root ./_normalized
```

## Notes
- Keep outputs separate by operation; avoid overwriting the input corpus.
- After batch edits, spot-check a few files via render + montage:
  - `python render_pdf.py one.pdf --out_dir ./_one --dpi 200`
  - `python create_montage.py ./_one --out ./_one_montage.png`
