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
    display_name = "Сторінка 404"
    description = "Кастомна сторінка 404 покращує користувацький досвід та допомагає утримати відвідувачів на сайті."
    icon = "🚫"
    theory = """<strong>Сторінка 404</strong> — сторінка помилки, яка показується коли запитаний URL не існує.

<strong>Чому важлива кастомна 404:</strong>
• Стандартна сторінка сервера виглядає непрофесійно
• Користувач може покинути сайт назавжди
• Втрачається можливість конверсії

<strong>Обов'язкові елементи:</strong>
• HTTP статус 404 (не 200!)
• Зрозуміле повідомлення про помилку
• Посилання на головну сторінку
• Навігація по сайту
• Форма пошуку (опціонально)

<strong>Вплив на SEO:</strong>
• Неправильний статус (200 замість 404) = "soft 404"
• Soft 404 витрачає краулінговий бюджет
• Google може показувати попередження в Search Console

<strong>Рекомендації:</strong>
• Завжди повертайте статус 404
• Додайте корисні посилання (популярні сторінки)
• Використовуйте дружній дизайн
• Логуйте 404 помилки для виявлення битих посилань
• Налаштуйте редиректи для часто запитуваних старих URL"""

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
                message="Не вдалося перевірити сторінку 404",
                details=f"Помилка: {str(e)}",
                recommendation="Перевірте доступність сайту.",
            ))
            return self.create_result(
                severity=SeverityLevel.WARNING,
                summary="Не вдалося перевірити сторінку 404",
                issues=issues,
            )

        # Create issues based on findings
        if not returns_404_status:
            issues.append(self.create_issue(
                category="wrong_404_status",
                severity=SeverityLevel.ERROR,
                message="Неправильний HTTP статус для неіснуючих сторінок",
                details=f"Сервер повертає статус {status_code} замість 404 для неіснуючих URL.",
                recommendation="Налаштуйте сервер повертати статус 404 для неіснуючих сторінок. Це важливо для SEO.",
            ))

        if not has_custom_404:
            issues.append(self.create_issue(
                category="no_custom_404",
                severity=SeverityLevel.ERROR,
                message="Відсутня кастомна сторінка 404",
                details="Сервер не показує зрозуміле повідомлення про помилку 404.",
                recommendation="Створіть кастомну сторінку 404 з корисною інформацією для користувача.",
            ))

        if has_custom_404 and not has_navigation:
            issues.append(self.create_issue(
                category="404_no_navigation",
                severity=SeverityLevel.WARNING,
                message="Сторінка 404 без навігації",
                details="На сторінці 404 відсутня навігація по сайту.",
                recommendation="Додайте меню навігації на сторінку 404, щоб користувачі могли продовжити перегляд сайту.",
            ))

        if has_custom_404 and not has_home_link:
            issues.append(self.create_issue(
                category="404_no_home_link",
                severity=SeverityLevel.WARNING,
                message="Сторінка 404 без посилання на головну",
                details="Немає очевидного способу повернутися на головну сторінку.",
                recommendation="Додайте чітке посилання 'На головну' або кнопку повернення.",
            ))

        if has_custom_404 and not has_search:
            issues.append(self.create_issue(
                category="404_no_search",
                severity=SeverityLevel.INFO,
                message="Сторінка 404 без пошуку",
                details="Форма пошуку на сторінці 404 допомагає користувачам знайти потрібний контент.",
                recommendation="Додайте форму пошуку на сторінку 404.",
            ))

        # Summary
        if returns_404_status and has_custom_404 and has_navigation:
            summary = "Сторінка 404 налаштована коректно"
            severity = SeverityLevel.SUCCESS
        elif not returns_404_status or not has_custom_404:
            summary = "Потрібно створити або виправити сторінку 404"
            severity = SeverityLevel.ERROR
        else:
            summary = "Сторінка 404 є, але потребує покращень"
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
