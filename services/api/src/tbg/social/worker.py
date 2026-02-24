"""Cooperative stats worker — updates combined stats every 5 minutes.

Runs as an arq periodic task alongside the gamification worker.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import Cooperative, CooperativeMember, Worker

logger = logging.getLogger(__name__)


async def get_user_worker_stats(db: AsyncSession, user_id: int) -> dict:
    """Get a user's current worker stats from the workers table."""
    result = await db.execute(
        select(Worker).where(Worker.user_id == user_id)
    )
    workers = result.scalars().all()

    if not workers:
        return {
            "hashrate_1h": 0.0,
            "shares_today": 0,
            "is_online": False,
            "shares_week": 0,
        }

    total_hashrate = sum(w.hashrate_1h or 0.0 for w in workers)
    any_online = any(w.is_online for w in workers)

    return {
        "hashrate_1h": total_hashrate,
        "shares_today": 0,  # Would come from daily stats
        "is_online": any_online,
        "shares_week": 0,  # Would come from weekly stats
    }


async def update_cooperative_stats(db: AsyncSession) -> int:
    """Update combined stats for all active cooperatives.

    Returns the number of cooperatives updated.
    """
    result = await db.execute(
        select(Cooperative).where(Cooperative.is_active.is_(True))
    )
    cooperatives = result.scalars().all()
    updated = 0

    for coop in cooperatives:
        members_result = await db.execute(
            select(CooperativeMember).where(
                CooperativeMember.cooperative_id == coop.id
            )
        )
        members = members_result.scalars().all()

        total_hashrate = 0.0
        total_shares_week = 0

        for member in members:
            worker_stats = await get_user_worker_stats(db, member.user_id)
            member.hashrate = worker_stats["hashrate_1h"]
            member.shares_today = worker_stats["shares_today"]
            member.is_online = worker_stats["is_online"]

            total_hashrate += member.hashrate
            total_shares_week += worker_stats.get("shares_week", 0)

        coop.combined_hashrate = total_hashrate
        coop.total_shares_week = total_shares_week
        coop.updated_at = datetime.now(timezone.utc)
        updated += 1

    await db.flush()
    logger.info("Updated stats for %d cooperatives", updated)
    return updated
