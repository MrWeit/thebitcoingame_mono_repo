"""Integration tests: notification endpoints."""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.database import get_session
from tbg.social.notification_service import create_notification


async def _create_test_notification(user_id: int, type_: str = "system", subtype: str = "welcome") -> None:
    """Create a test notification directly in DB."""
    async for db in get_session():
        await create_notification(
            db, user_id, type_, subtype,
            title=f"Test {subtype}",
            description=f"Test notification for {subtype}",
        )
        await db.commit()
        break


class TestNotificationsAPI:
    """Integration: notification CRUD endpoints."""

    @pytest.mark.asyncio
    async def test_list_notifications_empty(self, authed_client: AsyncClient):
        """Empty notification list."""
        response = await authed_client.get("/api/v1/notifications")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["notifications"] == []

    @pytest.mark.asyncio
    async def test_unread_count_zero(self, authed_client: AsyncClient):
        """Unread count starts at zero."""
        response = await authed_client.get("/api/v1/notifications/unread-count")
        assert response.status_code == 200
        assert response.json()["unread_count"] == 0

    @pytest.mark.asyncio
    async def test_notifications_created_and_listed(self, authed_client: AsyncClient):
        """Create notifications and list them."""
        # Get user ID from the token
        from tbg.auth.jwt import verify_token
        token = authed_client.headers["Authorization"].split(" ")[1]
        payload = verify_token(token, expected_type="access")
        user_id = int(payload["sub"])

        # Create notifications
        async for db in get_session():
            await create_notification(db, user_id, "system", "welcome", title="Welcome!")
            await create_notification(db, user_id, "mining", "personal_best", title="New PB!")
            await db.commit()
            break

        response = await authed_client.get("/api/v1/notifications")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert len(data["notifications"]) == 2
        # Most recent first
        assert data["notifications"][0]["title"] == "New PB!"

    @pytest.mark.asyncio
    async def test_mark_as_read(self, authed_client: AsyncClient):
        """Mark a single notification as read."""
        from tbg.auth.jwt import verify_token
        token = authed_client.headers["Authorization"].split(" ")[1]
        payload = verify_token(token, expected_type="access")
        user_id = int(payload["sub"])

        async for db in get_session():
            notif = await create_notification(db, user_id, "system", "welcome", title="Test")
            await db.commit()
            break

        # Mark as read
        response = await authed_client.post(f"/api/v1/notifications/{notif.id}/read")
        assert response.status_code == 200

        # Verify unread count
        count_resp = await authed_client.get("/api/v1/notifications/unread-count")
        assert count_resp.json()["unread_count"] == 0

    @pytest.mark.asyncio
    async def test_mark_all_as_read(self, authed_client: AsyncClient):
        """Mark all notifications as read."""
        from tbg.auth.jwt import verify_token
        token = authed_client.headers["Authorization"].split(" ")[1]
        payload = verify_token(token, expected_type="access")
        user_id = int(payload["sub"])

        async for db in get_session():
            await create_notification(db, user_id, "system", "welcome", title="Test 1")
            await create_notification(db, user_id, "system", "maintenance", title="Test 2")
            await db.commit()
            break

        # Mark all read
        response = await authed_client.post("/api/v1/notifications/read-all")
        assert response.status_code == 200

        # Verify
        count_resp = await authed_client.get("/api/v1/notifications/unread-count")
        assert count_resp.json()["unread_count"] == 0

    @pytest.mark.asyncio
    async def test_notification_not_found(self, authed_client: AsyncClient):
        """Mark nonexistent notification returns 404."""
        response = await authed_client.post("/api/v1/notifications/99999/read")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_notification_response_shape(self, authed_client: AsyncClient):
        """Notification response matches frontend NotificationItem shape."""
        from tbg.auth.jwt import verify_token
        token = authed_client.headers["Authorization"].split(" ")[1]
        payload = verify_token(token, expected_type="access")
        user_id = int(payload["sub"])

        async for db in get_session():
            await create_notification(
                db, user_id, "gamification", "badge_earned",
                title='Badge Earned: "First Share"',
                description="You submitted your first mining share!",
                action_url="/badges",
                action_label="View Badge",
            )
            await db.commit()
            break

        response = await authed_client.get("/api/v1/notifications")
        notif = response.json()["notifications"][0]

        assert "id" in notif
        assert notif["type"] == "gamification"
        assert notif["subtype"] == "badge_earned"
        assert notif["title"] == 'Badge Earned: "First Share"'
        assert notif["description"] == "You submitted your first mining share!"
        assert notif["read"] is False
        assert notif["action_url"] == "/badges"
        assert notif["action_label"] == "View Badge"
        assert "timestamp" in notif
