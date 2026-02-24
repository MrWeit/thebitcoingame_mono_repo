"""Tests for hashrate computation engine."""

from __future__ import annotations

import pytest

from tbg.mining.hashrate import HASHRATE_MULTIPLIER, compute_hashrate_from_shares


class TestHashrateFromShares:
    """Tests for the pure compute_hashrate_from_shares function."""

    def test_basic_computation(self) -> None:
        """Known inputs: 100 shares at diff 1 over 100 seconds = (100 * 2^32) / 100."""
        result = compute_hashrate_from_shares(sum_diff=100, window_seconds=100)
        expected = 100 * HASHRATE_MULTIPLIER / 100
        assert result == pytest.approx(expected)
        # 100 * 4294967296 / 100 = 4294967296.0 (4.295 GH/s)
        assert result == pytest.approx(4_294_967_296.0)

    def test_zero_shares(self) -> None:
        """No shares = 0 hashrate."""
        assert compute_hashrate_from_shares(sum_diff=0, window_seconds=100) == 0.0

    def test_zero_window(self) -> None:
        """Zero window = 0 hashrate (avoid division by zero)."""
        assert compute_hashrate_from_shares(sum_diff=100, window_seconds=0) == 0.0

    def test_negative_window(self) -> None:
        """Negative window = 0 hashrate."""
        assert compute_hashrate_from_shares(sum_diff=100, window_seconds=-10) == 0.0

    def test_negative_diff(self) -> None:
        """Negative difficulty = 0 hashrate."""
        assert compute_hashrate_from_shares(sum_diff=-100, window_seconds=100) == 0.0

    def test_high_difficulty(self) -> None:
        """High difficulty shares produce high hashrate (> 1 TH/s)."""
        result = compute_hashrate_from_shares(sum_diff=1_000_000, window_seconds=3600)
        assert result > 1e12  # > 1 TH/s

    def test_bitaxe_typical(self) -> None:
        """Bitaxe ~500 GH/s: ~116 diff per second → 116*3600=417600 diff over 1hr."""
        # 500 GH/s = 500e9 H/s
        # hashrate = (sum_diff * 2^32) / time
        # sum_diff = hashrate * time / 2^32 = 500e9 * 3600 / 4294967296 ≈ 418,654
        sum_diff = 500e9 * 3600 / HASHRATE_MULTIPLIER
        result = compute_hashrate_from_shares(sum_diff=sum_diff, window_seconds=3600)
        assert result == pytest.approx(500e9, rel=1e-6)

    def test_multiplier_value(self) -> None:
        """Verify HASHRATE_MULTIPLIER is exactly 2^32."""
        assert HASHRATE_MULTIPLIER == 2**32
        assert HASHRATE_MULTIPLIER == 4_294_967_296

    def test_single_share(self) -> None:
        """Single share at diff 1 over 1 second = 2^32 H/s."""
        result = compute_hashrate_from_shares(sum_diff=1, window_seconds=1)
        assert result == pytest.approx(HASHRATE_MULTIPLIER)

    def test_fractional_difficulty(self) -> None:
        """Fractional difficulty values work correctly."""
        result = compute_hashrate_from_shares(sum_diff=0.5, window_seconds=1)
        assert result == pytest.approx(HASHRATE_MULTIPLIER * 0.5)
