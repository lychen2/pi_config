#!/usr/bin/env python3
"""Summarize one numeric measurement per CSV row, grouped by the exact source label."""

import argparse
import csv
import math
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path


MISSING = {'', 'na', 'n/a', 'nan', 'null'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv_file', type=Path, help='CSV of rows eligible for this comparison')
    parser.add_argument('--group', required=True, help='Column containing group labels')
    parser.add_argument('--value', required=True, help='Numeric measurement column')
    parser.add_argument('--expect', nargs='+', metavar='LABEL', help='Check the exact set of displayed groups')
    args = parser.parse_args()

    counts = Counter()
    values = defaultdict(list)
    try:
        with args.csv_file.open(encoding='utf-8-sig', newline='') as source:
            reader = csv.DictReader(source, strict=True)
            header = reader.fieldnames or []
            for name in (args.group, args.value):
                if header.count(name) != 1:
                    raise ValueError(f'expected one column named {name!r}, found {header.count(name)}')
            for row in reader:
                if None in row or None in row.values():
                    raise ValueError(f'line {reader.line_num}: column count differs from header')
                group = row[args.group]
                if not group.strip():
                    raise ValueError(f'line {reader.line_num}: empty {args.group!r} label')
                counts[group] += 1
                text = row[args.value].strip()
                if text.casefold() in MISSING:
                    continue
                try:
                    value = float(text)
                    if not math.isfinite(value):
                        raise ValueError
                except ValueError:
                    raise ValueError(f'line {reader.line_num}: invalid {args.value!r} value {text!r}') from None
                values[group].append(value)
    except (OSError, csv.Error, ValueError) as error:
        parser.exit(2, f'{args.csv_file}: {error}\n')

    if not counts:
        parser.exit(1, 'No data rows.\n')

    writer = csv.writer(sys.stdout, lineterminator='\n')
    writer.writerow([args.group, 'rows', 'valid', 'missing', 'min', 'max', 'mean'])
    issues = []
    for group, rows in counts.items():
        observed = values[group]
        valid = len(observed)
        summary = (min(observed), max(observed), statistics.fmean(observed)) if valid else ('', '', '')
        writer.writerow([group, rows, valid, rows - valid, *summary])
        if not valid:
            issues.append(f'No valid {args.value} in group {group!r}.')
    if args.expect:
        expected = set(args.expect)
        if missing := sorted(expected - counts.keys()):
            issues.append(f'Expected labels absent from the data: {missing}')
        if extra := sorted(counts.keys() - expected):
            issues.append(f'Data labels absent from the expected set: {extra}')
    if issues:
        parser.exit(1, '\n'.join(issues) + '\n')


if __name__ == '__main__':
    main()
