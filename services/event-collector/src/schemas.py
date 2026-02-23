"""Event schema definitions for TheBitcoinGame mining events.

All events share a common envelope:
{
    "event": "<event_type>",
    "ts": 1708617600.123456,
    "source": "hosted",
    "data": { ... type-specific fields ... }
}

The "source" field is always present and set to "hosted" for events
from our ckpool instance. Future decentralized mining will use
"proxy" or "self-hosted".
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class EventType(str, Enum):
    """All supported mining event types."""

    SHARE_SUBMITTED = "share_submitted"
    BLOCK_FOUND = "block_found"
    MINER_CONNECTED = "miner_connected"
    MINER_DISCONNECTED = "miner_disconnected"
    DIFF_UPDATED = "diff_updated"
    HASHRATE_UPDATE = "hashrate_update"
    NEW_BLOCK_NETWORK = "new_block_network"
    SHARE_BEST_DIFF = "share_best_diff"
    ASICBOOST_DETECTED = "asicboost_detected"


class BaseEvent(BaseModel):
    """Common envelope for all events."""

    event: str
    ts: float
    source: str = "hosted"
    region: str = ""  # Phase 4: region tag from multi-instance
    data: dict[str, Any] = Field(default_factory=dict)


class ShareSubmittedData(BaseModel):
    """Data payload for share_submitted events."""

    user: str = "unknown"
    worker: str = "unknown"
    client_id: int = 0
    diff: float = 0.0
    sdiff: float = 0.0
    accepted: bool = True
    reject_reason: str = ""
    ip: str = ""


class BlockFoundData(BaseModel):
    """Data payload for block_found events."""

    user: str = "unknown"
    worker: str = "unknown"
    height: int = 0
    hash: str = ""
    diff: float = 0.0
    network_diff: float = 0.0
    reward_sats: int = 0
    coinbase_sig: str = ""


class MinerConnectedData(BaseModel):
    """Data payload for miner_connected events."""

    user: str = "unknown"
    worker: str = "unknown"
    client_id: int = 0
    ip: str = ""
    useragent: str = ""
    initial_diff: float = 1.0
    asicboost_capable: bool = False


class MinerDisconnectedData(BaseModel):
    """Data payload for miner_disconnected events."""

    user: str = "unknown"
    worker: str = "unknown"
    client_id: int = 0
    ip: str = ""
    session_duration: float = 0.0
    shares_session: int = 0


class DiffUpdatedData(BaseModel):
    """Data payload for diff_updated events."""

    user: str = "unknown"
    worker: str = "unknown"
    client_id: int = 0
    old_diff: float = 0.0
    new_diff: float = 0.0
    ema_share_rate: float = 0.0
    stable_intervals: int = 0
    adjustment_count: int = 0


class HashrateUpdateData(BaseModel):
    """Data payload for hashrate_update events."""

    user: str = "unknown"
    worker: str = "unknown"
    hashrate_1m: float = 0.0
    hashrate_5m: float = 0.0
    hashrate_1h: float = 0.0
    hashrate_1d: float = 0.0


class NewBlockNetworkData(BaseModel):
    """Data payload for new_block_network events."""

    height: int = 0
    hash: str = ""
    diff: float = 0.0
    prev_hash: str = ""


class ShareBestDiffData(BaseModel):
    """Data payload for share_best_diff events."""

    user: str = "unknown"
    worker: str = "unknown"
    new_best: float = 0.0
    prev_best: float = 0.0
    timeframe: str = "session"


class AsicBoostDetectedData(BaseModel):
    """Data payload for asicboost_detected events."""

    user: str = "unknown"
    worker: str = "unknown"
    pool_mask: str = ""
    miner_mask: str = ""


# Map event type strings to their data model classes
EVENT_DATA_MODELS: dict[str, type[BaseModel]] = {
    EventType.SHARE_SUBMITTED: ShareSubmittedData,
    EventType.BLOCK_FOUND: BlockFoundData,
    EventType.MINER_CONNECTED: MinerConnectedData,
    EventType.MINER_DISCONNECTED: MinerDisconnectedData,
    EventType.DIFF_UPDATED: DiffUpdatedData,
    EventType.HASHRATE_UPDATE: HashrateUpdateData,
    EventType.NEW_BLOCK_NETWORK: NewBlockNetworkData,
    EventType.SHARE_BEST_DIFF: ShareBestDiffData,
    EventType.ASICBOOST_DETECTED: AsicBoostDetectedData,
}


def parse_event(raw: dict[str, Any]) -> BaseEvent:
    """Parse a raw JSON dict into a validated BaseEvent.

    The data payload is validated against the appropriate schema
    if the event type is recognized.
    """
    event = BaseEvent.model_validate(raw)

    # Validate and normalize the data payload if we know the event type
    data_model = EVENT_DATA_MODELS.get(event.event)
    if data_model and event.data:
        validated = data_model.model_validate(event.data)
        event.data = validated.model_dump()

    return event
