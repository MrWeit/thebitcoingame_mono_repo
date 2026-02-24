"""WebSocket subscription protocol tests."""

from __future__ import annotations

import os
import tempfile

import pytest
from starlette.testclient import TestClient

from tbg.config import get_settings


def _ensure_test_keys() -> None:
    """Ensure RSA keys exist for JWT."""
    settings = get_settings()
    private_path = settings.jwt_private_key_path
    public_path = settings.jwt_public_key_path

    if os.path.exists(private_path) and os.path.exists(public_path):
        return

    tmpdir = tempfile.mkdtemp(prefix="tbg_test_keys_")
    private_path = os.path.join(tmpdir, "jwt_private.pem")
    public_path = os.path.join(tmpdir, "jwt_public.pem")

    os.system(f"openssl genrsa -out {private_path} 2048 2>/dev/null")  # noqa: S605
    os.system(f"openssl rsa -in {private_path} -pubout -out {public_path} 2>/dev/null")  # noqa: S605

    os.environ["TBG_JWT_PRIVATE_KEY_PATH"] = private_path
    os.environ["TBG_JWT_PUBLIC_KEY_PATH"] = public_path
    os.environ["TBG_BTC_NETWORK"] = "mainnet"
    get_settings.cache_clear()

    from tbg.auth.jwt import reset_keys
    reset_keys()


@pytest.fixture
def ws_token() -> str:
    _ensure_test_keys()
    from tbg.auth.jwt import create_access_token
    return create_access_token(user_id=1, btc_address="bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")


@pytest.fixture
def test_client() -> TestClient:
    from tbg.main import create_app
    app = create_app()
    return TestClient(app)


class TestSubscriptions:
    def test_subscribe_valid_channel(self, test_client: TestClient, ws_token: str) -> None:
        """Subscribe to mining channel, receive subscribed ack."""
        with test_client.websocket_connect(f"/ws?token={ws_token}") as ws:
            ws.send_json({"action": "subscribe", "channel": "mining"})
            data = ws.receive_json()
            assert data["type"] == "subscribed"
            assert data["channel"] == "mining"

    def test_subscribe_invalid_channel(self, test_client: TestClient, ws_token: str) -> None:
        """Subscribe to nonexistent channel, receive error."""
        with test_client.websocket_connect(f"/ws?token={ws_token}") as ws:
            ws.send_json({"action": "subscribe", "channel": "nonexistent"})
            data = ws.receive_json()
            assert data["type"] == "error"
            assert "Invalid channel: nonexistent" in data["message"]

    def test_subscribe_multiple_channels(self, test_client: TestClient, ws_token: str) -> None:
        """Subscribe to mining + dashboard, both confirmed."""
        with test_client.websocket_connect(f"/ws?token={ws_token}") as ws:
            ws.send_json({"action": "subscribe", "channel": "mining"})
            d1 = ws.receive_json()
            assert d1 == {"type": "subscribed", "channel": "mining"}

            ws.send_json({"action": "subscribe", "channel": "dashboard"})
            d2 = ws.receive_json()
            assert d2 == {"type": "subscribed", "channel": "dashboard"}

    def test_unsubscribe(self, test_client: TestClient, ws_token: str) -> None:
        """Subscribe then unsubscribe, receive unsubscribed ack."""
        with test_client.websocket_connect(f"/ws?token={ws_token}") as ws:
            ws.send_json({"action": "subscribe", "channel": "mining"})
            ws.receive_json()  # subscribed ack

            ws.send_json({"action": "unsubscribe", "channel": "mining"})
            data = ws.receive_json()
            assert data["type"] == "unsubscribed"
            assert data["channel"] == "mining"

    def test_subscribe_all_four_channels(self, test_client: TestClient, ws_token: str) -> None:
        """All 4 valid channels can be subscribed to."""
        channels = ["mining", "dashboard", "gamification", "competition"]
        with test_client.websocket_connect(f"/ws?token={ws_token}") as ws:
            for ch in channels:
                ws.send_json({"action": "subscribe", "channel": ch})
                data = ws.receive_json()
                assert data == {"type": "subscribed", "channel": ch}

    def test_subscribe_empty_channel(self, test_client: TestClient, ws_token: str) -> None:
        """Empty channel name returns error."""
        with test_client.websocket_connect(f"/ws?token={ws_token}") as ws:
            ws.send_json({"action": "subscribe", "channel": ""})
            data = ws.receive_json()
            assert data["type"] == "error"
