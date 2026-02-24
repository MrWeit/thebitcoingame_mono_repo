"""Integration tests for the full lottery lifecycle.

Covers: shares → draw → rank → XP → idempotency.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import LotteryDraw, LotteryResult, User, WeeklyBestDiff, XPLedger
from tbg.games.lottery_service import execute_weekly_draw, get_lottery_results
from tbg.games.week_utils import get_monday, get_week_iso


def _unique_addr(prefix: str = "bc1q") -> str:
    """Generate a unique BTC address for test isolation."""
    return f"{prefix}_{uuid.uuid4().hex[:30]}"


@pytest_asyncio.fixture(autouse=True)
async def _clean_lottery_tables(db_session: AsyncSession):
    """Clean lottery and related tables before each test for isolation."""
    await db_session.execute(text("DELETE FROM lottery_results"))
    await db_session.execute(text("DELETE FROM lottery_draws"))
    await db_session.execute(text("DELETE FROM weekly_best_diff"))
    await db_session.execute(text("DELETE FROM xp_ledger WHERE source = 'competition'"))
    await db_session.commit()
    yield


@pytest.fixture
def week_iso():
    """Test week ISO string."""
    return "2026-W09"


@pytest.fixture
def week_start():
    """Test week Monday."""
    return date(2026, 2, 23)


@pytest.fixture
def week_end():
    """Test week Sunday."""
    return date(2026, 3, 1)


async def _create_test_user(db: AsyncSession, btc_address: str, display_name: str | None = None) -> User:
    """Create a test user."""
    user = User(
        btc_address=btc_address,
        display_name=display_name,
        auth_method="wallet",
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    return user


async def _create_weekly_best_diff(
    db: AsyncSession,
    user_id: int,
    week_start: date,
    best_diff: float,
    total_shares: int = 100,
    best_time: datetime | None = None,
) -> WeeklyBestDiff:
    """Create a weekly best diff record."""
    btc_result = await db.execute(
        select(User.btc_address).where(User.id == user_id)
    )
    btc_address = btc_result.scalar_one()

    record = WeeklyBestDiff(
        user_id=user_id,
        btc_address=btc_address,
        week_start=week_start,
        best_difficulty=best_diff,
        best_share_time=best_time or datetime(2026, 2, 25, 12, 0, 0, tzinfo=timezone.utc),
        total_shares=total_shares,
    )
    db.add(record)
    await db.flush()
    return record


@pytest.mark.asyncio
class TestFullLotteryCycle:
    """Integration: week of mining → draw → results → XP."""

    async def test_complete_lottery_cycle(self, db_session: AsyncSession, redis_client):
        """Full lifecycle: shares → draw → rank → XP."""
        db = db_session

        # 1. Create 3 users with different best diffs
        user1 = await _create_test_user(db, _unique_addr())
        user2 = await _create_test_user(db, _unique_addr())
        user3 = await _create_test_user(db, _unique_addr())
        await db.commit()

        # 2. Simulate weekly best diffs
        week_start = date(2026, 2, 23)
        await _create_weekly_best_diff(db, user1.id, week_start, 10_000_000_000)  # 10B
        await _create_weekly_best_diff(db, user2.id, week_start, 5_000_000_000)   # 5B
        await _create_weekly_best_diff(db, user3.id, week_start, 1_000_000_000)   # 1B
        await db.commit()

        # 3. Execute the draw
        draw = await execute_weekly_draw(db, redis_client, "2026-W09")
        assert draw.status == "completed"
        assert draw.total_participants == 3
        assert draw.winner_user_id == user1.id
        assert draw.winning_difficulty == 10_000_000_000

        # 4. Verify ranks
        results = await get_lottery_results(db, draw.id)
        assert len(results) == 3
        assert results[0].rank == 1
        assert results[0].user_id == user1.id  # 10B — highest
        assert results[1].rank == 2
        assert results[1].user_id == user2.id  # 5B
        assert results[2].rank == 3
        assert results[2].user_id == user3.id  # 1B

        # 5. Verify XP was granted
        xp_result = await db.execute(
            select(XPLedger).where(
                XPLedger.user_id == user1.id,
                XPLedger.source == "competition",
            )
        )
        lottery_xp = xp_result.scalars().all()
        assert len(lottery_xp) == 1
        assert lottery_xp[0].amount == 100  # Top 10 tier

    async def test_lottery_idempotent(self, db_session: AsyncSession, redis_client):
        """Drawing the same week twice should not create duplicates."""
        db = db_session

        user = await _create_test_user(db, _unique_addr())
        await db.commit()

        week_start = date(2026, 2, 16)
        await _create_weekly_best_diff(db, user.id, week_start, 1_000_000)
        await db.commit()

        draw1 = await execute_weekly_draw(db, redis_client, "2026-W08")
        draw2 = await execute_weekly_draw(db, redis_client, "2026-W08")
        assert draw1.id == draw2.id  # Same draw returned

        # Check no duplicate XP
        xp_result = await db.execute(
            select(XPLedger).where(
                XPLedger.user_id == user.id,
                XPLedger.source == "competition",
            )
        )
        assert len(xp_result.scalars().all()) == 1

    async def test_empty_week(self, db_session: AsyncSession, redis_client):
        """Drawing a week with no participants should create an empty draw."""
        db = db_session

        draw = await execute_weekly_draw(db, redis_client, "2026-W07")
        assert draw.status == "completed"
        assert draw.total_participants == 0
        assert draw.winner_user_id is None

    async def test_tie_breaking_by_timestamp(self, db_session: AsyncSession, redis_client):
        """Two users with same diff — earlier timestamp wins."""
        db = db_session

        user1 = await _create_test_user(db, _unique_addr())
        user2 = await _create_test_user(db, _unique_addr())
        await db.commit()

        week_start = date(2026, 1, 12)
        await _create_weekly_best_diff(
            db, user1.id, week_start, 5_000_000,
            best_time=datetime(2026, 1, 15, 14, 0, 0, tzinfo=timezone.utc),  # Later
        )
        await _create_weekly_best_diff(
            db, user2.id, week_start, 5_000_000,
            best_time=datetime(2026, 1, 13, 8, 0, 0, tzinfo=timezone.utc),  # Earlier — wins
        )
        await db.commit()

        draw = await execute_weekly_draw(db, redis_client, "2026-W03")
        results = await get_lottery_results(db, draw.id)
        assert results[0].user_id == user2.id  # Earlier timestamp wins

    async def test_xp_tiers_correct(self, db_session: AsyncSession, redis_client):
        """Verify XP tiers for various ranks."""
        db = db_session

        # Create 15 users
        users = []
        for i in range(15):
            user = await _create_test_user(db, _unique_addr())
            users.append(user)
        await db.commit()

        week_start = date(2025, 12, 29)  # 2026-W01
        for i, user in enumerate(users):
            await _create_weekly_best_diff(db, user.id, week_start, (15 - i) * 1_000_000)
        await db.commit()

        draw = await execute_weekly_draw(db, redis_client, "2026-W01")
        results = await get_lottery_results(db, draw.id)

        # Top 10 users → 100 XP
        for r in results[:10]:
            assert r.xp_awarded == 100

        # Users 11-15 → 50 XP (top 50 tier)
        for r in results[10:15]:
            assert r.xp_awarded == 50
