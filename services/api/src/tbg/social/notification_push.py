"""Push formatted notification over Redis pub/sub for per-user WebSocket delivery."""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from tbg.db.models import Notification

logger = logging.getLogger(__name__)


async def push_notification_to_user(redis: object | None, notification: "Notification") -> None:
    """Publish a formatted notification dict to ws:user:{user_id}.

    The notification must already be flushed (have an ``id``).
    The bridge pattern-subscribes to ``ws:user:*`` and routes the
    message to all of the user's active WebSocket connections.
    """
    if redis is None:
        return

    ws_payload = {
        "event": "notification",
        "data": {
            "id": str(notification.id),
            "type": notification.type,
            "subtype": notification.subtype,
            "title": notification.title,
            "description": notification.description,
            "timestamp": (
                notification.created_at.isoformat()
                if notification.created_at
                else None
            ),
            "read": False,
            "actionUrl": notification.action_url,
            "actionLabel": notification.action_label,
        },
    }
    try:
        await redis.publish(  # type: ignore[union-attr]
            f"ws:user:{notification.user_id}",
            json.dumps(ws_payload),
        )
    except Exception:
        logger.warning(
            "Failed to push notification via ws:user:%s",
            notification.user_id,
            exc_info=True,
        )
