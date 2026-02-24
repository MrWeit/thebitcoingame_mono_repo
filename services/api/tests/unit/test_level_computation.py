"""Level computation tests — MUST match frontend getLevelInfo() exactly."""

import pytest

from tbg.gamification.level_thresholds import LEVEL_THRESHOLDS, compute_level


class TestLevelComputation:
    """Level computation MUST match frontend exactly."""

    def test_level_1_at_zero_xp(self):
        result = compute_level(0)
        assert result["level"] == 1
        assert result["title"] == "Nocoiner"

    def test_level_2_at_100_xp(self):
        result = compute_level(100)
        assert result["level"] == 2
        assert result["title"] == "Curious Cat"

    def test_level_boundary_99_xp(self):
        """99 XP is still level 1."""
        result = compute_level(99)
        assert result["level"] == 1
        assert result["title"] == "Nocoiner"

    def test_level_3_at_600_xp(self):
        result = compute_level(600)
        assert result["level"] == 3
        assert result["title"] == "Hash Pupil"

    def test_level_10_at_29600_xp(self):
        result = compute_level(29600)
        assert result["level"] == 10
        assert result["title"] == "Hashrate Warrior"

    def test_level_50_at_4929600_xp(self):
        result = compute_level(4929600)
        assert result["level"] == 50
        assert result["title"] == "Timechain Guardian"

    def test_xp_into_level_calculation(self):
        result = compute_level(150)  # 50 XP into level 2
        assert result["xp_into_level"] == 50
        assert result["xp_for_level"] == 500  # 600 - 100

    def test_xp_into_level_at_boundary(self):
        result = compute_level(100)  # Exactly at level 2 boundary
        assert result["xp_into_level"] == 0
        assert result["xp_for_level"] == 500

    def test_max_level_exceeded(self):
        """XP beyond max level stays at max level."""
        result = compute_level(10_000_000)
        assert result["level"] == 50
        assert result["title"] == "Timechain Guardian"

    def test_next_level_at_max(self):
        """At max level, next_level should be the same level."""
        result = compute_level(4929600)
        assert result["next_level"] == 50
        assert result["next_title"] == "Timechain Guardian"

    @pytest.mark.parametrize(
        "xp,expected_level",
        [
            (0, 1),
            (100, 2),
            (600, 3),
            (1600, 4),
            (4100, 5),
            (7100, 6),
            (10600, 7),
            (14600, 8),
            (19600, 9),
            (29600, 10),
            (79600, 15),
            (179600, 20),
            (429600, 25),
            (929600, 30),
            (4929600, 50),
        ],
    )
    def test_all_level_boundaries(self, xp, expected_level):
        """Verify every level boundary matches the frontend thresholds."""
        result = compute_level(xp)
        assert result["level"] == expected_level

    @pytest.mark.parametrize(
        "xp,expected_level",
        [
            (99, 1),
            (599, 2),
            (1599, 3),
            (4099, 4),
            (7099, 5),
            (10599, 6),
            (14599, 7),
            (19599, 8),
            (29599, 9),
            (79599, 10),
            (179599, 15),
            (429599, 20),
            (929599, 25),
            (4929599, 30),
        ],
    )
    def test_all_level_just_below_boundaries(self, xp, expected_level):
        """Verify XP just below each boundary stays at previous level."""
        result = compute_level(xp)
        assert result["level"] == expected_level

    @pytest.mark.parametrize(
        "xp,expected_title",
        [
            (0, "Nocoiner"),
            (100, "Curious Cat"),
            (600, "Hash Pupil"),
            (1600, "Solo Miner"),
            (4100, "Difficulty Hunter"),
            (7100, "Share Collector"),
            (10600, "Hash Veteran"),
            (14600, "Block Chaser"),
            (19600, "Nonce Grinder"),
            (29600, "Hashrate Warrior"),
            (79600, "Diff Hunter"),
            (179600, "Mining Veteran"),
            (429600, "Satoshi's Apprentice"),
            (929600, "Cypherpunk"),
            (4929600, "Timechain Guardian"),
        ],
    )
    def test_all_level_titles(self, xp, expected_title):
        """Verify every level title matches the frontend."""
        result = compute_level(xp)
        assert result["title"] == expected_title

    def test_thresholds_count(self):
        """Ensure we have exactly 15 threshold entries like the frontend."""
        assert len(LEVEL_THRESHOLDS) == 15

    def test_thresholds_are_sorted(self):
        """Thresholds must be sorted by cumulative XP."""
        for i in range(len(LEVEL_THRESHOLDS) - 1):
            assert LEVEL_THRESHOLDS[i]["cumulative"] < LEVEL_THRESHOLDS[i + 1]["cumulative"]

    def test_return_shape(self):
        """Verify the return dict has all expected keys."""
        result = compute_level(500)
        assert set(result.keys()) == {
            "level",
            "title",
            "xp_into_level",
            "xp_for_level",
            "next_level",
            "next_title",
        }
