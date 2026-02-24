"""API key generation and verification using argon2id."""

from __future__ import annotations

import secrets

import argon2

KEY_PREFIX = "sk-tbg-"

_hasher = argon2.PasswordHasher(
    time_cost=2,
    memory_cost=65536,
    parallelism=1,
    hash_len=32,
    salt_len=16,
    type=argon2.Type.ID,
)


def generate_api_key() -> tuple[str, str, str]:
    """
    Generate a new API key.

    Returns:
        (full_key, prefix, argon2_hash).
        The full key is shown to the user once, never stored.
    """
    random_part = secrets.token_hex(32)
    full_key = f"{KEY_PREFIX}{random_part}"
    prefix = full_key[:14]  # "sk-tbg-a1b2c3"
    key_hash = _hasher.hash(full_key)
    return full_key, prefix, key_hash


def verify_api_key(full_key: str, stored_hash: str) -> bool:
    """Verify an API key against its stored argon2 hash."""
    try:
        return _hasher.verify(stored_hash, full_key)
    except argon2.exceptions.VerifyMismatchError:
        return False
    except argon2.exceptions.InvalidHashError:
        return False
