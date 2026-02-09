"""Links analyzer (broken links check)."""

import asyncio
from typing import Any, Dict, List, Set

from ..config import settings
from ..crawler import check_url_status
from ..models import AnalyzerResult, AuditIssue, LinkData, PageData, SeverityLevel
from .base import BaseAnalyzer


class LinksAnalyzer(BaseAnalyzer):
    """Analyzer for broken internal and external links."""

    name = "links"
    display_name = "Биті посилання"
    description = "Биті посилання погіршують користувацький досвід та можуть негативно впливати на SEO."
    icon = "🔗"
    theory = """<strong>Биті посилання (Broken Links)</strong> — це посилання, які ведуть на неіснуючі сторінки (помилка 404) або недоступні ресурси.

<strong>Вплив на SEO:</strong>
• Пошукові боти витрачають краулінговий бюджет на биті посилання
• Погіршується користувацький досвід (UX)
• Втрачається "посилковий сік" (link juice), який передається через посилання
• Може сигналізувати про занедбаність сайту

<strong>Типи битих посилань:</strong>
• <strong>Внутрішні</strong> — посилання на неіснуючі сторінки вашого сайту
• <strong>Зовнішні</strong> — посилання на видалені або переміщені сторінки інших сайтів

<strong>Причини появи:</strong>
• Видалення або переміщення сторінок без редіректів
• Помилки в URL при створенні посилань
• Зміна структури сайту
• Закриття зовнішніх ресурсів

<strong>Як виправити:</strong>
• Для внутрішніх: відновіть сторінку або налаштуйте 301 редірект
• Для зовнішніх: оновіть посилання або видаліть його
• Регулярно перевіряйте сайт на биті посилання"""

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []
        tables: List[Dict[str, Any]] = []

        # Collect all internal and external links
        internal_links: Dict[str, List[str]] = {}  # link -> source pages
        external_links: Dict[str, Dict[str, Any]] = {}  # link -> {data, pages}

        for url, page in pages.items():
            if page.status_code != 200:
                continue

            # Internal links
            for link in page.internal_links:
                if link not in internal_links:
                    internal_links[link] = []
                internal_links[link].append(url)

            # External links
            for link_data in page.external_links:
                href = link_data.href
                if href not in external_links:
                    external_links[href] = {
                        'data': link_data,
                        'pages': [],
                    }
                external_links[href]['pages'].append(url)

        # Check internal links status
        broken_internal: List[Dict[str, Any]] = []

        for link, source_pages in internal_links.items():
            # Check if page was crawled
            if link in pages:
                status = pages[link].status_code
            else:
                # Page wasn't crawled, check its status
                status = await check_url_status(link)

            if status >= 400 or status == 0:
                broken_internal.append({
                    'url': link,
                    'status': status,
                    'source_pages': source_pages[:5],
                })

        # Check external links (limited)
        broken_external: List[Dict[str, Any]] = []
        external_to_check = list(external_links.keys())[:settings.MAX_EXTERNAL_LINKS]

        async def check_external(url: str) -> tuple[str, int]:
            status = await check_url_status(url, timeout=5)
            return url, status

        # Check external links concurrently (in batches of 20)
        batch_size = 20
        for i in range(0, len(external_to_check), batch_size):
            batch = external_to_check[i:i + batch_size]
            tasks = [check_external(url) for url in batch]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for result in results:
                if isinstance(result, tuple):
                    url, status = result
                    if status >= 400 or status == 0:
                        broken_external.append({
                            'url': url,
                            'status': status,
                            'source_pages': external_links[url]['pages'][:5],
                        })

        # Create issues for broken internal links
        if broken_internal:
            issues.append(self.create_issue(
                category="broken_internal",
                severity=SeverityLevel.ERROR,
                message=f"Биті внутрішні посилання: {len(broken_internal)} шт.",
                details="Внутрішні посилання на неіснуючі сторінки шкодять SEO та користувацькому досвіду.",
                affected_urls=[link['url'] for link in broken_internal[:20]],
                recommendation="Виправте або видаліть биті посилання. Налаштуйте редиректи для видалених сторінок.",
                count=len(broken_internal),
            ))

        # Create issues for broken external links
        if broken_external:
            issues.append(self.create_issue(
                category="broken_external",
                severity=SeverityLevel.WARNING,
                message=f"Биті зовнішні посилання: {len(broken_external)} шт.",
                details="Посилання на неіснуючі зовнішні ресурси можуть розчарувати користувачів.",
                affected_urls=[link['url'] for link in broken_external[:20]],
                recommendation="Оновіть або видаліть биті зовнішні посилання.",
                count=len(broken_external),
            ))

        # Create table with broken links
        table_data = []

        for link in broken_internal[:15]:
            status_text = f"{link['status']}" if link['status'] > 0 else "Timeout/Error"
            table_data.append({
                "Тип": "Внутрішнє",
                "Посилання": link['url'][:60] + "..." if len(link['url']) > 60 else link['url'],
                "Статус": status_text,
                "Знайдено на": link['source_pages'][0] if link['source_pages'] else "-",
            })

        for link in broken_external[:10]:
            status_text = f"{link['status']}" if link['status'] > 0 else "Timeout/Error"
            table_data.append({
                "Тип": "Зовнішнє",
                "Посилання": link['url'][:60] + "..." if len(link['url']) > 60 else link['url'],
                "Статус": status_text,
                "Знайдено на": link['source_pages'][0] if link['source_pages'] else "-",
            })

        if table_data:
            tables.append({
                "title": "Биті посилання",
                "headers": ["Тип", "Посилання", "Статус", "Знайдено на"],
                "rows": table_data,
            })

        # Summary
        total_internal = len(internal_links)
        total_external = len(external_links)

        if not issues:
            summary = f"Перевірено {total_internal} внутрішніх та {total_external} зовнішніх посилань. Проблем не знайдено."
        else:
            parts = []
            if broken_internal:
                parts.append(f"внутрішніх: {len(broken_internal)}")
            if broken_external:
                parts.append(f"зовнішніх: {len(broken_external)}")
            summary = f"Знайдено битих посилань: {', '.join(parts)}"

        severity = self._determine_overall_severity(issues)

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "total_internal_links": total_internal,
                "total_external_links": total_external,
                "broken_internal": len(broken_internal),
                "broken_external": len(broken_external),
                "external_checked": len(external_to_check),
            },
            tables=tables,
        )
