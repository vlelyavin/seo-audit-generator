"""404 page analyzer."""

import random
import string
from typing import Any, Dict, List
from urllib.parse import urljoin

import aiohttp

from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class Page404Analyzer(BaseAnalyzer):
    """Analyzer for custom 404 error page."""

    name = "page_404"
    icon = ""

    def __init__(self):
        super().__init__()

    @property
    def display_name(self) -> str:
        return self.t("analyzers.page_404.name")

    @property
    def description(self) -> str:
        return self.t("analyzers.page_404.description")

    @property
    def theory(self) -> str:
        return self.t("analyzer_content.page_404.theory")

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []

        # Generate random non-existent URL
        random_path = ''.join(random.choices(string.ascii_lowercase + string.digits, k=20))
        test_url = urljoin(base_url, f"/{random_path}-nonexistent-page-test-12345")

        # Fetch the 404 page
        has_custom_404 = False
        returns_404_status = False
        has_navigation = False
        has_search = False
        has_home_link = False
        page_content = None

        try:
            timeout = aiohttp.ClientTimeout(total=10)
            headers = {
                'User-Agent': 'Mozilla/5.0 (compatible; SEOAuditBot/1.0)',
                'Accept': 'text/html,application/xhtml+xml',
            }

            connector = aiohttp.TCPConnector(ssl=False)
            async with aiohttp.ClientSession(connector=connector) as session:
                async with session.get(test_url, timeout=timeout, headers=headers, allow_redirects=True) as response:
                    status_code = response.status
                    returns_404_status = status_code == 404

                    if status_code in [200, 404]:
                        html = await response.text()
                        page_content = html

                        from bs4 import BeautifulSoup
                        soup = BeautifulSoup(html, 'lxml')

                        # Check if it's a custom 404 page (not a generic server error)
                        body_text = soup.get_text().lower()

                        # Look for indicators of custom 404
                        custom_indicators = [
                            '404', 'не знайдено', 'not found', 'помилка',
                            'сторінку не знайдено', 'page not found',
                            'сторінка не існує', 'такої сторінки немає',
                        ]
                        has_custom_404 = any(indicator in body_text for indicator in custom_indicators)

                        # Check for navigation
                        nav_elements = soup.find_all(['nav', 'header'])
                        menu_links = soup.find_all('a', class_=lambda x: x and ('menu' in x.lower() or 'nav' in x.lower()))
                        has_navigation = len(nav_elements) > 0 or len(menu_links) > 3

                        # Check for search
                        search_forms = soup.find_all('form', action=lambda x: x and 'search' in x.lower())
                        search_inputs = soup.find_all('input', {'type': 'search'})
                        search_inputs2 = soup.find_all('input', {'name': lambda x: x and ('search' in x.lower() or 'q' == x.lower())})
                        has_search = len(search_forms) > 0 or len(search_inputs) > 0 or len(search_inputs2) > 0

                        # Check for home link
                        home_links = soup.find_all('a', href=lambda x: x and (x == '/' or x == base_url or 'home' in x.lower() or 'головн' in x.lower()))
                        has_home_link = len(home_links) > 0

        except Exception as e:
            issues.append(self.create_issue(
                category="404_check_failed",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.page_404.issues.check_failed"),
                details=self.t("analyzer_content.page_404.issues.check_failed_details", error=str(e)),
                recommendation=self.t("analyzer_content.page_404.issues.check_failed_recommendation"),
            ))
            return self.create_result(
                severity=SeverityLevel.WARNING,
                summary=self.t("analyzer_content.page_404.issues.check_failed_summary"),
                issues=issues,
            )

        # Create issues based on findings
        if not returns_404_status:
            issues.append(self.create_issue(
                category="wrong_404_status",
                severity=SeverityLevel.ERROR,
                message=self.t("analyzer_content.page_404.issues.wrong_status"),
                details=self.t("analyzer_content.page_404.issues.wrong_status_details", status=status_code),
                recommendation=self.t("analyzer_content.page_404.issues.wrong_status_recommendation"),
            ))

        if not has_custom_404:
            issues.append(self.create_issue(
                category="no_custom_404",
                severity=SeverityLevel.ERROR,
                message=self.t("analyzer_content.page_404.issues.no_custom"),
                details=self.t("analyzer_content.page_404.issues.no_custom_details"),
                recommendation=self.t("analyzer_content.page_404.issues.no_custom_recommendation"),
            ))

        if has_custom_404 and not has_navigation:
            issues.append(self.create_issue(
                category="404_no_navigation",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.page_404.issues.no_navigation"),
                details=self.t("analyzer_content.page_404.issues.no_navigation_details"),
                recommendation=self.t("analyzer_content.page_404.issues.no_navigation_recommendation"),
            ))

        if has_custom_404 and not has_home_link:
            issues.append(self.create_issue(
                category="404_no_home_link",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.page_404.issues.no_home_link"),
                details=self.t("analyzer_content.page_404.issues.no_home_link_details"),
                recommendation=self.t("analyzer_content.page_404.issues.no_home_link_recommendation"),
            ))

        if has_custom_404 and not has_search:
            issues.append(self.create_issue(
                category="404_no_search",
                severity=SeverityLevel.INFO,
                message=self.t("analyzer_content.page_404.issues.no_search"),
                details=self.t("analyzer_content.page_404.issues.no_search_details"),
                recommendation=self.t("analyzer_content.page_404.issues.no_search_recommendation"),
            ))

        # Summary
        if returns_404_status and has_custom_404 and has_navigation:
            summary = self.t("analyzer_content.page_404.summary.ok")
            severity = SeverityLevel.SUCCESS
        elif not returns_404_status or not has_custom_404:
            summary = self.t("analyzer_content.page_404.summary.needs_fix")
            severity = SeverityLevel.ERROR
        else:
            summary = self.t("analyzer_content.page_404.summary.needs_improvement")
            severity = SeverityLevel.WARNING

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "test_url": test_url,
                "returns_404_status": returns_404_status,
                "has_custom_404": has_custom_404,
                "has_navigation": has_navigation,
                "has_search": has_search,
                "has_home_link": has_home_link,
            },
        )
