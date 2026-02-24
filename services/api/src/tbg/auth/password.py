"""
Password hashing and validation using argon2id.

Argon2id is the winner of the Password Hashing Competition and is resistant
to both GPU-based and side-channel attacks.
"""

from __future__ import annotations

import argon2

_hasher = argon2.PasswordHasher(
    time_cost=2,
    memory_cost=65536,  # 64 MB
    parallelism=1,
    hash_len=32,
    salt_len=16,
    type=argon2.Type.ID,  # argon2id
)


class PasswordStrengthError(ValueError):
    """Raised when a password does not meet strength requirements."""


def hash_password(password: str) -> str:
    """Hash a password using argon2id. Returns the full hash string."""
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """
    Verify a password against its argon2id hash.

    Returns True if the password matches. Never raises on mismatch.
    """
    try:
        return _hasher.verify(password_hash, password)
    except argon2.exceptions.VerifyMismatchError:
        return False
    except argon2.exceptions.InvalidHashError:
        return False


def check_needs_rehash(password_hash: str) -> bool:
    """Check if the hash needs to be updated (parameters changed)."""
    return _hasher.check_needs_rehash(password_hash)


def validate_password_strength(password: str) -> None:
    """
    Validate password meets minimum strength requirements.

    Raises PasswordStrengthError if the password is too weak.

    Requirements:
    - Minimum 8 characters
    - Maximum 128 characters (prevent DoS via huge passwords)
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    - Must not be empty or whitespace-only
    """
    if not password or not password.strip():
        msg = "Password cannot be empty"
        raise PasswordStrengthError(msg)
    if len(password) < 8:
        msg = "Password must be at least 8 characters"
        raise PasswordStrengthError(msg)
    if len(password) > 128:
        msg = "Password must not exceed 128 characters"
        raise PasswordStrengthError(msg)
    if not any(c.isupper() for c in password):
        msg = "Password must contain at least one uppercase letter"
        raise PasswordStrengthError(msg)
    if not any(c.islower() for c in password):
        msg = "Password must contain at least one lowercase letter"
        raise PasswordStrengthError(msg)
    if not any(c.isdigit() for c in password):
        msg = "Password must contain at least one digit"
        raise PasswordStrengthError(msg)
