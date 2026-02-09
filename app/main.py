"""FastAPI application for SEO Audit Tool."""

import asyncio
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict

from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sse_starlette.sse import EventSourceResponse

from .config import settings
from .crawler import WebCrawler
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
)
from .report_generator import ReportGenerator

# Ensure directories exist
settings.ensure_dirs()

# Create FastAPI app
app = FastAPI(
    title="SEO Audit Tool",
    description="Автоматичний SEO-аудит сайтів з генерацією HTML-звіту",
    version="1.0.0",
)

# Mount static files
static_path = Path(__file__).parent.parent / "static"
if static_path.exists():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

# Templates
templates_path = Path(__file__).parent / "templates"
templates = Jinja2Templates(directory=str(templates_path))

# In-memory storage for audits
audits: Dict[str, AuditResult] = {}
audit_queues: Dict[str, asyncio.Queue] = {}


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
        competitors=[str(c) for c in request.competitors],
        status=AuditStatus.PENDING,
        started_at=datetime.utcnow(),
        language=request.language if request.language in ["uk", "ru"] else "uk",
    )

    # Store audit
    audits[audit_id] = audit
    audit_queues[audit_id] = asyncio.Queue()

    # Run audit in background
    background_tasks.add_task(run_audit, audit_id, request)

    return {"audit_id": audit_id, "status": "started"}


@app.get("/api/audit/{audit_id}/status")
async def audit_status(audit_id: str):
    """SSE stream for audit progress."""
    if audit_id not in audits:
        raise HTTPException(status_code=404, detail="Audit not found")

    async def event_generator():
        queue = audit_queues.get(audit_id)
        if not queue:
            return

        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=300)
                yield {
                    "event": "progress",
                    "data": event.model_dump_json(),
                }

                if event.status in [AuditStatus.COMPLETED, AuditStatus.FAILED]:
                    break
            except asyncio.TimeoutError:
                # Send keepalive
                yield {"event": "ping", "data": "{}"}

    return EventSourceResponse(event_generator())


@app.get("/api/audit/{audit_id}")
async def get_audit(audit_id: str):
    """Get audit result."""
    if audit_id not in audits:
        raise HTTPException(status_code=404, detail="Audit not found")

    audit = audits[audit_id]
    return {
        "id": audit.id,
        "url": audit.url,
        "status": audit.status,
        "pages_crawled": audit.pages_crawled,
        "total_issues": audit.total_issues,
        "report_path": audit.report_path,
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

    audit = audits[audit_id]

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
    """Background task to run the full audit."""
    queue = audit_queues[audit_id]
    audit = audits[audit_id]

    try:
        # Phase 1: Crawling
        audit.status = AuditStatus.CRAWLING
        await queue.put(ProgressEvent(
            status=AuditStatus.CRAWLING,
            progress=0,
            message="Розпочинаємо сканування сайту...",
            stage="crawling",
        ))

        pages: Dict[str, PageData] = {}

        async def progress_callback(page: PageData):
            progress = min(len(pages) / settings.MAX_PAGES * 40, 40)
            await queue.put(ProgressEvent(
                status=AuditStatus.CRAWLING,
                progress=progress,
                message=f"Скановано {len(pages)} сторінок",
                current_url=page.url,
                pages_crawled=len(pages),
                stage="crawling",
            ))

        crawler = WebCrawler(
            str(request.url),
            progress_callback=progress_callback,
        )

        async for page in crawler.crawl():
            pages[page.url] = page

        audit.pages_crawled = len(pages)
        audit.pages = pages

        await queue.put(ProgressEvent(
            status=AuditStatus.CRAWLING,
            progress=40,
            message=f"Сканування завершено. Знайдено {len(pages)} сторінок.",
            pages_crawled=len(pages),
            stage="crawling",
        ))

        # Phase 2: Analysis
        audit.status = AuditStatus.ANALYZING
        await queue.put(ProgressEvent(
            status=AuditStatus.ANALYZING,
            progress=40,
            message="Аналізуємо сторінки...",
            pages_crawled=len(pages),
            stage="analyzing",
        ))

        analyzers = [
            CMSAnalyzer(),
            MetaTagsAnalyzer(),
            HeadingsAnalyzer(),
            Page404Analyzer(),
            SpeedAnalyzer(),
            ImagesAnalyzer(),
            ContentAnalyzer(),
            LinksAnalyzer(),
            FaviconAnalyzer(),
            ExternalLinksAnalyzer(),
            RobotsAnalyzer(),
            StructureAnalyzer(),
            ContentSectionsAnalyzer(),
        ]

        results = {}
        for i, analyzer in enumerate(analyzers):
            await queue.put(ProgressEvent(
                status=AuditStatus.ANALYZING,
                progress=40 + ((i + 1) / len(analyzers) * 40),
                message=f"Аналіз: {analyzer.display_name}...",
                pages_crawled=len(pages),
                stage="analyzing",
            ))

            try:
                result = await analyzer.analyze(pages, str(request.url))
                results[analyzer.name] = result
            except Exception as e:
                # Log error but continue with other analyzers
                print(f"Error in {analyzer.name}: {e}")

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
        await queue.put(ProgressEvent(
            status=AuditStatus.GENERATING_REPORT,
            progress=85,
            message="Генеруємо звіт...",
            pages_crawled=len(pages),
            stage="report",
        ))

        generator = ReportGenerator()
        report_path = await generator.generate(audit)
        audit.report_path = report_path

        # Complete
        audit.status = AuditStatus.COMPLETED
        audit.completed_at = datetime.utcnow()

        await queue.put(ProgressEvent(
            status=AuditStatus.COMPLETED,
            progress=100,
            message="Аудит завершено!",
            pages_crawled=len(pages),
            stage="complete",
        ))

    except Exception as e:
        audit.status = AuditStatus.FAILED
        audit.error_message = str(e)

        await queue.put(ProgressEvent(
            status=AuditStatus.FAILED,
            progress=0,
            message=f"Помилка: {str(e)}",
            stage="error",
        ))


# Health check
@app.get("/health")
async def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
