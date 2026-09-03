# Task: Extract from a PDF (text, layout, tables, images, attachments)

## Choose the right tool

**Fast, good defaults**
- **pdfplumber**: text with layout, word/char boxes, basic table extraction.
- **PyMuPDF (fitz)**: very fast text + word boxes + image extraction + rendering.
- **pypdf**: metadata, outlines, page boxes, merge/split/rotate/encrypt, basic form fields.
- **Poppler utils**: rock-solid CLI tools (`pdfinfo`, `pdftotext`, `pdfimages`, `pdfdetach`, `pdffonts`, etc.).
- **pypdfium2**: fast render + text extraction (PDFium).

If the PDF is scanned: OCR first (`tasks/ocr.md`).

---

## Metadata / structure

```bash
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_inspect.py input.pdf --json > ./_tmp/info.json
```

For poppler metadata:

```bash
pdfinfo input.pdf
```

---

## Plain text extraction

For quick, lossy text:

```bash
pdftotext input.pdf - > ./_tmp/text.txt
```

For configurable extraction:

```bash
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_extract.py text input.pdf --method pdfplumber --out ./_tmp/text.txt
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_extract.py text input.pdf --method pymupdf   --out ./_tmp/text_pymupdf.txt
```

Tip: when order matters (multi-column), prefer `pymupdf` blocks/words or `pdfplumber` word boxes over plain text.

---

## Text with coordinates

### Words

```bash
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_extract.py words input.pdf --method pdfplumber --out ./_tmp/words.csv
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_extract.py words input.pdf --method pymupdf   --out ./_tmp/words_pymupdf.csv
```

CSV includes: `page, text, x0, top, x1, bottom`.

Coordinate notes:
- `pdfplumber`: origin is **top-left**; `top/bottom` increase downward.
- `PyMuPDF`: origin is **top-left**; `y` increases downward.

### Characters (fine-grained)

```bash
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_extract.py chars input.pdf --out ./_tmp/chars.csv
```

Use chars when you need tight alignment, kerning, or to rebuild table structure.

---

## Tables

### Basic table extraction (pdfplumber)

```bash
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_extract.py tables input.pdf --out_dir ./_tmp/tables
```

This creates per-table CSVs and (optionally) a single XLSX workbook:

```bash
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_extract.py tables input.pdf --xlsx ./_tmp/tables.xlsx
```

Table extraction is heuristic. If results are wrong:
- render the page and visually inspect grid lines
- try a tighter page crop / different page range
- consider OCR for scanned tables

---

## Images

### Extract embedded images (PyMuPDF)

```bash
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_extract.py images input.pdf --out_dir ./_tmp/images
```

### Extract images via Poppler (sometimes better for certain PDFs)

```bash
pdfimages -all input.pdf ./_tmp/pdfimages/out
```

---

## Embedded files (attachments)

```bash
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_extract.py attachments input.pdf --out_dir ./_tmp/attachments
```

Poppler alternative:

```bash
pdfdetach -list input.pdf
pdfdetach -saveall -o ./_tmp/attachments input.pdf
```

---

## Annotations

```bash
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_extract.py annotations input.pdf --out ./_tmp/annots.json
```

---

## Forms

List fields:

```bash
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_extract.py forms input.pdf
python $HOME/.pi/agent/skills/pdfs/scripts/pdf_extract.py forms input.pdf --include_widgets --out ./fields.json
```

Fill fields:
- robust fill + flatten: `tasks/forms_annotations.md` (pdf-lib)
- debugging/introspection: `tasks/forms_debugging.md`
