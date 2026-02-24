"""Notification API endpoints — 4 routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.auth.dependencies import get_current_user
from tbg.database import get_session
from tbg.db.models import User
from tbg.social.notification_service import (
    get_notifications,
    get_unread_count,
    mark_all_as_read,
    mark_as_read,
)
from tbg.social.schemas import (
    NotificationListResponse,
    NotificationResponse,
    UnreadCountResponse,
)

router = APIRouter(prefix="/api/v1", tags=["Notifications"])


@router.get("/notifications", response_model=NotificationListResponse)
async def list_notifications(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """List user's notifications (paginated)."""
    notifications, total = await get_notifications(db, user.id, page, per_page)
    return NotificationListResponse(
        notifications=[
            NotificationResponse(
                id=str(n.id),
                type=n.type,
                subtype=n.subtype,
                title=n.title,
                description=n.description,
                timestamp=n.created_at,
                read=n.read,
                action_url=n.action_url,
                action_label=n.action_label,
            )
            for n in notifications
        ],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/notifications/{notification_id}/read", status_code=200)
async def mark_notification_read(
    notification_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Mark a notification as read."""
    found = await mark_as_read(db, user.id, notification_id)
    if not found:
        raise HTTPException(status_code=404, detail="Notification not found")
    await db.commit()
    return {"detail": "Notification marked as read"}


@router.post("/notifications/read-all", status_code=200)
async def mark_all_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Mark all notifications as read."""
    count = await mark_all_as_read(db, user.id)
    await db.commit()
    return {"detail": f"Marked {count} notifications as read"}


@router.get("/notifications/unread-count", response_model=UnreadCountResponse)
async def get_unread_notification_count(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    """Get unread notification count."""
    count = await get_unread_count(db, user.id)
    return UnreadCountResponse(unread_count=count)
