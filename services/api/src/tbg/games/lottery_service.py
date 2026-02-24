"""Deterministic weekly lottery service.

ZERO randomness. Users are ranked by best difficulty for the week.
The miner with the highest best difficulty wins. Ties are broken by
earliest timestamp, then by highest total shares.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import (
    LotteryDraw,
    LotteryResult,
    Notification,
    User,
    WeeklyBestDiff,
)
from tbg.games.ranking import determine_xp_tier, rank_participants
from tbg.games.week_utils import calculate_percentile, iso_week_to_dates

logger = logging.getLogger(__name__)


async def execute_weekly_draw(
    db: AsyncSession,
    redis: object,
    week_iso: str,
) -> LotteryDraw:
    """Execute the weekly lottery draw. Deterministic ranking by best difficulty.

    Called by arq scheduled task every Monday at 00:01 UTC.
    Idempotent: if a draw already exists for this week, returns it.
    """
    # Check idempotency
    existing = await db.execute(
        select(LotteryDraw).where(LotteryDraw.week_iso == week_iso)
    )
    existing_draw = existing.scalar_one_or_none()
    if existing_draw is not None:
        logger.info("Lottery draw for %s already exists (id=%d), skipping", week_iso, existing_draw.id)
        return existing_draw

    week_start, week_end = iso_week_to_dates(week_iso)
    now = datetime.now(timezone.utc)

    # Get all users' best diffs for this week
    participants_query = await db.execute(
        select(
            WeeklyBestDiff.user_id,
            WeeklyBestDiff.best_difficulty,
            WeeklyBestDiff.best_share_time,
            WeeklyBestDiff.total_shares,
        ).where(
            WeeklyBestDiff.week_start == week_start,
        ).order_by(
            WeeklyBestDiff.best_difficulty.desc(),
            WeeklyBestDiff.best_share_time.asc(),
            WeeklyBestDiff.total_shares.desc(),
        )
    )
    rows = participants_query.all()

    if not rows:
        # No participants this week
        draw = LotteryDraw(
            week_iso=week_iso,
            week_start=week_start,
            week_end=week_end,
            total_participants=0,
            total_shares=0,
            status="completed",
            drawn_at=now,
            created_at=now,
        )
        db.add(draw)
        await db.commit()
        return draw

    # Build participant list for ranking
    participant_list = [
        {
            "user_id": row.user_id,
            "best_difficulty": row.best_difficulty,
            "best_diff_time": row.best_share_time or now,
            "total_shares": row.total_shares or 0,
        }
        for row in rows
    ]

    ranked = rank_participants(participant_list)
    total_participants = len(ranked)
    total_shares = sum(r["total_shares"] for r in ranked)

    # Create draw record
    draw = LotteryDraw(
        week_iso=week_iso,
        week_start=week_start,
        week_end=week_end,
        total_participants=total_participants,
        total_shares=total_shares,
        winning_difficulty=ranked[0]["best_difficulty"],
        winner_user_id=ranked[0]["user_id"],
        status="completed",
        drawn_at=now,
        created_at=now,
    )
    db.add(draw)
    await db.flush()  # Get draw.id

    # Create result entries and grant XP
    from tbg.gamification.xp_service import grant_xp

    for entry in ranked:
        rank = entry["rank"]
        xp = entry["xp_awarded"]

        result = LotteryResult(
            draw_id=draw.id,
            user_id=entry["user_id"],
            rank=rank,
            best_difficulty=entry["best_difficulty"],
            total_shares=entry["total_shares"],
            xp_awarded=xp,
            percentile=entry["percentile"],
        )
        db.add(result)

        # Grant XP via Phase 4 gamification engine
        if xp > 0:
            await grant_xp(
                db=db,
                redis=redis,
                user_id=entry["user_id"],
                amount=xp,
                source="competition",
                source_id=f"lottery-{week_iso}",
                description=f"Weekly lottery #{rank} — {week_iso}",
                idempotency_key=f"lottery:{week_iso}:{entry['user_id']}",
            )

    await db.commit()

    # Notify top 10
    await _notify_lottery_results(db, redis, draw, ranked[:10], week_iso)
    await db.commit()

    logger.info(
        "Lottery draw complete: %s, %d participants, winner user_id=%d",
        week_iso, total_participants, ranked[0]["user_id"],
    )

    return draw


async def _notify_lottery_results(
    db: AsyncSession,
    redis: object,
    draw: LotteryDraw,
    top_results: list[dict],
    week_iso: str,
) -> None:
    """Send notifications to top 10 performers."""
    now = datetime.now(timezone.utc)

    for entry in top_results:
        notification = Notification(
            user_id=entry["user_id"],
            type="gamification",
            subtype="lottery_result",
            title=f"Weekly Lottery #{entry['rank']}!",
            description=(
                f"You ranked #{entry['rank']} in the {week_iso} lottery "
                f"with difficulty {entry['best_difficulty']:.2f}. "
                f"+{entry['xp_awarded']} XP!"
            ),
            action_url="/games",
            action_label="View Results",
            created_at=now,
        )
        db.add(notification)

    # Broadcast via WebSocket
    if redis is not None:
        try:
            await redis.publish(  # type: ignore[union-attr]
                "pubsub:lottery_drawn",
                json.dumps({
                    "draw_id": draw.id,
                    "week_iso": week_iso,
                    "total_participants": draw.total_participants,
                    "winner_user_id": draw.winner_user_id,
                }),
            )
        except Exception:
            logger.warning("Failed to publish lottery_drawn notification", exc_info=True)


async def get_lottery_results(
    db: AsyncSession, draw_id: int
) -> list[LotteryResult]:
    """Get all results for a draw."""
    result = await db.execute(
        select(LotteryResult)
        .where(LotteryResult.draw_id == draw_id)
        .order_by(LotteryResult.rank)
    )
    return list(result.scalars().all())


async def get_user_lottery_result(
    db: AsyncSession, draw_id: int, user_id: int
) -> LotteryResult | None:
    """Get a specific user's result in a draw."""
    result = await db.execute(
        select(LotteryResult).where(
            LotteryResult.draw_id == draw_id,
            LotteryResult.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()
