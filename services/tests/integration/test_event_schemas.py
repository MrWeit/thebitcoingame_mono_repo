"""Integration tests for event schema validation.

Verifies that the event collector schemas handle all event types
including the new AsicBoost and enhanced VarDiff events.
"""

import sys
import os
import pytest

# Add event-collector to path so we can import schemas
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "event-collector"))

from src.schemas import (
    EventType,
    BaseEvent,
    ShareSubmittedData,
    BlockFoundData,
    MinerConnectedData,
    MinerDisconnectedData,
    DiffUpdatedData,
    HashrateUpdateData,
    NewBlockNetworkData,
    ShareBestDiffData,
    AsicBoostDetectedData,
    EVENT_DATA_MODELS,
    parse_event,
)


class TestEventTypes:
    """Test that all expected event types are defined."""

    def test_share_submitted(self):
        assert EventType.SHARE_SUBMITTED == "share_submitted"

    def test_block_found(self):
        assert EventType.BLOCK_FOUND == "block_found"

    def test_miner_connected(self):
        assert EventType.MINER_CONNECTED == "miner_connected"

    def test_miner_disconnected(self):
        assert EventType.MINER_DISCONNECTED == "miner_disconnected"

    def test_diff_updated(self):
        assert EventType.DIFF_UPDATED == "diff_updated"

    def test_hashrate_update(self):
        assert EventType.HASHRATE_UPDATE == "hashrate_update"

    def test_new_block_network(self):
        assert EventType.NEW_BLOCK_NETWORK == "new_block_network"

    def test_share_best_diff(self):
        assert EventType.SHARE_BEST_DIFF == "share_best_diff"

    def test_asicboost_detected(self):
        assert EventType.ASICBOOST_DETECTED == "asicboost_detected"

    def test_all_types_in_model_map(self):
        for event_type in EventType:
            assert event_type in EVENT_DATA_MODELS, (
                f"{event_type} not in EVENT_DATA_MODELS"
            )


class TestAsicBoostSchema:
    """Test the new AsicBoost event schema."""

    def test_fields_exist(self):
        data = AsicBoostDetectedData()
        assert data.user == "unknown"
        assert data.worker == "unknown"
        assert data.pool_mask == ""
        assert data.miner_mask == ""

    def test_parse_asicboost_event(self):
        raw = {
            "event": "asicboost_detected",
            "ts": 1708617600.123,
            "source": "hosted",
            "data": {
                "user": "miner1",
                "worker": "rig1",
                "pool_mask": "1fffe000",
                "miner_mask": "00000001",
            },
        }
        event = parse_event(raw)
        assert event.event == "asicboost_detected"
        assert event.data["user"] == "miner1"
        assert event.data["pool_mask"] == "1fffe000"


class TestMinerConnectedAsicBoost:
    """Test that MinerConnectedData includes asicboost_capable field."""

    def test_asicboost_capable_default_false(self):
        data = MinerConnectedData()
        assert data.asicboost_capable is False

    def test_asicboost_capable_set_true(self):
        data = MinerConnectedData(asicboost_capable=True)
        assert data.asicboost_capable is True

    def test_parse_connect_with_asicboost(self):
        raw = {
            "event": "miner_connected",
            "ts": 1708617600.0,
            "source": "hosted",
            "data": {
                "user": "miner1",
                "worker": "rig1",
                "asicboost_capable": True,
            },
        }
        event = parse_event(raw)
        assert event.data["asicboost_capable"] is True


class TestDiffUpdatedEMA:
    """Test enhanced DiffUpdated fields for EMA VarDiff."""

    def test_ema_fields_exist(self):
        data = DiffUpdatedData()
        assert data.ema_share_rate == 0.0
        assert data.stable_intervals == 0
        assert data.adjustment_count == 0

    def test_parse_diff_updated_with_ema(self):
        raw = {
            "event": "diff_updated",
            "ts": 1708617600.0,
            "source": "hosted",
            "data": {
                "user": "miner1",
                "worker": "rig1",
                "old_diff": 1.0,
                "new_diff": 2.0,
                "ema_share_rate": 0.15,
                "stable_intervals": 5,
                "adjustment_count": 3,
            },
        }
        event = parse_event(raw)
        assert event.data["ema_share_rate"] == 0.15
        assert event.data["stable_intervals"] == 5
        assert event.data["adjustment_count"] == 3


class TestBaseEventEnvelope:
    """Test the base event envelope."""

    def test_source_defaults_to_hosted(self):
        event = BaseEvent(event="test", ts=1.0)
        assert event.source == "hosted"

    def test_unknown_event_type_parses(self):
        raw = {
            "event": "unknown_future_event",
            "ts": 1.0,
            "data": {"foo": "bar"},
        }
        event = parse_event(raw)
        assert event.event == "unknown_future_event"
        assert event.data == {"foo": "bar"}
