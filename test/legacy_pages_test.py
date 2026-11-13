"""Verify GitHub Pages packaging without requiring a browser or private data."""

from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from prepare_legacy_pages import prepare_legacy_site


class LegacyPagesTests(unittest.TestCase):
    def test_main_and_dev_preserve_their_source_app_for_same_origin_exports(self):
        with tempfile.TemporaryDirectory(prefix="garapp-legacy-") as directory:
            work = Path(directory)
            for branch, output in (("main", work / "site"), ("dev", work / "site" / "dev")):
                source = work / branch
                public = source / "public"
                (public / "assets" / "js").mkdir(parents=True)
                app = f'<html><script src="./assets/js/app.js"></script><p>{branch}</p></html>'
                (public / "index.html").write_text(app, encoding="utf-8")
                (public / "assets" / "js" / "app.js").write_text("// Synthetic app", encoding="utf-8")
                prepare_legacy_site(source, output, branch)
                self.assertEqual((output / "recovery.html").read_text(encoding="utf-8"), app)
                self.assertEqual((public / "index.html").read_text(encoding="utf-8"), app)
                self.assertEqual((output / "assets" / "js" / "app.js").read_bytes(), (public / "assets" / "js" / "app.js").read_bytes())
                for name in ("index.html", "redirect.js", "sw.js"):
                    self.assertEqual((output / name).read_bytes(), (ROOT / "scripts" / "legacy-pages" / name).read_bytes())
                self.assertTrue((output / ".nojekyll").is_file())

    def test_existing_or_public_outputs_are_never_overwritten(self):
        with tempfile.TemporaryDirectory(prefix="garapp-legacy-guard-") as directory:
            source = Path(directory)
            public = source / "public"
            public.mkdir()
            (public / "index.html").write_text("<p>Synthetic app</p>", encoding="utf-8")
            for output in (source, public, public / "nested"):
                with self.assertRaises(ValueError):
                    prepare_legacy_site(source, output, "main")


if __name__ == "__main__":
    unittest.main()
