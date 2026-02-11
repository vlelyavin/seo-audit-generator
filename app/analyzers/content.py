"""Content analyzer."""

from typing import Any, Dict, List

from ..config import settings
from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class ContentAnalyzer(BaseAnalyzer):
    """Analyzer for page content (word count, thin content)."""

    name = "content"
    icon = ""

    def __init__(self):
        super().__init__()

    @property
    def display_name(self) -> str:
        return self.t("analyzers.content.name")

    @property
    def description(self) -> str:
        return self.t("analyzers.content.description")

    @property
    def theory(self) -> str:
        return self.t("analyzer_content.content.theory")

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []
        tables: List[Dict[str, Any]] = []

        # Analyze content on each page
        thin_content = []
        empty_pages = []
        word_counts = []

        for url, page in pages.items():
            if page.status_code != 200:
                continue

            word_count = page.word_count
            word_counts.append((url, word_count))

            if word_count == 0:
                empty_pages.append(url)
            elif word_count < settings.MIN_CONTENT_WORDS:
                thin_content.append((url, word_count))

        # Sort by word count (ascending) for thin content
        thin_content.sort(key=lambda x: x[1])
        word_counts.sort(key=lambda x: x[1])

        # Create issues
        if empty_pages:
            issues.append(self.create_issue(
                category="empty_pages",
                severity=SeverityLevel.ERROR,
                message=self.t("analyzer_content.content.issues.empty_pages", count=len(empty_pages)),
                details=self.t("analyzer_content.content.issues.empty_pages_details"),
                affected_urls=empty_pages[:20],
                recommendation=self.t("analyzer_content.content.issues.empty_pages_recommendation"),
                count=len(empty_pages),
            ))

        if thin_content:
            issues.append(self.create_issue(
                category="thin_content",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.content.issues.thin_content", count=len(thin_content)),
                details=self.t("analyzer_content.content.issues.thin_content_details", min_words=settings.MIN_CONTENT_WORDS),
                affected_urls=[url for url, _ in thin_content[:20]],
                recommendation=self.t("analyzer_content.content.issues.thin_content_recommendation"),
                count=len(thin_content),
            ))

        # Create table with thin content pages
        h_url = self.t("tables.url")
        h_word_count = self.t("tables.word_count")
        h_status = self.t("tables.status")

        table_data = []

        for url in empty_pages[:5]:
            table_data.append({
                h_url: url[:70] + "..." if len(url) > 70 else url,
                h_word_count: 0,
                h_status: self.t("analyzer_content.content.issues.status_empty"),
            })

        for url, count in thin_content[:15]:
            table_data.append({
                h_url: url[:70] + "..." if len(url) > 70 else url,
                h_word_count: count,
                h_status: self.t("analyzer_content.content.issues.status_thin"),
            })

        if table_data:
            tables.append({
                "title": self.t("analyzer_content.content.issues.table_title"),
                "headers": [h_url, h_word_count, h_status],
                "rows": table_data,
            })

        # Calculate statistics
        total_pages = len(word_counts)
        if word_counts:
            total_words = sum(wc for _, wc in word_counts)
            avg_words = total_words // total_pages if total_pages > 0 else 0
            min_words = min(wc for _, wc in word_counts)
            max_words = max(wc for _, wc in word_counts)
        else:
            avg_words = min_words = max_words = 0

        # Summary
        ok_pages = total_pages - len(empty_pages) - len(thin_content)

        if not issues:
            summary = self.t("analyzer_content.content.summary.ok", pages=total_pages, avg_words=avg_words)
        else:
            parts = []
            if empty_pages:
                parts.append(self.t("analyzer_content.content.summary.empty", count=len(empty_pages)))
            if thin_content:
                parts.append(self.t("analyzer_content.content.summary.thin", count=len(thin_content)))
            summary = self.t("analyzer_content.content.summary.issues", issues=", ".join(parts), avg_words=avg_words)

        severity = self._determine_overall_severity(issues)

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "total_pages": total_pages,
                "empty_pages": len(empty_pages),
                "thin_content": len(thin_content),
                "ok_pages": ok_pages,
                "avg_words": avg_words,
                "min_words": min_words,
                "max_words": max_words,
                "min_required": settings.MIN_CONTENT_WORDS,
            },
            tables=tables,
        )
