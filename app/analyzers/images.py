"""Images analyzer."""

import asyncio
from typing import Any, Dict, List
from urllib.parse import urlparse

from ..config import settings
from ..crawler import get_image_size
from ..models import AnalyzerResult, AuditIssue, ImageData, PageData, SeverityLevel
from .base import BaseAnalyzer


class ImagesAnalyzer(BaseAnalyzer):
    """Analyzer for image optimization (alt, format, size)."""

    name = "images"
    icon = ""

    LEGACY_FORMATS = {'jpg', 'jpeg', 'png', 'gif', 'bmp'}
    MODERN_FORMATS = {'webp', 'avif', 'svg'}

    def __init__(self):
        super().__init__()

    @property
    def display_name(self) -> str:
        return self.t("analyzers.images.name")

    @property
    def description(self) -> str:
        return self.t("analyzers.images.description")

    @property
    def theory(self) -> str:
        return self.t("analyzer_content.images.theory")

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []
        tables: List[Dict[str, Any]] = []

        # Collect all unique images
        all_images: Dict[str, Dict[str, Any]] = {}  # src -> {data, pages}

        for url, page in pages.items():
            if page.status_code != 200:
                continue

            for img in page.images:
                src = img.src
                if src not in all_images:
                    all_images[src] = {
                        'data': img,
                        'pages': [],
                    }
                all_images[src]['pages'].append(url)

        total_images = len(all_images)

        # Analyze images
        missing_alt = []
        empty_alt = []
        legacy_format = []
        large_images = []
        critical_images = []

        # Check image sizes (limit to first 50 for performance)
        images_to_check = list(all_images.keys())[:50]

        async def check_image_size(src: str) -> tuple[str, int | None]:
            size = await get_image_size(src)
            return src, size

        # Check sizes concurrently
        size_tasks = [check_image_size(src) for src in images_to_check]
        size_results = await asyncio.gather(*size_tasks, return_exceptions=True)

        image_sizes = {}
        for result in size_results:
            if isinstance(result, tuple):
                src, size = result
                if size is not None:
                    image_sizes[src] = size
                    all_images[src]['data'].size = size

        # Analyze each image
        for src, img_info in all_images.items():
            img: ImageData = img_info['data']
            pages_with_image = img_info['pages']

            # Check alt attribute
            if img.alt is None:
                missing_alt.append({
                    'src': src,
                    'pages': pages_with_image[:3],
                })
            elif img.alt.strip() == '':
                empty_alt.append({
                    'src': src,
                    'pages': pages_with_image[:3],
                })

            # Check format
            format_ext = img.format
            if not format_ext:
                # Try to extract from URL
                path = urlparse(src).path.lower()
                for ext in self.LEGACY_FORMATS | self.MODERN_FORMATS:
                    if path.endswith(f'.{ext}'):
                        format_ext = ext
                        break

            if format_ext and format_ext.lower() in self.LEGACY_FORMATS:
                legacy_format.append({
                    'src': src,
                    'format': format_ext,
                    'pages': pages_with_image[:3],
                })

            # Check size
            size = img.size or image_sizes.get(src)
            if size:
                if size > settings.IMAGE_CRITICAL_SIZE:
                    critical_images.append({
                        'src': src,
                        'size': size,
                        'pages': pages_with_image[:3],
                    })
                elif size > settings.IMAGE_WARNING_SIZE:
                    large_images.append({
                        'src': src,
                        'size': size,
                        'pages': pages_with_image[:3],
                    })

        # Create issues
        if missing_alt:
            issues.append(self.create_issue(
                category="missing_alt",
                severity=SeverityLevel.ERROR,
                message=self.t("analyzer_content.images.issues.missing_alt", count=len(missing_alt)),
                details=self.t("analyzer_content.images.issues.missing_alt_details"),
                affected_urls=[img['src'] for img in missing_alt[:10]],
                recommendation=self.t("analyzer_content.images.issues.missing_alt_recommendation"),
                count=len(missing_alt),
            ))

        if empty_alt:
            issues.append(self.create_issue(
                category="empty_alt",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.images.issues.empty_alt", count=len(empty_alt)),
                details=self.t("analyzer_content.images.issues.empty_alt_details"),
                affected_urls=[img['src'] for img in empty_alt[:10]],
                recommendation=self.t("analyzer_content.images.issues.empty_alt_recommendation"),
                count=len(empty_alt),
            ))

        if legacy_format:
            issues.append(self.create_issue(
                category="legacy_format",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.images.issues.legacy_format", count=len(legacy_format)),
                details=self.t("analyzer_content.images.issues.legacy_format_details"),
                affected_urls=[img['src'] for img in legacy_format[:10]],
                recommendation=self.t("analyzer_content.images.issues.legacy_format_recommendation"),
                count=len(legacy_format),
            ))

        if critical_images:
            issues.append(self.create_issue(
                category="critical_size",
                severity=SeverityLevel.ERROR,
                message=self.t("analyzer_content.images.issues.critical_size", count=len(critical_images)),
                details=self.t("analyzer_content.images.issues.critical_size_details"),
                affected_urls=[img['src'] for img in critical_images[:10]],
                recommendation=self.t("analyzer_content.images.issues.critical_size_recommendation"),
                count=len(critical_images),
            ))

        if large_images:
            issues.append(self.create_issue(
                category="large_size",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.images.issues.large_size", count=len(large_images)),
                details=self.t("analyzer_content.images.issues.large_size_details"),
                affected_urls=[img['src'] for img in large_images[:10]],
                recommendation=self.t("analyzer_content.images.issues.large_size_recommendation"),
                count=len(large_images),
            ))

        # Create table with problematic images
        def format_size(size: int) -> str:
            if size > 1024 * 1024:
                return f"{size / (1024 * 1024):.1f} MB"
            return f"{size / 1024:.0f} KB"

        h_image_url = self.t("tables.image_url")
        h_size = self.t("tables.size")
        h_problem = self.t("tables.problem")
        h_page = self.t("tables.page")

        table_data = []

        for img in critical_images[:10]:
            table_data.append({
                h_image_url: img['src'][:80] + "..." if len(img['src']) > 80 else img['src'],
                h_size: format_size(img['size']),
                h_problem: self.t("analyzer_content.images.issues.problem_critical_size"),
                h_page: img['pages'][0] if img['pages'] else "-",
            })

        for img in large_images[:5]:
            table_data.append({
                h_image_url: img['src'][:80] + "..." if len(img['src']) > 80 else img['src'],
                h_size: format_size(img['size']),
                h_problem: self.t("analyzer_content.images.issues.problem_large_size"),
                h_page: img['pages'][0] if img['pages'] else "-",
            })

        if table_data:
            tables.append({
                "title": self.t("analyzer_content.images.issues.table_title"),
                "headers": [h_image_url, h_size, h_problem, h_page],
                "rows": table_data,
            })

        # Summary
        problems_count = len(missing_alt) + len(critical_images) + len(large_images)

        if not issues:
            summary = self.t("analyzer_content.images.summary.ok", count=total_images)
        else:
            parts = []
            if missing_alt:
                parts.append(self.t("analyzer_content.images.summary.no_alt", count=len(missing_alt)))
            if critical_images or large_images:
                parts.append(self.t("analyzer_content.images.summary.too_large", count=len(critical_images) + len(large_images)))
            if legacy_format:
                parts.append(self.t("analyzer_content.images.summary.legacy_format", count=len(legacy_format)))
            summary = self.t("analyzer_content.images.summary.issues", total=total_images, issues=", ".join(parts))

        severity = self._determine_overall_severity(issues)

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "total_images": total_images,
                "missing_alt": len(missing_alt),
                "empty_alt": len(empty_alt),
                "legacy_format": len(legacy_format),
                "large_images": len(large_images),
                "critical_images": len(critical_images),
                "largest_image": critical_images[0] if critical_images else (large_images[0] if large_images else None),
            },
            tables=tables,
        )
