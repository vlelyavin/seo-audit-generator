"""Mobile friendliness analyzer."""

from typing import Any, Dict, List

from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class MobileAnalyzer(BaseAnalyzer):
    """Analyzer for mobile viewport and friendliness."""

    name = "mobile"
    icon = ""

    def __init__(self):
        super().__init__()

    @property
    def display_name(self) -> str:
        return self.t("analyzers.mobile.name")

    @property
    def description(self) -> str:
        return self.t("analyzers.mobile.description")

    @property
    def theory(self) -> str:
        return self.t("analyzer_content.mobile.theory")

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []

        pages_no_viewport: List[str] = []
        pages_bad_viewport: List[str] = []
        total_ok = 0

        for url, page in pages.items():
            if page.status_code != 200 or not page.html_content:
                continue

            soup = page.get_soup()
            if soup is None:
                continue

            # Check for viewport meta tag (case-insensitive name attribute)
            viewport_meta = soup.find('meta', attrs={'name': lambda v: v and v.lower() == 'viewport'})

            has_viewport = False
            has_correct_viewport = False

            if viewport_meta:
                has_viewport = True
                content = viewport_meta.get('content', '')
                if 'width=device-width' in content:
                    has_correct_viewport = True

            if not has_viewport:
                pages_no_viewport.append(url)
            elif not has_correct_viewport:
                pages_bad_viewport.append(url)

            # Count pages that are fully OK
            if has_correct_viewport:
                total_ok += 1

        # Create issues
        total_checked = total_ok + len(pages_no_viewport) + len(pages_bad_viewport)

        if not pages_no_viewport and not pages_bad_viewport and total_ok > 0:
            issues.append(self.create_issue(
                category="viewport_ok",
                severity=SeverityLevel.SUCCESS,
                message=self.t("analyzer_content.mobile.issues.viewport_ok", count=total_ok),
                details=self.t("analyzer_content.mobile.details.viewport_ok"),
                count=total_ok,
            ))

        if pages_no_viewport:
            issues.append(self.create_issue(
                category="missing_viewport",
                severity=SeverityLevel.ERROR,
                message=self.t("analyzer_content.mobile.issues.missing_viewport", count=len(pages_no_viewport)),
                details=self.t("analyzer_content.mobile.details.missing_viewport"),
                affected_urls=pages_no_viewport[:20],
                recommendation=self.t("analyzer_content.mobile.recommendations.missing_viewport"),
                count=len(pages_no_viewport),
            ))

        if pages_bad_viewport:
            issues.append(self.create_issue(
                category="bad_viewport",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.mobile.issues.bad_viewport", count=len(pages_bad_viewport)),
                details=self.t("analyzer_content.mobile.details.bad_viewport"),
                affected_urls=pages_bad_viewport[:20],
                recommendation=self.t("analyzer_content.mobile.recommendations.bad_viewport"),
                count=len(pages_bad_viewport),
            ))

        # Summary
        if not pages_no_viewport and not pages_bad_viewport:
            summary = self.t("analyzer_content.mobile.summary.ok", count=total_ok)
            severity = SeverityLevel.SUCCESS
        else:
            parts = []
            if pages_no_viewport:
                parts.append(self.t("analyzer_content.mobile.issues.missing_viewport", count=len(pages_no_viewport)))
            if pages_bad_viewport:
                parts.append(self.t("analyzer_content.mobile.issues.bad_viewport", count=len(pages_bad_viewport)))
            summary = self.t("analyzer_content.mobile.summary.problems", problems=", ".join(parts))
            severity = self._determine_overall_severity(issues)

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "total_ok": total_ok,
                "pages_no_viewport": len(pages_no_viewport),
                "pages_bad_viewport": len(pages_bad_viewport),
            },
        )
