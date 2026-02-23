"""Tests for the event collector."""

import json
import os
import socket
import tempfile

import pytest

from src.config import Config


class TestConfig:
    def test_default_config(self):
        config = Config()
        assert config.socket_path.endswith("events.sock")
        assert config.batch_max_size == 500
        assert config.redis_stream_maxlen == 100000

    def test_config_from_env(self, monkeypatch):
        monkeypatch.setenv("SOCKET_PATH", "/custom/path.sock")
        monkeypatch.setenv("REDIS_URL", "redis://custom:6380/1")
        monkeypatch.setenv("BATCH_MAX_SIZE", "100")

        config = Config()
        assert config.socket_path == "/custom/path.sock"
        assert config.redis_url == "redis://custom:6380/1"
        assert config.batch_max_size == 100


class TestUnixSocketCommunication:
    """Test that we can send/receive JSON over Unix datagram sockets."""

    def test_dgram_socket_roundtrip(self):
        """Verify JSON datagrams work end-to-end."""
        with tempfile.TemporaryDirectory() as tmpdir:
            sock_path = os.path.join(tmpdir, "test.sock")

            # Create receiver (like our collector)
            receiver = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
            receiver.bind(sock_path)
            os.chmod(sock_path, 0o666)

            # Create sender (like ckpool)
            sender = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)

            # Send a test event
            event = {
                "event": "share_submitted",
                "ts": 1708617600.123456,
                "source": "hosted",
                "data": {
                    "user": "tb1qtest",
                    "worker": "rig01",
                    "diff": 1.0,
                    "sdiff": 2.5,
                    "accepted": True,
                },
            }
            msg = json.dumps(event).encode("utf-8")
            sender.sendto(msg, sock_path)

            # Receive and verify
            data = receiver.recv(65536)
            received = json.loads(data.decode("utf-8"))

            assert received["event"] == "share_submitted"
            assert received["source"] == "hosted"
            assert received["data"]["user"] == "tb1qtest"
            assert received["data"]["accepted"] is True

            sender.close()
            receiver.close()

    def test_nonblocking_send_when_no_receiver(self):
        """Verify sends fail gracefully when no receiver is listening."""
        with tempfile.TemporaryDirectory() as tmpdir:
            sock_path = os.path.join(tmpdir, "test.sock")

            sender = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
            sender.setblocking(False)

            # Sending to non-existent socket should raise, not hang
            msg = b'{"event":"test"}'
            with pytest.raises(OSError):
                sender.sendto(msg, sock_path)

            sender.close()
