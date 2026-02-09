"""Favicon analyzer."""

from typing import Any, Dict, List
from urllib.parse import urljoin

from ..crawler import check_url_status
from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class FaviconAnalyzer(BaseAnalyzer):
    """Analyzer for favicon presence and format."""

    name = "favicon"
    display_name = "Фавікон"
    description = "Фавікон допомагає користувачам впізнавати ваш сайт у вкладках браузера та закладках."
    icon = "🌟"
    theory = """<strong>Фавікон (Favicon)</strong> — маленька іконка, що відображається у вкладці браузера, закладках та результатах пошуку.

<strong>Де відображається:</strong>
• Вкладки браузера
• Закладки та історія
• Ярлики на робочому столі/телефоні
• Результати пошуку Google (для деяких запитів)

<strong>Формати та розміри:</strong>
• <strong>favicon.ico</strong> — класичний формат, 16x16 та 32x32 px
• <strong>PNG</strong> — сучасний формат, 32x32, 192x192 px
• <strong>SVG</strong> — векторний формат, масштабується без втрат
• <strong>Apple Touch Icon</strong> — 180x180 px для iOS пристроїв

<strong>Рекомендований набір:</strong>
<code>&lt;link rel="icon" href="/favicon.ico" sizes="32x32"&gt;</code>
<code>&lt;link rel="icon" href="/icon.svg" type="image/svg+xml"&gt;</code>
<code>&lt;link rel="apple-touch-icon" href="/apple-touch-icon.png"&gt;</code>

<strong>Вплив на SEO:</strong>
• Прямо не впливає на ранжування
• Покращує впізнаваність бренду
• Підвищує CTR у результатах пошуку
• Покращує користувацький досвід"""

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []

        # Check /favicon.ico at root
        favicon_url = urljoin(base_url, "/favicon.ico")
        favicon_status = await check_url_status(favicon_url)
        has_favicon_ico = favicon_status == 200

        # Check for link rel="icon" in HTML
        html_favicons = []
        apple_touch_icons = []

        # Check home page for favicon links
        home_page = pages.get(base_url) or pages.get(base_url + "/")
        if not home_page:
            # Try to find any page
            for url, page in pages.items():
                if page.status_code == 200 and page.html_content:
                    home_page = page
                    break

        if home_page and home_page.html_content:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(home_page.html_content, 'lxml')

            # Find all favicon links
            for link in soup.find_all('link', rel=True):
                rel = link.get('rel', [])
                if isinstance(rel, str):
                    rel = [rel]

                href = link.get('href', '')
                if not href:
                    continue

                # Make absolute URL
                if not href.startswith(('http://', 'https://')):
                    href = urljoin(base_url, href)

                if 'icon' in rel or 'shortcut' in rel:
                    sizes = link.get('sizes', '')
                    type_attr = link.get('type', '')
                    html_favicons.append({
                        'href': href,
                        'sizes': sizes,
                        'type': type_attr,
                    })

                if 'apple-touch-icon' in rel:
                    sizes = link.get('sizes', '')
                    apple_touch_icons.append({
                        'href': href,
                        'sizes': sizes,
                    })

        has_html_favicon = len(html_favicons) > 0
        has_apple_icon = len(apple_touch_icons) > 0

        # Determine overall status
        if not has_favicon_ico and not has_html_favicon:
            issues.append(self.create_issue(
                category="missing_favicon",
                severity=SeverityLevel.ERROR,
                message="Фавікон відсутній",
                details="Не знайдено ні /favicon.ico, ні посилання <link rel=\"icon\"> у HTML.",
                recommendation="Додайте фавікон у форматі .ico (16x16, 32x32) або .png/.svg.",
            ))
        elif not has_favicon_ico:
            issues.append(self.create_issue(
                category="no_favicon_ico",
                severity=SeverityLevel.WARNING,
                message="Відсутній /favicon.ico",
                details="Деякі старі браузери шукають фавікон за адресою /favicon.ico.",
                recommendation="Додайте файл favicon.ico у корінь сайту для кращої сумісності.",
            ))

        if not has_apple_icon:
            issues.append(self.create_issue(
                category="no_apple_touch_icon",
                severity=SeverityLevel.INFO,
                message="Відсутній Apple Touch Icon",
                details="Apple Touch Icon використовується для закладок на iOS пристроях.",
                recommendation="Додайте <link rel=\"apple-touch-icon\" sizes=\"180x180\" href=\"/apple-touch-icon.png\">",
            ))

        # Check favicon format recommendations
        has_modern_format = False
        for favicon in html_favicons:
            if favicon.get('type') in ['image/svg+xml', 'image/png']:
                has_modern_format = True
                break
            if '.svg' in favicon.get('href', '') or '.png' in favicon.get('href', ''):
                has_modern_format = True
                break

        if has_html_favicon and not has_modern_format:
            issues.append(self.create_issue(
                category="old_favicon_format",
                severity=SeverityLevel.INFO,
                message="Рекомендується SVG або PNG формат",
                details="SVG фавікони масштабуються без втрати якості та підтримують темну тему.",
                recommendation="Додайте SVG версію фавікону: <link rel=\"icon\" href=\"/favicon.svg\" type=\"image/svg+xml\">",
            ))

        # Summary
        if not issues:
            summary = "Фавікон налаштовано коректно"
            severity = SeverityLevel.SUCCESS
        elif any(i.severity == SeverityLevel.ERROR for i in issues):
            summary = "Фавікон відсутній"
            severity = SeverityLevel.ERROR
        else:
            summary = "Фавікон є, але можна покращити"
            severity = SeverityLevel.WARNING

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "has_favicon_ico": has_favicon_ico,
                "has_html_favicon": has_html_favicon,
                "has_apple_icon": has_apple_icon,
                "html_favicons": html_favicons,
                "apple_touch_icons": apple_touch_icons,
                "favicon_url": favicon_url,
            },
        )
