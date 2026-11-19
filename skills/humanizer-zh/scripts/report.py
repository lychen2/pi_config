#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Humanizer-zh 前后对比报告（Markdown）。

用法：
    python3 detect.py 原文.md --json --out before.json
    python3 detect.py 改后.md --json --out after.json
    python3 report.py 原文.md 改后.md before.json after.json \\
        [--semantic labeled.json] --out report.md

--semantic 可选：detect.py --candidates 的输出经逐条判断后，条目带
label / confidence / reason / status（拟改时加 suggestion）的 JSON。
所有已标注候选都会列出，包括误报；未标注条目显示为未复核。
逐行命中的处置可直接写入 before.json 的 hits 条目（label / status /
reason / suggestion），也可在 --semantic 里用 hits（模式名 -> 标注列表）。
"""
import argparse
import difflib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from detect import CHAR_HITS, REGEX_HITS

TYPE_TITLES = {
    "rename": "同义重命名（段级）",
    "cohesion": "衔接方式（段间接口）",
    "colon": "冒号分类",
    "iso3": "高度同构三连",
}
HIT_NAMES = {nm for _, nm, *_ in REGEX_HITS}

FALSE_POSITIVE_LABELS = {
    "误报", "不成立", "保留", "无需改", "false_positive", "keep", "已否决",
}
FALSE_POSITIVE_STATUS_MARKERS = ("误报", "不成立", "保留", "无需改",
                                 "false_positive", "keep")


def load_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"无法读取 JSON：{path}（{exc}）", file=sys.stderr)
        sys.exit(1)


def fmt_val(v):
    return "—" if v is None else str(v)


def fmt_delta(a, b):
    if a is None or b is None:
        return "—"
    d = b - a
    if isinstance(a, int) and isinstance(b, int):
        return f"{d:+d}"
    return f"{d:+g}"


# ---------------- 指标对比 ----------------

def metric_table_md(d0, d1):
    out = [
        "### 逐行句式候选", "",
        "| 指标 | 改前 | 改后 | 变化 |",
        "|---|---:|---:|---:|",
    ]
    for level, name, *_ in REGEX_HITS:
        c0 = len(d0.get("hits", {}).get(name, []))
        c1 = len(d1.get("hits", {}).get(name, []))
        v0 = d0.get("density", {}).get(name, 0)
        v1 = d1.get("density", {}).get(name, 0)
        out.append(f"| {name}（{level}） | {c0}（{v0}/千字） | "
                   f"{c1}（{v1}/千字） | {c1 - c0:+d} |")

    out += [
        "", "### 标点统计（每千正文汉字）", "",
        "| 标点 | 改前 | 改后 | 变化 |",
        "|---|---:|---:|---:|",
    ]
    for _, name, *_ in CHAR_HITS:
        v0 = d0.get("char_density", {}).get(name, 0)
        v1 = d1.get("char_density", {}).get(name, 0)
        out.append(f"| {name} | {v0} | {v1} | {fmt_delta(v0, v1)} |")

    out += [
        "", "### 结构分布（只描述）", "",
        "| 指标 | 改前 | 改后 | 变化 |",
        "|---|---:|---:|---:|",
    ]
    for key in ("句数", "段数", "句长CV", "段长CV", "小标题/千字",
                "两句同构/百段", "三句同构/百段"):
        v0 = d0.get("structure", {}).get(key)
        v1 = d1.get("structure", {}).get(key)
        out.append(f"| {key} | {fmt_val(v0)} | {fmt_val(v1)} | "
                   f"{fmt_delta(v0, v1)} |")

    out += ["", "变化列只是前后差值；候选数量减少不等于质量改善。"]
    return "\n".join(out)


# ---------------- 改前候选清单 ----------------

def _group_hit_annotations(items):
    out = {}
    for h in items:
        if not isinstance(h, dict):
            continue
        name = h.get("pattern") or h.get("name")
        if not name:
            t = h.get("type")
            if t in HIT_NAMES:
                name = t
        if name:
            out.setdefault(name, []).append(h)
    return out


def normalize_hit_annotations(sem):
    """--semantic 里的逐行命中标注：{"hits": {模式名: [...]}} 或带 pattern 的列表。"""
    if isinstance(sem, dict):
        raw = sem.get("hits")
        if isinstance(raw, dict):
            return {name: [h for h in items if isinstance(h, dict)]
                    for name, items in raw.items()}
        if isinstance(raw, list):
            return _group_hit_annotations(raw)
    if isinstance(sem, list):
        return _group_hit_annotations(sem)
    return {}


ANNOTATION_FIELDS = ("label", "status", "reason", "confidence", "suggestion")


def has_annotation(obj):
    if not isinstance(obj, dict):
        return False
    for k in ANNOTATION_FIELDS:
        v = obj.get(k)
        if v is not None and str(v).strip():
            return True
    return False


def findings_section_md(d, hit_annotations=None):
    hit_annotations = hit_annotations or {}
    out = []
    levels = [
        ("A", "固定句式候选（不是必须修改）", "未复核"),
        ("B", "建议复核候选", "未复核"),
        ("X", "已否决特征（不改）", "已否决，不改"),
    ]
    for level, title, status in levels:
        names = [nm for lv, nm, *_ in REGEX_HITS if lv == level]
        blocks = []
        for name in names:
            hs = d.get("hits", {}).get(name, [])
            if not hs:
                continue
            exact, loose = {}, {}
            for a in hit_annotations.get(name, []):
                exact[(a.get("file"), a.get("line"), a.get("excerpt"))] = a
                loose[(a.get("file"), a.get("line"))] = a

            lines = [f"**{name}**：{len(hs)} 处", ""]
            unannotated_shown = 0
            hidden = 0
            statuses = []
            for h in hs:
                a = h if has_annotation(h) else None
                if a is None:
                    a = exact.get((h.get("file"), h.get("line"), h.get("excerpt")))
                if a is None:
                    a = loose.get((h.get("file"), h.get("line")))
                st = item_status(a) if a else status
                statuses.append(st)
                if a is None:
                    if unannotated_shown >= 20:
                        hidden += 1
                        continue
                    unannotated_shown += 1
                bits = [f"状态：{st}"]
                if a:
                    label = str(a.get("label", "")).strip()
                    if label:
                        bits.append(f"标签：{label}")
                    if a.get("confidence", "") != "":
                        bits.append(f"置信：{a['confidence']}")
                    reason = str(a.get("reason", "")).strip()
                    bits.append(f"理由：{reason[:160]}" if reason
                                else "理由：未注明")
                    sug = str(a.get("suggestion", "")).strip()
                    if sug:
                        bits.append(f"建议：{sug[:160]}")
                else:
                    bits.append("理由：未复核" if status == "未复核"
                                else "理由：已否决特征")
                lines.append(f"- `{h['file']}:{h['line']}` {h['excerpt']}")
                lines.append("  - " + "；".join(bits))
            counts = {}
            for st in statuses:
                counts[st] = counts.get(st, 0) + 1
            if counts:
                lines[0] += "（" + "，".join(
                    f"{k} {v}" for k, v in counts.items()) + "）"
            if hidden:
                lines.append(f"（另有 {hidden} 条未标注命中未逐条列出，"
                             "已计入状态统计。）")
            blocks.append("\n".join(lines))
        if blocks:
            out.append(f"### {level} · {title}\n\n" + "\n\n".join(blocks))
    return "\n\n".join(out).strip()


# ---------------- 语义层判读 ----------------

def normalize_semantic(sem):
    if not sem:
        return {}
    if isinstance(sem, dict) and isinstance(sem.get("candidates"), (dict, list)):
        sem = sem["candidates"]
    if isinstance(sem, dict):
        return {k: [c for c in sem.get(k, []) if isinstance(c, dict)]
                for k in TYPE_TITLES}
    if isinstance(sem, list):
        return {k: [c for c in sem
                    if isinstance(c, dict) and c.get("type") == k]
                for k in TYPE_TITLES}
    return {}


def item_status(c):
    if c.get("status"):
        return str(c["status"])
    label = str(c.get("label", "")).strip()
    if not label:
        return "未复核"
    if label in FALSE_POSITIVE_LABELS or label.startswith("误报"):
        return "误报/保留"
    return "已标注"


def item_context(c):
    typ = c.get("type", "")
    if typ == "cohesion" or c.get("prev_tail") or c.get("next_head"):
        return f"{c.get('prev_tail', '')} → {c.get('next_head', '')}"
    if typ == "rename" or c.get("para"):
        return c.get("para", "")
    if typ == "colon" or c.get("sentence"):
        return c.get("sentence", "")
    if typ == "iso3" or c.get("sents"):
        return "／".join(c.get("sents") or [])
    return c.get("context", "")


def semantic_meta(sem):
    if isinstance(sem, dict):
        if isinstance(sem.get("candidates"), dict):
            return sem["candidates"].get("meta", {})
        return sem.get("meta", {})
    return {}


def semantic_section_md(sem):
    groups = normalize_semantic(sem)
    if not groups or not any(groups.values()):
        return ""

    out = [
        "## 语义层候选判读", "",
        "语义 JSON 中的候选全部保留，包括误报；未标注 label/status 的条目记为未复核。"
        "候选数量、误报数量本身不构成质量评分。", "",
    ]
    m = semantic_meta(sem)
    if m:
        bits = []
        if "coverage" in m:
            bits.append(f"候选覆盖率 {m['coverage']}")
        if "正文汉字数" in m:
            bits.append(f"正文 {m['正文汉字数']} 汉字")
        if m.get("短样本"):
            bits.append("短样本")
        trunc = m.get("truncated")
        if isinstance(trunc, dict):
            parts = [f"{k} {v.get('kept')}/{v.get('total')}"
                     for k, v in trunc.items()]
            bits.append("截断：" + "，".join(parts))
        elif trunc:
            bits.append("有截断")
        if bits:
            out.append("；".join(bits) +
                       "。未复核项和未覆盖候选不作为全篇结论。")
            out.append("")
    for key, title in TYPE_TITLES.items():
        items = groups.get(key, [])
        if not items:
            continue
        statuses = [item_status(c) for c in items]
        annotated = sum(1 for s in statuses if s != "未复核")
        unjudged = len(items) - annotated
        fp = sum(1 for s in statuses
                 if any(m in s for m in FALSE_POSITIVE_STATUS_MARKERS))
        out.append(f"### {title}（{len(items)} 条；已标注 {annotated}；"
                   f"未复核 {unjudged}；误报/保留记录 {fp}）")
        out.append("")

        counts = {}
        for s in statuses:
            counts[s] = counts.get(s, 0) + 1
        if counts:
            out.append("状态统计：" + "，".join(
                f"{k} {v}" for k, v in sorted(counts.items(),
                                              key=lambda x: -x[1])))
            out.append("")

        for c in items:
            st = item_status(c)
            label = str(c.get("label", "")).strip()
            conf = c.get("confidence", "")
            reason = str(c.get("reason", "")).strip()
            loc = f"{c.get('file', '')}:{c.get('line', '')}"
            if c.get("type") == "cohesion" and c.get("prev_line"):
                loc = (f"{c.get('file', '')}:{c.get('prev_line')}"
                       f"→{c.get('line')}")
            ctx = re.sub(r"\s+", " ", item_context(c)).strip()[:160]
            bits = [f"状态：{st}", f"标签：{label}" if label else "标签：—"]
            if conf != "":
                bits.append(f"置信：{conf}")
            bits.append(f"理由：{reason[:160]}" if reason else
                        ("理由：未复核" if st == "未复核" else "理由：未注明"))
            sug = str(c.get("suggestion", "")).strip()
            if sug:
                bits.append(f"建议：{sug[:160]}")
            out.append(f"- `{loc}` {ctx or '（无上下文）'}")
            out.append("  - " + "；".join(bits))
        out.append("")
    return "\n".join(out)


# ---------------- 前后对照 ----------------

def para_split(text):
    return [p for p in re.split(r"\n\s*\n", text) if p.strip()]


def inline_diff_md(a, b):
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    out = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            out.append(a[i1:i2])
        elif tag == "delete":
            out.append(f"<del>{a[i1:i2]}</del>")
        elif tag == "insert":
            out.append(f"<ins>{b[j1:j2]}</ins>")
        else:
            out.append(f"<del>{a[i1:i2]}</del><ins>{b[j1:j2]}</ins>")
    return "".join(out)


def diff_section_md(text0, text1):
    p0, p1 = para_split(text0), para_split(text1)
    sm = difflib.SequenceMatcher(None, p0, p1, autojunk=False)
    body = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            body.extend(p0[i1:i2])
        elif tag == "delete":
            body.extend(f"<del>{p}</del>" for p in p0[i1:i2])
        elif tag == "insert":
            body.extend(f"<ins>{p}</ins>" for p in p1[j1:j2])
        else:
            a, b = p0[i1:i2], p1[j1:j2]
            n = min(len(a), len(b))
            body.extend(inline_diff_md(pa, pb) for pa, pb in zip(a[:n], b[:n]))
            body.extend(f"<del>{p}</del>" for p in a[n:])
            body.extend(f"<ins>{p}</ins>" for p in b[n:])
    return "\n\n".join(body)


# ---------------- 组装 ----------------

def build_report_md(t0, t1, d0, d1, sem, name0, name1):
    m0, m1 = d0.get("meta", {}), d1.get("meta", {})
    parts = [
        "# Humanizer-zh · 前后对比报告\n\n"
        f"`{name0}` → `{name1}`",
        "标记：<del>删除线</del> = 改前文字；<ins>下划线</ins> = 改后文字。",
        "## 口径\n\n" + "\n".join([
            f"- {m0.get('count_scope', '正文：受保护区域不计入')}",
            f"- 改前：汉字 {m0.get('汉字数', '—')}，"
            f"正文 {m0.get('正文汉字数', '—')}",
            f"- 改后：汉字 {m1.get('汉字数', '—')}，"
            f"正文 {m1.get('正文汉字数', '—')}",
        ]),
        "本报告只记录检测与改动对照。候选数量减少、误报减少或任何指标接近参考值，"
        "都不等于文字质量改善。C 类句长/段长分布只描述，不设目标、不评分，"
        "也不据此推断作者或生成模型。",
        "## 一、指标前后对比\n\n" + metric_table_md(d0, d1),
    ]

    if m0.get("短样本") or m1.get("短样本"):
        parts.append("注意：至少一侧正文少于 500 汉字，密度仅作参考。")

    sem_md = semantic_section_md(sem)
    if sem_md:
        parts.append(sem_md)

    hit_annotations = normalize_hit_annotations(sem)
    parts.extend([
        "## 二、改前候选（逐行句式）\n\n"
        + (findings_section_md(d0, hit_annotations) or "（无逐行句式命中）"),
        "未标注的命中一律记为未复核；命中不代表必须修改。",
        "## 三、改前改后对照\n\n" + diff_section_md(t0, t1),
    ])
    return "\n\n".join(p for p in parts if p.strip())


def write_output(path, text):
    try:
        Path(path).write_text(text, encoding="utf-8")
    except OSError as exc:
        print(f"无法写入：{path}（{exc}）", file=sys.stderr)
        sys.exit(1)


def main():
    ap = argparse.ArgumentParser(description="Humanizer-zh 前后对比报告（Markdown）")
    ap.add_argument("before", help="改前文本文件")
    ap.add_argument("after", help="改后文本文件")
    ap.add_argument("json_before", help="改前 detect --json 输出")
    ap.add_argument("json_after", help="改后 detect --json 输出")
    ap.add_argument("--semantic", help="语义判读结果 JSON")
    ap.add_argument("--out", required=True, help="输出 Markdown 路径")
    args = ap.parse_args()

    for path in (args.before, args.after, args.json_before, args.json_after):
        if not Path(path).is_file():
            print(f"文件不存在：{path}", file=sys.stderr)
            sys.exit(1)
    if args.semantic and not Path(args.semantic).is_file():
        print(f"文件不存在：{args.semantic}", file=sys.stderr)
        sys.exit(1)

    t0 = Path(args.before).read_text(encoding="utf-8", errors="ignore")
    t1 = Path(args.after).read_text(encoding="utf-8", errors="ignore")
    d0 = load_json(args.json_before)
    d1 = load_json(args.json_after)
    sem = load_json(args.semantic) if args.semantic else None

    page = build_report_md(t0, t1, d0, d1, sem, args.before, args.after)
    write_output(args.out, page)

    b0 = d0.get("meta", {}).get("正文汉字数")
    b1 = d1.get("meta", {}).get("正文汉字数")
    if b0 is None or b1 is None:
        print(f"报告 → {args.out}", file=sys.stderr)
    else:
        print(f"报告 → {args.out}（正文汉字 {b0} → {b1}，"
              f"变化 {b1 - b0:+d}）", file=sys.stderr)


if __name__ == "__main__":
    main()
