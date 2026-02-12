"""FastAPI application for SEO Audit Tool."""

import asyncio
import logging
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Tuple, List, Set

# Setup logger
logger = logging.getLogger(__name__)

from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sse_starlette.sse import EventSourceResponse

from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .crawler import WebCrawler
from .i18n import t
from .models import (
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
from .report_generator import ReportGenerator, translate_analyzer_content
from .i18n import get_translator

# Ensure directories exist
settings.ensure_dirs()

# Create FastAPI app
app = FastAPI(
    title="SEO Audit Tool",
    description="Автоматичний SEO-аудит сайтів з генерацією HTML-звіту",
    version="1.0.0",
)

# CORS — allow frontend origins (dev + production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://seo-audit.online",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
            print(f"[Cleanup] Removed expired audit: {aid}")


@app.on_event("startup")
async def startup_event():
    """Start background cleanup task on app startup."""
    asyncio.create_task(cleanup_old_audits())
    print("[Startup] Audit cleanup task started")

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
                except Exception:
                    dead_subs.add(sub_queue)

            # Clean up dead subscribers
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
audit_progress_history: Dict[str, List[ProgressEvent]] = {}  # Store last N events
AUDIT_TTL = 3600  # 1 hour in seconds


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
        language=request.language if request.language in ["uk", "ru", "en"] else "uk",
    )

    # Store audit with timestamp
    audits[audit_id] = (audit, time.time())
    broadcast_channels[audit_id] = BroadcastChannel()
    audit_progress_history[audit_id] = []

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
        import json

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
            MAX_SSE_DURATION = 900  # 15 minutes max SSE connection

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
async def get_audit_results(audit_id: str, lang: str = "uk"):
    """Get full analyzer results as JSON, optionally translated."""
    if audit_id not in audits:
        raise HTTPException(status_code=404, detail="Audit not found")

    audit, _ = audits[audit_id]

    # Instead of returning 400, return partial status if in progress
    if audit.status != AuditStatus.COMPLETED:
        from fastapi.responses import JSONResponse
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
    translator = get_translator(lang) if lang and lang != "uk" else None
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
async def download_report(audit_id: str, format: str = "html"):
    """
    Download generated report.

    Args:
        audit_id: Audit ID
        format: Report format - html, pdf, or docx
    """
    if audit_id not in audits:
        raise HTTPException(status_code=404, detail="Audit not found")

    audit, _ = audits[audit_id]

    if audit.status != AuditStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Audit not completed yet")

    # Extract domain for filename
    from urllib.parse import urlparse
    domain = urlparse(audit.url).netloc.replace("www.", "")
    date_str = datetime.now().strftime("%Y-%m-%d")

    format = format.lower()

    if format == "html":
        if not audit.report_path or not Path(audit.report_path).exists():
            raise HTTPException(status_code=404, detail="Report not found")

        filename = f"seo-audit_{domain}_{date_str}.html"
        return FileResponse(
            audit.report_path,
            filename=filename,
            media_type="text/html",
        )

    elif format == "pdf":
        # Generate PDF on demand
        generator = ReportGenerator()
        try:
            pdf_path = await generator.generate_pdf(audit)
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
        generator = ReportGenerator()
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
        raise HTTPException(status_code=400, detail=f"Unsupported format: {format}. Use html, pdf, or docx.")


async def run_audit(audit_id: str, request: AuditRequest):
    """Background task to run the full audit with 10-minute timeout."""
    channel = broadcast_channels[audit_id]
    audit, _ = audits[audit_id]

    # Get language for progress messages
    lang = audit.language if audit.language else "uk"

    # Helper function to emit progress events
    async def emit_progress(event: ProgressEvent):
        """Broadcast event and store in history."""
        await channel.broadcast(event)
        # Store in history (keep last 50 events)
        history = audit_progress_history.get(audit_id, [])
        history.append(event)
        audit_progress_history[audit_id] = history[-50:]

    try:
        # Phase 1: Crawling (no timeout - page limit controls audit scope)
        audit.status = AuditStatus.CRAWLING
        await emit_progress(ProgressEvent(
            status=AuditStatus.CRAWLING,
            progress=0,
            message=t("progress.crawling_start", lang),
            stage="crawling",
        ))

        pages: Dict[str, PageData] = {}
        max_pages = request.max_pages or settings.MAX_PAGES

        async def progress_callback(page: PageData):
            progress = min(len(pages) / max_pages * 40, 40)
            await emit_progress(ProgressEvent(
                status=AuditStatus.CRAWLING,
                progress=progress,
                message=t("progress.crawling_pages", lang, count=len(pages)),
                current_url=page.url,
                pages_crawled=len(pages),
                stage="crawling",
            ))

        crawler = WebCrawler(
            str(request.url),
            max_pages=max_pages,
            progress_callback=progress_callback,
        )

        async for page in crawler.crawl():
            pages[page.url] = page

        audit.pages_crawled = len(pages)
        audit.pages = pages

        await emit_progress(ProgressEvent(
            status=AuditStatus.CRAWLING,
            progress=40,
            message=t("progress.crawling_complete", lang, count=len(pages)),
            pages_crawled=len(pages),
            stage="crawling",
        ))

        # Capture homepage screenshot
        try:
            from .screenshots import screenshot_capture
            audit.homepage_screenshot = await screenshot_capture.capture_page(
                str(request.url),
                viewport=screenshot_capture.DESKTOP_VIEWPORT,
                full_page=False,
                filename=f"homepage_{audit_id}.png",
            )
        except Exception as e:
            print(f"Homepage screenshot failed (non-fatal): {e}")

        # Phase 2: Analysis
        audit.status = AuditStatus.ANALYZING
        await emit_progress(ProgressEvent(
            status=AuditStatus.ANALYZING,
            progress=40,
            message=t("progress.analyzing_start", lang),
            pages_crawled=len(pages),
            stage="analyzing",
        ))

        # Filter analyzers by request selection (None = all)
        selected = request.analyzers if request.analyzers else list(ALL_ANALYZERS.keys())
        analyzers = [ALL_ANALYZERS[name]() for name in selected if name in ALL_ANALYZERS]

        # Phase 2: Analysis - Run analyzers in parallel
        analysis_start = time.time()

        async def run_single_analyzer(analyzer, pages: List[PageData], url: str, lang: str, index: int, total: int):
            """Run a single analyzer and return its name and result.

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
            analyzer.set_language(lang)

            # Emit progress for this analyzer
            await emit_progress(ProgressEvent(
                status=AuditStatus.ANALYZING,
                progress=40 + ((index + 1) / total * 40),
                message=t("progress.analyzing_analyzer", lang, name=analyzer.display_name),
                pages_crawled=len(pages),
                stage="analyzing",
            ))

            try:
                result = await analyzer.analyze(pages, url)
                return analyzer.name, result
            except Exception as e:
                # Log error but don't break other analyzers
                logger.error(f"Error in {analyzer.name}: {e}", exc_info=e)
                # Return None to indicate failure
                return analyzer.name, None

        # Create tasks for all analyzers
        analyzer_tasks = [
            run_single_analyzer(analyzer, pages, str(request.url), lang, i, len(analyzers))
            for i, analyzer in enumerate(analyzers)
        ]

        # Run all analyzers in parallel
        analyzer_results = await asyncio.gather(*analyzer_tasks, return_exceptions=True)

        # Process results and handle exceptions
        results = {}
        for item in analyzer_results:
            if isinstance(item, Exception):
                # Unexpected exception from gather
                logger.error(f"Analyzer task failed unexpectedly: {item}", exc_info=item)
                continue

            analyzer_name, result = item
            if result is not None:
                results[analyzer_name] = result
            else:
                logger.warning(f"Analyzer {analyzer_name} returned no result")

        analysis_duration = time.time() - analysis_start
        logger.info(f"Analysis phase completed in {analysis_duration:.2f}s")

        audit.results = results

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
            message=t("progress.generating_report", lang),
            pages_crawled=len(pages),
            stage="report",
        ))

        generator = ReportGenerator()
        report_path = await generator.generate(audit)
        audit.report_path = report_path

        # Complete
        audit.status = AuditStatus.COMPLETED
        audit.completed_at = datetime.utcnow()

        await emit_progress(ProgressEvent(
            status=AuditStatus.COMPLETED,
            progress=100,
            message=t("progress.completed", lang),
            pages_crawled=len(pages),
            stage="complete",
        ))

    except Exception as e:
        audit.status = AuditStatus.FAILED
        audit.error_message = str(e)

        await emit_progress(ProgressEvent(
            status=AuditStatus.FAILED,
            progress=0,
            message=t("progress.failed", lang, error=str(e)),
            stage="error",
        ))


# Health check
@app.get("/health")
async def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
