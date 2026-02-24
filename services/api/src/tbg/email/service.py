"""
Email service with provider abstraction.

Supports SMTP (default), Resend API, and AWS SES.
Provider is selected via configuration.
"""

from __future__ import annotations

import hashlib
import ssl
from abc import ABC, abstractmethod
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import TYPE_CHECKING, Any

import structlog

from tbg.config import get_settings
from tbg.email.templates import (
    password_changed,
    password_reset,
    verify_email,
    welcome_email,
)

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = structlog.get_logger()

# Template registry: name -> (function, required_context_keys)
_TEMPLATE_REGISTRY: dict[str, Any] = {
    "welcome": welcome_email,
    "verify_email": verify_email,
    "password_reset": password_reset,
    "password_changed": password_changed,
}


class BaseEmailProvider(ABC):
    """Abstract base class for email delivery providers."""

    @abstractmethod
    async def send(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str,
    ) -> bool:
        """Send an email. Returns True on success."""
        ...


class SMTPProvider(BaseEmailProvider):
    """Send emails via SMTP using aiosmtplib."""

    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        from_address: str,
        from_name: str,
        use_tls: bool = True,
    ) -> None:
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.from_address = from_address
        self.from_name = from_name
        self.use_tls = use_tls

    async def send(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str,
    ) -> bool:
        """Send via SMTP."""
        import aiosmtplib

        msg = MIMEMultipart("alternative")
        msg["From"] = f"{self.from_name} <{self.from_address}>"
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        try:
            tls_context = ssl.create_default_context() if self.use_tls else None
            await aiosmtplib.send(
                msg,
                hostname=self.host,
                port=self.port,
                username=self.username or None,
                password=self.password or None,
                start_tls=self.use_tls,
                tls_context=tls_context,
            )
            logger.info("email_sent", to=to_email, subject=subject, provider="smtp")
            return True
        except Exception:
            logger.exception("email_send_failed", to=to_email, provider="smtp")
            return False


class ResendProvider(BaseEmailProvider):
    """Send emails via Resend API."""

    def __init__(self, api_key: str, from_address: str, from_name: str) -> None:
        self.api_key = api_key
        self.from_address = from_address
        self.from_name = from_name

    async def send(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str,
    ) -> bool:
        """Send via Resend HTTP API."""
        import httpx

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": f"{self.from_name} <{self.from_address}>",
                        "to": [to_email],
                        "subject": subject,
                        "html": html_body,
                        "text": text_body,
                    },
                    timeout=10.0,
                )
                response.raise_for_status()
                logger.info("email_sent", to=to_email, subject=subject, provider="resend")
                return True
        except Exception:
            logger.exception("email_send_failed", to=to_email, provider="resend")
            return False


class SESProvider(BaseEmailProvider):
    """Send emails via AWS SES."""

    def __init__(self, region: str, from_address: str, from_name: str) -> None:
        self.region = region
        self.from_address = from_address
        self.from_name = from_name

    async def send(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str,
    ) -> bool:
        """Send via AWS SES."""
        try:
            import aioboto3

            session = aioboto3.Session()
            async with session.client("ses", region_name=self.region) as ses:
                await ses.send_email(
                    Source=f"{self.from_name} <{self.from_address}>",
                    Destination={"ToAddresses": [to_email]},
                    Message={
                        "Subject": {"Data": subject, "Charset": "UTF-8"},
                        "Body": {
                            "Text": {"Data": text_body, "Charset": "UTF-8"},
                            "Html": {"Data": html_body, "Charset": "UTF-8"},
                        },
                    },
                )
                logger.info("email_sent", to=to_email, subject=subject, provider="ses")
                return True
        except Exception:
            logger.exception("email_send_failed", to=to_email, provider="ses")
            return False


def _create_provider() -> BaseEmailProvider:
    """Create email provider based on configuration."""
    settings = get_settings()
    provider_name = settings.email_provider.lower()

    if provider_name == "smtp":
        return SMTPProvider(
            host=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_username,
            password=settings.smtp_password,
            from_address=settings.email_from_address,
            from_name=settings.email_from_name,
            use_tls=settings.smtp_use_tls,
        )
    if provider_name == "resend":
        return ResendProvider(
            api_key=settings.resend_api_key,
            from_address=settings.email_from_address,
            from_name=settings.email_from_name,
        )
    if provider_name == "ses":
        return SESProvider(
            region=settings.ses_region,
            from_address=settings.email_from_address,
            from_name=settings.email_from_name,
        )
    msg = f"Unsupported email provider: {provider_name}"
    raise ValueError(msg)


class EmailService:
    """
    High-level email service for The Bitcoin Game.

    Handles rate limiting and template rendering.
    """

    def __init__(
        self,
        provider: BaseEmailProvider | None = None,
        redis: Redis | None = None,
    ) -> None:
        self.provider = provider or _create_provider()
        self._redis = redis

    RATE_LIMIT_MAX = 5
    RATE_LIMIT_WINDOW = 3600

    async def _check_rate_limit(self, email: str) -> bool:
        """Check if we can send another email to this address."""
        if self._redis is None:
            return True
        key = f"email_rate:{hashlib.sha256(email.lower().encode()).hexdigest()}"
        count = await self._redis.incr(key)
        if count == 1:
            await self._redis.expire(key, self.RATE_LIMIT_WINDOW)
        return count <= self.RATE_LIMIT_MAX

    async def send_email(
        self,
        to: str,
        subject: str,
        html_body: str,
        text_body: str,
    ) -> bool:
        """
        Send an email with rate limiting.

        Returns True if sent, False if rate limited or failed.
        """
        if not await self._check_rate_limit(to):
            logger.warning("email_rate_limited", to=to, subject=subject)
            return False
        return await self.provider.send(to, subject, html_body, text_body)

    async def send_template(
        self,
        to: str,
        template_name: str,
        context: dict[str, str],
    ) -> bool:
        """
        Render a template and send.

        Args:
            to: Recipient email.
            template_name: Template name (welcome, verify_email, password_reset, password_changed).
            context: Template context variables.

        Raises:
            ValueError: If the template name is unknown.
        """
        template_func = _TEMPLATE_REGISTRY.get(template_name)
        if template_func is None:
            msg = f"Unknown template: {template_name}"
            raise ValueError(msg)

        # Call the template function with its expected arguments
        if template_name == "welcome":
            subject, html_body, text_body = template_func(
                context.get("display_name"),
                context.get("verify_url", ""),
            )
        elif template_name == "verify_email":
            subject, html_body, text_body = template_func(
                context.get("verify_url", ""),
            )
        elif template_name == "password_reset":
            subject, html_body, text_body = template_func(
                context.get("reset_url", ""),
            )
        elif template_name == "password_changed":
            subject, html_body, text_body = template_func(
                context.get("display_name"),
            )
        else:
            msg = f"Unknown template: {template_name}"
            raise ValueError(msg)

        return await self.send_email(to, subject, html_body, text_body)


# Module-level singleton
_email_service: EmailService | None = None


def get_email_service(redis: Redis | None = None) -> EmailService:
    """Get or create the email service singleton."""
    global _email_service  # noqa: PLW0603
    if _email_service is None:
        _email_service = EmailService(redis=redis)
    return _email_service


def reset_email_service() -> None:
    """Reset the email service singleton (for testing)."""
    global _email_service  # noqa: PLW0603
    _email_service = None
