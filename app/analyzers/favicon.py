"""Favicon analyzer."""

from typing import Any, Dict, List
from urllib.parse import urljoin

from ..crawler import check_url_status
from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class FaviconAnalyzer(BaseAnalyzer):
    """Analyzer for favicon presence and format."""

    name = "favicon"
    icon = ""

    def __init__(self):
        super().__init__()

    @property
    def display_name(self) -> str:
        return self.t("analyzers.favicon.name")

    @property
    def description(self) -> str:
        return self.t("analyzers.favicon.description")

    @property
    def theory(self) -> str:
        return self.t("analyzer_content.favicon.theory")

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []

        # Check /favicon.ico at root
        favicon_url = urljoin(base_url, "/favicon.ico")
        favicon_status = await check_url_status(favicon_url)
        has_favicon_ico = favicon_status == 200

        # Check for link rel="icon" in HTML
        html_favicons = []
        apple_touch_icons = []

        # Check home page for favicon links
        home_page = pages.get(base_url) or pages.get(base_url + "/")
        if not home_page:
            # Try to find any page
            for url, page in pages.items():
                if page.status_code == 200 and page.html_content:
                    home_page = page
                    break

        if home_page and home_page.html_content:
            soup = home_page.get_soup()
            if soup is None:
                return self.create_result(
                    severity=SeverityLevel.ERROR,
                    summary=self.t("analyzer_content.favicon.issues.no_favicon"),
                    issues=[],
                    data={},
                )

            # Find all favicon links
            for link in soup.find_all('link', rel=True):
                rel = link.get('rel', [])
                if isinstance(rel, str):
                    rel = [rel]

                href = link.get('href', '')
                if not href:
                    continue

                # Make absolute URL
                if not href.startswith(('http://', 'https://')):
                    href = urljoin(base_url, href)

                if 'icon' in rel or 'shortcut' in rel:
                    sizes = link.get('sizes', '')
                    type_attr = link.get('type', '')
                    html_favicons.append({
                        'href': href,
                        'sizes': sizes,
                        'type': type_attr,
                    })

                if 'apple-touch-icon' in rel:
                    sizes = link.get('sizes', '')
                    apple_touch_icons.append({
                        'href': href,
                        'sizes': sizes,
                    })

        has_html_favicon = len(html_favicons) > 0
        has_apple_icon = len(apple_touch_icons) > 0

        # Determine overall status
        if not has_favicon_ico and not has_html_favicon:
            issues.append(self.create_issue(
                category="missing_favicon",
                severity=SeverityLevel.ERROR,
                message=self.t("analyzer_content.favicon.issues.missing"),
                details=self.t("analyzer_content.favicon.details.missing"),
                recommendation=self.t("analyzer_content.favicon.recommendations.missing"),
            ))
        elif not has_favicon_ico:
            issues.append(self.create_issue(
                category="no_favicon_ico",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.favicon.issues.no_ico"),
                details=self.t("analyzer_content.favicon.details.no_ico"),
                recommendation=self.t("analyzer_content.favicon.recommendations.no_ico"),
            ))

        if not has_apple_icon:
            issues.append(self.create_issue(
                category="no_apple_touch_icon",
                severity=SeverityLevel.INFO,
                message=self.t("analyzer_content.favicon.issues.no_apple"),
                details=self.t("analyzer_content.favicon.details.no_apple"),
                recommendation=self.t("analyzer_content.favicon.recommendations.no_apple"),
            ))

        # Check favicon format recommendations
        has_modern_format = False
        for favicon in html_favicons:
            if favicon.get('type') in ['image/svg+xml', 'image/png']:
                has_modern_format = True
                break
            if '.svg' in favicon.get('href', '') or '.png' in favicon.get('href', ''):
                has_modern_format = True
                break

        if has_html_favicon and not has_modern_format:
            issues.append(self.create_issue(
                category="old_favicon_format",
                severity=SeverityLevel.INFO,
                message=self.t("analyzer_content.favicon.issues.old_favicon_format"),
                details=self.t("analyzer_content.favicon.details.old_favicon_format"),
                recommendation=self.t("analyzer_content.favicon.recommendations.old_favicon_format"),
            ))

        # Summary
        if not issues:
            summary = self.t("analyzer_content.favicon.summary.ok")
            severity = SeverityLevel.SUCCESS
        elif any(i.severity == SeverityLevel.ERROR for i in issues):
            summary = self.t("analyzer_content.favicon.summary.missing")
            severity = SeverityLevel.ERROR
        else:
            summary = self.t("analyzer_content.favicon.summary.needs_improvement")
            severity = SeverityLevel.WARNING

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "has_favicon_ico": has_favicon_ico,
                "has_html_favicon": has_html_favicon,
                "has_apple_icon": has_apple_icon,
                "html_favicons": html_favicons,
                "apple_touch_icons": apple_touch_icons,
                "favicon_url": favicon_url,
            },
        )
