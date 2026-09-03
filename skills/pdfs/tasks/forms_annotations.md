# Forms and annotations

This skill treats **forms** as three distinct cases:

1) **Fillable AcroForm / XFA-like** PDFs (real form fields exist)
2) **Non-fillable** PDFs (no fields; must place text/marks precisely) -> see `tasks/forms_nonfillable.md`
3) **Viewer-only appearance** issues (looks filled in one viewer, empty in another) -> see troubleshooting below

---

## Golden path: fillable AcroForm fields (recommended)

Goal: **values are actually embedded** (not just viewer-generated appearance) and optionally **flattened**.

1) Inspect fields

```bash
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_extract.py forms input.pdf --out ./fields.json --include_widgets
```

Look for:
- correct field names
- widgets with `/Rect` on expected pages
- choice options (`options`) and checkbox/radio `appearance_states`

2) Fill + (optionally) flatten via pdf-lib

```bash
bash $HOME/.pi/agent/skills/pdfs/js/install_deps.sh
node $HOME/.pi/agent/skills/pdfs/js/fill_form.mjs --input input.pdf --values values.json --output filled.pdf --flatten
```

3) Verify visually (render and inspect)

```bash
python $HOME/.pi/agent/skills/pdfs/scripts/render_pdf.py filled.pdf --out_dir ./_renders/filled --pages 1
open ./_renders/filled/page-1.png
```

4) Verify the values are real (not viewer-only)

```bash
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_extract.py forms filled.pdf --out ./filled_fields.json
```

Success criteria:
- renders show filled values aligned (no clipping)
- `filled_fields.json` shows the expected values
- if `--flatten` was used, fields should be removed or their widgets should no longer be editable

---

## CLI notes: pdf-lib helpers

All JS helpers support both positional and flags.

Preferred (flags):

```bash
node $HOME/.pi/agent/skills/pdfs/js/fill_form.mjs --input in.pdf --values values.json --output out.pdf --flatten
```

Also valid (positional):

```bash
node $HOME/.pi/agent/skills/pdfs/js/fill_form.mjs in.pdf values.json out.pdf --flatten
```

---

## Troubleshooting: the "appearance" pitfall

Symptoms:
- It looks filled in Preview/Chrome but prints blank, or looks empty in Acrobat.

Why:
- Some PDFs rely on viewer-generated appearances.
- Setting `/NeedAppearances` helps but is not sufficient.

What to do:

1) Prefer **flattening** (pdf-lib `--flatten`).
2) If flattening is not possible, verify in at least **two renderers**:

```bash
python $HOME/.pi/agent/skills/pdfs/scripts/render_pdf.py filled.pdf --engine pdftoppm --out_dir ./_r1
python $HOME/.pi/agent/skills/pdfs/scripts/render_pdf.py filled.pdf --engine pdfium  --out_dir ./_r2
```

3) Confirm values exist structurally:

```bash
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_extract.py forms filled.pdf --out ./filled_fields.json
```

---

## Correctness checklist for form filling

- [ ] Renders correctly in **at least one** renderer (preferably two)
- [ ] No clipped text; baselines fit inside boxes
- [ ] Checkbox/radio marks align with squares/circles
- [ ] Values are present in extraction output (`pdf_extract.py forms`)
- [ ] Output is flattened when the downstream consumer requires it

---

## When it is *not* a fillable form

If `pdf_extract.py forms` returns `{}` or only weird/incomplete fields, treat it as **non-fillable** and use:

- `tasks/forms_nonfillable.md` (box picking -> overlay -> verify)