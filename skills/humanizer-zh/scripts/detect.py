#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Humanizer-zh 离线检测：定位候选，不改写。

用法：
    python3 detect.py <文件或目录> [--json] [--candidates] [--out path] [--max-hits 5]

正文口径：
    代码围栏（``` / ~~~）、行内代码、引用、表格、标题、清单、分隔线、
    front matter、HTML 注释均不计入正文。density / char_density 的
    分子和分母都只取正文；分母是正文精确汉字数。

候选口径：
    只从正文段落抽取，保留原文 file/line；代码、外语段落和整段引文不进入候选。
    段间衔接只连接相邻正文块，不跨标题、代码、表格、清单等断点。
"""
import argparse
import json
import re
import sys
from pathlib import Path

EXTS = {".md", ".txt"}
HANZI_RE = re.compile(r"[\u4e00-\u9fff]")

# ---------------- 逐行句式候选（level, 名称, 模式, 处理提示） ----------------
# A = 固定句式候选，需复核；B = 建议复核；X = 实测已否决，仅作背景，不改。

REGEX_HITS = [
    ("A", "翻案腔",
     r"(?:不是|并非|不在于|与其说)[^，。！？\n]{1,20}[，]?(?:而是|而在于|不如说)",
     "正面直陈：删「不是A」，直接写B。"),
    ("A", "提示语冒号",
     r"(?:一句话(?:总结|说|概括)|简单说|说白了|总结(?:是|为)?|小结(?:是|为)?"
     r"|结论(?:是|为)?|核心(?:是|在于|观点)?"
     r"|关键(?:是|在于)?|重点(?:是)?|原因(?:如下|有|在于)?|问题(?:是|在于)?"
     r"|答案(?:是)?|本质(?:是|上)?|具体(?:来说|如下|包括)?"
     r"|举例(?:来说)?|换句话说|也就是说|我的(?:观点|判断|结论)|建议(?:是)?)[：:]",
     "删提示语直接写内容；前半句承接上文时只换标点。"),
    ("A", "起手式",
     r"(?:说白了|说穿了|先说结论)[，,]",
     "删掉直接给判断。"),
    ("A", "当…时从句",
     r"当[^，。\n]{2,20}(?<!的时候)时，",
     "删「当」和「时」，让从句直接作前一分句。"),
    ("A", "前置话题壳",
     r"(?:对于[^，。\n]{2,15}来说|对[^，。\n]{2,15}而言|就[^，。\n]{2,15}而言|在[^，。\n]{2,12}方面)",
     "对象直接放到主语位，删壳子。"),
    ("A", "句首连接词",
     r"(?:^|[。！？]\s*)\s{0,3}(?:然而|因此|此外|与此同时|换言之|总而言之)[，、]",
     "移到主语后，或换「不过」「其实」。"),
    ("B", "顿号并列≥3",
     r"[^，。！？；：、\n]{1,14}、[^，。！？；：、\n]{1,14}、[^，。！？；：、\n]{1,14}",
     "能概括就概括；必须保留时打破其中一项的句法。"),
    ("B", "过长前置定语",
     r"(?:一个|一种|一套|这种|这个)[^，。、；：！？\n]{15,}的[一-鿿]{2,5}",
     "拆成两个分句；连续两个以上「的」时优先处理。"),
    ("X", "概括替代(已否决)",
     r"(?:显著(?:提升|提高|增长|改善|增加|优势)|大幅(?:提升|增长|提高|改善|下降|减少)"
     r"|明显(?:改善|提升|优势|变化)|效率的提升|众多|海量)",
     "实测未显示稳定差异，即使同段有具体数值也不改。"),
    ("X", "「这意味着」复述(已否决)",
     r"(?:这意味着|这表明|这说明)",
     "复测未显示稳定差异，不改。"),
    ("X", "空转句引列表(已否决)",
     r"[^，。！？\n]{0,25}[：:]\s*$",
     "目录式长文的正常写法，不改。"),
]

# ---------------- 标点统计（level, 名称, 计入字符, 说明） ----------------
# 按字符计，不走逐行命中；只统计正文。

CHAR_HITS = [
    ("F", "破折号", ("——",), "描述项；是否保留看具体功能。"),
    ("F", "分号", ("；",), "描述项；仅统计中文分号；代码、行内代码、表格、引用块中的分号不计入。"),
    ("F", "引号", ("“",), "描述项；仅统计中文左引号。"),
    ("C", "顿号", ("、",), "描述项；仅统计中文顿号。"),
    ("C", "冒号", ("：",), "描述项；仅统计中文冒号；冒号句候选另见 --candidates。"),
]

CAND_CAPS = {"rename": 60, "cohesion": 60, "colon": 80, "iso3": 60}

# ---------------- 行分类与受保护区域 ----------------

FENCE_RE = re.compile(r"^(\s{0,3})(`{3,}|~{3,})(.*)$")
HEADING_RE = re.compile(r"^\s{0,3}#{1,6}(?:\s|$)")
LIST_RE = re.compile(r"^\s{0,3}(?:(?:[-*+]|\d{1,9}[.)、])\s+"
                     r"|[一二三四五六七八九十]+[、.]\s*)")
QUOTE_RE = re.compile(r"^\s{0,3}>")
TABLE_RE = re.compile(r"^\s{0,3}\|")
HR_RE = re.compile(r"^\s{0,3}(?:-{3,}|\*{3,}|_{3,}|={3,})\s*$")
BOLD_LINE_RE = re.compile(r"^\s{0,3}\*\*[^*]{2,40}\*\*\s*$")
INDENT_RE = re.compile(r"^(?: {4,}|\t)")
COMMENT_START_RE = re.compile(r"^\s{0,3}<!--")
HTML_COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
HTML_TAG_RE = re.compile(r"</?[A-Za-z][^>\n]*>")
IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
LINK_RE = re.compile(r"\[([^\]]*)\]\([^)]*\)")
INLINE_CODE_RE = re.compile(r"(`+)(.+?)\1", re.S)
PROTECTED_INLINE_RES = (INLINE_CODE_RE, IMAGE_RE, HTML_COMMENT_RE, HTML_TAG_RE)

GROUPABLE = {"code", "frontmatter", "comment", "quote", "table", "list"}


def inline_spans(s):
    """行内受保护片段的 [start, end) 区间，已合并重叠。"""
    spans = []
    for rx in PROTECTED_INLINE_RES:
        spans.extend((m.start(), m.end()) for m in rx.finditer(s))
    if not spans:
        return []
    spans.sort()
    merged = []
    for a, b in spans:
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
        else:
            merged.append((a, b))
    return merged


def visible_segments(s):
    """按行内受保护片段切开，返回只含正文的片段，避免命中跨过代码。"""
    spans = inline_spans(s)
    if not spans:
        return [s]
    out, pos = [], 0
    for a, b in spans:
        if a > pos:
            out.append(s[pos:a])
        pos = max(pos, b)
    if pos < len(s):
        out.append(s[pos:])
    return [seg for seg in out if seg.strip()]


def hanzi(s):
    """精确统计汉字数。"""
    return len(HANZI_RE.findall(s))


def clean_inline(s):
    """把行内代码、图片、HTML 注释/标签置为空格；链接只保留文字。"""
    spans = inline_spans(s)
    if spans:
        chars = list(s)
        for a, b in spans:
            for i in range(a, b):
                chars[i] = " "
        s = "".join(chars)
    return LINK_RE.sub(r"\1", s)


def _frontmatter_close(lines):
    """只在首行 --- 且 50 行内出现闭合、内容像 YAML 键值或列表时认定 front matter。"""
    if not lines or lines[0].lstrip("\ufeff").strip() != "---":
        return False
    seen_key = False
    for line in lines[1:51]:
        s = line.strip()
        if not s:
            continue
        if line[:1].isspace():
            if seen_key:
                continue
            return False
        if s in ("---", "..."):
            return seen_key
        if re.match(r"^[A-Za-z0-9_-]+\s*:", s):
            seen_key = True
            continue
        if s.startswith("-") or s.startswith("#"):
            seen_key = True
            continue
        return False
    return False


def iter_lines(text):
    """逐行产出 (行号, 原文, 类型, 正文清洗文本)。

    类型：blank/body/heading/list/quote/table/code/hr/frontmatter/comment。
    """
    lines = text.splitlines()
    frontmatter = _frontmatter_close(lines)
    in_fence = None
    in_comment = False
    in_front = False
    prev_kind = None
    pending_list = False

    for idx, raw in enumerate(lines, 1):
        stripped = raw.strip()

        if idx == 1 and frontmatter:
            in_front = True
            pending_list = False
            yield (idx, raw, "frontmatter", "")
            prev_kind = "frontmatter"
            continue
        if in_front:
            pending_list = False
            yield (idx, raw, "frontmatter", "")
            if not raw[:1].isspace() and stripped in ("---", "..."):
                in_front = False
            prev_kind = "frontmatter"
            continue

        if in_comment:
            pending_list = False
            yield (idx, raw, "comment", "")
            if "-->" in raw:
                in_comment = False
            prev_kind = "comment"
            continue
        if COMMENT_START_RE.match(raw) and "-->" not in raw:
            in_comment = True
            pending_list = False
            yield (idx, raw, "comment", "")
            prev_kind = "comment"
            continue

        m = FENCE_RE.match(raw)
        if in_fence:
            pending_list = False
            char, length = in_fence
            if m and m.group(2)[0] == char and len(m.group(2)) >= length and not m.group(3).strip():
                in_fence = None
            yield (idx, raw, "code", "")
            prev_kind = "code"
            continue
        if m:
            pending_list = False
            in_fence = (m.group(2)[0], len(m.group(2)))
            yield (idx, raw, "code", "")
            prev_kind = "code"
            continue

        if not stripped:
            yield (idx, raw, "blank", "")
            if prev_kind == "list":
                pending_list = True
            prev_kind = None
            continue

        if pending_list:
            pending_list = False
            if raw[:1].isspace():
                yield (idx, raw, "list", "")
                prev_kind = "list"
                continue

        if prev_kind == "list" and raw[:1].isspace():
            kind = "list"
        elif INDENT_RE.match(raw) and prev_kind not in ("body", "quote", "list"):
            kind = "code"
        elif QUOTE_RE.match(raw):
            kind = "quote"
        elif HEADING_RE.match(raw) or BOLD_LINE_RE.match(raw):
            kind = "heading"
        elif TABLE_RE.match(raw):
            kind = "table"
        elif LIST_RE.match(raw):
            kind = "list"
        elif HR_RE.match(raw):
            kind = "hr"
        elif prev_kind == "quote" and not raw[:1].isspace():
            kind = "quote"
        else:
            kind = "body"

        cleaned = clean_inline(raw) if kind == "body" else ""
        yield (idx, raw, kind, cleaned)
        prev_kind = kind


def paragraph_blocks(text):
    """按空行切块，返回 [(类型, 正文清洗文本, 起始行号)]。"""
    blocks = []
    cur = []
    cur_kind = None
    cur_start = None

    def flush():
        nonlocal cur, cur_kind, cur_start
        if cur:
            blocks.append((cur_kind, "\n".join(t for _, t in cur), cur_start))
        cur, cur_kind, cur_start = [], None, None

    for no, _, kind, cleaned in iter_lines(text):
        if kind == "blank":
            flush()
            continue
        if kind == "body":
            if cur_kind != "body":
                flush()
                cur_kind = "body"
                cur_start = no
            cur.append((no, cleaned))
        else:
            if cur_kind == kind and kind in GROUPABLE:
                cur.append((no, ""))
            else:
                flush()
                cur_kind = kind
                cur_start = no
                cur.append((no, ""))
            if kind in ("heading", "hr"):
                flush()
    flush()
    return blocks


# ---------------- 句切分与同构 ----------------

SENT_RE = re.compile(r"[^。！？；]+[。！？；]?")


def split_sents_with_pos(para):
    """返回 [(句子, 段落内起始位置)]；跨行折行不拆句。"""
    out = []
    for m in SENT_RE.finditer(para):
        raw = m.group(0)
        s = re.sub(r"\s+", " ", raw).strip()
        keep = len(s) >= 4 or (
            len(s) >= 2 and s.endswith(("？", "！", "?", "!")))
        if keep:
            start = m.start() + (len(raw) - len(raw.lstrip()))
            out.append((s, start))
    return out


def split_sents(para):
    return [s for s, _ in split_sents_with_pos(para)]


def is_candidate_sent(s):
    """长句，或带问号/叹号的短句；短问句不因逗号数为 0 被丢掉。"""
    return len(s) > 10 or s.endswith(("？", "！", "?", "!"))


def signature(s):
    """句结构指纹：逗号数、冒号、括号、长度档、句末标点。"""
    terminal = s[-1] if s and s[-1] in "。！？；!?;" else ""
    return (s.count("，"), "：" in s or ":" in s,
            ("（" in s or "(" in s), len(s) // 15, terminal)


def _same_structure(sigs):
    if not all(sig == sigs[0] for sig in sigs):
        return False
    # 无逗号时仍接受连续问句/感叹句，避免常见三连问被漏掉。
    return sigs[0][0] >= 1 or sigs[0][4] in "？！!?"


def isomorphic_hits(para, n):
    sents = [s for s in split_sents(para) if is_candidate_sent(s)]
    hits = []
    for i in range(len(sents) - n + 1):
        sigs = [signature(s) for s in sents[i:i + n]]
        if _same_structure(sigs):
            hits.append("／".join(sents[i:i + n]))
    return hits


def isomorphic_triples(body, first_no):
    sents = [(s, pos) for s, pos in split_sents_with_pos(body)
             if is_candidate_sent(s)]
    out = []
    for i in range(len(sents) - 2):
        sigs = [signature(s) for s, _ in sents[i:i + 3]]
        if _same_structure(sigs):
            line = first_no + body[:sents[i][1]].count("\n")
            out.append({"line": line,
                        "sents": [s for s, _ in sents[i:i + 3]]})
    return out


def cv(vals):
    if len(vals) < 2:
        return None
    mean = sum(vals) / len(vals)
    if mean == 0:
        return None
    var = sum((v - mean) ** 2 for v in vals) / len(vals)
    return (var ** 0.5) / mean


# ---------------- 度量 ----------------

def measure_docs(docs):
    total_han = 0
    body_han = 0
    hits = {name: [] for _, name, *_ in REGEX_HITS}
    char_counts = {name: 0 for _, name, *_ in CHAR_HITS}
    n_para = n_head = 0
    iso2 = iso3 = 0
    sent_lens, para_lens = [], []

    for fname, text in docs:
        total_han += hanzi(text)

        for no, raw, kind, cleaned in iter_lines(text):
            if kind != "body":
                continue
            body_han += hanzi(cleaned)
            for seg in visible_segments(raw):
                seg = LINK_RE.sub(r"\1", seg)
                for _, name, pat, _ in REGEX_HITS:
                    for m in re.finditer(pat, seg):
                        hits[name].append({"file": fname, "line": no,
                                           "excerpt": m.group(0)[:60]})
            for _, name, tokens, _ in CHAR_HITS:
                char_counts[name] += sum(cleaned.count(t) for t in tokens)

        for kind, body, _ in paragraph_blocks(text):
            if kind == "heading":
                n_head += 1
                continue
            if kind != "body":
                continue
            body_clean = clean_block(body)
            if hanzi(body_clean) == 0:
                continue
            n_para += 1
            para_lens.append(hanzi(body_clean))
            for s in split_sents(body_clean):
                h = hanzi(s)
                if h:
                    sent_lens.append(h)
            iso2 += len(isomorphic_hits(body_clean, 2))
            iso3 += len(isomorphic_hits(body_clean, 3))

    k = body_han / 1000
    density = {name: (round(len(v) / k, 3) if k else 0.0)
               for name, v in hits.items()}
    char_density = {name: (round(n / k, 3) if k else 0.0)
                    for name, n in char_counts.items()}
    sent_cv = cv(sent_lens)
    para_cv = cv(para_lens)

    return {
        "meta": {
            "篇数": len(docs),
            "汉字数": total_han,
            "正文汉字数": body_han,
            "段数": n_para,
            "小标题数": n_head,
            "短样本": body_han < 500,
            "count_scope": "正文：排除代码围栏（含 ~~~）、行内代码、引用块、表格、"
                           "标题、清单、分隔线、front matter、HTML 注释",
            "density_denominator": "正文汉字数/1000",
        },
        "density": density,
        "char_density": char_density,
        "hits": hits,
        "structure": {
            "句数": len(sent_lens),
            "段数": n_para,
            "句长CV": round(sent_cv, 3) if sent_cv is not None else None,
            "段长CV": round(para_cv, 3) if para_cv is not None else None,
            "小标题/千字": round(n_head / k, 3) if k else 0.0,
            "两句同构/百段": round(iso2 / n_para * 100, 2) if n_para else None,
            "三句同构/百段": round(iso3 / n_para * 100, 2) if n_para else None,
        },
    }


# ---------------- 语义层候选 ----------------

def clean_block(b):
    """正文块清洗：屏蔽行内代码/链接，去掉强调标记，保留换行以定位行号。"""
    t = clean_inline(b)
    return re.sub(r"[*_`]+", "", t)


def clean_para(b):
    return re.sub(r"\s+", " ", clean_block(b)).strip()


def is_standalone_quote(s):
    """整段只由引号内容、标点和空白组成时返回 True；正文夹在引号之间不算。"""
    s = s.strip()
    if not s:
        return False
    pairs = {"“": "”", "「": "」", '"': '"', "‘": "’"}
    punct = "。！？；，、：:…—（）()【】[] \t\n.?!,;"
    saw_quote = False
    i = 0
    while i < len(s):
        ch = s[i]
        if ch in pairs:
            saw_quote = True
            j = s.find(pairs[ch], i + 1)
            if j < 0:
                return False
            i = j + 1
            continue
        if ch in punct:
            i += 1
            continue
        return False
    return saw_quote


def _cap(items, cap):
    if len(items) <= cap:
        return items, None
    step = len(items) / cap
    kept = [items[min(int(i * step), len(items) - 1)] for i in range(cap)]
    return kept, {"total": len(items), "kept": cap,
                  "coverage": round(cap / len(items), 3)}


def extract_candidates(docs):
    rename, cohesion, colon, iso3 = [], [], [], []
    body_han = 0

    for fname, text in docs:
        body_han += sum(hanzi(cleaned) for _, _, kind, cleaned in iter_lines(text)
                        if kind == "body")
        blocks = paragraph_blocks(text)

        for kind, body, first_no in blocks:
            if kind != "body":
                continue
            para = clean_para(body)
            if hanzi(para) >= 30 and not is_standalone_quote(para):
                rename.append({"type": "rename", "file": fname,
                               "line": first_no, "para": para})

        for i in range(len(blocks) - 1):
            ka, ba, na = blocks[i]
            kb, bb, nb = blocks[i + 1]
            if ka != "body" or kb != "body":
                continue
            a, b = clean_para(ba), clean_para(bb)
            if hanzi(a) < 20 or hanzi(b) < 20:
                continue
            if is_standalone_quote(a) or is_standalone_quote(b):
                continue
            tail = split_sents(a) or [a[-60:]]
            head = split_sents(b) or [b[:60]]
            cohesion.append({"type": "cohesion", "file": fname,
                             "line": nb, "prev_line": na,
                             "prev_tail": tail[-1], "next_head": head[0]})

        for no, raw, kind, cleaned in iter_lines(text):
            if kind != "body":
                continue
            if is_standalone_quote(clean_para(raw)):
                continue
            context = cleaned.strip()
            for seg in visible_segments(cleaned):
                line = seg.strip()
                if not line or "://" in line or is_standalone_quote(clean_para(line)):
                    continue
                for m in re.finditer(r"([^：:，。！？\n]{2,30})[：:](.{2,60})", line):
                    before = m.group(1).strip()
                    after = m.group(2).strip()
                    if hanzi(before) < 2 or not after:
                        continue
                    colon.append({"type": "colon", "file": fname, "line": no,
                                  "colon_before": before,
                                  "colon_after": after[:60],
                                  "sentence": context[:120]})

        for kind, body, first_no in blocks:
            if kind != "body":
                continue
            block_text = clean_block(body)
            if hanzi(block_text) < 3 or is_standalone_quote(block_text):
                continue
            iso3.extend({"type": "iso3", "file": fname, **c}
                        for c in isomorphic_triples(block_text, first_no))

    raw = {"rename": rename, "cohesion": cohesion,
           "colon": colon, "iso3": iso3}
    kept, truncated = {}, {}
    for key, items in raw.items():
        kept[key], info = _cap(items, CAND_CAPS[key])
        if info:
            truncated[key] = info

    n_total = sum(len(v) for v in raw.values())
    n_kept = sum(len(v) for v in kept.values())
    meta = {
        "正文汉字数": body_han,
        "短样本": body_han < 500,
        "n_candidates": n_kept,
        "n_total": n_total,
        "n_rename": len(kept["rename"]),
        "n_cohesion": len(kept["cohesion"]),
        "n_colon": len(kept["colon"]),
        "n_iso3": len(kept["iso3"]),
        "n_total_rename": len(raw["rename"]),
        "n_total_cohesion": len(raw["cohesion"]),
        "n_total_colon": len(raw["colon"]),
        "n_total_iso3": len(raw["iso3"]),
        "caps": CAND_CAPS,
        "truncated": truncated or False,
        "coverage": round(n_kept / n_total, 3) if n_total else 1.0,
        "coverage_by_type": {
            key: (round(len(kept[key]) / len(raw[key]), 3) if raw[key] else 1.0)
            for key in raw
        },
        "count_scope": "只从正文段落抽取；外语段落不进入候选；排除代码围栏（含 ~~~）、"
                       "行内代码、引用块、表格、标题、清单、front matter、HTML 注释；"
                       "段间衔接不跨受保护块",
    }
    return {"meta": meta, **kept}


# ---------------- 文本报告 ----------------

def fmt_report(r, max_hits):
    m = r["meta"]
    out = ["Humanizer-zh 检测（只检测，不改写）", ""]
    out.append(f"语料：{m['篇数']} 篇 / 汉字 {m['汉字数']}"
               f"（正文 {m['正文汉字数']}）/ 段 {m['段数']}"
               f" / 小标题 {m['小标题数']}")
    out.append(f"口径：{m['count_scope']}")
    if m.get("短样本"):
        out.append("注意：正文少于 500 汉字，密度仅作参考，不据此判断文本质量。")
    out.append("")

    def emit(level, title, status="未复核"):
        rows = []
        for lv, name, _, advice in REGEX_HITS:
            if lv != level:
                continue
            hs = r["hits"].get(name, [])
            if not hs:
                continue
            rows.append(f"  {name}：{len(hs)} 处，"
                        f"{r['density'].get(name, 0)}/千字；状态：{status}")
            rows.append(f"    → {advice}")
            for h in hs[:max_hits]:
                rows.append(f"      · {h['file']}:{h['line']}  {h['excerpt']}")
        if rows:
            out.append(f"[{level}] {title}")
            out.extend(rows)
            out.append("")

    emit("A", "固定句式候选（未复核，不是必须修改）")
    emit("B", "建议复核候选（未复核）")
    emit("X", "已否决特征（不改）", "已否决，不改")

    out.append("[F/C] 标点统计（正文；每千正文汉字）")
    for _, name, _, advice in CHAR_HITS:
        out.append(f"  {name}：{r['char_density'].get(name, 0)}/千字  {advice}")
    out.append("")

    s = r["structure"]

    def val(v):
        return "—" if v is None else v

    out.append("[C] 结构分布（只描述，不设目标，不评分）")
    out.append(f"  句数={s['句数']}；段数={s['段数']}；"
               f"句长CV={val(s['句长CV'])}；段长CV={val(s['段长CV'])}")
    out.append(f"  小标题/千字={s['小标题/千字']}；"
               f"两句同构/百段={val(s['两句同构/百段'])}；"
               f"三句同构/百段={val(s['三句同构/百段'])}")
    out.append("")
    out.append("提示：命中与密度只是定位线索；候选需逐条复核，误报应保留记录。")
    return "\n".join(out)


# ---------------- CLI ----------------

def read_docs(target):
    p = Path(target)
    if not p.exists():
        print(f"路径不存在：{p}", file=sys.stderr)
        sys.exit(1)
    if p.is_file():
        if p.suffix.lower() not in EXTS:
            print(f"仅支持 .md/.txt：{p}", file=sys.stderr)
            sys.exit(1)
        return [(p.name, p.read_text(encoding="utf-8", errors="ignore"))]
    docs = []
    for f in sorted(p.rglob("*")):
        if f.is_file() and f.suffix.lower() in EXTS:
            docs.append((str(f.relative_to(p)),
                         f.read_text(encoding="utf-8", errors="ignore")))
    if not docs:
        print("未找到 .md/.txt 文件", file=sys.stderr)
        sys.exit(1)
    return docs


def write_output(path, text):
    try:
        Path(path).write_text(text, encoding="utf-8")
    except OSError as exc:
        print(f"无法写入：{path}（{exc}）", file=sys.stderr)
        sys.exit(1)


def main():
    ap = argparse.ArgumentParser(description="Humanizer-zh 离线检测（只检测，不改写）")
    ap.add_argument("target", help="文件或目录（.md/.txt）")
    ap.add_argument("--json", action="store_true", help="输出 JSON")
    ap.add_argument("--candidates", action="store_true",
                    help="抽取语义层候选 rename/cohesion/colon/iso3")
    ap.add_argument("--out", help="输出路径；默认 stdout")
    ap.add_argument("--max-hits", type=int, default=5,
                    help="文本报告每项最多列出的命中数")
    args = ap.parse_args()

    docs = read_docs(args.target)

    if args.candidates:
        cand = extract_candidates(docs)
        if args.json:
            result = measure_docs(docs)
            result["candidates"] = cand
            payload = result
        else:
            payload = cand
        text = json.dumps(payload, ensure_ascii=False, indent=1)
        if args.out:
            write_output(args.out, text)
            print(f"候选 → {args.out}（{cand['meta']['n_candidates']} 条，"
                  f"coverage {cand['meta']['coverage']}）", file=sys.stderr)
        else:
            print(text)
        return

    result = measure_docs(docs)
    if args.json:
        text = json.dumps(result, ensure_ascii=False, indent=1)
    else:
        text = fmt_report(result, max(0, args.max_hits))
    if args.out:
        write_output(args.out, text)
        print(f"输出 → {args.out}", file=sys.stderr)
    else:
        print(text)


if __name__ == "__main__":
    main()
