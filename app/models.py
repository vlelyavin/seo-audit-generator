"""Pydantic models for SEO Audit Tool."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, HttpUrl, Field
import uuid


class AuditStatus(str, Enum):
    """Status of an audit job."""
    PENDING = "pending"
    CRAWLING = "crawling"
    ANALYZING = "analyzing"
    SCREENSHOTS = "screenshots"
    GENERATING_REPORT = "generating_report"
    COMPLETED = "completed"
    FAILED = "failed"


class SeverityLevel(str, Enum):
    """Severity level for issues."""
    SUCCESS = "success"      # Green checkmark
    WARNING = "warning"      # Yellow warning
    ERROR = "error"          # Red X
    INFO = "info"            # Blue info


class AuditRequest(BaseModel):
    """Request to start a new audit."""
    url: HttpUrl
    include_screenshots: bool = True
    language: str = "uk"  # Report language: uk (Ukrainian), ru (Russian), en (English)
    analyzers: Optional[List[str]] = None  # None = all analyzers
    max_pages: Optional[int] = None  # Override MAX_PAGES (plan-enforced limit)


class ImageData(BaseModel):
    """Data about an image on a page."""
    src: str
    alt: Optional[str] = None
    size: Optional[int] = None  # in bytes
    format: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None


class LinkData(BaseModel):
    """Data about a link."""
    href: str
    text: Optional[str] = None
    is_internal: bool = True
    status_code: Optional[int] = None
    has_nofollow: bool = False


class PageData(BaseModel):
    """Data extracted from a crawled page."""
    url: str
    status_code: int = 200
    title: Optional[str] = None
    meta_description: Optional[str] = None
    meta_robots: Optional[str] = None
    canonical: Optional[str] = None
    h1_tags: List[str] = Field(default_factory=list)
    h2_tags: List[str] = Field(default_factory=list)
    h3_tags: List[str] = Field(default_factory=list)
    h4_tags: List[str] = Field(default_factory=list)
    h5_tags: List[str] = Field(default_factory=list)
    h6_tags: List[str] = Field(default_factory=list)
    word_count: int = 0
    images: List[ImageData] = Field(default_factory=list)
    internal_links: List[str] = Field(default_factory=list)
    external_links: List[LinkData] = Field(default_factory=list)
    depth: int = 0
    load_time: float = 0.0
    html_content: Optional[str] = None
    has_noindex: bool = False
    response_headers: Dict[str, str] = Field(default_factory=dict)
    redirect_chain: List[str] = Field(default_factory=list)
    final_url: Optional[str] = None


class AuditIssue(BaseModel):
    """A single issue found during audit."""
    category: str
    severity: SeverityLevel
    message: str
    details: Optional[str] = None
    affected_urls: List[str] = Field(default_factory=list)
    recommendation: Optional[str] = None
    count: int = 1


class AnalyzerResult(BaseModel):
    """Result from a single analyzer."""
    name: str
    display_name: str
    icon: str = ""
    severity: SeverityLevel = SeverityLevel.INFO
    summary: str = ""
    description: str = ""
    theory: str = ""  # Теоретическая справка: что это и зачем нужно
    issues: List[AuditIssue] = Field(default_factory=list)
    data: Dict[str, Any] = Field(default_factory=dict)
    screenshots: List[str] = Field(default_factory=list)  # base64 encoded
    tables: List[Dict[str, Any]] = Field(default_factory=list)


class AuditResult(BaseModel):
    """Complete audit result."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str
    status: AuditStatus = AuditStatus.PENDING
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    pages_crawled: int = 0
    total_issues: int = 0
    critical_issues: int = 0
    warnings: int = 0
    passed_checks: int = 0
    results: Dict[str, AnalyzerResult] = Field(default_factory=dict)
    pages: Dict[str, PageData] = Field(default_factory=dict)
    report_path: Optional[str] = None
    error_message: Optional[str] = None
    language: str = "uk"  # Report language: uk, ru
    homepage_screenshot: Optional[str] = None  # base64 homepage screenshot


class ProgressEvent(BaseModel):
    """SSE progress event."""
    status: AuditStatus
    progress: float = 0.0  # 0-100
    message: str = ""
    current_url: Optional[str] = None
    pages_crawled: int = 0
    stage: Optional[str] = None


class RobotsTxtData(BaseModel):
    """Data from robots.txt."""
    exists: bool = False
    content: Optional[str] = None
    sitemaps: List[str] = Field(default_factory=list)
    disallowed_paths: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)


class SitemapData(BaseModel):
    """Data from sitemap.xml."""
    exists: bool = False
    url: Optional[str] = None
    urls_count: int = 0
    sitemap_count: int = 0  # Number of sitemap files (including index)
    errors: List[str] = Field(default_factory=list)


class SpeedMetrics(BaseModel):
    """Page speed metrics from PageSpeed Insights."""
    score: int = 0
    fcp: Optional[float] = None  # First Contentful Paint
    lcp: Optional[float] = None  # Largest Contentful Paint
    cls: Optional[float] = None  # Cumulative Layout Shift
    tbt: Optional[float] = None  # Total Blocking Time
    speed_index: Optional[float] = None
    screenshot: Optional[str] = None  # base64


class PageSpeedResult(BaseModel):
    """Complete PageSpeed result."""
    mobile: Optional[SpeedMetrics] = None
    desktop: Optional[SpeedMetrics] = None
    url: str = ""
    error: Optional[str] = None
