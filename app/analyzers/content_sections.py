"""Blog and FAQ sections detection analyzer."""

import re
from typing import Any, Dict, List, Set
from urllib.parse import urlparse

from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class ContentSectionsAnalyzer(BaseAnalyzer):
    """Analyzer for detecting blog, news, FAQ and help sections."""

    name = "content_sections"
    icon = ""

    def __init__(self):
        super().__init__()

    @property
    def display_name(self) -> str:
        return self.t("analyzers.content_sections.name")

    @property
    def description(self) -> str:
        return self.t("analyzers.content_sections.description")

    @property
    def theory(self) -> str:
        return self.t("analyzer_content.content_sections.theory")

    # URL patterns for different content types
    BLOG_PATTERNS = [
        r'/blog/',
        r'/news/',
        r'/articles/',
        r'/posts/',
        r'/magazine/',
        r'/journal/',
        r'/novyny/',
        r'/statti/',
        r'/novosti/',
        r'/stati/',
    ]

    FAQ_PATTERNS = [
        r'/faq/',
        r'/help/',
        r'/support/',
        r'/questions/',
        r'/knowledgebase/',
        r'/kb/',
        r'/dopomoha/',
        r'/pytannya/',
        r'/pomoshch/',
        r'/voprosy/',
    ]

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []
        tables: List[Dict[str, Any]] = []

        # Detect content sections
        blog_pages: List[str] = []
        faq_pages: List[str] = []
        pages_with_faq_structure: List[str] = []
        pages_with_schema_faq: List[str] = []

        blog_indicators = {
            'has_dates': False,
            'has_categories': False,
            'has_tags': False,
            'has_author': False,
        }

        for url, page in pages.items():
            if page.status_code != 200:
                continue

            url_lower = url.lower()

            # Check URL patterns for blog
            for pattern in self.BLOG_PATTERNS:
                if re.search(pattern, url_lower):
                    blog_pages.append(url)
                    break

            # Check URL patterns for FAQ
            for pattern in self.FAQ_PATTERNS:
                if re.search(pattern, url_lower):
                    faq_pages.append(url)
                    break

            # Analyze HTML content for blog indicators
            if page.html_content:
                html = page.html_content.lower()

                # Check for FAQ structure
                has_details = '<details' in html
                has_summary = '<summary' in html
                has_faq_schema = 'faqpage' in html or '"@type":"faq' in html.replace(' ', '')

                if has_details and has_summary:
                    pages_with_faq_structure.append(url)

                if has_faq_schema:
                    pages_with_schema_faq.append(url)

                # Check for blog indicators (only if this is a blog page)
                if url in blog_pages:
                    # Date patterns
                    date_patterns = [
                        r'\d{1,2}[./]\d{1,2}[./]\d{2,4}',
                        r'\d{4}-\d{2}-\d{2}',
                        r'(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)',
                        r'(january|february|march|april|may|june|july|august|september|october|november|december)',
                    ]
                    for pattern in date_patterns:
                        if re.search(pattern, html, re.IGNORECASE):
                            blog_indicators['has_dates'] = True
                            break

                    # Category/tag patterns
                    if re.search(r'(categor|катего|рубрик)', html):
                        blog_indicators['has_categories'] = True
                    if re.search(r'(tag|тег|мітк)', html):
                        blog_indicators['has_tags'] = True
                    if re.search(r'(author|автор)', html):
                        blog_indicators['has_author'] = True

        # Create issues
        has_blog = len(blog_pages) > 0
        has_faq = len(faq_pages) > 0 or len(pages_with_faq_structure) > 0

        if has_blog:
            issues.append(self.create_issue(
                category="blog_detected",
                severity=SeverityLevel.SUCCESS,
                message=self.t("analyzer_content.content_sections.issues.blog_detected", count=len(blog_pages)),
                details=self.t("analyzer_content.content_sections.details.blog_detected"),
                affected_urls=blog_pages[:10],
                count=len(blog_pages),
            ))

            # Check blog quality indicators
            missing_features = []
            if not blog_indicators['has_dates']:
                missing_features.append("dates")
            if not blog_indicators['has_categories']:
                missing_features.append("categories")
            if not blog_indicators['has_author']:
                missing_features.append("author")

            if missing_features:
                issues.append(self.create_issue(
                    category="blog_missing_features",
                    severity=SeverityLevel.INFO,
                    message=self.t("analyzer_content.content_sections.issues.blog_missing_features"),
                    details=self.t("analyzer_content.content_sections.details.blog_missing_features"),
                    recommendation=self.t("analyzer_content.content_sections.recommendations.blog_missing_features"),
                ))
        else:
            issues.append(self.create_issue(
                category="no_blog",
                severity=SeverityLevel.INFO,
                message=self.t("analyzer_content.content_sections.issues.no_blog"),
                details=self.t("analyzer_content.content_sections.details.no_blog"),
                recommendation=self.t("analyzer_content.content_sections.recommendations.no_blog"),
            ))

        if has_faq:
            faq_count = len(set(faq_pages + pages_with_faq_structure))
            issues.append(self.create_issue(
                category="faq_detected",
                severity=SeverityLevel.SUCCESS,
                message=self.t("analyzer_content.content_sections.issues.faq_detected", count=faq_count),
                details=self.t("analyzer_content.content_sections.details.faq_detected"),
                affected_urls=list(set(faq_pages + pages_with_faq_structure))[:10],
                count=faq_count,
            ))

            # Check for FAQ schema
            if not pages_with_schema_faq:
                issues.append(self.create_issue(
                    category="faq_no_schema",
                    severity=SeverityLevel.WARNING,
                    message=self.t("analyzer_content.content_sections.issues.faq_no_schema"),
                    details=self.t("analyzer_content.content_sections.details.faq_no_schema"),
                    recommendation=self.t("analyzer_content.content_sections.recommendations.faq_no_schema"),
                ))
            else:
                issues.append(self.create_issue(
                    category="faq_has_schema",
                    severity=SeverityLevel.SUCCESS,
                    message=self.t("analyzer_content.content_sections.issues.faq_has_schema", count=len(pages_with_schema_faq)),
                    details=self.t("analyzer_content.content_sections.details.faq_has_schema"),
                    affected_urls=pages_with_schema_faq[:5],
                ))
        else:
            issues.append(self.create_issue(
                category="no_faq",
                severity=SeverityLevel.INFO,
                message=self.t("analyzer_content.content_sections.issues.no_faq"),
                details=self.t("analyzer_content.content_sections.details.no_faq"),
                recommendation=self.t("analyzer_content.content_sections.recommendations.no_faq"),
            ))

        # Create summary table
        h_section = self.t("tables.element")
        h_status = self.t("tables.status")
        h_count = self.t("tables.count")

        table_data = [
            {
                h_section: "Blog/News",
                h_status: "✓" if has_blog else "✗",
                h_count: len(blog_pages) if has_blog else 0,
            },
            {
                h_section: "FAQ",
                h_status: "✓" if has_faq else "✗",
                h_count: len(set(faq_pages + pages_with_faq_structure)) if has_faq else 0,
            },
            {
                h_section: "FAQ Schema",
                h_status: "✓" if pages_with_schema_faq else "✗",
                h_count: len(pages_with_schema_faq),
            },
        ]

        tables.append({
            "title": self.t("table_translations.titles.Informational Sections"),
            "headers": [h_section, h_status, h_count],
            "rows": table_data,
        })

        # Summary
        found_sections = []
        if has_blog:
            found_sections.append(f"Blog ({len(blog_pages)} pages)")
        if has_faq:
            found_sections.append(f"FAQ ({len(set(faq_pages + pages_with_faq_structure))} pages)")

        if found_sections:
            summary = self.t("analyzer_content.content_sections.summary.detected", sections=", ".join(found_sections))
            severity = SeverityLevel.SUCCESS
        else:
            summary = self.t("analyzer_content.content_sections.summary.not_detected")
            severity = SeverityLevel.INFO

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "has_blog": has_blog,
                "blog_pages_count": len(blog_pages),
                "blog_pages": blog_pages[:20],
                "blog_indicators": blog_indicators,
                "has_faq": has_faq,
                "faq_pages_count": len(faq_pages),
                "faq_pages": faq_pages[:20],
                "pages_with_faq_structure": len(pages_with_faq_structure),
                "pages_with_schema_faq": len(pages_with_schema_faq),
            },
            tables=tables,
        )
