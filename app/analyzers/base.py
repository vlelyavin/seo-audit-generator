"""Base analyzer class."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from ..models import AnalyzerResult, AuditIssue, PageData, SeverityLevel


class BaseAnalyzer(ABC):
    """Base class for all SEO analyzers."""

    name: str = "base"
    display_name: str = "Base Analyzer"
    description: str = ""
    icon: str = ""
    theory: str = ""  # Теоретическая справка: что это и зачем нужно

    def __init__(self):
        """Initialize analyzer with default language."""
        self.language: str = "en"
        self.translator: Optional[Any] = None

    def set_language(self, language: str) -> None:
        """
        Set language for this analyzer instance.

        Args:
            language: Language code (en, ru, uk)
        """
        self.language = language
        # Import here to avoid circular dependencies
        from ..i18n import get_translator
        self.translator = get_translator(language) if language != "en" else None

    def t(self, key: str, **kwargs) -> str:
        """
        Translate a key with optional formatting.

        Args:
            key: Translation key in dot notation
            **kwargs: Values for placeholder substitution

        Returns:
            Translated string
        """
        if self.translator:
            return self.translator(key, **kwargs)
        # Fallback to English (default/source locale)
        from ..i18n import t
        text = t(key, "en", **kwargs)
        return text

    @abstractmethod
    async def analyze(
        self,
        pages: Dict[str, PageData],
        base_url: str,
        **kwargs: Any
    ) -> AnalyzerResult:
        """
        Analyze crawled pages and return results.

        Args:
            pages: Dictionary of URL -> PageData
            base_url: The main URL being audited
            **kwargs: Additional parameters (e.g., competitors data)

        Returns:
            AnalyzerResult with findings
        """
        pass

    def create_issue(
        self,
        category: str,
        severity: SeverityLevel,
        message: str,
        details: str = None,
        affected_urls: List[str] = None,
        recommendation: str = None,
        count: int = 1,
    ) -> AuditIssue:
        """Helper method to create an issue."""
        return AuditIssue(
            category=category,
            severity=severity,
            message=message,
            details=details,
            affected_urls=affected_urls or [],
            recommendation=recommendation,
            count=count,
        )

    def create_result(
        self,
        severity: SeverityLevel = SeverityLevel.INFO,
        summary: str = "",
        issues: List[AuditIssue] = None,
        data: Dict[str, Any] = None,
        screenshots: List[str] = None,
        tables: List[Dict[str, Any]] = None,
    ) -> AnalyzerResult:
        """Helper method to create analyzer result."""
        return AnalyzerResult(
            name=self.name,
            display_name=self.display_name,
            icon=self.icon,
            description=self.description,
            theory=self.theory,
            severity=severity,
            summary=summary,
            issues=issues or [],
            data=data or {},
            screenshots=screenshots or [],
            tables=tables or [],
        )

    def _determine_overall_severity(self, issues: List[AuditIssue]) -> SeverityLevel:
        """Determine overall severity based on issues."""
        if not issues:
            return SeverityLevel.SUCCESS

        severities = [issue.severity for issue in issues]

        if SeverityLevel.ERROR in severities:
            return SeverityLevel.ERROR
        if SeverityLevel.WARNING in severities:
            return SeverityLevel.WARNING
        if SeverityLevel.INFO in severities:
            return SeverityLevel.INFO

        return SeverityLevel.SUCCESS
