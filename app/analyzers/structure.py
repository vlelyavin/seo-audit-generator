"""Site structure analyzer."""

from collections import defaultdict
from typing import Any, Dict, List, Set

from ..config import settings
from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class StructureAnalyzer(BaseAnalyzer):
    """Analyzer for site structure (depth, orphan pages, internal linking)."""

    name = "structure"
    display_name = "Структура сайту"
    description = "Правильна структура сайту забезпечує ефективну індексацію та хороший користувацький досвід."
    icon = "🏗️"
    theory = """<strong>Структура сайту</strong> — організація сторінок та зв'язків між ними.

<strong>Глибина вкладеності (Click Depth):</strong>
• Показує скільки кліків потрібно від головної до сторінки
• Ідеально: важливі сторінки на глибині 1-3 кліки
• Сторінки на глибині 4+ гірше індексуються

<strong>Сирітські сторінки (Orphan Pages):</strong>
• Сторінки без жодного внутрішнього посилання
• Пошукові роботи можуть їх не знайти
• Часто виникають через видалення посилань або помилки

<strong>Внутрішня перелінковка:</strong>
• Розподіляє PageRank між сторінками
• Допомагає користувачам знаходити контент
• Показує пошуковим системам важливість сторінок

<strong>Типи структур:</strong>
• <strong>Плоска</strong> — всі сторінки на 1-2 кліки від головної
• <strong>Ієрархічна</strong> — категорії → підкатегорії → сторінки
• <strong>Змішана</strong> — комбінація обох підходів

<strong>Рекомендації:</strong>
• Використовуйте "хлібні крихти" (breadcrumbs)
• Додайте внутрішні посилання у контент
• Створіть карту сайту для користувачів
• Перевіряйте на сирітські сторінки регулярно
• Важливі сторінки мають бути на глибині ≤3"""

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []
        tables: List[Dict[str, Any]] = []

        # Analyze page depths
        depth_distribution: Dict[int, List[str]] = defaultdict(list)
        deep_pages = []  # Pages with depth > MAX_CLICK_DEPTH

        # Build link graph for orphan page detection
        pages_with_incoming_links: Set[str] = set()

        for url, page in pages.items():
            if page.status_code != 200:
                continue

            depth_distribution[page.depth].append(url)

            if page.depth > settings.MAX_CLICK_DEPTH:
                deep_pages.append((url, page.depth))

            # Track pages that have incoming links
            for link in page.internal_links:
                pages_with_incoming_links.add(link)

        # Find orphan pages (no incoming internal links except homepage)
        orphan_pages = []
        for url, page in pages.items():
            if page.status_code != 200:
                continue

            # Skip homepage
            if url == base_url or url == base_url + "/":
                continue

            if url not in pages_with_incoming_links:
                orphan_pages.append(url)

        # Analyze internal linking
        pages_with_few_links = []
        pages_with_many_links = []

        for url, page in pages.items():
            if page.status_code != 200:
                continue

            link_count = len(page.internal_links)

            if link_count == 0:
                pages_with_few_links.append((url, 0))
            elif link_count < 3:
                pages_with_few_links.append((url, link_count))

        # Calculate statistics
        total_pages = len([p for p in pages.values() if p.status_code == 200])
        max_depth = max(depth_distribution.keys()) if depth_distribution else 0

        # Create issues
        if deep_pages:
            deep_pages.sort(key=lambda x: x[1], reverse=True)
            issues.append(self.create_issue(
                category="deep_pages",
                severity=SeverityLevel.WARNING,
                message=f"Глибоко вкладені сторінки: {len(deep_pages)} шт.",
                details=f"Ці сторінки знаходяться на глибині більше {settings.MAX_CLICK_DEPTH} кліків від головної. "
                        "Це ускладнює їх знаходження для користувачів та пошукових систем.",
                affected_urls=[url for url, _ in deep_pages[:20]],
                recommendation="Перегляньте структуру навігації та додайте посилання на ці сторінки ближче до головної.",
                count=len(deep_pages),
            ))

        if orphan_pages:
            issues.append(self.create_issue(
                category="orphan_pages",
                severity=SeverityLevel.WARNING,
                message=f"Сирітські сторінки (без вхідних посилань): {len(orphan_pages)} шт.",
                details="На ці сторінки немає посилань з інших сторінок сайту. Пошуковим системам буде складно їх знайти.",
                affected_urls=orphan_pages[:20],
                recommendation="Додайте внутрішні посилання на ці сторінки з релевантних розділів сайту.",
                count=len(orphan_pages),
            ))

        if pages_with_few_links:
            issues.append(self.create_issue(
                category="few_internal_links",
                severity=SeverityLevel.INFO,
                message=f"Сторінки з малою кількістю посилань: {len(pages_with_few_links)} шт.",
                details="Сторінки з малою кількістю внутрішніх посилань можуть мати менший вплив на навігацію.",
                affected_urls=[url for url, _ in pages_with_few_links[:20]],
                recommendation="Розгляньте можливість додавання посилань на пов'язані сторінки.",
                count=len(pages_with_few_links),
            ))

        if max_depth > 5:
            issues.append(self.create_issue(
                category="very_deep_structure",
                severity=SeverityLevel.ERROR,
                message=f"Надто глибока структура сайту (максимум {max_depth} рівнів)",
                details="Пошукові системи можуть не індексувати сторінки на великій глибині.",
                recommendation="Перебудуйте структуру сайту, щоб всі важливі сторінки були доступні за 3-4 кліки.",
            ))

        # Create table with depth distribution
        table_data = []

        for depth in sorted(depth_distribution.keys()):
            urls = depth_distribution[depth]
            status = "✓" if depth <= settings.MAX_CLICK_DEPTH else "⚠️"
            table_data.append({
                "Глибина": f"{depth} {status}",
                "Кількість сторінок": len(urls),
                "Приклад": urls[0][:50] + "..." if urls and len(urls[0]) > 50 else (urls[0] if urls else "-"),
            })

        if table_data:
            tables.append({
                "title": "Розподіл сторінок за глибиною",
                "headers": ["Глибина", "Кількість сторінок", "Приклад"],
                "rows": table_data,
            })

        # Add orphan pages table if any
        if orphan_pages:
            orphan_table = []
            for url in orphan_pages[:15]:
                page = pages.get(url)
                title = page.title[:40] + "..." if page and page.title and len(page.title) > 40 else (page.title if page else "-")
                orphan_table.append({
                    "URL": url[:60] + "..." if len(url) > 60 else url,
                    "Title": title,
                })
            tables.append({
                "title": "Сирітські сторінки",
                "headers": ["URL", "Title"],
                "rows": orphan_table,
            })

        # Summary
        if not issues:
            summary = f"Структура сайту оптимальна. Максимальна глибина: {max_depth} рівнів."
        else:
            parts = []
            if deep_pages:
                parts.append(f"глибоких сторінок: {len(deep_pages)}")
            if orphan_pages:
                parts.append(f"сирітських: {len(orphan_pages)}")
            summary = f"Максимальна глибина: {max_depth}. Проблеми: {', '.join(parts)}"

        severity = self._determine_overall_severity(issues)

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "total_pages": total_pages,
                "max_depth": max_depth,
                "depth_distribution": {k: len(v) for k, v in depth_distribution.items()},
                "deep_pages": len(deep_pages),
                "orphan_pages": len(orphan_pages),
                "pages_with_few_links": len(pages_with_few_links),
            },
            tables=tables,
        )
