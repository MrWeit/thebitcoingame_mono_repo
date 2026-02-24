"""WebSocket endpoint with JWT authentication and channel multiplexing."""

import json
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
import structlog

from tbg.auth.jwt import verify_token
from tbg.ws.manager import manager

logger = structlog.get_logger()

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
) -> None:
    """Single WebSocket endpoint with JWT authentication and channel multiplexing.

    Protocol:
        Client -> Server:
            {"action": "subscribe", "channel": "mining"}
            {"action": "unsubscribe", "channel": "mining"}
            {"action": "ping"}

        Server -> Client:
            {"channel": "mining", "data": {...}}
            {"type": "pong"}
            {"type": "error", "message": "..."}
            {"type": "subscribed", "channel": "mining"}
            {"type": "unsubscribed", "channel": "mining"}
    """
    # Authenticate via JWT token in query param
    try:
        payload = verify_token(token, expected_type="access")
        user_id = int(payload["sub"])
        btc_address = payload["address"]
    except Exception as e:
        await websocket.close(code=4001, reason=f"Authentication failed: {e}")
        return

    conn_id = str(uuid.uuid4())
    await manager.connect(websocket, conn_id, user_id, btc_address)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            action = msg.get("action")

            if action == "subscribe":
                channel = msg.get("channel", "")
                ok = await manager.subscribe(conn_id, channel)
                if ok:
                    await websocket.send_json({"type": "subscribed", "channel": channel})
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Invalid channel: {channel}",
                    })

            elif action == "unsubscribe":
                channel = msg.get("channel", "")
                await manager.unsubscribe(conn_id, channel)
                await websocket.send_json({"type": "unsubscribed", "channel": channel})

            elif action == "ping":
                await websocket.send_json({"type": "pong"})

            else:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unknown action: {action}",
                })

    except WebSocketDisconnect:
        await manager.disconnect(conn_id)
    except Exception:
        logger.exception("ws_error", conn_id=conn_id)
        await manager.disconnect(conn_id)
