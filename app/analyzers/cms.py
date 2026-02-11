"""CMS (Content Management System) detection analyzer."""

import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin

from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class CMSAnalyzer(BaseAnalyzer):
    """Analyzer for detecting the CMS/platform used by the website."""

    name = "cms"
    icon = ""

    def __init__(self):
        super().__init__()

    @property
    def display_name(self) -> str:
        return self.t("analyzers.cms.name")

    @property
    def description(self) -> str:
        return self.t("analyzers.cms.description")

    @property
    def theory(self) -> str:
        return self.t("analyzer_content.cms.theory")

    # CMS detection signatures
    CMS_SIGNATURES: Dict[str, Dict[str, Any]] = {
        "WordPress": {
            "meta_generator": [r"WordPress"],
            "html_patterns": [
                r"/wp-content/",
                r"/wp-includes/",
                r"wp-json",
                r'class="wp-',
            ],
            "headers": [],
            "urls": ["/wp-login.php", "/wp-admin/"],
        },
        "Shopify": {
            "meta_generator": [r"Shopify"],
            "html_patterns": [
                r"cdn\.shopify\.com",
                r"Shopify\.theme",
                r"Shopify\.shop",
                r"/collections/",
                r"shopify-section",
            ],
            "headers": ["x-shopify-stage"],
            "urls": [],
        },
        "Joomla": {
            "meta_generator": [r"Joomla"],
            "html_patterns": [
                r"/media/jui/",
                r"/media/system/",
                r"com_content",
                r"Joomla!",
            ],
            "headers": [],
            "urls": ["/administrator/"],
        },
        "Drupal": {
            "meta_generator": [r"Drupal"],
            "html_patterns": [
                r"Drupal\.settings",
                r"/sites/default/files/",
                r"/sites/all/",
                r'data-drupal-',
            ],
            "headers": ["x-drupal-cache", "x-generator"],
            "urls": [],
        },
        "Tilda": {
            "meta_generator": [r"Tilda"],
            "html_patterns": [
                r"tilda\.ws",
                r"tildacdn\.com",
                r"t-records",
                r"t-container",
                r't-cover__',
            ],
            "headers": [],
            "urls": [],
        },
        "1C-Bitrix": {
            "meta_generator": [r"Bitrix"],
            "html_patterns": [
                r"/bitrix/",
                r"BX\.",
                r"bxSession",
                r"bitrix/js/",
                r"bitrix/templates/",
            ],
            "headers": ["x-bitrix-composite"],
            "urls": ["/bitrix/admin/"],
        },
        "OpenCart": {
            "meta_generator": [],
            "html_patterns": [
                r"catalog/view/theme",
                r"route=common/",
                r"route=product/",
                r"index\.php\?route=",
            ],
            "headers": [],
            "urls": [],
        },
        "PrestaShop": {
            "meta_generator": [r"PrestaShop"],
            "html_patterns": [
                r"/modules/ps_",
                r"prestashop",
                r"/themes/classic/",
                r"id_product",
            ],
            "headers": [],
            "urls": [],
        },
        "Wix": {
            "meta_generator": [r"Wix\.com"],
            "html_patterns": [
                r"wix\.com",
                r"wixstatic\.com",
                r"wixsite\.com",
                r"_wix_browser_sess",
            ],
            "headers": [],
            "urls": [],
        },
        "Squarespace": {
            "meta_generator": [r"Squarespace"],
            "html_patterns": [
                r"squarespace\.com",
                r"static\.squarespace",
                r"sqsp",
            ],
            "headers": [],
            "urls": [],
        },
        "Magento": {
            "meta_generator": [r"Magento"],
            "html_patterns": [
                r"Mage\.Cookies",
                r"/skin/frontend/",
                r"/static/frontend/",
                r"mage/cookies",
            ],
            "headers": [],
            "urls": [],
        },
        "MODX": {
            "meta_generator": [r"MODX"],
            "html_patterns": [
                r"modx",
                r"/assets/components/",
            ],
            "headers": [],
            "urls": ["/manager/"],
        },
        "Webflow": {
            "meta_generator": [r"Webflow"],
            "html_patterns": [
                r"webflow\.com",
                r"w-webflow",
                r"wf-page",
            ],
            "headers": [],
            "urls": [],
        },
        "Next.js": {
            "meta_generator": [],
            "html_patterns": [
                r"_next/static",
                r"__NEXT_DATA__",
                r"/_next/",
            ],
            "headers": ["x-nextjs-cache"],
            "urls": [],
        },
        "Nuxt.js": {
            "meta_generator": [],
            "html_patterns": [
                r"_nuxt",
                r"__NUXT__",
                r"nuxt",
            ],
            "headers": [],
            "urls": [],
        },
    }

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []
        tables: List[Dict[str, Any]] = []

        detected_cms: List[Tuple[str, int, List[str]]] = []  # (cms_name, confidence, evidence)

        # Get homepage HTML for analysis
        home_page = pages.get(base_url) or pages.get(base_url + "/")
        if not home_page:
            for url, page in pages.items():
                if page.status_code == 200 and page.html_content:
                    home_page = page
                    break

        html_content = home_page.html_content if home_page else ""

        # Analyze each CMS signature
        for cms_name, signatures in self.CMS_SIGNATURES.items():
            confidence = 0
            evidence = []

            # Check meta generator
            if html_content:
                for pattern in signatures.get("meta_generator", []):
                    if re.search(f'<meta[^>]*generator[^>]*content=["\'][^"\']*{pattern}', html_content, re.IGNORECASE):
                        confidence += 50
                        evidence.append(f"Meta generator: {pattern}")
                        break

                # Check HTML patterns
                for pattern in signatures.get("html_patterns", []):
                    if re.search(pattern, html_content, re.IGNORECASE):
                        confidence += 15
                        evidence.append(f"HTML pattern: {pattern}")

            # Limit confidence
            if confidence > 100:
                confidence = 100

            if confidence >= 30:
                detected_cms.append((cms_name, confidence, evidence))

        # Sort by confidence
        detected_cms.sort(key=lambda x: x[1], reverse=True)

        # Create result
        if detected_cms:
            primary_cms = detected_cms[0]
            cms_name, confidence, evidence = primary_cms

            issues.append(self.create_issue(
                category="cms_detected",
                severity=SeverityLevel.SUCCESS,
                message=self.t("analyzer_content.cms.issues.detected", cms=cms_name),
                details=self.t("analyzer_content.cms.details.detected", evidence=", ".join(evidence[:3])),
                recommendation=self._get_cms_recommendation(cms_name),
            ))

            # If multiple CMS detected, mention it
            if len(detected_cms) > 1:
                other_cms = [name for name, _, _ in detected_cms[1:3]]
                issues.append(self.create_issue(
                    category="multiple_cms",
                    severity=SeverityLevel.INFO,
                    message=self.t("analyzer_content.cms.issues.multiple_detected", cms=", ".join(other_cms)),
                    details=self.t("analyzer_content.cms.issues.multiple_detected_details"),
                ))
        else:
            issues.append(self.create_issue(
                category="cms_unknown",
                severity=SeverityLevel.INFO,
                message=self.t("analyzer_content.cms.issues.unknown"),
                details=self.t("analyzer_content.cms.details.unknown"),
            ))

        # Summary
        if detected_cms:
            primary = detected_cms[0]
            summary = self.t("analyzer_content.cms.summary.detected", cms=primary[0])
        else:
            summary = self.t("analyzer_content.cms.summary.unknown")

        return self.create_result(
            severity=SeverityLevel.SUCCESS if detected_cms else SeverityLevel.INFO,
            summary=summary,
            issues=issues,
            data={
                "detected_cms": [name for name, _, _ in detected_cms],
                "primary_cms": detected_cms[0][0] if detected_cms else None,
            },
            tables=tables,
        )

    def _get_cms_recommendation(self, cms_name: str) -> str:
        """Get SEO recommendations for specific CMS."""
        # Map CMS names to translation keys
        cms_key_map = {
            "WordPress": "wordpress",
            "Shopify": "shopify",
            "Joomla": "joomla",
            "Drupal": "drupal",
            "Tilda": "tilda",
            "1C-Bitrix": "bitrix",
            "OpenCart": "opencart",
            "Wix": "wix",
            "Magento": "magento",
            "Next.js": "nextjs",
        }

        cms_key = cms_key_map.get(cms_name)
        if cms_key:
            return self.t(f"analyzers.cms.recommendation_{cms_key}")
        return self.t("analyzer_content.cms.issues.recommendation_default")
