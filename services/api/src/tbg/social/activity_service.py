"""User activity recording for personal feed."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import UserActivity


async def record_activity(
    db: AsyncSession,
    user_id: int,
    activity_type: str,
    title: str,
    description: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> UserActivity:
    """Record a user activity for the feed."""
    activity = UserActivity(
        user_id=user_id,
        activity_type=activity_type,
        title=title,
        description=description,
        activity_metadata=metadata or {},
        created_at=datetime.now(timezone.utc),
    )
    db.add(activity)
    await db.flush()
    return activity


async def get_activity_feed(
    db: AsyncSession,
    user_id: int,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[UserActivity], int]:
    """Get the user's personal activity feed (paginated)."""
    offset = (page - 1) * per_page

    total_result = await db.execute(
        select(func.count()).select_from(UserActivity).where(UserActivity.user_id == user_id)
    )
    total = total_result.scalar_one()

    result = await db.execute(
        select(UserActivity)
        .where(UserActivity.user_id == user_id)
        .order_by(UserActivity.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    activities = list(result.scalars().all())
    return activities, total
