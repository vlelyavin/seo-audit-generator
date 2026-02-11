"""Site structure analyzer."""

from collections import defaultdict
from typing import Any, Dict, List, Set

from ..config import settings
from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class StructureAnalyzer(BaseAnalyzer):
    """Analyzer for site structure (depth, orphan pages, internal linking)."""

    name = "structure"
    icon = ""

    def __init__(self):
        super().__init__()

    @property
    def display_name(self) -> str:
        return self.t("analyzers.structure.name")

    @property
    def description(self) -> str:
        return self.t("analyzers.structure.description")

    @property
    def theory(self) -> str:
        return self.t("analyzer_content.structure.theory")

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []
        tables: List[Dict[str, Any]] = []

        # Analyze page depths
        depth_distribution: Dict[int, List[str]] = defaultdict(list)
        deep_pages = []  # Pages with depth > MAX_CLICK_DEPTH

        # Build link graph for orphan page detection
        pages_with_incoming_links: Set[str] = set()

        for url, page in pages.items():
            if page.status_code != 200:
                continue

            depth_distribution[page.depth].append(url)

            if page.depth > settings.MAX_CLICK_DEPTH:
                deep_pages.append((url, page.depth))

            # Track pages that have incoming links
            for link in page.internal_links:
                pages_with_incoming_links.add(link)

        # Find orphan pages (no incoming internal links except homepage)
        orphan_pages = []
        for url, page in pages.items():
            if page.status_code != 200:
                continue

            # Skip homepage
            if url == base_url or url == base_url + "/":
                continue

            if url not in pages_with_incoming_links:
                orphan_pages.append(url)

        # Analyze internal linking
        pages_with_few_links = []
        pages_with_many_links = []

        for url, page in pages.items():
            if page.status_code != 200:
                continue

            link_count = len(page.internal_links)

            if link_count == 0:
                pages_with_few_links.append((url, 0))
            elif link_count < 3:
                pages_with_few_links.append((url, link_count))

        # Calculate statistics
        total_pages = len([p for p in pages.values() if p.status_code == 200])
        max_depth = max(depth_distribution.keys()) if depth_distribution else 0

        # Create issues
        if deep_pages:
            deep_pages.sort(key=lambda x: x[1], reverse=True)
            issues.append(self.create_issue(
                category="deep_pages",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.structure.issues.deep_pages", count=len(deep_pages)),
                details=self.t("analyzer_content.structure.issues.deep_pages_details", max_depth=settings.MAX_CLICK_DEPTH),
                affected_urls=[url for url, _ in deep_pages[:20]],
                recommendation=self.t("analyzer_content.structure.issues.deep_pages_recommendation"),
                count=len(deep_pages),
            ))

        if orphan_pages:
            issues.append(self.create_issue(
                category="orphan_pages",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.structure.issues.orphan_pages", count=len(orphan_pages)),
                details=self.t("analyzer_content.structure.issues.orphan_pages_details"),
                affected_urls=orphan_pages[:20],
                recommendation=self.t("analyzer_content.structure.issues.orphan_pages_recommendation"),
                count=len(orphan_pages),
            ))

        if pages_with_few_links:
            issues.append(self.create_issue(
                category="few_internal_links",
                severity=SeverityLevel.INFO,
                message=self.t("analyzer_content.structure.issues.few_internal_links", count=len(pages_with_few_links)),
                details=self.t("analyzer_content.structure.issues.few_internal_links_details"),
                affected_urls=[url for url, _ in pages_with_few_links[:20]],
                recommendation=self.t("analyzer_content.structure.issues.few_internal_links_recommendation"),
                count=len(pages_with_few_links),
            ))

        if max_depth > 5:
            issues.append(self.create_issue(
                category="very_deep_structure",
                severity=SeverityLevel.ERROR,
                message=self.t("analyzer_content.structure.issues.very_deep_structure", max_depth=max_depth),
                details=self.t("analyzer_content.structure.issues.very_deep_structure_details"),
                recommendation=self.t("analyzer_content.structure.issues.very_deep_structure_recommendation"),
            ))

        # Create table with depth distribution
        h_depth = self.t("tables.depth")
        h_page_count = self.t("tables.page_count")
        h_example = self.t("tables.example")

        table_data = []

        for depth in sorted(depth_distribution.keys()):
            urls = depth_distribution[depth]
            status = "✓" if depth <= settings.MAX_CLICK_DEPTH else "⚠️"
            table_data.append({
                h_depth: f"{depth} {status}",
                h_page_count: len(urls),
                h_example: urls[0][:50] + "..." if urls and len(urls[0]) > 50 else (urls[0] if urls else "-"),
            })

        if table_data:
            tables.append({
                "title": self.t("analyzer_content.structure.issues.table_depth_title"),
                "headers": [h_depth, h_page_count, h_example],
                "rows": table_data,
            })

        # Add orphan pages table if any
        if orphan_pages:
            h_url = self.t("tables.url")
            h_title = "Title"

            orphan_table = []
            for url in orphan_pages[:15]:
                page = pages.get(url)
                title = page.title[:40] + "..." if page and page.title and len(page.title) > 40 else (page.title if page else "-")
                orphan_table.append({
                    h_url: url[:60] + "..." if len(url) > 60 else url,
                    h_title: title,
                })
            tables.append({
                "title": self.t("analyzer_content.structure.issues.table_orphan_title"),
                "headers": [h_url, h_title],
                "rows": orphan_table,
            })

        # Summary
        if not issues:
            summary = self.t("analyzer_content.structure.summary.ok", max_depth=max_depth)
        else:
            parts = []
            if deep_pages:
                parts.append(self.t("analyzer_content.structure.summary.deep", count=len(deep_pages)))
            if orphan_pages:
                parts.append(self.t("analyzer_content.structure.summary.orphan", count=len(orphan_pages)))
            summary = self.t("analyzer_content.structure.summary.issues", max_depth=max_depth, issues=", ".join(parts))

        severity = self._determine_overall_severity(issues)

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "total_pages": total_pages,
                "max_depth": max_depth,
                "depth_distribution": {k: len(v) for k, v in depth_distribution.items()},
                "deep_pages": len(deep_pages),
                "orphan_pages": len(orphan_pages),
                "pages_with_few_links": len(pages_with_few_links),
            },
            tables=tables,
        )
