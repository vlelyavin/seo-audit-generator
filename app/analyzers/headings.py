"""Headings (H1-H6) analyzer."""

from collections import Counter
from typing import Any, Dict, List

from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class HeadingsAnalyzer(BaseAnalyzer):
    """Analyzer for H1-H6 headings hierarchy."""

    name = "headings"
    icon = ""

    def __init__(self):
        super().__init__()

    @property
    def display_name(self) -> str:
        return self.t("analyzers.headings.name")

    @property
    def description(self) -> str:
        return self.t("analyzers.headings.description")

    @property
    def theory(self) -> str:
        return self.t("analyzer_content.headings.theory")

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []
        tables: List[Dict[str, Any]] = []

        # Collect H1 data
        all_h1s = {}
        missing_h1 = []
        multiple_h1 = []
        empty_h1 = []

        for url, page in pages.items():
            if page.status_code != 200:
                continue

            h1_tags = page.h1_tags

            if not h1_tags:
                missing_h1.append(url)
            elif len(h1_tags) > 1:
                multiple_h1.append((url, h1_tags))
                all_h1s[url] = h1_tags[0]  # Take first for duplicate check
            else:
                h1_text = h1_tags[0].strip()
                if not h1_text:
                    empty_h1.append(url)
                else:
                    all_h1s[url] = h1_text

        # Find duplicate H1s
        h1_counts = Counter(all_h1s.values())
        duplicate_h1s = {h1: count for h1, count in h1_counts.items() if count > 1}

        # Create issues
        if missing_h1:
            issues.append(self.create_issue(
                category="missing_h1",
                severity=SeverityLevel.ERROR,
                message=self.t("analyzer_content.headings.issues.missing_h1", count=len(missing_h1)),
                details=self.t("analyzer_content.headings.issues.missing_h1_details"),
                affected_urls=missing_h1[:20],
                recommendation=self.t("analyzer_content.headings.issues.missing_h1_recommendation"),
                count=len(missing_h1),
            ))

        if multiple_h1:
            issues.append(self.create_issue(
                category="multiple_h1",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.headings.issues.multiple_h1", count=len(multiple_h1)),
                details=self.t("analyzer_content.headings.issues.multiple_h1_details"),
                affected_urls=[url for url, _ in multiple_h1[:20]],
                recommendation=self.t("analyzer_content.headings.issues.multiple_h1_recommendation"),
                count=len(multiple_h1),
            ))

        if empty_h1:
            issues.append(self.create_issue(
                category="empty_h1",
                severity=SeverityLevel.ERROR,
                message=self.t("analyzer_content.headings.issues.empty_h1", count=len(empty_h1)),
                details=self.t("analyzer_content.headings.issues.empty_h1_details"),
                affected_urls=empty_h1[:20],
                recommendation=self.t("analyzer_content.headings.issues.empty_h1_recommendation"),
                count=len(empty_h1),
            ))

        if duplicate_h1s:
            dup_urls = []
            for h1, count in duplicate_h1s.items():
                urls_with_h1 = [url for url, h in all_h1s.items() if h == h1]
                dup_urls.extend(urls_with_h1[:5])

            issues.append(self.create_issue(
                category="duplicate_h1",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.headings.issues.duplicate_h1", count=len(duplicate_h1s)),
                details=self.t("analyzer_content.headings.issues.duplicate_h1_details"),
                affected_urls=dup_urls[:20],
                recommendation=self.t("analyzer_content.headings.issues.duplicate_h1_recommendation"),
                count=sum(duplicate_h1s.values()),
            ))

        # Check heading hierarchy (H1-H6)
        hierarchy_violations = []
        for url, page in pages.items():
            if page.status_code != 200:
                continue
            headings_by_level = {
                1: page.h1_tags,
                2: page.h2_tags,
                3: page.h3_tags,
                4: page.h4_tags,
                5: page.h5_tags,
                6: page.h6_tags,
            }
            present_levels = sorted([lvl for lvl, tags in headings_by_level.items() if tags])
            if len(present_levels) >= 2:
                for i in range(len(present_levels) - 1):
                    if present_levels[i + 1] - present_levels[i] > 1:
                        hierarchy_violations.append(
                            (url, present_levels[i], present_levels[i + 1])
                        )
                        break

        if hierarchy_violations:
            issues.append(self.create_issue(
                category="hierarchy_violation",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.headings.issues.hierarchy_violation", count=len(hierarchy_violations)),
                details=self.t("analyzer_content.headings.issues.hierarchy_violation_details"),
                affected_urls=[url for url, _, _ in hierarchy_violations[:20]],
                recommendation=self.t("analyzer_content.headings.issues.hierarchy_violation_recommendation"),
                count=len(hierarchy_violations),
            ))

        # Create table with problematic pages
        h_url = self.t("tables.url")
        h_problem = self.t("tables.problem")
        h_h1 = "H1"

        table_data = []

        for url in missing_h1[:10]:
            table_data.append({
                h_url: url,
                h_problem: self.t("analyzer_content.headings.issues.problem_missing_h1"),
                h_h1: "-",
            })

        for url, h1_list in multiple_h1[:10]:
            table_data.append({
                h_url: url,
                h_problem: self.t("analyzer_content.headings.issues.problem_multiple_h1", count=len(h1_list)),
                h_h1: " | ".join(h1_list[:3]) + ("..." if len(h1_list) > 3 else ""),
            })

        for url in empty_h1[:10]:
            table_data.append({
                h_url: url,
                h_problem: self.t("analyzer_content.headings.issues.problem_empty_h1"),
                h_h1: self.t("analyzer_content.headings.issues.empty_value"),
            })

        for url, from_lvl, to_lvl in hierarchy_violations[:10]:
            table_data.append({
                h_url: url,
                h_problem: self.t("analyzer_content.headings.issues.problem_hierarchy_skip", from_level=from_lvl, to_level=to_lvl),
                h_h1: page.h1_tags[0] if pages.get(url) and pages[url].h1_tags else "-",
            })

        if table_data:
            tables.append({
                "title": self.t("analyzer_content.headings.issues.table_title"),
                "headers": [h_url, h_problem, h_h1],
                "rows": table_data,
            })

        # Summary
        total_pages = len([p for p in pages.values() if p.status_code == 200])
        ok_pages = total_pages - len(missing_h1) - len(multiple_h1) - len(empty_h1)

        summary_parts = []
        if missing_h1:
            summary_parts.append(self.t("analyzer_content.headings.summary.missing", count=len(missing_h1)))
        if multiple_h1:
            summary_parts.append(self.t("analyzer_content.headings.summary.multiple", count=len(multiple_h1)))
        if duplicate_h1s:
            summary_parts.append(self.t("analyzer_content.headings.summary.duplicates", count=len(duplicate_h1s)))
        if hierarchy_violations:
            summary_parts.append(self.t("analyzer_content.headings.summary.hierarchy", count=len(hierarchy_violations)))

        if summary_parts:
            summary = self.t("analyzer_content.headings.summary.issues", issues=", ".join(summary_parts))
        else:
            summary = self.t("analyzer_content.headings.summary.ok", pages=total_pages)

        severity = self._determine_overall_severity(issues)

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "total_pages": total_pages,
                "missing_h1": len(missing_h1),
                "multiple_h1": len(multiple_h1),
                "empty_h1": len(empty_h1),
                "duplicate_h1": len(duplicate_h1s),
                "hierarchy_violations": len(hierarchy_violations),
                "ok_pages": ok_pages,
            },
            tables=tables,
        )
