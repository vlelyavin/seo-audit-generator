"""Meta tags analyzer."""

from collections import Counter
from typing import Any, Dict, List

from ..config import settings
from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class MetaTagsAnalyzer(BaseAnalyzer):
    """Analyzer for meta tags (title, description)."""

    name = "meta_tags"
    icon = ""

    def __init__(self):
        super().__init__()

    @property
    def display_name(self) -> str:
        return self.t("analyzers.meta_tags.name")

    @property
    def description(self) -> str:
        return self.t("analyzers.meta_tags.description")

    @property
    def theory(self) -> str:
        return self.t("analyzer_content.meta_tags.theory")

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []
        tables: List[Dict[str, Any]] = []

        # Collect all titles and descriptions
        titles = {}
        descriptions = {}
        missing_titles = []
        missing_descriptions = []
        short_titles = []
        long_titles = []
        short_descriptions = []
        long_descriptions = []

        for url, page in pages.items():
            if page.status_code != 200:
                continue

            # Check title
            if not page.title:
                missing_titles.append(url)
            else:
                titles[url] = page.title
                title_len = len(page.title)
                if title_len < settings.TITLE_MIN_LENGTH:
                    short_titles.append((url, page.title, title_len))
                elif title_len > settings.TITLE_MAX_LENGTH:
                    long_titles.append((url, page.title, title_len))

            # Check description
            if not page.meta_description:
                missing_descriptions.append(url)
            else:
                descriptions[url] = page.meta_description
                desc_len = len(page.meta_description)
                if desc_len < settings.DESCRIPTION_MIN_LENGTH:
                    short_descriptions.append((url, page.meta_description, desc_len))
                elif desc_len > settings.DESCRIPTION_MAX_LENGTH:
                    long_descriptions.append((url, page.meta_description, desc_len))

        # Find duplicates
        title_counts = Counter(titles.values())
        duplicate_titles = {title: count for title, count in title_counts.items() if count > 1}

        desc_counts = Counter(descriptions.values())
        duplicate_descriptions = {desc: count for desc, count in desc_counts.items() if count > 1}

        # Create issues for missing titles
        if missing_titles:
            issues.append(self.create_issue(
                category="missing_title",
                severity=SeverityLevel.ERROR,
                message=self.t("analyzer_content.meta_tags.issues.missing_title", count=len(missing_titles)),
                details=self.t("analyzer_content.meta_tags.issues.missing_title_details"),
                affected_urls=missing_titles[:20],
                recommendation=self.t("analyzer_content.meta_tags.issues.missing_title_recommendation"),
                count=len(missing_titles),
            ))

        # Create issues for missing descriptions
        if missing_descriptions:
            issues.append(self.create_issue(
                category="missing_description",
                severity=SeverityLevel.ERROR,
                message=self.t("analyzer_content.meta_tags.issues.missing_description", count=len(missing_descriptions)),
                details=self.t("analyzer_content.meta_tags.issues.missing_description_details"),
                affected_urls=missing_descriptions[:20],
                recommendation=self.t("analyzer_content.meta_tags.issues.missing_description_recommendation"),
                count=len(missing_descriptions),
            ))

        # Create issues for short titles
        if short_titles:
            issues.append(self.create_issue(
                category="short_title",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.meta_tags.issues.short_title", count=len(short_titles)),
                details=self.t("analyzer_content.meta_tags.issues.short_title_details", min=settings.TITLE_MIN_LENGTH, max=settings.TITLE_MAX_LENGTH),
                affected_urls=[url for url, _, _ in short_titles[:20]],
                recommendation=self.t("analyzer_content.meta_tags.issues.short_title_recommendation"),
                count=len(short_titles),
            ))

        # Create issues for long titles
        if long_titles:
            issues.append(self.create_issue(
                category="long_title",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.meta_tags.issues.long_title", count=len(long_titles)),
                details=self.t("analyzer_content.meta_tags.issues.long_title_details", min=settings.TITLE_MIN_LENGTH, max=settings.TITLE_MAX_LENGTH),
                affected_urls=[url for url, _, _ in long_titles[:20]],
                recommendation=self.t("analyzer_content.meta_tags.issues.long_title_recommendation"),
                count=len(long_titles),
            ))

        # Create issues for short descriptions
        if short_descriptions:
            issues.append(self.create_issue(
                category="short_description",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.meta_tags.issues.short_description", count=len(short_descriptions)),
                details=self.t("analyzer_content.meta_tags.issues.short_description_details", min=settings.DESCRIPTION_MIN_LENGTH, max=settings.DESCRIPTION_MAX_LENGTH),
                affected_urls=[url for url, _, _ in short_descriptions[:20]],
                recommendation=self.t("analyzer_content.meta_tags.issues.short_description_recommendation"),
                count=len(short_descriptions),
            ))

        # Create issues for long descriptions
        if long_descriptions:
            issues.append(self.create_issue(
                category="long_description",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.meta_tags.issues.long_description", count=len(long_descriptions)),
                details=self.t("analyzer_content.meta_tags.issues.long_description_details", min=settings.DESCRIPTION_MIN_LENGTH, max=settings.DESCRIPTION_MAX_LENGTH),
                affected_urls=[url for url, _, _ in long_descriptions[:20]],
                recommendation=self.t("analyzer_content.meta_tags.issues.long_description_recommendation"),
                count=len(long_descriptions),
            ))

        # Create issues for duplicate titles
        if duplicate_titles:
            dup_urls = []
            for title, count in duplicate_titles.items():
                urls_with_title = [url for url, t in titles.items() if t == title]
                dup_urls.extend(urls_with_title[:5])

            issues.append(self.create_issue(
                category="duplicate_title",
                severity=SeverityLevel.ERROR,
                message=self.t("analyzer_content.meta_tags.issues.duplicate_title", count=len(duplicate_titles)),
                details=self.t("analyzer_content.meta_tags.issues.duplicate_title_details"),
                affected_urls=dup_urls[:20],
                recommendation=self.t("analyzer_content.meta_tags.issues.duplicate_title_recommendation"),
                count=sum(duplicate_titles.values()),
            ))

        # Create issues for duplicate descriptions
        if duplicate_descriptions:
            dup_urls = []
            for desc, count in duplicate_descriptions.items():
                urls_with_desc = [url for url, d in descriptions.items() if d == desc]
                dup_urls.extend(urls_with_desc[:5])

            issues.append(self.create_issue(
                category="duplicate_description",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.meta_tags.issues.duplicate_description", count=len(duplicate_descriptions)),
                details=self.t("analyzer_content.meta_tags.issues.duplicate_description_details"),
                affected_urls=dup_urls[:20],
                recommendation=self.t("analyzer_content.meta_tags.issues.duplicate_description_recommendation"),
                count=sum(duplicate_descriptions.values()),
            ))

        # Create table with problematic pages
        if missing_titles or missing_descriptions or short_titles or long_titles:
            h_url = self.t("tables.url")
            h_problem = self.t("tables.problem")
            h_title = "Title"
            h_description = "Description"

            table_data = []
            seen_urls = set()

            for url in missing_titles[:10]:
                if url not in seen_urls:
                    table_data.append({
                        h_url: url,
                        h_problem: self.t("analyzer_content.meta_tags.issues.problem_missing_title"),
                        h_title: "-",
                        h_description: pages[url].meta_description[:50] + "..." if pages[url].meta_description else "-",
                    })
                    seen_urls.add(url)

            for url in missing_descriptions[:10]:
                if url not in seen_urls:
                    table_data.append({
                        h_url: url,
                        h_problem: self.t("analyzer_content.meta_tags.issues.problem_missing_description"),
                        h_title: pages[url].title[:50] + "..." if pages[url].title else "-",
                        h_description: "-",
                    })
                    seen_urls.add(url)

            if table_data:
                tables.append({
                    "title": self.t("analyzer_content.meta_tags.issues.table_title"),
                    "headers": [h_url, h_problem, h_title, h_description],
                    "rows": table_data,
                })

        # Calculate summary
        total_pages = len([p for p in pages.values() if p.status_code == 200])
        ok_titles = total_pages - len(missing_titles) - len(short_titles) - len(long_titles)
        ok_descriptions = total_pages - len(missing_descriptions) - len(short_descriptions) - len(long_descriptions)

        summary_parts = []
        if missing_titles or missing_descriptions:
            summary_parts.append(self.t("analyzer_content.meta_tags.summary.missing", titles=len(missing_titles), descriptions=len(missing_descriptions)))
        if duplicate_titles or duplicate_descriptions:
            summary_parts.append(self.t("analyzer_content.meta_tags.summary.duplicates", titles=len(duplicate_titles), descriptions=len(duplicate_descriptions)))
        if not summary_parts:
            summary_parts.append(self.t("analyzer_content.meta_tags.summary.ok", pages=total_pages))

        severity = self._determine_overall_severity(issues)

        return self.create_result(
            severity=severity,
            summary=". ".join(summary_parts),
            issues=issues,
            data={
                "total_pages": total_pages,
                "missing_titles": len(missing_titles),
                "missing_descriptions": len(missing_descriptions),
                "duplicate_titles": len(duplicate_titles),
                "duplicate_descriptions": len(duplicate_descriptions),
                "ok_titles": ok_titles,
                "ok_descriptions": ok_descriptions,
            },
            tables=tables,
        )
