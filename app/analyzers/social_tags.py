"""Social meta tags (Open Graph & Twitter Cards) analyzer."""

from typing import Any, Dict, List

from bs4 import BeautifulSoup

from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class SocialTagsAnalyzer(BaseAnalyzer):
    """Analyzer for Open Graph and Twitter Card meta tags."""

    name = "social_tags"
    icon = ""

    def __init__(self):
        super().__init__()

    @property
    def display_name(self) -> str:
        return self.t("analyzers.social_tags.name")

    @property
    def description(self) -> str:
        return self.t("analyzers.social_tags.description")

    @property
    def theory(self) -> str:
        return self.t("analyzer_content.social_tags.theory")

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []
        tables: List[Dict[str, Any]] = []

        pages_with_og: List[str] = []
        pages_without_og: List[str] = []
        pages_with_og_image: List[str] = []
        pages_without_og_image: List[str] = []
        pages_with_og_description: List[str] = []
        pages_without_og_description: List[str] = []
        pages_with_twitter: List[str] = []
        pages_without_twitter: List[str] = []

        total_pages = 0
        page_tag_status: List[Dict[str, str]] = []

        for url, page in pages.items():
            if page.status_code != 200 or not page.html_content:
                continue

            total_pages += 1
            soup = page.get_soup()
            if soup is None:
                continue

            # Check Open Graph tags
            og_title = soup.find('meta', attrs={'property': 'og:title'})
            og_description = soup.find('meta', attrs={'property': 'og:description'})
            og_image = soup.find('meta', attrs={'property': 'og:image'})
            og_url = soup.find('meta', attrs={'property': 'og:url'})
            og_type = soup.find('meta', attrs={'property': 'og:type'})

            has_og = bool(og_title)
            has_og_image = bool(og_image and og_image.get('content', '').strip())
            has_og_desc = bool(og_description and og_description.get('content', '').strip())

            # Check Twitter Card tags
            twitter_card = soup.find('meta', attrs={'name': 'twitter:card'})
            twitter_title = soup.find('meta', attrs={'name': 'twitter:title'})
            twitter_description = soup.find('meta', attrs={'name': 'twitter:description'})
            twitter_image = soup.find('meta', attrs={'name': 'twitter:image'})

            has_twitter = bool(twitter_card)

            # Track pages
            if has_og:
                pages_with_og.append(url)
            else:
                pages_without_og.append(url)

            if has_og_image:
                pages_with_og_image.append(url)
            elif has_og:
                pages_without_og_image.append(url)

            if has_og_desc:
                pages_with_og_description.append(url)
            elif has_og:
                pages_without_og_description.append(url)

            if has_twitter:
                pages_with_twitter.append(url)
            else:
                pages_without_twitter.append(url)

            # Collect table data
            page_tag_status.append({
                "URL": url,
                "og:title": "\u2713" if has_og else "\u2717",
                "og:image": "\u2713" if has_og_image else "\u2717",
                "twitter:card": "\u2713" if has_twitter else "\u2717",
            })

        # Create issues
        if total_pages > 0 and len(pages_with_og) == total_pages:
            issues.append(self.create_issue(
                category="og_tags_ok",
                severity=SeverityLevel.SUCCESS,
                message=self.t("analyzer_content.social_tags.issues.og_tags_ok", count=total_pages),
                details=self.t("analyzer_content.social_tags.details.og_tags_ok"),
                recommendation=self.t("analyzer_content.social_tags.recommendations.og_tags_ok"),
                count=total_pages,
            ))
        elif pages_without_og:
            issues.append(self.create_issue(
                category="missing_og_tags",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.social_tags.issues.missing_og_tags", count=len(pages_without_og)),
                details=self.t("analyzer_content.social_tags.details.missing_og_tags"),
                affected_urls=pages_without_og[:20],
                recommendation=self.t("analyzer_content.social_tags.recommendations.missing_og_tags"),
                count=len(pages_without_og),
            ))

        if pages_without_og_image:
            issues.append(self.create_issue(
                category="missing_og_image",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.social_tags.issues.missing_og_image", count=len(pages_without_og_image)),
                details=self.t("analyzer_content.social_tags.details.missing_og_image"),
                affected_urls=pages_without_og_image[:20],
                recommendation=self.t("analyzer_content.social_tags.recommendations.missing_og_image"),
                count=len(pages_without_og_image),
            ))

        if pages_without_og_description:
            issues.append(self.create_issue(
                category="missing_og_description",
                severity=SeverityLevel.INFO,
                message=self.t("analyzer_content.social_tags.issues.missing_og_description", count=len(pages_without_og_description)),
                details=self.t("analyzer_content.social_tags.details.missing_og_description"),
                affected_urls=pages_without_og_description[:20],
                recommendation=self.t("analyzer_content.social_tags.recommendations.missing_og_description"),
                count=len(pages_without_og_description),
            ))

        if pages_without_twitter:
            issues.append(self.create_issue(
                category="missing_twitter_card",
                severity=SeverityLevel.INFO,
                message=self.t("analyzer_content.social_tags.issues.missing_twitter_card", count=len(pages_without_twitter)),
                details=self.t("analyzer_content.social_tags.details.missing_twitter_card"),
                affected_urls=pages_without_twitter[:20],
                recommendation=self.t("analyzer_content.social_tags.recommendations.missing_twitter_card"),
                count=len(pages_without_twitter),
            ))

        # Create table with tag status per page
        if page_tag_status:
            tables.append({
                "title": self.t("table_translations.titles.Social Tags Status"),
                "headers": ["URL", "og:title", "og:image", "twitter:card"],
                "rows": page_tag_status[:10],
            })

        # Summary
        num_og = len(pages_with_og)
        num_twitter = len(pages_with_twitter)

        if total_pages == 0:
            summary = self.t("analyzer_content.social_tags.summary.no_pages")
        else:
            summary = self.t("analyzer_content.social_tags.summary.stats",
                           og=num_og,
                           twitter=num_twitter,
                           total=total_pages,
                           total2=total_pages)

        severity = self._determine_overall_severity(issues)

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "total_pages": total_pages,
                "pages_with_og": len(pages_with_og),
                "pages_without_og": len(pages_without_og),
                "pages_with_og_image": len(pages_with_og_image),
                "pages_without_og_image": len(pages_without_og_image),
                "pages_with_twitter": len(pages_with_twitter),
                "pages_without_twitter": len(pages_without_twitter),
            },
            tables=tables,
        )
