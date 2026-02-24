"""Unit tests for match scoring formula and league logic."""

from __future__ import annotations

import pytest

from tbg.competition.worldcup_engine import calculate_goals
from tbg.competition.league_service import apply_promotion_relegation


pytestmark = pytest.mark.asyncio


class TestMatchScoring:
    """Test the deterministic scoring formula: goals = floor(hashrate / baseline) + (blocks * 3)."""

    def test_basic_scoring(self):
        """3.5 PH/s at 1 PH/s baseline = 3 goals."""
        baseline = 1e15  # 1 PH/s
        goals = calculate_goals(hashrate=3.5e15, blocks_found=0, baseline=baseline)
        assert goals == 3

    def test_block_bonus(self):
        """1 PH/s + 2 blocks = 1 + 6 = 7 goals."""
        baseline = 1e15
        goals = calculate_goals(hashrate=1e15, blocks_found=2, baseline=baseline)
        assert goals == 7

    def test_zero_hashrate(self):
        """0 hashrate = 0 goals."""
        goals = calculate_goals(hashrate=0, blocks_found=0, baseline=1e15)
        assert goals == 0

    def test_zero_baseline_returns_zero(self):
        """Edge case: 0 baseline returns 0 (avoid division by zero)."""
        goals = calculate_goals(hashrate=5e15, blocks_found=1, baseline=0)
        assert goals == 0

    def test_fractional_hashrate(self):
        """0.5 PH/s at 1 PH/s baseline = 0 goals (floor)."""
        goals = calculate_goals(hashrate=0.5e15, blocks_found=0, baseline=1e15)
        assert goals == 0

    def test_blocks_only(self):
        """No hashrate but 3 blocks = 9 goals."""
        goals = calculate_goals(hashrate=0, blocks_found=3, baseline=1e15)
        assert goals == 9

    def test_large_hashrate(self):
        """100 PH/s at 1 PH/s baseline = 100 goals."""
        goals = calculate_goals(hashrate=100e15, blocks_found=0, baseline=1e15)
        assert goals == 100

    def test_exact_multiple(self):
        """Exact multiple of baseline = exact goals."""
        goals = calculate_goals(hashrate=5e15, blocks_found=0, baseline=1e15)
        assert goals == 5

    def test_single_block(self):
        """Single block adds exactly 3 bonus goals."""
        goals_without = calculate_goals(hashrate=2e15, blocks_found=0, baseline=1e15)
        goals_with = calculate_goals(hashrate=2e15, blocks_found=1, baseline=1e15)
        assert goals_with - goals_without == 3

    def test_deterministic(self):
        """Same inputs always produce same output."""
        for _ in range(10):
            goals = calculate_goals(hashrate=7.3e15, blocks_found=1, baseline=1e15)
            assert goals == 10  # floor(7.3) + 1*3


class TestPromotionRelegation:
    """Test league promotion/relegation marking."""

    def test_basic_promotion_relegation(self):
        standings = [
            {"id": 1, "points": 20},
            {"id": 2, "points": 18},
            {"id": 3, "points": 15},
            {"id": 4, "points": 12},
            {"id": 5, "points": 8},
            {"id": 6, "points": 5},
        ]
        marked = apply_promotion_relegation(standings)
        assert marked[0]["is_promoted"] is True
        assert marked[1]["is_promoted"] is True
        assert marked[2]["is_promoted"] is False
        assert marked[3]["is_relegated"] is False
        assert marked[4]["is_relegated"] is True
        assert marked[5]["is_relegated"] is True

    def test_small_league_no_relegation(self):
        """Leagues with 4 or fewer clubs don't relegate."""
        standings = [
            {"id": 1, "points": 20},
            {"id": 2, "points": 15},
            {"id": 3, "points": 10},
            {"id": 4, "points": 5},
        ]
        marked = apply_promotion_relegation(standings)
        assert marked[0]["is_promoted"] is True
        assert marked[1]["is_promoted"] is True
        assert marked[2]["is_relegated"] is False
        assert marked[3]["is_relegated"] is False

    def test_two_clubs(self):
        """Edge case: only 2 clubs."""
        standings = [{"id": 1, "points": 10}, {"id": 2, "points": 5}]
        marked = apply_promotion_relegation(standings)
        assert marked[0]["is_promoted"] is True
        assert marked[1]["is_promoted"] is True

    def test_twelve_clubs(self):
        """12-club league has promotion and relegation."""
        standings = [{"id": i, "points": (12 - i) * 3} for i in range(12)]
        marked = apply_promotion_relegation(standings)
        assert marked[0]["is_promoted"] is True
        assert marked[1]["is_promoted"] is True
        assert marked[2]["is_promoted"] is False
        assert marked[9]["is_relegated"] is False
        assert marked[10]["is_relegated"] is True
        assert marked[11]["is_relegated"] is True
