"""
Compatibility layer for gemini_service, forwarding to the new unified ai_service.
"""
from backend.ai_service import (
    AIService,
    ai_service,
    SYSTEM_PROMPT,
    _fallback_parse,
)

GeminiService = AIService
gemini_service = ai_service
