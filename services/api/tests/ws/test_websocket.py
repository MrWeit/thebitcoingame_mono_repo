"""WebSocket integration tests — auth and connection lifecycle."""

from __future__ import annotations

import os
import tempfile

import pytest
from fastapi.testclient import TestClient
from starlette.testclient import TestClient as StarletteTestClient

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
    """Create a valid JWT access token for WebSocket testing."""
    _ensure_test_keys()
    from tbg.auth.jwt import create_access_token
    return create_access_token(user_id=1, btc_address="bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")


@pytest.fixture
def expired_ws_token() -> str:
    """Create an expired JWT access token."""
    _ensure_test_keys()
    import jwt as pyjwt
    from tbg.auth.jwt import _load_keys
    from datetime import datetime, timedelta, timezone

    private_key, _ = _load_keys()
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": "1",
        "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        "auth_method": "wallet",
        "iat": now - timedelta(hours=2),
        "exp": now - timedelta(hours=1),  # already expired
        "iss": settings.jwt_issuer,
        "type": "access",
    }
    return pyjwt.encode(payload, private_key, algorithm=settings.jwt_algorithm)


@pytest.fixture
def test_client() -> StarletteTestClient:
    """Create a sync TestClient for WebSocket testing."""
    from tbg.main import create_app
    app = create_app()
    return TestClient(app)


class TestWebSocketAuth:
    def test_connect_with_valid_token(self, test_client: StarletteTestClient, ws_token: str) -> None:
        """Connect with valid JWT, send ping, receive pong."""
        with test_client.websocket_connect(f"/ws?token={ws_token}") as ws:
            ws.send_json({"action": "ping"})
            data = ws.receive_json()
            assert data["type"] == "pong"

    def test_connect_with_invalid_token(self, test_client: StarletteTestClient) -> None:
        """Invalid JWT closes with code 4001."""
        _ensure_test_keys()
        with pytest.raises(Exception):
            with test_client.websocket_connect("/ws?token=invalid.jwt.token") as ws:
                ws.receive_json()

    def test_connect_with_expired_token(self, test_client: StarletteTestClient, expired_ws_token: str) -> None:
        """Expired JWT closes with code 4001."""
        with pytest.raises(Exception):
            with test_client.websocket_connect(f"/ws?token={expired_ws_token}") as ws:
                ws.receive_json()


class TestWebSocketPingPong:
    def test_ping_pong(self, test_client: StarletteTestClient, ws_token: str) -> None:
        """Send ping, receive pong."""
        with test_client.websocket_connect(f"/ws?token={ws_token}") as ws:
            ws.send_json({"action": "ping"})
            data = ws.receive_json()
            assert data == {"type": "pong"}

    def test_invalid_json(self, test_client: StarletteTestClient, ws_token: str) -> None:
        """Invalid JSON returns error without crashing."""
        with test_client.websocket_connect(f"/ws?token={ws_token}") as ws:
            ws.send_text("not valid json {{{")
            data = ws.receive_json()
            assert data["type"] == "error"
            assert "Invalid JSON" in data["message"]

    def test_unknown_action(self, test_client: StarletteTestClient, ws_token: str) -> None:
        """Unknown action returns error."""
        with test_client.websocket_connect(f"/ws?token={ws_token}") as ws:
            ws.send_json({"action": "explode"})
            data = ws.receive_json()
            assert data["type"] == "error"
            assert "Unknown action" in data["message"]
