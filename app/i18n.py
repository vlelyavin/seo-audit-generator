"""Internationalization (i18n) module for multi-language support."""

import json
from pathlib import Path
from typing import Any, Dict, Optional

# Supported languages
SUPPORTED_LANGUAGES = ["uk", "ru"]
DEFAULT_LANGUAGE = "uk"

# Cache for loaded translations
_translations: Dict[str, Dict[str, Any]] = {}


def load_translations(language: str) -> Dict[str, Any]:
    """Load translations for a specific language."""
    if language in _translations:
        return _translations[language]

    if language not in SUPPORTED_LANGUAGES:
        language = DEFAULT_LANGUAGE

    locale_path = Path(__file__).parent / "locales" / f"{language}.json"

    if not locale_path.exists():
        # Fallback to default
        locale_path = Path(__file__).parent / "locales" / f"{DEFAULT_LANGUAGE}.json"

    if locale_path.exists():
        with open(locale_path, "r", encoding="utf-8") as f:
            _translations[language] = json.load(f)
    else:
        _translations[language] = {}

    return _translations[language]


def t(key: str, language: str = DEFAULT_LANGUAGE, **kwargs) -> str:
    """
    Translate a key to the specified language.

    Args:
        key: Translation key in dot notation (e.g., "analyzers.meta_tags.name")
        language: Target language code
        **kwargs: Values for placeholder substitution

    Returns:
        Translated string or the key if not found
    """
    translations = load_translations(language)

    # Navigate nested keys
    parts = key.split(".")
    value = translations

    for part in parts:
        if isinstance(value, dict) and part in value:
            value = value[part]
        else:
            return key  # Return key if not found

    if isinstance(value, str):
        # Substitute placeholders {name} with kwargs
        try:
            return value.format(**kwargs)
        except KeyError:
            return value

    return str(value) if value else key


class Translator:
    """Translator instance for a specific language."""

    def __init__(self, language: str = DEFAULT_LANGUAGE):
        if language not in SUPPORTED_LANGUAGES:
            language = DEFAULT_LANGUAGE
        self.language = language
        self.translations = load_translations(language)

    def __call__(self, key: str, **kwargs) -> str:
        """Shorthand for translation."""
        return t(key, self.language, **kwargs)

    def get(self, key: str, default: str = "", **kwargs) -> str:
        """Get translation with default fallback."""
        result = t(key, self.language, **kwargs)
        return result if result != key else default


# Global translator instance (default language)
_current_language = DEFAULT_LANGUAGE
_translator: Optional[Translator] = None


def set_language(language: str) -> None:
    """Set the current global language."""
    global _current_language, _translator
    _current_language = language if language in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE
    _translator = Translator(_current_language)


def get_translator(language: Optional[str] = None) -> Translator:
    """Get translator for specified or current language."""
    if language:
        return Translator(language)
    global _translator
    if _translator is None:
        _translator = Translator(_current_language)
    return _translator


# Convenience function
def _(key: str, language: Optional[str] = None, **kwargs) -> str:
    """
    Quick translation function.

    Usage:
        from app.i18n import _
        message = _("analyzers.meta_tags.name", language="ru")
    """
    lang = language or _current_language
    return t(key, lang, **kwargs)
