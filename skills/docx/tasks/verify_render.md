# Task: Verify / render a DOCX (DOCX → PNG)

## Why this exists
DOCX editing tools can "succeed" while the visual output is broken. Always verify by rendering.

## Preferred: use the packaged renderer
This uses a dedicated LibreOffice profile + writable HOME and produces `page-<N>.png` images:

```bash
python $HOME/.pi/agent/skills/docx/render_docx.py ./input.docx --output_dir ./out
# For debugging LibreOffice failures:
python $HOME/.pi/agent/skills/docx/render_docx.py ./input.docx --output_dir ./out --verbose
# Optional: also write <input_stem>.pdf to --output_dir (for debugging/archival):
python $HOME/.pi/agent/skills/docx/render_docx.py ./input.docx --output_dir ./out --emit_pdf
```

## Manual render command (if you need it)
Use a unique LibreOffice profile (permission/locking issues are common in containers):

```bash
OUTDIR=./out
INPUT=./input.docx
BASENAME=$(basename "$INPUT" .docx)
LO_PROFILE=./.lo_profile_${BASENAME}_$$
mkdir -p "$OUTDIR" "$LO_PROFILE"

HOME="$LO_PROFILE" soffice --headless -env:UserInstallation=file://"$LO_PROFILE" \
  --convert-to pdf --outdir "$OUTDIR" "$INPUT"

pdftoppm -png "$OUTDIR/$BASENAME.pdf" "$OUTDIR/$BASENAME"
```

## Success criteria
- PNGs exist for each page
- Spot-check page count and representative pages

**Note:** LibreOffice sometimes prints scary-looking stderr (e.g., `error : Unknown IO error`) even when output is correct. Treat the conversion as successful if the PNGs exist and look correct (and if you used `--emit_pdf`, the PDF exists and is non-empty).

## What to check in the PNGs
- clipped text (especially headings and table cells)
- overlapping objects
- broken tables (wrapping, misalignment, missing borders)
- unexpected font substitution
- header/footer alignment and page breaks

## Caveats
- **Comments often don’t render** in headless LibreOffice PDFs. Use structural checks for comments.
- **Field codes (page numbers, TOC)** may show placeholder values in some PDF renders. If the user needs proof, re-check in Word or update fields before final render.
- **Multi-section docs** can have different page sizes/orientations; DPI is computed from the first section by default. If some pages look scaled oddly, use `--dpi` to override.

## Delivery checklist
- Final DOCX is clean (no internal citation tokens, no placeholder text)
- Final render looks correct on all pages
- `.` contains only final outputs (unless user asked for intermediates)
