"""URL quality analyzer."""

from typing import Any, Dict, List
from urllib.parse import urlparse

from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class URLQualityAnalyzer(BaseAnalyzer):
    """Analyzer for URL structure and quality."""

    name = "url_quality"
    icon = ""

    def __init__(self):
        super().__init__()

    @property
    def display_name(self) -> str:
        return self.t("analyzers.url_quality.name")

    @property
    def description(self) -> str:
        return self.t("analyzers.url_quality.description")

    @property
    def theory(self) -> str:
        return self.t("analyzer_content.url_quality.theory")

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []
        tables: List[Dict[str, Any]] = []

        long_urls_warn: List[str] = []
        long_urls_error: List[str] = []
        uppercase_urls: List[str] = []
        special_chars_urls: List[str] = []
        underscore_urls: List[str] = []
        dynamic_urls: List[str] = []
        double_slash_urls: List[str] = []

        # Collect table data for problematic URLs
        table_data: List[Dict[str, str]] = []
        h_url = self.t("tables.url")
        h_problem = self.t("tables.problem")
        h_length = self.t("tables.length")

        for url, page in pages.items():
            if page.status_code != 200:
                continue

            parsed = urlparse(url)
            path = parsed.path
            path_length = len(path)
            problems: List[str] = []

            # Check path length
            if path_length > 120:
                long_urls_error.append(url)
                problems.append("very long")
            elif path_length > 75:
                long_urls_warn.append(url)
                problems.append("long")

            # Check uppercase
            if any(c.isupper() for c in path):
                uppercase_urls.append(url)
                problems.append("uppercase")

            # Check non-ASCII characters
            if any(ord(c) > 127 for c in path):
                special_chars_urls.append(url)
                problems.append("special chars")

            # Check underscores
            if '_' in path:
                underscore_urls.append(url)
                problems.append("underscores")

            # Check dynamic parameters (more than 1 param)
            if parsed.query and len(parsed.query.split('&')) > 1:
                dynamic_urls.append(url)
                problems.append("params")

            # Check double slashes in path
            if '//' in path:
                double_slash_urls.append(url)
                problems.append("double slashes")

            if problems:
                table_data.append({
                    h_url: url,
                    h_problem: ", ".join(problems),
                    h_length: str(path_length),
                })

        # Create issues
        if long_urls_warn:
            issues.append(self.create_issue(
                category="long_urls",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.url_quality.issues.long_urls", count=len(long_urls_warn)),
                details=self.t("analyzer_content.url_quality.details.long_urls"),
                affected_urls=long_urls_warn[:20],
                recommendation=self.t("analyzer_content.url_quality.recommendations.long_urls"),
                count=len(long_urls_warn),
            ))

        if long_urls_error:
            issues.append(self.create_issue(
                category="long_urls",
                severity=SeverityLevel.ERROR,
                message=self.t("analyzer_content.url_quality.issues.long_urls", count=len(long_urls_error)),
                details=self.t("analyzer_content.url_quality.details.long_urls"),
                affected_urls=long_urls_error[:20],
                recommendation=self.t("analyzer_content.url_quality.recommendations.long_urls"),
                count=len(long_urls_error),
            ))

        if uppercase_urls:
            issues.append(self.create_issue(
                category="uppercase_urls",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.url_quality.issues.uppercase_urls", count=len(uppercase_urls)),
                details=self.t("analyzer_content.url_quality.details.uppercase_urls"),
                affected_urls=uppercase_urls[:20],
                recommendation=self.t("analyzer_content.url_quality.recommendations.uppercase_urls"),
                count=len(uppercase_urls),
            ))

        if special_chars_urls:
            issues.append(self.create_issue(
                category="special_chars",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.url_quality.issues.special_chars", count=len(special_chars_urls)),
                details=self.t("analyzer_content.url_quality.details.special_chars"),
                affected_urls=special_chars_urls[:20],
                recommendation=self.t("analyzer_content.url_quality.recommendations.special_chars"),
                count=len(special_chars_urls),
            ))

        if underscore_urls:
            issues.append(self.create_issue(
                category="underscores",
                severity=SeverityLevel.INFO,
                message=self.t("analyzer_content.url_quality.issues.underscores", count=len(underscore_urls)),
                details=self.t("analyzer_content.url_quality.details.underscores"),
                affected_urls=underscore_urls[:20],
                recommendation=self.t("analyzer_content.url_quality.recommendations.underscores"),
                count=len(underscore_urls),
            ))

        if dynamic_urls:
            issues.append(self.create_issue(
                category="dynamic_params",
                severity=SeverityLevel.INFO,
                message=self.t("analyzer_content.url_quality.issues.dynamic_params", count=len(dynamic_urls)),
                details=self.t("analyzer_content.url_quality.details.dynamic_params"),
                affected_urls=dynamic_urls[:20],
                recommendation=self.t("analyzer_content.url_quality.recommendations.dynamic_params"),
                count=len(dynamic_urls),
            ))

        if double_slash_urls:
            issues.append(self.create_issue(
                category="double_slashes",
                severity=SeverityLevel.ERROR,
                message=self.t("analyzer_content.url_quality.issues.double_slashes", count=len(double_slash_urls)),
                details=self.t("analyzer_content.url_quality.details.double_slashes"),
                affected_urls=double_slash_urls[:20],
                recommendation=self.t("analyzer_content.url_quality.recommendations.double_slashes"),
                count=len(double_slash_urls),
            ))

        # If no problems found
        has_problems = (long_urls_warn or long_urls_error or uppercase_urls or
                        special_chars_urls or underscore_urls or dynamic_urls or double_slash_urls)

        if not has_problems:
            issues.append(self.create_issue(
                category="urls_ok",
                severity=SeverityLevel.SUCCESS,
                message=self.t("analyzer_content.url_quality.issues.urls_ok"),
                details=self.t("analyzer_content.url_quality.details.urls_ok"),
            ))

        # Create table with problematic URLs
        if table_data:
            tables.append({
                "title": self.t("table_translations.titles.Problematic URLs"),
                "headers": [h_url, h_problem, h_length],
                "rows": table_data[:10],
            })

        # Summary
        total_pages = len([p for p in pages.values() if p.status_code == 200])

        if not has_problems:
            summary = self.t("analyzer_content.url_quality.summary.ok")
            severity = SeverityLevel.SUCCESS
        else:
            parts = []
            if long_urls_warn or long_urls_error:
                parts.append(f"long URLs: {len(long_urls_warn) + len(long_urls_error)}")
            if uppercase_urls:
                parts.append(f"uppercase: {len(uppercase_urls)}")
            if special_chars_urls:
                parts.append(f"special chars: {len(special_chars_urls)}")
            if underscore_urls:
                parts.append(f"underscores: {len(underscore_urls)}")
            if dynamic_urls:
                parts.append(f"params: {len(dynamic_urls)}")
            if double_slash_urls:
                parts.append(f"double slashes: {len(double_slash_urls)}")
            summary = self.t("analyzer_content.url_quality.summary.problems", problems=", ".join(parts))
            severity = self._determine_overall_severity(issues)

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "total_pages": total_pages,
                "long_urls_warn": len(long_urls_warn),
                "long_urls_error": len(long_urls_error),
                "uppercase_urls": len(uppercase_urls),
                "special_chars_urls": len(special_chars_urls),
                "underscore_urls": len(underscore_urls),
                "dynamic_urls": len(dynamic_urls),
                "double_slash_urls": len(double_slash_urls),
            },
            tables=tables,
        )
