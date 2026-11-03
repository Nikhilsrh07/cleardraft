from __future__ import annotations

import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "apps" / "web"
ENTRY_POINT = WEB_ROOT / "index.html"


class SiteParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.fragments: list[str] = []
        self.local_assets: list[str] = []
        self.buttons: list[dict[str, str | None]] = []
        self.title_depth = 0
        self.title_parts: list[str] = []
        self.script_depth = 0
        self.inline_script_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        element_id = attributes.get("id")
        if element_id:
            self.ids.append(element_id)

        href = attributes.get("href")
        if href and href.startswith("#"):
            self.fragments.append(unquote(href[1:]))
        elif href:
            parsed = urlparse(href)
            if not parsed.scheme and not parsed.netloc:
                self.local_assets.append(unquote(parsed.path))

        src = attributes.get("src")
        if src:
            parsed = urlparse(src)
            if not parsed.scheme and not parsed.netloc:
                self.local_assets.append(unquote(parsed.path))

        if tag == "button":
            self.buttons.append(attributes)
        if tag == "title":
            self.title_depth = 1
        if tag == "script":
            self.script_depth = 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self.title_depth = 0
        if tag == "script":
            self.script_depth = 0

    def handle_data(self, data: str) -> None:
        if self.title_depth:
            self.title_parts.append(data)
        if self.script_depth:
            self.inline_script_parts.append(data)


class StaticSiteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.html = ENTRY_POINT.read_text(encoding="utf-8")
        cls.parser = SiteParser()
        cls.parser.feed(cls.html)

    def test_pages_entry_point_exists(self) -> None:
        self.assertTrue(ENTRY_POINT.is_file())

    def test_document_has_title_and_mobile_viewport(self) -> None:
        self.assertTrue("".join(self.parser.title_parts).strip())
        self.assertRegex(self.html, r'<meta\s+name=["\']viewport["\']')

    def test_element_ids_are_unique(self) -> None:
        self.assertEqual(len(self.parser.ids), len(set(self.parser.ids)))

    def test_internal_links_point_to_existing_elements(self) -> None:
        element_ids = set(self.parser.ids)
        missing = [fragment for fragment in self.parser.fragments if fragment not in element_ids]
        self.assertEqual(missing, [])

    def test_local_assets_exist(self) -> None:
        missing = [
            asset
            for asset in self.parser.local_assets
            if asset and not (WEB_ROOT / asset).is_file()
        ]
        self.assertEqual(missing, [])

    def test_buttons_declare_their_type(self) -> None:
        missing_types = [button for button in self.parser.buttons if button.get("type") is None]
        self.assertEqual(missing_types, [])

    def test_core_writing_controls_exist(self) -> None:
        expected_ids = {
            "source-text",
            "draft-output",
            "create-draft-button",
            "analyze-button",
            "writing-goal",
        }
        self.assertTrue(expected_ids.issubset(set(self.parser.ids)))

    def test_analysis_is_not_claimed_as_authorship_detection(self) -> None:
        self.assertIn("not an AI detector", self.html)
        self.assertIn("No authorship probability or percentage is calculated", self.html)

    def test_inline_javascript_is_present(self) -> None:
        self.assertTrue("function getTextSignals" in "".join(self.parser.inline_script_parts))
        self.assertTrue("function createDraft" in "".join(self.parser.inline_script_parts))

    def test_github_pages_workflow_validates_then_deploys_web_app(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "pages.yml").read_text(encoding="utf-8")
        self.assertIn("python -m unittest discover --start-directory tests --verbose", workflow)
        self.assertIn("needs: validate", workflow)
        self.assertIn("path: apps/web", workflow)
        self.assertIn("pages: write", workflow)
        self.assertIn("actions/deploy-pages@", workflow)


if __name__ == "__main__":
    unittest.main()
