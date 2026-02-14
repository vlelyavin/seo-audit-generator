"""Schema.org structured data analyzer."""

import json
from collections import Counter
from typing import Any, Dict, List

from bs4 import BeautifulSoup

from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class SchemaAnalyzer(BaseAnalyzer):
    """Analyzer for Schema.org structured data detection."""

    name = "schema"
    icon = ""

    def __init__(self):
        super().__init__()

    @property
    def display_name(self) -> str:
        return self.t("analyzers.schema.name")

    @property
    def description(self) -> str:
        return self.t("analyzers.schema.description")

    @property
    def theory(self) -> str:
        return self.t("analyzer_content.schema.theory")

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []
        tables: List[Dict[str, Any]] = []

        pages_with_schema: set = set()
        pages_without_schema: List[str] = []
        schema_types: Counter = Counter()
        schema_type_examples: Dict[str, str] = {}  # type -> first example URL
        pages_with_json_ld: set = set()
        pages_with_microdata: set = set()
        json_ld_errors: List[Dict[str, str]] = []

        total_pages = 0

        for url, page in pages.items():
            if page.status_code != 200 or not page.html_content:
                continue

            total_pages += 1
            soup = page.get_soup()
            if soup is None:
                continue

            page_has_schema = False

            # Find JSON-LD blocks
            json_ld_scripts = soup.find_all('script', type='application/ld+json')
            for script in json_ld_scripts:
                try:
                    content = script.string
                    if not content:
                        continue
                    data = json.loads(content)
                    pages_with_json_ld.add(url)
                    page_has_schema = True

                    # Extract @type(s)
                    self._extract_types(data, url, schema_types, schema_type_examples)

                except (json.JSONDecodeError, ValueError) as e:
                    json_ld_errors.append({
                        'url': url,
                        'error': str(e),
                    })

            # Check for Microdata
            microdata_elements = soup.find_all(attrs={'itemscope': True})
            if microdata_elements:
                pages_with_microdata.add(url)
                page_has_schema = True

                for elem in microdata_elements:
                    itemtype = elem.get('itemtype', '')
                    if itemtype:
                        # Extract type name from URL like "https://schema.org/Product"
                        type_name = itemtype.rstrip('/').split('/')[-1]
                        if type_name:
                            schema_types[type_name] += 1
                            if type_name not in schema_type_examples:
                                schema_type_examples[type_name] = url

            if page_has_schema:
                pages_with_schema.add(url)
            else:
                pages_without_schema.append(url)

        # Create issues
        num_types = len(schema_types)
        num_pages_with = len(pages_with_schema)

        if num_pages_with > 0:
            issues.append(self.create_issue(
                category="has_structured_data",
                severity=SeverityLevel.SUCCESS,
                message=self.t("analyzer_content.schema.issues.has_structured_data", count=num_types),
                details=self.t("analyzer_content.schema.details.has_structured_data"),
                recommendation=self.t("analyzer_content.schema.recommendations.has_structured_data"),
                count=num_pages_with,
            ))

        if total_pages > 0 and len(pages_without_schema) > total_pages * 0.5:
            issues.append(self.create_issue(
                category="no_structured_data",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.schema.issues.no_structured_data", count=len(pages_without_schema)),
                details=self.t("analyzer_content.schema.details.no_structured_data"),
                affected_urls=pages_without_schema[:20],
                recommendation=self.t("analyzer_content.schema.recommendations.no_structured_data"),
                count=len(pages_without_schema),
            ))

        # Check for Organization on homepage
        home_page = pages.get(base_url) or pages.get(base_url + "/")
        if home_page and 'Organization' not in schema_types and 'LocalBusiness' not in schema_types:
            issues.append(self.create_issue(
                category="missing_organization",
                severity=SeverityLevel.INFO,
                message=self.t("analyzer_content.schema.issues.missing_organization"),
                details=self.t("analyzer_content.schema.details.missing_organization"),
                affected_urls=[base_url],
                recommendation=self.t("analyzer_content.schema.recommendations.missing_organization"),
            ))

        # Check for BreadcrumbList
        if 'BreadcrumbList' not in schema_types:
            issues.append(self.create_issue(
                category="missing_breadcrumbs",
                severity=SeverityLevel.INFO,
                message=self.t("analyzer_content.schema.issues.missing_breadcrumbs"),
                details=self.t("analyzer_content.schema.details.missing_breadcrumbs"),
                recommendation=self.t("analyzer_content.schema.recommendations.missing_breadcrumbs"),
            ))

        # JSON-LD parsing errors
        if json_ld_errors:
            error_urls = list(set(e['url'] for e in json_ld_errors))
            issues.append(self.create_issue(
                category="json_ld_errors",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.schema.issues.json_ld_errors", count=len(error_urls)),
                details=self.t("analyzer_content.schema.details.json_ld_errors"),
                affected_urls=error_urls[:20],
                recommendation=self.t("analyzer_content.schema.recommendations.json_ld_errors"),
                count=len(json_ld_errors),
            ))

        # Create table with schema types
        if schema_types:
            h_type = self.t("table_translations.headers.Schema Type")
            h_count = self.t("table_translations.headers.Count")
            h_example = self.t("table_translations.headers.Example URL")

            table_rows = []
            for type_name, count in schema_types.most_common(10):
                example_url = schema_type_examples.get(type_name, "-")
                table_rows.append({
                    h_type: type_name,
                    h_count: str(count),
                    h_example: example_url,
                })

            tables.append({
                "title": self.t("table_translations.titles.Structured Data Types"),
                "headers": [h_type, h_count, h_example],
                "rows": table_rows[:10],
            })

        # Summary
        if num_pages_with > 0:
            summary = self.t("analyzer_content.schema.summary.found", types=num_types, pages=num_pages_with)
        else:
            summary = self.t("analyzer_content.schema.summary.missing")

        severity = self._determine_overall_severity(issues)

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "total_pages": total_pages,
                "pages_with_schema": num_pages_with,
                "pages_without_schema": len(pages_without_schema),
                "pages_with_json_ld": len(pages_with_json_ld),
                "pages_with_microdata": len(pages_with_microdata),
                "schema_types": dict(schema_types),
                "json_ld_errors": len(json_ld_errors),
            },
            tables=tables,
        )

    def _extract_types(
        self,
        data: Any,
        url: str,
        schema_types: Counter,
        schema_type_examples: Dict[str, str],
    ) -> None:
        """Recursively extract @type values from JSON-LD data."""
        if isinstance(data, dict):
            # Handle @graph arrays
            if '@graph' in data:
                for item in data['@graph']:
                    self._extract_types(item, url, schema_types, schema_type_examples)

            # Extract @type
            schema_type = data.get('@type')
            if schema_type:
                if isinstance(schema_type, list):
                    for t in schema_type:
                        schema_types[t] += 1
                        if t not in schema_type_examples:
                            schema_type_examples[t] = url
                elif isinstance(schema_type, str):
                    schema_types[schema_type] += 1
                    if schema_type not in schema_type_examples:
                        schema_type_examples[schema_type] = url

        elif isinstance(data, list):
            for item in data:
                self._extract_types(item, url, schema_types, schema_type_examples)
