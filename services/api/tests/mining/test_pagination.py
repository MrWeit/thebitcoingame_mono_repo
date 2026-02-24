"""Tests for cursor-based share pagination."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.mining.pagination import decode_cursor, encode_cursor, paginate_shares


class TestCursorEncoding:
    """Test cursor encode/decode round-trip."""

    def test_encode_decode_roundtrip(self) -> None:
        """Cursor round-trips through encode/decode."""
        now = datetime(2026, 2, 23, 12, 0, 0, tzinfo=timezone.utc)
        addr = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
        cursor = encode_cursor(now, addr)
        decoded = decode_cursor(cursor)
        assert decoded["time"] == now.isoformat()
        assert decoded["addr"] == addr

    def test_decode_invalid_cursor(self) -> None:
        """Invalid cursor raises ValueError."""
        with pytest.raises(ValueError, match="Invalid cursor"):
            decode_cursor("not-a-valid-cursor!!!")

    def test_decode_missing_time(self) -> None:
        """Cursor without 'time' field raises ValueError."""
        import base64
        import json
        bad = base64.urlsafe_b64encode(json.dumps({"foo": "bar"}).encode()).decode()
        with pytest.raises(ValueError, match="Missing 'time'"):
            decode_cursor(bad)


@pytest_asyncio.fixture
async def seeded_shares(db_session: AsyncSession) -> list[datetime]:
    """Insert 100 test shares and return their timestamps."""
    addr = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
    # Clean up any pre-existing shares for this address
    await db_session.execute(text("DELETE FROM shares WHERE btc_address = :addr"), {"addr": addr})
    await db_session.commit()

    base_time = datetime(2026, 2, 23, 12, 0, 0, tzinfo=timezone.utc)
    times = []

    for i in range(100):
        t = base_time - timedelta(seconds=i)
        times.append(t)
        await db_session.execute(
            text("""
                INSERT INTO shares (time, btc_address, worker_name, difficulty, share_diff, is_valid, is_block, source)
                VALUES (:time, :addr, :worker, :diff, :sdiff, :valid, false, 'hosted')
                ON CONFLICT DO NOTHING
            """),
            {
                "time": t,
                "addr": addr,
                "worker": "bitaxe-1" if i % 2 == 0 else "bitaxe-2",
                "diff": 65536.0,
                "sdiff": float(1000 + i * 10),
                "valid": i % 10 != 0,  # 10% invalid
            },
        )
    await db_session.commit()
    return times


async def test_first_page_no_cursor(db_session: AsyncSession, seeded_shares: list[datetime]) -> None:
    """First request without cursor returns newest shares."""
    addr = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
    shares, cursor = await paginate_shares(db_session, addr, limit=10)
    assert len(shares) == 10
    assert cursor is not None
    # Verify DESC order
    for i in range(len(shares) - 1):
        assert shares[i].time >= shares[i + 1].time


async def test_second_page_with_cursor(db_session: AsyncSession, seeded_shares: list[datetime]) -> None:
    """Using next_cursor returns the next page of results."""
    addr = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
    page1, cursor1 = await paginate_shares(db_session, addr, limit=10)
    assert cursor1 is not None

    page2, cursor2 = await paginate_shares(db_session, addr, limit=10, cursor=cursor1)
    assert len(page2) == 10

    # No overlap between pages
    page1_times = {s.time for s in page1}
    page2_times = {s.time for s in page2}
    assert page1_times.isdisjoint(page2_times)

    # Page 2 is older than page 1
    assert max(page2_times) < min(page1_times)


async def test_cursor_consistency(db_session: AsyncSession, seeded_shares: list[datetime]) -> None:
    """Paginate through all shares — no skips or duplicates."""
    addr = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
    all_shares = []
    cursor = None

    for _ in range(20):  # Safety limit
        page, cursor = await paginate_shares(db_session, addr, limit=10, cursor=cursor)
        all_shares.extend(page)
        if cursor is None:
            break

    # Should have all 100 shares
    assert len(all_shares) == 100
    # No duplicates
    times = [(s.time, s.btc_address) for s in all_shares]
    assert len(set(times)) == 100


async def test_empty_result_no_cursor(db_session: AsyncSession) -> None:
    """Empty result returns no cursor."""
    shares, cursor = await paginate_shares(db_session, "bc1qnonexistent", limit=10)
    assert len(shares) == 0
    assert cursor is None


async def test_valid_only_filter(db_session: AsyncSession, seeded_shares: list[datetime]) -> None:
    """valid_only=True filters out invalid shares."""
    addr = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
    shares, _ = await paginate_shares(db_session, addr, limit=100, valid_only=True)
    assert all(s.is_valid for s in shares)
    # We made 10% invalid, so should have ~90
    assert len(shares) == 90


async def test_worker_name_filter(db_session: AsyncSession, seeded_shares: list[datetime]) -> None:
    """Filter by worker name returns only that worker's shares."""
    addr = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
    shares, _ = await paginate_shares(db_session, addr, limit=100, worker_name="bitaxe-1")
    assert all(s.worker_name == "bitaxe-1" for s in shares)
    assert len(shares) == 50  # Even-indexed shares


async def test_limit_cap(db_session: AsyncSession, seeded_shares: list[datetime]) -> None:
    """Limit is capped at 100."""
    addr = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
    shares, _ = await paginate_shares(db_session, addr, limit=200)
    assert len(shares) == 100  # Capped at 100
