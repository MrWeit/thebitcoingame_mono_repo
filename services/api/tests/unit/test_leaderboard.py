"""Unit tests for Redis leaderboard operations."""

from __future__ import annotations

import pytest
import pytest_asyncio


pytestmark = pytest.mark.asyncio


class TestLeaderboardRanking:
    """Test Redis sorted set operations for leaderboard."""

    async def test_zadd_and_zrevrange(self, redis_client):
        """ZADD users and ZREVRANGE returns highest first."""
        await redis_client.zadd("test:lb", {"user:1": 1000, "user:2": 5000, "user:3": 3000})
        top = await redis_client.zrevrange("test:lb", 0, -1, withscores=True)
        assert top[0] == ("user:2", 5000.0)
        assert top[1] == ("user:3", 3000.0)
        assert top[2] == ("user:1", 1000.0)

    async def test_zrevrank_returns_position(self, redis_client):
        """ZREVRANK returns 0-indexed position (0 = top)."""
        await redis_client.zadd("test:lb", {"user:1": 1000, "user:2": 5000, "user:3": 3000})
        rank = await redis_client.zrevrank("test:lb", "user:2")
        assert rank == 0  # Top position
        rank = await redis_client.zrevrank("test:lb", "user:3")
        assert rank == 1
        rank = await redis_client.zrevrank("test:lb", "user:1")
        assert rank == 2

    async def test_user_not_on_leaderboard(self, redis_client):
        """ZREVRANK returns None for missing user."""
        await redis_client.zadd("test:lb", {"user:1": 1000})
        rank = await redis_client.zrevrank("test:lb", "user:999")
        assert rank is None

    async def test_zscore_returns_score(self, redis_client):
        """ZSCORE returns the user's score."""
        await redis_client.zadd("test:lb", {"user:1": 42.5})
        score = await redis_client.zscore("test:lb", "user:1")
        assert score == 42.5

    async def test_zscore_missing_user(self, redis_client):
        """ZSCORE returns None for missing user."""
        await redis_client.zadd("test:lb", {"user:1": 1000})
        score = await redis_client.zscore("test:lb", "user:999")
        assert score is None

    async def test_zcard_total_count(self, redis_client):
        """ZCARD returns total number of members."""
        await redis_client.zadd("test:lb", {"user:1": 1000, "user:2": 2000, "user:3": 3000})
        total = await redis_client.zcard("test:lb")
        assert total == 3

    async def test_zrevrange_pagination(self, redis_client):
        """ZREVRANGE supports pagination with start/end."""
        for i in range(10):
            await redis_client.zadd("test:lb", {f"user:{i}": float(i * 1000)})

        # First page (top 3)
        page1 = await redis_client.zrevrange("test:lb", 0, 2, withscores=True)
        assert len(page1) == 3
        assert page1[0][1] == 9000.0  # user:9

        # Second page
        page2 = await redis_client.zrevrange("test:lb", 3, 5, withscores=True)
        assert len(page2) == 3
        assert page2[0][1] == 6000.0  # user:6

    async def test_zadd_updates_existing_score(self, redis_client):
        """ZADD with existing member updates the score."""
        await redis_client.zadd("test:lb", {"user:1": 1000})
        await redis_client.zadd("test:lb", {"user:1": 5000})
        score = await redis_client.zscore("test:lb", "user:1")
        assert score == 5000.0
        total = await redis_client.zcard("test:lb")
        assert total == 1  # Not duplicated

    async def test_pipeline_atomic_rebuild(self, redis_client):
        """Pipeline delete+zadd is atomic rebuild."""
        await redis_client.zadd("test:lb", {"old_user": 100})

        pipe = redis_client.pipeline()
        pipe.delete("test:lb")
        pipe.zadd("test:lb", {"new_user:1": 500, "new_user:2": 300})
        pipe.expire("test:lb", 3600)
        await pipe.execute()

        total = await redis_client.zcard("test:lb")
        assert total == 2
        rank = await redis_client.zrevrank("test:lb", "old_user")
        assert rank is None  # Old data removed


class TestBuildLeaderboardKey:
    """Test Redis key construction."""

    def test_weekly_key(self):
        from tbg.competition.leaderboard_service import build_leaderboard_key
        key = build_leaderboard_key("weekly", "2026-W09")
        assert key == "leaderboard:weekly:2026-W09"

    def test_alltime_key(self):
        from tbg.competition.leaderboard_service import build_leaderboard_key
        key = build_leaderboard_key("alltime")
        assert key == "leaderboard:alltime"

    def test_country_key(self):
        from tbg.competition.leaderboard_service import build_leaderboard_key
        key = build_leaderboard_key("country", "2026-W09")
        assert key == "leaderboard:country:2026-W09"

    def test_invalid_period(self):
        from tbg.competition.leaderboard_service import build_leaderboard_key
        with pytest.raises(ValueError, match="Unknown period"):
            build_leaderboard_key("invalid")
