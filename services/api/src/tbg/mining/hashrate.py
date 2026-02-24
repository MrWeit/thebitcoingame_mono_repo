"""Hashrate computation engine.

Formula: hashrate (H/s) = (sum_of_share_difficulties * 2^32) / time_window_seconds
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import Share

HASHRATE_MULTIPLIER: int = 4_294_967_296  # 2^32


def compute_hashrate_from_shares(sum_diff: float, window_seconds: float) -> float:
    """Compute estimated hashrate from total share difficulty over a time window.

    Args:
        sum_diff: Sum of accepted share difficulties in the time window.
        window_seconds: Duration of the time window in seconds.

    Returns:
        Estimated hashrate in H/s. Returns 0.0 for invalid inputs.
    """
    if window_seconds <= 0 or sum_diff <= 0:
        return 0.0
    return (sum_diff * HASHRATE_MULTIPLIER) / window_seconds


async def compute_hashrate(
    db: AsyncSession,
    btc_address: str,
    window_seconds: int,
) -> float:
    """Compute estimated hashrate for a user over a time window from the shares table.

    Args:
        db: Database session.
        btc_address: User's Bitcoin address.
        window_seconds: Duration of the time window in seconds.

    Returns:
        Estimated hashrate in H/s.
    """
    if window_seconds <= 0:
        return 0.0

    cutoff = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)
    result = await db.execute(
        select(func.sum(Share.share_diff))
        .where(Share.btc_address == btc_address)
        .where(Share.time >= cutoff)
        .where(Share.is_valid.is_(True))
    )
    sum_diff = result.scalar() or 0.0
    return compute_hashrate_from_shares(float(sum_diff), float(window_seconds))


async def compute_worker_hashrate(
    db: AsyncSession,
    btc_address: str,
    worker_name: str,
    window_seconds: int,
) -> float:
    """Compute estimated hashrate for a specific worker."""
    if window_seconds <= 0:
        return 0.0

    cutoff = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)
    result = await db.execute(
        select(func.sum(Share.share_diff))
        .where(Share.btc_address == btc_address)
        .where(Share.worker_name == worker_name)
        .where(Share.time >= cutoff)
        .where(Share.is_valid.is_(True))
    )
    sum_diff = result.scalar() or 0.0
    return compute_hashrate_from_shares(float(sum_diff), float(window_seconds))
