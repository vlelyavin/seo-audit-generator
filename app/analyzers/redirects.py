"""Redirects analyzer."""

from typing import Any, Dict, List

from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel
from .base import BaseAnalyzer


class RedirectsAnalyzer(BaseAnalyzer):
    """Analyzer for redirect chains and internal links to redirects."""

    name = "redirects"
    icon = ""

    def __init__(self):
        super().__init__()

    @property
    def display_name(self) -> str:
        return self.t("analyzers.redirects.name")

    @property
    def description(self) -> str:
        return self.t("analyzers.redirects.description")

    @property
    def theory(self) -> str:
        return self.t("analyzer_content.redirects.theory")

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []
        tables: List[Dict[str, Any]] = []

        # Step 1: Analyze redirect chains
        chains_2_hops: List[Dict[str, Any]] = []  # WARNING: 2 hops
        chains_3_plus: List[Dict[str, Any]] = []  # ERROR: 3+ hops
        all_chains: List[Dict[str, Any]] = []

        # Build a set of URLs that redirect (have redirect_chain with 2+ entries)
        redirecting_urls: Dict[str, str] = {}  # url -> final_url

        for url, page in pages.items():
            if len(page.redirect_chain) >= 2:
                chain_length = len(page.redirect_chain) - 1  # number of hops
                start_url = page.redirect_chain[0]
                end_url = page.redirect_chain[-1]

                redirecting_urls[url] = end_url

                chain_info = {
                    "start_url": start_url,
                    "end_url": end_url,
                    "hops": chain_length,
                    "chain": page.redirect_chain,
                }

                all_chains.append(chain_info)

                if chain_length >= 3:
                    chains_3_plus.append(chain_info)
                elif chain_length == 2:
                    chains_2_hops.append(chain_info)

        # Step 2: Check internal links pointing to redirecting URLs
        internal_links_to_redirects: List[Dict[str, str]] = []

        for url, page in pages.items():
            if page.status_code != 200:
                continue

            for link in page.internal_links:
                if link in redirecting_urls:
                    internal_links_to_redirects.append({
                        "source": url,
                        "target": link,
                        "final_url": redirecting_urls[link],
                    })

        # Step 3: Create issues
        has_issues = False

        if chains_3_plus:
            has_issues = True
            affected = [chain["start_url"] for chain in chains_3_plus]
            issues.append(self.create_issue(
                category="long_redirect_chains",
                severity=SeverityLevel.ERROR,
                message=self.t("analyzer_content.redirects.issues.long_redirect_chains", count=len(chains_3_plus)),
                details=self.t("analyzer_content.redirects.details.long_redirect_chains"),
                affected_urls=affected[:20],
                recommendation=self.t("analyzer_content.redirects.recommendations.long_redirect_chains"),
                count=len(chains_3_plus),
            ))

        if chains_2_hops:
            has_issues = True
            affected = [chain["start_url"] for chain in chains_2_hops]
            issues.append(self.create_issue(
                category="redirect_chains",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.redirects.issues.redirect_chains", count=len(chains_2_hops)),
                details=self.t("analyzer_content.redirects.details.redirect_chains"),
                affected_urls=affected[:20],
                recommendation=self.t("analyzer_content.redirects.recommendations.redirect_chains"),
                count=len(chains_2_hops),
            ))

        if internal_links_to_redirects:
            has_issues = True
            affected = list(set(item["source"] for item in internal_links_to_redirects))
            issues.append(self.create_issue(
                category="internal_links_to_redirects",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.redirects.issues.internal_links_to_redirects", count=len(internal_links_to_redirects)),
                details=self.t("analyzer_content.redirects.details.internal_links_to_redirects"),
                affected_urls=affected[:20],
                recommendation=self.t("analyzer_content.redirects.recommendations.internal_links_to_redirects"),
                count=len(internal_links_to_redirects),
            ))

        if not has_issues:
            issues.append(self.create_issue(
                category="no_redirect_issues",
                severity=SeverityLevel.SUCCESS,
                message=self.t("analyzer_content.redirects.issues.no_redirect_issues"),
                details=self.t("analyzer_content.redirects.details.no_redirect_issues"),
                recommendation=self.t("analyzer_content.redirects.recommendations.no_redirect_issues"),
            ))

        # Step 4: Create table
        table_data = []

        # Sort chains by hops descending
        all_chains.sort(key=lambda x: x["hops"], reverse=True)

        h_start = self.t("table_translations.headers.Initial URL")
        h_end = self.t("table_translations.headers.Final URL")
        h_hops = self.t("table_translations.headers.Hops")

        for chain in all_chains[:10]:
            table_data.append({
                h_start: chain["start_url"][:70] + "..." if len(chain["start_url"]) > 70 else chain["start_url"],
                h_end: chain["end_url"][:70] + "..." if len(chain["end_url"]) > 70 else chain["end_url"],
                h_hops: chain["hops"],
            })

        if table_data:
            tables.append({
                "title": self.t("table_translations.titles.Redirect Chains"),
                "headers": [h_start, h_end, h_hops],
                "rows": table_data,
            })

        # Step 5: Summary
        total_chains = len(chains_2_hops) + len(chains_3_plus)
        if total_chains > 0:
            summary = self.t("analyzer_content.redirects.summary.found", count=total_chains)
        else:
            summary = self.t("analyzer_content.redirects.summary.ok")

        severity = self._determine_overall_severity(issues)

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "total_redirects": len(all_chains),
                "chains_2_hops": len(chains_2_hops),
                "chains_3_plus": len(chains_3_plus),
                "internal_links_to_redirects": len(internal_links_to_redirects),
            },
            tables=tables,
        )
