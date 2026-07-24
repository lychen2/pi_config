---
name: mineru-file-processing
description: Use when processing PDF, image, Word, PowerPoint, Excel, or document files; parsing files for Markdown, OCR, structure, tables, formulas, or agent-readable text.
---

# MinerU File Processing

## Overview

Use MinerU for agent-readable document parsing when local reading is insufficient or the file is a supported document format. Prefer the Agent lightweight API for small single-file work; ask before using the token-based precise API except when the user already asked for high accuracy, OCR, batch parsing, or structured exports.

## Supported Files

- PDF
- Images: `png`, `jpg`, `jpeg`, `jp2`, `webp`, `gif`, `bmp`
- Word: `doc`, `docx`
- PowerPoint: `ppt`, `pptx`
- Excel: `xls`, `xlsx`
- HTML is supported by the precise API with `model_version: "MinerU-HTML"`

Lightweight API is the default first attempt for a single small file. MinerU documents lightweight support for PDF, images, `docx`, `pptx`, and `xlsx`; URL mode may also accept `doc` and `ppt`. If lightweight returns unsupported-file or limit errors, stop and ask before using the token-based precise API.

## Routing Rules

| Situation | Default action |
|---|---|
| Single small supported file, ≤10MB and ≤20 pages | Use ⚡ Agent lightweight parse API directly; do not ask first; if the API rejects the extension, ask before precise API |
| PDF that fits lightweight limits | Use ⚡ Agent lightweight parse API directly |
| Image + current model can read images | Read image directly with the multimodal model |
| Image + current model cannot read images | Use ⚡ Agent lightweight parse API directly if it fits limits |
| Batch files, >10MB, >20 pages, or needs high accuracy | Ask whether to use MinerU precise API |
| Needs OCR, tables, formulas, layout, JSON, docx/html/latex export | Ask whether to use MinerU precise API unless user already requested it |
| User explicitly asks to use MinerU or precise parsing | Use MinerU precise API |
| Unsupported file or missing URL/upload path | Ask for a supported file source |

Small file means a single file within the lightweight API limits: ≤10MB and ≤20 pages. The precise API supports files up to 200MB, 200 pages, and batches up to 200 files.

## API Choice

### ⚡ Agent Lightweight Parse API

Use for small single files in normal agent workflows.

- Token: not required
- Limits: ≤10MB, ≤20 pages, single file only
- No `Authorization` header
- Output: Markdown CDN link
- Endpoints:
  - URL input: `https://mineru.net/api/v1/agent/parse/url`
  - File input: `https://mineru.net/api/v1/agent/parse/file`
- Flow: submit task, then poll result

### 🎯 Precise Parse API

Use when accuracy, OCR, tables, formulas, layout, structured output, batch work, or larger files matter.

- Token: required
- Header: `Authorization: Bearer $MINERU_API_TOKEN`
- Single-file endpoint: `https://mineru.net/api/v4/extract/task`
- Batch URL endpoint: `https://mineru.net/api/v4/file-urls/batch`
- Limits: ≤200MB, ≤200 pages, batch ≤200 files
- Default model: use `vlm` unless a reason exists to use `pipeline` or `MinerU-HTML`
- Default exports: Markdown and JSON
- Optional `extra_formats`: `docx`, `html`, `latex`

## Token Configuration

Do not hardcode the token in skill files, prompts, source code, or logs.

Generate the token in MinerU's API management page, then expose it as an environment variable:

```bash
export MINERU_API_TOKEN="your-token-here"
```

For persistent shell config, prefer fish universal variable because the user uses fish:

```fish
set -Ux MINERU_API_TOKEN "your-token-here"
```

A plain `export MINERU_API_TOKEN=...` is session-only unless placed in shell startup files.

For agent launches that do not inherit the interactive shell environment, use the local config file:

```bash
# file: ~/.config/mineru/env
MINERU_API_TOKEN=your-token-here
```

Before calling the precise API from shell commands, load it without printing the secret:

```bash
set -a
source ~/.config/mineru/env
set +a
```

For a project, prefer `.env` or the project secret manager:

```env
MINERU_API_TOKEN=your-token-here
```

## Precise API Request Defaults

For PDF, Office, Excel, and images:

```json
{
  "url": "https://example.com/file.pdf",
  "model_version": "vlm",
  "is_ocr": false,
  "enable_formula": true,
  "enable_table": true,
  "language": "ch"
}
```

Use `is_ocr: true` for scans, screenshots, image-only PDFs, or when text extraction is poor.

Use `extra_formats` only when the user needs those files:

```json
{
  "extra_formats": ["docx", "html", "latex"]
}
```

For HTML input:

```json
{
  "url": "https://example.com/page.html",
  "model_version": "MinerU-HTML"
}
```

## cURL Example

```bash
curl --location --request POST 'https://mineru.net/api/v4/extract/task' \
  --header "Authorization: Bearer $MINERU_API_TOKEN" \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "url": "https://cdn-mineru.openxlab.org.cn/demo/example.pdf",
    "model_version": "vlm",
    "enable_formula": true,
    "enable_table": true,
    "language": "ch"
  }'
```

## Ask Template

When asking whether to use MinerU precise API, ask one direct question:

> 这个文件超出轻量解析范围，或需要更高精度/结构化结果。是否使用 MinerU 精准解析 API？这需要 `MINERU_API_TOKEN`。

Do not ask for small single-file lightweight parsing. Ask only after lightweight parsing reports unsupported type, exceeded size/page limits, or the user needs precise outputs.

## Common Mistakes

- Do not use the token-based precise API for a small single file unless precision or structured output matters.
- Do not ask before lightweight parsing of a small single supported file.
- Do not send images to MinerU when the active model can directly read images and the user only needs visual understanding.
- Do not hardcode or print `MINERU_API_TOKEN`.
- Do not claim parsing succeeded until the async task result has been polled and the output link or parsed content exists.
