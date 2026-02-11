"""Page speed analyzer using Google PageSpeed Insights API."""

import asyncio
import logging
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import aiohttp

from ..config import settings

logger = logging.getLogger(__name__)
from ..models import AnalyzerResult, AuditIssue, PageSpeedResult, SpeedMetrics, PageData, SeverityLevel
from .base import BaseAnalyzer


class SpeedAnalyzer(BaseAnalyzer):
    """Analyzer for page speed using Google PageSpeed Insights API."""

    name = "speed"
    icon = ""

    def __init__(self):
        super().__init__()

    @property
    def display_name(self) -> str:
        return self.t("analyzers.speed.name")

    @property
    def description(self) -> str:
        return self.t("analyzers.speed.description")

    @property
    def theory(self) -> str:
        return self.t("analyzer_content.speed.theory")

    # Target metrics (in seconds where applicable)
    MOBILE_TARGETS = {
        'fcp': 1.8,  # First Contentful Paint
        'lcp': 2.5,  # Largest Contentful Paint
        'speed_index': 3.5,
    }

    DESKTOP_TARGETS = {
        'fcp': 1.0,
        'lcp': 1.5,
        'speed_index': 1.0,
    }

    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        issues: List[AuditIssue] = []
        tables: List[Dict[str, Any]] = []

        # Get PageSpeed results for the main URL
        pagespeed_result = await self._get_pagespeed_insights(base_url)

        if not pagespeed_result.mobile and not pagespeed_result.desktop:
            error_details = pagespeed_result.error or self.t("analyzer_content.speed.issues.api_unavailable")
            issues.append(self.create_issue(
                category="pagespeed_unavailable",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.speed.issues.no_data"),
                details=error_details,
                recommendation=self.t("analyzer_content.speed.issues.check_manually"),
            ))
            return self.create_result(
                severity=SeverityLevel.WARNING,
                summary=self.t("analyzer_content.speed.issues.no_speed_data"),
                issues=issues,
                data={"error": error_details},
            )

        # Analyze mobile results
        if pagespeed_result.mobile:
            mobile = pagespeed_result.mobile
            mobile_issues = self._analyze_metrics(mobile, self.MOBILE_TARGETS, "Mobile")
            issues.extend(mobile_issues)

            # Score-based issues
            if mobile.score < 50:
                issues.append(self.create_issue(
                    category="mobile_score_critical",
                    severity=SeverityLevel.ERROR,
                    message=self.t("analyzer_content.speed.issues.mobile_critical", score=mobile.score),
                    details=self.t("analyzer_content.speed.issues.mobile_critical_details"),
                    recommendation=self.t("analyzer_content.speed.issues.mobile_critical_recommendation"),
                ))
            elif mobile.score < 70:
                issues.append(self.create_issue(
                    category="mobile_score_low",
                    severity=SeverityLevel.WARNING,
                    message=self.t("analyzer_content.speed.issues.mobile_low", score=mobile.score),
                    details=self.t("analyzer_content.speed.issues.mobile_low_details"),
                    recommendation=self.t("analyzer_content.speed.issues.mobile_low_recommendation"),
                ))

        # Analyze desktop results
        if pagespeed_result.desktop:
            desktop = pagespeed_result.desktop
            desktop_issues = self._analyze_metrics(desktop, self.DESKTOP_TARGETS, "Desktop")
            issues.extend(desktop_issues)

            if desktop.score < 50:
                issues.append(self.create_issue(
                    category="desktop_score_critical",
                    severity=SeverityLevel.ERROR,
                    message=self.t("analyzer_content.speed.issues.desktop_critical", score=desktop.score),
                    details=self.t("analyzer_content.speed.issues.desktop_critical_details"),
                    recommendation=self.t("analyzer_content.speed.issues.desktop_critical_recommendation"),
                ))
            elif desktop.score < 70:
                issues.append(self.create_issue(
                    category="desktop_score_low",
                    severity=SeverityLevel.WARNING,
                    message=self.t("analyzer_content.speed.issues.desktop_low", score=desktop.score),
                    details=self.t("analyzer_content.speed.issues.desktop_low_details"),
                    recommendation=self.t("analyzer_content.speed.issues.desktop_low_recommendation"),
                ))

        # Create metrics table
        # Get translated header keys
        h_metric = self.t("tables.metric")
        h_target = self.t("tables.target")

        table_data = []

        if pagespeed_result.mobile:
            m = pagespeed_result.mobile
            table_data.append({
                h_metric: "Performance Score",
                "Mobile": f"{m.score}/100 {'✓' if m.score >= 70 else '⚠️' if m.score >= 50 else '✗'}",
                "Desktop": f"{pagespeed_result.desktop.score}/100 {'✓' if pagespeed_result.desktop.score >= 70 else '⚠️' if pagespeed_result.desktop.score >= 50 else '✗'}" if pagespeed_result.desktop else "-",
                h_target: "≥ 70",
            })

            if m.fcp is not None:
                table_data.append({
                    h_metric: "First Contentful Paint (FCP)",
                    "Mobile": f"{m.fcp:.1f}s {'✓' if m.fcp <= self.MOBILE_TARGETS['fcp'] else '✗'}",
                    "Desktop": f"{pagespeed_result.desktop.fcp:.1f}s" if pagespeed_result.desktop and pagespeed_result.desktop.fcp else "-",
                    h_target: f"≤ {self.MOBILE_TARGETS['fcp']}s / {self.DESKTOP_TARGETS['fcp']}s",
                })

            if m.lcp is not None:
                table_data.append({
                    h_metric: "Largest Contentful Paint (LCP)",
                    "Mobile": f"{m.lcp:.1f}s {'✓' if m.lcp <= self.MOBILE_TARGETS['lcp'] else '✗'}",
                    "Desktop": f"{pagespeed_result.desktop.lcp:.1f}s" if pagespeed_result.desktop and pagespeed_result.desktop.lcp else "-",
                    h_target: f"≤ {self.MOBILE_TARGETS['lcp']}s / {self.DESKTOP_TARGETS['lcp']}s",
                })

            if m.cls is not None:
                table_data.append({
                    h_metric: "Cumulative Layout Shift (CLS)",
                    "Mobile": f"{m.cls:.3f} {'✓' if m.cls <= 0.1 else '✗'}",
                    "Desktop": f"{pagespeed_result.desktop.cls:.3f}" if pagespeed_result.desktop and pagespeed_result.desktop.cls else "-",
                    h_target: "≤ 0.1",
                })

            if m.tbt is not None:
                table_data.append({
                    h_metric: "Total Blocking Time (TBT)",
                    "Mobile": f"{m.tbt:.0f}ms {'✓' if m.tbt <= 300 else '✗'}",
                    "Desktop": f"{pagespeed_result.desktop.tbt:.0f}ms" if pagespeed_result.desktop and pagespeed_result.desktop.tbt else "-",
                    h_target: "≤ 300ms",
                })

            if m.speed_index is not None:
                table_data.append({
                    h_metric: "Speed Index",
                    "Mobile": f"{m.speed_index:.1f}s {'✓' if m.speed_index <= self.MOBILE_TARGETS['speed_index'] else '✗'}",
                    "Desktop": f"{pagespeed_result.desktop.speed_index:.1f}s" if pagespeed_result.desktop and pagespeed_result.desktop.speed_index else "-",
                    h_target: f"≤ {self.MOBILE_TARGETS['speed_index']}s / {self.DESKTOP_TARGETS['speed_index']}s",
                })

        if table_data:
            tables.append({
                "title": self.t("analyzer_content.speed.issues.table_title"),
                "headers": [
                    self.t("tables.metric"),
                    "Mobile",
                    "Desktop",
                    self.t("tables.target")
                ],
                "rows": table_data,
            })

        # Capture PageSpeed screenshots (sequential, single browser session).
        # Called after API results are fetched so pagespeed.web.dev shows cached data.
        mobile_screenshot = None
        desktop_screenshot = None
        try:
            from ..screenshots import screenshot_capture
            logger.info("Capturing PageSpeed screenshots...")
            mobile_screenshot, desktop_screenshot = await screenshot_capture.capture_pagespeed_both(base_url)
            logger.info(f"Screenshots captured: mobile={bool(mobile_screenshot)}, desktop={bool(desktop_screenshot)}")
        except Exception as e:
            logger.warning(f"Screenshot capture failed (non-fatal): {e}")

        # Summary
        mobile_score = pagespeed_result.mobile.score if pagespeed_result.mobile else 0
        desktop_score = pagespeed_result.desktop.score if pagespeed_result.desktop else 0

        if mobile_score >= 70 and desktop_score >= 70:
            summary = self.t("analyzer_content.speed.summary.good", mobile=mobile_score, desktop=desktop_score)
            if not any(i.severity == SeverityLevel.ERROR for i in issues):
                severity = SeverityLevel.SUCCESS
            else:
                severity = SeverityLevel.WARNING
        elif mobile_score >= 50 or desktop_score >= 50:
            summary = self.t("analyzer_content.speed.summary.needs_optimization", mobile=mobile_score, desktop=desktop_score)
            severity = SeverityLevel.WARNING
        else:
            summary = self.t("analyzer_content.speed.summary.critical", mobile=mobile_score, desktop=desktop_score)
            severity = SeverityLevel.ERROR

        return self.create_result(
            severity=severity,
            summary=summary,
            issues=issues,
            data={
                "mobile_score": mobile_score,
                "desktop_score": desktop_score,
                "mobile_metrics": pagespeed_result.mobile.model_dump() if pagespeed_result.mobile else None,
                "desktop_metrics": pagespeed_result.desktop.model_dump() if pagespeed_result.desktop else None,
                "pagespeed_url": f"https://pagespeed.web.dev/analysis?url={quote(base_url, safe='')}",
                "mobile_screenshot": mobile_screenshot,
                "desktop_screenshot": desktop_screenshot,
            },
            tables=tables,
        )

    def _analyze_metrics(self, metrics: SpeedMetrics, targets: Dict[str, float], device: str) -> List[AuditIssue]:
        """Analyze specific metrics against targets."""
        issues = []

        if metrics.fcp and metrics.fcp > targets['fcp']:
            issues.append(self.create_issue(
                category=f"{device.lower()}_fcp_slow",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.speed.issues.fcp_slow", device=device, value=f"{metrics.fcp:.1f}", target=targets['fcp']),
                details=self.t("analyzer_content.speed.details.fcp"),
                recommendation=self.t("analyzer_content.speed.recommendations.fcp"),
            ))

        if metrics.lcp and metrics.lcp > targets['lcp']:
            issues.append(self.create_issue(
                category=f"{device.lower()}_lcp_slow",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.speed.issues.lcp_slow", device=device, value=f"{metrics.lcp:.1f}", target=targets['lcp']),
                details=self.t("analyzer_content.speed.details.lcp"),
                recommendation=self.t("analyzer_content.speed.recommendations.lcp"),
            ))

        if metrics.cls and metrics.cls > 0.1:
            issues.append(self.create_issue(
                category=f"{device.lower()}_cls_high",
                severity=SeverityLevel.WARNING,
                message=self.t("analyzer_content.speed.issues.cls_high", device=device, value=f"{metrics.cls:.3f}"),
                details=self.t("analyzer_content.speed.details.cls"),
                recommendation=self.t("analyzer_content.speed.recommendations.cls"),
            ))

        return issues

    async def _get_pagespeed_insights(self, url: str) -> PageSpeedResult:
        """Get PageSpeed Insights data for URL."""
        result = PageSpeedResult(url=url)
        errors: List[str] = []

        api_key = settings.PAGESPEED_API_KEY
        base_api_url = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"

        async def fetch_strategy(strategy: str) -> Optional[SpeedMetrics]:
            import json as json_module

            params = {
                "url": url,
                "strategy": strategy,
                "category": "performance",
            }
            use_key = api_key
            if use_key:
                params["key"] = use_key

            max_retries = 3
            for attempt in range(max_retries):
                try:
                    timeout = aiohttp.ClientTimeout(total=60)
                    connector = aiohttp.TCPConnector(ssl=False)

                    async with aiohttp.ClientSession(connector=connector) as session:
                        async with session.get(base_api_url, params=params, timeout=timeout) as response:
                            if response.status != 200:
                                error_text = await response.text()
                                logger.error(f"PageSpeed API error for {strategy}: status={response.status}, response={error_text[:500]}")

                                # Check if it's a quota/rate limit error
                                is_quota_error = response.status == 429 or "Quota" in error_text or "RATE_LIMIT" in error_text

                                if is_quota_error and attempt < max_retries - 1:
                                    # Try without API key first (separate public quota)
                                    if use_key and "key" in params:
                                        logger.info(f"Quota error with API key for {strategy}, retrying without key...")
                                        params.pop("key", None)
                                        use_key = None
                                        await asyncio.sleep(2)
                                        continue

                                    # Exponential backoff
                                    wait_time = (attempt + 1) * 5
                                    logger.warning(f"Rate limited for {strategy}, retry {attempt + 1}/{max_retries} in {wait_time}s...")
                                    await asyncio.sleep(wait_time)
                                    continue

                                # Parse error message from API response
                                try:
                                    error_data = json_module.loads(error_text)
                                    api_error = error_data.get("error", {})
                                    error_msg = api_error.get("message", f"HTTP {response.status}")
                                    errors.append(f"{strategy}: {error_msg}")
                                except Exception:
                                    errors.append(f"{strategy}: HTTP {response.status}")
                                return None

                            data = await response.json()

                            lighthouse = data.get("lighthouseResult", {})
                            categories = lighthouse.get("categories", {})
                            audits = lighthouse.get("audits", {})

                            performance = categories.get("performance", {})
                            score = int(performance.get("score", 0) * 100)

                            # Extract metrics
                            fcp = None
                            lcp = None
                            cls = None
                            tbt = None
                            speed_index = None

                            if "first-contentful-paint" in audits:
                                fcp_data = audits["first-contentful-paint"]
                                fcp = fcp_data.get("numericValue", 0) / 1000  # Convert ms to s

                            if "largest-contentful-paint" in audits:
                                lcp_data = audits["largest-contentful-paint"]
                                lcp = lcp_data.get("numericValue", 0) / 1000

                            if "cumulative-layout-shift" in audits:
                                cls_data = audits["cumulative-layout-shift"]
                                cls = cls_data.get("numericValue", 0)

                            if "total-blocking-time" in audits:
                                tbt_data = audits["total-blocking-time"]
                                tbt = tbt_data.get("numericValue", 0)  # Already in ms

                            if "speed-index" in audits:
                                si_data = audits["speed-index"]
                                speed_index = si_data.get("numericValue", 0) / 1000

                            return SpeedMetrics(
                                score=score,
                                fcp=fcp,
                                lcp=lcp,
                                cls=cls,
                                tbt=tbt,
                                speed_index=speed_index,
                            )

                except aiohttp.ClientError as e:
                    error_msg = f"{strategy}: Network error - {type(e).__name__}"
                    logger.error(f"PageSpeed API network error for {strategy}: {type(e).__name__}: {e}")
                    if attempt < max_retries - 1:
                        await asyncio.sleep((attempt + 1) * 3)
                        continue
                    errors.append(error_msg)
                    return None
                except asyncio.TimeoutError:
                    error_msg = f"{strategy}: Timeout (60s exceeded)"
                    logger.error(f"PageSpeed API timeout for {strategy} (60s exceeded)")
                    if attempt < max_retries - 1:
                        await asyncio.sleep((attempt + 1) * 3)
                        continue
                    errors.append(error_msg)
                    return None
                except Exception as e:
                    error_msg = f"{strategy}: {type(e).__name__}"
                    logger.error(f"PageSpeed API unexpected error for {strategy}: {type(e).__name__}: {e}")
                    errors.append(error_msg)
                    return None

            return None

        # Fetch mobile and desktop sequentially to avoid quota issues
        mobile_result = await fetch_strategy("mobile")
        await asyncio.sleep(2)  # Delay between requests
        desktop_result = await fetch_strategy("desktop")

        result.mobile = mobile_result
        result.desktop = desktop_result

        if errors:
            result.error = "; ".join(errors)

        return result
