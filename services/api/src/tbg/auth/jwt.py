"""
RS256 JWT token management.

Tokens include an `auth_method` claim to distinguish between wallet-authenticated
and email-authenticated sessions.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal

import jwt

from tbg.config import get_settings

_private_key: str | None = None
_public_key: str | None = None


def _load_keys() -> tuple[str, str]:
    """Load RSA keys from disk (cached after first call)."""
    global _private_key, _public_key  # noqa: PLW0603
    if _private_key is None or _public_key is None:
        settings = get_settings()
        _private_key = Path(settings.jwt_private_key_path).read_text()
        _public_key = Path(settings.jwt_public_key_path).read_text()
    return _private_key, _public_key


def reset_keys() -> None:
    """Reset cached keys (useful for testing)."""
    global _private_key, _public_key  # noqa: PLW0603
    _private_key = None
    _public_key = None


def create_access_token(
    user_id: int,
    btc_address: str,
    auth_method: Literal["wallet", "email"] = "wallet",
) -> str:
    """
    Create a short-lived access token (1 hour).

    Args:
        user_id: The user's database ID.
        btc_address: The user's BTC wallet address.
        auth_method: How the user authenticated ("wallet" or "email").

    Returns:
        Encoded JWT string.
    """
    private_key, _ = _load_keys()
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "address": btc_address,
        "auth_method": auth_method,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_access_token_expire_minutes),
        "iss": settings.jwt_issuer,
        "type": "access",
    }
    return jwt.encode(payload, private_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(
    user_id: int,
    btc_address: str,
    auth_method: Literal["wallet", "email"] = "wallet",
    *,
    token_id: str,
) -> str:
    """
    Create a long-lived refresh token (7 days).

    Args:
        user_id: The user's database ID.
        btc_address: The user's BTC wallet address.
        auth_method: How the user authenticated ("wallet" or "email").
        token_id: Unique token identifier (JTI) for revocation tracking.

    Returns:
        Encoded JWT string.
    """
    private_key, _ = _load_keys()
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "address": btc_address,
        "auth_method": auth_method,
        "jti": token_id,
        "iat": now,
        "exp": now + timedelta(days=settings.jwt_refresh_token_expire_days),
        "iss": settings.jwt_issuer,
        "type": "refresh",
    }
    return jwt.encode(payload, private_key, algorithm=settings.jwt_algorithm)


def verify_token(token: str, expected_type: str = "access") -> dict[str, Any]:
    """
    Verify and decode a JWT token.

    Args:
        token: The encoded JWT string.
        expected_type: Expected token type ("access" or "refresh").

    Returns:
        Decoded payload dictionary.

    Raises:
        jwt.InvalidTokenError: If the token is invalid, expired, or wrong type.
    """
    _, public_key = _load_keys()
    settings = get_settings()
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            public_key,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
        )
    except jwt.ExpiredSignatureError:
        msg = "Token has expired"
        raise jwt.InvalidTokenError(msg) from None
    except jwt.InvalidTokenError:
        raise

    if payload.get("type") != expected_type:
        msg = f"Expected token type '{expected_type}', got '{payload.get('type')}'"
        raise jwt.InvalidTokenError(msg)

    return payload
