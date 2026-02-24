"""Tests for email service and templates."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tbg.email.templates import (
    password_changed,
    password_reset,
    verify_email,
    welcome_email,
)


class TestEmailTemplates:
    def test_welcome_email_returns_tuple(self):
        subject, html, text = welcome_email("TestMiner", "https://example.com/verify")
        assert isinstance(subject, str)
        assert isinstance(html, str)
        assert isinstance(text, str)
        assert "TestMiner" in html
        assert "verify" in text.lower()

    def test_verify_email_returns_tuple(self):
        subject, html, text = verify_email("https://example.com/verify-link")
        assert "verify" in subject.lower()
        assert "verify-link" in html
        assert "verify-link" in text

    def test_password_reset_returns_tuple(self):
        subject, html, text = password_reset("https://example.com/reset-link")
        assert "reset" in subject.lower() or "password" in subject.lower()
        assert "reset-link" in html
        assert "reset-link" in text

    def test_password_changed_returns_tuple(self):
        subject, html, text = password_changed("TestMiner")
        assert "password" in subject.lower()
        assert "TestMiner" in html
        assert "TestMiner" in text


class TestEmailService:
    def test_template_dispatch(self):
        """Verify send_template maps names to correct template functions."""
        from tbg.email.service import _TEMPLATE_REGISTRY

        assert "welcome" in _TEMPLATE_REGISTRY
        assert "verify_email" in _TEMPLATE_REGISTRY
        assert "password_reset" in _TEMPLATE_REGISTRY
        assert "password_changed" in _TEMPLATE_REGISTRY

    def test_api_key_module(self):
        """Verify API key generation produces correct format."""
        from tbg.auth.api_keys import generate_api_key, verify_api_key

        full_key, prefix, key_hash = generate_api_key()
        assert full_key.startswith("sk-tbg-")
        assert prefix == full_key[:14]
        assert verify_api_key(full_key, key_hash) is True
        assert verify_api_key("sk-tbg-wrong", key_hash) is False
