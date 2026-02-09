"""Screenshot capture module using Playwright."""

import base64
from pathlib import Path
from typing import Optional
from urllib.parse import quote

from .config import settings


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
            print(f"Screenshot error for {url}: {e}")
            return None

    async def capture_pagespeed_mobile(self, url: str) -> Optional[str]:
        """Capture PageSpeed Insights page for mobile."""
        pagespeed_url = f"https://pagespeed.web.dev/analysis?url={quote(url, safe='')}"
        return await self._capture_pagespeed(pagespeed_url, f"pagespeed_mobile_{self._url_to_filename(url)}.png")

    async def capture_pagespeed_desktop(self, url: str) -> Optional[str]:
        """Capture PageSpeed Insights page for desktop."""
        pagespeed_url = f"https://pagespeed.web.dev/analysis?url={quote(url, safe='')}&form_factor=desktop"
        return await self._capture_pagespeed(pagespeed_url, f"pagespeed_desktop_{self._url_to_filename(url)}.png")

    async def _capture_pagespeed(self, pagespeed_url: str, filename: str) -> Optional[str]:
        """Capture PageSpeed Insights page with extended wait for results."""
        try:
            from playwright.async_api import async_playwright

            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    viewport=self.DESKTOP_VIEWPORT,
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                )
                page = await context.new_page()

                try:
                    await page.goto(pagespeed_url, wait_until="networkidle", timeout=120000)

                    # Wait for PageSpeed results to render (look for score gauge)
                    try:
                        await page.wait_for_selector(".lh-gauge__percentage", timeout=90000)
                        await page.wait_for_timeout(2000)  # Extra wait for animations
                    except:
                        # If selector not found, wait longer and continue
                        await page.wait_for_timeout(5000)

                    screenshot_bytes = await page.screenshot(
                        full_page=False,
                        type="png",
                    )

                    # Save to file
                    filepath = self.screenshots_dir / filename
                    with open(filepath, "wb") as f:
                        f.write(screenshot_bytes)

                    return self.to_base64(screenshot_bytes)

                finally:
                    await browser.close()

        except Exception as e:
            print(f"PageSpeed screenshot error: {e}")
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
            print(f"Image capture error for {image_url}: {e}")
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
