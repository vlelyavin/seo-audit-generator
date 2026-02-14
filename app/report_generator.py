"""HTML report generator."""

import copy
import logging
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

import re
from jinja2 import Environment, FileSystemLoader
from markupsafe import Markup, escape

from .config import settings
from .i18n import get_translator, _
from .models import AnalyzerResult, AuditResult, SeverityLevel
from .utils import extract_domain

# Singleton instance for ReportGenerator
_report_generator_instance = None


def translate_analyzer_content(result: AnalyzerResult, lang: str, translator) -> AnalyzerResult:
    """
    Translate analyzer result content to target language.

    This function handles translation at render time, allowing the analyzer
    code to remain in Ukrainian (source language) while supporting multiple
    output languages.
    """
    import re

    if lang == 'uk':
        return result  # Ukrainian is the source language

    # Create a deep copy to avoid modifying the original
    translated = copy.deepcopy(result)
    name = result.name

    # Translate theory
    theory_key = f"analyzer_content.{name}.theory"
    translated_theory = translator.get(theory_key, "")
    if translated_theory:
        translated.theory = translated_theory

    # Translate display_name
    display_name_key = f"analyzer_content.{name}.display_name"
    translated_display = translator.get(display_name_key, "")
    if translated_display:
        translated.display_name = translated_display

    # Translate description
    desc_key = f"analyzer_content.{name}.description"
    translated_desc = translator.get(desc_key, "")
    if translated_desc:
        translated.description = translated_desc

    # Translate summary - handle special cases for different analyzers
    if result.summary:
        if name == "cms":
            # Extract CMS name from Ukrainian summary
            cms_match = re.search(r'використовується (.+)$', result.summary)
            if cms_match:
                cms_name = cms_match.group(1)
                summary_key = f"analyzer_content.{name}.summary.cms_detected"
                translated_summary = translator.get(summary_key, "")
                if translated_summary and "{cms}" in translated_summary:
                    translated.summary = translated_summary.format(cms=cms_name)
            elif "не вдалося" in result.summary:
                summary_key = f"analyzer_content.{name}.summary.cms_unknown"
                translated_summary = translator.get(summary_key, "")
                if translated_summary:
                    translated.summary = translated_summary

        elif name == "meta_tags":
            # Handle meta_tags summary with dynamic numbers
            if "Відсутні мета-теги:" in result.summary:
                # Extract numbers: "Відсутні мета-теги: X Title, Y Description"
                match = re.search(r'Відсутні мета-теги: (\d+) Title, (\d+) Description', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.missing"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(
                            missing_titles=match.group(1),
                            missing_descriptions=match.group(2)
                        )
                        # Handle duplicates part if present
                        dup_match = re.search(r'Дублікати: (\d+) Title, (\d+) Description', result.summary)
                        if dup_match:
                            dup_key = f"analyzer_content.{name}.summary.duplicates"
                            dup_trans = translator.get(dup_key, "")
                            if dup_trans:
                                translated.summary += ". " + dup_trans.format(
                                    duplicate_titles=dup_match.group(1),
                                    duplicate_descriptions=dup_match.group(2)
                                )
            elif "Дублікати:" in result.summary:
                dup_match = re.search(r'Дублікати: (\d+) Title, (\d+) Description', result.summary)
                if dup_match:
                    dup_key = f"analyzer_content.{name}.summary.duplicates"
                    translated_summary = translator.get(dup_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(
                            duplicate_titles=dup_match.group(1),
                            duplicate_descriptions=dup_match.group(2)
                        )
            elif "Всі" in result.summary and "мають коректні мета-теги" in result.summary:
                match = re.search(r'Всі (\d+) сторінок', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.all_ok"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(total_pages=match.group(1))

        elif name == "headings":
            if "Знайдено проблеми:" in result.summary:
                match = re.search(r'Знайдено проблеми: (.+)$', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.problems_found"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(problems=match.group(1))
            elif "мають коректний H1" in result.summary:
                match = re.search(r'Всі (\d+) сторінок', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.all_ok"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(total_pages=match.group(1))

        elif name == "page_404":
            summary_map = {
                "налаштована коректно": "ok",
                "створити або виправити": "missing",
                "потребує покращень": "needs_improvement",
                "Не вдалося перевірити": "check_failed"
            }
            for ukr_text, key in summary_map.items():
                if ukr_text in result.summary:
                    summary_key = f"analyzer_content.{name}.summary.{key}"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary
                    break

        elif name == "speed":
            # Extract mobile and desktop scores
            match = re.search(r'Mobile: (\d+)/100, Desktop: (\d+)/100', result.summary)
            if match:
                mobile, desktop = match.group(1), match.group(2)
                if "в нормі" in result.summary:
                    key = "ok"
                elif "Потрібна оптимізація" in result.summary:
                    key = "needs_optimization"
                elif "Критичні" in result.summary:
                    key = "critical"
                else:
                    key = None
                if key:
                    summary_key = f"analyzer_content.{name}.summary.{key}"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(mobile=mobile, desktop=desktop)
            elif "Не вдалося" in result.summary:
                summary_key = f"analyzer_content.{name}.summary.failed"
                translated_summary = translator.get(summary_key, "")
                if translated_summary:
                    translated.summary = translated_summary

        elif name == "images":
            if "Всі" in result.summary and "оптимізовані" in result.summary:
                match = re.search(r'Всі (\d+) зображень', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.all_ok"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(count=match.group(1))
            elif "Знайдено" in result.summary:
                match = re.search(r'Знайдено (\d+) зображень\. Проблеми: (.+)$', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.problems"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(count=match.group(1), problems=match.group(2))

        elif name == "content":
            if "мають достатньо контенту" in result.summary:
                match = re.search(r'Всі (\d+) сторінок.*Середня кількість слів: (\d+)', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.all_ok"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(total_pages=match.group(1), avg_words=match.group(2))
            elif "Проблеми з контентом:" in result.summary:
                match = re.search(r'Проблеми з контентом: (.+)\. Середня кількість слів: (\d+)', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.problems"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(problems=match.group(1), avg_words=match.group(2))

        elif name == "links":
            if "Проблем не знайдено" in result.summary:
                match = re.search(r'Перевірено (\d+) внутрішніх та (\d+) зовнішніх', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.no_broken"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(internal=match.group(1), external=match.group(2))
            elif "Знайдено битих посилань:" in result.summary:
                match = re.search(r'Знайдено битих посилань: (.+)$', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.broken_found"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(broken=match.group(1))

        elif name == "favicon":
            summary_map = {
                "налаштовано коректно": "ok",
                "відсутній": "missing",
                "можна покращити": "needs_improvement"
            }
            for ukr_text, key in summary_map.items():
                if ukr_text in result.summary:
                    summary_key = f"analyzer_content.{name}.summary.{key}"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary
                    break

        elif name == "external_links":
            match = re.search(r'Знайдено (\d+) зовнішніх посилань на (\d+) доменів', result.summary)
            if match:
                summary_key = f"analyzer_content.{name}.summary.ok"
                translated_summary = translator.get(summary_key, "")
                if translated_summary:
                    translated.summary = translated_summary.format(count=match.group(1), domains=match.group(2))
            else:
                match = re.search(r'Знайдено (\d+) зовнішніх посилань\. Попереджень: (\d+), інфо: (\d+)', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.with_warnings"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(count=match.group(1), warnings=match.group(2), info=match.group(3))

        elif name == "robots":
            if "в порядку" in result.summary:
                summary_key = f"analyzer_content.{name}.summary.ok"
                translated_summary = translator.get(summary_key, "")
                if translated_summary:
                    translated.summary = translated_summary
            elif "Проблеми з індексацією:" in result.summary:
                match = re.search(r'Проблеми з індексацією: (.+)$', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.problems"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(problems=match.group(1))

        elif name == "structure":
            if "оптимальна" in result.summary:
                match = re.search(r'Максимальна глибина: (\d+) рівнів', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.ok"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(depth=match.group(1))
            else:
                match = re.search(r'Максимальна глибина: (\d+)\. Проблеми: (.+)$', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.problems"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(depth=match.group(1), problems=match.group(2))

        elif name == "content_sections":
            if "Виявлено:" in result.summary:
                match = re.search(r'Виявлено: (.+)$', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.detected"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(sections=match.group(1))
            elif "не виявлено" in result.summary:
                summary_key = f"analyzer_content.{name}.summary.not_detected"
                translated_summary = translator.get(summary_key, "")
                if translated_summary:
                    translated.summary = translated_summary

        elif name == "schema":
            if "Знайдено" in result.summary and "типів" in result.summary:
                match = re.search(r'Знайдено (\d+) типів Schema\.org на (\d+) сторінках', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.found"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(types=match.group(1), pages=match.group(2))
            elif "відсутні" in result.summary:
                summary_key = f"analyzer_content.{name}.summary.missing"
                translated_summary = translator.get(summary_key, "")
                if translated_summary:
                    translated.summary = translated_summary

        elif name == "social_tags":
            if "OG теги:" in result.summary:
                match = re.search(r'OG теги: (\d+)/(\d+).*Twitter Cards: (\d+)/(\d+)', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.stats"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(
                            og=match.group(1), total=match.group(2),
                            twitter=match.group(3), total2=match.group(4))
            elif "Немає сторінок" in result.summary:
                summary_key = f"analyzer_content.{name}.summary.no_pages"
                translated_summary = translator.get(summary_key, "")
                if translated_summary:
                    translated.summary = translated_summary

        elif name == "security":
            if "в нормі" in result.summary:
                summary_key = f"analyzer_content.{name}.summary.ok"
                translated_summary = translator.get(summary_key, "")
                if translated_summary:
                    translated.summary = translated_summary
            elif "Знайдено проблем:" in result.summary:
                match = re.search(r'Знайдено проблем: (.+)$', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.problems"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(problems=match.group(1))

        elif name == "mobile":
            if "мають viewport" in result.summary:
                match = re.search(r'Всі (\d+) сторінок', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.ok"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(count=match.group(1))
            elif "Проблеми:" in result.summary:
                match = re.search(r'Проблеми: (.+)$', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.problems"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(problems=match.group(1))

        elif name == "url_quality":
            if "Всі URL якісні" in result.summary:
                summary_key = f"analyzer_content.{name}.summary.ok"
                translated_summary = translator.get(summary_key, "")
                if translated_summary:
                    translated.summary = translated_summary
            elif "Знайдено проблем:" in result.summary:
                match = re.search(r'Знайдено проблем: (.+)$', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.problems"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(problems=match.group(1))

        elif name == "hreflang":
            if "відсутні" in result.summary:
                summary_key = f"analyzer_content.{name}.summary.missing"
                translated_summary = translator.get(summary_key, "")
                if translated_summary:
                    translated.summary = translated_summary
            elif "Знайдено" in result.summary:
                match = re.search(r'Знайдено (\d+) мовних версій на (\d+) сторінках', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.found"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(langs=match.group(1), pages=match.group(2))

        elif name == "duplicates":
            if "Знайдено" in result.summary and "груп" in result.summary:
                match = re.search(r'Знайдено (\d+) груп', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.found"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(count=match.group(1))
            elif "не виявлено" in result.summary:
                summary_key = f"analyzer_content.{name}.summary.ok"
                translated_summary = translator.get(summary_key, "")
                if translated_summary:
                    translated.summary = translated_summary

        elif name == "redirects":
            if "Знайдено" in result.summary and "ланцюжків" in result.summary:
                match = re.search(r'Знайдено (\d+) ланцюжків', result.summary)
                if match:
                    summary_key = f"analyzer_content.{name}.summary.found"
                    translated_summary = translator.get(summary_key, "")
                    if translated_summary:
                        translated.summary = translated_summary.format(count=match.group(1))
            elif "не знайдено" in result.summary:
                summary_key = f"analyzer_content.{name}.summary.ok"
                translated_summary = translator.get(summary_key, "")
                if translated_summary:
                    translated.summary = translated_summary

        # Post-process: replace remaining Ukrainian words in summary
        # (injected via {problems}, {broken}, {sections} placeholders)
        if lang == 'en' and translated.summary:
            _summary_word_map_en = {
                'декілька H1': 'multiple H1',
                'дублів H1': 'duplicate H1',
                'порушень ієрархії': 'hierarchy violations',
                'без H1': 'no H1',
                'завеликі': 'too large',
                'застарілий формат': 'outdated format',
                'порожніх': 'empty',
                'з малим контентом': 'with thin content',
                'внутрішніх': 'internal',
                'зовнішніх': 'external',
                'глибоких сторінок': 'deep pages',
                'сирітських': 'orphan',
                'помилок': 'errors',
                'попереджень': 'warnings',
                'без viewport': 'no viewport',
                'Flash-контент': 'Flash content',
                'некоректний viewport': 'incorrect viewport',
                'довгих URL': 'long URLs',
                'великі літери': 'uppercase letters',
                'спецсимволи': 'special characters',
                'підкреслення': 'underscores',
                'подвійні слеші': 'double slashes',
                'параметри': 'parameters',
            }
            for ukr, eng in _summary_word_map_en.items():
                if ukr in translated.summary:
                    translated.summary = translated.summary.replace(ukr, eng)

        if lang == 'ru' and translated.summary:
            _summary_word_map = {
                'декілька H1': 'несколько H1',
                'дублів H1': 'дублей H1',
                'порушень ієрархії': 'нарушений иерархии',
                'без H1': 'без H1',
                'завеликі': 'слишком большие',
                'застарілий формат': 'устаревший формат',
                'порожніх': 'пустых',
                'з малим контентом': 'с малым контентом',
                'внутрішніх': 'внутренних',
                'зовнішніх': 'внешних',
                'глибоких сторінок': 'глубоких страниц',
                'сирітських': 'сиротских',
                'помилок': 'ошибок',
                'попереджень': 'предупреждений',
                'без viewport': 'без viewport',
                'Flash-контент': 'Flash-контент',
                'некоректний viewport': 'некорректный viewport',
                'довгих URL': 'длинных URL',
                'великі літери': 'заглавные буквы',
                'спецсимволи': 'спецсимволы',
                'підкреслення': 'подчёркивания',
                'подвійні слеші': 'двойные слэши',
                'параметри': 'параметры',
            }
            for ukr, rus in _summary_word_map.items():
                if ukr in translated.summary:
                    translated.summary = translated.summary.replace(ukr, rus)

    # Translate issues
    for issue in translated.issues:
        # Try to translate message by category
        msg_key = f"analyzer_content.{name}.issues.{issue.category}"
        translated_msg = translator.get(msg_key, "")

        if translated_msg:
            try:
                # Handle CMS-specific translations with dynamic CMS name
                if name == "cms" and issue.category == "cms_detected":
                    cms_match = re.search(r'використовується (.+)$', issue.message)
                    if cms_match and "{cms}" in translated_msg:
                        issue.message = translated_msg.format(cms=cms_match.group(1))
                elif name == "cms" and issue.category == "multiple_cms":
                    cms_match = re.search(r'ознаки: (.+)$', issue.message)
                    if cms_match and "{cms_list}" in translated_msg:
                        issue.message = translated_msg.format(cms_list=cms_match.group(1))
                # Try to format with count if available
                elif issue.count is not None and "{count}" in translated_msg and "{" in translated_msg.replace("{count}", ""):
                    # Has {count} plus other placeholders — skip, handled below
                    pass
                elif issue.count is not None and "{count}" in translated_msg:
                    issue.message = translated_msg.format(count=issue.count)
                elif "{" not in translated_msg:
                    # No placeholders, use as-is
                    issue.message = translated_msg
                else:
                    # General fallback: extract dynamic values from Ukrainian message
                    format_kwargs = {}
                    numbers = re.findall(r'\d+', issue.message)

                    if issue.count is not None:
                        format_kwargs['count'] = issue.count
                    elif '{count}' in translated_msg:
                        # Try to extract ratio like (85/100) first
                        ratio_match = re.search(r'\((\d+/\d+)\)', issue.message)
                        if ratio_match:
                            format_kwargs['count'] = ratio_match.group(1)
                        elif numbers:
                            format_kwargs['count'] = numbers[0]

                    # Extract domain for external_links many_links_same_domain
                    if '{domain}' in translated_msg:
                        domain_match = re.search(r'на (.+?):', issue.message)
                        if domain_match:
                            format_kwargs['domain'] = domain_match.group(1)
                        # Also try to get count from "domain: N шт."
                        count_match = re.search(r':\s*(\d+)\s*шт', issue.message)
                        if count_match:
                            format_kwargs['count'] = count_match.group(1)

                    if format_kwargs:
                        issue.message = translated_msg.format(**format_kwargs)
            except (KeyError, ValueError, IndexError):
                # If formatting fails, keep original message
                pass

        # Translate details - handle CMS special case
        details_key = f"analyzer_content.{name}.details.{issue.category}"
        translated_details = translator.get(details_key, "")
        if translated_details:
            if name == "cms" and issue.category == "cms_detected":
                # Extract evidence from original details
                evidence_match = re.search(r'ознаки: (.+)$', issue.details or "")
                if evidence_match and "{evidence}" in translated_details:
                    evidence = evidence_match.group(1)
                    issue.details = translated_details.format(evidence=evidence)
            elif "{" not in translated_details:
                issue.details = translated_details

        # Translate recommendation
        rec_key = f"analyzer_content.{name}.recommendations.{issue.category}"
        translated_rec = translator.get(rec_key, "")
        if translated_rec and "{" not in translated_rec:
            issue.recommendation = translated_rec

    # Post-process: replace remaining Ukrainian words in issue messages
    # (speed FCP/LCP/CLS metrics, content_sections missing features, etc.)
    if lang == 'en':
        _issue_word_map_en = {
            'повільний': 'slow',
            'високий': 'high',
            'ціль': 'target',
            'відсутні елементи:': 'missing elements:',
            'дати публікації': 'publication dates',
            'категорії': 'categories',
        }
        for issue in translated.issues:
            if issue.message:
                for ukr, eng in _issue_word_map_en.items():
                    if ukr in issue.message:
                        issue.message = issue.message.replace(ukr, eng)

    if lang == 'ru':
        _issue_word_map = {
            'повільний': 'медленный',
            'високий': 'высокий',
            'ціль': 'цель',
            'відсутні елементи:': 'отсутствуют элементы:',
            'дати публікації': 'даты публикации',
            'категорії': 'категории',
        }
        for issue in translated.issues:
            if issue.message:
                for ukr, rus in _issue_word_map.items():
                    if ukr in issue.message:
                        issue.message = issue.message.replace(ukr, rus)

    # Translate tables
    table_titles = translator.translations.get("table_translations", {}).get("titles", {})
    table_headers = translator.translations.get("table_translations", {}).get("headers", {})
    table_values = translator.translations.get("table_translations", {}).get("values", {})
    table_patterns = translator.translations.get("table_translations", {}).get("patterns", {})

    for table in translated.tables:
        # Translate table title
        if table.get("title") and table["title"] in table_titles:
            table["title"] = table_titles[table["title"]]

        # Translate table headers
        if table.get("headers"):
            table["headers"] = [
                table_headers.get(h, h) for h in table["headers"]
            ]

        # Translate row values
        if table.get("rows"):
            new_rows = []
            for row in table["rows"]:
                new_row = {}
                for key, value in row.items():
                    # Translate key if it's in table_headers
                    new_key = table_headers.get(key, key)
                    if isinstance(value, str):
                        # 1. Exact match in values map
                        if value in table_values:
                            new_row[new_key] = table_values[value]
                        # 2. Exact match in headers map
                        elif value in table_headers:
                            new_row[new_key] = table_headers[value]
                        # 3. Pattern-based replacement for dynamic strings
                        else:
                            translated_value = value
                            for pattern, replacement in table_patterns.items():
                                if pattern in translated_value:
                                    translated_value = translated_value.replace(pattern, replacement)
                            new_row[new_key] = translated_value
                    else:
                        new_row[new_key] = value
                new_rows.append(new_row)
            table["rows"] = new_rows

    return translated


class ReportGenerator:
    """Generates autonomous HTML reports from audit results."""

    def __init__(self):
        templates_path = Path(__file__).parent / "templates"
        self.env = Environment(
            loader=FileSystemLoader(str(templates_path)),
            autoescape=True,
        )

        # Add custom filters
        self.env.filters['status_icon'] = self.status_icon
        self.env.filters['severity_class'] = self.severity_class
        self.env.filters['format_number'] = self.format_number
        self.env.filters['format_cell'] = self.format_cell

    @staticmethod
    def status_icon(severity: SeverityLevel) -> str:
        """Convert severity to inline SVG icon."""
        icons = {
            SeverityLevel.SUCCESS: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            SeverityLevel.WARNING: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            SeverityLevel.ERROR: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            SeverityLevel.INFO: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
        }
        return icons.get(severity, '')

    @staticmethod
    def severity_class(severity: SeverityLevel) -> str:
        """Convert severity to CSS class."""
        classes = {
            SeverityLevel.SUCCESS: 'success',
            SeverityLevel.WARNING: 'warning',
            SeverityLevel.ERROR: 'error',
            SeverityLevel.INFO: 'info',
        }
        return classes.get(severity, 'info')

    @staticmethod
    def format_number(value: int) -> str:
        """Format number with thousands separator."""
        return f"{value:,}".replace(",", " ")

    @staticmethod
    def format_cell(value) -> Markup:
        """Format table cell: replace ✓/✗/⚠️ with SVG icons, make URLs clickable."""
        text = str(value) if value is not None else ""

        # HTML-escape the text first to prevent XSS
        text = str(escape(text))

        # SVG icons (14×14) matching the report's existing icon style
        icon_check = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 12 15 16 10"/></svg>'
        icon_cross = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        icon_warning = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'

        # Replace Unicode symbols and emojis with SVG icons
        text = text.replace("\u2713", icon_check)     # ✓
        text = text.replace("\u2714", icon_check)     # ✔
        text = text.replace("\u2717", icon_cross)     # ✗
        text = text.replace("\u2718", icon_cross)     # ✘
        text = text.replace("\u2716", icon_cross)     # ✖
        text = text.replace("\u26a0\ufe0f", icon_warning)  # ⚠️ (with variation selector)
        text = text.replace("\u26a0", icon_warning)   # ⚠ (without variation selector)

        # Make URLs clickable
        text = re.sub(
            r'(https?://[^\s<>&"\']+)',
            r'<a href="\1" target="_blank" rel="noopener noreferrer">\1</a>',
            text,
        )

        return Markup(text)

    async def generate(self, audit: AuditResult, brand: dict | None = None) -> str:
        """Generate HTML report and return file path."""
        template = self.env.get_template("report.html")

        # Get translator for the audit language
        lang = getattr(audit, 'language', 'uk') or 'uk'
        t = get_translator(lang)

        # Prepare sections for navigation with translated names
        sections = []
        section_order = [
            "cms", "meta_tags", "headings", "page_404", "speed",
            "images", "content", "links", "favicon", "external_links",
            "robots", "structure", "content_sections",
            "schema", "social_tags", "security", "mobile",
            "url_quality", "hreflang", "duplicates", "redirects",
        ]

        for name in section_order:
            if name in audit.results:
                result = audit.results[name]

                # Translate analyzer content if not Ukrainian
                if lang != 'uk':
                    result = translate_analyzer_content(result, lang, t)

                # Get translated title, fallback to display_name from result
                title = t(f"analyzers.{name}.name")
                if title == f"analyzers.{name}.name":
                    title = result.display_name  # Fallback to analyzer's display_name

                sections.append({
                    "id": name,
                    "title": title,
                    "icon": "",
                    "severity": result.severity,
                    "result": result,
                })

        # Extract domain
        domain = extract_domain(audit.url)

        # Prepare translations for template
        translations = {
            "report_title": t("report.title"),
            "overview": t("report.overview"),
            "pages_crawled": t("report.pages_crawled"),
            "passed_checks": t("report.passed_checks"),
            "warnings": t("report.warnings"),
            "critical_issues": t("report.critical_issues"),
            "theory_title": t("report.theory_title"),
            "examples": t("report.examples"),
            "recommendation": t("report.recommendation"),
            "no_issues": t("report.no_issues"),
            "expand_more": t("common.expand_more"),
            "collapse": t("common.collapse"),
            "pagespeed_screenshots": t("report.pagespeed_screenshots"),
            "homepage_screenshot_title": t("report.homepage_screenshot_title"),
            "badge_ok": t("report.badge_ok"),
            "badge_warning": t("report.badge_warning"),
            "badge_error": t("report.badge_error"),
            "badge_info": t("report.badge_info"),
        }

        # Render template
        html = template.render(
            audit=audit,
            domain=domain,
            sections=sections,
            generated_at=datetime.now().strftime("%d.%m.%Y %H:%M"),
            SeverityLevel=SeverityLevel,
            t=translations,
            lang=lang,
            brand=brand or {},
        )

        # Save report
        report_filename = f"audit_{audit.id}.html"
        report_path = Path(settings.REPORTS_DIR) / report_filename

        with open(report_path, "w", encoding="utf-8") as f:
            f.write(html)

        return str(report_path)

    async def generate_pdf(self, audit: AuditResult, brand: dict | None = None) -> str:
        """Generate PDF report and return file path."""
        try:
            from weasyprint import HTML, CSS
        except ImportError:
            raise ImportError("weasyprint is required for PDF export. Install it with: pip install weasyprint")

        # First generate HTML
        html_path = await self.generate(audit, brand=brand)

        # Read the HTML content
        with open(html_path, "r", encoding="utf-8") as f:
            html_content = f.read()

        # Create PDF
        pdf_filename = f"audit_{audit.id}.pdf"
        pdf_path = Path(settings.REPORTS_DIR) / pdf_filename

        # Add print-specific CSS to hide sidebar and adjust layout
        print_css = CSS(string="""
            @page {
                size: A4;
                margin: 1.5cm;
            }
            .sidebar {
                display: none !important;
            }
            .main {
                margin-left: 0 !important;
                padding: 0 !important;
                max-width: 100% !important;
            }
            body {
                background: white !important;
                font-size: 11pt !important;
            }
            /* Compact spacing for PDF */
            .section {
                margin-bottom: 18px !important;
            }
            .section-header {
                margin-bottom: 10px !important;
                padding-bottom: 8px !important;
            }
            .issue {
                margin-bottom: 6px !important;
            }
            .theory-block {
                margin-bottom: 8px !important;
            }
            /* Keep issue headers with their content */
            .issue-header {
                page-break-after: avoid;
                break-after: avoid;
            }
            /* Summary cards: compact for A4 */
            .summary-grid {
                grid-template-columns: repeat(4, 1fr) !important;
            }
            .summary-card {
                padding: 10px !important;
                gap: 10px !important;
            }
            .summary-card .icon-circle {
                width: 32px !important;
                height: 32px !important;
                min-width: 32px !important;
            }
            .summary-card .icon-circle svg {
                width: 16px !important;
                height: 16px !important;
            }
            .summary-card .number {
                font-size: 20px !important;
            }
            .summary-card .label {
                font-size: 10px !important;
            }
            .screenshots-grid {
                grid-template-columns: 1fr !important;
            }
            .screenshot-card img {
                max-width: 100% !important;
            }
            /* Badge alignment for WeasyPrint */
            .badge {
                display: inline-flex !important;
                align-items: center !important;
                vertical-align: middle !important;
                line-height: 1 !important;
            }
            .badge svg {
                display: inline-block !important;
                vertical-align: middle !important;
            }
            .section-header {
                align-items: center !important;
            }
            /* Force details open and hide interactive elements for PDF */
            details {
                display: block !important;
            }
            details summary {
                list-style: none !important;
                pointer-events: none !important;
            }
            details summary::marker,
            details summary::-webkit-details-marker {
                display: none !important;
            }
            details:not([open]) > *:not(summary) {
                display: block !important;
            }
            .expand-urls-btn {
                display: none !important;
            }
            .urls-hidden {
                display: block !important;
            }
        """)

        # Force all details elements to be open for PDF
        html_content = html_content.replace('<details class="theory-block">', '<details class="theory-block" open>')

        HTML(string=html_content).write_pdf(pdf_path, stylesheets=[print_css])

        return str(pdf_path)

    # --- DOCX Helper Methods ---

    @staticmethod
    def _docx_set_cell_shading(cell, color_hex: str):
        """Set background color on a table cell."""
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement
        tc_pr = cell._tc.get_or_add_tcPr()
        shading = OxmlElement('w:shd')
        shading.set(qn('w:fill'), color_hex)
        shading.set(qn('w:val'), 'clear')
        shading.set(qn('w:color'), 'auto')
        tc_pr.append(shading)

    @staticmethod
    def _docx_set_cell_left_border(cell, color_hex: str, width: str = "24"):
        """Add a colored left border to a cell."""
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement
        tc_pr = cell._tc.get_or_add_tcPr()
        borders = tc_pr.find(qn('w:tcBorders'))
        if borders is None:
            borders = OxmlElement('w:tcBorders')
            tc_pr.append(borders)
        left = OxmlElement('w:left')
        left.set(qn('w:val'), 'single')
        left.set(qn('w:sz'), width)
        left.set(qn('w:space'), '0')
        left.set(qn('w:color'), color_hex)
        borders.append(left)

    @staticmethod
    def _docx_remove_cell_borders(cell):
        """Remove all borders from a cell."""
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement
        tc_pr = cell._tc.get_or_add_tcPr()
        borders = OxmlElement('w:tcBorders')
        for side in ('w:top', 'w:left', 'w:bottom', 'w:right'):
            el = OxmlElement(side)
            el.set(qn('w:val'), 'none')
            el.set(qn('w:sz'), '0')
            el.set(qn('w:space'), '0')
            el.set(qn('w:color'), 'auto')
            borders.append(el)
        tc_pr.append(borders)

    @staticmethod
    def _docx_set_cell_margins(cell, top=0, right=80, bottom=0, left=80):
        """Set cell internal margins (padding) in DXA units (1/20 of a point, ~80 DXA = 1.4mm)."""
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement
        tc_pr = cell._tc.get_or_add_tcPr()
        tc_mar = OxmlElement('w:tcMar')
        for side, value in [('w:top', top), ('w:left', left), ('w:bottom', bottom), ('w:right', right)]:
            el = OxmlElement(side)
            el.set(qn('w:w'), str(value))
            el.set(qn('w:type'), 'dxa')
            tc_mar.append(el)
        tc_pr.append(tc_mar)

    @staticmethod
    def _docx_set_font(run, font_name: str = 'Inter', size_pt=None, bold=None, color_rgb=None):
        """Configure a run with font settings."""
        from docx.shared import Pt, RGBColor
        from docx.oxml.ns import qn
        run.font.name = font_name
        r = run._element
        r_pr = r.find(qn('w:rPr'))
        if r_pr is None:
            r_pr = r.makeelement(qn('w:rPr'), {})
            r.insert(0, r_pr)
        r_fonts = r_pr.find(qn('w:rFonts'))
        if r_fonts is None:
            r_fonts = r.makeelement(qn('w:rFonts'), {})
            r_pr.append(r_fonts)
        r_fonts.set(qn('w:ascii'), font_name)
        r_fonts.set(qn('w:hAnsi'), font_name)
        r_fonts.set(qn('w:cs'), font_name)
        if size_pt is not None:
            run.font.size = Pt(size_pt)
        if bold is not None:
            run.font.bold = bold
        if color_rgb is not None:
            run.font.color.rgb = RGBColor(*color_rgb)

    @staticmethod
    def _docx_add_hyperlink(paragraph, url: str, text: str, font_name: str = 'Inter', font_size_pt: int = 9, color_rgb=None):
        """Add a clickable hyperlink to a Word paragraph."""
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement
        from docx.shared import Pt, RGBColor

        part = paragraph.part
        r_id = part.relate_to(url, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', is_external=True)

        hyperlink = OxmlElement('w:hyperlink')
        hyperlink.set(qn('r:id'), r_id)

        new_run = OxmlElement('w:r')
        rPr = OxmlElement('w:rPr')

        # Font
        rFonts = OxmlElement('w:rFonts')
        rFonts.set(qn('w:ascii'), font_name)
        rFonts.set(qn('w:hAnsi'), font_name)
        rFonts.set(qn('w:cs'), font_name)
        rPr.append(rFonts)

        # Size
        sz = OxmlElement('w:sz')
        sz.set(qn('w:val'), str(font_size_pt * 2))  # Half-points
        rPr.append(sz)
        szCs = OxmlElement('w:szCs')
        szCs.set(qn('w:val'), str(font_size_pt * 2))
        rPr.append(szCs)

        # Color
        rgb = color_rgb or (59, 130, 246)  # Default blue
        color = OxmlElement('w:color')
        color.set(qn('w:val'), '{:02X}{:02X}{:02X}'.format(*rgb))
        rPr.append(color)

        # Underline
        u = OxmlElement('w:u')
        u.set(qn('w:val'), 'single')
        rPr.append(u)

        new_run.append(rPr)
        new_run_text = OxmlElement('w:t')
        new_run_text.set(qn('xml:space'), 'preserve')
        new_run_text.text = text
        new_run.append(new_run_text)
        hyperlink.append(new_run)
        paragraph._p.append(hyperlink)

    def _docx_add_formatted_cell(self, paragraph, value, font_size_pt: int = 9):
        """Add formatted text to a table cell: colored ✓/✗/⚠ icons and clickable URLs."""
        import re as _re
        from docx.shared import RGBColor

        text = str(value) if value is not None else ""

        # Icon character → color mapping
        icon_colors = {
            '\u2713': (16, 185, 129),   # ✓ green
            '\u2714': (16, 185, 129),   # ✔ green
            '\u2717': (239, 68, 68),    # ✗ red
            '\u2718': (239, 68, 68),    # ✘ red
            '\u2716': (239, 68, 68),    # ✖ red
        }
        warning_chars = {'\u26a0'}  # ⚠
        warning_color = (245, 158, 11)  # amber

        # If the entire value is a URL, render as hyperlink
        stripped = text.strip()
        if _re.match(r'^https?://', stripped) and ' ' not in stripped:
            self._docx_add_hyperlink(paragraph, stripped, stripped, font_size_pt=font_size_pt)
            return

        # Split text into segments around icon characters
        # Build a regex pattern for all icon chars (including ⚠️ with variation selector)
        icon_pattern = _re.compile('([\u2713\u2714\u2716\u2717\u2718]|\u26a0\ufe0f?)')
        segments = icon_pattern.split(text)

        for segment in segments:
            if not segment:
                continue

            # Check if this segment is an icon character
            clean = segment.replace('\ufe0f', '')  # Remove variation selector
            if clean in icon_colors:
                run = paragraph.add_run(clean)
                self._docx_set_font(run, size_pt=font_size_pt, color_rgb=icon_colors[clean])
            elif clean in warning_chars:
                run = paragraph.add_run(clean)
                self._docx_set_font(run, size_pt=font_size_pt, color_rgb=warning_color)
            else:
                # Regular text — check if it contains a URL
                url_match = _re.search(r'(https?://[^\s]+)', segment)
                if url_match:
                    # Text before URL
                    before = segment[:url_match.start()]
                    if before:
                        run = paragraph.add_run(before)
                        self._docx_set_font(run, size_pt=font_size_pt)
                    # URL as hyperlink
                    self._docx_add_hyperlink(paragraph, url_match.group(1), url_match.group(1), font_size_pt=font_size_pt)
                    # Text after URL
                    after = segment[url_match.end():]
                    if after:
                        run = paragraph.add_run(after)
                        self._docx_set_font(run, size_pt=font_size_pt)
                else:
                    run = paragraph.add_run(segment)
                    self._docx_set_font(run, size_pt=font_size_pt)

    def _docx_parse_theory(self, doc, theory_html: str):
        """Parse theory HTML into Word paragraphs with formatting."""
        import re
        from docx.shared import Pt, RGBColor

        if not theory_html:
            return

        # Create a single-cell table for gray background
        table = doc.add_table(rows=1, cols=1)
        table.style = 'Table Grid'
        cell = table.rows[0].cells[0]
        self._docx_remove_cell_borders(cell)
        self._docx_set_cell_shading(cell, 'F0F4F8')

        # Clear default paragraph
        cell.text = ''

        lines = theory_html.split('\n')
        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue

            p = cell.add_paragraph() if cell.paragraphs[0].text or i > 0 else cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)

            # Handle bullet points
            if line.startswith('•'):
                line = line[1:].strip()
                # Add bullet character
                run = p.add_run('  •  ')
                self._docx_set_font(run, size_pt=9, color_rgb=(107, 114, 128))

            # Parse inline HTML tags
            parts = re.split(r'(<strong>.*?</strong>|<code>.*?</code>)', line)
            for part in parts:
                if not part:
                    continue
                strong_match = re.match(r'<strong>(.*?)</strong>', part)
                code_match = re.match(r'<code>(.*?)</code>', part)
                if strong_match:
                    run = p.add_run(strong_match.group(1))
                    self._docx_set_font(run, size_pt=9, bold=True)
                elif code_match:
                    run = p.add_run(code_match.group(1))
                    self._docx_set_font(run, font_name='Consolas', size_pt=9, color_rgb=(107, 114, 128))
                else:
                    # Strip any remaining HTML
                    clean = re.sub(r'<[^>]+>', '', part)
                    if clean:
                        run = p.add_run(clean)
                        self._docx_set_font(run, size_pt=9)

    def _docx_add_issue_card(self, doc, issue, t_labels: dict):
        """Add a colored issue card as a borderless single-cell table."""
        from docx.shared import Pt, RGBColor

        severity_colors = {
            SeverityLevel.ERROR: 'FEE2E2',
            SeverityLevel.WARNING: 'FEF3C7',
            SeverityLevel.SUCCESS: 'D1FAE5',
            SeverityLevel.INFO: 'DBEAFE',
        }
        severity_text_colors = {
            SeverityLevel.ERROR: (239, 68, 68),
            SeverityLevel.WARNING: (180, 120, 0),
            SeverityLevel.SUCCESS: (16, 150, 100),
            SeverityLevel.INFO: (59, 130, 246),
        }
        severity_icons = {
            SeverityLevel.SUCCESS: "✓",
            SeverityLevel.WARNING: "⚠",
            SeverityLevel.ERROR: "✗",
            SeverityLevel.INFO: "ℹ",
        }

        bg_color = severity_colors.get(issue.severity, 'F3F4F6')
        text_color = severity_text_colors.get(issue.severity, (31, 41, 55))
        icon = severity_icons.get(issue.severity, "")

        # Create single-cell table for the card
        table = doc.add_table(rows=1, cols=1)
        table.style = 'Table Grid'
        cell = table.rows[0].cells[0]
        self._docx_remove_cell_borders(cell)
        self._docx_set_cell_shading(cell, bg_color)

        # Issue message (bold, colored)
        cell.text = ''
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(4)
        run = p.add_run(f"{icon} {issue.message}")
        self._docx_set_font(run, size_pt=10, bold=True, color_rgb=text_color)

        # Details
        if issue.details:
            p = cell.add_paragraph()
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            run = p.add_run(issue.details)
            self._docx_set_font(run, size_pt=9, color_rgb=(55, 65, 81))

        # Recommendation
        if issue.recommendation:
            p = cell.add_paragraph()
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(2)
            rec_label = t_labels.get("recommendation", "Рекомендація")
            run = p.add_run(f"{rec_label}: ")
            self._docx_set_font(run, size_pt=9, bold=True, color_rgb=(55, 65, 81))
            run = p.add_run(issue.recommendation)
            self._docx_set_font(run, size_pt=9, color_rgb=(55, 65, 81))

        # Affected URLs
        if issue.affected_urls:
            examples_label = t_labels.get("examples", "Приклади")
            p = cell.add_paragraph()
            p.paragraph_format.space_before = Pt(4)
            run = p.add_run(f"{examples_label}:")
            self._docx_set_font(run, size_pt=8, bold=True, color_rgb=(75, 85, 99))
            for url in issue.affected_urls:
                p = cell.add_paragraph()
                p.paragraph_format.space_before = Pt(0)
                p.paragraph_format.space_after = Pt(0)
                run = p.add_run("  \u2022 ")
                self._docx_set_font(run, size_pt=8, color_rgb=(55, 65, 81))
                self._docx_add_hyperlink(p, url, url, font_size_pt=8, color_rgb=(55, 65, 81))

    async def generate_docx(self, audit: AuditResult, brand: dict | None = None) -> str:
        """Generate styled DOCX report and return file path."""
        try:
            from docx import Document
            from docx.shared import Inches, Pt, RGBColor, Cm
            from docx.enum.text import WD_ALIGN_PARAGRAPH
            from docx.oxml.ns import qn
        except ImportError:
            raise ImportError("python-docx is required for Word export. Install it with: pip install python-docx")

        # Setup i18n
        lang = getattr(audit, 'language', 'uk') or 'uk'
        t = get_translator(lang)

        t_labels = {
            "express_title": t("report.express_title"),
            "generated_at": t("report.generated_at"),
            "overview": t("report.overview"),
            "pages_crawled": t("report.pages_crawled"),
            "passed_checks": t("report.passed_checks"),
            "warnings": t("report.warnings"),
            "critical_issues": t("report.critical_issues"),
            "theory_title": t("report.theory_title"),
            "examples": t("report.examples"),
            "recommendation": t("report.recommendation"),
            "no_issues": t("report.no_issues"),
            "pagespeed_screenshots": t("report.pagespeed_screenshots"),
            "homepage_screenshot_title": t("report.homepage_screenshot_title"),
        }

        # Extract domain
        domain = extract_domain(audit.url)

        # Create document
        doc = Document()

        # --- Setup Inter font for styles ---
        from docx.oxml import OxmlElement

        def _set_style_font(s, font_name='Inter'):
            s.font.name = font_name
            rPr = s.element.get_or_add_rPr()
            r_fonts = rPr.find(qn('w:rFonts'))
            if r_fonts is None:
                r_fonts = OxmlElement('w:rFonts')
                rPr.append(r_fonts)
            r_fonts.set(qn('w:ascii'), font_name)
            r_fonts.set(qn('w:hAnsi'), font_name)
            r_fonts.set(qn('w:cs'), font_name)

        style = doc.styles['Normal']
        style.font.size = Pt(10)
        _set_style_font(style)

        for heading_level in range(1, 4):
            style_name = f'Heading {heading_level}'
            if style_name in doc.styles:
                h_style = doc.styles[style_name]
                h_style.font.color.rgb = RGBColor(31, 41, 55)
                _set_style_font(h_style)

        # Resolve brand primary color for DOCX accents (default: blue #3B82F6)
        brand_primary_hex = '3B82F6'
        brand_primary_rgb = (59, 130, 246)
        if brand and brand.get('primary_color'):
            hex_val = brand['primary_color'].lstrip('#')
            if len(hex_val) == 6:
                brand_primary_hex = hex_val.upper()
                brand_primary_rgb = (int(hex_val[0:2], 16), int(hex_val[2:4], 16), int(hex_val[4:6], 16))

        # --- Company Name (if branded) ---
        if brand and brand.get('company_name'):
            company_para = doc.add_paragraph()
            company_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = company_para.add_run(brand['company_name'])
            self._docx_set_font(run, size_pt=12, bold=True, color_rgb=brand_primary_rgb)

        # --- Title ---
        title_text = f"{t_labels['express_title']}: {domain}"
        title_para = doc.add_heading(title_text, 0)
        title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for run in title_para.runs:
            self._docx_set_font(run, size_pt=22, bold=True, color_rgb=(31, 41, 55))

        # Subtitle with date
        subtitle = doc.add_paragraph()
        subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = subtitle.add_run(f"{t_labels['generated_at']}: {datetime.now().strftime('%d.%m.%Y %H:%M')}")
        self._docx_set_font(run, size_pt=11, color_rgb=(128, 128, 128))

        # URL
        url_para = doc.add_paragraph()
        url_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = url_para.add_run(audit.url)
        self._docx_set_font(run, size_pt=10, color_rgb=brand_primary_rgb)

        doc.add_paragraph()

        # --- Summary Section ---
        overview_heading = doc.add_heading(t_labels['overview'], level=1)
        overview_heading.paragraph_format.space_after = Pt(16)

        summary_table = doc.add_table(rows=2, cols=4)
        summary_table.style = 'Table Grid'

        summary_items = [
            (t_labels['pages_crawled'], str(audit.pages_crawled), brand_primary_hex),
            (t_labels['passed_checks'], str(audit.passed_checks), '10B981'),
            (t_labels['warnings'], str(audit.warnings), 'F59E0B'),
            (t_labels['critical_issues'], str(audit.critical_issues), 'EF4444'),
        ]

        for i, (label, value, color) in enumerate(summary_items):
            # Header cell
            header_cell = summary_table.rows[0].cells[i]
            header_cell.text = ''
            p = header_cell.paragraphs[0]
            run = p.add_run(label)
            self._docx_set_font(run, size_pt=9, bold=True, color_rgb=(107, 114, 128))
            self._docx_set_cell_left_border(header_cell, color, '24')
            self._docx_set_cell_margins(header_cell, top=40, right=80, bottom=0, left=80)

            # Value cell
            value_cell = summary_table.rows[1].cells[i]
            value_cell.text = ''
            p = value_cell.paragraphs[0]
            run = p.add_run(value)
            self._docx_set_font(run, size_pt=18, bold=True, color_rgb=(31, 41, 55))
            self._docx_set_cell_left_border(value_cell, color, '24')
            self._docx_set_cell_margins(value_cell, top=0, right=80, bottom=40, left=80)

        doc.add_paragraph()

        # --- Homepage Screenshot ---
        if audit.homepage_screenshot:
            import base64 as b64
            from io import BytesIO
            hp_title = t_labels.get("homepage_screenshot_title", "Homepage")
            hp_heading = doc.add_heading(hp_title, level=1)
            hp_heading.paragraph_format.space_after = Pt(12)
            try:
                img_bytes = b64.b64decode(audit.homepage_screenshot)
                img_stream = BytesIO(img_bytes)
                doc.add_picture(img_stream, width=Inches(6.0))
            except Exception as e:
                logger.warning(f"Failed to add homepage screenshot to DOCX: {e}")
            doc.add_paragraph()

        # --- Results Sections ---
        section_order = [
            "cms", "meta_tags", "headings", "page_404", "speed",
            "images", "content", "links", "favicon", "external_links",
            "robots", "structure", "content_sections",
            "schema", "social_tags", "security", "mobile",
            "url_quality", "hreflang", "duplicates", "redirects",
        ]

        severity_badge_text = {
            SeverityLevel.SUCCESS: ("✓", (16, 185, 129)),
            SeverityLevel.WARNING: ("⚠", (245, 158, 11)),
            SeverityLevel.ERROR: ("✗", (239, 68, 68)),
            SeverityLevel.INFO: ("ℹ", brand_primary_rgb),
        }

        for name in section_order:
            if name not in audit.results:
                continue

            result = audit.results[name]

            # Translate content if needed
            if lang != 'uk':
                result = translate_analyzer_content(result, lang, t)

            # Get translated section title
            section_title = t(f"analyzers.{name}.name")
            if section_title == f"analyzers.{name}.name":
                section_title = result.display_name

            # Section heading
            heading = doc.add_heading(section_title, level=1)
            heading.paragraph_format.keep_with_next = True

            # Add severity badge after heading
            badge_text, badge_color = severity_badge_text.get(
                result.severity, ("ℹ", (59, 130, 246))
            )
            run = heading.add_run(f"  [{badge_text}]")
            self._docx_set_font(run, size_pt=12, bold=False, color_rgb=badge_color)

            # Summary
            if result.summary:
                p = doc.add_paragraph()
                p.paragraph_format.space_after = Pt(8)
                p.paragraph_format.keep_with_next = True
                run = p.add_run(result.summary)
                self._docx_set_font(run, size_pt=10, bold=True)

            # Theory section
            if result.theory:
                p = doc.add_paragraph()
                p.paragraph_format.space_after = Pt(4)
                p.paragraph_format.keep_with_next = True
                run = p.add_run(t_labels['theory_title'])
                self._docx_set_font(run, size_pt=10, bold=True, color_rgb=(75, 85, 99))
                self._docx_parse_theory(doc, result.theory)
                doc.add_paragraph()  # spacing after theory

            # Issues
            if result.issues:
                for issue in result.issues:
                    self._docx_add_issue_card(doc, issue, t_labels)
                    # Small spacing between cards
                    spacer = doc.add_paragraph()
                    spacer.paragraph_format.space_before = Pt(2)
                    spacer.paragraph_format.space_after = Pt(2)
            elif not result.tables:
                p = doc.add_paragraph()
                run = p.add_run(f"✓ {t_labels['no_issues']}")
                self._docx_set_font(run, size_pt=10, color_rgb=(16, 185, 129))

            # Tables
            for table_info in result.tables:
                if not table_info.get("rows"):
                    continue

                # Table title
                table_title = table_info.get("title", "")
                if table_title:
                    p = doc.add_paragraph()
                    p.paragraph_format.space_before = Pt(8)
                    p.paragraph_format.keep_with_next = True
                    run = p.add_run(table_title)
                    self._docx_set_font(run, size_pt=10, bold=True)

                headers = table_info.get("headers", [])
                rows = table_info.get("rows", [])

                if headers and rows:
                    table = doc.add_table(rows=len(rows) + 1, cols=len(headers))
                    table.style = 'Table Grid'

                    # Header row with gray background
                    for col_idx, header in enumerate(headers):
                        cell = table.rows[0].cells[col_idx]
                        cell.text = ''
                        p = cell.paragraphs[0]
                        run = p.add_run(header)
                        self._docx_set_font(run, size_pt=9, bold=True)
                        self._docx_set_cell_shading(cell, 'F3F4F6')
                        self._docx_set_cell_margins(cell, top=50, right=80, bottom=50, left=80)

                    # Data rows
                    for row_idx, row_data in enumerate(rows):
                        for col_idx, header in enumerate(headers):
                            value = row_data.get(header, "")
                            cell = table.rows[row_idx + 1].cells[col_idx]
                            cell.text = ''
                            p = cell.paragraphs[0]
                            self._docx_add_formatted_cell(p, value, font_size_pt=9)
                            self._docx_set_cell_margins(cell, top=40, right=80, bottom=40, left=80)
                            # Alternating row shading
                            if row_idx % 2 == 1:
                                self._docx_set_cell_shading(cell, 'F9FAFB')

            # Embed PageSpeed screenshots if available
            if name == "speed" and result.data:
                mobile_ss = result.data.get("mobile_screenshot")
                desktop_ss = result.data.get("desktop_screenshot")
                if mobile_ss or desktop_ss:
                    import base64 as b64
                    from io import BytesIO

                    p = doc.add_paragraph()
                    p.paragraph_format.space_before = Pt(8)
                    p.paragraph_format.keep_with_next = True
                    run = p.add_run(t_labels.get("pagespeed_screenshots", "PageSpeed Screenshots"))
                    self._docx_set_font(run, size_pt=10, bold=True)

                    for label, ss_data in [("Mobile", mobile_ss), ("Desktop", desktop_ss)]:
                        if ss_data:
                            p = doc.add_paragraph()
                            p.paragraph_format.space_before = Pt(4)
                            run = p.add_run(label)
                            self._docx_set_font(run, size_pt=9, bold=True, color_rgb=(75, 85, 99))

                            try:
                                img_bytes = b64.b64decode(ss_data)
                                img_stream = BytesIO(img_bytes)
                                doc.add_picture(img_stream, width=Inches(6.0))
                            except Exception as e:
                                logger.warning(f"Failed to add PageSpeed screenshot to DOCX: {e}")

            doc.add_paragraph()  # spacing between sections

        # Save document
        docx_filename = f"audit_{audit.id}.docx"
        docx_path = Path(settings.REPORTS_DIR) / docx_filename
        doc.save(docx_path)

        return str(docx_path)


def get_report_generator() -> 'ReportGenerator':
    """Get singleton ReportGenerator instance to cache Jinja2 environment."""
    global _report_generator_instance
    if _report_generator_instance is None:
        _report_generator_instance = ReportGenerator()
    return _report_generator_instance
