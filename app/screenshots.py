"""Screenshot capture module using Playwright."""

import base64
import logging
from pathlib import Path
from typing import Optional, Tuple
from urllib.parse import quote

from .config import settings

logger = logging.getLogger(__name__)


class ScreenshotCapture:
    """Captures screenshots using Playwright."""

    DESKTOP_VIEWPORT = {"width": 1920, "height": 1080}
    MOBILE_VIEWPORT = {"width": 375, "height": 812}

    def __init__(self):
        self.screenshots_dir = Path(settings.SCREENSHOTS_DIR)
        self.screenshots_dir.mkdir(parents=True, exist_ok=True)

    async def capture_page(
        self,
        url: str,
        viewport: dict = None,
        full_page: bool = False,
        filename: str = None,
    ) -> Optional[str]:
        """
        Capture screenshot of a page.

        Returns:
            Base64-encoded PNG image or None on error
        """
        try:
            from playwright.async_api import async_playwright

            viewport = viewport or self.DESKTOP_VIEWPORT

            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    viewport=viewport,
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                )
                page = await context.new_page()

                try:
                    await page.goto(url, wait_until="networkidle", timeout=30000)
                    await page.wait_for_timeout(1000)  # Wait for animations

                    screenshot_bytes = await page.screenshot(
                        full_page=full_page,
                        type="png",
                    )

                    # Save to file if filename provided
                    if filename:
                        filepath = self.screenshots_dir / filename
                        with open(filepath, "wb") as f:
                            f.write(screenshot_bytes)

                    return self.to_base64(screenshot_bytes)

                finally:
                    await browser.close()

        except Exception as e:
            logger.warning(f"Screenshot error for {url}: {e}")
            return None

    async def capture_pagespeed_mobile(self, url: str) -> Optional[str]:
        """Capture PageSpeed Insights page for mobile."""
        pagespeed_url = f"https://pagespeed.web.dev/analysis?url={quote(url, safe='')}"
        return await self._capture_pagespeed(pagespeed_url, f"pagespeed_mobile_{self._url_to_filename(url)}.png")

    async def capture_pagespeed_desktop(self, url: str) -> Optional[str]:
        """Capture PageSpeed Insights page for desktop."""
        pagespeed_url = f"https://pagespeed.web.dev/analysis?url={quote(url, safe='')}&form_factor=desktop"
        return await self._capture_pagespeed(pagespeed_url, f"pagespeed_desktop_{self._url_to_filename(url)}.png")

    _STEALTH_UA = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    )

    _BROWSER_ARGS = [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-sandbox",
    ]

    async def capture_pagespeed_both(self, url: str) -> Tuple[Optional[str], Optional[str]]:
        """Capture both mobile and desktop PageSpeed screenshots in a single browser session."""
        mobile_b64 = None
        desktop_b64 = None

        try:
            from playwright.async_api import async_playwright

            mobile_url = f"https://pagespeed.web.dev/analysis?url={quote(url, safe='')}"
            desktop_url = f"https://pagespeed.web.dev/analysis?url={quote(url, safe='')}&form_factor=desktop"
            domain_slug = self._url_to_filename(url)

            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=self._BROWSER_ARGS,
                )
                try:
                    # --- Mobile screenshot ---
                    mobile_b64 = await self._capture_pagespeed_page(
                        browser, mobile_url, f"pagespeed_mobile_{domain_slug}.png",
                    )

                    # Delay between requests
                    import asyncio
                    await asyncio.sleep(3)

                    # --- Desktop screenshot ---
                    desktop_b64 = await self._capture_pagespeed_page(
                        browser, desktop_url, f"pagespeed_desktop_{domain_slug}.png",
                    )
                finally:
                    await browser.close()

        except Exception as e:
            logger.warning(f"PageSpeed screenshot session error: {e}")

        return mobile_b64, desktop_b64

    async def _capture_pagespeed_page(self, browser, pagespeed_url: str, filename: str) -> Optional[str]:
        """Capture a single PageSpeed Insights page using an existing browser."""
        try:
            context = await browser.new_context(
                viewport=self.DESKTOP_VIEWPORT,
                user_agent=self._STEALTH_UA,
                locale="en-US",
            )
            page = await context.new_page()

            # Hide automation markers
            await page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )

            try:
                logger.info(f"Navigating to {pagespeed_url}")
                await page.goto(pagespeed_url, wait_until="commit", timeout=120000)

                # Dismiss Google cookie consent banner if present
                try:
                    consent = page.locator(
                        'button:has-text("Accept all"), '
                        'button:has-text("Reject all"), '
                        '[aria-label="Accept all"]'
                    ).first
                    await consent.click(timeout=5000)
                    await page.wait_for_timeout(1000)
                except Exception:
                    pass

                # Wait for results gauge to appear
                try:
                    await page.wait_for_selector(
                        ".lh-gauge__percentage, .lh-exp-gauge__percentage",
                        timeout=90000,
                    )
                    await page.wait_for_timeout(3000)
                except Exception:
                    logger.info("Score gauge not found, waiting extra 10s...")
                    await page.wait_for_timeout(10000)

                screenshot_bytes = await page.screenshot(full_page=False, type="png")

                filepath = self.screenshots_dir / filename
                with open(filepath, "wb") as f:
                    f.write(screenshot_bytes)

                logger.info(f"Screenshot saved: {filename}")
                return self.to_base64(screenshot_bytes)

            finally:
                await context.close()

        except Exception as e:
            logger.warning(f"PageSpeed screenshot error for {pagespeed_url}: {e}")
            return None

    async def _capture_pagespeed(self, pagespeed_url: str, filename: str) -> Optional[str]:
        """Capture PageSpeed Insights page (legacy, launches own browser)."""
        try:
            from playwright.async_api import async_playwright

            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=self._BROWSER_ARGS,
                )
                try:
                    return await self._capture_pagespeed_page(
                        browser, pagespeed_url, filename,
                    )
                finally:
                    await browser.close()

        except Exception as e:
            logger.warning(f"PageSpeed screenshot error: {e}")
            return None

    async def capture_404_page(self, url: str) -> Optional[str]:
        """Capture 404 error page."""
        # Generate non-existent URL
        test_url = f"{url.rstrip('/')}/nonexistent-page-404-test"
        return await self.capture_page(
            test_url,
            viewport=self.DESKTOP_VIEWPORT,
            filename=f"404_{self._url_to_filename(url)}.png",
        )

    async def capture_favicon(self, url: str) -> Optional[str]:
        """Capture browser with favicon visible."""
        return await self.capture_page(
            url,
            viewport={"width": 800, "height": 100},
            filename=f"favicon_{self._url_to_filename(url)}.png",
        )

    async def capture_image(self, image_url: str) -> Optional[str]:
        """Capture a single image."""
        try:
            from playwright.async_api import async_playwright

            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context()
                page = await context.new_page()

                try:
                    response = await page.goto(image_url, timeout=15000)
                    if response and response.status == 200:
                        screenshot_bytes = await page.screenshot(type="png")
                        return self.to_base64(screenshot_bytes)
                finally:
                    await browser.close()

        except Exception as e:
            logger.warning(f"Image capture error for {image_url}: {e}")
            return None

    async def capture_competitor(self, url: str, index: int = 0) -> Optional[str]:
        """Capture competitor homepage."""
        return await self.capture_page(
            url,
            viewport=self.DESKTOP_VIEWPORT,
            full_page=False,
            filename=f"competitor_{index}_{self._url_to_filename(url)}.png",
        )

    @staticmethod
    def to_base64(image_bytes: bytes) -> str:
        """Convert image bytes to base64 string."""
        return base64.b64encode(image_bytes).decode("utf-8")

    @staticmethod
    def _url_to_filename(url: str) -> str:
        """Convert URL to safe filename."""
        from urllib.parse import urlparse
        parsed = urlparse(url)
        domain = parsed.netloc.replace("www.", "").replace(".", "_")
        return domain[:50]


# Singleton instance
screenshot_capture = ScreenshotCapture()
