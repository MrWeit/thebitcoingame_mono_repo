"""Cursor-based pagination for shares.

Uses keyset pagination (not OFFSET) for O(1) performance on billion-row hypertables.
Cursor encodes (time, btc_address) as base64 JSON for stable positioning.
"""

from __future__ import annotations

import base64
import json
from datetime import datetime

from sqlalchemy import Select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import Share


def encode_cursor(time: datetime, btc_address: str) -> str:
    """Encode a cursor from share fields."""
    payload = {"time": time.isoformat(), "addr": btc_address}
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()


def decode_cursor(cursor: str) -> dict[str, str]:
    """Decode a cursor into share fields.

    Returns:
        Dict with 'time' (ISO string) and 'addr' (btc_address).

    Raises:
        ValueError: If cursor is malformed.
    """
    try:
        raw = base64.urlsafe_b64decode(cursor.encode())
        data = json.loads(raw)
        if "time" not in data:
            msg = "Missing 'time' in cursor"
            raise ValueError(msg)
        return data
    except Exception as e:
        msg = f"Invalid cursor: {e}"
        raise ValueError(msg) from e


def apply_cursor(query: Select, cursor: str | None) -> Select:  # type: ignore[type-arg]
    """Apply keyset cursor to a share query.

    Assumes the query is already ordered by (time DESC, btc_address DESC).
    """
    if cursor is None:
        return query

    decoded = decode_cursor(cursor)
    cursor_time = datetime.fromisoformat(decoded["time"])
    cursor_addr = decoded.get("addr", "")

    # Keyset condition: row < cursor position (DESC order)
    return query.where(
        or_(
            Share.time < cursor_time,
            and_(Share.time == cursor_time, Share.btc_address < cursor_addr),
        )
    )


async def paginate_shares(
    db: AsyncSession,
    btc_address: str,
    limit: int = 50,
    cursor: str | None = None,
    worker_name: str | None = None,
    valid_only: bool | None = None,
) -> tuple[list[Share], str | None]:
    """Fetch a page of shares using cursor-based pagination.

    Args:
        db: Database session.
        btc_address: User's Bitcoin address to filter by.
        limit: Max items per page (capped at 100).
        cursor: Opaque cursor string from previous response.
        worker_name: Optional filter by worker name.
        valid_only: Optional filter by share validity.

    Returns:
        Tuple of (shares list, next_cursor or None).
    """
    from sqlalchemy import select

    limit = min(limit, 100)

    query = (
        select(Share)
        .where(Share.btc_address == btc_address)
        .order_by(Share.time.desc(), Share.btc_address.desc())
    )

    if worker_name is not None:
        query = query.where(Share.worker_name == worker_name)

    if valid_only is True:
        query = query.where(Share.is_valid.is_(True))
    elif valid_only is False:
        query = query.where(Share.is_valid.is_(False))

    query = apply_cursor(query, cursor)

    # Fetch one extra to detect has_more
    query = query.limit(limit + 1)

    result = await db.execute(query)
    rows = list(result.scalars().all())

    has_more = len(rows) > limit
    items = rows[:limit]

    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = encode_cursor(last.time, last.btc_address)

    return items, next_cursor
