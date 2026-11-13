#!/usr/bin/env python3
"""Build the historical GitHub Pages entry points without changing Worker assets."""

import argparse
from pathlib import Path
import shutil

from prepare_pages import prepare_site


def prepare_legacy_site(source: Path, output: Path, branch: str) -> None:
    """Keep same-origin export tools beside the redirect and retiring worker."""
    prepare_site(source, output, branch)
    output = output.resolve()
    templates = Path(__file__).resolve().parent / "legacy-pages"
    index = output / "index.html"
    # Asset URLs and deployment-config stay at their historical base. The existing
    # application therefore opens the original main/dev workspace for JSON export.
    index.rename(output / "recovery.html")
    for name in ("index.html", "redirect.js", "sw.js"):
        shutil.copyfile(templates / name, output / name)


def main() -> None:
    """Prepare a fresh main or dev output directory using tested source assets."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--branch", choices=("main", "dev"), required=True)
    args = parser.parse_args()
    try:
        prepare_legacy_site(args.source, args.output, args.branch)
    except (OSError, UnicodeError, ValueError) as error:
        parser.exit(1, f"Legacy Pages preparation failed: {error}\n")


if __name__ == "__main__":
    main()
