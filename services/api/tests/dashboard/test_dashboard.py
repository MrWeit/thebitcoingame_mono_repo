"""Dashboard endpoint integration tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text

from tbg.db.models import ActivityFeed, UpcomingEvent


@pytest.mark.asyncio
async def test_dashboard_stats(authed_client: AsyncClient) -> None:
    """GET /dashboard/stats returns all expected fields."""
    response = await authed_client.get("/api/v1/dashboard/stats")
    assert response.status_code == 200
    data = response.json()
    # Verify shape matches frontend expectations
    assert "hashrate" in data
    assert "shares_today" in data
    assert "workers_online" in data
    assert "workers_total" in data
    assert "streak" in data
    assert "best_diff_week" in data
    assert "network_diff" in data
    assert "best_diff_ratio" in data
    assert "level" in data
    assert "level_title" in data
    assert "xp" in data
    assert "xp_to_next" in data
    assert "badges_earned" in data
    assert "network_height" in data


@pytest.mark.asyncio
async def test_dashboard_stats_cached(authed_client: AsyncClient) -> None:
    """Second call should hit Redis cache and return identical data."""
    r1 = await authed_client.get("/api/v1/dashboard/stats")
    r2 = await authed_client.get("/api/v1/dashboard/stats")
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json() == r2.json()


@pytest.mark.asyncio
async def test_dashboard_stats_unauthorized(client: AsyncClient) -> None:
    """Returns 401/403 without auth."""
    response = await client.get("/api/v1/dashboard/stats")
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_global_feed_empty(authed_client: AsyncClient) -> None:
    """GET /dashboard/feed returns empty list when no feed items exist."""
    response = await authed_client.get("/api/v1/dashboard/feed")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_global_feed_with_items(authed_client: AsyncClient, db_session) -> None:
    """GET /dashboard/feed returns feed items."""
    # Seed some feed items
    now = datetime.now(timezone.utc)
    for i in range(3):
        db_session.add(ActivityFeed(
            event_type="block",
            title=f"Block #{i} found!",
            description=f"Description {i}",
            is_global=True,
            created_at=now - timedelta(minutes=i),
        ))
    await db_session.commit()

    response = await authed_client.get("/api/v1/dashboard/feed")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3
    assert data[0]["type"] == "block"
    assert "text" in data[0]
    assert "time" in data[0]


@pytest.mark.asyncio
async def test_global_feed_pagination(authed_client: AsyncClient, db_session) -> None:
    """Using before_id returns older events."""
    now = datetime.now(timezone.utc)
    for i in range(5):
        db_session.add(ActivityFeed(
            event_type="badge",
            title=f"Badge {i}",
            is_global=True,
            created_at=now - timedelta(minutes=i),
        ))
    await db_session.commit()

    # Get first page
    r1 = await authed_client.get("/api/v1/dashboard/feed?limit=2")
    items1 = r1.json()
    assert len(items1) == 2

    # Get second page using before_id
    last_id = items1[-1]["id"]
    r2 = await authed_client.get(f"/api/v1/dashboard/feed?limit=2&before_id={last_id}")
    items2 = r2.json()
    assert len(items2) == 2
    # All IDs in page 2 should be less than the last ID of page 1
    for item in items2:
        assert item["id"] < last_id


@pytest.mark.asyncio
async def test_upcoming_events_empty(authed_client: AsyncClient) -> None:
    """GET /dashboard/events returns empty list when no events exist."""
    response = await authed_client.get("/api/v1/dashboard/events")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_upcoming_events_with_items(authed_client: AsyncClient, db_session) -> None:
    """GET /dashboard/events returns active events sorted by ends_at."""
    now = datetime.now(timezone.utc)
    # Active future event
    db_session.add(UpcomingEvent(
        id="event-1",
        event_type="lottery",
        title="Weekly Lottery",
        description="Draw this week",
        ends_at=now + timedelta(days=3),
        is_active=True,
    ))
    # Past event (should not appear)
    db_session.add(UpcomingEvent(
        id="event-2",
        event_type="streak",
        title="Old Streak",
        ends_at=now - timedelta(days=1),
        is_active=True,
    ))
    # Inactive event (should not appear)
    db_session.add(UpcomingEvent(
        id="event-3",
        event_type="maintenance",
        title="Inactive Event",
        ends_at=now + timedelta(days=5),
        is_active=False,
    ))
    await db_session.commit()

    response = await authed_client.get("/api/v1/dashboard/events")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == "event-1"
    assert data[0]["type"] == "lottery"


@pytest.mark.asyncio
async def test_upcoming_events_user_specific(authed_client: AsyncClient, db_session) -> None:
    """User-specific events appear alongside global events."""
    from tbg.database import get_session as _get_session
    from tbg.auth.service import get_or_create_user

    # Get the test user's ID
    async for session in _get_session():
        user, _ = await get_or_create_user(session, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")
        await session.commit()
        user_id = user.id
        break

    now = datetime.now(timezone.utc)
    # Global event
    db_session.add(UpcomingEvent(
        id="global-1",
        event_type="lottery",
        title="Global Lottery",
        ends_at=now + timedelta(days=3),
        is_active=True,
        target_user_id=None,
    ))
    # User-specific event
    db_session.add(UpcomingEvent(
        id="user-specific-1",
        event_type="streak",
        title="Your Streak Deadline",
        ends_at=now + timedelta(days=1),
        is_active=True,
        target_user_id=user_id,
    ))
    # Another user's event (should NOT appear)
    db_session.add(UpcomingEvent(
        id="other-user-1",
        event_type="streak",
        title="Not Yours",
        ends_at=now + timedelta(days=2),
        is_active=True,
        target_user_id=99999,
    ))
    await db_session.commit()

    response = await authed_client.get("/api/v1/dashboard/events")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    event_ids = {e["id"] for e in data}
    assert "global-1" in event_ids
    assert "user-specific-1" in event_ids
    assert "other-user-1" not in event_ids


@pytest.mark.asyncio
async def test_recent_badges_graceful_fallback(authed_client: AsyncClient) -> None:
    """Returns empty list if gamification tables do not exist yet."""
    response = await authed_client.get("/api/v1/dashboard/recent-badges")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_ws_stats_unauthenticated(client: AsyncClient) -> None:
    """WS stats endpoint works without auth (monitoring)."""
    response = await client.get("/api/v1/dashboard/ws-stats")
    assert response.status_code == 200
    data = response.json()
    assert "total_connections" in data
    assert "unique_users" in data
    assert "channels" in data
