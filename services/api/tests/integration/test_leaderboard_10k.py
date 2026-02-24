"""Integration test: 10K user leaderboard performance."""

from __future__ import annotations

import time

import pytest
import pytest_asyncio


pytestmark = pytest.mark.asyncio


class TestLeaderboard10K:
    """Test leaderboard performance with 10K+ users."""

    async def test_10k_user_leaderboard(self, redis_client):
        """Insert 10K users and verify ranking operations are fast."""
        key = "test:lb:10k"

        # Seed 10K users via pipeline
        pipe = redis_client.pipeline()
        for i in range(10_000):
            pipe.zadd(key, {f"user:{i}": float(i * 1000)})
        await pipe.execute()

        # Verify total count
        total = await redis_client.zcard(key)
        assert total == 10_000

        # Top 50 should be very fast
        start = time.monotonic()
        top = await redis_client.zrevrange(key, 0, 49, withscores=True)
        elapsed = time.monotonic() - start

        assert len(top) == 50
        assert elapsed < 0.05  # Under 50ms (generous for CI)
        assert top[0] == ("user:9999", 9_999_000.0)
        assert top[49] == ("user:9950", 9_950_000.0)

    async def test_10k_user_rank_lookup(self, redis_client):
        """User rank lookup should be fast on 10K dataset."""
        key = "test:lb:10k:rank"

        pipe = redis_client.pipeline()
        for i in range(10_000):
            pipe.zadd(key, {f"user:{i}": float(i * 1000)})
        await pipe.execute()

        # Rank lookup for user in the middle
        start = time.monotonic()
        rank = await redis_client.zrevrank(key, "user:5000")
        elapsed = time.monotonic() - start

        assert rank is not None
        assert rank == 4999  # 0-indexed: user:9999 is 0, user:5000 is 4999
        assert elapsed < 0.01  # Under 10ms

    async def test_10k_score_lookup(self, redis_client):
        """Score lookup should be fast on 10K dataset."""
        key = "test:lb:10k:score"

        pipe = redis_client.pipeline()
        for i in range(10_000):
            pipe.zadd(key, {f"user:{i}": float(i * 1000)})
        await pipe.execute()

        start = time.monotonic()
        score = await redis_client.zscore(key, "user:7777")
        elapsed = time.monotonic() - start

        assert score == 7_777_000.0
        assert elapsed < 0.01

    async def test_10k_pagination(self, redis_client):
        """Pagination through 10K users should be consistent."""
        key = "test:lb:10k:page"

        pipe = redis_client.pipeline()
        for i in range(10_000):
            pipe.zadd(key, {f"user:{i}": float(i * 1000)})
        await pipe.execute()

        # Page 1 (0-49)
        page1 = await redis_client.zrevrange(key, 0, 49, withscores=True)
        # Page 2 (50-99)
        page2 = await redis_client.zrevrange(key, 50, 99, withscores=True)

        assert len(page1) == 50
        assert len(page2) == 50
        # No overlap
        page1_users = {u for u, _ in page1}
        page2_users = {u for u, _ in page2}
        assert page1_users.isdisjoint(page2_users)
        # Page 1 scores > Page 2 scores
        assert min(s for _, s in page1) > max(s for _, s in page2)

    async def test_10k_atomic_rebuild(self, redis_client):
        """Atomic rebuild with pipeline on 10K users."""
        key = "test:lb:10k:rebuild"

        # Initial population
        pipe = redis_client.pipeline()
        for i in range(10_000):
            pipe.zadd(key, {f"user:{i}": float(i)})
        await pipe.execute()

        # Atomic rebuild
        start = time.monotonic()
        pipe = redis_client.pipeline()
        pipe.delete(key)
        for i in range(10_000):
            pipe.zadd(key, {f"user:{i}": float(i * 2)})  # Double scores
        pipe.expire(key, 86400)
        await pipe.execute()
        elapsed = time.monotonic() - start

        assert elapsed < 1.0  # Under 1 second for rebuild

        # Verify new scores
        score = await redis_client.zscore(key, "user:5000")
        assert score == 10_000.0  # 5000 * 2
