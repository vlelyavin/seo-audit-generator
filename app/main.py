"""FastAPI application for SEO Audit Tool."""

import asyncio
import copy
import json
import logging
import time
import uuid
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, Tuple, List, Set
from urllib.parse import urlparse

from .utils import extract_domain

# Setup logger
logger = logging.getLogger(__name__)

from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sse_starlette.sse import EventSourceResponse

from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .crawler import WebCrawler
from .i18n import t
from .models import (
    AnalyzerResult,
    AuditRequest,
    AuditResult,
    AuditStatus,
    PageData,
    ProgressEvent,
    SeverityLevel,
)
from .analyzers import (
    MetaTagsAnalyzer,
    HeadingsAnalyzer,
    ImagesAnalyzer,
    LinksAnalyzer,
    SpeedAnalyzer,
    RobotsAnalyzer,
    StructureAnalyzer,
    ContentAnalyzer,
    FaviconAnalyzer,
    Page404Analyzer,
    ExternalLinksAnalyzer,
    CMSAnalyzer,
    ContentSectionsAnalyzer,
    SchemaAnalyzer,
    SocialTagsAnalyzer,
    MobileAnalyzer,
    URLQualityAnalyzer,
    DuplicatesAnalyzer,
    RedirectsAnalyzer,
    SecurityAnalyzer,
    HreflangAnalyzer,
)

# Registry of all available analyzers
ALL_ANALYZERS = {
    "cms": CMSAnalyzer,
    "meta_tags": MetaTagsAnalyzer,
    "headings": HeadingsAnalyzer,
    "page_404": Page404Analyzer,
    "speed": SpeedAnalyzer,
    "images": ImagesAnalyzer,
    "content": ContentAnalyzer,
    "links": LinksAnalyzer,
    "favicon": FaviconAnalyzer,
    "external_links": ExternalLinksAnalyzer,
    "robots": RobotsAnalyzer,
    "structure": StructureAnalyzer,
    "content_sections": ContentSectionsAnalyzer,
    "schema": SchemaAnalyzer,
    "social_tags": SocialTagsAnalyzer,
    "security": SecurityAnalyzer,
    "mobile": MobileAnalyzer,
    "url_quality": URLQualityAnalyzer,
    "hreflang": HreflangAnalyzer,
    "duplicates": DuplicatesAnalyzer,
    "redirects": RedirectsAnalyzer,
}
from .report_generator import get_report_generator, translate_analyzer_content
from .i18n import get_translator

# Ensure directories exist
settings.ensure_dirs()

# Analyzer concurrency control (max 10 analyzers running simultaneously)
_analyzer_semaphore = asyncio.Semaphore(10)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown hooks."""
    # Startup
    asyncio.create_task(cleanup_old_audits())
    logger.info("Audit cleanup task started")

    from .http_client import get_session
    await get_session()
    logger.info("HTTP client initialized")

    yield

    # Shutdown
    from .http_client import close_session
    await close_session()
    logger.info("HTTP client closed")


# Create FastAPI app
app = FastAPI(
    title="SEO Audit Tool",
    description="Автоматичний SEO-аудит сайтів з генерацією HTML-звіту",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — origins from CORS_ORIGINS env var (comma-separated)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Mount static files
static_path = Path(__file__).parent.parent / "static"
if static_path.exists():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

# Templates
templates_path = Path(__file__).parent / "templates"
templates = Jinja2Templates(directory=str(templates_path))


async def cleanup_old_audits():
    """Remove audits older than TTL to prevent memory leaks."""
    while True:
        await asyncio.sleep(300)  # Check every 5 minutes
        now = time.time()
        to_remove = [
            aid for aid, (audit, ts) in audits.items()
            if now - ts > AUDIT_TTL
        ]
        for aid in to_remove:
            del audits[aid]
            if aid in broadcast_channels:
                del broadcast_channels[aid]
            if aid in audit_progress_history:
                del audit_progress_history[aid]
            logger.info(f"Removed expired audit: {aid}")

# Broadcast channel for progress events (supports multiple subscribers)
class BroadcastChannel:
    """Broadcast channel that supports multiple subscribers."""
    def __init__(self):
        self.subscribers: Set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()

    async def broadcast(self, event: ProgressEvent):
        """Send event to all subscribers."""
        async with self._lock:
            dead_subs = set()
            for sub_queue in self.subscribers:
                try:
                    sub_queue.put_nowait(event)
                except asyncio.QueueFull:
                    logger.warning("Dropping slow SSE subscriber (queue full)")
                    dead_subs.add(sub_queue)
                except Exception:
                    dead_subs.add(sub_queue)

            # Clean up dead subscribers
            if dead_subs:
                logger.info(f"Removed {len(dead_subs)} dead subscriber(s)")
            self.subscribers -= dead_subs

    async def subscribe(self) -> asyncio.Queue:
        """Create new subscriber queue."""
        queue = asyncio.Queue()
        async with self._lock:
            self.subscribers.add(queue)
        return queue

    async def unsubscribe(self, queue: asyncio.Queue):
        """Remove subscriber queue."""
        async with self._lock:
            self.subscribers.discard(queue)


# In-memory storage for audits (with timestamps for TTL cleanup)
audits: Dict[str, Tuple[AuditResult, float]] = {}  # (audit, timestamp)
broadcast_channels: Dict[str, BroadcastChannel] = {}
audit_progress_history: Dict[str, deque] = {}  # Store last 20 events per audit
AUDIT_TTL = settings.AUDIT_TTL


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Render main page."""
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/api/audit")
async def start_audit(request: AuditRequest, background_tasks: BackgroundTasks):
    """Start a new SEO audit."""
    audit_id = str(uuid.uuid4())[:8]

    # Create audit result
    audit = AuditResult(
        id=audit_id,
        url=str(request.url),
        status=AuditStatus.PENDING,
        started_at=datetime.utcnow(),
        language=request.language if request.language in ["en", "uk", "ru"] else "en",
    )

    # Store audit with timestamp
    audits[audit_id] = (audit, time.time())
    broadcast_channels[audit_id] = BroadcastChannel()
    audit_progress_history[audit_id] = deque(maxlen=20)

    # Run audit in background
    background_tasks.add_task(run_audit, audit_id, request)

    return {"audit_id": audit_id, "status": "started"}


@app.get("/api/audit/{audit_id}/status")
async def audit_status(audit_id: str):
    """SSE stream for audit progress."""
    if audit_id not in audits:
        raise HTTPException(status_code=404, detail="Audit not found")

    async def event_generator():
        """Generate SSE events with history replay support."""
        channel = broadcast_channels.get(audit_id)
        if not channel:
            yield {"event": "error", "data": json.dumps({"error": "Broadcast channel not found"})}
            return

        # Subscribe to broadcast channel
        queue = await channel.subscribe()

        try:
            # First, send historical events for reconnection support
            history = audit_progress_history.get(audit_id, [])
            for event in history:
                yield {
                    "event": "progress",
                    "data": event.model_dump_json(),
                }

            # Stream new events
            start_time = time.time()
            MAX_SSE_DURATION = settings.MAX_SSE_DURATION

            while True:
                # Check if connection is too old
                if time.time() - start_time > MAX_SSE_DURATION:
                    yield {
                        "event": "error",
                        "data": json.dumps({"error": "Connection timeout"})
                    }
                    break

                try:
                    event = await asyncio.wait_for(queue.get(), timeout=60)
                    yield {
                        "event": "progress",
                        "data": event.model_dump_json(),
                    }

                    if event.status in [AuditStatus.COMPLETED, AuditStatus.FAILED]:
                        break
                except asyncio.TimeoutError:
                    # Check if audit still exists and is alive
                    if audit_id not in audits:
                        yield {"event": "error", "data": json.dumps({"error": "Audit not found"})}
                        break

                    audit, _ = audits[audit_id]
                    if audit.status in [AuditStatus.COMPLETED, AuditStatus.FAILED]:
                        # Audit finished but no event sent - send final state
                        yield {"event": "progress", "data": audit.model_dump_json()}
                        break

                    # Send keepalive ping
                    yield {"event": "ping", "data": "{}"}

        finally:
            # Always unsubscribe on disconnect
            await channel.unsubscribe(queue)

    return EventSourceResponse(event_generator())


@app.get("/api/audit/{audit_id}/current-status")
async def get_current_audit_status(audit_id: str):
    """Get current audit status (for polling, not SSE)."""
    if audit_id not in audits:
        raise HTTPException(status_code=404, detail="Audit not found")

    audit, _ = audits[audit_id]
    return audit.model_dump()


@app.get("/api/audit/{audit_id}")
async def get_audit(audit_id: str):
    """Get audit result."""
    if audit_id not in audits:
        raise HTTPException(status_code=404, detail="Audit not found")

    audit, _ = audits[audit_id]
    return {
        "id": audit.id,
        "url": audit.url,
        "status": audit.status,
        "pages_crawled": audit.pages_crawled,
        "total_issues": audit.total_issues,
        "critical_issues": audit.critical_issues,
        "warnings": audit.warnings,
        "passed_checks": audit.passed_checks,
        "report_path": audit.report_path,
    }


@app.get("/api/audit/{audit_id}/results")
async def get_audit_results(audit_id: str, lang: str = "en"):
    """Get full analyzer results as JSON, optionally translated."""
    if audit_id not in audits:
        raise HTTPException(status_code=404, detail="Audit not found")

    audit, _ = audits[audit_id]

    # Instead of returning 400, return partial status if in progress
    if audit.status != AuditStatus.COMPLETED:
        return JSONResponse(
            status_code=202,  # 202 Accepted
            content={
                "status": audit.status.value,
                "partial": True,
                "message": "Audit in progress",
                "progress": {
                    "pages_crawled": audit.pages_crawled,
                    "current_step": audit.status.value
                }
            }
        )

    # Serialize results, optionally translated
    results_dict = {}
    translator = get_translator(lang) if lang and lang != "en" else None
    for name, result in audit.results.items():
        if translator:
            translated = translate_analyzer_content(result, lang, translator)
            results_dict[name] = translated.model_dump()
        else:
            results_dict[name] = result.model_dump()

    return {
        "id": audit.id,
        "url": audit.url,
        "pages_crawled": audit.pages_crawled,
        "total_issues": audit.total_issues,
        "critical_issues": audit.critical_issues,
        "warnings": audit.warnings,
        "passed_checks": audit.passed_checks,
        "results": results_dict,
        "homepage_screenshot": audit.homepage_screenshot,
    }


@app.get("/api/audit/{audit_id}/download")
async def download_report(
    audit_id: str,
    format: str = "html",
    lang: Optional[str] = None,
    # Branding disabled for now
    # company_name: Optional[str] = None,
    # primary_color: Optional[str] = None,
    # accent_color: Optional[str] = None,
    # logo_url: Optional[str] = None,
):
    """
    Download generated report.

    Args:
        audit_id: Audit ID
        format: Report format - html, pdf, or docx
        lang: Override report language (en, uk, ru)
    """
    if audit_id not in audits:
        raise HTTPException(status_code=404, detail="Audit not found")

    audit, _ = audits[audit_id]

    if audit.status != AuditStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Audit not completed yet")

    # Override language if provided
    if lang and lang in ("en", "uk", "ru"):
        audit = copy.copy(audit)
        audit.language = lang

    # Branding disabled for now
    brand = None
    # if any([company_name, primary_color, accent_color, logo_url]):
    #     brand = {
    #         "company_name": company_name,
    #         "primary_color": primary_color,
    #         "accent_color": accent_color,
    #         "logo_url": logo_url,
    #     }

    # Extract domain for filename
    domain = extract_domain(audit.url)
    date_str = datetime.now().strftime("%Y-%m-%d")

    format = format.lower()

    if format == "html":
        # Re-generate HTML with brand settings if provided
        if brand:
            generator = get_report_generator()
            report_path = await generator.generate(audit, brand=brand)
        elif not audit.report_path or not Path(audit.report_path).exists():
            raise HTTPException(status_code=404, detail="Report not found")
        else:
            report_path = audit.report_path

        filename = f"seo-audit_{domain}_{date_str}.html"
        return FileResponse(
            report_path,
            filename=filename,
            media_type="text/html",
        )

    elif format == "pdf":
        # Generate PDF on demand
        generator = get_report_generator()
        try:
            pdf_path = await generator.generate_pdf(audit, brand=brand)
        except ImportError as e:
            raise HTTPException(status_code=500, detail=str(e))

        filename = f"seo-audit_{domain}_{date_str}.pdf"
        return FileResponse(
            pdf_path,
            filename=filename,
            media_type="application/pdf",
        )

    elif format == "docx":
        # Generate DOCX on demand
        generator = get_report_generator()
        try:
            docx_path = await generator.generate_docx(audit, brand=brand)
        except ImportError as e:
            raise HTTPException(status_code=500, detail=str(e))

        filename = f"seo-audit_{domain}_{date_str}.docx"
        return FileResponse(
            docx_path,
            filename=filename,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {format}. Use html, pdf, or docx.")


@app.post("/api/report/generate")
async def generate_report_from_data(request: Request):
    """Generate report from cached audit data (for expired/restarted audits)."""
    body = await request.json()
    format_type = body.get("format", "html").lower()
    audit_data = body.get("audit")
    language_override = body.get("language")

    if not audit_data:
        raise HTTPException(status_code=400, detail="Missing audit data")

    # Reconstruct AuditResult from cached JSON
    results = {}
    for name, result_dict in audit_data.get("results", {}).items():
        results[name] = AnalyzerResult(**result_dict)

    # Use language override if provided, otherwise fall back to audit data
    lang = language_override if language_override in ("en", "uk", "ru") else audit_data.get("language", "en")

    audit = AuditResult(
        id=audit_data.get("id", str(uuid.uuid4())[:8]),
        url=audit_data.get("url", ""),
        status=AuditStatus.COMPLETED,
        pages_crawled=audit_data.get("pages_crawled", 0),
        total_issues=audit_data.get("total_issues", 0),
        critical_issues=audit_data.get("critical_issues", 0),
        warnings=audit_data.get("warnings", 0),
        passed_checks=audit_data.get("passed_checks", 0),
        results=results,
        homepage_screenshot=audit_data.get("homepage_screenshot"),
        language=lang,
    )

    generator = get_report_generator()
    domain = extract_domain(audit.url)
    date_str = datetime.now().strftime("%Y-%m-%d")

    if format_type == "html":
        report_path = await generator.generate(audit)
        filename = f"seo-audit_{domain}_{date_str}.html"
        return FileResponse(report_path, filename=filename, media_type="text/html")
    elif format_type == "pdf":
        try:
            pdf_path = await generator.generate_pdf(audit)
        except ImportError as e:
            raise HTTPException(status_code=500, detail=str(e))
        filename = f"seo-audit_{domain}_{date_str}.pdf"
        return FileResponse(pdf_path, filename=filename, media_type="application/pdf")
    elif format_type == "docx":
        try:
            docx_path = await generator.generate_docx(audit)
        except ImportError as e:
            raise HTTPException(status_code=500, detail=str(e))
        filename = f"seo-audit_{domain}_{date_str}.docx"
        return FileResponse(
            docx_path,
            filename=filename,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {format_type}")


@app.post("/api/results/translate")
async def translate_results(request: Request):
    """Re-translate cached audit results to a different language."""
    body = await request.json()
    cached_data = body.get("results")
    lang = body.get("lang", "en")

    if not cached_data:
        raise HTTPException(status_code=400, detail="Missing results data")

    if lang not in ("en", "uk", "ru"):
        lang = "en"

    results_dict = {}
    translator = get_translator(lang) if lang != "en" else None
    for name, result_data in cached_data.get("results", {}).items():
        result = AnalyzerResult(**result_data)
        if translator:
            translated = translate_analyzer_content(result, lang, translator)
            results_dict[name] = translated.model_dump()
        else:
            results_dict[name] = result.model_dump()

    return JSONResponse(content={**cached_data, "results": results_dict})


async def run_audit(audit_id: str, request: AuditRequest):
    """Background task to run the full audit with 10-minute timeout."""
    channel = broadcast_channels[audit_id]
    audit, _ = audits[audit_id]

    # Language for analyzer content (must stay "en" — source language)
    lang = audit.language if audit.language else "en"
    # Language for progress messages (matches UI locale)
    progress_lang = request.progress_language if request.progress_language in ("en", "uk", "ru") else lang

    # Helper function to emit progress events
    async def emit_progress(event: ProgressEvent):
        """Broadcast event and store in history."""
        await channel.broadcast(event)
        # Store in history (keep last 20 events)
        if audit_id not in audit_progress_history:
            audit_progress_history[audit_id] = deque(maxlen=20)
        audit_progress_history[audit_id].append(event)

    try:
        # Phase 1: Crawling (no timeout - page limit controls audit scope)
        audit.status = AuditStatus.CRAWLING
        await emit_progress(ProgressEvent(
            status=AuditStatus.CRAWLING,
            progress=0,
            message=t("progress.crawling_start", progress_lang),
            stage="crawling",
        ))

        pages: Dict[str, PageData] = {}
        max_pages = request.max_pages or settings.MAX_PAGES

        # Start Speed Analyzer early (it only needs the URL, not crawled pages)
        # This runs in parallel with crawling to save 35-90 seconds
        speed_task = None
        selected = request.analyzers if request.analyzers else list(ALL_ANALYZERS.keys())
        if "speed" in selected and "speed" in ALL_ANALYZERS:
            speed_analyzer = ALL_ANALYZERS["speed"]()
            speed_analyzer.set_language(lang)
            logger.info(f"[Audit {audit.id}] Starting Speed Analyzer early (parallel with crawl)")
            speed_task = asyncio.create_task(
                asyncio.wait_for(
                    speed_analyzer.analyze({}, str(request.url)),
                    timeout=settings.ANALYZER_TIMEOUT
                )
            )

        async def progress_callback(page: PageData):
            progress = min(len(pages) / max_pages * 40, 40)
            await emit_progress(ProgressEvent(
                status=AuditStatus.CRAWLING,
                progress=progress,
                message=t("progress.crawling_pages", progress_lang, count=len(pages)),
                current_url=page.url,
                pages_crawled=len(pages),
                stage="crawling",
            ))

        # Capture homepage screenshot during crawl (reuses crawler's browser)
        async def screenshot_callback(screenshot_b64: str):
            audit.homepage_screenshot = screenshot_b64
            logger.info(f"[Audit {audit.id}] Homepage screenshot captured during crawl")

        crawler = WebCrawler(
            str(request.url),
            max_pages=max_pages,
            progress_callback=progress_callback,
            screenshot_callback=screenshot_callback,
        )

        try:
            async with asyncio.timeout(settings.TOTAL_TIMEOUT):
                async for page in crawler.crawl():
                    pages[page.url] = page
        except TimeoutError:
            logger.warning(f"[Audit {audit.id}] Crawl timed out after {settings.TOTAL_TIMEOUT}s with {len(pages)} pages")

        audit.pages_crawled = len(pages)
        audit.pages = pages

        # Fallback: if screenshot wasn't captured during crawl, try standalone
        if not audit.homepage_screenshot:
            try:
                from .screenshots import screenshot_capture
                audit.homepage_screenshot = await screenshot_capture.capture_page(
                    str(request.url),
                    viewport=screenshot_capture.DESKTOP_VIEWPORT,
                    full_page=False,
                    filename=f"homepage_{audit_id}.png",
                )
            except Exception as e:
                logger.warning(f"Homepage screenshot fallback failed (non-fatal): {e}")

        await emit_progress(ProgressEvent(
            status=AuditStatus.CRAWLING,
            progress=40,
            message=t("progress.crawling_complete", progress_lang, count=len(pages)),
            pages_crawled=len(pages),
            stage="crawling",
        ))

        # Phase 2: Analysis
        audit.status = AuditStatus.ANALYZING
        await emit_progress(ProgressEvent(
            status=AuditStatus.ANALYZING,
            progress=40,
            message=t("progress.analyzing_start", progress_lang),
            pages_crawled=len(pages),
            stage="analyzing",
        ))

        # Filter analyzers by request selection (None = all)
        # Exclude speed — it was started early in parallel with crawling
        analyzers = [
            ALL_ANALYZERS[name]()
            for name in selected
            if name in ALL_ANALYZERS and (name != "speed" or speed_task is None)
        ]

        # Phase 2: Analysis - Run analyzers in parallel
        analysis_start = time.time()
        completed_count = [0]  # mutable counter for closures

        async def run_single_analyzer(analyzer, pages: Dict[str, PageData], url: str, lang: str, index: int, total: int):
            """Run a single analyzer with concurrency control, timeout, and error handling.

            Args:
                analyzer: Analyzer instance
                pages: List of crawled pages
                url: Base URL being audited
                lang: Language code (uk, ru, en)
                index: Analyzer index for progress reporting
                total: Total number of analyzers

            Returns:
                Tuple of (analyzer_name, analyzer_result)
            """
            # Limit concurrent analyzers to prevent resource exhaustion
            async with _analyzer_semaphore:
                analyzer.set_language(lang)

                try:
                    result = await asyncio.wait_for(
                        analyzer.analyze(pages, url),
                        timeout=settings.ANALYZER_TIMEOUT
                    )
                    name_result = (analyzer.name, result)
                except asyncio.TimeoutError:
                    logger.error(f"Analyzer {analyzer.name} timed out after {settings.ANALYZER_TIMEOUT} seconds")
                    name_result = (analyzer.name, None)
                except Exception as e:
                    # Log error but don't break other analyzers
                    logger.error(f"Error in {analyzer.name}: {e}", exc_info=e)
                    name_result = (analyzer.name, None)

                # Emit progress AFTER completion for accurate reporting
                completed_count[0] += 1
                analyzer_display_name = t(f"analyzers.{analyzer.name}.name", progress_lang)
                await emit_progress(ProgressEvent(
                    status=AuditStatus.ANALYZING,
                    progress=40 + (completed_count[0] / total * 40),
                    message=t("progress.analyzing_analyzer", progress_lang, name=analyzer_display_name),
                    pages_crawled=len(pages),
                    stage="analyzing",
                    analyzer_name=analyzer_display_name,
                ))

                return name_result

        # Create tasks for all analyzers
        analyzer_tasks = [
            run_single_analyzer(analyzer, pages, str(request.url), lang, i, len(analyzers))
            for i, analyzer in enumerate(analyzers)
        ]

        # Execute analyzers (parallel or sequential based on config)
        if settings.ENABLE_PARALLEL_ANALYZERS:
            # Parallel execution (default, faster)
            logger.info(f"Running {len(analyzers)} analyzers in parallel (max 10 concurrent)")
            analyzer_results = await asyncio.gather(*analyzer_tasks, return_exceptions=True)
        else:
            # Sequential execution (for debugging)
            logger.info(f"Running {len(analyzers)} analyzers sequentially (ENABLE_PARALLEL_ANALYZERS=False)")
            analyzer_results = []
            for task in analyzer_tasks:
                result = await task
                analyzer_results.append(result)

        # Process results and track metadata
        results = {}
        successful_analyzers = []
        failed_analyzers = []

        for item in analyzer_results:
            if isinstance(item, Exception):
                # Unexpected exception from gather
                logger.error(f"Analyzer task failed unexpectedly: {item}", exc_info=item)
                failed_analyzers.append("unknown")
                continue

            analyzer_name, result = item
            if result is not None:
                results[analyzer_name] = result
                successful_analyzers.append(analyzer_name)
            else:
                logger.warning(f"Analyzer {analyzer_name} returned no result")
                failed_analyzers.append(analyzer_name)

        # Collect early-started Speed Analyzer result
        if speed_task is not None:
            try:
                speed_result = await speed_task
                results["speed"] = speed_result
                successful_analyzers.append("speed")
                logger.info(f"Speed Analyzer (early-started) completed successfully")
                await emit_progress(ProgressEvent(
                    status=AuditStatus.ANALYZING,
                    progress=80,
                    message=t("progress.analyzing_analyzer", progress_lang, name=t("analyzers.speed.name", progress_lang)),
                    pages_crawled=len(pages),
                    stage="analyzing",
                    analyzer_name=t("analyzers.speed.name", progress_lang),
                ))
            except asyncio.TimeoutError:
                logger.error(f"Speed Analyzer timed out after {settings.ANALYZER_TIMEOUT}s")
                failed_analyzers.append("speed")
                results["speed"] = AnalyzerResult(
                    name="speed",
                    display_name=t("analyzers.speed.name", lang),
                    severity=SeverityLevel.ERROR,
                    summary=t("analyzer_content.speed.summary.failed", progress_lang),
                    issues=[],
                    data={},
                )
            except Exception as e:
                logger.error(f"Speed Analyzer failed: {e}", exc_info=e)
                failed_analyzers.append("speed")
                results["speed"] = AnalyzerResult(
                    name="speed",
                    display_name=t("analyzers.speed.name", lang),
                    severity=SeverityLevel.ERROR,
                    summary=t("analyzer_content.speed.summary.failed", progress_lang),
                    issues=[],
                    data={},
                )

        analysis_duration = time.time() - analysis_start
        logger.info(f"Analysis phase completed in {analysis_duration:.2f}s")

        total_analyzers = len(analyzers) + (1 if speed_task is not None else 0)
        # Log analyzer execution statistics
        logger.info(
            f"Analyzer results: {len(successful_analyzers)}/{total_analyzers} successful, "
            f"{len(failed_analyzers)} failed"
        )
        if failed_analyzers:
            logger.warning(f"Failed analyzers: {', '.join(failed_analyzers)}")

        audit.results = results

        # Clear HTML content and soup cache to free memory (analyzers are done)
        for page in pages.values():
            page.clear_cache()
        logger.info(f"Cleared cached data from {len(pages)} pages")

        # Calculate totals
        for result in results.values():
            for issue in result.issues:
                if issue.severity == SeverityLevel.ERROR:
                    audit.critical_issues += issue.count
                elif issue.severity == SeverityLevel.WARNING:
                    audit.warnings += issue.count
                audit.total_issues += issue.count

        audit.passed_checks = len(analyzers) - sum(
            1 for r in results.values() if r.severity in [SeverityLevel.ERROR, SeverityLevel.WARNING]
        )

        # Phase 3: Generate Report
        audit.status = AuditStatus.GENERATING_REPORT
        await emit_progress(ProgressEvent(
            status=AuditStatus.GENERATING_REPORT,
            progress=85,
            message=t("progress.generating_report", progress_lang),
            pages_crawled=len(pages),
            stage="report",
        ))

        generator = get_report_generator()
        report_path = await generator.generate(audit)
        audit.report_path = report_path

        # Complete
        audit.status = AuditStatus.COMPLETED
        audit.completed_at = datetime.utcnow()

        await emit_progress(ProgressEvent(
            status=AuditStatus.COMPLETED,
            progress=100,
            message=t("progress.completed", progress_lang),
            pages_crawled=len(pages),
            stage="complete",
        ))

    except Exception as e:
        logger.error(f"Audit {audit_id} failed: {e}", exc_info=True)
        audit.status = AuditStatus.FAILED
        audit.error_message = "An internal error occurred during the audit. Please try again."

        # Cleanup: free memory from pages and cached data
        if hasattr(audit, 'pages') and audit.pages:
            for page in audit.pages.values():
                page.clear_cache()
            audit.pages.clear()

        # Remove partial report/screenshot files for this audit
        for directory in [settings.REPORTS_DIR, settings.SCREENSHOTS_DIR]:
            dir_path = Path(directory)
            if dir_path.exists():
                for f in dir_path.glob(f"*{audit_id}*"):
                    try:
                        f.unlink()
                    except OSError:
                        pass

        await emit_progress(ProgressEvent(
            status=AuditStatus.FAILED,
            progress=0,
            message=t("progress.failed", progress_lang, error="internal error"),
            stage="error",
        ))


# Health check
@app.get("/health")
async def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
