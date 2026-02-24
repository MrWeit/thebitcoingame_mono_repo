"""Email delivery service — stubbed for Phase 7.

Provides an abstract interface ready for SendGrid/SES integration later.
Currently uses StubEmailService that logs instead of sending.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod

from tbg.config import get_settings

logger = logging.getLogger(__name__)


class EmailService(ABC):
    """Abstract email delivery service. Implement for SendGrid, SES, etc."""

    @abstractmethod
    async def send(self, to: str, subject: str, body_html: str) -> bool:
        """Send an email. Returns True if successful."""
        ...


class StubEmailService(EmailService):
    """Stub implementation that logs emails instead of sending them."""

    async def send(self, to: str, subject: str, body_html: str) -> bool:
        logger.info("[EMAIL STUB] To: %s, Subject: %s", to, subject)
        return True


class SendGridEmailService(EmailService):
    """SendGrid implementation. Configure later."""

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    async def send(self, to: str, subject: str, body_html: str) -> bool:
        raise NotImplementedError("SendGrid not configured yet")


def get_social_email_service() -> EmailService:
    """Factory: returns the configured email service."""
    settings = get_settings()
    api_key = getattr(settings, "sendgrid_api_key", None)
    if api_key:
        return SendGridEmailService(api_key)
    return StubEmailService()
