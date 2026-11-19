#!/usr/bin/env python3
"""
Citation Validation Tool
Validate BibTeX files for accuracy, completeness, and format compliance.
"""

import sys
import re
import requests
import argparse
import json
import subprocess
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from collections import defaultdict
from html import unescape
from unicodedata import normalize
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import parse_bibtex_file as _parse_bibtex_file  # noqa: E402

# Typical reference-list lengths, as (minimum, typical maximum, display name).
#
# These are editorial rules of thumb drawn from what published papers at these
# venues tend to carry -- not sourced submission requirements, most of which do
# not cap references at all. They drive warnings only; a bibliography is never
# wrong merely for being short.
VENUE_STANDARDS = {
    'nature': (35, 50, 'Nature'),
    'science': (35, 50, 'Science'),
    'cell': (35, 50, 'Cell'),
    'multidisciplinary': (35, 50, 'High-impact Multidisciplinary Journal'),
    'neurips': (30, 45, 'NeurIPS'),
    'icml': (30, 45, 'ICML'),
    'iclr': (30, 45, 'ICLR'),
    'cvpr': (30, 45, 'CVPR'),
    'acl': (30, 45, 'ACL'),
    'ml_cs_conf': (30, 45, 'ML/CS Conference'),
    'review': (40, 65, 'Comprehensive Literature Review'),
    'market_research': (40, 65, 'Market Research Report'),
    'literature_review': (40, 65, 'Literature Review / Market Research'),
    'nejm': (30, 45, 'NEJM'),
    'lancet': (30, 45, 'The Lancet'),
    'jama': (30, 45, 'JAMA'),
    'medical': (30, 45, 'Medical Journal'),
}


class CitationValidator:
    """Validate BibTeX entries for errors and inconsistencies."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'CitationValidator/1.0 (Citation Management Tool)'
        })
        self.venue_standards = VENUE_STANDARDS

        # Required fields by entry type
        self.required_fields = {
            'article': ['author', 'title', 'journal', 'year'],
            'book': ['title', 'publisher', 'year'],  # author OR editor
            'inproceedings': ['author', 'title', 'booktitle', 'year'],
            'incollection': ['author', 'title', 'booktitle', 'publisher', 'year'],
            'phdthesis': ['author', 'title', 'school', 'year'],
            'mastersthesis': ['author', 'title', 'school', 'year'],
            'techreport': ['author', 'title', 'institution', 'year'],
            'misc': ['title', 'year']
        }
        
        # Recommended fields
        self.recommended_fields = {
            'article': ['volume', 'pages', 'doi'],
            'book': ['isbn'],
            'inproceedings': ['pages'],
        }
    
    def parse_bibtex_file(self, filepath: str) -> List[Dict]:
        """
        Parse BibTeX file and extract entries.
        
        Args:
            filepath: Path to BibTeX file
            
        Returns:
            List of entry dictionaries
        """
        return _parse_bibtex_file(filepath)
    
    def validate_entry(self, entry: Dict) -> Tuple[List[Dict], List[Dict]]:
        """
        Validate a single BibTeX entry.
        
        Args:
            entry: Entry dictionary
            
        Returns:
            Tuple of (errors, warnings)
        """
        errors = []
        warnings = []
        
        entry_type = entry['type']
        key = entry['key']
        fields = entry['fields']
        
        # Check required fields
        if entry_type in self.required_fields:
            for req_field in self.required_fields[entry_type]:
                if req_field not in fields or not fields[req_field]:
                    # Special case: book can have author OR editor
                    if entry_type == 'book' and req_field == 'author':
                        if 'editor' not in fields or not fields['editor']:
                            errors.append({
                                'type': 'missing_required_field',
                                'field': 'author or editor',
                                'severity': 'high',
                                'message': f'Entry {key}: Missing required field "author" or "editor"'
                            })
                    else:
                        errors.append({
                            'type': 'missing_required_field',
                            'field': req_field,
                            'severity': 'high',
                            'message': f'Entry {key}: Missing required field "{req_field}"'
                        })
        
        # Check recommended fields
        if entry_type in self.recommended_fields:
            for rec_field in self.recommended_fields[entry_type]:
                if rec_field not in fields or not fields[rec_field]:
                    warnings.append({
                        'type': 'missing_recommended_field',
                        'field': rec_field,
                        'severity': 'medium',
                        'message': f'Entry {key}: Missing recommended field "{rec_field}"'
                    })
        
        # Validate year
        if 'year' in fields:
            year = fields['year']
            if not re.match(r'^\d{4}$', year):
                errors.append({
                    'type': 'invalid_year',
                    'field': 'year',
                    'value': year,
                    'severity': 'high',
                    'message': f'Entry {key}: Invalid year format "{year}" (should be 4 digits)'
                })
            elif int(year) < 1600 or int(year) > 2030:
                warnings.append({
                    'type': 'suspicious_year',
                    'field': 'year',
                    'value': year,
                    'severity': 'medium',
                    'message': f'Entry {key}: Suspicious year "{year}" (outside reasonable range)'
                })
        
        # Validate DOI format
        if 'doi' in fields:
            doi = fields['doi']
            if not re.match(r'^10\.\d{4,}/[^\s]+$', doi):
                warnings.append({
                    'type': 'invalid_doi_format',
                    'field': 'doi',
                    'value': doi,
                    'severity': 'medium',
                    'message': f'Entry {key}: Invalid DOI format "{doi}"'
                })
        
        # Check for single hyphen in pages (should be --)
        if 'pages' in fields:
            pages = fields['pages']
            if re.search(r'\d-\d', pages) and '--' not in pages:
                warnings.append({
                    'type': 'page_range_format',
                    'field': 'pages',
                    'value': pages,
                    'severity': 'low',
                    'message': f'Entry {key}: Page range uses single hyphen, should use -- (en-dash)'
                })
        
        # Check author format
        if 'author' in fields:
            author = fields['author']
            if ';' in author or '&' in author:
                errors.append({
                    'type': 'invalid_author_format',
                    'field': 'author',
                    'severity': 'high',
                    'message': f'Entry {key}: Authors should be separated by " and ", not ";" or "&"'
                })
        
        return errors, warnings
    
    def verify_doi(self, doi: str) -> Tuple[Optional[bool], Optional[Dict]]:
        """Return registration status and available metadata. None means the lookup was inconclusive."""
        try:
            crossref_url = f'https://api.crossref.org/works/{quote(doi, safe="")}'
            metadata_response = self.session.get(crossref_url, timeout=10)

            if metadata_response.status_code == 200:
                data = metadata_response.json()
                message = data['message']
                if message['DOI'].casefold() != doi.casefold():
                    return None, None

                # Extract key metadata
                metadata = {
                    'title': (message.get('title') or [''])[0],
                    'year': self._extract_year_crossref(message),
                    'authors': self._format_authors_crossref(message.get('author', [])),
                }
                return True, metadata

            if metadata_response.status_code != 404:
                return None, None

            datacite_url = f'https://api.datacite.org/dois/{quote(doi, safe="")}'
            datacite_response = self.session.get(datacite_url, timeout=10)
            if datacite_response.status_code == 200:
                record = datacite_response.json()['data']['attributes']
                if record['doi'].casefold() != doi.casefold():
                    return None, None
                titles = record.get('titles') or []
                return True, {'title': titles[0]['title'] if titles else ''}
            if datacite_response.status_code != 404:
                return None, None

            # Other registration agencies also issue DOIs. The Handle registry covers them all.
            handle_url = f'https://doi.org/api/handles/{quote(doi, safe="/")}'
            response = self.session.get(handle_url, timeout=10)
            code = response.json().get('responseCode')
            if response.status_code == 404 and code == 100:
                return False, None
            if response.status_code == 200 and code == 1:
                return True, None
        except (requests.RequestException, ValueError, KeyError):
            pass
        return None, None

    def check_entry_doi(self, entry: Dict) -> Dict:
        """Compare the submitted title with the DOI record, preserving both for review."""
        fields = entry['fields']
        doi = fields['doi'].strip()
        registered, metadata = self.verify_doi(doi)
        title = fields.get('title', '')
        registry_title = (metadata or {}).get('title', '')
        if registered is None:
            status = 'unverified'
        elif not registered:
            status = 'not_found'
        elif not registry_title or not title:
            status = 'title_unavailable'
        else:
            submitted = self._comparable_title(title)
            canonical = self._comparable_title(registry_title)
            if submitted == canonical:
                status = 'title_match'
            elif submitted and canonical.partition(':')[0].strip() == submitted:
                status = 'short_title'
            else:
                status = 'title_differs'
        return {'entry': entry['key'], 'doi': doi, 'status': status,
                'submitted_title': title, 'registered_title': registry_title}

    @staticmethod
    def _comparable_title(title: str) -> str:
        # BibTeX protects capitals with braces. Preserve word order, symbols and numerals.
        text = unescape(title).replace('{', '').replace('}', '').replace(r'\&', '&')
        return ' '.join(normalize('NFC', text).casefold().split())
    
    def detect_duplicates(self, entries: List[Dict]) -> List[Dict]:
        """
        Detect duplicate entries.
        
        Args:
            entries: List of entry dictionaries
            
        Returns:
            List of duplicate groups
        """
        duplicates = []
        
        # Check for duplicate DOIs
        doi_map = defaultdict(list)
        for entry in entries:
            doi = entry['fields'].get('doi', '').strip()
            if doi:
                doi_map[doi].append(entry['key'])
        
        for doi, keys in doi_map.items():
            if len(keys) > 1:
                duplicates.append({
                    'type': 'duplicate_doi',
                    'doi': doi,
                    'entries': keys,
                    'severity': 'high',
                    'message': f'Duplicate DOI {doi} found in entries: {", ".join(keys)}'
                })
        
        # Check for duplicate citation keys
        key_counts = defaultdict(int)
        for entry in entries:
            key_counts[entry['key']] += 1
        
        for key, count in key_counts.items():
            if count > 1:
                duplicates.append({
                    'type': 'duplicate_key',
                    'key': key,
                    'count': count,
                    'severity': 'high',
                    'message': f'Citation key "{key}" appears {count} times'
                })
        
        # Check for similar titles (possible duplicates)
        titles = {}
        for entry in entries:
            title = entry['fields'].get('title', '').lower()
            title = re.sub(r'[^\w\s]', '', title)  # Remove punctuation
            title = ' '.join(title.split())  # Normalize whitespace
            
            if title:
                if title in titles:
                    duplicates.append({
                        'type': 'similar_title',
                        'entries': [titles[title], entry['key']],
                        'severity': 'medium',
                        'message': f'Possible duplicate: "{titles[title]}" and "{entry["key"]}" have identical titles'
                    })
                else:
                    titles[title] = entry['key']
        
        return duplicates
    
    def parse_manuscript_citations(self, filepath: str) -> Tuple[List[str], List[str]]:
        """Return in-text keys and explicit bibliography inclusions from Pandoc's syntax tree."""
        path = Path(filepath).resolve()
        reader = 'latex' if path.suffix.lower() in {'.tex', '.ltx', '.latex'} else 'markdown'
        try:
            result = subprocess.run(
                ['pandoc', '--from', reader, '--to', 'json', '--fail-if-warnings', str(path)],
                cwd=path.parent, capture_output=True, text=True, encoding='utf-8',
            )
        except FileNotFoundError as error:
            raise ValueError(f'Cannot read {filepath} with Pandoc: {error}') from error
        if result.returncode:
            raise ValueError(f'Pandoc could not parse {filepath}: {result.stderr.strip()}')

        def citation_ids(node):
            if isinstance(node, dict):
                if node.get('t') == 'Cite':
                    for citation in node['c'][0]:
                        yield citation['citationId']
                for child in node.values():
                    yield from citation_ids(child)
            elif isinstance(node, list):
                for child in node:
                    yield from citation_ids(child)

        document = json.loads(result.stdout)
        inclusions = document['meta'].pop('nocite', {})
        document['meta'].pop('references', None)
        return sorted(set(citation_ids(document))), sorted(set(citation_ids(inclusions)))

    def validate_file(self, filepath: str, check_dois: bool = False, min_count: Optional[int] = None, venue: Optional[str] = None, manuscript_filepath: Optional[str] = None) -> Dict:
        """
        Validate entire BibTeX file.
        
        Args:
            filepath: Path to BibTeX file
            check_dois: Whether to verify DOIs (slow)
            min_count: Optional minimum citation count to enforce
            venue: Optional venue type to check against standards
            manuscript_filepath: Optional path to manuscript to cross-check citations
            
        Returns:
            Validation report dictionary
        """
        print(f'Parsing {filepath}...', file=sys.stderr)
        entries = self.parse_bibtex_file(filepath)
        
        if not entries:
            return {
                'filepath': filepath,
                'total_entries': 0,
                'valid_entries': 0,
                'errors': [{
                    'type': 'empty_bibtex_file',
                    'severity': 'high',
                    'message': f'BibTeX file {filepath} has no valid entries.'
                }],
                'warnings': [],
                'duplicates': [],
                'doi_checks': [],
                'venue_standard_checked': venue,
                'min_count_checked': min_count,
                'manuscript_results': {'checked': False}
            }
        
        print(f'Found {len(entries)} entries', file=sys.stderr)
        
        all_errors = []
        all_warnings = []
        
        # Validate each entry
        for i, entry in enumerate(entries):
            print(f'Validating entry {i+1}/{len(entries)}: {entry["key"]}', file=sys.stderr)
            errors, warnings = self.validate_entry(entry)
            
            for error in errors:
                error['entry'] = entry['key']
                all_errors.append(error)
            
            for warning in warnings:
                warning['entry'] = entry['key']
                all_warnings.append(warning)
        
        # Check for duplicates
        print('Checking for duplicates...', file=sys.stderr)
        duplicates = self.detect_duplicates(entries)
        
        # Verify DOIs if requested
        doi_checks = []
        if check_dois:
            for entry in entries:
                if not entry['fields'].get('doi', '').strip():
                    continue
                check = self.check_entry_doi(entry)
                doi_checks.append(check)
                status = check['status']
                prefix = f'Entry {check["entry"]}: DOI {check["doi"]}'
                if status == 'title_match':
                    continue
                if status == 'not_found':
                    all_errors.append({'type': 'invalid_doi', 'entry': check['entry'], 'doi': check['doi'],
                                       'severity': 'high', 'message': f'{prefix} is absent from the Handle registry.'})
                    continue
                if status == 'unverified':
                    detail = 'could not be verified with the registry.'
                elif status == 'title_unavailable':
                    detail = 'is registered. Check the missing title against the publication.'
                elif status == 'short_title':
                    detail = f'uses a shortened title. Confirm author and venue for “{check["registered_title"]}”.'
                else:
                    detail = f'registers “{check["registered_title"]}”. Check the supplied title “{check["submitted_title"]}”.'
                all_warnings.append({'type': f'doi_{status}', 'entry': check['entry'], 'doi': check['doi'],
                                     'severity': 'medium', 'message': f'{prefix} {detail}'})
        
        # Count and Venue verification logic
        count_errors = []
        count_warnings = []

        target_min = None
        target_max = None
        venue_name = None

        if venue:
            v_lower = venue.lower().strip()
            if v_lower in self.venue_standards:
                target_min, target_max, venue_name = self.venue_standards[v_lower]
            else:
                print(f"Warning: Unknown venue '{venue}'. Supported venues are: {', '.join(self.venue_standards.keys())}", file=sys.stderr)
        
        if min_count is not None:
            target_min = min_count
            venue_name = f"Custom threshold (min: {min_count})"
            target_max = None
            
        # A reference list is never *wrong* for being short -- the right length
        # is whatever the argument needs -- so a shortfall is reported as a
        # warning. `--min-count` is the exception: an explicit floor the caller
        # asked to have enforced, so falling under it is an error.
        total_count = len(entries)
        if target_min is not None:
            if min_count is not None and total_count < min_count:
                count_errors.append({
                    'type': 'below_requested_minimum',
                    'severity': 'high',
                    'message': f'Total citation entries ({total_count}) is below the requested minimum of {min_count}.'
                })
            elif total_count < target_min:
                count_warnings.append({
                    'type': 'low_citation_count',
                    'severity': 'medium',
                    'message': f'Total citation entries ({total_count}) is below the {venue_name or "specified standard"} rule of thumb of {target_min}-{target_max or "+"}. This is a heuristic, not a submission requirement.'
                })

        # Manuscript checking logic
        manuscript_results = {
            'checked': False,
            'manuscript_filepath': None,
            'cited_keys': [],
            'nocite_keys': [],
            'missing_keys': [],
            'unused_keys': []
        }
        
        if manuscript_filepath:
            manuscript_results['manuscript_filepath'] = manuscript_filepath
            try:
                cited_keys, nocite_keys = self.parse_manuscript_citations(manuscript_filepath)
            except (OSError, ValueError) as error:
                all_errors.append({'type': 'manuscript_unreadable', 'severity': 'high', 'message': str(error)})
            else:
                manuscript_results.update(checked=True, cited_keys=cited_keys, nocite_keys=nocite_keys)
            
        if manuscript_results['checked']:
            bib_keys = {entry['key'] for entry in entries}
            cited = set(cited_keys)
            requested = cited | (set(nocite_keys) - {'*'})
            missing_keys = sorted(requested - bib_keys)
            manuscript_results['missing_keys'] = missing_keys
            for key in missing_keys:
                all_errors.append({
                    'type': 'unresolved_citation',
                    'entry': key,
                    'severity': 'high',
                    'message': f'Reference key "{key}" in "{manuscript_filepath}" has no BibTeX entry.'
                })
                
            # Unused references: defined in BibTeX but not cited in manuscript
            unused_keys = [] if '*' in nocite_keys else sorted(bib_keys - requested)
            manuscript_results['unused_keys'] = unused_keys
            for key in unused_keys:
                all_warnings.append({
                    'type': 'unused_citation',
                    'entry': key,
                    'severity': 'medium',
                    'message': f'Unused citation: Reference "{key}" is defined in the BibTeX file but not cited in the manuscript.'
                })
                
            # Check the count of ACTUALLY used citations
            actual_count = len(cited & bib_keys)
            if target_min is not None:
                if min_count is not None and actual_count < min_count:
                    count_errors.append({
                        'type': 'manuscript_below_requested_minimum',
                        'severity': 'high',
                        'message': f'The manuscript cites {actual_count} references, below the requested minimum of {min_count}.'
                    })
                elif actual_count < target_min:
                    count_warnings.append({
                        'type': 'low_manuscript_citation_count',
                        'severity': 'medium',
                        'message': f'The manuscript cites {actual_count} references, below the {venue_name or "specified standard"} rule of thumb of {target_min}-{target_max or "+"}. This is a heuristic, not a submission requirement.'
                    })

        all_errors.extend(count_errors)
        all_warnings.extend(count_warnings)

        # Count entries carrying at least one high-severity error, rather than
        # subtracting the error count -- several errors can land on one entry,
        # which previously drove this figure negative.
        entries_with_errors = {
            error['entry'] for error in all_errors
            if error.get('severity') == 'high' and error.get('entry')
        }
        bib_keys_present = {entry['key'] for entry in entries}

        return {
            'filepath': filepath,
            'total_entries': len(entries),
            'valid_entries': len(entries) - len(entries_with_errors & bib_keys_present),
            'errors': all_errors,
            'warnings': all_warnings,
            'duplicates': duplicates,
            'doi_checks': doi_checks,
            'venue_standard_checked': venue,
            'min_count_checked': min_count,
            'manuscript_results': manuscript_results
        }
    
    def _extract_year_crossref(self, message: Dict) -> str:
        """Extract year from CrossRef message."""
        date_parts = message.get('published-print', {}).get('date-parts', [[]])
        if not date_parts or not date_parts[0]:
            date_parts = message.get('published-online', {}).get('date-parts', [[]])
        
        if date_parts and date_parts[0]:
            return str(date_parts[0][0])
        return ''
    
    def _format_authors_crossref(self, authors: List[Dict]) -> str:
        """Format author list from CrossRef."""
        if not authors:
            return ''
        
        formatted = []
        for author in authors[:3]:  # First 3 authors
            given = author.get('given', '')
            family = author.get('family', '')
            if family:
                formatted.append(f'{family}, {given}' if given else family)
        
        if len(authors) > 3:
            formatted.append('et al.')
        
        return ', '.join(formatted)


def main():
    """Command-line interface."""
    parser = argparse.ArgumentParser(
        description='Validate BibTeX files for errors and inconsistencies',
        epilog='Example: python validate_citations.py references.bib'
    )
    
    parser.add_argument(
        'file',
        help='BibTeX file to validate'
    )
    
    parser.add_argument(
        '--check-dois',
        action='store_true',
        help='Check DOI registration and compare submitted and registered titles'
    )
    
    parser.add_argument(
        '--report',
        help='Output file for the JSON validation report'
    )
    
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Show detailed output'
    )
    
    parser.add_argument(
        '--min-count',
        type=int,
        help='Enforce a minimum number of citation entries'
    )
    
    parser.add_argument(
        '--venue',
        help='Enforce citation standards for a specific venue (e.g. nature, neurips, review)'
    )
    
    parser.add_argument(
        '--manuscript',
        help='Check Markdown or LaTeX citation keys against the bibliography (requires Pandoc)'
    )
    
    args = parser.parse_args()
    
    # Validate file
    validator = CitationValidator()
    report = validator.validate_file(
        args.file, 
        check_dois=args.check_dois,
        min_count=args.min_count,
        venue=args.venue,
        manuscript_filepath=args.manuscript
    )
    
    # Print summary
    print('\n' + '='*60)
    print('CITATION VALIDATION REPORT')
    print('='*60)
    print(f'\nFile: {args.file}')
    if report.get('venue_standard_checked'):
        print(f'Venue Standard: {report["venue_standard_checked"]}')
    if report.get('min_count_checked') is not None:
        print(f'Required Min Count: {report["min_count_checked"]}')
    print(f'Total entries in BibTeX: {report["total_entries"]}')
    
    m_res = report.get('manuscript_results', {})
    if m_res.get('checked'):
        print(f'Manuscript checked: {m_res["manuscript_filepath"]}')
        print(f'  Actual unique citations in manuscript: {len(m_res["cited_keys"])}')
        print(f'  Missing/unresolved: {len(m_res["missing_keys"])}')
        print(f'  Unused in bib file: {len(m_res["unused_keys"])}')
        
    entry_label = 'Entries without high-severity errors' if args.check_dois else 'Valid entries'
    print(f'{entry_label}: {report["valid_entries"]}')
    if args.check_dois:
        checks = report['doi_checks']
        matches = sum(check['status'] == 'title_match' for check in checks)
        print(f'Registry title matches: {matches}/{len(checks)} supplied DOIs')
    print(f'Errors: {len(report["errors"])}')
    print(f'Warnings: {len(report["warnings"])}')
    print(f'Duplicates: {len(report["duplicates"])}')
    
    # Print errors
    if report['errors']:
        print('\n' + '-'*60)
        print('ERRORS (must fix):')
        print('-'*60)
        for error in report['errors']:
            print(f'\n{error["message"]}')
            if args.verbose:
                print(f'  Type: {error["type"]}')
                print(f'  Severity: {error["severity"]}')
    
    # Print warnings
    if report['warnings'] and (args.verbose or args.check_dois or report.get('venue_standard_checked') or report.get('min_count_checked') is not None or m_res.get('checked')):
        print('\n' + '-'*60)
        print('WARNINGS (should fix):')
        print('-'*60)
        for warning in report['warnings']:
            print(f'\n{warning["message"]}')
    
    # Print duplicates
    if report['duplicates']:
        print('\n' + '-'*60)
        print('DUPLICATES:')
        print('-'*60)
        for dup in report['duplicates']:
            print(f'\n{dup["message"]}')
    
    # Save report
    if args.report:
        with open(args.report, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2)
        print(f'\nDetailed report saved to: {args.report}')
    
    # Exit with error code if there are high-severity errors
    has_high_errors = any(e.get('severity') == 'high' for e in report['errors'])
    if has_high_errors:
        sys.exit(1)


if __name__ == '__main__':
    main()

