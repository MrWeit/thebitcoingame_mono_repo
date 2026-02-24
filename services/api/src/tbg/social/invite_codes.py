"""Invite code generation for cooperatives.

Codes are 8-character alphanumeric (A-Z, 0-9), generated server-side
with a cryptographic random source. Users cannot choose their own codes.
"""

from __future__ import annotations

import secrets
import string

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import Cooperative

INVITE_CHARSET = string.ascii_uppercase + string.digits  # A-Z, 0-9
INVITE_LENGTH = 8


def generate_invite_code() -> str:
    """Generate a cryptographically random 8-character invite code."""
    return "".join(secrets.choice(INVITE_CHARSET) for _ in range(INVITE_LENGTH))


def normalize_invite_code(code: str) -> str:
    """Normalize an invite code to uppercase for case-insensitive lookup."""
    return code.upper()


async def generate_unique_invite_code(db: AsyncSession) -> str:
    """Generate an invite code that doesn't already exist in the database."""
    for _ in range(10):
        code = generate_invite_code()
        existing = await db.execute(
            select(Cooperative).where(Cooperative.invite_code == code)
        )
        if not existing.scalar_one_or_none():
            return code
    raise RuntimeError("Failed to generate unique invite code after 10 attempts")
