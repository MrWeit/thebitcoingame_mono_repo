"""Tests for event schema validation."""

from src.schemas import (
    BaseEvent,
    EventType,
    ShareSubmittedData,
    BlockFoundData,
    MinerConnectedData,
    parse_event,
)


class TestBaseEvent:
    def test_parse_share_submitted(self):
        raw = {
            "event": "share_submitted",
            "ts": 1708617600.123456,
            "source": "hosted",
            "data": {
                "user": "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
                "worker": "bitaxe-01",
                "diff": 1.0,
                "sdiff": 2.5,
                "accepted": True,
            },
        }
        event = parse_event(raw)
        assert event.event == EventType.SHARE_SUBMITTED
        assert event.source == "hosted"
        assert event.data["user"] == "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"
        assert event.data["accepted"] is True

    def test_parse_block_found(self):
        raw = {
            "event": "block_found",
            "ts": 1708617600.789,
            "source": "hosted",
            "data": {
                "user": "tb1qtest",
                "worker": "rig01",
                "height": 850001,
                "hash": "0000000000000000000234abc",
                "diff": 92670429903014.0,
                "network_diff": 86388558925171.0,
                "reward_sats": 312500000,
            },
        }
        event = parse_event(raw)
        assert event.event == EventType.BLOCK_FOUND
        assert event.data["height"] == 850001
        assert event.data["reward_sats"] == 312500000

    def test_parse_miner_connected(self):
        raw = {
            "event": "miner_connected",
            "ts": 1708617500.0,
            "source": "hosted",
            "data": {
                "user": "tb1qtest",
                "worker": "bitaxe",
                "ip": "192.168.1.100",
                "initial_diff": 1.0,
            },
        }
        event = parse_event(raw)
        assert event.event == EventType.MINER_CONNECTED
        assert event.data["ip"] == "192.168.1.100"

    def test_parse_unknown_event_type(self):
        raw = {
            "event": "unknown_future_event",
            "ts": 1708617600.0,
            "source": "hosted",
            "data": {"foo": "bar"},
        }
        event = parse_event(raw)
        assert event.event == "unknown_future_event"
        assert event.data == {"foo": "bar"}

    def test_source_field_always_present(self):
        raw = {
            "event": "share_submitted",
            "ts": 1708617600.0,
            "source": "hosted",
            "data": {"user": "test", "accepted": True},
        }
        event = parse_event(raw)
        assert event.source == "hosted"

    def test_missing_data_defaults(self):
        raw = {
            "event": "share_submitted",
            "ts": 1708617600.0,
            "source": "hosted",
            "data": {},
        }
        event = parse_event(raw)
        assert event.data["user"] == "unknown"
        assert event.data["accepted"] is True

    def test_new_block_network(self):
        raw = {
            "event": "new_block_network",
            "ts": 1708617600.0,
            "source": "hosted",
            "data": {
                "height": 200000,
                "diff": 1.0,
            },
        }
        event = parse_event(raw)
        assert event.event == EventType.NEW_BLOCK_NETWORK
        assert event.data["height"] == 200000


class TestShareSubmittedData:
    def test_defaults(self):
        data = ShareSubmittedData()
        assert data.user == "unknown"
        assert data.accepted is True
        assert data.diff == 0.0

    def test_from_dict(self):
        data = ShareSubmittedData.model_validate({
            "user": "bc1qtest",
            "diff": 42.0,
            "accepted": False,
            "reject_reason": "stale",
        })
        assert data.user == "bc1qtest"
        assert data.diff == 42.0
        assert data.accepted is False


class TestBlockFoundData:
    def test_defaults(self):
        data = BlockFoundData()
        assert data.height == 0
        assert data.reward_sats == 0

    def test_from_dict(self):
        data = BlockFoundData.model_validate({
            "user": "bc1qtest",
            "height": 850001,
            "reward_sats": 312500000,
        })
        assert data.height == 850001
