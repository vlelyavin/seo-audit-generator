"""Meta tags analyzer."""

from collections import Counter
from typing import Any, Dict, List

from ..config import settings
from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class MetaTagsAnalyzer(BaseAnalyzer):
    """Analyzer for meta tags (title, description)."""

    name = "meta_tags"
    display_name = "Мета-теги"
    description = "Мета-теги Title та Description впливають на ранжування та клікабельність у пошуковій видачі."
    icon = "🏷️"
    theory = """<strong>Title (заголовок сторінки)</strong> — це HTML-тег, який відображається в результатах пошуку як заголовок сніпету. Він є одним з найважливіших факторів ранжування.

<strong>Оптимальна довжина:</strong> 50-60 символів. Google відображає приблизно 600 пікселів (близько 60 символів). Занадто короткі заголовки не використовують весь потенціал, занадто довгі — обрізаються.

<strong>Рекомендації:</strong>
• Кожна сторінка повинна мати унікальний Title
• Включайте основне ключове слово на початку
• Робіть заголовок привабливим для кліку

<strong>Description (мета-опис)</strong> — HTML-тег, який відображається під заголовком у пошуковій видачі. Не впливає напряму на ранжування, але впливає на CTR (клікабельність).

<strong>Оптимальна довжина:</strong> 150-160 символів. Google відображає приблизно 920 пікселів для десктопу.

<strong>Рекомендації:</strong>
• Опишіть зміст сторінки стисло та інформативно
• Включіть заклик до дії (CTA)
• Використовуйте ключові слова природно"""

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
                message=f"Відсутній Title: {len(missing_titles)} сторінок",
                details="Title є важливим фактором ранжування. Кожна сторінка повинна мати унікальний Title.",
                affected_urls=missing_titles[:20],
                recommendation="Додайте унікальний тег <title> для кожної сторінки.",
                count=len(missing_titles),
            ))

        # Create issues for missing descriptions
        if missing_descriptions:
            issues.append(self.create_issue(
                category="missing_description",
                severity=SeverityLevel.ERROR,
                message=f"Відсутній Description: {len(missing_descriptions)} сторінок",
                details="Meta Description впливає на клікабельність у пошуковій видачі.",
                affected_urls=missing_descriptions[:20],
                recommendation="Додайте унікальний мета-тег description для кожної сторінки.",
                count=len(missing_descriptions),
            ))

        # Create issues for short titles
        if short_titles:
            issues.append(self.create_issue(
                category="short_title",
                severity=SeverityLevel.WARNING,
                message=f"Занадто короткий Title: {len(short_titles)} сторінок",
                details=f"Оптимальна довжина Title: {settings.TITLE_MIN_LENGTH}-{settings.TITLE_MAX_LENGTH} символів.",
                affected_urls=[url for url, _, _ in short_titles[:20]],
                recommendation="Розширте Title, включивши більше ключових слів.",
                count=len(short_titles),
            ))

        # Create issues for long titles
        if long_titles:
            issues.append(self.create_issue(
                category="long_title",
                severity=SeverityLevel.WARNING,
                message=f"Занадто довгий Title: {len(long_titles)} сторінок",
                details=f"Оптимальна довжина Title: {settings.TITLE_MIN_LENGTH}-{settings.TITLE_MAX_LENGTH} символів. Довший Title буде обрізаний у видачі.",
                affected_urls=[url for url, _, _ in long_titles[:20]],
                recommendation="Скоротіть Title до 60 символів.",
                count=len(long_titles),
            ))

        # Create issues for short descriptions
        if short_descriptions:
            issues.append(self.create_issue(
                category="short_description",
                severity=SeverityLevel.WARNING,
                message=f"Занадто короткий Description: {len(short_descriptions)} сторінок",
                details=f"Оптимальна довжина Description: {settings.DESCRIPTION_MIN_LENGTH}-{settings.DESCRIPTION_MAX_LENGTH} символів.",
                affected_urls=[url for url, _, _ in short_descriptions[:20]],
                recommendation="Розширте Description, описавши вміст сторінки детальніше.",
                count=len(short_descriptions),
            ))

        # Create issues for long descriptions
        if long_descriptions:
            issues.append(self.create_issue(
                category="long_description",
                severity=SeverityLevel.WARNING,
                message=f"Занадто довгий Description: {len(long_descriptions)} сторінок",
                details=f"Оптимальна довжина Description: {settings.DESCRIPTION_MIN_LENGTH}-{settings.DESCRIPTION_MAX_LENGTH} символів.",
                affected_urls=[url for url, _, _ in long_descriptions[:20]],
                recommendation="Скоротіть Description до 160 символів.",
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
                message=f"Дублі Title: {len(duplicate_titles)} груп дублікатів",
                details="Дублі Title ускладнюють розуміння пошуковими системами унікальності контенту.",
                affected_urls=dup_urls[:20],
                recommendation="Створіть унікальний Title для кожної сторінки.",
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
                message=f"Дублі Description: {len(duplicate_descriptions)} груп дублікатів",
                details="Унікальний Description підвищує клікабельність у видачі.",
                affected_urls=dup_urls[:20],
                recommendation="Створіть унікальний Description для кожної сторінки.",
                count=sum(duplicate_descriptions.values()),
            ))

        # Create table with problematic pages
        if missing_titles or missing_descriptions or short_titles or long_titles:
            table_data = []
            seen_urls = set()

            for url in missing_titles[:10]:
                if url not in seen_urls:
                    table_data.append({
                        "URL": url,
                        "Проблема": "Відсутній Title",
                        "Title": "-",
                        "Description": pages[url].meta_description[:50] + "..." if pages[url].meta_description else "-",
                    })
                    seen_urls.add(url)

            for url in missing_descriptions[:10]:
                if url not in seen_urls:
                    table_data.append({
                        "URL": url,
                        "Проблема": "Відсутній Description",
                        "Title": pages[url].title[:50] + "..." if pages[url].title else "-",
                        "Description": "-",
                    })
                    seen_urls.add(url)

            if table_data:
                tables.append({
                    "title": "Проблемні сторінки",
                    "headers": ["URL", "Проблема", "Title", "Description"],
                    "rows": table_data,
                })

        # Calculate summary
        total_pages = len([p for p in pages.values() if p.status_code == 200])
        ok_titles = total_pages - len(missing_titles) - len(short_titles) - len(long_titles)
        ok_descriptions = total_pages - len(missing_descriptions) - len(short_descriptions) - len(long_descriptions)

        summary_parts = []
        if missing_titles or missing_descriptions:
            summary_parts.append(f"Відсутні мета-теги: {len(missing_titles)} Title, {len(missing_descriptions)} Description")
        if duplicate_titles or duplicate_descriptions:
            summary_parts.append(f"Дублікати: {len(duplicate_titles)} Title, {len(duplicate_descriptions)} Description")
        if not summary_parts:
            summary_parts.append(f"Всі {total_pages} сторінок мають коректні мета-теги")

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
