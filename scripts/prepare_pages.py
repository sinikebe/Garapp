#!/usr/bin/env python3
"""Prepare one Garapp branch for static hosting, without external dependencies."""

import argparse
from pathlib import Path
import shutil


def prepare_site(source: Path, output: Path, branch: str) -> None:
    """Copy public assets, or generate a temporary page for an unbuilt app."""
    source = source.resolve()
    output = output.resolve()
    public = source / "public"

    if not source.is_dir():
        raise ValueError(f"Source directory does not exist: {source}")
    if output.exists():
        raise ValueError(f"Output already exists; choose a new directory: {output}")
    if output == public or public in output.parents:
        raise ValueError("The output must be outside the public directory")

    if public.is_symlink():
        raise ValueError("public must not be a symbolic link")
    if public.exists():
        if not public.is_dir():
            raise ValueError("public must be a directory")
        for entry in public.rglob("*"):
            if entry.is_symlink():
                raise ValueError(f"Symbolic links cannot be published: {entry}")
        index = public / "index.html"
        if not index.is_file() or not index.read_text(encoding="utf-8").strip():
            raise ValueError("public must contain a non-empty UTF-8 index.html")
        if (public / "dev").exists():
            raise ValueError("public/dev is reserved for the development version")
        shutil.copytree(public, output)
        print(f"Prepared {branch} assets: {output}")
    else:
        label = "Version de développement" if branch == "dev" else "Version main"
        other_url = "../" if branch == "dev" else "./dev/"
        other_label = "Voir main" if branch == "dev" else "Voir dev"
        robots = '<meta name="robots" content="noindex, nofollow">' if branch == "dev" else ""
        output.mkdir(parents=True)
        (output / "index.html").write_text(
            f"""<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  {robots}
  <title>Garapp — {label}</title>
</head>
<body>
  <main>
    <p>{label}</p>
    <h1>Garapp</h1>
    <p>Votre véhicule, pièce par pièce.</p>
    <p>Le garage numérique est en préparation.</p>
    <p><a href="{other_url}">{other_label}</a> ·
      <a href="https://github.com/sinikebe/Garapp">Le projet sur GitHub</a></p>
  </main>
</body>
</html>
""",
            encoding="utf-8",
        )
        print(f"Prepared {branch} placeholder: {output}")

    (output / ".nojekyll").touch()


def main() -> None:
    """Parse the source, destination and branch, then prepare the static site."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--branch", choices=("main", "dev"), required=True)
    args = parser.parse_args()
    try:
        prepare_site(args.source, args.output, args.branch)
    except (OSError, UnicodeError, ValueError) as error:
        parser.exit(1, f"Site preparation failed: {error}\n")


if __name__ == "__main__":
    main()
