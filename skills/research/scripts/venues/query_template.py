#!/usr/bin/env python3
"""List and query the templates actually bundled with venue-templates.

Examples:
    python scripts/query_template.py --list-all
    python scripts/query_template.py --venue NeurIPS --requirements
    python scripts/query_template.py --type grants
    python scripts/query_template.py --keyword author-year
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


CHECKED_DATE = "2026-07-20"

TEMPLATES = {
    "journals": {
        "optics-express": {
            "file": "optics_article.tex",
            "full_name": "Optics Express",
            "aliases": ["OE"],
            "status": "Optical-system content template; not an official journal style.",
            "source": "https://opg.optica.org/content/author/portal/item/templates-default",
            "checked_date": "2026-11-02",
            "requirements": "Optica universal template; check article type and submit one assembled .tex file.",
        },
        "optics-letters": {
            "file": "optics_article.tex",
            "full_name": "Optics Letters",
            "aliases": ["OL"],
            "status": "Optical-system content template; not an official journal style.",
            "source": "https://opg.optica.org/content/author/portal/item/templates-default",
            "checked_date": "2026-11-02",
            "requirements": "Use the official Length Check Template; compress the evidence sequence for a Letter.",
        },
        "optica": {
            "file": "optics_article.tex",
            "full_name": "Optica",
            "status": "Optical-system content template; not an official journal style.",
            "source": "https://opg.optica.org/content/author/portal/item/templates-default",
            "checked_date": "2026-11-02",
            "requirements": "Universal template for articles; Length Check Template for Letters and Memoranda.",
        },
        "josa-a": {
            "file": "optics_article.tex",
            "full_name": "Journal of the Optical Society of America A",
            "aliases": ["JOSA A"],
            "status": "Optical-system content template; not an official journal style.",
            "source": "https://opg.optica.org/content/author/portal/item/templates-default",
            "checked_date": "2026-11-02",
            "requirements": "Optica universal template; identify JOSA A explicitly rather than unqualified JOSA.",
        },
        "josa-b": {
            "file": "optics_article.tex",
            "full_name": "Journal of the Optical Society of America B",
            "aliases": ["JOSA B"],
            "status": "Optical-system content template; not an official journal style.",
            "source": "https://opg.optica.org/content/author/portal/item/templates-default",
            "checked_date": "2026-11-02",
            "requirements": "Optica universal template; identify JOSA B explicitly rather than unqualified JOSA.",
        },
        "ieee-photonics-journal": {
            "file": "optics_article.tex",
            "full_name": "IEEE Photonics Journal",
            "aliases": ["IEEE PJ"],
            "status": "Optical-system content template; not the IEEE two-column submission template.",
            "source": "https://ieeephotonics.org/publications/photonics-journal/",
            "checked_date": "2026-11-02",
            "requirements": "Use the journal's IEEE two-column template; prepare its Graphic Abstract and Impact Statement.",
        },
        "laser-photonics-reviews": {
            "file": "optics_article.tex",
            "full_name": "Laser & Photonics Reviews",
            "aliases": ["LPR", "Laser and Photonics Reviews", "Laser and Photonics Review"],
            "status": "Optical-system content template; not an official Wiley submission template.",
            "source": "https://onlinelibrary.wiley.com/page/journal/18638899/homepage/author-guidelines",
            "checked_date": None,
            "requirements": "Resolve current article type and Wiley author guidelines before submission; no fixed length assumed.",
        },
        "nature": {
            "file": "nature_article.tex",
            "full_name": "Nature-oriented article scaffold",
            "status": "Generic writing scaffold; not an official Nature template.",
            "source": "https://www.nature.com/nature/for-authors/initial-submission",
            "requirements": "Initial submissions are format-flexible within reason; check the exact article type.",
        },
        "plos-one": {
            "file": "plos_one.tex",
            "full_name": "PLOS ONE-oriented article scaffold",
            "status": "Drafting scaffold; compare with the current official PLOS LaTeX package.",
            "source": "https://journals.plos.org/plosone/s/submission-guidelines",
            "requirements": "Follow the current PLOS ONE submission and file-upload instructions.",
        },
        "neurips-2026": {
            "file": "neurips_article.tex",
            "full_name": "NeurIPS 2026 paper wrapper",
            "status": "Requires the official neurips_2026.sty and checklist files.",
            "source": "https://neurips.cc/Conferences/2026/CallForPapers",
            "requirements": (
                "Main track: 9 content pages; acknowledgments, references, checklist, "
                "and optional technical appendices do not count. Initial submission is anonymous."
            ),
        },
        "elsevier-numeric": {
            "file": "elsarticle-template-num.tex",
            "full_name": "Elsevier elsarticle numeric example",
            "status": "Bundled example; the journal's Guide for Authors controls.",
            "source": "https://www.elsevier.com/researcher/author/policies-and-guidelines/latex-instructions",
            "requirements": "Numeric citations using the bundled elsarticle-num.bst.",
        },
        "elsevier-numeric-names": {
            "file": "elsarticle-template-num-names.tex",
            "full_name": "Elsevier elsarticle sorted numeric example",
            "status": "Bundled example; the journal's Guide for Authors controls.",
            "source": "https://www.elsevier.com/researcher/author/policies-and-guidelines/latex-instructions",
            "requirements": "Sorted/compressed numeric citations using elsarticle-num-names.bst.",
        },
        "elsevier-author-year": {
            "file": "elsarticle-template-harv.tex",
            "full_name": "Elsevier elsarticle author-year example",
            "status": "Bundled example; the journal's Guide for Authors controls.",
            "source": "https://www.elsevier.com/researcher/author/policies-and-guidelines/latex-instructions",
            "requirements": "Author-year citations using the bundled elsarticle-harv.bst.",
        },
    },
    "posters": {
        "beamerposter": {
            "file": "beamerposter_academic.tex",
            "full_name": "Venue-agnostic beamerposter scaffold",
            "status": "Set dimensions and orientation from the event's current presenter instructions.",
            "source": None,
            "requirements": "A0 portrait by default; customize size before use.",
        }
    },
    "grants": {
        "nsf": {
            "file": "nsf_proposal_template.tex",
            "full_name": "NSF narrative planning scaffold",
            "status": "Not an NSF-issued upload package; split components in the submission portal.",
            "source": "https://www.nsf.gov/policies/pappg",
            "requirements": (
                "Check the current PAPPG and solicitation. Use SciENcv for required "
                "senior/key-person forms."
            ),
        },
        "nih-specific-aims": {
            "file": "nih_specific_aims.tex",
            "full_name": "NIH Specific Aims writing scaffold",
            "status": "Drafting scaffold; the NOFO and current application guide control.",
            "source": (
                "https://grants.nih.gov/grants-process/write-application/"
                "how-to-apply-application-guide/page-limits"
            ),
            "requirements": "Specific Aims is generally limited to one page unless the NOFO says otherwise.",
        },
    },
}


def skill_path() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def template_path(category: str, filename: str) -> Path:
    return skill_path() / "assets" / category / filename


def search_templates(
    venue: str | None = None,
    template_type: str | None = None,
    keyword: str | None = None,
) -> list[dict]:
    results = []
    for category_name, category in TEMPLATES.items():
        if template_type and template_type != "all" and category_name != template_type:
            continue

        for template_id, template in category.items():
            searchable = json.dumps(
                {"id": template_id, "category": category_name, **template}
            ).lower()
            venue_names = [template_id, template["full_name"], *template.get("aliases", [])]
            if venue and not any(venue.lower() in name.lower() for name in venue_names):
                continue
            if keyword and keyword.lower() not in searchable:
                continue

            results.append(
                {
                    "id": template_id,
                    "category": category_name,
                    **template,
                }
            )
    return results


def print_template(template: dict, detailed: bool = True) -> None:
    path = template_path(template["category"], template["file"])
    print(f"\n{template['full_name']}")
    print(f"  ID: {template['id']}")
    print(f"  Category: {template['category']}")
    print(f"  File: {path}")
    print(f"  Exists: {'yes' if path.is_file() else 'NO'}")
    if not detailed:
        return

    print(f"  Status: {template['status']}")
    print(f"  Requirements note: {template['requirements']}")
    if template["source"]:
        print(f"  Official source: {template['source']}")
        checked_date = template.get("checked_date", CHECKED_DATE)
        if checked_date:
            print(f"  Source checked: {checked_date}; recheck before submission")
        else:
            print("  Source check: current author instructions must be retrieved before submission")
    else:
        print("  Official source: event-specific presenter instructions required")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Query templates actually bundled with venue-templates"
    )
    parser.add_argument("--venue", help="Venue or agency name")
    parser.add_argument(
        "--type",
        choices=["journals", "posters", "grants", "all"],
        dest="template_type",
        help="Template category",
    )
    parser.add_argument("--keyword", help="Search all template metadata")
    parser.add_argument("--list-all", action="store_true", help="List every template")
    parser.add_argument(
        "--requirements",
        action="store_true",
        help="Show status, requirement note, and official source",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not any([args.list_all, args.venue, args.template_type, args.keyword]):
        print("Specify --list-all, --venue, --type, or --keyword.")
        return 2

    results = search_templates(
        venue=args.venue,
        template_type="all" if args.list_all else args.template_type,
        keyword=args.keyword,
    )
    if not results:
        print("No bundled templates match the query.")
        print("Use the venue's official author instructions when no asset is bundled.")
        return 1

    print(f"Bundled templates: {len(results)}")
    for result in results:
        print_template(result, detailed=args.requirements or not args.list_all)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
