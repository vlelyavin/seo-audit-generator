"""Blog and FAQ sections detection analyzer."""

import re
from typing import Any, Dict, List, Set
from urllib.parse import urlparse

from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class ContentSectionsAnalyzer(BaseAnalyzer):
    """Analyzer for detecting blog, news, FAQ and help sections."""

    name = "content_sections"
    display_name = "Інформаційні розділи"
    description = "Виявлення блогу, новин, FAQ та довідкових розділів сайту."
    icon = "📰"
    theory = """<strong>Інформаційні розділи</strong> — це сторінки з корисним контентом для користувачів.

<strong>Типи інформаційних розділів:</strong>
• <strong>Блог/Новини</strong> — статті, оновлення, експертний контент
• <strong>FAQ</strong> — часті запитання та відповіді
• <strong>База знань/Довідка</strong> — документація, інструкції

<strong>Вплив на SEO:</strong>
• Інформаційний контент привертає органічний трафік
• Блог дозволяє таргетувати long-tail ключові слова
• FAQ може з'являтися у rich snippets Google
• Регулярні оновлення сигналізують про активність сайту

<strong>Рекомендації для блогу:</strong>
• Публікуйте регулярно (мінімум 2-4 статті на місяць)
• Використовуйте категорії та теги
• Додавайте дати публікації
• Оптимізуйте кожну статтю під конкретні ключові слова

<strong>Рекомендації для FAQ:</strong>
• Використовуйте Schema.org FAQPage розмітку
• Структуруйте питання в логічні групи
• Давайте повні, корисні відповіді
• Оновлюйте відповіді при змінах"""

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
                message=f"Виявлено блог/новини: {len(blog_pages)} сторінок",
                details="Наявність блогу допомагає залучати органічний трафік.",
                affected_urls=blog_pages[:10],
                count=len(blog_pages),
            ))

            # Check blog quality indicators
            missing_features = []
            if not blog_indicators['has_dates']:
                missing_features.append("дати публікації")
            if not blog_indicators['has_categories']:
                missing_features.append("категорії")
            if not blog_indicators['has_author']:
                missing_features.append("автор")

            if missing_features:
                issues.append(self.create_issue(
                    category="blog_missing_features",
                    severity=SeverityLevel.INFO,
                    message=f"Блог: відсутні елементи: {', '.join(missing_features)}",
                    details="Ці елементи покращують SEO та користувацький досвід блогу.",
                    recommendation="Додайте відсутні елементи до сторінок блогу.",
                ))
        else:
            issues.append(self.create_issue(
                category="no_blog",
                severity=SeverityLevel.INFO,
                message="Блог/новини не виявлено",
                details="Інформаційний контент допомагає залучати органічний трафік та будувати експертність.",
                recommendation="Розгляньте створення блогу з корисними статтями для вашої аудиторії.",
            ))

        if has_faq:
            faq_count = len(set(faq_pages + pages_with_faq_structure))
            issues.append(self.create_issue(
                category="faq_detected",
                severity=SeverityLevel.SUCCESS,
                message=f"Виявлено FAQ/довідку: {faq_count} сторінок",
                details="FAQ допомагає користувачам знаходити відповіді та може з'являтися в rich snippets.",
                affected_urls=list(set(faq_pages + pages_with_faq_structure))[:10],
                count=faq_count,
            ))

            # Check for FAQ schema
            if not pages_with_schema_faq:
                issues.append(self.create_issue(
                    category="faq_no_schema",
                    severity=SeverityLevel.WARNING,
                    message="FAQ без Schema.org розмітки",
                    details="Розмітка FAQPage дозволяє відображати FAQ у результатах пошуку Google.",
                    recommendation="Додайте Schema.org FAQPage розмітку до сторінок з FAQ.",
                ))
            else:
                issues.append(self.create_issue(
                    category="faq_has_schema",
                    severity=SeverityLevel.SUCCESS,
                    message=f"FAQ з Schema.org розміткою: {len(pages_with_schema_faq)} сторінок",
                    details="FAQ може з'являтися у rich snippets Google.",
                    affected_urls=pages_with_schema_faq[:5],
                ))
        else:
            issues.append(self.create_issue(
                category="no_faq",
                severity=SeverityLevel.INFO,
                message="FAQ не виявлено",
                details="Розділ FAQ допомагає відповідати на часті питання користувачів.",
                recommendation="Розгляньте створення розділу FAQ з розміткою Schema.org.",
            ))

        # Create summary table
        table_data = [
            {
                "Розділ": "Блог/Новини",
                "Статус": "✓ Є" if has_blog else "✗ Немає",
                "Кількість": len(blog_pages) if has_blog else 0,
            },
            {
                "Розділ": "FAQ/Довідка",
                "Статус": "✓ Є" if has_faq else "✗ Немає",
                "Кількість": len(set(faq_pages + pages_with_faq_structure)) if has_faq else 0,
            },
            {
                "Розділ": "FAQ Schema.org",
                "Статус": "✓ Є" if pages_with_schema_faq else "✗ Немає",
                "Кількість": len(pages_with_schema_faq),
            },
        ]

        tables.append({
            "title": "Інформаційні розділи",
            "headers": ["Розділ", "Статус", "Кількість"],
            "rows": table_data,
        })

        # Summary
        found_sections = []
        if has_blog:
            found_sections.append(f"блог ({len(blog_pages)})")
        if has_faq:
            found_sections.append(f"FAQ ({len(set(faq_pages + pages_with_faq_structure))})")

        if found_sections:
            summary = f"Виявлено: {', '.join(found_sections)}"
            severity = SeverityLevel.SUCCESS
        else:
            summary = "Інформаційні розділи не виявлено"
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
