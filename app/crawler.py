"""Web crawler for SEO audit using Playwright for JavaScript rendering."""

import asyncio
import re
import time
from collections import deque
from typing import AsyncGenerator, Callable, Dict, Optional, Set
from urllib.parse import urljoin, urlparse, urlunparse

import aiohttp
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright, Browser, BrowserContext

from .config import settings
from .models import ImageData, LinkData, PageData


class WebCrawler:
    """Async BFS web crawler with Playwright for JavaScript rendering."""

    def __init__(
        self,
        start_url: str,
        max_pages: int = None,
        timeout: int = None,
        parallel_requests: int = None,
        progress_callback: Optional[Callable] = None,
    ):
        self.start_url = self._normalize_url(start_url)
        parsed = urlparse(self.start_url)
        self.base_domain = parsed.netloc
        self.base_scheme = parsed.scheme

        self.max_pages = max_pages or settings.MAX_PAGES
        self.timeout = (timeout or settings.PAGE_TIMEOUT) * 1000  # Convert to ms for Playwright
        self.parallel_requests = parallel_requests or settings.PARALLEL_REQUESTS
        self.progress_callback = progress_callback

        self.visited: Set[str] = set()
        self.queue: deque = deque()
        self.pages: Dict[str, PageData] = {}
        self.semaphore = asyncio.Semaphore(self.parallel_requests)

    def _normalize_url(self, url: str) -> str:
        """Normalize URL for deduplication."""
        parsed = urlparse(url)

        # Remove trailing slash from path (except for root)
        path = parsed.path.rstrip('/') if parsed.path != '/' else '/'

        # Remove fragments and default ports
        normalized = urlunparse((
            parsed.scheme,
            parsed.netloc.lower(),
            path,
            '',  # params
            parsed.query,
            ''   # fragment
        ))

        return normalized

    def _is_valid_url(self, url: str) -> bool:
        """Check if URL should be crawled."""
        try:
            parsed = urlparse(url)

            # Must be http(s)
            if parsed.scheme not in ('http', 'https'):
                return False

            # Must be same domain
            if parsed.netloc.lower() != self.base_domain.lower():
                return False

            # Skip common non-page resources
            skip_extensions = (
                '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
                '.zip', '.rar', '.tar', '.gz', '.7z',
                '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
                '.mp3', '.mp4', '.avi', '.mov', '.wmv',
                '.css', '.js', '.json', '.xml',
            )
            path_lower = parsed.path.lower()
            if any(path_lower.endswith(ext) for ext in skip_extensions):
                return False

            return True
        except Exception:
            return False

    def _is_internal_link(self, url: str) -> bool:
        """Check if URL is internal (same domain)."""
        try:
            parsed = urlparse(url)
            if not parsed.netloc:
                return True
            return parsed.netloc.lower() == self.base_domain.lower()
        except Exception:
            return False

    def _extract_text_content(self, soup: BeautifulSoup) -> str:
        """Extract visible text content from page."""
        # Remove script and style elements
        for element in soup(['script', 'style', 'noscript', 'header', 'footer', 'nav']):
            element.decompose()

        text = soup.get_text(separator=' ', strip=True)
        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text)
        return text

    def _count_words(self, text: str) -> int:
        """Count words in text."""
        words = re.findall(r'\b\w+\b', text, re.UNICODE)
        return len(words)

    def _extract_images(self, soup: BeautifulSoup, base_url: str) -> list[ImageData]:
        """Extract image data from page."""
        images = []

        for img in soup.find_all('img'):
            src = img.get('src', '')
            if not src:
                continue

            # Make absolute URL
            if not src.startswith(('http://', 'https://', '//')):
                src = urljoin(base_url, src)
            elif src.startswith('//'):
                src = f"{self.base_scheme}:{src}"

            # Determine format from extension
            format_ext = None
            path_lower = urlparse(src).path.lower()
            for ext in ['.webp', '.avif', '.png', '.jpg', '.jpeg', '.gif', '.svg']:
                if path_lower.endswith(ext):
                    format_ext = ext.lstrip('.')
                    break

            images.append(ImageData(
                src=src,
                alt=img.get('alt'),
                format=format_ext,
                width=int(img.get('width')) if img.get('width', '').isdigit() else None,
                height=int(img.get('height')) if img.get('height', '').isdigit() else None,
            ))

        return images

    def _extract_links(self, soup: BeautifulSoup, base_url: str) -> tuple[list[str], list[LinkData]]:
        """Extract and categorize links."""
        internal_links = []
        external_links = []
        seen_internal = set()
        seen_external = set()

        for a in soup.find_all('a', href=True):
            href = a.get('href', '').strip()

            # Skip empty, javascript, and mailto links
            if not href or href.startswith(('javascript:', 'mailto:', 'tel:', '#')):
                continue

            # Make absolute URL
            if not href.startswith(('http://', 'https://')):
                href = urljoin(base_url, href)

            normalized = self._normalize_url(href)

            # Check for nofollow
            rel = a.get('rel', [])
            if isinstance(rel, str):
                rel = rel.split()
            has_nofollow = 'nofollow' in rel

            link_text = a.get_text(strip=True)[:100] if a.get_text(strip=True) else None

            if self._is_internal_link(href):
                if normalized not in seen_internal:
                    internal_links.append(normalized)
                    seen_internal.add(normalized)
            else:
                if normalized not in seen_external:
                    external_links.append(LinkData(
                        href=normalized,
                        text=link_text,
                        is_internal=False,
                        has_nofollow=has_nofollow,
                    ))
                    seen_external.add(normalized)

        return internal_links, external_links

    async def _fetch_page(self, context: BrowserContext, url: str, depth: int) -> Optional[PageData]:
        """Fetch and parse a single page using Playwright."""
        async with self.semaphore:
            start_time = time.time()
            page = None

            try:
                page = await context.new_page()

                # Navigate to URL
                response = await page.goto(url, wait_until="domcontentloaded", timeout=self.timeout)

                if response is None:
                    return PageData(url=url, status_code=0, depth=depth)

                load_time = time.time() - start_time

                # Save response headers
                response_headers = dict(response.headers) if response else {}

                # Track redirect chain
                redirect_chain = []
                final_url = str(page.url)
                req = response.request
                chain_urls = []
                while req.redirected_from:
                    chain_urls.append(req.redirected_from.url)
                    req = req.redirected_from
                chain_urls.reverse()
                if chain_urls:
                    redirect_chain = chain_urls + [response.url]

                # Check content type
                content_type = response.headers.get('content-type', '')
                if 'text/html' not in content_type.lower():
                    return None

                # Get rendered HTML after JavaScript execution
                html = await page.content()
                soup = BeautifulSoup(html, 'lxml')

                # Extract title
                title_tag = soup.find('title')
                title = title_tag.get_text(strip=True) if title_tag else None

                # Extract meta description
                meta_desc = soup.find('meta', attrs={'name': re.compile(r'^description$', re.I)})
                meta_description = meta_desc.get('content', '').strip() if meta_desc else None

                # Extract meta robots
                meta_robots_tag = soup.find('meta', attrs={'name': re.compile(r'^robots$', re.I)})
                meta_robots = meta_robots_tag.get('content', '').strip() if meta_robots_tag else None
                has_noindex = meta_robots and 'noindex' in meta_robots.lower() if meta_robots else False

                # Extract canonical
                canonical_tag = soup.find('link', attrs={'rel': 'canonical'})
                canonical = canonical_tag.get('href') if canonical_tag else None

                # Extract headings
                h1_tags = [h.get_text(strip=True) for h in soup.find_all('h1') if h.get_text(strip=True)]
                h2_tags = [h.get_text(strip=True) for h in soup.find_all('h2') if h.get_text(strip=True)]
                h3_tags = [h.get_text(strip=True) for h in soup.find_all('h3') if h.get_text(strip=True)]
                h4_tags = [h.get_text(strip=True) for h in soup.find_all('h4') if h.get_text(strip=True)]
                h5_tags = [h.get_text(strip=True) for h in soup.find_all('h5') if h.get_text(strip=True)]
                h6_tags = [h.get_text(strip=True) for h in soup.find_all('h6') if h.get_text(strip=True)]

                # Extract text content and count words
                text_content = self._extract_text_content(BeautifulSoup(html, 'lxml'))
                word_count = self._count_words(text_content)

                # Extract images
                images = self._extract_images(soup, url)

                # Extract links
                internal_links, external_links = self._extract_links(soup, url)

                return PageData(
                    url=url,
                    status_code=response.status,
                    title=title,
                    meta_description=meta_description,
                    meta_robots=meta_robots,
                    canonical=canonical,
                    h1_tags=h1_tags,
                    h2_tags=h2_tags,
                    h3_tags=h3_tags,
                    h4_tags=h4_tags,
                    h5_tags=h5_tags,
                    h6_tags=h6_tags,
                    word_count=word_count,
                    images=images,
                    internal_links=internal_links,
                    external_links=external_links,
                    depth=depth,
                    load_time=load_time,
                    html_content=html,
                    has_noindex=has_noindex,
                    response_headers=response_headers,
                    redirect_chain=redirect_chain,
                    final_url=final_url,
                )

            except Exception as e:
                return PageData(url=url, status_code=0, depth=depth)

            finally:
                if page:
                    await page.close()

    async def crawl(self) -> AsyncGenerator[PageData, None]:
        """
        BFS crawl starting from start_url.
        Yields PageData for each crawled page.
        Uses Playwright for JavaScript rendering.
        """
        # Note: Timeout is handled by run_audit() wrapper for Python 3.7+ compatibility
        self.queue.append((self.start_url, 0))  # (url, depth)
        self.visited.add(self.start_url)

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            )

            try:
                while self.queue and len(self.pages) < self.max_pages:
                    # Process batch of URLs
                    batch_size = min(self.parallel_requests, len(self.queue))
                    batch = [self.queue.popleft() for _ in range(batch_size)]

                    # Fetch pages concurrently
                    tasks = [self._fetch_page(context, url, depth) for url, depth in batch]
                    results = await asyncio.gather(*tasks)

                    for page in results:
                        if page is None:
                            continue

                        # Store page data
                        self.pages[page.url] = page

                        # Notify progress
                        if self.progress_callback:
                            await self.progress_callback(page)

                        yield page

                        # Add new internal links to queue
                        if page.status_code == 200:
                            for link in page.internal_links:
                                normalized_link = self._normalize_url(link)
                                if (normalized_link not in self.visited and
                                    self._is_valid_url(normalized_link) and
                                    len(self.visited) < self.max_pages):
                                    self.visited.add(normalized_link)
                                    self.queue.append((normalized_link, page.depth + 1))

            finally:
                await browser.close()

    async def crawl_all(self) -> Dict[str, PageData]:
        """Crawl all pages and return complete results."""
        async for _ in self.crawl():
            pass
        return self.pages


async def check_url_status(url: str, timeout: int = 5) -> int:
    """Check HTTP status of a URL without downloading content."""
    try:
        connector = aiohttp.TCPConnector(ssl=False)
        timeout_config = aiohttp.ClientTimeout(total=timeout)
        headers = {
            'User-Agent': 'Mozilla/5.0 (compatible; SEOAuditBot/1.0)',
        }

        async with aiohttp.ClientSession(connector=connector) as session:
            async with session.head(url, timeout=timeout_config, headers=headers, allow_redirects=True) as response:
                return response.status
    except asyncio.TimeoutError:
        return 408
    except Exception:
        return 0


async def fetch_url_content(url: str, timeout: int = 10) -> tuple[int, Optional[str]]:
    """Fetch URL content and return status code and content."""
    try:
        connector = aiohttp.TCPConnector(ssl=False)
        timeout_config = aiohttp.ClientTimeout(total=timeout)
        headers = {
            'User-Agent': 'Mozilla/5.0 (compatible; SEOAuditBot/1.0)',
            'Accept': '*/*',
        }

        async with aiohttp.ClientSession(connector=connector) as session:
            async with session.get(url, timeout=timeout_config, headers=headers, allow_redirects=True) as response:
                content = await response.text()
                return response.status, content
    except asyncio.TimeoutError:
        return 408, None
    except Exception:
        return 0, None


async def get_image_size(url: str, timeout: int = 10) -> Optional[int]:
    """Get size of an image in bytes."""
    try:
        connector = aiohttp.TCPConnector(ssl=False)
        timeout_config = aiohttp.ClientTimeout(total=timeout)
        headers = {
            'User-Agent': 'Mozilla/5.0 (compatible; SEOAuditBot/1.0)',
        }

        async with aiohttp.ClientSession(connector=connector) as session:
            async with session.head(url, timeout=timeout_config, headers=headers, allow_redirects=True) as response:
                content_length = response.headers.get('content-length')
                if content_length:
                    return int(content_length)

            # If HEAD doesn't return size, try GET
            async with session.get(url, timeout=timeout_config, headers=headers, allow_redirects=True) as response:
                content = await response.read()
                return len(content)
    except Exception:
        return None
