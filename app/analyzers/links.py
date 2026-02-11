"""Links analyzer (broken links check)."""

import asyncio
from typing import Any, Dict, List, Set

from ..config import settings
from ..crawler import check_url_status
from ..models import AnalyzerResult, AuditIssue, LinkData, PageData, SeverityLevel
from .base import BaseAnalyzer


class LinksAnalyzer(BaseAnalyzer):
    """Analyzer for broken internal and external links."""

    name = "links"
    icon = ""

    def __init__(self):
        super().__init__()

    @property
    def display_name(self) -> str:
        return self.t("analyzers.links.name")

    @property
    def description(self) -> str:
        return self.t("analyzers.links.description")

    @property
    def theory(self) -> str:
        return self.t("analyzer_content.links.theory")

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []
        tables: List[Dict[str, Any]] = []

        # Collect all internal and external links
        internal_links: Dict[str, List[str]] = {}  # link -> source pages
        external_links: Dict[str, Dict[str, Any]] = {}  # link -> {data, pages}

        for url, page in pages.items():
            if page.status_code != 200:
                continue

            # Internal links
            for link in page.internal_links:
                if link not in internal_links:
                    internal_links[link] = []
                internal_links[link].append(url)

            # External links
            for link_data in page.external_links:
                href = link_data.href
                if href not in external_links:
                    external_links[href] = {
                        'data': link_data,
                        'pages': [],
                    }
                external_links[href]['pages'].append(url)

        # Check internal links status
        broken_internal: List[Dict[str, Any]] = []

        for link, source_pages in internal_links.items():
            # Check if page was crawled
            if link in pages:
                status = pages[link].status_code
            else:
                # Page wasn't crawled, check its status
                status = await check_url_status(link)

            if status >= 400 or status == 0:
                broken_internal.append({
                    'url': link,
                    'status': status,
                    'source_pages': source_pages[:5],
                })

        # Check external links (limited)
        broken_external: List[Dict[str, Any]] = []
        external_to_check = list(external_links.keys())[:settings.MAX_EXTERNAL_LINKS]

        async def check_external(url: str) -> tuple[str, int]:
            status = await check_url_status(url, timeout=5)
            return url, status

        # Check external links concurrently (in batches of 20)
        batch_size = 20
        for i in range(0, len(external_to_check), batch_size):
            batch = external_to_check[i:i + batch_size]
            tasks = [check_external(url) for url in batch]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for result in results:
                if isinstance(result, tuple):
                    url, status = result
                    if status >= 400 or status == 0:
                        broken_external.append({
                            'url': url,
                            'status': status,
                            'source_pages': external_links[url]['pages'][:5],
                        })

        # Create issues for broken internal links
        if broken_internal:
            issues.append(self.create_issue(
                category="broken_internal",
                severity=SeverityLevel.ERROR,
                message=self.t("analyzer_content.links.issues.broken_internal", count=len(broken_internal)),
                details=self.t("analyzer_content.links.issues.broken_internal_details"),
                affected_urls=[link['url'] for link in broken_internal[:20]],
                recommendation=self.t("analyzer_content.links.issues.broken_internal_recommendation"),
                count=len(broken_internal),
            ))

        # Create issues for broken external links
        if broken_external:
            issues.append(self.create_issue(
                category="broken_external",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.links.issues.broken_external", count=len(broken_external)),
                details=self.t("analyzer_content.links.issues.broken_external_details"),
                affected_urls=[link['url'] for link in broken_external[:20]],
                recommendation=self.t("analyzer_content.links.issues.broken_external_recommendation"),
                count=len(broken_external),
            ))

        # Create table with broken links
        h_type = self.t("tables.type")
        h_link = self.t("tables.link")
        h_status = self.t("tables.status")
        h_found_on = self.t("tables.found_on")
        table_data = []

        for link in broken_internal[:15]:
            status_text = f"{link['status']}" if link['status'] > 0 else "Timeout/Error"
            table_data.append({
                h_type: self.t("analyzer_content.links.issues.type_internal"),
                h_link: link['url'][:60] + "..." if len(link['url']) > 60 else link['url'],
                h_status: status_text,
                h_found_on: link['source_pages'][0] if link['source_pages'] else "-",
            })

        for link in broken_external[:10]:
            status_text = f"{link['status']}" if link['status'] > 0 else "Timeout/Error"
            table_data.append({
                h_type: self.t("analyzer_content.links.issues.type_external"),
                h_link: link['url'][:60] + "..." if len(link['url']) > 60 else link['url'],
                h_status: status_text,
                h_found_on: link['source_pages'][0] if link['source_pages'] else "-",
            })

        if table_data:
            tables.append({
                "title": self.t("analyzer_content.links.issues.table_title"),
                "headers": [h_type, h_link, h_status, h_found_on],
                "rows": table_data,
            })

        # Summary
        total_internal = len(internal_links)
        total_external = len(external_links)

        if not issues:
            summary = self.t("analyzer_content.links.summary.ok", internal=total_internal, external=total_external)
        else:
            parts = []
            if broken_internal:
                parts.append(self.t("analyzer_content.links.issues.internal_count", count=len(broken_internal)))
            if broken_external:
                parts.append(self.t("analyzer_content.links.issues.external_count", count=len(broken_external)))
            summary = self.t("analyzer_content.links.summary.issues", issues=', '.join(parts))

        severity = self._determine_overall_severity(issues)

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "total_internal_links": total_internal,
                "total_external_links": total_external,
                "broken_internal": len(broken_internal),
                "broken_external": len(broken_external),
                "external_checked": len(external_to_check),
            },
            tables=tables,
        )
