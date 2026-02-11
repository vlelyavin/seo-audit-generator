"""External links analyzer."""

from collections import Counter
from typing import Any, Dict, List
from urllib.parse import urlparse

from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class ExternalLinksAnalyzer(BaseAnalyzer):
    """Analyzer for external outbound links."""

    name = "external_links"
    icon = ""

    def __init__(self):
        super().__init__()

    @property
    def display_name(self) -> str:
        return self.t("analyzers.external_links.name")

    @property
    def description(self) -> str:
        return self.t("analyzers.external_links.description")

    @property
    def theory(self) -> str:
        return self.t("analyzer_content.external_links.theory")

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []
        tables: List[Dict[str, Any]] = []

        # Collect all external links
        all_external_links = []
        domains_count: Counter = Counter()
        links_without_nofollow = []
        commercial_domains = []

        # Known commercial/affiliate domains that might need nofollow
        commercial_patterns = [
            'amazon.', 'ebay.', 'aliexpress.',
            'booking.com', 'agoda.com', 'hotels.com',
            'click.', 'affiliate.', 'partner.',
            'ad.', 'ads.', 'track.', 'tracking.',
        ]

        for url, page in pages.items():
            if page.status_code != 200:
                continue

            for link in page.external_links:
                href = link.href
                all_external_links.append({
                    'href': href,
                    'source': url,
                    'has_nofollow': link.has_nofollow,
                    'text': link.text,
                })

                # Count domains
                try:
                    domain = urlparse(href).netloc.lower()
                    domains_count[domain] += 1

                    # Check if commercial without nofollow
                    is_commercial = any(pattern in domain for pattern in commercial_patterns)
                    if is_commercial and not link.has_nofollow:
                        commercial_domains.append({
                            'href': href,
                            'source': url,
                            'domain': domain,
                        })

                except Exception:
                    pass

                # Track links without nofollow
                if not link.has_nofollow:
                    links_without_nofollow.append({
                        'href': href,
                        'source': url,
                    })

        total_external = len(all_external_links)
        unique_domains = len(domains_count)

        # Create issues
        if commercial_domains:
            issues.append(self.create_issue(
                category="commercial_no_nofollow",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.external_links.issues.commercial_no_nofollow", count=len(commercial_domains)),
                details=self.t("analyzer_content.external_links.issues.commercial_no_nofollow_details"),
                affected_urls=[link['href'] for link in commercial_domains[:20]],
                recommendation=self.t("analyzer_content.external_links.issues.commercial_no_nofollow_recommendation"),
                count=len(commercial_domains),
            ))

        # Check ratio of dofollow links
        dofollow_count = len(links_without_nofollow)
        if total_external > 10 and dofollow_count / total_external > 0.9:
            issues.append(self.create_issue(
                category="many_dofollow",
                severity=SeverityLevel.INFO,
                message=self.t("analyzer_content.external_links.issues.many_dofollow", dofollow=dofollow_count, total=total_external),
                details=self.t("analyzer_content.external_links.issues.many_dofollow_details"),
                recommendation=self.t("analyzer_content.external_links.issues.many_dofollow_recommendation"),
            ))

        # Check for suspicious/many links to same domain
        for domain, count in domains_count.most_common(5):
            if count > 10:
                issues.append(self.create_issue(
                    category="many_links_same_domain",
                    severity=SeverityLevel.INFO,
                    message=self.t("analyzer_content.external_links.issues.many_links_same_domain", domain=domain, count=count),
                    details=self.t("analyzer_content.external_links.issues.many_links_same_domain_details", count=count),
                    recommendation=self.t("analyzer_content.external_links.issues.many_links_same_domain_recommendation"),
                ))

        # Create table with top domains
        if domains_count:
            top_domains = domains_count.most_common(10)
            h_domain = self.t("tables.domain")
            h_count = self.t("tables.link_count")
            h_nofollow = self.t("tables.with_nofollow")
            table_data = []

            for domain, count in top_domains:
                # Find if most are nofollow
                domain_links = [l for l in all_external_links if domain in l['href']]
                nofollow_count = sum(1 for l in domain_links if l['has_nofollow'])

                table_data.append({
                    h_domain: domain[:50] + "..." if len(domain) > 50 else domain,
                    h_count: count,
                    h_nofollow: f"{nofollow_count}/{count}",
                })

            tables.append({
                "title": self.t("analyzer_content.external_links.issues.table_title"),
                "headers": [h_domain, h_count, h_nofollow],
                "rows": table_data,
            })

        # Summary
        if not issues:
            summary = self.t("analyzer_content.external_links.summary.ok", total=total_external, domains=unique_domains)
            severity = SeverityLevel.SUCCESS
        else:
            warning_count = sum(1 for i in issues if i.severity == SeverityLevel.WARNING)
            info_count = sum(1 for i in issues if i.severity == SeverityLevel.INFO)
            summary = self.t("analyzer_content.external_links.summary.issues", total=total_external, warnings=warning_count, info=info_count)
            severity = self._determine_overall_severity(issues)

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "total_external_links": total_external,
                "unique_domains": unique_domains,
                "dofollow_count": dofollow_count,
                "nofollow_count": total_external - dofollow_count,
                "commercial_without_nofollow": len(commercial_domains),
                "top_domains": dict(domains_count.most_common(10)),
            },
            tables=tables,
        )
