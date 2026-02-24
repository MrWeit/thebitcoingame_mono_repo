"""Tests for JWT token management."""

import pytest
import jwt

from tests.conftest import _ensure_test_keys


# Ensure keys are generated before any test
_ensure_test_keys()

from tbg.auth.jwt import create_access_token, create_refresh_token, verify_token


class TestAccessToken:
    def test_create_and_verify(self):
        token = create_access_token(user_id=1, btc_address="bc1qtest", auth_method="wallet")
        payload = verify_token(token, expected_type="access")
        assert payload["sub"] == "1"
        assert payload["address"] == "bc1qtest"
        assert payload["auth_method"] == "wallet"
        assert payload["type"] == "access"

    def test_email_auth_method(self):
        token = create_access_token(user_id=2, btc_address="bc1qtest2", auth_method="email")
        payload = verify_token(token, expected_type="access")
        assert payload["auth_method"] == "email"

    def test_wrong_type_rejected(self):
        token = create_refresh_token(
            user_id=1, btc_address="bc1qtest", auth_method="wallet", token_id="test-id"
        )
        with pytest.raises(jwt.InvalidTokenError, match="Expected token type"):
            verify_token(token, expected_type="access")


class TestRefreshToken:
    def test_create_includes_jti(self):
        token = create_refresh_token(
            user_id=1, btc_address="bc1qtest", auth_method="wallet", token_id="abc-123"
        )
        payload = verify_token(token, expected_type="refresh")
        assert payload["jti"] == "abc-123"
        assert payload["type"] == "refresh"
        assert payload["auth_method"] == "wallet"

    def test_email_refresh_token(self):
        token = create_refresh_token(
            user_id=2, btc_address="bc1qtest2", auth_method="email", token_id="def-456"
        )
        payload = verify_token(token, expected_type="refresh")
        assert payload["auth_method"] == "email"
        assert payload["jti"] == "def-456"
