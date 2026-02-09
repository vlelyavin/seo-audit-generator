"""SEO Analyzers package."""

from .base import BaseAnalyzer
from .meta_tags import MetaTagsAnalyzer
from .headings import HeadingsAnalyzer
from .images import ImagesAnalyzer
from .links import LinksAnalyzer
from .speed import SpeedAnalyzer
from .robots import RobotsAnalyzer
from .structure import StructureAnalyzer
from .content import ContentAnalyzer
from .favicon import FaviconAnalyzer
from .page_404 import Page404Analyzer
from .external_links import ExternalLinksAnalyzer
from .cms import CMSAnalyzer
from .content_sections import ContentSectionsAnalyzer

__all__ = [
    "BaseAnalyzer",
    "MetaTagsAnalyzer",
    "HeadingsAnalyzer",
    "ImagesAnalyzer",
    "LinksAnalyzer",
    "SpeedAnalyzer",
    "RobotsAnalyzer",
    "StructureAnalyzer",
    "ContentAnalyzer",
    "FaviconAnalyzer",
    "Page404Analyzer",
    "ExternalLinksAnalyzer",
    "CMSAnalyzer",
    "ContentSectionsAnalyzer",
]
